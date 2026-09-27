import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '@/src/theme';

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.spacing.lg,
    paddingBottom: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  title: { color: t.colors.onSurface, fontSize: t.font['2xl'], fontWeight: '900', letterSpacing: 0.3 },
  subtitle: { color: t.colors.muted, fontSize: t.font.base, marginTop: 2 },
}));
