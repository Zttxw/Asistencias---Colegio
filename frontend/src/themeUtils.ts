/**
 * Paleta cromática distintiva estilo Google Classroom.
 * Asigna a cada aula/salón un color completamente diferente (Azul, Verde, Naranja, Morado, Turquesa, Coral)
 * para que sean inmediatamente distinguibles a simple vista con alta legibilidad.
 */

export interface SectionColorTheme {
  name: string;
  bg: string;
  border: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  hoverBg: string;
  bannerBg: string;
}

export const SECTION_THEMES: SectionColorTheme[] = [
  // 1. Azul Océano (Classroom Royal Blue)
  {
    name: 'Azul Océano',
    bg: '#EDF4FE',
    border: '#BDD7F7',
    accent: '#1A73E8',
    badgeBg: '#D3E3FD',
    badgeText: '#0B57D0',
    hoverBg: '#DFEDFD',
    bannerBg: '#1A73E8',
  },
  // 2. Verde Esmeralda (Classroom Emerald Green)
  {
    name: 'Verde Esmeralda',
    bg: '#EEF8F1',
    border: '#B7E1CD',
    accent: '#188038',
    badgeBg: '#CEEAD6',
    badgeText: '#0D652D',
    hoverBg: '#DFEFE2',
    bannerBg: '#188038',
  },
  // 3. Naranja Ámbar (Classroom Amber / Orange)
  {
    name: 'Naranja Ámbar',
    bg: '#FEF5EC',
    border: '#FDD6AF',
    accent: '#D96500',
    badgeBg: '#FEEFC3',
    badgeText: '#A54B00',
    hoverBg: '#FDEBD7',
    bannerBg: '#D96500',
  },
  // 4. Morado Real (Classroom Purple / Violet)
  {
    name: 'Morado Real',
    bg: '#F7EEFD',
    border: '#D7AEFB',
    accent: '#8430CE',
    badgeBg: '#F3E8FD',
    badgeText: '#681DA8',
    hoverBg: '#EFE0FA',
    bannerBg: '#8430CE',
  },
  // 5. Turquesa Glaciar (Classroom Teal / Cyan)
  {
    name: 'Turquesa Glaciar',
    bg: '#E7F7F8',
    border: '#A1E4EC',
    accent: '#007B83',
    badgeBg: '#CCF0F5',
    badgeText: '#005C62',
    hoverBg: '#D6F1F3',
    bannerBg: '#007B83',
  },
  // 6. Rosa Coral (Classroom Coral / Red)
  {
    name: 'Rosa Coral',
    bg: '#FDEEEB',
    border: '#F6AEA9',
    accent: '#C5221F',
    badgeBg: '#FAD2CF',
    badgeText: '#A50E0E',
    hoverBg: '#FCE4E0',
    bannerBg: '#C5221F',
  },
];

export function getSectionTheme(index: number): SectionColorTheme {
  return SECTION_THEMES[Math.abs(index) % SECTION_THEMES.length];
}
