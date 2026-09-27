import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { makeStyles, useTheme } from '@/src/theme';

/* ---------------- Button ---------------- */
type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
  small?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  testID,
  small,
}: BtnProps) {
  const s = useBtnStyles();
  const t = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary'
      ? s.primary
      : variant === 'danger'
      ? s.danger
      : variant === 'secondary'
      ? s.secondary
      : s.ghost;
  const textColor =
    variant === 'ghost'
      ? t.colors.onSurface
      : variant === 'secondary'
      ? t.colors.onSurface
      : '#FFFFFF';

  const handle = () => {
    if (isDisabled) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.base,
        small && s.small,
        bg,
        isDisabled && s.disabled,
        pressed && !isDisabled && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={s.row}>
          {icon}
          <Text style={[s.text, small && s.textSmall, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useBtnStyles = makeStyles((t) => ({
  base: {
    height: 52,
    borderRadius: t.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.lg,
  },
  small: { height: 42, paddingHorizontal: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  primary: { backgroundColor: t.colors.brandPrimary },
  danger: { backgroundColor: t.colors.error },
  secondary: { backgroundColor: t.colors.surfaceTertiary },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.colors.border },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  text: { fontSize: t.font.lg, fontWeight: '800', letterSpacing: 0.3 },
  textSmall: { fontSize: t.font.base },
}));

/* ---------------- Card ---------------- */
export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const s = useCardStyles();
  return (
    <View style={[s.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surfaceSecondary,
    borderRadius: t.radius.lg,
    padding: t.spacing.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
}));

/* ---------------- Badge ---------------- */
export function Badge({
  label,
  color,
  textStyle,
}: {
  label: string;
  color?: string;
  textStyle?: TextStyle;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: (color || t.colors.surfaceTertiary) + '22',
        borderColor: color || t.colors.borderStrong,
        borderWidth: 1,
        borderRadius: t.radius.pill,
        paddingVertical: 3,
        paddingHorizontal: 10,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={[
          { color: color || t.colors.muted, fontSize: t.font.sm, fontWeight: '800' },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/* ---------------- Empty / Loading ---------------- */
export function Loading({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: t.spacing['3xl'], alignItems: 'center', gap: t.spacing.md }}>
      <ActivityIndicator color={t.colors.brandPrimary} size="large" />
      {label ? (
        <Text style={{ color: t.colors.muted, fontSize: t.font.base }}>{label}</Text>
      ) : null}
    </View>
  );
}
