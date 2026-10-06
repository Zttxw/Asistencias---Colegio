import { useEffect, useState, useCallback } from 'react';
import { db } from './db';
import { syncOfflineData } from './syncClient';

export function AttendanceApp() {
  if (typeof window !== 'undefined') (window as any).__db = db;
  const [selectedStatus, setSelectedStatus] = useState<'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>('ABSENT');
  const [note, setNote] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncMsg, setLastSyncMsg] = useState<string>('Esperando sincronización');

  const [sectionId, setSectionId] = useState('7d0f1642-be34-44f3-aaf6-7cca3f0ef3ff');
  const [teacherId, setTeacherId] = useState('4fc02a4d-7d32-468c-84e3-23a5fc7689e5');
  const [studentId, setStudentId] = useState('0a714f06-fe73-4cb1-9c21-aa5ed7b6b530');
  const [studentName, setStudentName] = useState('Pari Ancco, Gloria');
  const [studentCode, setStudentCode] = useState('A023');
  const [currentDate, setCurrentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const todayStr = currentDate;

  const refreshCounts = useCallback(async () => {
    const pSessions = await db.classSessions.where('syncState').equals('PENDING').count();
    const pAtt = await db.attendanceRecords.where('syncState').equals('PENDING').count();
    const sSessions = await db.classSessions.where('syncState').equals('SYNCED').count();
    const sAtt = await db.attendanceRecords.where('syncState').equals('SYNCED').count();

    setPendingCount(pSessions + pAtt);
    setSyncedCount(sSessions + sAtt);
  }, []);

  useEffect(() => {
    // Cargar bootstrap desde el servidor o desde IndexedDB si ya fue guardado
    async function initBootstrap() {
      const cached = await db.metadata.get('bootstrap');
      if (cached) {
        try {
          const parsed = JSON.parse(cached.value);
          setSectionId(parsed.sectionId);
          setTeacherId(parsed.teacherId);
          setStudentId(parsed.studentId);
          setStudentName(parsed.studentName);
          setStudentCode(parsed.studentCode);
          if (parsed.serverDate) setCurrentDate(parsed.serverDate);
        } catch {}
      }

      try {
        const res = await fetch('/api/bootstrap');
        if (res.ok) {
          const data = await res.json();
          setSectionId(data.sectionId);
          setTeacherId(data.teacherId);
          setStudentId(data.studentId);
          setStudentName(data.studentName);
          setStudentCode(data.studentCode);
          if (data.serverDate) setCurrentDate(data.serverDate);
          await db.metadata.put({ key: 'bootstrap', value: JSON.stringify(data) });
        }
      } catch {
        // En offline usa los datos en caché
      }
    }

    initBootstrap();
    refreshCounts();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshCounts]);

  const triggerSync = async () => {
    setSyncStatus('syncing');
    try {
      const summary = await syncOfflineData();
      await refreshCounts();
      if (summary.networkError) {
        setSyncStatus('error');
        setLastSyncMsg('Error de conexión con el servidor.');
      } else if (summary.errorsCount > 0) {
        setSyncStatus('error');
        setLastSyncMsg(`Error en ${summary.errorsCount} registros.`);
      } else {
        setSyncStatus('idle');
        setLastSyncMsg(`Sincronizados: ${summary.syncedCount}. Pendientes: ${summary.totalPending}.`);
      }
    } catch (e: unknown) {
      setSyncStatus('error');
      setLastSyncMsg(`Fallo de conexión.`);
    }
  };

  const handleSaveAttendance = async () => {
    setSyncStatus('syncing');
    const nowIso = new Date().toISOString();

    // 1. Obtener o crear la sesión de hoy en Dexie
    let session = await db.classSessions
      .where('[sectionId+date+slot]')
      .equals([sectionId, todayStr, 'JORNADA'])
      .first();

    if (!session) {
      session = {
        id: crypto.randomUUID(),
        sectionId: sectionId,
        teacherId: teacherId,
        date: todayStr,
        slot: 'JORNADA',
        status: 'TAKEN',
        version: 0,
        baseVersion: 0,
        localRev: 1,
        syncState: 'PENDING',
        clientUpdatedAt: nowIso,
      };
      await db.classSessions.put(session);
    }

    // 2. Crear o actualizar la asistencia del alumno
    let record = await db.attendanceRecords
      .where('[sessionId+studentId]')
      .equals([session.id, studentId])
      .first();

    if (!record) {
      record = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        studentId: studentId,
        status: selectedStatus,
        note: note ? note : undefined,
        isVoid: false,
        version: 0,
        baseVersion: 0,
        localRev: 1,
        syncState: 'PENDING',
        clientUpdatedAt: nowIso,
      };
      await db.attendanceRecords.put(record);
    } else {
      // Corrección local de asistencia ya existente
      record.status = selectedStatus;
      record.note = note ? note : undefined;
      record.localRev += 1; // B1: incrementa localRev
      record.syncState = 'PENDING';
      record.clientUpdatedAt = nowIso;
      await db.attendanceRecords.put(record);
    }

    await refreshCounts();

    // Si hay conexión, intentar sync inmediatamente
    if (navigator.onLine) {
      await triggerSync();
    } else {
      setSyncStatus('idle');
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '2rem auto', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '1rem', border: '1px solid #ddd', borderRadius: '12px', background: '#fafafa' }}>
      {/* Indicador Global de Sincronización (6.3) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', padding: '0.8rem', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <div>
          {syncStatus === 'syncing' ? (
            <span data-testid="sync-indicator-syncing" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#2563eb' }}>🔄 Sincronizando...</span>
          ) : syncStatus === 'error' ? (
            <span data-testid="sync-indicator-error" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#dc2626' }}>🔴 Error de sincronización</span>
          ) : pendingCount > 0 ? (
            <span data-testid="sync-indicator-pending" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#d97706' }}>🟡 {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>
          ) : (
            <span data-testid="sync-indicator-synced" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#16a34a' }}>🟢 Sincronizado</span>
          )}
          <div data-testid="sync-message" style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
            {isOnline ? 'Conexión activa' : 'Sin conexión (Modo Offline)'} • {lastSyncMsg}
          </div>
        </div>

        <button
          onClick={triggerSync}
          data-testid="btn-retry"
          disabled={syncStatus === 'syncing'}
          style={{ padding: '0.5rem 0.9rem', fontSize: '0.9rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#f3f4f6' }}
        >
          {syncStatus === 'syncing' ? 'Sincronizando...' : 'Reintentar'}
        </button>
      </div>

      <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.3rem' }}>Registro de Asistencia (Vertical Slice)</h2>
        <div style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1rem' }}>
          Fecha: <strong>{todayStr}</strong> • Sesión: <strong>JORNADA</strong>
        </div>

        <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
          <div data-testid="student-name" style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}>{studentName}</div>
          <div data-testid="student-info" style={{ fontSize: '0.8rem', color: '#64748b' }}>Código: {studentCode} • 1° "A"</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
          {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((st) => (
            <button
              key={st}
              data-testid={`btn-status-${st.toLowerCase()}`}
              onClick={() => setSelectedStatus(st)}
              style={{
                padding: '0.9rem',
                fontSize: '1rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: selectedStatus === st ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: selectedStatus === st ? '#eff6ff' : '#ffffff',
                color: selectedStatus === st ? '#1d4ed8' : '#334155',
                cursor: 'pointer',
              }}
            >
              {st === 'PRESENT' && '○ Presente'}
              {st === 'ABSENT' && '● Falta'}
              {st === 'LATE' && '⏰ Tardanza'}
              {st === 'EXCUSED' && '📝 Justificada'}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', color: '#475569' }}>Nota (opcional):</label>
          <input
            type="text"
            data-testid="input-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Justificación médica"
            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
          />
        </div>

        <button
          onClick={handleSaveAttendance}
          data-testid="btn-save"
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1.1rem',
            fontWeight: 700,
            borderRadius: '8px',
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Guardar Asistencia (Offline-First)
        </button>
      </div>

      <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
        Total en BD local: {syncedCount} sincronizados, {pendingCount} pendientes.
      </div>
    </div>
  );
}
export default AttendanceApp;
