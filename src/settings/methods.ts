export type CalculationMethodOption = {
  id: number;
  name: string;
};

export const CALCULATION_METHODS: CalculationMethodOption[] = [
  { id: 0, name: 'Shia — Ithna Ashari' },
  { id: 1, name: 'University of Islamic Sciences, Karachi' },
  { id: 2, name: 'Islamic Society of North America (ISNA)' },
  { id: 3, name: 'Muslim World League' },
  { id: 4, name: 'Umm Al-Qura University, Makkah' },
  { id: 5, name: 'Egyptian General Authority of Survey' },
  { id: 7, name: 'Institute of Geophysics, University of Tehran' },
  { id: 8, name: 'Gulf Region' },
  { id: 9, name: 'Kuwait' },
  { id: 10, name: 'Qatar' },
  { id: 11, name: 'Singapore' },
  { id: 12, name: 'France' },
  { id: 13, name: 'Turkey' },
  { id: 14, name: 'Russia' },
  { id: 15, name: 'Moonsighting Committee Worldwide' },
];

export function getMethodLabel(id: number): string {
  return CALCULATION_METHODS.find(m => m.id === id)?.name ?? `Method ${id}`;
}
