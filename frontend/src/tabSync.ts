/**
 * Sistema de Sincronización Multi-Pestaña en Tiempo Real (Offline-First).
 * Permite que cuando un docente abra la aplicación en múltiples pestañas o ventanas,
 * cualquier cambio guardado en una pestaña (asistencias, alumnos, sincronizaciones)
 * se refleje instantáneamente en las demás pestañas sin recargar la página.
 */

const CHANNEL_NAME = 'asistencia_tab_sync_channel';

export type TabSyncMessage =
  | { type: 'ATTENDANCE_SAVED'; sectionId?: string; date: string; timestamp: number }
  | { type: 'STUDENTS_UPDATED'; sectionId?: string; timestamp: number }
  | { type: 'SYNC_COMPLETED'; timestamp: number }
  | { type: 'DATA_REFRESHED'; timestamp: number };

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    if (!broadcastChannel) {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    }
    return broadcastChannel;
  }
  return null;
}

/**
 * Emite una notificación a todas las demás pestañas abiertas en el navegador.
 */
export function notifyOtherTabs(msg: TabSyncMessage): void {
  try {
    const ch = getBroadcastChannel();
    if (ch) {
      ch.postMessage(msg);
    }
    // Respaldo adicional con localStorage para compatibilidad total
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('asistencia_last_event', JSON.stringify({ ...msg, _t: Date.now() }));
    }
  } catch {
    // Si el navegador bloquea canales, continúa sin fallar
  }
}

/**
 * Suscribe la pestaña actual a los eventos emitidos por otras pestañas.
 * Retorna la función de limpieza (unsubscribe).
 */
export function subscribeToTabUpdates(onUpdate: (msg: TabSyncMessage) => void): () => void {
  const ch = getBroadcastChannel();

  const handleChannelMessage = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && 'type' in event.data) {
      onUpdate(event.data as TabSyncMessage);
    }
  };

  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === 'asistencia_last_event' && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        onUpdate(parsed as TabSyncMessage);
      } catch {
        // Ignorar formato no JSON
      }
    }
  };

  if (ch) {
    ch.addEventListener('message', handleChannelMessage);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    if (ch) {
      ch.removeEventListener('message', handleChannelMessage);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}
