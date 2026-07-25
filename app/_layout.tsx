import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Platform, Text, TextInput } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme } from 'expo-router/react-navigation';

// react-native-screens paints the native screen container with
// theme.colors.background. Default light theme = white flashes during tab
// swipes. Force the app's dark surface so every transition frame stays dark.
const AppDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#0D0D0D', card: '#0D0D0D' },
};

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import OnboardingFlow from '../components/OnboardingFlow';
import AuthScreen from '../components/AuthScreen';
import SetNewPassword from '../components/SetNewPassword';
import PaywallScreen from '../components/PaywallScreen';
import ToastHost from '../components/ToastHost';
import SyncIndicator from '../components/SyncIndicator';
import { supabase } from '../lib/supabase';
import { setProfile } from '../lib/storage';
import { getSetup, refreshSetup } from '../lib/setup';
import { getDashboard, refreshDashboard } from '../lib/dashboard';
import { getInvestments, refreshInvestments } from '../lib/investments';
import { getSavings, refreshSavings } from '../lib/savings';
import { getDebts, refreshDebts } from '../lib/debts';
import { getRevenue, refreshRevenue } from '../lib/revenue';
import { getCurrencySettings, refreshCurrencySettings } from '../lib/currency';
import { getRates, refreshRatesInBackground } from '../lib/exchangeRates';
import { resolveAccess } from '../lib/access';
import { getProjects, refreshProjects } from '../lib/projects';
import { getTransactions, refreshTransactions } from '../lib/transactions';
import { getWealthVisibility } from '../lib/wealth';
import { getDropdowns } from '../lib/dropdowns';
import { getAssets, refreshAssets } from '../lib/assets';
import { setCachedUserEmail } from '../lib/userProfile';

type Phase = 'loading' | 'signed-out' | 'recovery' | 'onboarding' | 'paywall' | 'ready';

// Pull a key=value out of "#a=1&b=2" or "?a=1&b=2"
function readParam(key: string, raw: string): string | null {
  const stripped = raw.startsWith('#') || raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(stripped);
  return params.get(key);
}

// Supabase puts recovery tokens in the URL fragment (#...) on web, and either
// fragment or query on native depending on the redirect scheme. Try both.
function extractRecovery(url: string): { access: string; refresh: string } | null {
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');
  const candidates = [
    hashIdx >= 0 ? url.slice(hashIdx + 1) : '',
    queryIdx >= 0 ? url.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : '',
  ].filter(Boolean);
  for (const c of candidates) {
    const type = readParam('type', c);
    const access = readParam('access_token', c);
    const refresh = readParam('refresh_token', c);
    if (type === 'recovery' && access && refresh) return { access, refresh };
  }
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Geist: require('../assets/fonts/Geist_500Medium.ttf'),
    'Geist-SemiBold': require('../assets/fonts/Geist_600SemiBold.ttf'),
    'Geist-Bold': require('../assets/fonts/Geist_700Bold.ttf'),
  });
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    if (!fontsLoaded) return;
    // Default every JS text/input surface to the new Geist family. Individual
    // screens can still opt into the semibold/bold faces where needed.
    (Text as any).defaultProps = { ...(Text as any).defaultProps, style: [{ fontFamily: 'Geist' }, (Text as any).defaultProps?.style] };
    (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, style: [{ fontFamily: 'Geist' }, (TextInput as any).defaultProps?.style] };
  }, [fontsLoaded]);

  useEffect(() => {
    let cancelled = false;
    let inRecovery = false;

    const apply = async (userId: string | null, email?: string | null) => {
      if (!userId) {
        setProfile('anonymous');
        setCachedUserEmail(null);
        if (!cancelled) {
          inRecovery = false;
          setPhase('signed-out');
        }
        return;
      }
      setProfile(userId);
      setCachedUserEmail(email);
      if (inRecovery) {
        if (!cancelled) setPhase('recovery');
        return;
      }
      let setup = await getSetup();
      if (!setup) setup = await refreshSetup();
      if (cancelled) return;
      // Warm the in-memory cache for every tab's data before mounting the
      // tab navigator. Each screen's useState seeds from peekX(), so once
      // these complete the first paint of every tab matches its eventual
      // paint — no empty→loaded reflow on the first tab switch.
      await Promise.all([
        getDashboard(),
        getInvestments(),
        getSavings(),
        getDebts(),
        getRevenue(),
        getCurrencySettings(),
        getProjects(),
        getTransactions(),
        getWealthVisibility(),
        getDropdowns(),
        getAssets(),
        // Prime FX rates from local cache so peekRates() returns real values
        // on the dashboard's first paint. The fresh network fetch happens
        // out-of-band (refreshRatesInBackground) and updates subscribers when
        // it lands, so a stale cache never delays first paint.
        getRates(),
      ]);
      if (cancelled) return;
      refreshRatesInBackground();
      // Refresh everything while the first screen is already usable. Native
      // tabs mount lazily, so this puts their current data in the cache before
      // the user first opens them instead of making each tab fetch on arrival.
      void Promise.all([
        refreshDashboard(),
        refreshInvestments(),
        refreshSavings(),
        refreshDebts(),
        refreshRevenue(),
        refreshProjects(),
        refreshTransactions(),
        refreshCurrencySettings(),
        refreshSetup(),
        refreshAssets(),
      ]);
      if (!setup?.completed) {
        setPhase('onboarding');
        return;
      }
      // Paywall gate. resolveAccess() is a no-op (always allowed) until
      // RevenueCat is configured, so this changes nothing in production
      // until the keys/product are live. It also starts the 3-day
      // account-tied trial clock on first authenticated launch.
      const access = await resolveAccess(userId);
      if (cancelled) return;
      setPhase(access.allowed ? 'ready' : 'paywall');
    };

    // Exchange a recovery URL for a session. Used by both the web hash path
    // and the native deep-link path. We strip the tokens out of the URL bar
    // BEFORE calling setSession so no race window exists where another script
    // (extension, analytics tag) could read them off `window.location`.
    const consumeRecovery = async (rawUrl: string): Promise<boolean> => {
      const tokens = extractRecovery(rawUrl);
      if (!tokens) return false;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      inRecovery = true;
      await supabase.auth.setSession({
        access_token: tokens.access,
        refresh_token: tokens.refresh,
      });
      return true;
    };

    const bootstrap = async () => {
      // Web: tokens arrive in the address-bar hash on page load.
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        await consumeRecovery(window.location.href);
      } else {
        // Native: tokens arrive via the famescale:// deep link.
        const initial = await Linking.getInitialURL();
        if (initial) await consumeRecovery(initial);
      }

      // SECURITY: getSession() (local, unvalidated) is intentional here and
      // NOT a getUser() candidate. It only selects which screen to render —
      // it grants zero data access. Every read/write goes through userId()
      // (= supabase.auth.getUser(), server-validated) and is re-checked by
      // RLS, so a stale/forged local token yields an empty app, never data.
      // getUser() here would add a network round-trip at cold start and,
      // when offline, return null — locking the user out of their own
      // locally-cached data (the app is offline-capable via peekX caches).
      // Audit 2026-05: reviewed, accepted as defense-in-depth, not a bypass.
      const { data: { session } } = await supabase.auth.getSession();
      apply(session?.user?.id ?? null, session?.user?.email ?? null);
    };

    bootstrap();

    // Native cold-start is handled by getInitialURL above; this listener
    // covers the case where the app is already running and a deep link
    // arrives. (No-op on web — RootLayout only mounts once per page load.)
    const linkingSub =
      Platform.OS !== 'web'
        ? Linking.addEventListener('url', ({ url }) => {
            consumeRecovery(url).then((didRecover) => {
              if (didRecover) setPhase('recovery');
            });
          })
        : null;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // A successful password update fires USER_UPDATED; treat it as exit
      // from recovery so the user lands in the app normally.
      if (event === 'USER_UPDATED') inRecovery = false;
      apply(session?.user?.id ?? null, session?.user?.email ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      linkingSub?.remove();
    };
  }, []);

  if (!fontsLoaded || phase === 'loading') {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D0D0D' }}
      >
        <ActivityIndicator size="small" color="#8E8E93" />
      </View>
    );
  }

  if (phase === 'signed-out') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="light" />
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  if (phase === 'recovery') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="light" />
        <SetNewPassword />
      </SafeAreaProvider>
    );
  }

  if (phase === 'paywall') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="light" />
        <PaywallScreen onUnlocked={() => setPhase('ready')} />
      </SafeAreaProvider>
    );
  }

  if (phase === 'onboarding') {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="light" />
        <OnboardingFlow onComplete={() => setPhase('ready')} />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider value={AppDarkTheme}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0D0D0D' } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="settings"
              options={{
                headerShown: true,
                title: 'Settings',
                headerStyle: { backgroundColor: '#0D0D0D' },
                headerTintColor: '#00C896',
                headerShadowVisible: false,
              }}
            />
          </Stack>
        </ThemeProvider>
        <SyncIndicator />
        <ToastHost />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
