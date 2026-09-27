import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { makeStyles } from '@/src/theme';
import { Icon } from './Icon';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; text: string; kind: ToastKind };

const Ctx = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const insets = useSafeAreaInsets();
  const styles = useStyles();

  const show = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="none">
        {items.map((t) => (
          <Animated.View
            key={t.id}
            entering={FadeInDown}
            exiting={FadeOutUp}
            style={[styles.toast, styles[t.kind]]}
            testID={`toast-${t.kind}`}
          >
            <Icon
              name={t.kind === 'success' ? 'check-circle' : t.kind === 'error' ? 'alert-circle' : 'information'}
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.text}>{t.text}</Text>
          </Animated.View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    position: 'absolute',
    left: t.spacing.md,
    right: t.spacing.md,
    alignItems: 'center',
    gap: t.spacing.sm,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radius.lg,
    maxWidth: 480,
    width: '100%',
  },
  success: { backgroundColor: t.colors.success },
  error: { backgroundColor: t.colors.error },
  info: { backgroundColor: t.colors.brandPrimary },
  text: { color: '#FFFFFF', fontSize: t.font.base, fontWeight: '700', flex: 1 },
}));
