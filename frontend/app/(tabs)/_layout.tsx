import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/auth';
import { usesNativeTabs } from '@/src/navigation';
import { Icon } from '@/src/components/Icon';
import { colors, useTheme } from '@/src/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { user, guest, loading } = useAuth();

  if (loading) return null;
  if (!user && !guest) return <Redirect href="/sign-in" />;

  const role = user?.role;
  const showGrafik = role !== 'locator';
  const showChat = !!user; // chat needs an account

  if (usesNativeTabs) {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="bolt.circle.fill" />
          <NativeTabs.Trigger.Label>Teraz</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="grafik" hidden={!showGrafik}>
          <NativeTabs.Trigger.Icon sf="calendar" />
          <NativeTabs.Trigger.Label>Grafik</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="podsumowanie">
          <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
          <NativeTabs.Trigger.Label>Zarobki</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="czat" hidden={!showChat}>
          <NativeTabs.Trigger.Icon sf="message.fill" />
          <NativeTabs.Trigger.Label>Czat</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="ustawienia">
          <NativeTabs.Trigger.Icon sf="gearshape.fill" />
          <NativeTabs.Trigger.Label>Ustawienia</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandSecondary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === 'web' ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: 'center' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Teraz',
          tabBarIcon: ({ color, size }) => <Icon name="lightning-bolt" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="grafik"
        options={{
          title: 'Grafik',
          href: showGrafik ? undefined : null,
          tabBarIcon: ({ color, size }) => <Icon name="calendar-month" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="podsumowanie"
        options={{
          title: 'Zarobki',
          tabBarIcon: ({ color, size }) => <Icon name="chart-bar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="czat"
        options={{
          title: 'Czat',
          href: showChat ? undefined : null,
          tabBarIcon: ({ color, size }) => <Icon name="chat" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="ustawienia"
        options={{
          title: 'Ustawienia',
          tabBarIcon: ({ color, size }) => <Icon name="cog" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
