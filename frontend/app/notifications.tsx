import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icon } from '@/src/components/Icon';
import { Card, Loading } from '@/src/components/ui';
import { useNotifications } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { storage } from '@/src/utils/storage';
import { makeStyles, useTheme } from '@/src/theme';

export const NOTIF_SEEN_KEY = 'grafik_notif_seen';

const ICONS: Record<string, any> = {
  swap_new: 'swap-horizontal',
  swap_accepted: 'hand-back-right',
  lock: 'lock-check',
};

export default function NotificationsScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const notifQ = useNotifications(!!user);
  const list: any[] = notifQ.data || [];

  useEffect(() => {
    storage.setItem(NOTIF_SEEN_KEY, new Date().toISOString());
  }, [list.length]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(
      d.getHours()
    ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={t.colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Powiadomienia</Text>
          <Text style={styles.subtitle}>Zamiany zmian i zmiany grafiku</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: insets.bottom + 24, gap: t.spacing.sm }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={notifQ.isFetching} onRefresh={() => notifQ.refetch()} tintColor={t.colors.brandPrimary} />
        }
      >
        {notifQ.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="bell-off-outline" size={40} color={t.colors.muted} />
            <Text style={styles.emptyText}>Brak powiadomień.</Text>
          </View>
        ) : (
          list.map((n) => (
            <Card key={n.id} style={styles.row} testID={`notif-${n.id}`}>
              <View style={styles.iconWrap}>
                <Icon name={ICONS[n.type] || 'bell'} size={18} color={t.colors.brandSecondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>{n.text}</Text>
                <Text style={styles.time}>{fmt(n.createdAt)}</Text>
              </View>
            </Card>
          ))
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
  empty: { alignItems: 'center', gap: t.spacing.md, paddingTop: 80 },
  emptyText: { color: t.colors.muted, fontSize: t.font.base },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: t.colors.onSurface, fontSize: t.font.base, fontWeight: '700', lineHeight: 20 },
  time: { color: t.colors.muted, fontSize: t.font.sm, marginTop: 3 },
}));
