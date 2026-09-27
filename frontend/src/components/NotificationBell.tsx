import React, { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Icon } from './Icon';
import { useNotifications } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { storage } from '@/src/utils/storage';
import { makeStyles, useTheme } from '@/src/theme';
import { NOTIF_SEEN_KEY } from '@/app/notifications';

export function NotificationBell() {
  const t = useTheme();
  const styles = useStyles();
  const { user } = useAuth();
  const notifQ = useNotifications(!!user);
  const [seen, setSeen] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      storage.getItem(NOTIF_SEEN_KEY).then((v) => setSeen(v || ''));
    }, [])
  );

  if (!user) return null;

  const list: any[] = notifQ.data || [];
  const unread = seen ? list.filter((n) => n.createdAt > seen).length : list.length;

  return (
    <Pressable
      testID="notif-bell"
      onPress={() => router.push('/notifications')}
      style={styles.btn}
    >
      <Icon name="bell-outline" size={22} color={t.colors.onSurface} />
      {unread > 0 && (
        <View style={styles.badge} testID="notif-badge">
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  btn: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: t.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
}));
