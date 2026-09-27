import React from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/src/components/Icon';
import { Button, Card, Badge, Loading } from '@/src/components/ui';
import { useToast } from '@/src/components/Toast';
import { useSwaps, useSwapMutations, usePeople } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { makeStyles, useTheme, workerColors } from '@/src/theme';
import { ApiError } from '@/src/api';
import { DAYS, weekLabel } from '@/src/constants';

export default function SwapsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const swapsQ = useSwaps(!!user);
  const peopleQ = usePeople();
  const { accept, cancel } = useSwapMutations();

  const people = peopleQ.data || {};
  const list: any[] = swapsQ.data || [];
  const pending = list.filter((s) => s.status === 'pending');
  const resolved = list.filter((s) => s.status !== 'pending');

  const colorFor = (pk: string) => people[pk]?.color || workerColors[pk] || t.colors.brandPrimary;
  const nameFor = (pk: string) => people[pk]?.name || pk;

  const onAccept = async (id: string) => {
    try {
      await accept.mutateAsync(id);
      toast('Zmiana przejęta', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Nie udało się przejąć', 'error');
    }
  };
  const onCancel = async (id: string) => {
    try {
      await cancel.mutateAsync(id);
      toast('Propozycja anulowana', 'info');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Nie udało się anulować', 'error');
    }
  };

  const shiftLabel = (s: any) =>
    `${DAYS[s.dayIndex]} · Zmiana ${s.shift === 1 ? 'I' : 'II'}`;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={t.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Zamiany zmian</Text>
          <Text style={styles.subtitle}>Oddaj lub przejmij zmianę od kolegi</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: insets.bottom + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={swapsQ.isFetching} onRefresh={() => swapsQ.refetch()} tintColor={t.colors.brandPrimary} />
        }
      >
        {swapsQ.isLoading ? (
          <Loading />
        ) : (
          <>
            {!user?.personKey && (
              <Card>
                <Text style={styles.hint}>
                  Aby proponować zamiany, musisz mieć przypisaną osobę (P/M/L). Poproś administratora.
                </Text>
              </Card>
            )}

            <Text style={styles.sectionTitle}>Dostępne do przejęcia</Text>
            {pending.length === 0 ? (
              <Card>
                <Text style={styles.hint}>Brak aktywnych propozycji zamiany.</Text>
              </Card>
            ) : (
              pending.map((s) => {
                const mine = s.fromUserId === user?.id;
                return (
                  <Card key={s.id} style={styles.swapCard} testID={`swap-${s.id}`}>
                    <View style={styles.swapTop}>
                      <View style={[styles.dot, { backgroundColor: colorFor(s.fromPersonKey) }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.swapWho}>{s.fromName}</Text>
                        <Text style={styles.swapMeta}>oddaje zmianę</Text>
                      </View>
                      <Badge label={weekLabel(s.weekStart)} color={t.colors.brandSecondary} />
                    </View>
                    <Text style={styles.swapShift}>{shiftLabel(s)}</Text>
                    {!!s.note && <Text style={styles.swapNote}>„{s.note}"</Text>}
                    {mine ? (
                      <Button
                        testID={`cancel-swap-${s.id}`}
                        title="Anuluj propozycję"
                        variant="ghost"
                        small
                        onPress={() => onCancel(s.id)}
                        style={{ marginTop: t.spacing.sm }}
                      />
                    ) : (
                      <Button
                        testID={`accept-swap-${s.id}`}
                        title="Przejmij zmianę"
                        small
                        loading={accept.isPending}
                        onPress={() => onAccept(s.id)}
                        icon={<Icon name="hand-back-right" size={16} color="#fff" />}
                        style={{ marginTop: t.spacing.sm }}
                      />
                    )}
                  </Card>
                );
              })
            )}

            {resolved.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Historia</Text>
                {resolved.map((s) => (
                  <Card key={s.id} style={styles.histCard}>
                    <Icon
                      name={s.status === 'accepted' ? 'check-circle' : 'close-circle'}
                      size={18}
                      color={s.status === 'accepted' ? t.colors.success : t.colors.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histText}>
                        {s.fromName} → {s.toName || '—'}
                      </Text>
                      <Text style={styles.histMeta}>
                        {shiftLabel(s)} · {weekLabel(s.weekStart)}
                      </Text>
                    </View>
                    <Badge
                      label={s.status === 'accepted' ? 'Przejęta' : 'Zakończona'}
                      color={s.status === 'accepted' ? t.colors.success : t.colors.muted}
                    />
                  </Card>
                ))}
              </>
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
  hint: { color: t.colors.muted, fontSize: t.font.base },
  sectionTitle: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900', marginTop: t.spacing.sm },
  swapCard: { gap: 4 },
  swapTop: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  swapWho: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  swapMeta: { color: t.colors.muted, fontSize: t.font.sm },
  swapShift: { color: t.colors.brandSecondary, fontSize: t.font.lg, fontWeight: '800', marginTop: 4 },
  swapNote: { color: t.colors.muted, fontSize: t.font.base, fontStyle: 'italic' },
  histCard: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  histText: { color: t.colors.onSurface, fontSize: t.font.base, fontWeight: '800' },
  histMeta: { color: t.colors.muted, fontSize: t.font.sm, marginTop: 2 },
}));
