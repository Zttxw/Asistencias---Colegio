import { useState, useRef } from 'react';

interface RosterUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RosterUploadModal({ isOpen, onClose, onSuccess }: RosterUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [clearDemo, setClearDemo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string; details?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setResultMsg({ type: 'error', text: 'Por favor selecciona un archivo Excel (.xlsx o .xls).' });
      return;
    }

    setLoading(true);
    setResultMsg(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/roster/upload?clearDemo=${clearDemo}`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setResultMsg({
          type: 'error',
          text: data.error || 'Error al procesar el archivo Excel.',
          details: data.errors,
        });
        return;
      }

      setResultMsg({
        type: 'success',
        text: `Padrón importado exitosamente: ${data.sectionsCreated || data.sectionsMatched} secciones, ${data.studentsCreated || data.studentsMatched} alumnos.`,
        details: data.warnings,
      });

      // Notificar para refrescar los datos locales
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch {
      setResultMsg({ type: 'error', text: 'Error de conexión con el servidor al subir el archivo.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(17, 18, 13, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1.5rem',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #D8CFBC',
        borderRadius: '6px',
        maxWidth: '520px',
        width: '100%',
        padding: '2rem',
        boxShadow: '0 4px 20px rgba(17, 18, 13, 0.15)',
      }}>
        {/* Cabecera del diálogo */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1.25rem',
          borderBottom: '1px solid #D8CFBC',
          paddingBottom: '0.75rem',
        }}>
          <div>
            <h3 style={{
              fontSize: '1.2rem',
              fontWeight: 800,
              color: '#11120D',
              margin: '0 0 0.25rem 0',
              letterSpacing: '-0.01em',
            }}>
              Cargar Padrón Escolar (Excel)
            </h3>
            <div style={{ fontSize: '0.78rem', color: '#565449', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Importación oficial de estudiantes (.xlsx / .xls)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#565449',
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Mensaje de Resultado */}
        {resultMsg && (
          <div style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            borderRadius: '4px',
            backgroundColor: resultMsg.type === 'success' ? '#FAF9F6' : '#FFFFFF',
            border: `1px solid ${resultMsg.type === 'success' ? '#D8CFBC' : '#565449'}`,
            color: '#11120D',
            fontSize: '0.85rem',
          }}>
            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{resultMsg.type === 'success' ? '[✓]' : '[!]'}</span>
              <span>{resultMsg.text}</span>
            </div>
            {resultMsg.details && resultMsg.details.length > 0 && (
              <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0, fontSize: '0.78rem', color: '#565449' }}>
                {resultMsg.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div style={{
          backgroundColor: '#FAF9F6',
          border: '1px solid #D8CFBC',
          borderRadius: '4px',
          padding: '0.85rem 1rem',
          marginBottom: '1.25rem',
          fontSize: '0.8rem',
          color: '#565449',
          lineHeight: '1.45',
        }}>
          <div style={{ fontWeight: 700, color: '#11120D', marginBottom: '0.35rem', letterSpacing: '0.02em' }}>
            [•] Archivo oficial de prueba disponible
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            Puedes usar el archivo oficial <strong>padron_real_2026.xlsx</strong> que contiene los 91 estudiantes matriculados distribuidos en 5 secciones (1°A, 4°A, 5°A, 5°B, 5°C).
          </div>
          <a
            href="/padron_real_2026.xlsx"
            download="padron_real_2026.xlsx"
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.8rem',
              backgroundColor: '#FFFFFF',
              border: '1px solid #565449',
              borderRadius: '4px',
              color: '#11120D',
              fontSize: '0.75rem',
              fontWeight: 700,
              textDecoration: 'none',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            ↓ Descargar padron_real_2026.xlsx
          </a>
        </div>

        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#11120D',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Seleccionar Archivo Excel
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.85rem',
                backgroundColor: '#FAF9F6',
                color: '#11120D',
                boxSizing: 'border-box',
              }}
            />
            {file && (
              <div style={{ fontSize: '0.78rem', color: '#565449', marginTop: '0.35rem' }}>
                Seleccionado: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#FAF9F6',
            border: '1px solid #D8CFBC',
            borderRadius: '4px',
          }}>
            <input
              id="chk-clear-demo"
              type="checkbox"
              checked={clearDemo}
              onChange={(e) => setClearDemo(e.target.checked)}
              disabled={loading}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="chk-clear-demo" style={{ fontSize: '0.8rem', color: '#11120D', cursor: 'pointer', fontWeight: 600 }}>
              Reemplazar datos previos y cargar la nómina limpia
            </label>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.6rem 1rem',
                backgroundColor: '#FFFFFF',
                color: '#565449',
                border: '1px solid #D8CFBC',
                borderRadius: '4px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Cerrar
            </button>

            <button
              type="submit"
              disabled={loading || !file}
              style={{
                padding: '0.6rem 1.25rem',
                backgroundColor: '#11120D',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: loading || !file ? 'not-allowed' : 'pointer',
                opacity: loading || !file ? 0.6 : 1,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {loading ? '[~] Procesando...' : 'Subir y Actualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default RosterUploadModal;
