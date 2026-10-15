import { useState, useEffect } from 'react';
import type { AuthUser } from './types';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
  defaultUsername?: string;
}

export function LoginView({ onLoginSuccess, defaultUsername = 'docente' }: LoginViewProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg('Por favor introduce usuario y contraseña.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          setErrorMsg(data.error || 'Demasiados intentos fallidos. Cuenta bloqueada temporalmente.');
        } else {
          setErrorMsg(data.error || 'Credenciales inválidas. Verifica tu usuario y contraseña.');
        }
        return;
      }

      if (data.token && data.user) {
        onLoginSuccess(data.user, data.token);
      } else {
        setErrorMsg('Respuesta inesperada del servidor de autenticación.');
      }
    } catch {
      setErrorMsg('Error de conexión con el servidor. Verifica que el servicio esté activo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FAF9F6',
      padding: '1.5rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '380px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(17, 18, 13, 0.04)',
        padding: '2.5rem 2rem',
      }}>
        {/* Cabecera Institucional */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            color: '#11120D',
            textTransform: 'uppercase',
            marginBottom: '0.35rem',
          }}>
            ASISTENCIA
          </div>
          <div style={{
            fontSize: '0.82rem',
            color: '#565449',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            I.E. Piloto Chumbivilcas
          </div>
        </div>

        {errorMsg && (
          <div
            data-testid="login-error"
            style={{
              marginBottom: '1.25rem',
              padding: '0.75rem 1rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid #565449',
              borderRadius: '4px',
              color: '#11120D',
              fontSize: '0.85rem',
              lineHeight: 1.4,
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
            }}
          >
            <span style={{ fontWeight: 700 }}>[!]</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#11120D',
              marginBottom: '0.4rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              Usuario
            </label>
            <input
              type="text"
              data-testid="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="docente, auxiliar o admin"
              autoCapitalize="none"
              autoComplete="username"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.95rem',
                color: '#11120D',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF',
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#11120D',
              marginBottom: '0.4rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              Contraseña
            </label>
            <input
              type="password"
              data-testid="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.95rem',
                color: '#11120D',
                outline: 'none',
                boxSizing: 'border-box',
                backgroundColor: '#FFFFFF',
              }}
            />
          </div>

          <button
            type="submit"
            data-testid="btn-login"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.8rem',
              marginTop: '0.4rem',
              backgroundColor: '#11120D',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Accesos Rápidos Institucionales */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#565449',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '0.5rem',
            textAlign: 'center',
          }}>
            Cuentas Institucionales (Clic para autocompletar)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <button
              type="button"
              data-testid="btn-quick-docente"
              onClick={() => {
                setUsername('docente');
                setPassword('clave-docente-segura-123');
              }}
              style={{
                padding: '0.45rem 0.25rem',
                backgroundColor: '#FAF9F6',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#11120D',
                cursor: 'pointer',
                textAlign: 'center',
              }}
              title="Docente: docente / clave-docente-segura-123"
            >
              Docente
            </button>
            <button
              type="button"
              data-testid="btn-quick-auxiliar"
              onClick={() => {
                setUsername('auxiliar');
                setPassword('clave-auxiliar-segura-123');
              }}
              style={{
                padding: '0.45rem 0.25rem',
                backgroundColor: '#FAF9F6',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#11120D',
                cursor: 'pointer',
                textAlign: 'center',
              }}
              title="Auxiliar: auxiliar / clave-auxiliar-segura-123"
            >
              Auxiliar
            </button>
            <button
              type="button"
              data-testid="btn-quick-admin"
              onClick={() => {
                setUsername('admin');
                setPassword('clave-admin-segura-123');
              }}
              style={{
                padding: '0.45rem 0.25rem',
                backgroundColor: '#FAF9F6',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: '#11120D',
                cursor: 'pointer',
                textAlign: 'center',
              }}
              title="Director / Admin: admin / clave-admin-segura-123"
            >
              Director
            </button>
          </div>
        </div>

        {/* Estado de Conexión (Símbolo geométrico ●, 0 emojis) */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1rem',
          borderTop: '1px solid #D8CFBC',
          textAlign: 'center',
          fontSize: '0.78rem',
          color: '#565449',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontWeight: 500,
        }}>
          <span style={{ fontSize: '0.75rem', color: isOnline ? '#11120D' : '#565449' }}>●</span>
          <span>{isOnline ? 'Servidor disponible en línea' : 'Sin conexión (Modo Local Offline)'}</span>
        </div>
      </div>
    </div>
  );
}
export default LoginView;
