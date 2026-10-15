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

export interface LocalSection {
  id: string;
  grade: string;
  name: string;
  displayName: string;
  studentCount?: number;
  teacherId?: string;
  teacherName?: string;
}

export interface LocalStudent {
  id: string;
  sectionId: string;
  code: string;
  fullName: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
}

export class AttendanceDb extends Dexie {
  classSessions!: Table<LocalClassSession, string>;
  attendanceRecords!: Table<LocalAttendanceRecord, string>;
  sections!: Table<LocalSection, string>;
  students!: Table<LocalStudent, string>;
  metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('asistencia_offline_db');
    this.version(1).stores({
      classSessions: 'id, sectionId, date, syncState, [sectionId+date+slot]',
      attendanceRecords: 'id, sessionId, studentId, syncState, [sessionId+studentId]',
      metadata: 'key',
    });
    this.version(2).stores({
      classSessions: 'id, sectionId, date, syncState, [sectionId+date+slot]',
      attendanceRecords: 'id, sessionId, studentId, syncState, [sessionId+studentId]',
      metadata: 'key',
      sections: 'id, grade, name',
      students: 'id, sectionId, code, fullName',
    });
  }
}

export const db = new AttendanceDb();

// Inicializar deviceId único para la tablet.
// NOTA ARQUITECTÓNICA: Se guarda en IndexedDB (db.metadata), en el mismo almacén que localRev y los registros,
// garantizando que ante un borrado de datos del sitio se borren juntos y el dispositivo se registre como nuevo con UUID fresco.
export async function getDeviceId(): Promise<string> {
  const meta = await db.metadata.get('deviceId');
  if (meta) return meta.value;
  const newId = crypto.randomUUID();
  await db.metadata.put({ key: 'deviceId', value: newId });
  return newId;
}
