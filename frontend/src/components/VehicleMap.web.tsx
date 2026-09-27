import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { colors } from '@/src/theme';

export type Point = { lat: number; lng: number };

export function VehicleMap({
  latest,
  history,
}: {
  latest: Point | null;
  history: Point[];
  color?: string;
}) {
  return (
    <View style={styles.wrap} testID="map-web-fallback">
      <Icon name="map-marker-radius" size={40} color={colors.brandSecondary} />
      <Text style={styles.title}>Mapa dostępna w aplikacji mobilnej</Text>
      {latest ? (
        <Text style={styles.coords}>
          {latest.lat.toFixed(5)}, {latest.lng.toFixed(5)}
        </Text>
      ) : (
        <Text style={styles.coords}>Brak danych lokalizacji</Text>
      )}
      <Text style={styles.hint}>Punkty trasy: {history.length}</Text>
    </View>
  );
}

export default VehicleMap;

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
  },
  title: { color: colors.onSurface, fontSize: 16, fontWeight: '800' },
  coords: { color: colors.brandSecondary, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 13 },
});
