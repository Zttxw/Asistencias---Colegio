import { useState, useMemo } from 'react';
import type { AuthUser, SectionInfo, StudentAttendanceItem } from './types';
import { getSectionTheme } from './themeUtils';
import { UserPasswordManager } from './UserPasswordManager';

interface AdminDashboardViewProps {
  user: AuthUser;
  sections: SectionInfo[];
  todayDate: string;
  allAttendance: Record<string, StudentAttendanceItem[]>;
  sessionsStatusMap: Record<string, {
    status: 'PENDING' | 'TAKEN';
    presentCount?: number;
    totalCount?: number;
  }>;
  onSelectSection: (section: SectionInfo) => void;
  onOpenUploadModal?: () => void;
}

export function AdminDashboardView({
  user,
  sections,
  todayDate,
  allAttendance,
  sessionsStatusMap,
  onSelectSection,
  onOpenUploadModal,
}: AdminDashboardViewProps) {
  // Estado para expansión tipo árbol (por defecto colapsado para mostrar primero los docentes)
  const [expandedTeachers, setExpandedTeachers] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState('');

  // Cálculos globales para los KPIs institucionales
  const totalSections = sections.length;
  let totalEnrolled = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let totalExcused = 0;
  let sectionsTaken = 0;

  for (const sec of sections) {
    totalEnrolled += sec.studentCount;
    const status = sessionsStatusMap[sec.id];
    if (status?.status === 'TAKEN') {
      sectionsTaken++;
    }

    const items = allAttendance[sec.id] || [];
    for (const it of items) {
      if (it.status === 'PRESENT') totalPresent++;
      else if (it.status === 'ABSENT') totalAbsent++;
      else if (it.status === 'LATE') totalLate++;
      else if (it.status === 'EXCUSED') totalExcused++;
    }
  }

  const attendancePercentage = totalEnrolled > 0 && sectionsTaken > 0
    ? Math.round(((totalPresent + totalLate) / (totalPresent + totalAbsent + totalLate + totalExcused || 1)) * 100)
    : 0;

  // Agrupación jerárquica: Docente -> Salones asignados
  const teachersGrouped = useMemo(() => {
    const map = new Map<string, {
      teacherName: string;
      teacherId?: string;
      sections: SectionInfo[];
      totalEnrolled: number;
      sectionsTaken: number;
      totalPresent: number;
      totalAbsent: number;
      totalLate: number;
      totalExcused: number;
    }>();

    for (const sec of sections) {
      const teacherKey = sec.teacherName || 'Docente de Prueba';
      let group = map.get(teacherKey);
      if (!group) {
        group = {
          teacherName: teacherKey,
          teacherId: sec.teacherId,
          sections: [],
          totalEnrolled: 0,
          sectionsTaken: 0,
          totalPresent: 0,
          totalAbsent: 0,
          totalLate: 0,
          totalExcused: 0,
        };
        map.set(teacherKey, group);
      }

      group.sections.push(sec);
      group.totalEnrolled += sec.studentCount;

      const sStatus = sessionsStatusMap[sec.id];
      if (sStatus?.status === 'TAKEN') {
        group.sectionsTaken++;
      }

      const items = allAttendance[sec.id] || [];
      for (const it of items) {
        if (it.status === 'PRESENT') group.totalPresent++;
        else if (it.status === 'ABSENT') group.totalAbsent++;
        else if (it.status === 'LATE') group.totalLate++;
        else if (it.status === 'EXCUSED') group.totalExcused++;
      }
    }

    return Array.from(map.values());
  }, [sections, sessionsStatusMap, allAttendance]);

  // Filtrado por buscador
  const filteredTeachers = useMemo(() => {
    const term = searchFilter.trim().toLowerCase();
    if (!term) return teachersGrouped;

    return teachersGrouped
      .map((t) => {
        const matchesTeacher = t.teacherName.toLowerCase().includes(term);
        const matchedSections = t.sections.filter((s) =>
          s.displayName.toLowerCase().includes(term) ||
          s.grade.toLowerCase().includes(term) ||
          s.name.toLowerCase().includes(term)
        );

        if (matchesTeacher) {
          return t;
        }

        if (matchedSections.length > 0) {
          return {
            ...t,
            sections: matchedSections,
          };
        }

        return null;
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }, [teachersGrouped, searchFilter]);

  const toggleTeacher = (teacherName: string) => {
    setExpandedTeachers((prev) => ({
      ...prev,
      [teacherName]: !prev[teacherName],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const t of teachersGrouped) {
      next[t.teacherName] = true;
    }
    setExpandedTeachers(next);
  };

  const collapseAll = () => {
    setExpandedTeachers({});
  };

  return (
    <div className="salon-view-container" style={{ maxWidth: '1280px', margin: '0 auto' }}>
      {/* Encabezado Institucional (oculto en móvil para no duplicar el header y mostrar métricas de inmediato) */}
      <div className="admin-institutional-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '2rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid #D8CFBC',
      }}>
        <div>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#565449',
            marginBottom: '0.25rem',
          }}>
            Dirección General · I.E. Piloto Chumbivilcas
          </div>
          <h2 style={{
            fontSize: '1.65rem',
            fontWeight: 800,
            color: '#11120D',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Panel de Control Administrativo
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#565449', marginTop: '0.35rem' }}>
            Sesión: {user.fullName || user.username} · Año Lectivo 2026 · {todayDate}
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '0.35rem 0.75rem',
            backgroundColor: '#FAF9F6',
            border: '1px solid #D8CFBC',
            borderRadius: '4px',
            color: '#11120D',
            letterSpacing: '0.04em',
          }}>
            Servidor Local: En línea
          </span>
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '0.35rem 0.75rem',
            backgroundColor: '#FAF9F6',
            border: '1px solid #565449',
            borderRadius: '4px',
            color: '#11120D',
            letterSpacing: '0.04em',
          }}>
            BD PostgreSQL 17: Activa
          </span>
        </div>
      </div>

      {/* Tarjetas de Métricas Directivas (KPIs) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2.5rem',
      }}>
        {/* Total Matrícula */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#565449', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Matrícula Total
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#11120D', marginTop: '0.35rem' }}>
            {totalEnrolled}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#565449', marginTop: '0.25rem' }}>
            Estudiantes registrados ({teachersGrouped.length} docente{teachersGrouped.length > 1 ? 's' : ''})
          </div>
        </div>

        {/* Cobertura de Secciones */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#565449', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Secciones con Lista
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#11120D', marginTop: '0.35rem' }}>
            {sectionsTaken} <span style={{ fontSize: '1.1rem', fontWeight: 400, color: '#565449' }}>/ {totalSections}</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#565449', marginTop: '0.25rem' }}>
            {sectionsTaken === totalSections && totalSections > 0 ? '100% completado' : `${totalSections - sectionsTaken} pendiente(s)`}
          </div>
        </div>

        {/* % Asistencia Hoy */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#565449', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Asistencia Global
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#11120D', marginTop: '0.35rem' }}>
            {attendancePercentage}%
          </div>
          <div style={{ fontSize: '0.8rem', color: '#565449', marginTop: '0.25rem' }}>
            {totalPresent} presentes hoy
          </div>
        </div>

        {/* Inasistencias y Tardanzas */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#565449', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Inasistencias y Tardanzas
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#11120D', marginTop: '0.35rem' }}>
            {totalAbsent} <span style={{ fontSize: '1rem', fontWeight: 600, color: '#565449' }}>faltas · {totalLate} tard.</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#565449', marginTop: '0.25rem' }}>
            {totalExcused} justificadas
          </div>
        </div>
      </div>

      {/* Árbol Jerárquico: Docentes y Aulas Asignadas */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '4px',
        border: '1px solid #D8CFBC',
        padding: '1.5rem',
        marginBottom: '2.5rem',
        boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #EAE5D9',
        }}>
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                backgroundColor: '#FAF9F6',
                border: '1px solid #D8CFBC',
                color: '#11120D',
                fontSize: '0.85rem',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h3 style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#11120D',
                margin: 0,
                letterSpacing: '-0.01em',
              }}>
                Supervisión por Docente y Salones
              </h3>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#565449', marginTop: '0.25rem' }}>
              Estructura jerárquica en árbol: haz clic en un docente para desplegar sus salones a cargo.
            </div>
          </div>

          {/* Barra de herramientas / controles */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            {/* Buscador */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar docente o salón..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem 0.45rem 2rem',
                  fontSize: '0.8rem',
                  borderRadius: '4px',
                  border: '1px solid #D8CFBC',
                  backgroundColor: '#FAF9F6',
                  color: '#11120D',
                  outline: 'none',
                  width: '210px',
                }}
              />
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#565449"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: 'absolute',
                  left: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            {/* Botones de expansión masiva */}
            <button
              onClick={expandAll}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: '#FAF9F6',
                color: '#11120D',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
              title="Desplegar todos los salones"
            >
              + Expandir todos
            </button>
            <button
              onClick={collapseAll}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: '#FAF9F6',
                color: '#565449',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
              title="Contraer todos los salones"
            >
              − Contraer todos
            </button>
          </div>
        </div>

        {/* Listado tipo árbol */}
        {filteredTeachers.length === 0 ? (
          <div style={{
            padding: '2.5rem',
            textAlign: 'center',
            color: '#565449',
            backgroundColor: '#FAF9F6',
            borderRadius: '4px',
            border: '1px dashed #D8CFBC',
          }}>
            No se encontraron docentes o salones que coincidan con la búsqueda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredTeachers.map((teacher) => {
              const isExpanded = expandedTeachers[teacher.teacherName] ?? false;
              const hasAllTaken = teacher.sectionsTaken === teacher.sections.length && teacher.sections.length > 0;
              const teacherAttendancePct = teacher.totalEnrolled > 0 && teacher.sectionsTaken > 0
                ? Math.round(((teacher.totalPresent + teacher.totalLate) / (teacher.totalPresent + teacher.totalAbsent + teacher.totalLate + teacher.totalExcused || 1)) * 100)
                : 0;

              return (
                <div
                  key={teacher.teacherName}
                  style={{
                    border: '1px solid #D8CFBC',
                    borderRadius: '4px',
                    backgroundColor: '#FFFFFF',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  {/* Nodo Padre: Tarjeta / Fila del Docente (Clickable) */}
                  <div
                    onClick={() => toggleTeacher(teacher.teacherName)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem 1.25rem',
                      backgroundColor: isExpanded ? '#FAF9F6' : '#FFFFFF',
                      cursor: 'pointer',
                      borderBottom: isExpanded ? '1px solid #D8CFBC' : 'none',
                      userSelect: 'none',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = '#FBFBF9';
                    }}
                    onMouseLeave={(e) => {
                      if (!isExpanded) e.currentTarget.style.backgroundColor = '#FFFFFF';
                    }}
                  >
                    {/* Lado izquierdo: Flecha de árbol + Avatar + Nombre Docente */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      {/* Chevron / Icono de Expansión */}
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          backgroundColor: isExpanded ? '#11120D' : '#FAF9F6',
                          color: isExpanded ? '#FFFFFF' : '#11120D',
                          border: `1px solid ${isExpanded ? '#11120D' : '#D8CFBC'}`,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>

                      {/* Icono de Docente */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '4px',
                          backgroundColor: '#FAF9F6',
                          border: '1px solid #D8CFBC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#11120D',
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>

                      {/* Info del Docente */}
                      <div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}>
                          <span style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            color: '#11120D',
                            letterSpacing: '-0.01em',
                          }}>
                            {teacher.teacherName}
                          </span>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            backgroundColor: '#FAF9F6',
                            border: '1px solid #D8CFBC',
                            borderRadius: '3px',
                            color: '#565449',
                            textTransform: 'uppercase',
                          }}>
                            Docente Titular
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#565449', marginTop: '0.15rem' }}>
                          <strong>{teacher.sections.length}</strong> salones asignados · <strong>{teacher.totalEnrolled}</strong> alumnos en total
                        </div>
                      </div>
                    </div>

                    {/* Lado derecho: Métricas resumidas y botón de acción */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {/* Indicador de Listas tomadas */}
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '3px',
                        backgroundColor: hasAllTaken ? '#FAF9F6' : '#FFFFFF',
                        border: `1px solid ${hasAllTaken ? '#D8CFBC' : '#565449'}`,
                        color: '#11120D',
                        letterSpacing: '0.03em',
                      }}>
                        {hasAllTaken
                          ? `[✓] ${teacher.sectionsTaken}/${teacher.sections.length} Listas Registradas`
                          : `[•] ${teacher.sectionsTaken}/${teacher.sections.length} Listas (Pendiente)`}
                      </span>

                      {/* % Asistencia */}
                      {teacher.sectionsTaken > 0 && (
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#565449',
                        }}>
                          {teacherAttendancePct}% asistencia
                        </span>
                      )}

                      {/* Botón desplegable visual */}
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: isExpanded ? '#11120D' : '#565449',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {isExpanded ? 'Ocultar Salones ▲' : 'Ver Salones ▼'}
                      </span>
                    </div>
                  </div>

                  {/* Nodos Hijos del Árbol: Salones asignados al Docente */}
                  {isExpanded && (
                    <div style={{
                      backgroundColor: '#FCFBF9',
                      padding: '1.25rem 1.5rem',
                    }}>
                      <div style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: '#565449',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}>
                        <span>Salones a cargo de {teacher.teacherName}:</span>
                      </div>

                      <div style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #D8CFBC',
                        borderRadius: '4px',
                        overflowX: 'auto',
                      }}>
                        <table style={{ margin: 0 }}>
                          <thead>
                            <tr style={{ backgroundColor: '#FAF9F6' }}>
                              <th style={{ width: '32px', textAlign: 'center' }}>#</th>
                              <th>Grado y Sección</th>
                              <th style={{ textAlign: 'center' }}>Matrícula</th>
                              <th style={{ textAlign: 'center' }}>Estado de Hoy ({todayDate})</th>
                              <th style={{ textAlign: 'center' }}>Asistencia Registrada</th>
                              <th style={{ textAlign: 'right' }}>Acción</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacher.sections.map((sec, idx) => {
                              const sStatus = sessionsStatusMap[sec.id];
                              const isTaken = sStatus?.status === 'TAKEN';
                              const items = allAttendance[sec.id] || [];
                              const secPresent = sStatus?.presentCount !== undefined
                                ? sStatus.presentCount
                                : items.filter((i) => i.status === 'PRESENT').length;
                              const theme = getSectionTheme(idx);

                              return (
                                <tr
                                  key={sec.id}
                                  style={{
                                    backgroundColor: theme.bg,
                                    borderLeft: `5px solid ${theme.accent}`,
                                    borderBottom: `1px solid ${theme.border}`,
                                    transition: 'background-color 0.15s ease',
                                  }}
                                >
                                  {/* Conector de rama de árbol con número */}
                                  <td style={{
                                    textAlign: 'center',
                                    color: theme.accent,
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                  }}>
                                    {idx + 1}
                                  </td>

                                  {/* Salón con pastilla de color temático */}
                                  <td style={{ fontWeight: 800, color: theme.badgeText, fontSize: '0.9rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      <span style={{ color: theme.accent, fontSize: '0.8rem', fontWeight: 700 }}>└─</span>
                                      <span style={{
                                        backgroundColor: theme.badgeBg,
                                        color: theme.badgeText,
                                        border: `1px solid ${theme.border}`,
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        fontWeight: 800,
                                        letterSpacing: '0.02em',
                                      }}>
                                        {sec.displayName}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Matrícula */}
                                  <td style={{ textAlign: 'center', color: theme.badgeText, fontWeight: 600 }}>
                                    {sec.studentCount} alumnos
                                  </td>

                                  {/* Estado de sesión */}
                                  <td style={{ textAlign: 'center' }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: '2px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      backgroundColor: isTaken ? '#FAF9F6' : '#FFFFFF',
                                      color: isTaken ? '#11120D' : '#565449',
                                      border: `1px solid ${isTaken ? '#D8CFBC' : '#565449'}`,
                                      letterSpacing: '0.04em',
                                    }}>
                                      {isTaken ? '[✓] Lista Registrada' : '[•] Pendiente'}
                                    </span>
                                  </td>

                                  {/* Asistencia */}
                                  <td style={{ textAlign: 'center', color: theme.badgeText, fontWeight: 700 }}>
                                    {isTaken ? `${secPresent} / ${sec.studentCount} presentes` : '—'}
                                  </td>

                                  {/* Acción: Inspeccionar */}
                                  <td style={{ textAlign: 'right' }}>
                                    <button
                                      onClick={() => onSelectSection(sec)}
                                      style={{
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        backgroundColor: '#FFFFFF',
                                        color: theme.accent,
                                        border: `1px solid ${theme.border}`,
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        letterSpacing: '0.04em',
                                        textTransform: 'uppercase',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.hoverBg;
                                        e.currentTarget.style.borderColor = theme.accent;
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#FFFFFF';
                                        e.currentTarget.style.borderColor = theme.border;
                                      }}
                                      title={`Abrir control de asistencia para ${sec.displayName}`}
                                    >
                                      Inspeccionar Salón →
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Módulo de Gestión de Cuentas y Recuperación de Contraseñas */}
      <UserPasswordManager />

      {/* Operaciones de Seguridad y Respaldo Institucional */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.5rem',
      }}>
        {/* Gestión del Padrón Oficial */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.5rem',
        }}>
          <h4 style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            color: '#11120D',
            margin: '0 0 0.5rem 0',
            letterSpacing: '0.02em',
          }}>
            Padrón Escolar Oficial
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#565449', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
            La incorporación masiva de alumnos se gestiona exclusivamente mediante CLI segura con pre-validación (dry-run) para garantizar la privacidad y consistencia del padrón escolar.
          </p>
          <div style={{
            backgroundColor: '#FAF9F6',
            border: '1px solid #D8CFBC',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#11120D',
          }}>
            dotnet Asistencia.Api.dll roster dry-run &lt;padron.xlsx&gt;
          </div>

          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.65rem',
                backgroundColor: '#11120D',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#565449'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#11120D'}
            >
              [ Subir Padrón Escolar (Excel) ]
            </button>
          )}
        </div>

        {/* Políticas de Respaldo */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '4px',
          border: '1px solid #D8CFBC',
          padding: '1.5rem',
        }}>
          <h4 style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            color: '#11120D',
            margin: '0 0 0.5rem 0',
            letterSpacing: '0.02em',
          }}>
            Respaldos y Seguridad Local
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#565449', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
            El servidor ejecuta copias de seguridad de la base de datos PostgreSQL y la bitácora de auditoría (change_log) antes de cada jornada escolar.
          </p>
          <div style={{
            backgroundColor: '#FAF9F6',
            border: '1px solid #D8CFBC',
            borderRadius: '4px',
            padding: '0.75rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#11120D',
          }}>
            ./scripts/backup-pilot.sh
          </div>
        </div>
      </div>
    </div>
  );
}
export default AdminDashboardView;
