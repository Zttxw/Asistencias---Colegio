import type { SectionInfo } from './types';
import { formatFriendlyHumanDate } from './dateUtils';

interface AttendanceDetailViewProps {
  section: SectionInfo;
  date: string;
  counts: { present: number; absent: number; late: number; excused: number; total: number };
  onEdit: () => void;
  onBackToSections: () => void;
  todayDate?: string;
}

export function AttendanceDetailView({
  section,
  date,
  counts,
  onEdit,
  onBackToSections,
  todayDate,
}: AttendanceDetailViewProps) {
  return (
    <div style={{ padding: '2.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '4px',
        padding: '2.5rem 2rem',
        boxShadow: '0 2px 8px rgba(17, 18, 13, 0.03)',
      }}>
        {/* Cabecera limpia y elegante */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#15803D',
            marginBottom: '0.75rem',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{
            fontSize: '1.35rem',
            fontWeight: 800,
            color: '#11120D',
            margin: '0 0 0.25rem 0',
            letterSpacing: '-0.01em',
          }}>
            Asistencia Registrada
          </h2>
          <div style={{ fontSize: '0.88rem', color: '#166534', fontWeight: 700, marginTop: '2px' }}>
            {formatFriendlyHumanDate(date, todayDate || date)}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#565449', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px' }}>
            {section.displayName} · Jornada Escolar
          </div>

          {/* Banner de tranquilidad y confirmación para el docente */}
          <div style={{
            marginTop: '1rem',
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.86rem', color: '#166534', fontWeight: 700 }}>
              ✓ La lista ha sido guardada correctamente
            </div>
            <div style={{ fontSize: '0.78rem', color: '#15803D', marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>Respaldo seguro guardado en la memoria de este equipo y listo para el registro del colegio.</span>
            </div>
          </div>
        </div>

        {/* Resumen numérico */}
        <div style={{
          backgroundColor: '#FAF9F6',
          border: '1px solid #D8CFBC',
          borderRadius: '4px',
          padding: '1.25rem',
          marginBottom: '1.75rem',
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#565449', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Consolidado ({counts.total} alumnos)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #D8CFBC' }}>
              <span style={{ fontSize: '0.75rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>Presentes</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#11120D', marginTop: '2px' }}>{counts.present}</div>
            </div>
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #D8CFBC' }}>
              <span style={{ fontSize: '0.75rem', color: '#991B1B', textTransform: 'uppercase', fontWeight: 700 }}>Faltas</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#565449', marginTop: '2px' }}>{counts.absent}</div>
            </div>
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #D8CFBC' }}>
              <span style={{ fontSize: '0.75rem', color: '#B45309', textTransform: 'uppercase', fontWeight: 700 }}>Tardanzas</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#11120D', marginTop: '2px' }}>{counts.late}</div>
            </div>
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #D8CFBC' }}>
              <span style={{ fontSize: '0.75rem', color: '#334155', textTransform: 'uppercase', fontWeight: 700 }}>Justificadas</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#565449', marginTop: '2px' }}>{counts.excused}</div>
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <button
            onClick={onEdit}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#FFFFFF',
              color: '#11120D',
              border: '1px solid #11120D',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FAF9F6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
          >
            Corregir asistencia
          </button>

          <button
            onClick={onBackToSections}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#11120D',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#565449'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#11120D'}
          >
            Volver a Mis secciones
          </button>
        </div>
      </div>
    </div>
  );
}
export default AttendanceDetailView;
