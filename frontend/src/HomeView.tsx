import type { AuthUser, SectionInfo } from './types';
import { getSectionTheme } from './themeUtils';
import { formatFullSpanishDate, getRelativeLabel, getYesterdayIso, getPreviousSchoolDayIso, isWeekend, parseIsoDate } from './dateUtils';

interface HomeViewProps {
  user: AuthUser;
  sections: SectionInfo[];
  todayDate: string;
  selectedDate?: string;
  onDateChange?: (newDate: string) => void;
  onGoToSection: (section: SectionInfo) => void;
  sessionsStatusMap: Record<string, 'PENDING' | 'TAKEN'>;
  sessionsFullMap?: Record<string, { status: 'PENDING' | 'TAKEN'; presentCount?: number; totalCount?: number }>;
  onOpenUploadModal?: () => void;
  onOpenAddStudentModal?: () => void;
  onRefreshRoster?: () => void;
}

export function HomeView({
  user,
  sections,
  todayDate,
  selectedDate,
  onDateChange,
  onGoToSection,
  sessionsStatusMap,
  sessionsFullMap,
}: HomeViewProps) {
  const teacherName = user.fullName || user.username;
  const activeDate = selectedDate || todayDate;
  const relativeLabel = getRelativeLabel(activeDate, todayDate);
  const isToday = activeDate === todayDate;
  const isYesterday = relativeLabel === 'Ayer';
  const yesterdayIso = getYesterdayIso(todayDate);
  const isDateWeekend = isWeekend(activeDate);
  const todayDayOfWeek = todayDate ? parseIsoDate(todayDate).dateObj.getDay() : 1;
  const isTodayMonday = todayDayOfWeek === 1;
  const prevSchoolDayIso = getPreviousSchoolDayIso(todayDate);

  return (
    <div className="salon-view-container">
      <style>{`
        .home-teacher-date-card {
          background: #FFFFFF;
          border: 1px solid #D8CFBC;
          border-left: 5px solid #1A73E8;
          border-radius: 8px;
          padding: 1rem 1.25rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 4px rgba(17, 18, 13, 0.04);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .home-date-card-left {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .home-date-card-badge-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .date-badge-pill {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .pill-today {
          background: #E8F0FE;
          color: #1A73E8;
          border: 1px solid #BDD7F7;
        }
        .pill-yesterday {
          background: #FEF3C7;
          color: #B45309;
          border: 1px solid #FDE68A;
        }
        .pill-custom {
          background: #F3F4F6;
          color: #374151;
          border: 1px solid #D1D5DB;
        }
        .home-date-card-title {
          font-size: 1.15rem;
          font-weight: 800;
          color: #11120D;
        }
        .home-date-card-hint {
          font-size: 0.82rem;
          color: #565449;
        }
        .home-date-card-controls {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .home-date-switch-label {
          font-size: 0.78rem;
          color: #565449;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .home-date-switch-buttons {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .home-date-pill-btn {
          padding: 0.4rem 0.85rem;
          border-radius: 4px;
          border: 1px solid #D8CFBC;
          background: #FFFFFF;
          color: #11120D;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .home-date-pill-btn:hover {
          background: #F5F3ED;
        }
        .home-date-pill-btn.active {
          background: #11120D;
          color: #FFFFFF;
          border-color: #11120D;
        }
        .home-date-native-input {
          padding: 0.35rem 0.6rem;
          border-radius: 4px;
          border: 1px solid #D8CFBC;
          background: #FFFFFF;
          font-size: 0.8rem;
          color: #11120D;
          cursor: pointer;
        }
      `}</style>

      {/* Saludo y bienvenida (visible en PC para contexto institucional) */}
      <div className="home-greeting-banner" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: '#11120D',
          margin: '0 0 0.35rem 0',
          letterSpacing: '-0.02em',
        }}>
          Buenos días, {teacherName}
        </h2>
        <div style={{ fontSize: '0.85rem', color: '#565449', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Jornada Escolar · {todayDate}
        </div>
      </div>

      {/* Selector y Auditoría de Fechas para el Docente */}
      <div className="home-teacher-date-card" style={{ borderLeftColor: isDateWeekend ? '#DC2626' : undefined }}>
        <div className="home-date-card-left">
          <div className="home-date-card-badge-row">
            <span
              className={`date-badge-pill ${isToday ? 'pill-today' : isYesterday ? 'pill-yesterday' : 'pill-custom'}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: isDateWeekend ? '#FEF2F2' : undefined,
                color: isDateWeekend ? '#991B1B' : undefined,
                borderColor: isDateWeekend ? '#FECACA' : undefined,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>
                {isToday
                  ? 'HOY'
                  : isDateWeekend
                  ? 'FIN DE SEMANA (NO LECTIVO)'
                  : isYesterday
                  ? 'AYER'
                  : activeDate === prevSchoolDayIso
                  ? 'CLASE ANTERIOR'
                  : 'FECHA CONSULTADA'}
              </span>
            </span>
            <span className="home-date-card-title">
              {formatFullSpanishDate(activeDate)}
            </span>
          </div>
          <div className="home-date-card-hint">
            {isDateWeekend ? (
              <span style={{ color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Fin de semana (Día no lectivo). En sábados y domingos no hay jornada escolar programada.</span>
                {onDateChange && prevSchoolDayIso && (
                  <button
                    type="button"
                    onClick={() => onDateChange(prevSchoolDayIso)}
                    style={{
                      background: '#991B1B',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '2px 8px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Ver última clase (Viernes)
                  </button>
                )}
              </span>
            ) : isToday ? (
              <span>Estado de la lista de <strong>hoy</strong>. Los salones con marca verde ya fueron guardados; los salones pendientes requieren pasar lista.</span>
            ) : isYesterday ? (
              <span>Revisando la lista de <strong>ayer</strong>. Comprueba si tus listas quedaron guardadas o pasa lista a las pendientes.</span>
            ) : activeDate === prevSchoolDayIso ? (
              <span>Revisando la última jornada escolar (<strong>Viernes</strong>).</span>
            ) : (
              <span>Revisando el historial de asistencia para esta fecha.</span>
            )}
          </div>
        </div>

        {onDateChange && (
          <div className="home-date-card-controls">
            <span className="home-date-switch-label">Ver otro día:</span>
            <div className="home-date-switch-buttons">
              <button
                type="button"
                className={`home-date-pill-btn ${activeDate === todayDate ? 'active' : ''}`}
                onClick={() => onDateChange(todayDate)}
                title="Ver lista de Hoy"
              >
                Hoy
              </button>
              {isTodayMonday ? (
                <button
                  type="button"
                  className={`home-date-pill-btn ${activeDate === prevSchoolDayIso ? 'active' : ''}`}
                  onClick={() => onDateChange(prevSchoolDayIso)}
                  title="Ver lista de la última clase (Viernes)"
                >
                  Clase anterior (Viernes)
                </button>
              ) : (
                <button
                  type="button"
                  className={`home-date-pill-btn ${activeDate === yesterdayIso ? 'active' : ''}`}
                  onClick={() => onDateChange(yesterdayIso)}
                  title="Ver lista de Ayer"
                >
                  Ayer
                </button>
              )}
              <div className="home-date-picker-wrap">
                <input
                  type="date"
                  value={activeDate}
                  onChange={(e) => e.target.value && onDateChange(e.target.value)}
                  onInput={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val && onDateChange) onDateChange(val);
                  }}
                  className="home-date-native-input"
                  title="Elegir otra fecha del calendario"
                  aria-label="Seleccionar fecha"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sección principal de Aulas */}
      <div style={{ marginBottom: '2rem' }}>
        <div className="home-sections-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <div style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#565449',
          }}>
            Mis Secciones ({sections.length})
          </div>
        </div>

        {/* Cuadrícula de salones: centrada, cuadrada y no muy ancha en modo celular */}
        <div className="salon-cards-grid">
          {sections.map((sec, idx) => {
            const info = sessionsFullMap?.[sec.id];
            const isTaken = sessionsStatusMap[sec.id] === 'TAKEN' || info?.status === 'TAKEN';
            const ratio = isTaken && info?.presentCount !== undefined
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
                {/* Cabecera distintiva del salón */}
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
                    {isTaken ? '[✓] Registrada' : '[•] Pendiente'}
                  </span>
                </div>

                {/* Cuerpo del salón con proporción cuadrada, centrado y amigable */}
                <div
                  className="salon-card-body"
                  style={{ backgroundColor: theme.bg }}
                >
                  <div style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: theme.badgeBg,
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.badgeText,
                      marginBottom: '0.35rem',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </div>

                    <div style={{
                      fontSize: '0.88rem',
                      color: theme.badgeText,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                    }}>
                      {sec.studentCount} alumnos
                    </div>

                    {/* Claridad de guardado y tranquilidad para el docente */}
                    <div style={{
                      marginTop: '6px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      backgroundColor: isTaken ? '#DCFCE7' : '#FEF3C7',
                      color: isTaken ? '#166534' : '#92400E',
                      border: `1px solid ${isTaken ? '#BBF7D0' : '#FDE68A'}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      textAlign: 'center',
                    }}>
                      {isTaken ? (
                        <>
                          <span>✓</span>
                          <span>Guardada {ratio ? `(${ratio})` : ''}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '8px' }}>●</span>
                          <span>Pendiente de lista</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Botón táctil optimizado */}
                  <button
                    onClick={() => onGoToSection(sec)}
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
                    <span>{isTaken ? 'Ver / Corregir' : 'Pasar lista'}</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
export default HomeView;
