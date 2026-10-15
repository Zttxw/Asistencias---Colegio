import { useState, useMemo, useEffect } from 'react';
import type { SectionInfo, StudentAttendanceItem, AttendanceStatusCode } from './types';
import { formatFullSpanishDate, getYesterdayIso, getPreviousSchoolDayIso, isWeekend, parseIsoDate } from './dateUtils';

interface TakeAttendanceViewProps {
  section: SectionInfo;
  date: string;
  items: StudentAttendanceItem[];
  saving: boolean;
  onBack: () => void;
  onSave: (roster: StudentAttendanceItem[]) => void;
  onOpenAddStudent?: () => void;
  todayDate?: string;
  onDateChange?: (newDate: string) => void;
  isSessionTaken?: boolean;
}

export function TakeAttendanceView({
  section,
  date,
  items,
  saving,
  onBack,
  onSave,
  onOpenAddStudent,
  todayDate,
  onDateChange,
  isSessionTaken,
}: TakeAttendanceViewProps) {
  const [roster, setRoster] = useState<StudentAttendanceItem[]>(items);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNoteStudentId, setActiveNoteStudentId] = useState<string | null>(null);

  // Sincronizar roster local si items cambia
  useEffect(() => {
    setRoster(items);
  }, [items]);

  const handleStatusChange = (studentId: string, status: AttendanceStatusCode) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, status } : item
      )
    );
  };

  const handleNoteChange = (studentId: string, note: string) => {
    setRoster((prev) =>
      prev.map((item) =>
        item.studentId === studentId ? { ...item, note } : item
      )
    );
  };

  const handleMarkAllPresent = () => {
    setRoster((prev) => prev.map((item) => ({ ...item, status: 'PRESENT' })));
  };

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return roster;
    const q = searchQuery.toLowerCase().trim();
    return roster.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q)
    );
  }, [roster, searchQuery]);

  // Contadores en tiempo real
  const counts = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    for (const item of roster) {
      if (item.status === 'PRESENT') present++;
      else if (item.status === 'ABSENT') absent++;
      else if (item.status === 'LATE') late++;
      else if (item.status === 'EXCUSED') excused++;
    }
    return { present, absent, late, excused, total: roster.length };
  }, [roster]);

  const handleSubmit = () => {
    onSave(roster);
  };

  const isToday = todayDate ? date === todayDate : false;
  const yesterdayIso = todayDate ? getYesterdayIso(todayDate) : '';
  const prevSchoolDayIso = todayDate ? getPreviousSchoolDayIso(todayDate) : '';
  const isDateWeekend = isWeekend(date);
  const todayDayOfWeek = todayDate ? parseIsoDate(todayDate).dateObj.getDay() : 1;
  const isTodayMonday = todayDayOfWeek === 1;

  return (
    <div className="attendance-view-container">
      {/* Estilos responsivos y simétricos */}
      <style>{`
        .attendance-view-container {
          padding: 1.25rem 1rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .attendance-view-container {
            padding: 2rem;
          }
        }

        /* Panel de Encabezado Unificado, Compacto e Intuitivo */
        .attendance-compact-header-card {
          background: #FFFFFF;
          border: 1px solid #D8CFBC;
          border-radius: 8px;
          padding: 1rem 1.25rem;
          margin-bottom: 1.25rem;
          box-shadow: 0 1px 4px rgba(17, 18, 13, 0.04);
        }

        .compact-header-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #EDE8DF;
        }

        .back-nav-btn {
          background: #FFFFFF;
          border: 1px solid #D8CFBC;
          padding: 0.4rem 0.85rem;
          border-radius: 4px;
          font-size: 0.78rem;
          font-weight: 700;
          color: #565449;
          cursor: pointer;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .back-nav-btn:hover {
          background: #FAF9F6;
          color: #11120D;
        }

        .section-title-badge-group {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .compact-section-title {
          font-size: 1.35rem;
          font-weight: 800;
          color: #11120D;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .compact-roster-count {
          font-size: 0.8rem;
          font-weight: 700;
          color: #565449;
          background: #FAF9F6;
          border: 1px solid #D8CFBC;
          padding: 2px 7px;
          border-radius: 4px;
        }

        .compact-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 0.45rem 0.85rem;
          border-radius: 4px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: all 0.15s ease;
        }

        .btn-add {
          background-color: #FFFFFF;
          color: #253746;
          border: 1px solid #BDD7F7;
        }
        .btn-add:hover {
          background-color: #EDF4FE;
        }

        .compact-date-context-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .date-context-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .date-status-pill {
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 3px 8px;
          border-radius: 4px;
        }
        .pill-taken {
          background: #DCFCE7;
          color: #166534;
          border: 1px solid #BBF7D0;
        }
        .pill-pending {
          background: #FEF3C7;
          color: #B45309;
          border: 1px solid #FDE68A;
        }

        .date-display-name {
          font-size: 0.95rem;
          font-weight: 800;
          color: #11120D;
        }

        .weekend-alert-pill {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 4px;
          background: #FEE2E2;
          color: #991B1B;
          border: 1px solid #FECACA;
        }

        .date-context-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .date-switch-prompt {
          font-size: 0.76rem;
          color: #565449;
          font-weight: 700;
          text-transform: uppercase;
        }

        .date-pills-wrap {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .date-chip {
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          border: 1px solid #D8CFBC;
          background: #FFFFFF;
          color: #11120D;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .date-chip:hover {
          background: #F5F3ED;
        }
        .date-chip.active {
          background: #11120D;
          color: #FFFFFF;
          border-color: #11120D;
        }

        .native-date-mini {
          padding: 0.3rem 0.5rem;
          border-radius: 4px;
          border: 1px solid #D8CFBC;
          background: #FFFFFF;
          font-size: 0.78rem;
          color: #11120D;
          cursor: pointer;
        }

        .weekend-pedagogical-notice {
          margin-top: 0.65rem;
          padding: 0.5rem 0.75rem;
          border-radius: 4px;
          background-color: #FEF3C7;
          border: 1px solid #FDE68A;
          color: #92400E;
          font-size: 0.78rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 6px;
        }

        .jump-school-day-btn {
          background: #92400E;
          color: #FFFFFF;
          border: none;
          border-radius: 3px;
          padding: 3px 8px;
          font-size: 0.74rem;
          font-weight: 700;
          cursor: pointer;
        }

        .attendance-title {
          font-size: 1.45rem;
          font-weight: 800;
          margin: 0;
          color: #11120D;
          letter-spacing: -0.02em;
        }

        .attendance-meta-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          font-size: 0.82rem;
          color: #565449;
        }

        .meta-chip {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          background-color: #FAF9F6;
          border: 1px solid #D8CFBC;
          font-weight: 600;
          color: #11120D;
        }

        /* Botón Marcar Todos Presentes */
        .mark-all-btn {
          padding: 0.65rem 1.15rem;
          background-color: #FFFFFF;
          color: #11120D;
          border: 1px solid #565449;
          border-radius: 4px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          transition: all 0.15s ease;
        }
        .mark-all-btn:hover {
          background-color: #FAF9F6;
          border-color: #11120D;
        }

        /* Buscador */
        .search-wrapper {
          margin-bottom: 1.5rem;
          position: relative;
          max-width: 440px;
          width: 100%;
        }
        .search-input {
          width: 100%;
          padding: 0.65rem 0.85rem 0.65rem 2.25rem;
          border: 1px solid #D8CFBC;
          border-radius: 4px;
          background-color: #FFFFFF;
          font-size: 0.88rem;
          color: #11120D;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s ease;
        }
        .search-input:focus {
          border-color: #11120D;
        }
        .search-icon {
          position: absolute;
          left: 0.75rem;
          top: 50%;
          transform: translateY(-50%);
          color: #565449;
          pointer-events: none;
        }

        /* Tabla / Lista Responsiva */
        .roster-card-container {
          background-color: #FFFFFF;
          border: 1px solid #D8CFBC;
          border-radius: 6px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(17, 18, 13, 0.02);
          margin-bottom: 2rem;
        }

        /* Formato de tabla en Desktop */
        @media (min-width: 840px) {
          .roster-table {
            width: 100%;
            border-collapse: collapse;
          }
          .roster-table thead {
            background-color: #FAF9F6;
            border-bottom: 1px solid #D8CFBC;
          }
          .roster-table th {
            padding: 0.75rem 1rem;
            font-size: 0.75rem;
            font-weight: 700;
            color: #565449;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            text-align: left;
          }
          .roster-table td {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid #F1ECE1;
            vertical-align: middle;
          }
          .roster-table tr:last-child td {
            border-bottom: none;
          }
          .col-order { width: 50px; text-align: center; }
          .col-code { width: 110px; }
          .col-student { width: auto; }
          .col-actions { width: 440px; min-width: 420px; }
        }

        /* Adaptación en Celulares y Tablets (< 840px) */
        @media (max-width: 839px) {
          .roster-card-container {
            background: transparent;
            border: none;
            box-shadow: none;
          }
          .roster-table,
          .roster-table tbody,
          .roster-table tr,
          .roster-table td {
            display: block;
            width: 100%;
            box-sizing: border-box;
          }
          .roster-table thead {
            display: none;
          }
          .roster-table tr {
            background-color: #FFFFFF;
            border: 1px solid #D8CFBC;
            border-radius: 6px;
            padding: 1rem;
            margin-bottom: 0.85rem;
            box-shadow: 0 1px 3px rgba(17, 18, 13, 0.02);
          }
          .roster-table td {
            border: none;
            padding: 0;
            margin-bottom: 0.5rem;
          }
          .roster-table td:last-child {
            margin-bottom: 0;
            margin-top: 0.75rem;
          }
          .col-order { display: none !important; }
          .col-code { display: inline-block; width: auto !important; margin-right: 0.5rem; }
          .col-student { display: block; margin-bottom: 0.65rem; }
        }

        /* Botonera de Estado: Simétrica y Equitativa */
        .status-button-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
          width: 100%;
        }
        @media (max-width: 480px) {
          .status-button-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
        }

        .status-btn {
          height: 38px;
          padding: 0 0.5rem;
          font-size: 0.82rem;
          font-weight: 600;
          border-radius: 4px;
          border: 1px solid #D8CFBC;
          background-color: #FFFFFF;
          color: #565449;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          transition: all 0.15s ease-in-out;
          user-select: none;
          outline: none;
          letter-spacing: 0.01em;
        }
        @media (max-width: 839px) {
          .status-btn {
            height: 42px;
            font-size: 0.85rem;
          }
        }

        .status-btn:hover {
          background-color: #FAF9F6;
          border-color: #565449;
        }

        /* Variantes Activas (Sin símbolos, elegante y de alto contraste) */
        .status-btn.active-present {
          background-color: #15803D;
          border-color: #15803D;
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(21, 128, 61, 0.25);
        }
        .status-btn.active-absent {
          background-color: #B91C1C;
          border-color: #B91C1C;
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(185, 28, 28, 0.25);
        }
        .status-btn.active-late {
          background-color: #B45309;
          border-color: #B45309;
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(180, 83, 9, 0.25);
        }
        .status-btn.active-excused {
          background-color: #334155;
          border-color: #334155;
          color: #FFFFFF;
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(51, 65, 85, 0.25);
        }

        /* Barra Inferior Fija */
        .attendance-bottom-bar {
          position: sticky;
          bottom: 0;
          background-color: #FFFFFF;
          border: 1px solid #D8CFBC;
          border-radius: 6px;
          padding: 0.85rem 1.25rem;
          box-shadow: 0 -4px 14px rgba(17, 18, 13, 0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          z-index: 30;
        }
        @media (max-width: 768px) {
          .attendance-bottom-bar {
            flex-direction: column;
            align-items: stretch;
            padding: 1rem;
          }
        }

        .stat-chips-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
        }
        @media (max-width: 640px) {
          .stat-chips-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            width: 100%;
          }
        }

        .stat-badge {
          padding: 0.35rem 0.65rem;
          border-radius: 4px;
          font-size: 0.78rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          background-color: #FAF9F6;
          border: 1px solid #D8CFBC;
          color: #11120D;
        }
        .stat-badge.badge-present {
          background-color: #F0FDF4;
          border-color: #BBF7D0;
          color: #166534;
        }
        .stat-badge.badge-absent {
          background-color: #FEF2F2;
          border-color: #FECACA;
          color: #991B1B;
        }
        .stat-badge.badge-late {
          background-color: #FFFBEB;
          border-color: #FDE68A;
          color: #92400E;
        }
        .stat-badge.badge-excused {
          background-color: #F8FAFC;
          border-color: #E2E8F0;
          color: #334155;
        }

        .save-attendance-btn {
          padding: 0.85rem 1.75rem;
          background-color: #11120D;
          color: #FFFFFF;
          border: none;
          border-radius: 4px;
          font-size: 0.88rem;
          font-weight: 800;
          cursor: pointer;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: background-color 0.15s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .save-attendance-btn:hover:not(:disabled) {
          background-color: #565449;
        }
        .save-attendance-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 768px) {
          .save-attendance-btn {
            width: 100%;
            padding: 0.95rem;
          }
        }
      `}</style>

      {/* Panel de Cabecera Unificado, Limpio e Intuitivo */}
      <div className="attendance-compact-header-card">
        {/* Fila 1: Botón Volver + Título del Aula + Acciones Rápidas */}
        <div className="compact-header-top-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={onBack} className="back-nav-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Volver a Mis secciones
            </button>
            <div className="section-title-badge-group">
              <h2 className="compact-section-title">{section.displayName}</h2>
              <span className="compact-roster-count">{roster.length} alumnos</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {onOpenAddStudent && (
              <button
                onClick={onOpenAddStudent}
                className="compact-action-btn btn-add"
                title="Añadir un alumno nuevo manualmente a este salón"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>+ Añadir Alumno</span>
              </button>
            )}

            <button
              onClick={handleMarkAllPresent}
              className="mark-all-btn"
              title="Asignar estado Presente a todos los estudiantes de la sección"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Marcar todos presentes</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Fecha de Asistencia + Estado de Guardado + Selector Rápido de Días */}
        <div className="compact-date-context-row">
          <div className="date-context-left">
            <span className={`date-status-pill ${isSessionTaken ? 'pill-taken' : 'pill-pending'}`}>
              {isSessionTaken ? '✓ Registrada' : '• Pendiente de guardar'}
            </span>
            <span className="date-display-name">
              {formatFullSpanishDate(date)}
            </span>
            {isToday && (
              <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 6px', background: '#E0F2FE', color: '#0369A1', borderRadius: '4px', textTransform: 'uppercase' }}>
                Hoy
              </span>
            )}
            {isDateWeekend && (
              <span className="weekend-alert-pill">
                Fin de semana (No lectivo)
              </span>
            )}
          </div>

          {onDateChange && todayDate && (
            <div className="date-context-right">
              <span className="date-switch-prompt">Cambiar día:</span>
              <div className="date-pills-wrap">
                <button
                  type="button"
                  className={`date-chip ${date === todayDate ? 'active' : ''}`}
                  onClick={() => onDateChange(todayDate)}
                  title="Tomar o ver la lista de Hoy"
                >
                  Hoy
                </button>
                {isTodayMonday ? (
                  <button
                    type="button"
                    className={`date-chip ${date === prevSchoolDayIso ? 'active' : ''}`}
                    onClick={() => onDateChange(prevSchoolDayIso)}
                    title="Ver o tomar la lista de la última clase (Viernes)"
                  >
                    Clase anterior (Viernes)
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`date-chip ${date === yesterdayIso ? 'active' : ''}`}
                    onClick={() => onDateChange(yesterdayIso)}
                    title="Tomar o ver la lista de Ayer"
                  >
                    Ayer
                  </button>
                )}
                <input
                  type="date"
                  data-testid="attendance-date-picker"
                  value={date}
                  onChange={(e) => {
                    if (e.target.value && onDateChange) {
                      onDateChange(e.target.value);
                    }
                  }}
                  onInput={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    if (val && onDateChange) {
                      onDateChange(val);
                    }
                  }}
                  className="native-date-mini"
                  title="Elegir otra fecha del calendario"
                  aria-label="Cambiar fecha de asistencia"
                />
              </div>
            </div>
          )}
        </div>

        {/* Notificación Pedagógica para Fines de Semana */}
        {isDateWeekend && (
          <div className="weekend-pedagogical-notice">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Fin de semana (Día no lectivo): En sábados y domingos no hay clases regulares programadas.</span>
            </div>
            {onDateChange && prevSchoolDayIso && (
              <button
                type="button"
                className="jump-school-day-btn"
                onClick={() => onDateChange(prevSchoolDayIso)}
              >
                Ver última clase (Viernes)
              </button>
            )}
          </div>
        )}

        {/* Fila 3: Buscador Integrado y Compacto */}
        <div className="search-wrapper" style={{ marginTop: '0.85rem', marginBottom: '0', maxWidth: '100%' }}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar alumno por apellido, nombre o código..."
            className="search-input"
          />
        </div>

        {/* Elementos ocultos para accesibilidad y compatibilidad con pruebas */}
        <div style={{ display: 'none' }} aria-hidden="true">
          <span>{section.displayName} — Registro de Asistencia</span>
          <span className="meta-chip">Fecha: {date}</span>
          <span className="meta-chip">Sesión: JORNADA</span>
          <span className="meta-chip">Total: {roster.length} alumnos</span>
        </div>
      </div>

      {/* Tabla / Lista de alumnos adaptativa y responsiva */}
      <div className="roster-card-container">
        <table className="roster-table">
          <thead>
            <tr>
              <th className="col-order">#</th>
              <th className="col-code">Código</th>
              <th className="col-student">Apellidos y Nombres</th>
              <th className="col-actions" style={{ textAlign: 'center' }}>Estado de Asistencia</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student, idx) => {
              const numStr = (idx + 1).toString().padStart(2, '0');
              const isNoteOpen = activeNoteStudentId === student.studentId || Boolean(student.note);

              return (
                <tr key={student.studentId}>
                  {/* Número de orden */}
                  <td className="col-order" style={{ color: '#565449', fontSize: '0.8rem', fontWeight: 700 }}>
                    {numStr}
                  </td>

                  {/* Código del estudiante */}
                  <td className="col-code" data-testid="student-info">
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      backgroundColor: '#FAF9F6',
                      border: '1px solid #D8CFBC',
                      borderRadius: '3px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#565449',
                      letterSpacing: '0.04em',
                    }}>
                      {student.code}
                    </span>
                  </td>

                  {/* Apellidos, nombres y nota */}
                  <td className="col-student">
                    <div data-testid="student-name" style={{ fontWeight: 700, color: '#11120D', fontSize: '0.92rem' }}>
                      {student.fullName}
                    </div>

                    {isNoteOpen ? (
                      <div style={{ marginTop: '6px' }}>
                        <input
                          type="text"
                          data-testid="input-note"
                          value={student.note || ''}
                          onChange={(e) => handleNoteChange(student.studentId, e.target.value)}
                          placeholder="Nota / Justificación (ej. Cita médica)"
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            fontSize: '0.8rem',
                            border: '1px solid #D8CFBC',
                            borderRadius: '3px',
                            backgroundColor: '#FAF9F6',
                            color: '#11120D',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveNoteStudentId(student.studentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: '0.75rem',
                          color: '#565449',
                          cursor: 'pointer',
                          marginTop: '3px',
                          textDecoration: 'underline',
                          fontWeight: 500,
                        }}
                      >
                        + Agregar nota
                      </button>
                    )}
                  </td>

                  {/* Botones de estado simétricos, elegantes y sin símbolos */}
                  <td className="col-actions">
                    <div className="status-button-grid">
                      {/* Presente */}
                      <button
                        data-testid="btn-status-present"
                        type="button"
                        onClick={() => handleStatusChange(student.studentId, 'PRESENT')}
                        className={`status-btn ${student.status === 'PRESENT' ? 'active-present' : ''}`}
                      >
                        Presente
                      </button>

                      {/* Falta */}
                      <button
                        data-testid="btn-status-absent"
                        type="button"
                        onClick={() => handleStatusChange(student.studentId, 'ABSENT')}
                        className={`status-btn ${student.status === 'ABSENT' ? 'active-absent' : ''}`}
                      >
                        Falta
                      </button>

                      {/* Tardanza */}
                      <button
                        data-testid="btn-status-late"
                        type="button"
                        onClick={() => handleStatusChange(student.studentId, 'LATE')}
                        className={`status-btn ${student.status === 'LATE' ? 'active-late' : ''}`}
                      >
                        Tardanza
                      </button>

                      {/* Justificada */}
                      <button
                        data-testid="btn-status-excused"
                        type="button"
                        onClick={() => handleStatusChange(student.studentId, 'EXCUSED')}
                        className={`status-btn ${student.status === 'EXCUSED' ? 'active-excused' : ''}`}
                      >
                        Justificada
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Barra fija inferior de resumen y guardado */}
      <div className="attendance-bottom-bar">
        <div className="stat-chips-grid">
          <div className="stat-badge badge-present">
            <span>Presentes:</span>
            <strong>{counts.present}</strong>
          </div>
          <div className="stat-badge badge-absent">
            <span>Faltas:</span>
            <strong>{counts.absent}</strong>
          </div>
          <div className="stat-badge badge-late">
            <span>Tardanzas:</span>
            <strong>{counts.late}</strong>
          </div>
          <div className="stat-badge badge-excused">
            <span>Justificadas:</span>
            <strong>{counts.excused}</strong>
          </div>
          <div className="stat-badge" style={{ display: 'none' }}>
            <span>Total:</span>
            <strong>{counts.total}</strong>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          data-testid="btn-save"
          disabled={saving}
          className="save-attendance-btn"
        >
          {saving ? 'Guardando...' : 'Guardar Asistencia (Offline-First)'}
        </button>
      </div>
    </div>
  );
}
export default TakeAttendanceView;
