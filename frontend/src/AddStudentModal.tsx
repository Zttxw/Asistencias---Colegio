import { useState, useEffect } from 'react';
import type { SectionInfo } from './types';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: SectionInfo[];
  defaultSectionId?: string;
  onSaveStudent: (data: { sectionId: string; fullName: string; code?: string }) => Promise<void>;
}

export function AddStudentModal({
  isOpen,
  onClose,
  sections,
  defaultSectionId,
  onSaveStudent,
}: AddStudentModalProps) {
  const [selectedSectionId, setSelectedSectionId] = useState(defaultSectionId || (sections[0]?.id || ''));
  const [fullName, setFullName] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedSectionId(defaultSectionId || (sections[0]?.id || ''));
      setFullName('');
      setStudentCode('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, defaultSectionId, sections]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullName.trim().toUpperCase();
    if (!cleanName) {
      setErrorMsg('Por favor ingresa los apellidos y nombres del alumno.');
      return;
    }
    if (!selectedSectionId) {
      setErrorMsg('Por favor selecciona un aula o sección.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onSaveStudent({
        sectionId: selectedSectionId,
        fullName: cleanName,
        code: studentCode.trim().toUpperCase() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Ocurrió un error al registrar al alumno.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 18, 13, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '480px',
          border: '1px solid #D8CFBC',
          boxShadow: '0 12px 32px rgba(17, 18, 13, 0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            backgroundColor: '#253746', // Pantone 7546 C
            padding: '1.25rem 1.5rem',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                Añadir Alumno al Padrón
              </h3>
              <div style={{ fontSize: '0.75rem', color: '#BAC7D5', marginTop: '2px' }}>
                Registro manual en el aula
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#BAC7D5',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Cerrar ventana"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                padding: '0.65rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.82rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>[!]</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector de Aula / Sección */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label
              htmlFor="student-section-select"
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#11120D',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.35rem',
              }}
            >
              Aula / Sección Destino *
            </label>
            <select
              id="student-section-select"
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #D8CFBC',
                backgroundColor: '#FFFFFF',
                color: '#11120D',
                fontSize: '0.9rem',
                fontWeight: 600,
                outline: 'none',
              }}
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.displayName} — ({sec.studentCount} alumnos)
                </option>
              ))}
            </select>
          </div>

          {/* Campo: Apellidos y Nombres */}
          <div style={{ marginBottom: '1.15rem' }}>
            <label
              htmlFor="student-fullname-input"
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#11120D',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.35rem',
              }}
            >
              Apellidos y Nombres del Estudiante *
            </label>
            <input
              id="student-fullname-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value.toUpperCase())}
              placeholder="Ej: QUISPE CONDORI, JUAN CARLOS"
              autoFocus
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #D8CFBC',
                backgroundColor: '#FFFFFF',
                color: '#11120D',
                fontSize: '0.92rem',
                fontWeight: 600,
                outline: 'none',
              }}
            />
            <div style={{ fontSize: '0.72rem', color: '#565449', marginTop: '4px' }}>
              Formato recomendado: APELLIDOS, NOMBRES
            </div>
          </div>

          {/* Campo: Código del Estudiante */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="student-code-input"
              style={{
                display: 'block',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#11120D',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.35rem',
              }}
            >
              Código o DNI del Alumno (Opcional)
            </label>
            <input
              id="student-code-input"
              type="text"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              placeholder="Ej: A024 (si se deja vacío se genera auto)"
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #D8CFBC',
                backgroundColor: '#FFFFFF',
                color: '#11120D',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '0.65rem 1.15rem',
                borderRadius: '4px',
                border: '1px solid #D8CFBC',
                backgroundColor: '#FFFFFF',
                color: '#565449',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '0.65rem 1.35rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#253746', // Pantone 7546 C
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isSubmitting ? 'Registrando...' : 'Registrar Alumno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddStudentModal;
