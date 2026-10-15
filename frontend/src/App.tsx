import { useState, useEffect, useCallback } from 'react';
import { db, type LocalSection, type LocalStudent } from './db';
import { syncOfflineData } from './syncClient';
import { notifyOtherTabs, subscribeToTabUpdates } from './tabSync';
import { getLocalTodayIso } from './dateUtils';
import type { AuthUser, SectionInfo, StudentAttendanceItem, AttendanceStatusCode } from './types';
import LoginView from './LoginView';
import Sidebar, { type ActiveTab } from './Sidebar';
import Header from './Header';
import HomeView from './HomeView';
import SectionsView from './SectionsView';
import TakeAttendanceView from './TakeAttendanceView';
import AttendanceDetailView from './AttendanceDetailView';
import AuxiliaryDailyView from './AuxiliaryDailyView';
import AdminDashboardView from './AdminDashboardView';
import RosterUploadModal from './RosterUploadModal';
import AddStudentModal from './AddStudentModal';
import AttendanceApp from './AttendanceApp';

function MainApp() {
  // 1. Estado de Sesión y Autenticación
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      const u = saved ? JSON.parse(saved) : null;
      if (u?.role === 'ADMIN') return 'admin';
      if (u?.role === 'AUXILIARY') return 'auxiliary_daily';
    } catch {}
    return 'home';
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Menú lateral desplegable tipo 3 rayas (para celulares)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 2. Estado de Sincronización
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [lastSyncMsg, setLastSyncMsg] = useState<string>('Esperando sincronización');
  const [isAuthExpired, setIsAuthExpired] = useState(false);
  const [loginUsername, setLoginUsername] = useState('docente');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [currentTeacherId, setCurrentTeacherId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('auth_user');
      const u = saved ? JSON.parse(saved) : null;
      return u?.teacherId || localStorage.getItem('teacher_id') || '';
    } catch {
      return '';
    }
  });

  // 3. Datos Escolares Locales
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionInfo | null>(null);
  const [currentDate, setCurrentDate] = useState<string>(() => getLocalTodayIso());
  const [todayDate, setTodayDate] = useState<string>(() => getLocalTodayIso());
  const [attendanceRoster, setAttendanceRoster] = useState<StudentAttendanceItem[]>([]);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [lastSavedCounts, setLastSavedCounts] = useState<{
    present: number; absent: number; late: number; excused: number; total: number;
  } | null>(null);

  // Mapa de estado de sesiones para Mis Secciones
  const [sessionsStatusMap, setSessionsStatusMap] = useState<Record<string, {
    status: 'PENDING' | 'TAKEN';
    presentCount?: number;
    totalCount?: number;
  }>>({});

  // Mapa de todas las asistencias para la vista del auxiliar
  const [allAttendanceMap, setAllAttendanceMap] = useState<Record<string, StudentAttendanceItem[]>>({});

  // 4. Conteo de registros pendientes y sincronizados en Dexie
  const refreshCounts = useCallback(async () => {
    const pSessions = await db.classSessions.where('syncState').equals('PENDING').count();
    const pAtt = await db.attendanceRecords.where('syncState').equals('PENDING').count();

    setPendingCount(pSessions + pAtt);
  }, []);

  // 5. Función de Sincronización
  const triggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const summary = await syncOfflineData();
      await refreshCounts();

      if (summary.authExpired) {
        setSyncStatus('idle');
        setIsAuthExpired(true);
        setLastSyncMsg('Sesión expirada. Inicia sesión nuevamente para sincronizar.');
      } else if (summary.networkError) {
        setSyncStatus('error');
        setIsAuthExpired(false);
        setLastSyncMsg('Error de conexión con el servidor.');
      } else if (summary.serverError) {
        setSyncStatus('error');
        setIsAuthExpired(false);
        setLastSyncMsg(summary.errorMessage || 'Error en el servidor.');
      } else if (summary.errorsCount > 0) {
        setSyncStatus('error');
        setIsAuthExpired(false);
        setLastSyncMsg(`Error en ${summary.errorsCount} registros.`);
      } else {
        setSyncStatus('idle');
        setIsAuthExpired(false);
        setLastSyncMsg(`Sincronizados: ${summary.syncedCount}. Pendientes: ${summary.totalPending}.`);
        notifyOtherTabs({
          type: 'SYNC_COMPLETED',
          timestamp: Date.now(),
        });
      }
    } catch {
      setSyncStatus('error');
      setLastSyncMsg('Fallo de conexión.');
    }
  }, [refreshCounts]);

  // Cargar estado de todas las secciones para la fecha indicada (evita que aparezca vacío y sincroniza indicadores)
  const refreshAllSectionsStatus = useCallback(async (date: string, sectionList?: SectionInfo[]) => {
    let currentSections = sectionList;
    if (!currentSections || currentSections.length === 0) {
      const localSecs = await db.sections.toArray();
      const localStus = await db.students.toArray();
      currentSections = localSecs.map((s) => ({
        id: s.id,
        grade: s.grade,
        name: s.name,
        displayName: s.displayName || `${s.grade}° "${s.name}"`,
        studentCount: localStus.filter((st) => st.sectionId === s.id).length || s.studentCount || 1,
        teacherId: s.teacherId,
        teacherName: s.teacherName || 'Docente de Prueba',
      }));
    }
    if (!currentSections || currentSections.length === 0) return;

    const daySessions = await db.classSessions.where('date').equals(date).toArray();
    const sessionMap = new Map(daySessions.map((s) => [s.sectionId, s]));

    const newStatusMap: Record<string, {
      status: 'PENDING' | 'TAKEN';
      presentCount?: number;
      totalCount?: number;
    }> = {};

    const newAllAttendance: Record<string, StudentAttendanceItem[]> = {};

    for (const sec of currentSections) {
      const session = sessionMap.get(sec.id);
      const students = await db.students.where('sectionId').equals(sec.id).toArray();
      const totalStudents = students.length || sec.studentCount || 0;

      if (session) {
        const records = await db.attendanceRecords.where('sessionId').equals(session.id).toArray();
        const recordsMap = new Map(records.map((r) => [r.studentId, r]));

        const roster: StudentAttendanceItem[] = students.map((stu) => {
          const rec = recordsMap.get(stu.id);
          return {
            studentId: stu.id,
            code: stu.code,
            fullName: stu.fullName,
            status: (rec?.status as AttendanceStatusCode) || 'PRESENT',
            note: rec?.note,
          };
        });

        newStatusMap[sec.id] = {
          status: 'TAKEN',
          presentCount: records.filter((r) => r.status === 'PRESENT').length,
          totalCount: totalStudents,
        };

        newAllAttendance[sec.id] = roster;
      } else {
        newStatusMap[sec.id] = {
          status: 'PENDING',
          presentCount: 0,
          totalCount: totalStudents,
        };
      }
    }

    setSessionsStatusMap((prev) => ({ ...prev, ...newStatusMap }));
    setAllAttendanceMap((prev) => ({ ...prev, ...newAllAttendance }));
  }, []);

  // 6. Cargar datos desde Bootstrap del Servidor o caché local de Dexie
  const loadSchoolData = useCallback(async (forceFetch = false) => {
    let localSections = await db.sections.toArray();
    let localStudents = await db.students.toArray();

    // Si aún no hay datos en Dexie, se solicita recarga forzada, o hay menos de 5 alumnos (caché demo previo)
    if (localSections.length === 0 || localStudents.length === 0 || forceFetch || localStudents.length < 5) {
      try {
        const res = await fetch('/api/bootstrap');
        if (res.ok) {
          const data = await res.json();
          if (data.serverDate) {
            setTodayDate(data.serverDate);
            setCurrentDate(data.serverDate);
          }

          if (data.teacherId) {
            setCurrentTeacherId(data.teacherId);
            localStorage.setItem('teacher_id', data.teacherId);
          }

          if (Array.isArray(data.sections) && data.sections.length > 0) {
            await db.sections.clear();
            await db.sections.bulkPut(data.sections as LocalSection[]);
            localSections = await db.sections.toArray();
          } else if (data.sectionId) {
            // Compatibilidad legacy vertical slice
            const defaultSec: LocalSection = {
              id: data.sectionId,
              grade: '1',
              name: 'A',
              displayName: data.sectionName || '1° "A"',
              studentCount: 1,
            };
            await db.sections.put(defaultSec);
            localSections = [defaultSec];
          }

          if (Array.isArray(data.students) && data.students.length > 0) {
            await db.students.clear();
            await db.students.bulkPut(data.students as LocalStudent[]);
            localStudents = await db.students.toArray();
          } else if (data.studentId) {
            const defaultStu: LocalStudent = {
              id: data.studentId,
              sectionId: data.sectionId,
              code: data.studentCode || 'A023',
              fullName: data.studentName || 'Pari Ancco, Gloria',
            };
            await db.students.put(defaultStu);
            localStudents = [defaultStu];
          }
        }
      } catch {
        // En modo offline puro sin datos previos, usar datos locales
      }
    }

    const formattedSections: SectionInfo[] = localSections.map((s) => ({
      id: s.id,
      grade: s.grade,
      name: s.name,
      displayName: s.displayName || `${s.grade}° "${s.name}"`,
      studentCount: localStudents.filter((st) => st.sectionId === s.id).length || s.studentCount || 1,
      teacherId: s.teacherId,
      teacherName: s.teacherName || 'Docente de Prueba',
    }));

    setSections(formattedSections);
    if (formattedSections.length > 0 && !selectedSection) {
      setSelectedSection(formattedSections[0]);
    }
    await refreshAllSectionsStatus(currentDate, formattedSections);
  }, [selectedSection, currentDate, refreshAllSectionsStatus]);

  // Cargar lista de asistencia para la sección seleccionada
  const loadAttendanceForSection = useCallback(async (section: SectionInfo, date: string) => {
    const students = await db.students.where('sectionId').equals(section.id).toArray();
    const existingSession = await db.classSessions
      .where('[sectionId+date+slot]')
      .equals([section.id, date, 'JORNADA'])
      .first();

    const existingRecords = existingSession
      ? await db.attendanceRecords.where('sessionId').equals(existingSession.id).toArray()
      : [];

    const recordsMap = new Map(existingRecords.map((r) => [r.studentId, r]));

    const roster: StudentAttendanceItem[] = students.map((stu) => {
      const rec = recordsMap.get(stu.id);
      return {
        studentId: stu.id,
        code: stu.code,
        fullName: stu.fullName,
        status: (rec?.status as AttendanceStatusCode) || 'PRESENT',
        note: rec?.note,
      };
    });

    setAttendanceRoster(roster);

    // Actualizar mapa de estado de sesión
    setSessionsStatusMap((prev) => ({
      ...prev,
      [section.id]: {
        status: existingSession ? 'TAKEN' : 'PENDING',
        presentCount: existingSession ? existingRecords.filter((r) => r.status === 'PRESENT').length : 0,
        totalCount: roster.length,
      },
    }));

    // Actualizar mapa general de asistencias (para vista de auxiliar)
    setAllAttendanceMap((prev) => ({
      ...prev,
      [section.id]: roster,
    }));
  }, []);

  const handleSelectSection = useCallback(async (sec: SectionInfo) => {
    // El auxiliar no puede ingresar a listas ni salones de los docentes
    if (authUser?.role === 'AUXILIARY') return;
    setSelectedSection(sec);
    await loadAttendanceForSection(sec, currentDate);
    setActiveTab('take_attendance');
  }, [authUser?.role, currentDate, loadAttendanceForSection]);

  const handleDateChange = useCallback(async (newDate: string) => {
    setCurrentDate(newDate);
    if (selectedSection) {
      await loadAttendanceForSection(selectedSection, newDate);
    }
    await refreshAllSectionsStatus(newDate);
  }, [selectedSection, loadAttendanceForSection, refreshAllSectionsStatus]);

  // Protección de rol: El auxiliar solo tiene acceso a la vista 'auxiliary_daily' (Reporte de Faltas y Tardanzas)
  useEffect(() => {
    if (authUser?.role === 'AUXILIARY' && activeTab !== 'auxiliary_daily') {
      setActiveTab('auxiliary_daily');
    }
  }, [authUser?.role, activeTab]);

  useEffect(() => {
    loadSchoolData(true);
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
  }, [loadSchoolData, refreshCounts, triggerSync]);

  useEffect(() => {
    if (selectedSection) {
      loadAttendanceForSection(selectedSection, currentDate);
    }
  }, [selectedSection, currentDate, loadAttendanceForSection]);

  // 6.5 Sincronización multi-pestaña en tiempo real y detección al volver a enfocar la pestaña
  useEffect(() => {
    const handleRefreshFromDisk = async () => {
      await refreshAllSectionsStatus(currentDate);
      if (selectedSection) {
        await loadAttendanceForSection(selectedSection, currentDate);
      }
      await refreshCounts();
    };

    const unsubscribe = subscribeToTabUpdates(async (msg) => {
      if (msg.type === 'ATTENDANCE_SAVED' || msg.type === 'STUDENTS_UPDATED' || msg.type === 'SYNC_COMPLETED') {
        await handleRefreshFromDisk();
      }
    });

    const handleVisibilityOrFocus = async () => {
      if (document.visibilityState === 'visible') {
        await handleRefreshFromDisk();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [currentDate, selectedSection, refreshAllSectionsStatus, loadAttendanceForSection, refreshCounts]);

  // 7. Acciones de Sesión (Login / Logout)
  const handleLoginSuccess = async (user: AuthUser, token: string) => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('token', token);
    if (user.teacherId) {
      setCurrentTeacherId(user.teacherId);
      localStorage.setItem('teacher_id', user.teacherId);
    }
    setAuthUser(user);
    setIsAuthExpired(false);
    if (user.role === 'ADMIN') {
      setActiveTab('admin');
    } else if (user.role === 'AUXILIARY') {
      setActiveTab('auxiliary_daily');
    } else {
      setActiveTab('home');
    }
    setIsSidebarOpen(false);
    await loadSchoolData(true);
    triggerSync();
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('token');
    setAuthUser(null);
    setActiveTab('home');
    setIsSidebarOpen(false);
  };

  // Re-autenticación cuando vence el JWT (Punto 6)
  const handleReLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setLoginError(errData.error || 'Credenciales inválidas');
        return;
      }
      const data = await res.json();
      localStorage.setItem('token', data.token);
      setIsAuthExpired(false);
      setLoginPassword('');
      await triggerSync();
    } catch {
      setLoginError('Error al contactar con el servidor.');
    }
  };

  // 7.5 Registrar Alumno Manualmente (Offline-First en Dexie + Servidor si online)
  const handleAddStudent = async (data: { sectionId: string; fullName: string; code?: string }) => {
    if (authUser?.role === 'AUXILIARY') {
      alert('Acceso no autorizado: El auxiliar no puede matricular alumnos.');
      return;
    }
    const newId = crypto.randomUUID();
    const existingStudents = await db.students.where('sectionId').equals(data.sectionId).toArray();
    const generatedCode = data.code?.trim() || `A${String(existingStudents.length + 1).padStart(3, '0')}`;

    const localStudent: LocalStudent = {
      id: newId,
      sectionId: data.sectionId,
      code: generatedCode,
      fullName: data.fullName.trim().toUpperCase(),
    };

    // Guardar en Dexie
    await db.students.put(localStudent);

    // Si hay conexión a internet, enviar a la API del backend
    if (navigator.onLine) {
      try {
        await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: newId,
            sectionId: data.sectionId,
            fullName: localStudent.fullName,
            code: localStudent.code,
          }),
        });
      } catch {
        // En caso de corte o desconexión, Dexie mantiene los datos offline
      }
    }

    // Actualizar conteos de la sección en estado de React
    setSections((prev) =>
      prev.map((s) => (s.id === data.sectionId ? { ...s, studentCount: s.studentCount + 1 } : s))
    );

    // Si el docente está pasando lista en esa sección, insertar al estudiante en la lista activa
    if (selectedSection?.id === data.sectionId) {
      const newItem: StudentAttendanceItem = {
        studentId: newId,
        code: localStudent.code,
        fullName: localStudent.fullName,
        status: 'PRESENT',
      };
      setAttendanceRoster((prev) =>
        [...prev, newItem].sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
    }

    // Refrescar mapa de sesiones y contadores
    await refreshAllSectionsStatus(currentDate);
    await refreshCounts();

    // Notificar a otras pestañas sobre la actualización de alumnos
    notifyOtherTabs({
      type: 'STUDENTS_UPDATED',
      sectionId: data.sectionId,
      timestamp: Date.now(),
    });
  };

  // 8. Guardar Asistencia (Offline-First masivo en Dexie)
  const handleSaveAttendance = async (roster: StudentAttendanceItem[]) => {
    if (authUser?.role === 'AUXILIARY') {
      alert('Acceso no autorizado: El auxiliar no puede modificar la lista ni registrar asistencias.');
      return;
    }
    if (!selectedSection) return;
    setSavingAttendance(true);

    const nowIso = new Date().toISOString();
    const teacherId = authUser?.teacherId || currentTeacherId || localStorage.getItem('teacher_id') || '00000000-0000-0000-0000-000000000000';

    // 1. Obtener o crear sesión local en Dexie
    let session = await db.classSessions
      .where('[sectionId+date+slot]')
      .equals([selectedSection.id, currentDate, 'JORNADA'])
      .first();

    if (!session) {
      session = {
        id: crypto.randomUUID(),
        sectionId: selectedSection.id,
        teacherId,
        date: currentDate,
        slot: 'JORNADA',
        status: 'TAKEN',
        version: 0,
        baseVersion: 0,
        localRev: 1,
        syncState: 'PENDING',
        clientUpdatedAt: nowIso,
      };
      await db.classSessions.put(session);
    } else {
      session.status = 'TAKEN';
      session.localRev += 1;
      session.syncState = 'PENDING';
      session.clientUpdatedAt = nowIso;
      await db.classSessions.put(session);
    }

    // 2. Guardar o actualizar los registros de asistencia en Dexie
    let present = 0, absent = 0, late = 0, excused = 0;

    for (const item of roster) {
      if (item.status === 'PRESENT') present++;
      else if (item.status === 'ABSENT') absent++;
      else if (item.status === 'LATE') late++;
      else if (item.status === 'EXCUSED') excused++;

      let record = await db.attendanceRecords
        .where('[sessionId+studentId]')
        .equals([session.id, item.studentId])
        .first();

      if (!record) {
        record = {
          id: crypto.randomUUID(),
          sessionId: session.id,
          studentId: item.studentId,
          status: item.status,
          note: item.note || undefined,
          isVoid: false,
          version: 0,
          baseVersion: 0,
          localRev: 1,
          syncState: 'PENDING',
          clientUpdatedAt: nowIso,
        };
        await db.attendanceRecords.put(record);
      } else {
        record.status = item.status;
        record.note = item.note || undefined;
        record.localRev += 1;
        record.syncState = 'PENDING';
        record.clientUpdatedAt = nowIso;
        await db.attendanceRecords.put(record);
      }
    }

    setLastSavedCounts({ present, absent, late, excused, total: roster.length });
    await refreshCounts();

    // 3. Actualizar INMEDIATAMENTE el estado en memoria para que no salga vacío ni requiera guardar 2 veces
    setSessionsStatusMap((prev) => ({
      ...prev,
      [selectedSection.id]: {
        status: 'TAKEN',
        presentCount: present,
        totalCount: roster.length,
      },
    }));

    setAllAttendanceMap((prev) => ({
      ...prev,
      [selectedSection.id]: roster,
    }));

    setAttendanceRoster(roster);
    setSavingAttendance(false);

    // Notificar inmediatamente a las demás pestañas para actualización en tiempo real
    notifyOtherTabs({
      type: 'ATTENDANCE_SAVED',
      sectionId: selectedSection.id,
      date: currentDate,
      timestamp: Date.now(),
    });

    // Navegar a la pantalla de detalle / confirmación
    setActiveTab('attendance_detail');

    // Si hay conexión, sincronizar de inmediato
    if (navigator.onLine) {
      triggerSync();
    }
  };

  // Si no hay sesión iniciada, mostrar Login
  if (!authUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} defaultUsername="docente" />;
  }

  // Título dinámico para la cabecera
  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'home': return 'Inicio';
      case 'admin': return 'Panel de Control Administrativo';
      case 'sections': return 'Mis secciones';
      case 'take_attendance': return selectedSection ? `${selectedSection.displayName} — Pasar lista` : 'Pasar lista';
      case 'attendance_detail': return 'Detalle de Asistencia';
      case 'auxiliary_daily': return 'Reporte de Faltas y Tardanzas';
      case 'reports': return 'Reportes y Padrón Escolar';
      case 'exports': return 'Exportaciones de Asistencia';
      default: return 'Sistema de Asistencia';
    }
  };

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', backgroundColor: '#FAF9F6' }}>
      {/* Barra Lateral Izquierda (Fija en PC/Tablet, Desplegable tipo 3 rayas en Celular) */}
      <Sidebar
        user={authUser}
        activeTab={activeTab}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectTab={(tab) => {
          if (authUser.role === 'AUXILIARY') {
            setActiveTab('auxiliary_daily');
            setIsSidebarOpen(false);
            return;
          }
          if (tab === 'take_attendance' && !selectedSection && sections.length > 0) {
            setSelectedSection(sections[0]);
          }
          setActiveTab(tab);
          setIsSidebarOpen(false);
        }}
        onLogout={handleLogout}
      />

      {/* Contenedor Principal de la Vista */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <Header
          title={getHeaderTitle()}
          subtitle={
            authUser.role === 'AUXILIARY'
              ? 'I.E. Piloto Chumbivilcas · Monitoreo y Supervisión Escolar (Solo lectura)'
              : 'I.E. Piloto Chumbivilcas · Modalidad Offline-First'
          }
          syncStatus={syncStatus}
          pendingCount={pendingCount}
          lastSyncMsg={lastSyncMsg}
          isOnline={isOnline}
          onRetrySync={triggerSync}
          serverDate={currentDate}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Banner recuperable ante sesión expirada (Punto 6) */}
        {isAuthExpired && (
          <div
            data-testid="auth-expired-banner"
            style={{
              margin: '1.5rem 2rem 0 2rem',
              padding: '1rem 1.25rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid #565449',
              borderRadius: '4px',
              color: '#11120D',
              boxShadow: '0 1px 4px rgba(17, 18, 13, 0.04)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              [!] Sesión expirada. Inicia sesión nuevamente para sincronizar.
            </div>
            <form onSubmit={handleReLogin} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                data-testid="login-username"
                placeholder="Usuario"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                style={{ padding: '0.45rem 0.75rem', borderRadius: '4px', border: '1px solid #D8CFBC', backgroundColor: '#FFFFFF', color: '#11120D' }}
              />
              <input
                type="password"
                data-testid="login-password"
                placeholder="Contraseña"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                style={{ padding: '0.45rem 0.75rem', borderRadius: '4px', border: '1px solid #D8CFBC', backgroundColor: '#FFFFFF', color: '#11120D' }}
              />
              <button
                type="submit"
                data-testid="btn-login"
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#11120D',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.8rem',
                }}
              >
                Iniciar sesión y sincronizar
              </button>
              {loginError && (
                <span data-testid="login-error" style={{ fontSize: '0.82rem', color: '#565449', fontWeight: 600 }}>
                  {loginError}
                </span>
              )}
            </form>
          </div>
        )}

        {/* Contenido de la vista según navegación */}
        <main style={{ flex: 1 }}>
          {activeTab === 'home' && (
            <HomeView
              user={authUser}
              sections={sections}
              todayDate={todayDate}
              selectedDate={currentDate}
              onDateChange={handleDateChange}
              sessionsStatusMap={
                Object.fromEntries(
                  Object.entries(sessionsStatusMap).map(([k, v]) => [k, v.status])
                )
              }
              sessionsFullMap={sessionsStatusMap}
              onGoToSection={handleSelectSection}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onOpenAddStudentModal={() => setIsAddStudentModalOpen(true)}
              onRefreshRoster={() => loadSchoolData(true)}
            />
          )}

          {activeTab === 'sections' && (
            <SectionsView
              sections={sections}
              selectedDate={currentDate}
              todayDate={todayDate}
              onDateChange={handleDateChange}
              sessionsStatusMap={sessionsStatusMap}
              onSelectSection={handleSelectSection}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onOpenAddStudentModal={() => setIsAddStudentModalOpen(true)}
            />
          )}

          {activeTab === 'take_attendance' && selectedSection && (
            <TakeAttendanceView
              section={selectedSection}
              date={currentDate}
              todayDate={todayDate}
              onDateChange={handleDateChange}
              isSessionTaken={sessionsStatusMap[selectedSection.id]?.status === 'TAKEN'}
              items={attendanceRoster}
              saving={savingAttendance}
              onBack={() => setActiveTab('sections')}
              onSave={handleSaveAttendance}
              onOpenAddStudent={() => setIsAddStudentModalOpen(true)}
            />
          )}

          {activeTab === 'attendance_detail' && selectedSection && lastSavedCounts && (
            <AttendanceDetailView
              section={selectedSection}
              date={currentDate}
              todayDate={todayDate}
              counts={lastSavedCounts}
              onEdit={() => setActiveTab('take_attendance')}
              onBackToSections={() => setActiveTab('sections')}
            />
          )}

          {activeTab === 'admin' && (
            <AdminDashboardView
              user={authUser}
              sections={sections}
              todayDate={currentDate}
              allAttendance={allAttendanceMap}
              sessionsStatusMap={sessionsStatusMap}
              onSelectSection={handleSelectSection}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />
          )}

          {(activeTab === 'auxiliary_daily' || activeTab === 'reports' || activeTab === 'exports') && (
            <AuxiliaryDailyView
              date={currentDate}
              onDateChange={async (d) => {
                setCurrentDate(d);
                await refreshAllSectionsStatus(d);
              }}
              sections={sections}
              allAttendance={allAttendanceMap}
              sessionsStatusMap={sessionsStatusMap}
            />
          )}
        </main>
      </div>

      {/* Modal institucional para subir archivo Excel del padrón (Solo Admin/Docente) */}
      {authUser.role !== 'AUXILIARY' && (
        <RosterUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={async () => {
            setIsUploadModalOpen(false);
            await loadSchoolData(true);
            await triggerSync();
          }}
        />
      )}

      {/* Modal institucional para registrar alumno manualmente (Solo Admin/Docente) */}
      {authUser.role !== 'AUXILIARY' && (
        <AddStudentModal
          isOpen={isAddStudentModalOpen}
          onClose={() => setIsAddStudentModalOpen(false)}
          sections={sections}
          defaultSectionId={selectedSection?.id}
          onSaveStudent={handleAddStudent}
        />
      )}
    </div>
  );
}

export function App() {
  if (typeof window !== 'undefined') (window as any).__db = db;

  const isLegacy = typeof window !== 'undefined' && (
    window.location.search.includes('legacy') || window.location.search.includes('slice')
  );

  if (isLegacy) {
    return <AttendanceApp />;
  }

  return <MainApp />;
}

export default App;
