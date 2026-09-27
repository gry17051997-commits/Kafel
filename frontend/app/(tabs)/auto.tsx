import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, Platform, Linking, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Header } from '@/src/components/Header';
import { Icon } from '@/src/components/Icon';
import { Button, Card, Loading } from '@/src/components/ui';
import { useToast } from '@/src/components/Toast';
import { VehicleMap } from '@/src/components/VehicleMap';
import { useLatestLocation, useLocationHistory, usePushLocation, useSettings } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { usesNativeTabs } from '@/src/navigation';
import { makeStyles, useTheme } from '@/src/theme';

export default function AutoScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, guest } = useAuth();

  const latestQ = useLatestLocation(true);
  const historyQ = useLocationHistory(true);
  const settingsQ = useSettings();
  const pushLocation = usePushLocation();

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [sharing, setSharing] = useState(false);
  const [permBlocked, setPermBlocked] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const vehicle = settingsQ.data?.vehicleRegistration || 'Auto firmowe';
  const latest = latestQ.data?.exists
    ? { lat: latestQ.data.lat, lng: latestQ.data.lng }
    : null;
  const history = (historyQ.data || []).map((p: any) => ({ lat: p.lat, lng: p.lng }));

  const stopWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  const startWatch = useCallback(async () => {
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
      (pos) => {
        pushLocation.mutate({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 0,
          speed: pos.coords.speed || 0,
        });
      }
    );
  }, [pushLocation]);

  const toggleSharing = useCallback(async () => {
    if (sharing) {
      stopWatch();
      setSharing(false);
      toast('Udostępnianie lokalizacji wyłączone', 'info');
      return;
    }
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      if (!current.canAskAgain) {
        setPermBlocked(true);
        return;
      }
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
      if (status !== 'granted') {
        if (!req.canAskAgain) setPermBlocked(true);
        toast('Brak zgody na lokalizację', 'error');
        return;
      }
    }
    setPermBlocked(false);
    try {
      await startWatch();
      setSharing(true);
      toast('Udostępniasz lokalizację auta', 'success');
    } catch {
      toast('Nie udało się uruchomić lokalizacji', 'error');
    }
  }, [sharing, startWatch, stopWatch, toast]);

  // Stop sharing when the app goes to background (foreground-only tracking).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && watchRef.current) {
        stopWatch();
        setSharing(false);
      }
    });
    return () => {
      sub.remove();
      stopWatch();
    };
  }, [stopWatch]);

  const fmtTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const kmh = latestQ.data?.speed ? Math.max(0, Math.round(latestQ.data.speed * 3.6)) : 0;

  return (
    <View style={styles.root}>
      <Header title="Auto / GPS" subtitle={vehicle} />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: bottomChrome + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* Map */}
        <Card style={styles.mapCard}>
          <View style={styles.mapBox}>
            {latestQ.isLoading ? (
              <Loading />
            ) : (
              <VehicleMap latest={latest} history={history} color={t.colors.brandSecondary} />
            )}
          </View>
        </Card>

        {/* Status */}
        <View style={styles.statusRow}>
          <Card style={styles.statusCard} testID="loc-status">
            <Icon name="crosshairs-gps" size={20} color={latest ? t.colors.success : t.colors.muted} />
            <Text style={styles.statusValue}>{latest ? 'Aktywny' : 'Brak sygnału'}</Text>
            <Text style={styles.statusLabel}>Status</Text>
          </Card>
          <Card style={styles.statusCard}>
            <Icon name="speedometer" size={20} color={t.colors.brandSecondary} />
            <Text style={styles.statusValue}>{kmh} km/h</Text>
            <Text style={styles.statusLabel}>Prędkość</Text>
          </Card>
          <Card style={styles.statusCard}>
            <Icon name="clock-outline" size={20} color={t.colors.warning} />
            <Text style={styles.statusValue}>{fmtTime(latestQ.data?.ts)}</Text>
            <Text style={styles.statusLabel}>Ostatni sygnał</Text>
          </Card>
        </View>

        {/* Share control */}
        {!guest && (
          <Card testID="share-card">
            <Text style={styles.shareTitle}>Udostępnianie lokalizacji</Text>
            <Text style={styles.shareText}>
              Włącz, aby wysyłać pozycję auta do zespołu (gdy aplikacja jest otwarta).
            </Text>
            {permBlocked ? (
              <>
                <Text style={styles.blocked}>
                  Dostęp do lokalizacji jest zablokowany. Włącz go w ustawieniach systemu.
                </Text>
                <Button
                  testID="open-settings"
                  title="Otwórz ustawienia"
                  variant="secondary"
                  onPress={() => Linking.openSettings()}
                  style={{ marginTop: t.spacing.md }}
                />
              </>
            ) : (
              <Button
                testID="toggle-share"
                title={sharing ? 'Zatrzymaj udostępnianie' : 'Udostępniaj lokalizację'}
                variant={sharing ? 'danger' : 'primary'}
                onPress={toggleSharing}
                icon={<Icon name={sharing ? 'stop-circle' : 'map-marker-radius'} size={18} color="#fff" />}
                style={{ marginTop: t.spacing.md }}
              />
            )}
            {sharing && (
              <View style={styles.liveRow}>
                <View style={styles.livePulse} />
                <Text style={styles.liveText}>Nadajesz na żywo</Text>
              </View>
            )}
          </Card>
        )}

        {/* History */}
        <Text style={styles.sectionTitle}>Historia trasy</Text>
        {history.length === 0 ? (
          <Card>
            <Text style={styles.shareText}>Brak zarejestrowanych punktów trasy.</Text>
          </Card>
        ) : (
          (historyQ.data || [])
            .slice(-8)
            .reverse()
            .map((p: any) => (
              <Card key={p.id} style={styles.histRow}>
                <Icon name="map-marker" size={16} color={t.colors.brandSecondary} />
                <Text style={styles.histCoord}>
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </Text>
                <Text style={styles.histTime}>{fmtTime(p.ts)}</Text>
              </Card>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  mapCard: { padding: 0, overflow: 'hidden', height: 260 },
  mapBox: { flex: 1, borderRadius: t.radius.lg, overflow: 'hidden' },
  statusRow: { flexDirection: 'row', gap: t.spacing.sm },
  statusCard: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: t.spacing.md },
  statusValue: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900', marginTop: 2 },
  statusLabel: { color: t.colors.muted, fontSize: t.font.sm },
  shareTitle: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  shareText: { color: t.colors.muted, fontSize: t.font.base, marginTop: 4 },
  blocked: { color: t.colors.warning, fontSize: t.font.base, marginTop: t.spacing.md, fontWeight: '700' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: t.spacing.md, justifyContent: 'center' },
  livePulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.success },
  liveText: { color: t.colors.success, fontWeight: '800', fontSize: t.font.base },
  sectionTitle: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900', marginTop: t.spacing.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.md },
  histCoord: { color: t.colors.onSurfaceSecondary, fontSize: t.font.base, fontWeight: '700', flex: 1 },
  histTime: { color: t.colors.muted, fontSize: t.font.sm },
}));
