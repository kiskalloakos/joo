import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Text, StyleSheet, Platform, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withLayoutContext } from 'expo-router';
import {
  createMaterialTopTabNavigator,
  type MaterialTopTabBarProps,
} from '@react-navigation/material-top-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { SetupData, getSetup, peekSetup, refreshSetup, subscribeSetup, ORDERABLE_TABS, normalizeTabOrder } from '../../lib/setup';

// react-native-pager-view under the hood → real finger-tracked paging.
// The `true` 3rd arg makes the declared <Screen> children the definitive
// route set (default would include every file route), so conditionally
// rendering them below actually hides tabs.
const { Navigator } = createMaterialTopTabNavigator();
const MaterialTopTabs = withLayoutContext(Navigator, undefined, true);

const DEFAULT_SETUP: SetupData = {
  completed: true,
  showInvestments: true,
  showSavings: false,
  showRevenue: true,
  showDebts: false,
  showNetWorth: false,
  showRecurrings: true,
  showGoals: false,
  showProjects: false,
  includeDebtsInNetWorth: true,
  tabOrder: [...ORDERABLE_TABS],
  cashViewMode: 'single',
  trialStartedAt: null,
};

// Tab bar order. `always` tabs ignore setup; the rest mirror the old
// `href: setup.showX ? undefined : null` visibility exactly.
const TABS: {
  name: string;
  title: string;
  visible: (s: SetupData) => boolean;
}[] = [
  { name: 'index', title: 'Dashboard', visible: () => true },
  // Core tab right after Dashboard — it owns cost management, can't be hidden.
  { name: 'recurrings', title: 'Recurrings', visible: (s) => s.showRecurrings },
  { name: 'investments', title: 'Investments', visible: (s) => s.showInvestments },
  { name: 'savings', title: 'Savings', visible: (s) => s.showSavings },
  { name: 'revenue', title: 'Revenue', visible: (s) => s.showRevenue },
  { name: 'debts', title: 'Debts', visible: (s) => s.showDebts },
  { name: 'net-worth', title: 'Net Worth', visible: (s) => s.showNetWorth },
  { name: 'goals', title: 'Goals', visible: (s) => s.showGoals },
  { name: 'projects', title: 'Projects', visible: (s) => s.showProjects },
  { name: 'settings', title: 'Settings', visible: () => true },
];

const TITLE_FOR: Record<string, string> = Object.fromEntries(
  TABS.map((t) => [t.name, t.title]),
);

const WEB = Platform.OS === 'web';

// Fixed-width label slot. This single number is BOTH the inter-word
// spacing AND the per-tab swipe distance (the strip translates by exactly
// one SLOT_W per tab so the active label centers under the pill — no
// measurement, see NativeBar). Floor ≈ width of the longest label
// ("Investments") since text is clipped to the slot (numberOfLines=1);
// going tighter than that needs content-width slots (a bigger change).
const SLOT_W = 116;
// Decoupled from SLOT_W so the pill stays wide enough to frame the
// longest label with padding even though the slots are now snug.
const PILL_W = 118;
const PILL_H = 36;
const DIM = 0.35;

// NATIVE: a static pill pinned at center; a strip of fixed-width labels
// translates *under* it, driven directly by the pager's live `position`
// value — so the words slide with your finger as you swipe, and the pill
// itself never moves. Pure Animated transform: nothing is measured and
// there's no ScrollView, so the visibility-toggle remount can't jitter it.
function NativeBar({ state, navigation, position, layout }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const w = layout.width;
  // Both the fixed pill (`left`) and the strip (`translateX`) are derived
  // from `w`. On the first frame after mount/remount RNTV hasn't measured
  // the bar yet so `w === 0`, painting the pill/strip shifted left and
  // mislabeled until a later layout pass (in practice, the first touch)
  // forces a re-render. Keep the bar mounted (stable height/insets) but
  // hold its contents hidden until `w > 0` and one rAF later, so the
  // corrected transform has committed before we reveal — same gate WebBar
  // uses for its first scroll-center.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (w > 0 && !ready) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [w, ready]);

  const translateX = useMemo(
    () => Animated.subtract(w / 2 - SLOT_W / 2, Animated.multiply(position, SLOT_W)),
    [position, w],
  );

  // Ghost "Settings" label on the left of the bar, only meaningful on the
  // Dashboard (state.index === 0). Opacity collapses from 0.25 -> 0 over the
  // first 30% of the swipe right, so by the time the strip's labels start
  // crossing the shortcut's horizontal range, it's already invisible — no
  // visual collision mid-swipe. Always tappable: even at 0% opacity tapping
  // would be a no-op on non-Dashboard tabs (its area sits outside the strip's
  // typical labels at position=0), and we don't want a stale touch area
  // intercepting taps on other tabs anyway.
  const settingsOpacity = useMemo(
    () =>
      position.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0.25, 0, 0],
        extrapolate: 'clamp',
      }),
    [position],
  );
  const settingsTappable = state.index === 0;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <View style={[styles.track, { height: PILL_H }, !ready && styles.hidden]}>
        <LinearGradient
          colors={['#262626', '#1D1D1D', '#181818']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fixedPill, { width: PILL_W, left: w / 2 - PILL_W / 2 }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.pillSheen}
          />
        </LinearGradient>
        <Animated.View style={[styles.strip, { transform: [{ translateX }] }]}>
          {state.routes.map((route, i) => {
            const opacity = position.interpolate({
              inputRange: [i - 1, i, i + 1],
              outputRange: [DIM, 1, DIM],
              extrapolate: 'clamp',
            });
            return (
              <Pressable
                key={route.key}
                style={[styles.slot, { width: SLOT_W }]}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (state.index !== i && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              >
                <Animated.Text
                  style={[styles.slotText, { opacity }]}
                  numberOfLines={1}
                >
                  {TITLE_FOR[route.name] ?? route.name}
                </Animated.Text>
              </Pressable>
            );
          })}
        </Animated.View>
        <Pressable
          style={[
            styles.settingsShortcut,
            { left: w / 2 - SLOT_W * 1.5, width: SLOT_W },
          ]}
          onPress={() => navigation.navigate('settings')}
          pointerEvents={settingsTappable ? 'auto' : 'none'}
          accessibilityRole="button"
          accessibilityLabel="Go to Settings"
        >
          <Animated.Text
            style={[styles.settingsShortcutText, { opacity: settingsOpacity }]}
            numberOfLines={1}
          >
            Settings
          </Animated.Text>
        </Pressable>
      </View>
    </View>
  );
}

// WEB: the previous left-aligned, manually-scrollable bar (looked better
// there) — no center padding, no dimming, no gate.
function WebBar({ state, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<number, { x: number; width: number }>>({});
  const [barW, setBarW] = useState(0);
  // Web renders immediately (WEB === true); the false branch is dead here
  // since WebBar only mounts on web. NativeBar has its own `ready` gate.
  const [ready, setReady] = useState(WEB);
  const placed = useRef(WEB);

  const centerActive = (index: number) => {
    const l = layouts.current[index];
    if (!l || !barW) return;
    const x = Math.max(0, l.x + l.width / 2 - barW / 2);
    // First placement is instant (no slide); later tab changes glide.
    scrollRef.current?.scrollTo({ x, animated: placed.current });
    if (!placed.current) {
      placed.current = true;
      // Reveal only after the scroll offset has actually committed, so the
      // un-centered first frame after a remount is never shown.
      requestAnimationFrame(() => setReady(true));
    }
  };

  useEffect(() => {
    centerActive(state.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, barW]);

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={WEB}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={[
          styles.row,
          WEB ? styles.rowWeb : { paddingHorizontal: barW / 2 },
          !ready && styles.hidden,
        ]}
        onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
      >
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          return (
            <Pressable
              key={route.key}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                layouts.current[i] = { x, width };
                if (i === state.index) centerActive(i);
              }}
              style={[
                styles.pill,
                focused
                  ? styles.pillActive
                  : !WEB && styles.pillInactive,
              ]}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              <Text style={[styles.pillText, focused && styles.pillTextActive]}>
                {TITLE_FOR[route.name] ?? route.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TopBar(props: MaterialTopTabBarProps) {
  return WEB ? <WebBar {...props} /> : <NativeBar {...props} />;
}

export default function TabLayout() {
  const [setup, setSetup] = useState<SetupData>(() => peekSetup() ?? DEFAULT_SETUP);

  useEffect(() => {
    let cancelled = false;
    getSetup().then((d) => {
      if (!cancelled && d) setSetup(d);
    });
    refreshSetup().then((d) => {
      if (!cancelled && d) setSetup(d);
    });
    const unsubscribe = subscribeSetup((d) => {
      if (!cancelled) setSetup(d);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Dashboard is pinned first and Settings last; Recurrings (when enabled)
  // is pinned right after Dashboard. Only the optional tabs in between are
  // user-orderable (setup.tabOrder).
  const visible = useMemo(() => {
    const byName = (n: string) => TABS.find((t) => t.name === n)!;
    const order = normalizeTabOrder(setup.tabOrder);
    const front = (setup.showRecurrings ? ['index', 'recurrings'] : ['index']).map(byName);
    const middle = order.map(byName).filter((t) => t.visible(setup));
    return [...front, ...middle, byName('settings')];
  }, [setup]);

  // react-native-tab-view's pager view desyncs from navigation state when the
  // route array changes at runtime — its length OR order (the toggle jitter /
  // wrong-page / stale-state bugs). Keying the navigator on the ordered
  // visible set forces a clean remount on any visibility OR reorder change;
  // expo-router is URL-driven so it re-derives the correct focused tab from
  // the current path. Screens re-seed instantly from the peekX() cache. Both
  // toggling and reordering are rare, deliberate actions, so the remount cost
  // is acceptable in exchange for zero pager desync.
  const navKey = visible.map((t) => t.name).join('|');

  return (
    <MaterialTopTabs
      key={navKey}
      tabBarPosition="top"
      tabBar={(props) => <TopBar {...props} />}
      style={{ backgroundColor: '#0D0D0D' }}
      // Snap (no animation) for tab taps; finger-tracked swipe still animates
      // (RNTV keeps swipe animation regardless of this flag).
      screenOptions={{ animationEnabled: false }}
    >
      {visible.map((t) => (
        <MaterialTopTabs.Screen key={t.name} name={t.name} />
      ))}
    </MaterialTopTabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#0D0D0D',
    paddingBottom: 18,
  },
  // Native fixed-pill bar
  track: {
    width: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fixedPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    // Soft depth shadow under the pill (Copilot's pill sits slightly raised).
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  // Top "lit from above" sheen — a light gradient fading to transparent
  // over the upper portion of the pill. Bottom edge is fully transparent
  // so its square corners never show against the rounded pill.
  pillSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  strip: {
    flexDirection: 'row',
  },
  slot: {
    height: PILL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: 0.2,
  },
  // Web scrollable bar
  row: {
    gap: 8,
    alignItems: 'center',
  },
  rowWeb: {
    paddingHorizontal: 14,
  },
  hidden: {
    opacity: 0,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  pillActive: {
    backgroundColor: '#1C1C1C',
  },
  pillInactive: {
    opacity: 0.4,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.2,
  },
  pillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  // Position + width set inline (depend on layout width). The shortcut sits
  // one slot-width to the left of the centered active pill, matching the
  // horizontal rhythm of the visible "next tab" (Recurrings) on the right.
  settingsShortcut: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsShortcutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    letterSpacing: 0.2,
  },
});
