import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { useAuth } from '@/src/auth';
import { useToast } from '@/src/components/Toast';
import { Button } from '@/src/components/ui';
import { Icon } from '@/src/components/Icon';
import { makeStyles, useTheme } from '@/src/theme';
import { ApiError } from '@/src/api';

const HERO =
  'https://images.unsplash.com/photo-1741655262435-4890ab9918fa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwyfHxkYXJrJTIwd2FyZWhvdXNlJTIwbG9naXN0aWMlMjBiYWNrZ3JvdW5kfGVufDB8fHx8MTc5MDQ5ODQ1N3ww&ixlib=rb-4.1.0&q=85';

export default function SignIn() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { login, register, continueGuest } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Podaj e-mail i hasło');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        if (password.length < 6) {
          setError('Hasło musi mieć min. 6 znaków');
          setBusy(false);
          return;
        }
        await register(email.trim(), password, displayName.trim());
      }
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Nie udało się zalogować';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    await continueGuest();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: HERO }} style={styles.bg} contentFit="cover" transition={300} />
      <LinearGradient
        colors={['rgba(15,23,42,0.45)', 'rgba(15,23,42,0.85)', '#0F172A']}
        locations={[0, 0.5, 1]}
        style={styles.scrim}
      />
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + height * 0.14 }]}>
          <View style={styles.logo}>
            <Icon name="calendar-clock" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.brand}>GRAFIK PRACY</Text>
          <Text style={styles.tagline}>Wspólny grafik zmian dla całej ekipy</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.tabs}>
            <Pressable
              testID="tab-login"
              onPress={() => setMode('login')}
              style={[styles.tab, mode === 'login' && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                Logowanie
              </Text>
            </Pressable>
            <Pressable
              testID="tab-register"
              onPress={() => setMode('register')}
              style={[styles.tab, mode === 'register' && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                Rejestracja
              </Text>
            </Pressable>
          </View>

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>Imię i nazwisko</Text>
              <TextInput
                testID="input-name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="np. Jan Kowalski"
                placeholderTextColor={t.colors.muted}
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="input-email"
              value={email}
              onChangeText={setEmail}
              placeholder="pracownik@firma.pl"
              placeholderTextColor={t.colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Hasło</Text>
            <TextInput
              testID="input-password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••"
              placeholderTextColor={t.colors.muted}
              secureTextEntry
              style={styles.input}
              onSubmitEditing={submit}
            />
          </View>

          {!!error && (
            <Text testID="auth-error" style={styles.error}>
              {error}
            </Text>
          )}

          <Button
            testID="submit-auth"
            title={mode === 'login' ? 'ZALOGUJ SIĘ' : 'UTWÓRZ KONTO'}
            onPress={submit}
            loading={busy}
            style={{ marginTop: 4 }}
          />

          <Pressable testID="guest-btn" onPress={guest} style={styles.guest}>
            <Icon name="eye-outline" size={18} color={t.colors.muted} />
            <Text style={styles.guestText}>Kontynuuj jako gość (podgląd)</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  bg: { ...(require('react-native').StyleSheet.absoluteFillObject), height: '55%' },
  scrim: { ...(require('react-native').StyleSheet.absoluteFillObject) },
  header: { alignItems: 'center', paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xl },
  logo: {
    width: 64,
    height: 64,
    borderRadius: t.radius.xl,
    backgroundColor: t.colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.spacing.md,
  },
  brand: { color: t.colors.onSurface, fontSize: 30, fontWeight: '900', letterSpacing: 1 },
  tagline: { color: t.colors.muted, fontSize: t.font.base, marginTop: 6 },
  form: {
    flex: 1,
    paddingHorizontal: t.spacing.xl,
    gap: t.spacing.md,
    marginTop: t.spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: t.colors.surfaceSecondary,
    borderRadius: t.radius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: t.radius.md, alignItems: 'center' },
  tabActive: { backgroundColor: t.colors.brandPrimary },
  tabText: { color: t.colors.muted, fontWeight: '800', fontSize: t.font.base },
  tabTextActive: { color: '#FFFFFF' },
  field: { gap: 6 },
  label: { color: t.colors.onSurfaceSecondary, fontSize: t.font.sm, fontWeight: '800' },
  input: {
    backgroundColor: t.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.lg,
    color: t.colors.onSurface,
    paddingHorizontal: t.spacing.md,
    height: 52,
    fontSize: t.font.lg,
  },
  error: { color: t.colors.error, fontSize: t.font.base, fontWeight: '700' },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.md,
  },
  guestText: { color: t.colors.muted, fontSize: t.font.base, fontWeight: '700' },
}));
