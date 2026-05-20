import { useEffect, useState } from 'react';
import { LogBox, View, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';

// react-native-screens paints the native screen container with
// theme.colors.background. Default light theme = white flashes during tab
// swipes. Force the app's dark surface so every transition frame stays dark.
const AppDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#0D0D0D', card: '#0D0D0D' },
};

// react-native-draggable-flatlist@4.0.3 calls measureLayout against a ref the
// New Architecture (newArchEnabled) no longer treats as a native node. Drag
// still works; the warning is cosmetic. Silence just this one string so real
// warnings stay visible. Revisit if the drag library is upgraded.
LogBox.ignoreLogs(['ref.measureLayout must be called with a ref to a native component']);
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
import { getDashboard } from '../lib/dashboard';
import { getInvestments } from '../lib/investments';
import { getSavings } from '../lib/savings';
import { getDebts } from '../lib/debts';
import { getRevenue } from '../lib/revenue';
import { getCurrencySettings } from '../lib/currency';
import { resolveAccess } from '../lib/access';

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

// Desktop-only web styling: center the app in a 560px column so the web
// version stops looking like a phone screen stretched across a 1440px canvas.
// Injected at runtime because +html.tsx is silently ignored under Expo's
// default `web.output: "single"` mode. Platform-guarded so this code path
// is a no-op on iOS/Android — mobile rendering is byte-identical to before.
const DESKTOP_WEB_CSS = `
  @media (min-width: 768px) {
    html {
      background: radial-gradient(ellipse 1200px 800px at 50% 0%, rgba(0, 200, 150, 0.06) 0%, transparent 50%), #060606 !important;
    }
    body {
      background-color: transparent !important;
      align-items: center !important;
    }
    #root {
      width: 560px !important;
      max-width: 100% !important;
      flex-grow: 0 !important;
      flex-basis: auto !important;
      flex-shrink: 0 !important;
      background-color: #0D0D0D !important;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05), 0 0 100px rgba(0, 0, 0, 0.6) !important;
    }
  }
`;

export default function RootLayout() {
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'joo-desktop-web-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = DESKTOP_WEB_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let inRecovery = false;

    const apply = async (userId: string | null) => {
      if (!userId) {
        setProfile('anonymous');
        if (!cancelled) {
          inRecovery = false;
          setPhase('signed-out');
        }
        return;
      }
      setProfile(userId);
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
      ]);
      if (cancelled) return;
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
      apply(session?.user?.id ?? null);
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
      apply(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      linkingSub?.remove();
    };
  }, []);

  if (phase === 'loading') {
    return <View style={{ flex: 1, backgroundColor: '#0D0D0D' }} />;
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0D0D0D' } }} />
        </ThemeProvider>
        <SyncIndicator />
        <ToastHost />
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
