import type { SectionInfo } from './types';
import { getSectionTheme } from './themeUtils';
import { formatFriendlyHumanDate, getYesterdayIso, getPreviousSchoolDayIso, parseIsoDate } from './dateUtils';

interface SectionsViewProps {
  sections: SectionInfo[];
  selectedDate: string;
  onDateChange: (newDate: string) => void;
  onSelectSection: (section: SectionInfo) => void;
  sessionsStatusMap: Record<string, { status: 'PENDING' | 'TAKEN'; presentCount?: number; totalCount?: number }>;
  onOpenUploadModal?: () => void;
  onOpenAddStudentModal?: () => void;
  todayDate?: string;
}

export function SectionsView({
  sections,
  selectedDate,
  onDateChange,
  onSelectSection,
  sessionsStatusMap,
  onOpenUploadModal,
  onOpenAddStudentModal,
  todayDate,
}: SectionsViewProps) {
  const todayDayOfWeek = todayDate ? parseIsoDate(todayDate).dateObj.getDay() : 1;
  const isTodayMonday = todayDayOfWeek === 1;
  const prevSchoolDayIso = todayDate ? getPreviousSchoolDayIso(todayDate) : '';

  return (
    <div className="salon-view-container">
      {/* Barra de control superior */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: '#11120D', letterSpacing: '-0.01em' }}>
            Mis secciones
          </h2>
          <div className="sections-view-subtitle" style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{formatFriendlyHumanDate(selectedDate, todayDate || selectedDate)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="sections-controls-buttons" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onOpenAddStudentModal && (
              <button
                onClick={onOpenAddStudentModal}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  border: '1px solid #1A73E8',
                  backgroundColor: '#1A73E8',
                  color: '#FFFFFF',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(26, 115, 232, 0.2)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1557B0'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1A73E8'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>+ Añadir Alumno</span>
              </button>
            )}

            {onOpenUploadModal && (
              <button
                onClick={onOpenUploadModal}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '4px',
                  border: '1px solid #565449',
                  backgroundColor: '#FFFFFF',
                  color: '#11120D',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FAF9F6'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
              >
                [ Subir Padrón Excel ]
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {todayDate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button
                  type="button"
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D8CFBC',
                    backgroundColor: selectedDate === todayDate ? '#11120D' : '#FFFFFF',
                    color: selectedDate === todayDate ? '#FFFFFF' : '#11120D',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => onDateChange(todayDate)}
                  title="Ver lista de Hoy"
                >
                  Hoy
                </button>
                {isTodayMonday ? (
                  <button
                    type="button"
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #D8CFBC',
                      backgroundColor: selectedDate === prevSchoolDayIso ? '#11120D' : '#FFFFFF',
                      color: selectedDate === prevSchoolDayIso ? '#FFFFFF' : '#11120D',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => onDateChange(prevSchoolDayIso)}
                    title="Ver lista de la última clase (Viernes)"
                  >
                    Clase anterior (Viernes)
                  </button>
                ) : (
                  <button
                    type="button"
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #D8CFBC',
                      backgroundColor: selectedDate === getYesterdayIso(todayDate) ? '#11120D' : '#FFFFFF',
                      color: selectedDate === getYesterdayIso(todayDate) ? '#FFFFFF' : '#11120D',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    onClick={() => onDateChange(getYesterdayIso(todayDate))}
                    title="Ver lista de Ayer"
                  >
                    Ayer
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#11120D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Fecha:
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #D8CFBC',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.88rem',
                  color: '#11120D',
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modo Celular: Cuadros de salones centrados, cuadrados y no muy anchos */}
      <div className="sections-mobile-cards">
        <div className="salon-cards-grid">
          {sections.map((sec, idx) => {
            const info = sessionsStatusMap[sec.id];
            const isTaken = info?.status === 'TAKEN';
            const ratio = isTaken && info.presentCount !== undefined
              ? `${info.presentCount}/${info.totalCount || sec.studentCount}`
              : null;
            const theme = getSectionTheme(idx);

            return (
              <div
                key={sec.id}
                className="salon-card"
                style={{
                  border: `1px solid ${theme.border}`,
                }}
              >
                {/* Cabecera del Salón */}
                <div
                  className="salon-card-banner"
                  style={{ backgroundColor: theme.bannerBg }}
                >
                  <div>
                    <div style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.15,
                    }}>
                      {sec.displayName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.92)', marginTop: '3px', fontWeight: 500 }}>
                      Jornada Regular
                    </div>
                  </div>

                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.35)',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>
                    {isTaken ? '✓ Registrada' : 'Pendiente'}
                  </span>
                </div>

                {/* Cuerpo del Salón */}
                <div
                  className="salon-card-body"
                  style={{ backgroundColor: theme.bg }}
                >
                  <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: theme.badgeBg,
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.badgeText,
                      marginBottom: '0.5rem',
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>

                    <div style={{
                      fontSize: '0.9rem',
                      color: theme.badgeText,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                    }}>
                      {sec.studentCount} alumnos
                    </div>

                    {ratio ? (
                      <div style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: theme.accent,
                        backgroundColor: '#FFFFFF',
                        border: `1px solid ${theme.border}`,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        marginTop: '4px',
                      }}>
                        Asistencia: {info.presentCount} de {info.totalCount || sec.studentCount} presentes
                      </div>
                    ) : (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#565449',
                        marginTop: '2px',
                      }}>
                        matriculados
                      </div>
                    )}
                  </div>

                  {/* Botón táctil */}
                  <button
                    onClick={() => onSelectSection(sec)}
                    className="salon-card-action-btn"
                    style={{
                      backgroundColor: isTaken ? '#FFFFFF' : theme.accent,
                      color: isTaken ? theme.accent : '#FFFFFF',
                      border: isTaken ? `1px solid ${theme.border}` : 'none',
                      boxShadow: isTaken ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isTaken) e.currentTarget.style.opacity = '0.9';
                      else e.currentTarget.style.backgroundColor = theme.hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!isTaken) e.currentTarget.style.opacity = '1';
                      else e.currentTarget.style.backgroundColor = '#FFFFFF';
                    }}
                  >
                    <span>{isTaken ? 'Ver / Editar' : 'Pasar lista →'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla en PC y Tablets Grandes */}
      <div className="sections-desktop-table" style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '4px',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(17, 18, 13, 0.02)',
      }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '25%' }}>Sección</th>
              <th style={{ width: '20%' }}>Alumnos</th>
              <th style={{ width: '20%' }}>Asistencia</th>
              <th style={{ width: '15%' }}>Estado</th>
              <th style={{ width: '20%', textAlign: 'right' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec, idx) => {
              const info = sessionsStatusMap[sec.id];
              const isTaken = info?.status === 'TAKEN';
              const ratio = isTaken && info.presentCount !== undefined
                ? `${info.presentCount}/${info.totalCount || sec.studentCount}`
                : '—';
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
                  <td style={{ fontWeight: 800, color: theme.badgeText }}>
                    <span style={{
                      display: 'inline-block',
                      backgroundColor: theme.badgeBg,
                      color: theme.badgeText,
                      border: `1px solid ${theme.border}`,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      letterSpacing: '0.02em',
                    }}>
                      {sec.displayName}
                    </span>
                  </td>
                  <td style={{ color: theme.badgeText, fontWeight: 500 }}>
                    {sec.studentCount} alumnos
                  </td>
                  <td style={{ color: theme.badgeText, fontWeight: 700 }}>
                    {ratio}
                  </td>
                  <td>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '2px',
                      backgroundColor: isTaken ? '#FFFFFF' : theme.badgeBg,
                      color: isTaken ? theme.accent : theme.badgeText,
                      border: `1px solid ${theme.border}`,
                      letterSpacing: '0.04em',
                    }}>
                      {isTaken ? '[✓] Registrada' : '[•] Pendiente'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      onClick={() => onSelectSection(sec)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        backgroundColor: isTaken ? '#FFFFFF' : theme.accent,
                        color: isTaken ? theme.accent : '#FFFFFF',
                        border: isTaken ? `1px solid ${theme.border}` : 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isTaken) e.currentTarget.style.opacity = '0.9';
                        else e.currentTarget.style.backgroundColor = theme.hoverBg;
                      }}
                      onMouseLeave={(e) => {
                        if (!isTaken) e.currentTarget.style.opacity = '1';
                        else e.currentTarget.style.backgroundColor = '#FFFFFF';
                      }}
                    >
                      {isTaken ? 'Ver / Editar' : 'Pasar lista →'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default SectionsView;
