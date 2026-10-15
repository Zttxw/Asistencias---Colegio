interface HeaderProps {
  title: string;
  subtitle?: string;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingCount: number;
  lastSyncMsg: string;
  isOnline: boolean;
  onRetrySync: () => void;
  serverDate?: string;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

function formatFriendlyDate(dateStr: string) {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (!year || !month || !day) return dateStr;
    const dateObj = new Date(year, month - 1, day);
    const dayNames = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];
    const monthNames = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    const dayName = dayNames[dateObj.getDay()];
    const monthName = monthNames[month - 1];
    return `${dayName} ${day} de ${monthName}, ${year}`;
  } catch {
    return dateStr;
  }
}

export function Header({
  title,
  subtitle,
  syncStatus,
  pendingCount,
  lastSyncMsg: _lastSyncMsg,
  isOnline,
  onRetrySync,
  serverDate,
  onToggleSidebar,
}: HeaderProps) {
  const formattedDate = serverDate || new Date().toISOString().split('T')[0];

  return (
    <header className="app-main-header">
      {/* Título de la vista actual con botón de 3 rayas (Hamburguesa para móvil) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {onToggleSidebar && (
          <button
            type="button"
            className="hamburger-btn"
            data-testid="btn-toggle-sidebar"
            onClick={onToggleSidebar}
            aria-label="Abrir menú de navegación"
            title="Menú de navegación (3 rayas)"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #D8CFBC',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#11120D',
              transition: 'all 0.15s ease',
              padding: 0,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FAF9F6';
              e.currentTarget.style.borderColor = '#11120D';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = '#D8CFBC';
            }}
          >
            {/* Icono de 3 rayas */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="12" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        <div>
          <h1 style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            color: '#11120D',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            {title}
          </h1>
          {subtitle && (
            <div className="header-subtitle" style={{ fontSize: '0.78rem', color: '#565449', marginTop: '2px', letterSpacing: '0.02em' }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Zona Amigable de Información: Fecha y Estado de Sincronización */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        {/* Fecha Escolar Oficial Amigable (Oculta en celular) */}
        <div
          className="header-date-chip"
          title="Fecha Escolar Oficial"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '0.42rem 0.95rem',
            backgroundColor: '#FAF9F6',
            borderRadius: '20px',
            border: '1px solid #D8CFBC',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#11120D',
            letterSpacing: '0.01em',
            boxShadow: '0 1px 2px rgba(17, 18, 13, 0.03)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#565449" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{formatFriendlyDate(formattedDate)}</span>
        </div>

        {/* Cápsula de Conectividad y Sincronización */}
        <div
          className="header-sync-pill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.35rem 0.65rem 0.35rem 0.85rem',
            backgroundColor: '#FFFFFF',
            borderRadius: '24px',
            border: '1px solid #D8CFBC',
            boxShadow: '0 1px 3px rgba(17, 18, 13, 0.04)',
          }}
        >
          {/* Indicador de Estado de Sincronización */}
          {syncStatus === 'syncing' ? (
            <div
              data-testid="sync-indicator-syncing"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#11120D',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#11120D"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: 'spin 1.2s linear infinite' }}
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span className="sync-text-hide-mobile">Sincronizando...</span>
            </div>
          ) : syncStatus === 'error' ? (
            <div
              data-testid="sync-indicator-error"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#842029',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D32F2F', display: 'inline-block' }} />
              <span className="sync-text-hide-mobile">Pendiente de reconexión</span>
            </div>
          ) : pendingCount > 0 ? (
            <div
              data-testid="sync-indicator-pending"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#8A5800',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F57C00', display: 'inline-block' }} />
              <span className="sync-text-hide-mobile">{pendingCount} pendiente{pendingCount > 1 ? 's' : ''}</span>
            </div>
          ) : (
            <div
              data-testid="sync-indicator-synced"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#1E6F30',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1E6F30" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="sync-text-hide-mobile">Sincronizado</span>
            </div>
          )}

          {/* Separador vertical sutil */}
          <span className="sync-text-hide-mobile" style={{ width: '1px', height: '14px', backgroundColor: '#D8CFBC' }} />

          {/* Estado de Red */}
          <div
            data-testid="sync-message"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: '#565449',
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isOnline ? '#2E7D32' : '#8A8679',
                display: 'inline-block',
              }}
            />
            <span className="sync-text-hide-mobile">{isOnline ? 'En línea' : 'Sin conexión'}</span>
          </div>

          {/* Botón Reintentar con icono SVG */}
          <button
            onClick={onRetrySync}
            data-testid="btn-retry"
            disabled={syncStatus === 'syncing'}
            title="Sincronizar cambios con el servidor"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              fontSize: '0.74rem',
              cursor: syncStatus === 'syncing' ? 'default' : 'pointer',
              borderRadius: '16px',
              border: '1px solid #D8CFBC',
              backgroundColor: '#FAF9F6',
              color: '#11120D',
              fontWeight: 600,
              transition: 'all 0.15s ease',
              marginLeft: '2px',
            }}
            onMouseEnter={(e) => {
              if (syncStatus !== 'syncing') {
                e.currentTarget.style.backgroundColor = '#11120D';
                e.currentTarget.style.color = '#FFFFFF';
                e.currentTarget.style.borderColor = '#11120D';
              }
            }}
            onMouseLeave={(e) => {
              if (syncStatus !== 'syncing') {
                e.currentTarget.style.backgroundColor = '#FAF9F6';
                e.currentTarget.style.color = '#11120D';
                e.currentTarget.style.borderColor = '#D8CFBC';
              }
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: syncStatus === 'syncing' ? 'spin 1.2s linear infinite' : 'none' }}
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span className="sync-text-hide-mobile">Reintentar</span>
          </button>
        </div>
      </div>
    </header>
  );
}
export default Header;
