import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { saveSetup, ORDERABLE_TABS } from '../lib/setup';
import { saveGlobalCurrency } from '../lib/currency';
import { glowGreen } from '../lib/glows';
import {
  getLifetimePackage,
  purchaseLifetime,
  restorePurchases,
  isUserCancelled,
} from '../lib/purchases';
import { notePurchase } from '../lib/access';

export type { SetupData } from '../lib/setup';

interface Props {
  onComplete: () => void;
}

type TrackKey =
  | 'showInvestments'
  | 'showSavings'
  | 'showRevenue'
  | 'showDebts'
  | 'showNetWorth'
  | 'showGoals';

const CURRENCIES = [
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
];

const TRACKABLES: {
  key: TrackKey;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'showInvestments',
    title: 'Investments',
    desc: 'Portfolio growth with compound returns.',
    icon: 'trending-up-outline',
  },
  {
    key: 'showSavings',
    title: 'Savings',
    desc: 'Savings goals and interest over time.',
    icon: 'wallet-outline',
  },
  {
    key: 'showRevenue',
    title: 'Revenue',
    desc: 'Yearly income with monthly breakdown.',
    icon: 'bar-chart-outline',
  },
  {
    key: 'showDebts',
    title: 'Debts',
    desc: 'What you owe — loans, cards, IOUs.',
    icon: 'document-text-outline',
  },
  {
    key: 'showNetWorth',
    title: 'Net Worth',
    desc: 'Cash + investments − debts in one number.',
    icon: 'pulse-outline',
  },
  {
    key: 'showGoals',
    title: 'Goals',
    desc: 'Savings & payoff targets with progress.',
    icon: 'flag-outline',
  },
];

export default function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState('RON');
  const [tracks, setTracks] = useState<Record<TrackKey, boolean>>({
    showInvestments: true,
    showSavings: false,
    showRevenue: false,
    showDebts: false,
    showNetWorth: false,
    showGoals: false,
  });
  const [pkg, setPkg] = useState<unknown | null>(null);
  const [busy, setBusy] = useState(false);

  // Loaded lazily so the price shown is the real, localized store price.
  // null when the paywall isn't live yet (then we only show "Start trial").
  useEffect(() => {
    let cancelled = false;
    getLifetimePackage().then((p) => {
      if (!cancelled) setPkg(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: TrackKey) => setTracks((t) => ({ ...t, [key]: !t[key] }));

  const finish = async () => {
    await saveGlobalCurrency(currency);
    await saveSetup({
      completed: true,
      showInvestments: tracks.showInvestments,
      showSavings: tracks.showSavings,
      showRevenue: tracks.showRevenue,
      showRecurrings: true,
      showDebts: tracks.showDebts,
      showNetWorth: tracks.showNetWorth,
      showGoals: tracks.showGoals,
      showProjects: false,
      includeDebtsInNetWorth: true,
      tabOrder: [...ORDERABLE_TABS],
      cashViewMode: 'single',
      trialStartedAt: null,
    });
    onComplete();
  };

  const price =
    (pkg as { product?: { priceString?: string } } | null)?.product?.priceString ??
    '$9.99';

  const buyNow = async () => {
    if (!pkg || busy) return;
    setBusy(true);
    try {
      const ok = await purchaseLifetime(pkg);
      if (ok) {
        notePurchase();
        await finish();
      }
    } catch (e) {
      if (!isUserCancelled(e)) {
        // Non-fatal: let them continue into the trial instead of trapping
        // them on onboarding.
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        notePurchase();
        await finish();
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Welcome ────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.welcomeContent}>
          <Image source={require('../assets/icon.png')} style={s.brandIcon} />
          <Text style={s.tagline}>your finances, simplified.</Text>
        </View>
        <View style={s.footer}>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setStep(1)}>
            <Text style={s.primaryBtnText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 1: Currency ───────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => setStep(0)}>
            <Ionicons name="chevron-back" size={20} color="#555" />
          </TouchableOpacity>
          <Text style={s.stepDot}>1 / 3</Text>
        </View>

        <View style={s.content}>
          <Text style={s.question}>What's your{'\n'}main currency?</Text>
          <Text style={s.questionSub}>
            You can override this per page later in Settings.
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {CURRENCIES.map((c) => {
              const active = currency === c.code;
              return (
                <TouchableOpacity
                  key={c.code}
                  style={[s.currencyRow, active && s.currencyRowActive]}
                  onPress={() => setCurrency(c.code)}
                  activeOpacity={0.75}
                >
                  <Text style={s.currencySymbol}>{c.symbol}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.currencyCode, active && s.choiceTextActive]}>{c.code}</Text>
                    <Text style={s.currencyName}>{c.name}</Text>
                  </View>
                  {active && <Ionicons name="checkmark-circle" size={20} color="#00C896" style={glowGreen} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={s.footer}>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setStep(2)}>
            <Text style={s.primaryBtnText}>Next</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step 2: What do you want to track? (multi-select) ──────────────────────
  if (step === 2) {
    return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)}>
          <Ionicons name="chevron-back" size={20} color="#555" />
        </TouchableOpacity>
        <Text style={s.stepDot}>2 / 3</Text>
      </View>

      <View style={s.content}>
        <Text style={s.question}>What do you want{'\n'}to track?</Text>
        <Text style={s.questionSub}>
          Dashboard is always included. Pick anything else you want — you can change this later in Settings.
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Dashboard — locked-in, shown for clarity */}
          <View style={[s.choiceCard, s.choiceCardLocked]}>
            <View style={s.choiceIcon}>
              <Ionicons name="home-outline" size={18} color="#00C896" style={glowGreen} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.choiceTitle, s.choiceTextActive]}>Dashboard</Text>
              <Text style={s.choiceDesc}>Cash accounts and monthly costs. Always on.</Text>
            </View>
            <Text style={s.lockedTag}>INCLUDED</Text>
          </View>

          {TRACKABLES.map((t) => {
            const active = tracks[t.key];
            return (
              <TouchableOpacity
                key={t.key}
                style={[s.choiceCard, active && s.choiceCardActive]}
                onPress={() => toggle(t.key)}
                activeOpacity={0.75}
              >
                <View style={s.choiceIcon}>
                  <Ionicons name={t.icon} size={18} color={active ? '#00C896' : '#555'} style={active ? glowGreen : undefined} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choiceTitle, active && s.choiceTextActive]}>{t.title}</Text>
                  <Text style={s.choiceDesc}>{t.desc}</Text>
                </View>
                <View style={[s.checkbox, active && s.checkboxActive]}>
                  {active && <Ionicons name="checkmark" size={14} color="#000" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.primaryBtn} onPress={() => setStep(3)}>
          <Text style={s.primaryBtnText}>Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    );
  }

  // ── Step 3: Trial terms (disclosure + optional buy-now) ────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)}>
          <Ionicons name="chevron-back" size={20} color="#555" />
        </TouchableOpacity>
        <Text style={s.stepDot}>3 / 3</Text>
      </View>

      <View style={s.content}>
        <Text style={s.question}>Free for{'\n'}3 days</Text>
        <Text style={s.questionSub}>
          Use everything, no limits. After your trial it's a one-time{' '}
          {price} — yours forever, on every device you sign in to. No
          subscription, ever.
        </Text>

        <View style={s.trialCard}>
          {[
            'Full access for 3 days, free',
            'Then one payment — no subscription',
            'Unlocks on every device you sign in to',
            'All future updates included',
          ].map((line) => (
            <View key={line} style={s.benefitRow}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#00C896"
                style={glowGreen}
              />
              <Text style={s.benefitText}>{line}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.primaryBtn, busy && s.btnDisabled]}
          onPress={finish}
          disabled={busy}
        >
          <Text style={s.primaryBtnText}>Start my 3-day free trial</Text>
        </TouchableOpacity>

        {pkg != null && (
          <TouchableOpacity
            style={[s.secondaryBtn, busy && s.btnDisabled]}
            onPress={buyNow}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#00C896" />
            ) : (
              <Text style={s.secondaryText}>
                Unlock now — {price} once
              </Text>
            )}
          </TouchableOpacity>
        )}

        {pkg != null && (
          <TouchableOpacity onPress={restore} disabled={busy}>
            <Text style={s.restoreText}>Restore purchase</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },

  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brandIcon: { width: 148, height: 148, marginBottom: 16 },
  tagline: { fontSize: 16, color: '#444', fontWeight: '500' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { padding: 4 },
  stepDot: { fontSize: 12, color: '#333', fontWeight: '500' },

  content: { flex: 1, paddingHorizontal: 24, paddingTop: 40 },
  question: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 38,
    marginBottom: 12,
    letterSpacing: -0.8,
  },
  questionSub: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 24,
    fontWeight: '500',
  },

  // Track-selection cards
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
    gap: 14,
  },
  choiceCardActive: { borderColor: '#00C896', backgroundColor: '#0D1F1A' },
  choiceCardLocked: { borderColor: '#1F3A30', backgroundColor: '#0D1F1A' },
  choiceIcon: { width: 28, alignItems: 'center' },
  choiceTitle: { fontSize: 15, fontWeight: '600', color: '#888', marginBottom: 3 },
  choiceTextActive: {
    color: '#00C896',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  choiceDesc: { fontSize: 12, color: '#3A3A3A', lineHeight: 16, fontWeight: '500' },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: '#00C896', borderColor: '#00C896' },

  lockedTag: {
    fontSize: 9,
    color: '#00C896',
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F3A30',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Currency rows (unchanged)
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#151515',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  currencyRowActive: { borderColor: '#00C896', backgroundColor: '#0D1F1A' },
  currencySymbol: { fontSize: 22, color: '#FFF', width: 32, textAlign: 'center', fontWeight: '600' },
  currencyCode: { fontSize: 15, fontWeight: '600', color: '#FFF', marginBottom: 2 },
  currencyName: { fontSize: 12, color: '#555', fontWeight: '500' },

  footer: { paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  primaryBtn: {
    backgroundColor: '#00C896',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
  btnDisabled: { opacity: 0.6 },

  trialCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    padding: 20,
    marginTop: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  benefitText: { flex: 1, fontSize: 14, color: '#CCC', fontWeight: '500' },

  secondaryBtn: { alignItems: 'center', paddingVertical: 14 },
  secondaryText: { fontSize: 15, color: '#00C896', fontWeight: '700' },
  restoreText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 6,
  },
});
