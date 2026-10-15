import { useState, useEffect } from 'react';

interface ManagedUser {
  id: string;
  username: string;
  role: string;
  fullName: string;
  createdAt?: string;
  updatedAt?: string;
}

export function UserPasswordManager() {
  const [users, setUsers] = useState<ManagedUser[]>([
    { id: '1', username: 'docente', role: 'Teacher', fullName: 'Docente de Prueba' },
    { id: '2', username: 'auxiliar', role: 'Auxiliary', fullName: 'Auxiliar de Educación' },
    { id: '3', username: 'admin', role: 'Admin', fullName: 'Director / Administrador' },
  ]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Modal para cambio manual de contraseña
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data);
        }
      }
    } catch {
      // Usa las cuentas por defecto si está offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const getDefaultPasswordForRole = (role: string) => {
    const r = role.toUpperCase();
    if (r.includes('TEACHER') || r.includes('DOCENTE')) return 'clave-docente-segura-123';
    if (r.includes('AUXILIARY') || r.includes('AUXILIAR')) return 'clave-auxiliar-segura-123';
    return 'clave-admin-segura-123';
  };

  const handleQuickRestore = async (user: ManagedUser) => {
    setSaving(true);
    setFeedback(null);
    try {
      const defaultPass = getDefaultPasswordForRole(user.role);
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, newPassword: defaultPass }),
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          message: `Contraseña de @${user.username} restablecida con éxito.`,
          details: defaultPass,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          message: err.error || 'No se pudo restablecer la contraseña.',
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Error de red o sin conexión al servidor.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCustomPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!customPassword.trim()) {
      alert('Por favor introduce una contraseña válida.');
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser.username, newPassword: customPassword.trim() }),
      });

      if (res.ok) {
        setFeedback({
          type: 'success',
          message: `Nueva contraseña para @${selectedUser.username} configurada exitosamente.`,
          details: customPassword.trim(),
        });
        setSelectedUser(null);
        setCustomPassword('');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Error al actualizar contraseña.');
      }
    } catch {
      alert('Error de conexión con el servidor.');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(`Clave copiada: ${text}`);
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '4px',
      border: '1px solid #D8CFBC',
      padding: '1.75rem',
      marginBottom: '2rem',
      boxShadow: '0 1px 4px rgba(17, 18, 13, 0.03)',
    }}>
      {/* Encabezado del Módulo */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{
              fontSize: '1.15rem',
              fontWeight: 800,
              color: '#11120D',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              Gestión de Usuarios y Recuperación de Claves
            </h3>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              padding: '2px 6px',
              backgroundColor: '#253746',
              color: '#FFFFFF',
              borderRadius: '2px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Exclusivo Director
            </span>
          </div>
          <p style={{
            fontSize: '0.82rem',
            color: '#565449',
            margin: '4px 0 0 0',
            lineHeight: 1.4,
          }}>
            Recupera o reasigna claves al instante para cualquier docente o auxiliar en caso de olvido o pérdida de credenciales.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.45rem 0.8rem',
            backgroundColor: '#FAF9F6',
            border: '1px solid #D8CFBC',
            borderRadius: '4px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#11120D',
            cursor: 'pointer',
          }}
        >
          {loading ? 'Cargando...' : 'Actualizar Lista'}
        </button>
      </div>

      {/* Banner de Feedback / Confirmación */}
      {feedback && (
        <div style={{
          padding: '0.85rem 1rem',
          borderRadius: '4px',
          marginBottom: '1.25rem',
          backgroundColor: feedback.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          border: `1px solid ${feedback.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          color: feedback.type === 'success' ? '#065F46' : '#991B1B',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div>
            <strong>{feedback.type === 'success' ? '✓ Éxito: ' : '[!] Error: '}</strong>
            {feedback.message}
            {feedback.details && (
              <span style={{ marginLeft: '6px', fontFamily: 'monospace', fontWeight: 800, backgroundColor: 'rgba(255,255,255,0.7)', padding: '2px 6px', borderRadius: '3px' }}>
                {feedback.details}
              </span>
            )}
          </div>
          {feedback.details && (
            <button
              type="button"
              onClick={() => copyToClipboard(feedback.details!)}
              style={{
                padding: '0.3rem 0.65rem',
                backgroundColor: '#065F46',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '3px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Copiar Clave
            </button>
          )}
        </div>
      )}

      {/* Tabla de Usuarios Institucionales */}
      <div style={{
        overflowX: 'auto',
        border: '1px solid #ECE7DE',
        borderRadius: '4px',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#FAF9F6', borderBottom: '1px solid #D8CFBC' }}>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Usuario / Cuenta
              </th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Nombre Completo
              </th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Rol en el Sistema
              </th>
              <th style={{ padding: '0.75rem 1rem', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Clave Oficial Base
              </th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#565449' }}>
                Acciones de Recuperación
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => {
              const defaultPass = getDefaultPasswordForRole(u.role);
              const isTeacher = u.role.toUpperCase().includes('TEACHER');
              const isAux = u.role.toUpperCase().includes('AUXILIARY');

              return (
                <tr
                  key={u.id || u.username}
                  style={{
                    borderBottom: '1px solid #ECE7DE',
                    backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FCFBF9',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#11120D', fontSize: '0.85rem' }}>
                    @{u.username}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#11120D', fontWeight: 600 }}>
                    {u.fullName || (isTeacher ? 'Docente de Prueba' : isAux ? 'Auxiliar de Educación' : 'Director / Administrador')}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      backgroundColor: isTeacher ? '#EFF6FF' : isAux ? '#FEF3C7' : '#F3E8FF',
                      color: isTeacher ? '#1D4ED8' : isAux ? '#B45309' : '#6B21A8',
                      border: `1px solid ${isTeacher ? '#BFDBFE' : isAux ? '#FDE68A' : '#E9D5FF'}`,
                    }}>
                      {isTeacher ? 'DOCENTE' : isAux ? 'AUXILIAR' : 'ADMINISTRADOR'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#565449' }}>
                    {defaultPass}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleQuickRestore(u)}
                        disabled={saving}
                        style={{
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#FFFFFF',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title={`Restablecer inmediatamente a '${defaultPass}'`}
                      >
                        ✓ Restaurar Oficial
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setCustomPassword('');
                        }}
                        style={{
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: '#11120D',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        title="Asignar una nueva contraseña manual"
                      >
                        ✎ Nueva Clave
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal para Asignar Nueva Contraseña Manual */}
      {selectedUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(37, 55, 70, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '6px',
            border: '1px solid #D8CFBC',
            width: '100%',
            maxWidth: '460px',
            padding: '1.75rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
          }}>
            <h4 style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              color: '#11120D',
              margin: '0 0 0.5rem 0',
            }}>
              Recuperar / Cambiar Clave de Acceso
            </h4>
            <p style={{ fontSize: '0.82rem', color: '#565449', margin: '0 0 1.25rem 0' }}>
              Estableciendo nueva credencial para el usuario <strong>@{selectedUser.username}</strong> ({selectedUser.fullName || selectedUser.role}).
            </p>

            <form onSubmit={handleSaveCustomPassword}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#11120D', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  Nueva Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="Escribe la nueva contraseña..."
                    required
                    minLength={6}
                    style={{
                      width: '100%',
                      padding: '0.6rem 2.5rem 0.6rem 0.8rem',
                      borderRadius: '4px',
                      border: '1px solid #D8CFBC',
                      fontSize: '0.9rem',
                      color: '#11120D',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#565449',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
                marginTop: '1.5rem',
              }}>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  disabled={saving}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '4px',
                    border: '1px solid #D8CFBC',
                    backgroundColor: '#FFFFFF',
                    color: '#565449',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '0.55rem 1.15rem',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: '#11120D',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Guardando...' : 'Confirmar y Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserPasswordManager;
