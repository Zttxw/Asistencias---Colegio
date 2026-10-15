/**
 * Utilidades para formateo y manejo intuitivo de fechas en el sistema de asistencia escolar.
 * Especialmente diseñado para docentes: claro, en español humano, sin tecnicismos ni emojis.
 * Incluye lógica de calendario escolar (días lectivos de Lunes a Viernes).
 */

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Retorna la fecha de hoy en formato local YYYY-MM-DD (sin desface UTC).
 */
export function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Desglosa una fecha ISO YYYY-MM-DD en año, mes y día numéricos
 * de forma pura para evitar desfaces de huso horario (timezone offset).
 */
export function parseIsoDate(isoDateStr: string): { year: number; month: number; day: number; dateObj: Date } {
  const parts = (isoDateStr || '').split('-');
  if (parts.length !== 3) {
    const fallback = new Date();
    return {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
      dateObj: fallback,
    };
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dateObj = new Date(year, month - 1, day);
  return { year, month, day, dateObj };
}

/**
 * Determina si una fecha cae en fin de semana (Sábado o Domingo).
 * En la educación básica regular no hay jornada escolar en fines de semana.
 */
export function isWeekend(isoDateStr: string): boolean {
  const { dateObj } = parseIsoDate(isoDateStr);
  const dayOfWeek = dateObj.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domingo, 6 = Sábado
}

/**
 * Desplaza una fecha ISO en N días (positivo hacia el futuro, negativo hacia el pasado).
 */
export function shiftIsoDate(isoDateStr: string, daysOffset: number): string {
  const { year, month, day } = parseIsoDate(isoDateStr);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + daysOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayOut = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayOut}`;
}

/**
 * Obtiene la fecha de ayer en formato YYYY-MM-DD a partir de una fecha base.
 */
export function getYesterdayIso(baseDateStr: string): string {
  return shiftIsoDate(baseDateStr, -1);
}

/**
 * Obtiene el día lectivo escolar anterior (Lunes a Viernes).
 * Si la fecha base es Lunes, el día escolar anterior fue el Viernes previo (-3 días).
 * Si la fecha base es Domingo, el día escolar anterior fue el Viernes previo (-2 días).
 * Si la fecha base es Sábado, el día escolar anterior fue el Viernes previo (-1 día).
 */
export function getPreviousSchoolDayIso(baseDateStr: string): string {
  const { dateObj } = parseIsoDate(baseDateStr);
  const dayOfWeek = dateObj.getDay();

  if (dayOfWeek === 1) { // Lunes -> Viernes anterior
    return shiftIsoDate(baseDateStr, -3);
  } else if (dayOfWeek === 0) { // Domingo -> Viernes anterior
    return shiftIsoDate(baseDateStr, -2);
  } else if (dayOfWeek === 6) { // Sábado -> Viernes anterior
    return shiftIsoDate(baseDateStr, -1);
  } else { // Martes a Viernes -> Día anterior
    return shiftIsoDate(baseDateStr, -1);
  }
}

/**
 * Formatea una fecha a español completo: Ej. "Lunes 12 de octubre de 2026"
 */
export function formatFullSpanishDate(isoDateStr: string): string {
  try {
    const { year, month, day, dateObj } = parseIsoDate(isoDateStr);
    const dayName = DAY_NAMES[dateObj.getDay()];
    const monthName = MONTH_NAMES[month - 1];
    return `${dayName} ${day} de ${monthName} de ${year}`;
  } catch {
    return isoDateStr;
  }
}

/**
 * Retorna etiqueta relativa amigable: "Hoy", "Ayer", o nombre de día.
 */
export function getRelativeLabel(targetDateStr: string, referenceTodayStr: string): string | null {
  if (!targetDateStr || !referenceTodayStr) return null;
  if (targetDateStr === referenceTodayStr) return 'Hoy';
  if (targetDateStr === getYesterdayIso(referenceTodayStr)) return 'Ayer';
  if (targetDateStr === getPreviousSchoolDayIso(referenceTodayStr)) return 'Clase anterior';
  return null;
}

/**
 * Formatea una fecha con contexto humano claro para docentes:
 * Ej. "Hoy · Lunes 12 de octubre de 2026"
 * Ej. "Ayer · Domingo 11 de octubre de 2026 (Fin de semana)"
 */
export function formatFriendlyHumanDate(targetDateStr: string, referenceTodayStr: string): string {
  const fullText = formatFullSpanishDate(targetDateStr);
  const rel = getRelativeLabel(targetDateStr, referenceTodayStr);
  const weekendText = isWeekend(targetDateStr) ? ' (Fin de semana)' : '';
  if (rel) {
    return `${rel} · ${fullText}${weekendText}`;
  }
  return `${fullText}${weekendText}`;
}
