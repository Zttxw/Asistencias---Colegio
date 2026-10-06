import Dexie, { type Table } from 'dexie';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'ERROR';

export interface LocalClassSession {
  id: string; // UUID v4 generado en la tablet
  sectionId: string;
  teacherId: string;
  date: string; // YYYY-MM-DD
  slot: string; // "JORNADA"
  status: 'OPEN' | 'TAKEN' | 'VOID';
  courseName?: string;
  version: number; // serverVersion
  baseVersion: number;
  localRev: number; // Incrementa en cada edición local para evitar perder cambios (B1)
  syncState: SyncStatus;
  lastError?: string;
  clientUpdatedAt: string;
}

export interface LocalAttendanceRecord {
  id: string; // UUID v4 generado en la tablet
  sessionId: string;
  studentId: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  note?: string;
  isVoid: boolean;
  version: number;
  baseVersion: number;
  localRev: number; // B1
  syncState: SyncStatus;
  lastError?: string;
  clientUpdatedAt: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
}

export class AttendanceDb extends Dexie {
  classSessions!: Table<LocalClassSession, string>;
  attendanceRecords!: Table<LocalAttendanceRecord, string>;
  metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('asistencia_offline_db');
    this.version(1).stores({
      classSessions: 'id, sectionId, date, syncState, [sectionId+date+slot]',
      attendanceRecords: 'id, sessionId, studentId, syncState, [sessionId+studentId]',
      metadata: 'key',
    });
  }
}

export const db = new AttendanceDb();

// Inicializar deviceId único para la tablet
export async function getDeviceId(): Promise<string> {
  const meta = await db.metadata.get('deviceId');
  if (meta) return meta.value;
  const newId = crypto.randomUUID();
  await db.metadata.put({ key: 'deviceId', value: newId });
  return newId;
}
