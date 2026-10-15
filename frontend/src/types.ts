export type UserRole = 'TEACHER' | 'AUXILIARY' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  fullName: string;
  institutionId?: string;
  teacherId?: string;
}

export type AttendanceStatusCode = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface StudentAttendanceItem {
  studentId: string;
  code: string;
  fullName: string;
  status: AttendanceStatusCode;
  note?: string;
}

export interface SectionInfo {
  id: string;
  grade: string;
  name: string;
  displayName: string;
  studentCount: number;
  teacherId?: string;
  teacherName?: string;
}
