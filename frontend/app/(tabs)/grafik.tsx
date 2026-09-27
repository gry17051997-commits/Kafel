import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Header } from '@/src/components/Header';
import { Icon } from '@/src/components/Icon';
import { Button, Loading } from '@/src/components/ui';
import { useToast } from '@/src/components/Toast';
import {
  useWeek,
  useSaveWeek,
  useGenerateWeek,
  useGenerateMulti,
  useClearShift,
  useLockWeek,
  usePeople,
  useSettings,
  useMeta,
  useSwapMutations,
} from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { router } from 'expo-router';
import { usesNativeTabs } from '@/src/navigation';
import { makeStyles, useTheme, workerColors } from '@/src/theme';
import {
  monday,
  iso,
  fromIso,
  addDays,
  DAYS,
  DAYS_SHORT,
  weekLabel,
  shiftTime,
  HOURS_OPTIONS,
  type Week,
} from '@/src/constants';

const PERSON_OPTIONS = ['P', 'M', 'L'];

export default function GrafikScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { canEdit, user } = useAuth();

  const [weekStartDate, setWeekStartDate] = useState(() => monday(new Date()));
  const weekStart = iso(weekStartDate);
  const todayIso = iso(monday(new Date()));

  const weekQ = useWeek(weekStart);
  const peopleQ = usePeople();
  const settingsQ = useSettings();
  const metaQ = useMeta();
  const saveWeek = useSaveWeek(weekStart);
  const generateWeek = useGenerateWeek(weekStart);
  const generateMulti = useGenerateMulti();
  const clearShift = useClearShift(weekStart);
  const lockWeek = useLockWeek(weekStart);
  const { create: createSwap } = useSwapMutations();

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const times = settingsQ.data?.times;
  const people = peopleQ.data || {};
  const warehouses: string[] = metaQ.data?.warehouses || ['PNT B'];

  const [draft, setDraft] = useState<Week | null>(null);
  useEffect(() => {
    if (weekQ.data) setDraft(weekQ.data);
  }, [weekQ.data]);

  const colorFor = (pk?: string | null) =>
    pk ? people[pk]?.color || workerColors[pk] || t.colors.brandPrimary : t.colors.borderStrong;
  const nameFor = (pk?: string | null) => (pk ? people[pk]?.name || pk : 'Wolne');

  const todayDayIndex = weekStart === todayIso ? (new Date().getDay() + 6) % 7 : -1;

  // ----- shift editor sheet -----
  const editSheet = useRef<BottomSheet>(null);
  const genSheet = useRef<BottomSheet>(null);
  const swapSheet = useRef<BottomSheet>(null);
  const [editing, setEditing] = useState<{ dayIndex: number; shift: number } | null>(null);
  const [genOpts, setGenOpts] = useState({ hours: 10, rotation: 'P', warehouse: 'PNT B' });
  const [genCount, setGenCount] = useState(1);
  const [swapNote, setSwapNote] = useState('');
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; shift: number } | null>(null);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  const openEditor = (dayIndex: number, shift: number) => {
    if (locked) {
      toast('Tydzień jest zatwierdzony (zablokowany)', 'info');
      return;
    }
    if (canEdit) {
      setEditing({ dayIndex, shift });
      editSheet.current?.expand();
      return;
    }
    // Employees can propose a swap for their own shift.
    const day = draft?.days.find((d) => d.dayIndex === dayIndex);
    const s = day?.shifts.find((x) => x.shift === shift);
    if (user?.personKey && s?.person === user.personKey) {
      setSwapTarget({ dayIndex, shift });
      setSwapNote('');
      swapSheet.current?.expand();
    }
  };

  const proposeSwap = async () => {
    if (!swapTarget) return;
    try {
      await createSwap.mutateAsync({
        weekStart,
        dayIndex: swapTarget.dayIndex,
        shift: swapTarget.shift,
        note: swapNote.trim(),
      });
      toast('Propozycja zamiany wysłana', 'success');
      swapSheet.current?.close();
    } catch (e: any) {
      toast(e?.message || 'Nie udało się wysłać propozycji', 'error');
    }
  };

  const persist = async (next: Week) => {
    setDraft(next);
    try {
      await saveWeek.mutateAsync({
        hours: next.hours,
        rotation: next.rotation,
        warehouse: next.warehouse,
        days: next.days,
      });
    } catch {
      toast('Nie udało się zapisać zmiany', 'error');
    }
  };

  const setPerson = (person: string | null) => {
    if (!draft || !editing) return;
    const next: Week = {
      ...draft,
      days: draft.days.map((d) =>
        d.dayIndex === editing.dayIndex
          ? {
              ...d,
              shifts: d.shifts.map((s) =>
                s.shift === editing.shift ? { ...s, person, manual: true } : s
              ),
            }
          : d
      ),
    };
    persist(next);
    toast(person ? `Przypisano: ${nameFor(person)}` : 'Zmiana zwolniona', 'success');
    editSheet.current?.close();
  };

  const setWarehouse = (warehouse: string) => {
    if (!draft || !editing) return;
    const next: Week = {
      ...draft,
      days: draft.days.map((d) =>
        d.dayIndex === editing.dayIndex
          ? {
              ...d,
              warehouse,
              shifts: d.shifts.map((s) =>
                s.shift === editing.shift ? { ...s, warehouse } : s
              ),
            }
          : d
      ),
    };
    persist(next);
  };

  const doGenerate = async () => {
    try {
      if (genCount > 1) {
        const res = await generateMulti.mutateAsync({
          startWeek: weekStart,
          count: genCount,
          hours: genOpts.hours,
          rotation: genOpts.rotation,
          warehouse: genOpts.warehouse,
          alternateRotation: true,
        });
        toast(`Wygenerowano ${res.count} tygodni`, 'success');
      } else {
        await generateWeek.mutateAsync(genOpts);
        toast('Grafik wygenerowany', 'success');
      }
      genSheet.current?.close();
    } catch {
      toast('Nie udało się wygenerować grafiku', 'error');
    }
  };

  const doClear = async (shift: number) => {
    try {
      await clearShift.mutateAsync(shift);
      toast(`Wyczyszczono zmianę ${shift === 1 ? 'I' : 'II'}`, 'success');
    } catch {
      toast('Nie udało się wyczyścić', 'error');
    }
  };

  const locked = !!draft?.locked;
  const doLock = async () => {
    try {
      await lockWeek.mutateAsync(!locked);
      toast(locked ? 'Tydzień odblokowany' : 'Tydzień zatwierdzony', 'success');
    } catch (e: any) {
      toast(e?.message || 'Nie udało się zmienić statusu', 'error');
    }
  };

  const stats = useMemo(() => {
    const d = draft?.days || [];
    let filled = 0;
    let total = 0;
    d.forEach((day) =>
      day.shifts.forEach((s) => {
        total++;
        if (s.person) filled++;
      })
    );
    return { filled, free: total - filled, total };
  }, [draft]);

  const currentShift = editing
    ? draft?.days[editing.dayIndex]?.shifts.find((s) => s.shift === editing.shift)
    : null;

  return (
    <View style={styles.root}>
      <Header
        title="Grafik"
        subtitle={weekLabel(weekStart)}
        right={
          user ? (
            <Pressable
              testID="open-swaps"
              onPress={() => router.push('/swaps')}
              style={styles.headerBtn}
            >
              <Icon name="swap-horizontal" size={20} color={t.colors.onSurface} />
            </Pressable>
          ) : undefined
        }
      />

      {/* Sticky week navigator */}
      <View style={styles.nav}>
        <Pressable
          testID="prev-week"
          onPress={() => setWeekStartDate((d) => addDays(d, -7))}
          style={styles.navBtn}
        >
          <Icon name="chevron-left" size={24} color={t.colors.onSurface} />
        </Pressable>
        <View style={styles.navCenter}>
          <Text style={styles.navLabel}>{weekLabel(weekStart)}</Text>
          {locked ? (
            <View style={styles.lockedRow}>
              <Icon name="lock" size={13} color={t.colors.warning} />
              <Text style={styles.lockedText}>Zatwierdzony</Text>
            </View>
          ) : weekStart !== todayIso ? (
            <Pressable testID="today-btn" onPress={() => setWeekStartDate(monday(new Date()))}>
              <Text style={styles.todayLink}>Wróć do bieżącego tygodnia</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          testID="next-week"
          onPress={() => setWeekStartDate((d) => addDays(d, 7))}
          style={styles.navBtn}
        >
          <Icon name="chevron-right" size={24} color={t.colors.onSurface} />
        </Pressable>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: t.colors.success }]}>{stats.filled}</Text>
          <Text style={styles.statLabel}>obsadzone</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statNum, { color: t.colors.warning }]}>{stats.free}</Text>
          <Text style={styles.statLabel}>wolne</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statNum}>{draft?.hours || 10}h</Text>
          <Text style={styles.statLabel}>system</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: bottomChrome + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={weekQ.isFetching} onRefresh={() => weekQ.refetch()} tintColor={t.colors.brandPrimary} />
        }
      >
        {weekQ.isLoading || !draft ? (
          <Loading label="Ładuję grafik..." />
        ) : (
          <>
            {canEdit && (
              <View style={styles.adminBar}>
                <Button
                  testID="generate-btn"
                  title="Generuj"
                  small
                  variant="secondary"
                  icon={<Icon name="auto-fix" size={18} color={t.colors.onSurface} />}
                  onPress={() => {
                    if (locked) {
                      toast('Odblokuj tydzień, aby generować', 'info');
                      return;
                    }
                    setGenOpts({ hours: draft.hours, rotation: draft.rotation, warehouse: draft.warehouse });
                    genSheet.current?.expand();
                  }}
                  disabled={locked}
                  style={{ flex: 1 }}
                />
                <Button
                  testID="clear-1"
                  title="Wyczyść I"
                  small
                  variant="ghost"
                  onPress={() => doClear(1)}
                  disabled={locked}
                  style={{ flex: 1 }}
                />
                <Button
                  testID="clear-2"
                  title="Wyczyść II"
                  small
                  variant="ghost"
                  onPress={() => doClear(2)}
                  disabled={locked}
                  style={{ flex: 1 }}
                />
              </View>
            )}

            {canEdit && (
              <Button
                testID="lock-btn"
                title={locked ? 'Odblokuj tydzień' : 'Zatwierdź tydzień'}
                variant={locked ? 'secondary' : 'primary'}
                loading={lockWeek.isPending}
                onPress={doLock}
                icon={<Icon name={locked ? 'lock-open-variant' : 'lock-check'} size={18} color={locked ? t.colors.onSurface : '#fff'} />}
              />
            )}

            {draft.days.map((day) => {
              const isToday = day.dayIndex === todayDayIndex;
              const date = addDays(fromIso(weekStart), day.dayIndex);
              return (
                <View key={day.dayIndex} style={[styles.dayCard, isToday && styles.dayToday]}>
                  <View style={styles.dayHead}>
                    <Text style={[styles.dayName, isToday && { color: t.colors.brandSecondary }]}>
                      {DAYS[day.dayIndex]}
                    </Text>
                    <View style={styles.dayHeadRight}>
                      {isToday && (
                        <View style={styles.todayBadge}>
                          <Text style={styles.todayBadgeText}>DZIŚ</Text>
                        </View>
                      )}
                      <Text style={styles.dayDate}>
                        {DAYS_SHORT[day.dayIndex]} {date.getDate()}.{String(date.getMonth() + 1).padStart(2, '0')}
                      </Text>
                    </View>
                  </View>

                  {day.shifts.map((s) => {
                    const canTap = canEdit || (!!user?.personKey && s.person === user.personKey);
                    return (
                    <Pressable
                      key={s.id}
                      testID={`shift-${day.dayIndex}-${s.shift}`}
                      onPress={() => openEditor(day.dayIndex, s.shift)}
                      disabled={!canTap}
                      style={({ pressed }) => [styles.shiftRow, pressed && canTap && { opacity: 0.7 }]}
                    >
                      <View style={[styles.shiftBar, { backgroundColor: colorFor(s.person) }]} />
                      <View style={styles.shiftBody}>
                        <View style={styles.shiftTopRow}>
                          <Text style={styles.shiftLabel}>ZMIANA {s.shift === 1 ? 'I' : 'II'}</Text>
                          <Text style={styles.shiftTime}>{shiftTime(times, s.shift)}</Text>
                        </View>
                        <View style={styles.shiftBottomRow}>
                          <Text
                            style={[
                              styles.shiftPerson,
                              { color: s.person ? colorFor(s.person) : t.colors.muted },
                            ]}
                          >
                            {nameFor(s.person)}
                          </Text>
                          <View style={styles.shiftWh}>
                            <Icon name="map-marker" size={13} color={t.colors.muted} />
                            <Text style={styles.shiftWhText}>{s.warehouse}</Text>
                          </View>
                        </View>
                      </View>
                      {canEdit ? (
                        <Icon name="pencil" size={16} color={t.colors.muted} />
                      ) : !canEdit && user?.personKey && s.person === user.personKey ? (
                        <Icon name="swap-horizontal" size={16} color={t.colors.brandSecondary} />
                      ) : null}
                    </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Shift editor bottom sheet */}
      <BottomSheet
        ref={editSheet}
        index={-1}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: t.colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: t.colors.borderStrong }}
      >
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.sheetTitle}>
            {editing ? `${DAYS[editing.dayIndex]} · Zmiana ${editing.shift === 1 ? 'I' : 'II'}` : ''}
          </Text>
          <Text style={styles.sheetSub}>Kto pracuje na tej zmianie?</Text>
          <View style={styles.optRow}>
            {PERSON_OPTIONS.map((pk) => (
              <Pressable
                key={pk}
                testID={`assign-${pk}`}
                onPress={() => setPerson(pk)}
                style={[
                  styles.personOpt,
                  { borderColor: colorFor(pk) },
                  currentShift?.person === pk && { backgroundColor: colorFor(pk) },
                ]}
              >
                <View style={[styles.optDot, { backgroundColor: colorFor(pk) }]} />
                <Text
                  style={[
                    styles.personOptText,
                    currentShift?.person === pk && { color: '#fff' },
                  ]}
                >
                  {nameFor(pk)}
                </Text>
              </Pressable>
            ))}
            <Pressable
              testID="assign-none"
              onPress={() => setPerson(null)}
              style={[styles.personOpt, { borderColor: t.colors.borderStrong }]}
            >
              <Icon name="close" size={16} color={t.colors.muted} />
              <Text style={styles.personOptText}>Wolne</Text>
            </Pressable>
          </View>

          <Text style={[styles.sheetSub, { marginTop: t.spacing.lg }]}>Magazyn</Text>
          <View style={styles.whWrap}>
            {warehouses.map((w) => (
              <Pressable
                key={w}
                testID={`wh-${w}`}
                onPress={() => setWarehouse(w)}
                style={[styles.whChip, currentShift?.warehouse === w && styles.whChipActive]}
              >
                <Text
                  style={[
                    styles.whChipText,
                    currentShift?.warehouse === w && { color: '#fff' },
                  ]}
                >
                  {w}
                </Text>
              </Pressable>
            ))}
          </View>
        </BottomSheetView>
      </BottomSheet>

      {/* Generate options bottom sheet */}
      <BottomSheet
        ref={genSheet}
        index={-1}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: t.colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: t.colors.borderStrong }}
      >
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.sheetTitle}>Generuj grafik</Text>
          <Text style={styles.sheetSub}>Nadpisze obsadę w tym tygodniu (Pon–Sob).</Text>

          <Text style={styles.optCat}>System godzin</Text>
          <View style={styles.optRow}>
            {HOURS_OPTIONS.map((h) => (
              <Pressable
                key={h}
                testID={`gen-hours-${h}`}
                onPress={() => setGenOpts((o) => ({ ...o, hours: h }))}
                style={[styles.genChip, genOpts.hours === h && styles.genChipActive]}
              >
                <Text style={[styles.genChipText, genOpts.hours === h && { color: '#fff' }]}>{h}h</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.optCat}>Rotacja (kto pierwszy na I zmianie)</Text>
          <View style={styles.optRow}>
            {['P', 'M'].map((r) => (
              <Pressable
                key={r}
                testID={`gen-rot-${r}`}
                onPress={() => setGenOpts((o) => ({ ...o, rotation: r }))}
                style={[styles.genChip, genOpts.rotation === r && styles.genChipActive]}
              >
                <Text style={[styles.genChipText, genOpts.rotation === r && { color: '#fff' }]}>
                  {nameFor(r)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.optCat}>Domyślny magazyn</Text>
          <View style={styles.whWrap}>
            {warehouses.map((w) => (
              <Pressable
                key={w}
                testID={`gen-wh-${w}`}
                onPress={() => setGenOpts((o) => ({ ...o, warehouse: w }))}
                style={[styles.whChip, genOpts.warehouse === w && styles.whChipActive]}
              >
                <Text style={[styles.whChipText, genOpts.warehouse === w && { color: '#fff' }]}>{w}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.optCat}>Ile tygodni naprzód?</Text>
          <View style={styles.optRow}>
            {[1, 2, 4, 8].map((c) => (
              <Pressable
                key={c}
                testID={`gen-count-${c}`}
                onPress={() => setGenCount(c)}
                style={[styles.genChip, genCount === c && styles.genChipActive]}
              >
                <Text style={[styles.genChipText, genCount === c && { color: '#fff' }]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          {genCount > 1 && (
            <Text style={styles.hintText}>
              Rotacja będzie naprzemienna w kolejnych tygodniach.
            </Text>
          )}

          <Button
            testID="gen-confirm"
            title={genCount > 1 ? `GENERUJ ${genCount} TYGODNI` : 'GENERUJ'}
            onPress={doGenerate}
            loading={generateWeek.isPending || generateMulti.isPending}
            style={{ marginTop: t.spacing.lg }}
          />
        </BottomSheetView>
      </BottomSheet>

      {/* Swap proposal bottom sheet (employees) */}
      <BottomSheet
        ref={swapSheet}
        index={-1}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: t.colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: t.colors.borderStrong }}
      >
        <BottomSheetView style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.sheetTitle}>Zaproponuj zamianę</Text>
          <Text style={styles.sheetSub}>
            {swapTarget
              ? `${DAYS[swapTarget.dayIndex]} · Zmiana ${swapTarget.shift === 1 ? 'I' : 'II'}`
              : ''}
          </Text>
          <Text style={styles.sheetSub}>
            Zmiana pojawi się w „Zamiany" — kolega z ekipy może ją przejąć.
          </Text>
          <BottomSheetTextInput
            testID="swap-note"
            value={swapNote}
            onChangeText={setSwapNote}
            placeholder="Notatka (opcjonalnie), np. powód zamiany"
            placeholderTextColor={t.colors.muted}
            style={styles.noteInput}
          />
          <Button
            testID="swap-confirm"
            title="WYŚLIJ PROPOZYCJĘ"
            onPress={proposeSwap}
            loading={createSwap.isPending}
            style={{ marginTop: t.spacing.md }}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  hintText: { color: t.colors.muted, fontSize: t.font.sm, marginTop: t.spacing.sm },
  noteInput: {
    backgroundColor: t.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    color: t.colors.onSurface,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.md,
    fontSize: t.font.base,
    marginTop: t.spacing.md,
    minHeight: 48,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
    backgroundColor: t.colors.surface,
    gap: t.spacing.sm,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  navCenter: { flex: 1, alignItems: 'center' },
  navLabel: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  todayLink: { color: t.colors.brandSecondary, fontSize: t.font.sm, fontWeight: '700', marginTop: 2 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  lockedText: { color: t.colors.warning, fontSize: t.font.sm, fontWeight: '800' },
  statsStrip: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  statPill: {
    flex: 1,
    backgroundColor: t.colors.surfaceSecondary,
    borderRadius: t.radius.md,
    paddingVertical: t.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  statNum: { color: t.colors.onSurface, fontSize: t.font.xl, fontWeight: '900' },
  statLabel: { color: t.colors.muted, fontSize: t.font.sm },
  adminBar: { flexDirection: 'row', gap: t.spacing.sm },
  dayCard: {
    backgroundColor: t.colors.surfaceSecondary,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    overflow: 'hidden',
  },
  dayToday: { borderColor: t.colors.brandPrimary, borderWidth: 2 },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    backgroundColor: t.colors.surfaceTertiary + '55',
  },
  dayName: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  dayHeadRight: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  todayBadge: {
    backgroundColor: t.colors.brandPrimary,
    borderRadius: t.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  dayDate: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '700' },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: t.spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
  },
  shiftBar: { width: 5, alignSelf: 'stretch' },
  shiftBody: { flex: 1, paddingVertical: t.spacing.md, paddingLeft: t.spacing.md, gap: 4 },
  shiftTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shiftLabel: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '800', letterSpacing: 0.5 },
  shiftTime: { color: t.colors.onSurfaceSecondary, fontSize: t.font.base, fontWeight: '800' },
  shiftBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shiftPerson: { fontSize: t.font.lg, fontWeight: '800' },
  shiftWh: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shiftWhText: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '700' },
  /* sheets */
  sheet: { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.sm, gap: t.spacing.sm },
  sheetTitle: { color: t.colors.onSurface, fontSize: t.font.xl, fontWeight: '900' },
  sheetSub: { color: t.colors.muted, fontSize: t.font.base },
  optCat: { color: t.colors.onSurfaceSecondary, fontSize: t.font.sm, fontWeight: '800', marginTop: t.spacing.md },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.sm },
  personOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.lg,
    borderWidth: 2,
    backgroundColor: t.colors.surfaceTertiary,
  },
  optDot: { width: 12, height: 12, borderRadius: 6 },
  personOptText: { color: t.colors.onSurface, fontSize: t.font.base, fontWeight: '800' },
  whWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.sm },
  whChip: {
    paddingVertical: 8,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.pill,
    backgroundColor: t.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  whChipActive: { backgroundColor: t.colors.brandPrimary, borderColor: t.colors.brandPrimary },
  whChipText: { color: t.colors.onSurfaceSecondary, fontWeight: '800', fontSize: t.font.base },
  genChip: {
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.xl,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  genChipActive: { backgroundColor: t.colors.brandPrimary, borderColor: t.colors.brandPrimary },
  genChipText: { color: t.colors.onSurfaceSecondary, fontWeight: '800', fontSize: t.font.lg },
}));
