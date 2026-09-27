import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/src/components/Icon';
import { Card, Loading } from '@/src/components/ui';
import { useSummary, useMonthlySummary } from '@/src/hooks';
import { makeStyles, useTheme } from '@/src/theme';
import { monday, iso, addDays, weekLabel } from '@/src/constants';

const MONTHS_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

export default function PodsumowanieScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const [weekStartDate, setWeekStartDate] = useState(() => monday(new Date()));
  const weekStart = iso(weekStartDate);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [monthDate, setMonthDate] = useState(() => new Date());
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth() + 1;

  const summaryQ = useSummary(weekStart);
  const monthQ = useMonthlySummary(year, month, period === 'month');
  const [filter, setFilter] = useState<string>('all');

  const activeQ = period === 'week' ? summaryQ : monthQ;
  const people: any[] = activeQ.data?.people || [];
  const periodLabel = period === 'week' ? weekLabel(weekStart) : `${MONTHS_PL[month - 1]} ${year}`;

  const shown = useMemo(() => {
    if (filter === 'all') return people;
    return people.filter((p) => p.key === filter);
  }, [people, filter]);

  const totals = useMemo(
    () =>
      shown.reduce(
        (acc, p) => ({ hours: acc.hours + p.hours, pay: acc.pay + p.pay, shifts: acc.shifts + p.shifts }),
        { hours: 0, pay: 0, shifts: 0 }
      ),
    [shown]
  );

  const chips = [{ key: 'all', name: 'Wszyscy', color: t.colors.brandPrimary }, ...people];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={t.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Zarobki</Text>
          <Text style={styles.subtitle}>{periodLabel}</Text>
        </View>
      </View>

      {/* Period toggle */}
      <View style={styles.toggleRow}>
        <Pressable
          testID="period-week"
          onPress={() => setPeriod('week')}
          style={[styles.toggle, period === 'week' && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, period === 'week' && styles.toggleTextActive]}>Tydzień</Text>
        </Pressable>
        <Pressable
          testID="period-month"
          onPress={() => setPeriod('month')}
          style={[styles.toggle, period === 'month' && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, period === 'month' && styles.toggleTextActive]}>Miesiąc</Text>
        </Pressable>
      </View>

      <View style={styles.nav}>
        <Pressable
          testID="sum-prev"
          onPress={() =>
            period === 'week'
              ? setWeekStartDate((d) => addDays(d, -7))
              : setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
          }
          style={styles.navBtn}
        >
          <Icon name="chevron-left" size={22} color={t.colors.onSurface} />
        </Pressable>
        <Text style={styles.navLabel}>{periodLabel}</Text>
        <Pressable
          testID="sum-next"
          onPress={() =>
            period === 'week'
              ? setWeekStartDate((d) => addDays(d, 7))
              : setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
          }
          style={styles.navBtn}
        >
          <Icon name="chevron-right" size={22} color={t.colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <Pressable
                key={c.key}
                testID={`filter-${c.key}`}
                onPress={() => setFilter(c.key)}
                style={[styles.chip, { borderColor: c.color }, active && { backgroundColor: c.color }]}
              >
                <View style={[styles.chipDot, { backgroundColor: c.color }]} />
                <Text style={[styles.chipText, active && { color: '#fff' }]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: insets.bottom + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={activeQ.isFetching} onRefresh={() => activeQ.refetch()} tintColor={t.colors.brandPrimary} />
        }
      >
        {activeQ.isLoading ? (
          <Loading label="Liczę zarobki..." />
        ) : (
          <>
            <View style={styles.bigMetrics}>
              <Card style={styles.bigMetric} testID="total-hours">
                <Text style={styles.bigLabel}>GODZINY</Text>
                <Text style={styles.bigValue}>{totals.hours}h</Text>
                <Text style={styles.bigSub}>{totals.shifts} zmian</Text>
              </Card>
              <Card style={[styles.bigMetric, { backgroundColor: t.colors.brandTertiary }]} testID="total-pay">
                <Text style={[styles.bigLabel, { color: t.colors.onBrandTertiary }]}>WYPŁATA</Text>
                <Text style={[styles.bigValue, { color: '#fff' }]}>{totals.pay} zł</Text>
                <Text style={[styles.bigSub, { color: t.colors.onBrandTertiary }]}>szacunkowo</Text>
              </Card>
            </View>

            <Text style={styles.sectionTitle}>Podział na osoby</Text>
            {shown.map((p) => (
              <Card key={p.key} style={styles.personRow} testID={`sum-person-${p.key}`}>
                <View style={[styles.personDot, { backgroundColor: p.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{p.name}</Text>
                  <Text style={styles.personMeta}>
                    {p.shifts} zmian · {p.hours}h
                  </Text>
                </View>
                <Text style={styles.personPay}>{p.pay} zł</Text>
              </Card>
            ))}
            {shown.every((p) => p.shifts === 0) && (
              <Card>
                <Text style={styles.emptyText}>Brak zaplanowanych zmian w tym tygodniu.</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  title: { color: t.colors.onSurface, fontSize: t.font['2xl'], fontWeight: '900' },
  subtitle: { color: t.colors.muted, fontSize: t.font.base, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.md,
  },
  toggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: t.radius.md,
    alignItems: 'center',
    backgroundColor: t.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  toggleActive: { backgroundColor: t.colors.brandPrimary, borderColor: t.colors.brandPrimary },
  toggleText: { color: t.colors.muted, fontWeight: '800', fontSize: t.font.base },
  toggleTextActive: { color: '#fff' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  navLabel: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  chipsWrap: { height: 56, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  chipsRow: { paddingHorizontal: t.spacing.lg, gap: t.spacing.sm, alignItems: 'center' },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.pill,
    borderWidth: 1.5,
    backgroundColor: t.colors.surfaceSecondary,
    flexShrink: 0,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { color: t.colors.onSurfaceSecondary, fontWeight: '800', fontSize: t.font.base },
  bigMetrics: { flexDirection: 'row', gap: t.spacing.md },
  bigMetric: { flex: 1, gap: 2 },
  bigLabel: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '800', letterSpacing: 1 },
  bigValue: { color: t.colors.onSurface, fontSize: 40, fontWeight: '900', marginTop: 4 },
  bigSub: { color: t.colors.muted, fontSize: t.font.sm },
  sectionTitle: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900', marginTop: t.spacing.sm },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.md },
  personDot: { width: 14, height: 14, borderRadius: 7 },
  personName: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '800' },
  personMeta: { color: t.colors.muted, fontSize: t.font.sm, marginTop: 2 },
  personPay: { color: t.colors.success, fontSize: t.font.xl, fontWeight: '900' },
  emptyText: { color: t.colors.muted, fontSize: t.font.base },
}));
