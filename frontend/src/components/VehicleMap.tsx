import React from 'react';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { StyleSheet } from 'react-native';

export type Point = { lat: number; lng: number };

export function VehicleMap({
  latest,
  history,
  color,
}: {
  latest: Point | null;
  history: Point[];
  color: string;
}) {
  const center = latest || history[history.length - 1] || { lat: 52.2297, lng: 21.0122 };
  const coords = history.map((p) => ({ latitude: p.lat, longitude: p.lng }));

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      region={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
    >
      {coords.length > 1 && <Polyline coordinates={coords} strokeColor={color} strokeWidth={4} />}
      {latest && (
        <Marker
          coordinate={{ latitude: latest.lat, longitude: latest.lng }}
          title="Auto"
          pinColor={color}
        />
      )}
    </MapView>
  );
}

export default VehicleMap;
