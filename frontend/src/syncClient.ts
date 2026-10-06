import { db, getDeviceId } from './db';

interface PushResult {
  id: string;
  status: 'accepted' | 'duplicate' | 'conflict' | 'rejected';
  serverVersion: number;
  current?: Record<string, unknown>;
  error?: string;
}

interface PushResponse {
  results: PushResult[];
  serverCursor: number;
  serverTime: string;
}

export async function syncOfflineData(apiBaseUrl: string = '/api'): Promise<{
  totalPending: number;
  syncedCount: number;
  errorsCount: number;
  conflictsCount: number;
}> {
  const deviceId = await getDeviceId();

  // Paso 1: Enviar Sesiones pendientes primero (regla B2: evitar que asistencias queden en ERROR si la sesión tiene conflicto)
  const pendingSessions = await db.classSessions.where('syncState').equals('PENDING').toArray();

  if (pendingSessions.length > 0) {
    const sessionItems = pendingSessions.map((s) => ({
      entity: 'class_session',
      id: s.id,
      baseVersion: s.baseVersion,
      clientUpdatedAt: s.clientUpdatedAt,
      data: {
        sectionId: s.sectionId,
        teacherId: s.teacherId,
        date: s.date,
        slot: s.slot,
        status: s.status,
        courseName: s.courseName,
      },
      _localRev: s.localRev, // Snapshot revision
    }));

    try {
      const res = await fetch(`${apiBaseUrl}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          items: sessionItems.map(({ _localRev, ...rest }) => rest),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PushResponse = await res.json();

      // Guardar serverTime para referencia de reloj
      await db.metadata.put({ key: 'lastServerTime', value: data.serverTime });

      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i];
        const snapshot = sessionItems[i];
        const local = await db.classSessions.get(result.id);
        if (!local) continue;

        if (result.status === 'accepted' || result.status === 'duplicate') {
          // B1: Solo marcar SYNCED si no fue editado localmente mientras volaba la petición
          const isStillUnmodifiedLocally = local.localRev === snapshot._localRev;
          await db.classSessions.update(local.id, {
            version: result.serverVersion,
            baseVersion: result.serverVersion,
            syncState: isStillUnmodifiedLocally ? 'SYNCED' : 'PENDING',
            lastError: undefined,
          });
        } else if (result.status === 'conflict') {
          // Sesión duplicada (regla 1 / F2-8): Si el servidor devuelve un ID canónico, adoptar el ID en sesión y reasignar en asistencias
          const canonical = result.current as { id?: string; version?: number } | undefined;
          if (canonical?.id && canonical.id !== local.id) {
            const canonicalId = canonical.id;
            const canonicalVersion = canonical.version ?? 1;

            // Reasignar sessionId en todas las asistencias pendientes asociadas
            const attachedAtts = await db.attendanceRecords.where('sessionId').equals(local.id).toArray();
            for (const att of attachedAtts) {
              await db.attendanceRecords.update(att.id, { sessionId: canonicalId });
            }

            // Reemplazar la sesión local con el ID canónico
            await db.classSessions.delete(local.id);
            await db.classSessions.put({
              ...local,
              id: canonicalId,
              version: canonicalVersion,
              baseVersion: canonicalVersion,
              syncState: 'SYNCED',
              lastError: undefined,
            });
          } else {
            await db.classSessions.update(local.id, {
              syncState: 'CONFLICT',
              lastError: result.error,
            });
          }
        } else {
          await db.classSessions.update(local.id, {
            syncState: 'ERROR',
            lastError: result.error,
          });
        }
      }
    } catch (err: unknown) {
      console.warn('Sync sesiones en vuelo falló:', err);
      // Mantener en PENDING ante corte de red
    }
  }

  // Paso 2: Enviar Asistencias pendientes (B2: sólo aquellas cuya sesión ya esté SYNCED)
  const allPendingAtt = await db.attendanceRecords.where('syncState').equals('PENDING').toArray();
  const eligibleAtt: typeof allPendingAtt = [];

  for (const att of allPendingAtt) {
    const parentSession = await db.classSessions.get(att.sessionId);
    if (parentSession && parentSession.syncState === 'SYNCED') {
      eligibleAtt.push(att);
    }
  }

  if (eligibleAtt.length > 0) {
    const attItems = eligibleAtt.map((a) => ({
      entity: 'attendance_record',
      id: a.id,
      baseVersion: a.baseVersion,
      clientUpdatedAt: a.clientUpdatedAt,
      data: {
        sessionId: a.sessionId,
        studentId: a.studentId,
        status: a.status,
        note: a.note,
        isVoid: a.isVoid,
      },
      _localRev: a.localRev,
    }));

    try {
      const res = await fetch(`${apiBaseUrl}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          items: attItems.map(({ _localRev, ...rest }) => rest),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PushResponse = await res.json();

      for (let i = 0; i < data.results.length; i++) {
        const result = data.results[i];
        const snapshot = attItems[i];
        const local = await db.attendanceRecords.get(result.id);
        if (!local) continue;

        if (result.status === 'accepted' || result.status === 'duplicate') {
          const isStillUnmodifiedLocally = local.localRev === snapshot._localRev;
          await db.attendanceRecords.update(local.id, {
            version: result.serverVersion,
            baseVersion: result.serverVersion,
            syncState: isStillUnmodifiedLocally ? 'SYNCED' : 'PENDING',
            lastError: undefined,
          });
        } else if (result.status === 'conflict') {
          await db.attendanceRecords.update(local.id, {
            syncState: 'CONFLICT',
            lastError: result.error,
          });
        } else {
          await db.attendanceRecords.update(local.id, {
            syncState: 'ERROR',
            lastError: result.error,
          });
        }
      }
    } catch (err: unknown) {
      console.warn('Sync asistencias en vuelo falló:', err);
    }
  }

  // Resumen de estado
  const pendingCount = (await db.classSessions.where('syncState').equals('PENDING').count()) +
                       (await db.attendanceRecords.where('syncState').equals('PENDING').count());
  const syncedCount = (await db.classSessions.where('syncState').equals('SYNCED').count()) +
                      (await db.attendanceRecords.where('syncState').equals('SYNCED').count());
  const errorsCount = (await db.classSessions.where('syncState').equals('ERROR').count()) +
                      (await db.attendanceRecords.where('syncState').equals('ERROR').count());
  const conflictsCount = (await db.classSessions.where('syncState').equals('CONFLICT').count()) +
                        (await db.attendanceRecords.where('syncState').equals('CONFLICT').count());

  return { totalPending: pendingCount, syncedCount, errorsCount, conflictsCount };
}
