import { useState, useMemo } from 'react';
import type { SectionInfo, StudentAttendanceItem } from './types';
import { getSectionTheme } from './themeUtils';

interface AuxiliaryDailyViewProps {
  date: string;
  onDateChange?: (newDate: string) => void;
  sections: SectionInfo[];
  allAttendance: Record<string, StudentAttendanceItem[]>;
  sessionsStatusMap?: Record<string, {
    status: 'PENDING' | 'TAKEN';
    presentCount?: number;
    totalCount?: number;
  }>;
}

type FilterCondition = 'ALL' | 'ABSENT' | 'LATE' | 'EXCUSED';

// Iconos semánticos claros y acordes (0 figuras geométricas confusas)
const IconClock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconCross = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconDocument = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconTeacher = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#565449" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

function formatFriendlyDate(dateStr: string) {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month - 1, day);
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${days[dateObj.getDay()]} ${day} de ${months[month - 1]}, ${year}`;
  } catch {
    return dateStr;
  }
}

export function AuxiliaryDailyView({
  date,
  onDateChange,
  sections,
  allAttendance,
  sessionsStatusMap = {},
}: AuxiliaryDailyViewProps) {
  const [filterSectionId, setFilterSectionId] = useState<string>('all');
  const [filterCondition, setFilterCondition] = useState<FilterCondition>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Estadísticas generales
  const stats = useMemo(() => {
    let absent = 0;
    let late = 0;
    let excused = 0;

    for (const sec of sections) {
      const records = allAttendance[sec.id] || [];
      for (const r of records) {
        if (r.status === 'ABSENT') absent++;
        else if (r.status === 'LATE') late++;
        else if (r.status === 'EXCUSED') excused++;
      }
    }

    const reportedSectionsCount = Object.values(sessionsStatusMap).filter(
      (s) => s.status === 'TAKEN'
    ).length;

    return {
      absent,
      late,
      excused,
      totalIncidents: absent + late + excused,
      reportedSectionsCount,
      totalSections: sections.length,
    };
  }, [sections, allAttendance, sessionsStatusMap]);

  // Lista de alumnos ausentes o con tardanza
  const exceptionsList = useMemo(() => {
    const list: Array<{
      sectionIndex: number;
      sectionName: string;
      teacherName: string;
      student: StudentAttendanceItem;
    }> = [];

    sections.forEach((sec, idx) => {
      if (filterSectionId !== 'all' && sec.id !== filterSectionId) return;
      const records = allAttendance[sec.id] || [];
      const teacherName = sec.teacherName || 'Docente de Prueba';

      for (const r of records) {
        if (r.status !== 'PRESENT') {
          if (filterCondition !== 'ALL' && r.status !== filterCondition) continue;

          if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            const matchesName = r.fullName.toLowerCase().includes(query);
            if (!matchesName) continue;
          }

          list.push({
            sectionIndex: idx,
            sectionName: sec.displayName,
            teacherName,
            student: r,
          });
        }
      }
    });

    return list.sort((a, b) => {
      const secComp = a.sectionName.localeCompare(b.sectionName);
      if (secComp !== 0) return secComp;
      return a.student.fullName.localeCompare(b.student.fullName);
    });
  }, [sections, allAttendance, filterSectionId, filterCondition, searchQuery]);

  return (
    <div style={{ padding: '1.75rem', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Cabecera Limpia y Directa */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              margin: 0,
              color: '#11120D',
              letterSpacing: '-0.02em',
            }}>
              Reporte de Faltas y Tardanzas
            </h2>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              backgroundColor: '#ECE7DE',
              color: '#565449',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Modo Auxiliar · Solo Lectura
            </span>
          </div>
          <div style={{ fontSize: '0.9rem', color: '#565449', fontWeight: 600, marginTop: '0.25rem' }}>
            {formatFriendlyDate(date)}
          </div>
        </div>

        {/* Controles de Fecha e Impresión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {onDateChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#565449' }}>
                Cambiar fecha:
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => onDateChange(e.target.value)}
                style={{
                  padding: '0.45rem 0.65rem',
                  borderRadius: '4px',
                  border: '1px solid #D8CFBC',
                  backgroundColor: '#FFFFFF',
                  color: '#11120D',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 0.95rem',
              borderRadius: '4px',
              border: '1px solid #253746',
              backgroundColor: '#253746',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
            Imprimir Reporte
          </button>
        </div>
      </div>

      {/* 3 Tarjetas Grandes, Claras e Intuitivas */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        {/* Tarjeta Faltas con icono ✕ acorde */}
        <div
          onClick={() => setFilterCondition(filterCondition === 'ABSENT' ? 'ALL' : 'ABSENT')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: filterCondition === 'ABSENT' ? '2px solid #DC2626' : '1px solid #FCA5A5',
            borderLeft: '5px solid #DC2626',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Clic para ver solo faltas"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#991B1B', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
              Faltas Injustificadas
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IconCross />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#991B1B', marginTop: '6px' }}>
            {stats.absent}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#7F1D1D', marginTop: '2px' }}>
            Alumnos que no asistieron hoy
          </div>
        </div>

        {/* Tarjeta Tardanzas con icono de RELOJ acorde */}
        <div
          onClick={() => setFilterCondition(filterCondition === 'LATE' ? 'ALL' : 'LATE')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: filterCondition === 'LATE' ? '2px solid #D97706' : '1px solid #FDE68A',
            borderLeft: '5px solid #D97706',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Clic para ver solo tardanzas"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#B45309', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
              Tardanzas Registradas
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#FFFBEB',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IconClock />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#B45309', marginTop: '6px' }}>
            {stats.late}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#92400E', marginTop: '2px' }}>
            Alumnos que llegaron tarde
          </div>
        </div>

        {/* Tarjeta Justificadas con icono de DOCUMENTO acorde */}
        <div
          onClick={() => setFilterCondition(filterCondition === 'EXCUSED' ? 'ALL' : 'EXCUSED')}
          style={{
            padding: '1.25rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: filterCondition === 'EXCUSED' ? '2px solid #2563EB' : '1px solid #BFDBFE',
            borderLeft: '5px solid #2563EB',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title="Clic para ver solo justificadas"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#1D4ED8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
              Justificadas
            </span>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IconDocument />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#1D4ED8', marginTop: '6px' }}>
            {stats.excused}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#1E40AF', marginTop: '2px' }}>
            Con permiso o constancia médica
          </div>
        </div>
      </div>

      {/* Barra de Filtros Sencilla (Limpia y Sin Saturación) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '6px',
        padding: '0.85rem 1.15rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem',
      }}>
        {/* Selector de Aula */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#11120D' }}>
            Salón:
          </span>
          <select
            value={filterSectionId}
            onChange={(e) => setFilterSectionId(e.target.value)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '4px',
              border: '1px solid #D8CFBC',
              backgroundColor: '#FFFFFF',
              fontSize: '0.88rem',
              color: '#11120D',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <option value="all">Todos los salones ({sections.length})</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </select>
        </div>

        {/* Buscador de Alumno directo */}
        <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '380px' }}>
          <input
            type="text"
            placeholder="Escribe el nombre del alumno..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.48rem 0.8rem 0.48rem 2.1rem',
              borderRadius: '4px',
              border: '1px solid #D8CFBC',
              backgroundColor: '#FFFFFF',
              fontSize: '0.85rem',
              color: '#11120D',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#565449" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      {/* Tabla Limpia: Muestra Salón, Docente Responsable, Alumno, Condición y Observación */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '6px',
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAF9F6', borderBottom: '1px solid #D8CFBC' }}>
              <th style={{ padding: '0.85rem 1rem', width: '48px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                #
              </th>
              <th style={{ padding: '0.85rem 1rem', width: '120px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Salón
              </th>
              <th style={{ padding: '0.85rem 1rem', width: '220px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Docente Responsable
              </th>
              <th style={{ padding: '0.85rem 1rem', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Alumno (Apellidos y Nombres)
              </th>
              <th style={{ padding: '0.85rem 1rem', width: '160px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Estado
              </th>
              <th style={{ padding: '0.85rem 1rem', width: '240px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Observación
              </th>
            </tr>
          </thead>
          <tbody>
            {exceptionsList.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: '#565449' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#ECFDF5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 0.75rem auto',
                    fontSize: '1.3rem',
                    fontWeight: 900,
                  }}>
                    ✓
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#11120D', marginBottom: '0.25rem' }}>
                    No hay faltas ni tardanzas registradas
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#565449' }}>
                    {stats.reportedSectionsCount === 0
                      ? 'Los docentes de aula aún no han enviado la asistencia para esta fecha.'
                      : 'Todos los alumnos asistieron a clases con normalidad.'}
                  </div>
                </td>
              </tr>
            ) : (
              exceptionsList.map(({ sectionIndex, sectionName, teacherName, student }, idx) => {
                const theme = getSectionTheme(sectionIndex);
                const isAbsent = student.status === 'ABSENT';
                const isLate = student.status === 'LATE';

                return (
                  <tr
                    key={`${sectionName}-${student.studentId}`}
                    style={{
                      borderBottom: '1px solid #ECE7DE',
                      backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FCFBF9',
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#565449', fontWeight: 600 }}>
                      {idx + 1}
                    </td>

                    {/* Salón con color de aula */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: theme.bg,
                        color: theme.accent,
                        border: `1px solid ${theme.border}`,
                        fontSize: '0.82rem',
                        fontWeight: 800,
                      }}>
                        {sectionName}
                      </span>
                    </td>

                    {/* Docente Responsable (en vez del código de sistema) */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <IconTeacher />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#11120D' }}>
                          {teacherName}
                        </span>
                      </div>
                    </td>

                    {/* Alumno */}
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.92rem', fontWeight: 800, color: '#11120D' }}>
                      {student.fullName}
                    </td>

                    {/* Estado con iconos acordes y humanos */}
                    <td style={{ padding: '0.85rem 1rem' }}>
                      {isAbsent && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: '4px',
                          backgroundColor: '#FEF2F2',
                          color: '#DC2626',
                          border: '1px solid #FCA5A5',
                        }}>
                          <IconCross />
                          Falta
                        </span>
                      )}
                      {isLate && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: '4px',
                          backgroundColor: '#FFFBEB',
                          color: '#D97706',
                          border: '1px solid #FDE68A',
                        }}>
                          <IconClock />
                          Tardanza
                        </span>
                      )}
                      {!isAbsent && !isLate && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: '4px',
                          backgroundColor: '#EFF6FF',
                          color: '#2563EB',
                          border: '1px solid #BFDBFE',
                        }}>
                          <IconDocument />
                          Justificada
                        </span>
                      )}
                    </td>

                    {/* Observación Docente */}
                    <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: student.note ? '#11120D' : '#8A887E', fontStyle: student.note ? 'normal' : 'italic' }}>
                      {student.note || 'Sin observación'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AuxiliaryDailyView;
