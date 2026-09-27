export const DAYS = [
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
  'Niedziela',
];

export const DAYS_SHORT = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'];

export const RATES: Record<string, number> = { '10': 300, '12': 360 };

export const HOURS_OPTIONS = [10, 12];

export function monday(d: Date): Date {
  const x = new Date(d);
  const n = x.getDay();
  x.setDate(x.getDate() + (n === 0 ? -6 : 1 - n));
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fullDate(d: Date): string {
  return `${shortDate(d)}.${d.getFullYear()}`;
}

export function shiftTime(times: any, slot: number): string {
  if (!times) return '';
  return slot === 1 ? `${times.s1}–${times.e1}` : `${times.s2}–${times.e2}`;
}

export function weekLabel(weekStartIso: string): string {
  const start = fromIso(weekStartIso);
  const end = addDays(start, 6);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export type Shift = {
  id: string;
  shift: number;
  person: string | null;
  warehouse: string;
  locked: boolean;
  manual: boolean;
};

export type Day = {
  dayIndex: number;
  warehouse: string;
  shifts: Shift[];
};

export type Week = {
  weekStart: string;
  hours: number;
  rotation: string;
  warehouse: string;
  days: Day[];
  updatedAt: string | null;
  updatedBy: string;
  exists?: boolean;
};

export type User = {
  id: string;
  email: string;
  role: 'admin' | 'employee' | 'locator';
  displayName: string;
  personKey: string;
};
