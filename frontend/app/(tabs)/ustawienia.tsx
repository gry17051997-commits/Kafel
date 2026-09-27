import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { Header } from '@/src/components/Header';
import { Icon } from '@/src/components/Icon';
import { Button, Card, Badge, Loading } from '@/src/components/ui';
import { useToast } from '@/src/components/Toast';
import { useUsers, useUserMutations } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { usesNativeTabs } from '@/src/navigation';
import { makeStyles, useTheme, workerColors } from '@/src/theme';
import { ApiError } from '@/src/api';
import type { User } from '@/src/constants';

const ROLES: { key: User['role']; label: string; icon: any }[] = [
  { key: 'employee', label: 'Pracownik', icon: 'account' },
  { key: 'locator', label: 'Lokalizator', icon: 'map-marker-account' },
  { key: 'admin', label: 'Administrator', icon: 'shield-crown' },
];
const PERSON_KEYS = ['', 'P', 'M', 'L'];

export default function UstawieniaScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, guest, isAdmin, logout } = useAuth();
  const usersQ = useUsers(isAdmin);
  const { create, update, remove } = useUserMutations();

  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const sheet = useRef<BottomSheet>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    personKey: '',
    role: 'employee' as User['role'],
  });
  const [err, setErr] = useState('');

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />,
    []
  );

  const openCreate = () => {
    setMode('create');
    setEditId(null);
    setErr('');
    setForm({ email: '', password: '', displayName: '', personKey: '', role: 'employee' });
    sheet.current?.expand();
  };

  const openEdit = (u: User) => {
    setMode('edit');
    setEditId(u.id);
    setErr('');
    setForm({ email: u.email, password: '', displayName: u.displayName, personKey: u.personKey, role: u.role });
    sheet.current?.expand();
  };

  const save = async () => {
    setErr('');
    if (!form.email.trim() || !form.displayName.trim()) {
      setErr('Podaj imię i e-mail');
      return;
    }
    try {
      if (mode === 'create') {
        if (form.password.length < 6) {
          setErr('Hasło musi mieć min. 6 znaków');
          return;
        }
        await create.mutateAsync(form);
        toast('Dodano użytkownika', 'success');
      } else {
        await update.mutateAsync({ id: editId!, body: form });
        toast('Zapisano zmiany', 'success');
      }
      sheet.current?.close();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Operacja nie powiodła się');
    }
  };

  const doRemove = async (u: User) => {
    try {
      await remove.mutateAsync(u.id);
      toast('Usunięto konto', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Nie udało się usunąć', 'error');
    }
  };

  const doLogout = async () => {
    await logout();
    router.replace('/sign-in');
  };

  const roleMeta = (r: User['role']) => ROLES.find((x) => x.key === r) || ROLES[0];

  return (
    <View style={styles.root}>
      <Header title="Ustawienia" />
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: bottomChrome + 24, gap: t.spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account card */}
        <Card testID="account-card">
          <Text style={styles.sectionLabel}>KONTO</Text>
          {user ? (
            <>
              <View style={styles.accountRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(user.displayName || user.email)[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>{user.displayName || user.email}</Text>
                  <Text style={styles.accountEmail}>{user.email}</Text>
                </View>
              </View>
              <View style={styles.badgeRow}>
                <Badge label={roleMeta(user.role).label} color={t.colors.brandSecondary} />
                {!!user.personKey && (
                  <Badge label={`Osoba ${user.personKey}`} color={workerColors[user.personKey]} />
                )}
              </View>
              <Button
                testID="logout-btn"
                title="Wyloguj się"
                variant="ghost"
                onPress={doLogout}
                icon={<Icon name="logout" size={18} color={t.colors.onSurface} />}
                style={{ marginTop: t.spacing.md }}
              />
            </>
          ) : (
            <>
              <Text style={styles.guestText}>Przeglądasz w trybie gościa (tylko podgląd).</Text>
              <Button
                testID="login-btn"
                title="Zaloguj się"
                onPress={doLogout}
                style={{ marginTop: t.spacing.md }}
              />
            </>
          )}
        </Card>

        {/* Admin users panel */}
        {isAdmin && (
          <Card testID="admin-panel">
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>PRACOWNICY I KONTA</Text>
                <Text style={styles.hint}>Dodawaj, edytuj role i przypisania.</Text>
              </View>
              <Button
                testID="add-user-btn"
                title="Dodaj"
                small
                onPress={openCreate}
                icon={<Icon name="plus" size={18} color="#fff" />}
              />
            </View>

            {usersQ.isLoading ? (
              <Loading />
            ) : (
              <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
                {(usersQ.data || []).map((u) => {
                  const rm = roleMeta(u.role);
                  const isSelf = u.id === user?.id;
                  return (
                    <View key={u.id} style={styles.userRow} testID={`user-${u.id}`}>
                      <View
                        style={[
                          styles.userDot,
                          { backgroundColor: u.personKey ? workerColors[u.personKey] : t.colors.borderStrong },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{u.displayName || u.email}</Text>
                        <View style={styles.userMetaRow}>
                          <Icon name={rm.icon} size={13} color={t.colors.muted} />
                          <Text style={styles.userMeta}>
                            {rm.label}
                            {u.personKey ? ` · ${u.personKey}` : ''}
                          </Text>
                        </View>
                      </View>
                      {isSelf ? (
                        <Text style={styles.selfTag}>TO TY</Text>
                      ) : (
                        <View style={styles.userActions}>
                          <Pressable testID={`edit-user-${u.id}`} onPress={() => openEdit(u)} style={styles.iconBtn}>
                            <Icon name="pencil" size={16} color={t.colors.onSurface} />
                          </Pressable>
                          <Pressable
                            testID={`del-user-${u.id}`}
                            onPress={() => doRemove(u)}
                            style={[styles.iconBtn, { backgroundColor: t.colors.error + '33' }]}
                          >
                            <Icon name="trash-can-outline" size={16} color={t.colors.error} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        <Card>
          <Text style={styles.sectionLabel}>O APLIKACJI</Text>
          <Text style={styles.hint}>
            Grafik Pracy — wspólny grafik zmian, zarobki i czat zespołu. Wersja 1.0.
          </Text>
        </Card>
      </ScrollView>

      {/* User form sheet */}
      <BottomSheet
        ref={sheet}
        index={-1}
        enablePanDownToClose
        enableDynamicSizing={false}
        snapPoints={['85%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: t.colors.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: t.colors.borderStrong }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: insets.bottom + 24, gap: t.spacing.md }}
        >
          <Text style={styles.sheetTitle}>
            {mode === 'create' ? 'Nowy pracownik' : 'Edycja pracownika'}
          </Text>

          <Field label="Imię i nazwisko" value={form.displayName} onChange={(v) => setForm((f) => ({ ...f, displayName: v }))} placeholder="np. Jan Kowalski" testID="uf-name" />
          <Field label="E-mail" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="pracownik@firma.pl" testID="uf-email" keyboardType="email-address" />
          <Field
            label={mode === 'create' ? 'Hasło (min. 6 znaków)' : 'Nowe hasło (opcjonalnie)'}
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            placeholder="••••••"
            secure
            testID="uf-password"
          />

          <Text style={styles.fieldLabel}>Przypisanie (osoba)</Text>
          <View style={styles.optRow}>
            {PERSON_KEYS.map((k) => (
              <Pressable
                key={k || 'none'}
                testID={`uf-person-${k || 'none'}`}
                onPress={() => setForm((f) => ({ ...f, personKey: k }))}
                style={[
                  styles.opt,
                  form.personKey === k && { backgroundColor: k ? workerColors[k] : t.colors.brandPrimary, borderColor: 'transparent' },
                ]}
              >
                <Text style={[styles.optText, form.personKey === k && { color: '#fff' }]}>{k || 'BRAK'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Rola</Text>
          <View style={styles.optRow}>
            {ROLES.map((r) => (
              <Pressable
                key={r.key}
                testID={`uf-role-${r.key}`}
                onPress={() => setForm((f) => ({ ...f, role: r.key }))}
                style={[styles.opt, form.role === r.key && { backgroundColor: t.colors.brandPrimary, borderColor: 'transparent' }]}
              >
                <Icon name={r.icon} size={15} color={form.role === r.key ? '#fff' : t.colors.muted} />
                <Text style={[styles.optText, form.role === r.key && { color: '#fff' }]}>{r.label}</Text>
              </Pressable>
            ))}
          </View>

          {!!err && <Text style={styles.err}>{err}</Text>}

          <Button
            testID="uf-save"
            title={mode === 'create' ? 'DODAJ KONTO' : 'ZAPISZ'}
            onPress={save}
            loading={create.isPending || update.isPending}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  keyboardType,
  testID,
}: any) {
  const t = useTheme();
  const styles = useStyles();
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.colors.muted}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        style={styles.input}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  sectionLabel: { color: t.colors.muted, fontSize: t.font.sm, fontWeight: '800', letterSpacing: 1 },
  hint: { color: t.colors.muted, fontSize: t.font.sm, marginTop: 4 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, marginTop: t.spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: t.colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: t.font.xl, fontWeight: '900' },
  accountName: { color: t.colors.onSurface, fontSize: t.font.lg, fontWeight: '900' },
  accountEmail: { color: t.colors.muted, fontSize: t.font.base, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: t.spacing.sm, marginTop: t.spacing.md },
  guestText: { color: t.colors.muted, fontSize: t.font.base, marginTop: t.spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    backgroundColor: t.colors.surfaceTertiary + '55',
    borderRadius: t.radius.md,
    padding: t.spacing.md,
  },
  userDot: { width: 12, height: 12, borderRadius: 6 },
  userName: { color: t.colors.onSurface, fontSize: t.font.base, fontWeight: '800' },
  userMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  userMeta: { color: t.colors.muted, fontSize: t.font.sm },
  userActions: { flexDirection: 'row', gap: t.spacing.sm },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfTag: { color: t.colors.brandSecondary, fontSize: t.font.sm, fontWeight: '900' },
  sheetTitle: { color: t.colors.onSurface, fontSize: t.font.xl, fontWeight: '900' },
  fieldLabel: { color: t.colors.onSurfaceSecondary, fontSize: t.font.sm, fontWeight: '800' },
  input: {
    backgroundColor: t.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    color: t.colors.onSurface,
    paddingHorizontal: t.spacing.md,
    height: 50,
    fontSize: t.font.lg,
  },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceTertiary,
  },
  optText: { color: t.colors.onSurfaceSecondary, fontWeight: '800', fontSize: t.font.base },
  err: { color: t.colors.error, fontSize: t.font.base, fontWeight: '700' },
}));
