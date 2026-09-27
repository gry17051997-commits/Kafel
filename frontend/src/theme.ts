import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

/**
 * Grafik Pracy — Dark-First Utility theme.
 * Color keys mirror the `color` block of design_guidelines.json.
 * The app is dark-only by design (matches the original product).
 */

export const colors = {
  surface: '#0F172A',
  onSurface: '#F8FAFC',
  surfaceSecondary: '#1E293B',
  onSurfaceSecondary: '#F8FAFC',
  surfaceTertiary: '#334155',
  onSurfaceTertiary: '#F8FAFC',
  surfaceInverse: '#F8FAFC',
  onSurfaceInverse: '#0F172A',
  brand: '#3F78ED',
  brandPrimary: '#3F78ED',
  onBrandPrimary: '#FFFFFF',
  brandSecondary: '#4F8CFF',
  onBrandSecondary: '#FFFFFF',
  brandTertiary: '#1E3A8A',
  onBrandTertiary: '#60A5FA',
  success: '#35C98A',
  onSuccess: '#04150E',
  warning: '#F59E0B',
  onWarning: '#1A1204',
  error: '#EF4444',
  onError: '#FFFFFF',
  info: '#8F6CFF',
  onInfo: '#FFFFFF',
  border: '#334155',
  borderStrong: '#475569',
  divider: '#1E293B',
  muted: '#94A3B8',
  onBrand: '#FFFFFF',
};

export type ThemeColors = typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 18,
  pill: 999,
} as const;

export const font = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 44,
} as const;

/** Per-worker accent colors keyed by personKey. */
export const workerColors: Record<string, string> = {
  P: '#4F8CFF',
  M: '#8F6CFF',
  L: '#35C98A',
};

export const workerColorFallbacks = [
  '#4F8CFF',
  '#8F6CFF',
  '#35C98A',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#EC4899',
  '#84CC16',
];

export type Theme = {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  font: typeof font;
  dark: boolean;
};

const theme: Theme = { colors, spacing, radius, font, dark: true };

export function useTheme(): Theme {
  return theme;
}

/**
 * makeStyles(fn) → hook returning a memoized StyleSheet built from the theme.
 * Usage: const useStyles = makeStyles((t) => ({ box: { backgroundColor: t.colors.surface } }));
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (t: Theme) => T
): () => T {
  return function useStyles(): T {
    const t = useTheme();
    return useMemo(() => StyleSheet.create(factory(t)), [t]);
  };
}
