import React, { useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '@/src/components/Header';
import { Icon } from '@/src/components/Icon';
import { Card, Loading, Badge, Button } from '@/src/components/ui';
import { useWeek, useSummary, usePeople, useSettings } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { router } from 'expo-router';
import { usesNativeTabs } from '@/src/navigation';
import { NotificationBell } from '@/src/components/NotificationBell';
import { makeStyles, useTheme, workerColors } from '@/src/theme';
import { monday, iso, DAYS, shiftTime } from '@/src/constants';

export default function TerazScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user, guest } = useAuth();

  const today = useMemo(() => new Date(), []);
  const weekStart = iso(monday(today));
  const dayIndex = (today.getDay() + 6) % 7;

  const weekQ = useWeek(weekStart);
  const summaryQ = useSummary(weekStart);
  const peopleQ = usePeople();
  const settingsQ = useSettings();

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const times = settingsQ.data?.times;
  const people = peopleQ.data || {};
  const personKey = user?.personKey;

  const colorFor = (pk: string) => people[pk]?.color || workerColors[pk] || t.colors.brandPrimary;
  const nameFor = (pk: string) => people[pk]?.name || pk;

  const { current, next } = useMemo(() => {
    const week = weekQ.data;
    if (!week || !personKey) return { current: null as any, next: null as any };
    let cur: any = null;
    let nxt: any = null;
    for (let d = 0; d < 7; d++) {
      const day = week.days[d];
      for (const s of day.shifts) {
        if (s.person !== personKey) continue;
        const entry = { dayIndex: d, shift: s.shift, warehouse: s.warehouse };
        if (d === dayIndex && !cur) cur = entry;
        else if (d > dayIndex && !nxt) nxt = entry;
        else if (d === dayIndex && cur && s.shift > cur.shift && !nxt) nxt = entry;
      }
    }
    return { current: cur, next: nxt };
  }, [weekQ.data, personKey, dayIndex]);

  const myStats = useMemo(() => {
    const list = summaryQ.data?.people || [];
    return list.find((p: any) => p.key === personKey);
  }, [summaryQ.data, personKey]);

  const todayShifts = weekQ.data?.days?.[dayIndex]?.shifts || [];

  const loading = weekQ.isLoading || peopleQ.isLoading;
  const onRefresh = () => {
    weekQ.refetch();
    summaryQ.refetch();
    peopleQ.refetch();
  };

  return (
    <View style={styles.root}>
      <Header
        title={`Cześć${user?.displayName ? ', ' + user.displayName.split(' ')[0] : ''}!`}
        subtitle={`${DAYS[dayIndex]} · ${today.getDate()}.${String(today.getMonth() + 1).padStart(2, '0')}`}
        right={<NotificationBell />}
      />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: bottomChrome + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={weekQ.isFetching} onRefresh={onRefresh} tintColor={t.colors.brandPrimary} />
        }
      >
        {loading ? (
          <Loading label="Ładuję grafik..." />
        ) : (
          <>
            {/* Hero — current shift */}
            {personKey ? (
              current ? (
                <View style={styles.hero} testID="hero-current">
                  <LinearGradient
                    colors={[colorFor(personKey), colorFor(personKey) + 'AA']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroBg}
                  />
                  <Text style={styles.heroLabel}>TWOJA DZISIEJSZA ZMIANA</Text>
                  <Text style={styles.heroTime}>{shiftTime(times, current.shift)}</Text>
                  <View style={styles.heroMeta}>
                    <View style={styles.heroChip}>
                      <Icon name={current.shift === 1 ? 'numeric-1-box' : 'numeric-2-box'} size={16} color="#fff" />
                      <Text style={styles.heroChipText}>Zmiana {current.shift === 1 ? 'I' : 'II'}</Text>
                    </View>
                    <View style={styles.heroChip}>
                      <Icon name="map-marker" size={16} color="#fff" />
                      <Text style={styles.heroChipText}>{current.warehouse}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Card testID="hero-off" style={styles.offCard}>
                  <Icon name="coffee" size={34} color={t.colors.success} />
                  <Text style={styles.offTitle}>Masz dziś wolne</Text>
                  <Text style={styles.offText}>Nie masz przypisanej zmiany na dzisiaj.</Text>
                </Card>
              )
            ) : (
              <Card style={styles.offCard}>
                <Icon name="account-question" size={34} color={t.colors.muted} />
                <Text style={styles.offTitle}>
                  {guest ? 'Tryb podglądu' : 'Brak przypisania'}
                </Text>
                <Text style={styles.offText}>
                  {guest
                    ? 'Zaloguj się, aby zobaczyć swoje zmiany.'
                    : 'Poproś administratora o przypisanie do osoby (P/M/L).'}
                </Text>
              </Card>
            )}

            {/* Next shift */}
            {personKey && next && (
              <Card testID="next-shift">
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionLabel}>NASTĘPNA ZMIANA</Text>
                  <Badge label={DAYS[next.dayIndex]} color={colorFor(personKey)} />
                </View>
                <View style={styles.nextRow}>
                  <Text style={styles.nextTime}>{shiftTime(times, next.shift)}</Text>
                  <View style={styles.nextWh}>
                    <Icon name="map-marker" size={15} color={t.colors.muted} />
                    <Text style={styles.nextWhText}>{next.warehouse}</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Quick metrics */}
            {personKey && myStats && (
              <View style={styles.metrics}>
                <Card style={styles.metric} testID="metric-hours">
                  <Icon name="clock-outline" size={20} color={t.colors.brandSecondary} />
                  <Text style={styles.metricValue}>{myStats.hours}h</Text>
                  <Text style={styles.metricLabel}>Godziny w tym tyg.</Text>
                </Card>
                <Card style={styles.metric} testID="metric-pay">
                  <Icon name="cash" size={20} color={t.colors.success} />
                  <Text style={styles.metricValue}>{myStats.pay} zł</Text>
                  <Text style={styles.metricLabel}>Szac. wypłata</Text>
                </Card>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.actions}>
              <Button
                testID="open-zarobki"
                title="Zarobki"
                variant="secondary"
                small
                icon={<Icon name="chart-bar" size={18} color={t.colors.onSurface} />}
                onPress={() => router.push('/podsumowanie')}
                style={{ flex: 1 }}
              />
              {!!user && (
                <Button
                  testID="open-zamiany"
                  title="Zamiany"
                  variant="secondary"
                  small
                  icon={<Icon name="swap-horizontal" size={18} color={t.colors.onSurface} />}
                  onPress={() => router.push('/swaps')}
                  style={{ flex: 1 }}
                />
              )}
            </View>

            {/* Today's crew */}
            <Text style={styles.sectionTitle}>Dzisiaj na zmianie</Text>
            {todayShifts.filter((s) => s.person).length === 0 ? (
              <Card>
                <Text style={styles.offText}>Brak obsady na dzisiaj.</Text>
              </Card>
            ) : (
              todayShifts.map((s) =>
                s.person ? (
                  <Card key={s.id} style={styles.crewRow} testID={`today-shift-${s.shift}`}>
                    <View style={[styles.dot, { backgroundColor: colorFor(s.person) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.crewName}>{nameFor(s.person)}</Text>
                      <Text style={styles.crewMeta}>
                        Zmiana {s.shift === 1 ? 'I' : 'II'} · {s.warehouse}
                      </Text>
                    </View>
                    <Text style={styles.crewTime}>{shiftTime(times, s.shift)}</Text>
                  </Card>
                ) : null
              )
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  hero: {
    borderRadius: t.radius.xl,
    padding: t.spacing.xl,
    overflow: 'hidden',
  },
  heroBg: { ...(require('react-native').StyleSheet.absoluteFillObject) },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: t.font.sm, fontWeight: '800', letterSpacing: 1 },
  heroTime: { color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 6, letterSpacing: 1 },
  heroMeta: { flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: t.radius.pill,
  },
  heroChipText: { color: '#fff', fontWeight: '800', fontSize: t.font.sm },
  offCard: { alignItems: 'center', gap: 8, paddingVertical: t.spacing.xl },
  offTitle: { color: t.colors.onSurface, fontSize: t.font.xl, fontWeight: '900' },
  offText: { color: t.colors.muted, fontSize: t.font.base, textAlign: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '800', letterSpacing: 1 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  nextTime: { color: t.colors.onSurface, fontSize: t.font['2xl'], fontWeight: '900' },
  nextWh: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nextWhText: { color: t.colors.muted, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: t.spacing.md },
  metric: { flex: 1, gap: 6 },
  metricValue: { color: t.colors.onSurface, fontSize: t.font['2xl'], fontWeight: '900', marginTop: 4 },
  metricLabel: { color: t.colors.muted, fontSize: t.font.sm },
  sectionTitle: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900', marginTop: t.spacing.sm },
  actions: { flexDirection: 'row', gap: t.spacing.md, marginTop: t.spacing.sm },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  crewName: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '800' },
  crewMeta: { color: t.colors.muted, fontSize: t.font.sm, marginTop: 2 },
  crewTime: { color: t.colors.onSurfaceSecondary, fontSize: t.font.base, fontWeight: '800' },
}));
