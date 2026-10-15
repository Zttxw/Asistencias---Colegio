import type { AuthUser } from './types';

export type ActiveTab = 'home' | 'sections' | 'take_attendance' | 'history' | 'auxiliary_daily' | 'reports' | 'exports' | 'admin' | 'attendance_detail';

interface SidebarProps {
  user: AuthUser;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Iconos vectoriales minimalistas sobrios (0 emojis)
const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IconSections = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconClipboard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <path d="m9 14 2 2 4-4"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/>
    <line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
  </svg>
);

const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" x2="18" y1="20" y2="10"/>
    <line x1="12" x2="12" y1="20" y2="4"/>
    <line x1="6" x2="6" y1="20" y2="14"/>
  </svg>
);

const IconAdmin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

export function Sidebar({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const roleName = user.role === 'TEACHER' ? 'Docente de Aula' : user.role === 'AUXILIARY' ? 'Auxiliar de Educación' : 'Administrador';

  const menuItems = (() => {
    if (user.role === 'TEACHER') {
      return [
        { id: 'home' as ActiveTab, label: 'Inicio', icon: <IconHome /> },
        { id: 'sections' as ActiveTab, label: 'Mis secciones', icon: <IconSections /> },
        { id: 'take_attendance' as ActiveTab, label: 'Pasar lista', icon: <IconClipboard /> },
        { id: 'history' as ActiveTab, label: 'Historial', icon: <IconCalendar /> },
      ];
    }
    if (user.role === 'AUXILIARY') {
      // El auxiliar únicamente puede ver el reporte de alumnos faltantes o con alguna tardanza
      return [
        { id: 'auxiliary_daily' as ActiveTab, label: 'Faltas y Tardanzas', icon: <IconClipboard /> },
      ];
    }
    // ADMIN
    return [
      { id: 'admin' as ActiveTab, label: 'Panel General', icon: <IconAdmin /> },
      { id: 'sections' as ActiveTab, label: 'Aulas y Secciones', icon: <IconSections /> },
      { id: 'auxiliary_daily' as ActiveTab, label: 'Faltas y Tardanzas', icon: <IconClipboard /> },
      { id: 'reports' as ActiveTab, label: 'Reportes y Padrón', icon: <IconChart /> },
    ];
  })();

  const handleItemClick = (id: ActiveTab) => {
    onSelectTab(id);
    onClose?.();
  };

  return (
    <>
      {/* Telón de fondo (Backdrop) exclusivo para celular cuando el menú está abierto */}
      {isOpen && (
        <div
          onClick={onClose}
          className="sidebar-backdrop"
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar-container ${isOpen ? 'open' : ''}`}
        style={{
          backgroundColor: '#253746',
          color: '#FFFFFF',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        {/* Brand Header con botón de cerrar */}
        <div style={{
          padding: '1.4rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: '1.05rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#FFFFFF',
              textTransform: 'uppercase',
              marginBottom: '2px',
            }}>
              ASISTENCIA
            </div>
            <div style={{
              fontSize: '0.72rem',
              color: '#BAC7D5',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              I.E. Piloto Chumbivilcas
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              type="button"
              className="sidebar-close-btn"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: '4px',
                color: '#BAC7D5',
                width: '28px',
                height: '28px',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#FFFFFF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#BAC7D5';
              }}
              title="Cerrar barra lateral"
              aria-label="Cerrar barra lateral"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

      {/* Menú de Navegación */}
      <nav style={{ flex: 1, padding: '1.25rem 0.75rem' }}>
        <div style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: '#BAC7D5',
          padding: '0.35rem 0.65rem',
          marginBottom: '0.35rem',
        }}>
          {user.role === 'AUXILIARY' ? 'Supervisión' : 'Menú'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '0.6rem 0.75rem',
                  backgroundColor: isActive ? 'rgba(0, 0, 0, 0.28)' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#D0DCE5',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 700 : 500,
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: isActive ? '#FFFFFF' : '#BAC7D5' }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Perfil de Usuario en Pie */}
      <div style={{
        padding: '1.25rem 1.25rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: '#1C2B37',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#FFFFFF' }}>
              {user.fullName || user.username}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#BAC7D5', marginTop: '1px' }}>
              {roleName}
            </div>
          </div>
          <span style={{
            fontSize: '0.65rem',
            padding: '2px 6px',
            backgroundColor: user.role === 'AUXILIARY' ? '#3B556E' : 'rgba(255, 255, 255, 0.15)',
            color: '#FFFFFF',
            borderRadius: '2px',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}>
            {user.role === 'AUXILIARY' ? 'SUPERVISIÓN' : user.role}
          </span>
        </div>

        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '0.45rem',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            color: '#D0DCE5',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            textAlign: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#D0DCE5';
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
    </>
  );
}
export default Sidebar;
