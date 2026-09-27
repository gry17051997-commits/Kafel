import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/src/auth';
import { ToastProvider } from '@/src/components/Toast';
import { colors } from '@/src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: String(error?.message || error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorRoot}>
          <Text style={styles.errorTitle}>Coś poszło nie tak</Text>
          <Text style={styles.errorText}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Prewarm the icon font so glyphs render immediately on first paint.
    MaterialDesignIcons: require('@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf'),
  });

  React.useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <BottomSheetModalProvider>
                  <ToastProvider>
                    <StatusBar style="light" />
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: colors.surface },
                        animation: 'fade',
                      }}
                    >
                      <Stack.Screen name="index" />
                      <Stack.Screen name="sign-in" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="podsumowanie" options={{ presentation: 'card' }} />
                      <Stack.Screen name="swaps" options={{ presentation: 'card' }} />
                      <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
                    </Stack>
                  </ToastProvider>
                </BottomSheetModalProvider>
              </AuthProvider>
            </QueryClientProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: { color: colors.onSurface, fontSize: 22, fontWeight: '900', marginBottom: 8 },
  errorText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
