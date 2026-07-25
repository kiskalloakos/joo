import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AppText as Text } from './AppText';
import { Ionicons } from '@expo/vector-icons';
import {
  AccessState,
  peekAccess,
  subscribeAccess,
  notePurchase,
} from '../lib/access';
import {
  getLifetimePackage,
  purchaseLifetime,
  isUserCancelled,
} from '../lib/purchases';
import { showToast } from '../lib/toast';

// Slim trial-countdown strip for the top of the Dashboard. Renders ONLY
// while the paywall is live (access.gated), the user is still on the
// free trial (allowed && !pro), and the trial clock has started. It is
// self-hiding the instant a purchase succeeds (notePurchase → subscribe).
export default function TrialBanner() {
  const [access, setAccess] = useState<AccessState | null>(peekAccess());
  const [pkg, setPkg] = useState<unknown | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeAccess(setAccess), []);

  useEffect(() => {
    let cancelled = false;
    getLifetimePackage().then((p) => {
      if (!cancelled) setPkg(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!access || !access.gated || access.pro || !access.allowed) return null;

  const price =
    (pkg as { product?: { priceString?: string } } | null)?.product?.priceString ??
    '$9.99';
  const n = access.daysLeft;
  const label =
    n <= 0
      ? 'Last day of your free trial'
      : `${n} day${n === 1 ? '' : 's'} left in your free trial`;
  const urgent = n <= 1;

  const unlock = async () => {
    if (!pkg || busy) return;
    setBusy(true);
    try {
      const ok = await purchaseLifetime(pkg);
      if (ok) {
        notePurchase();
        showToast('Unlocked — thank you!');
      }
    } catch (e) {
      if (!isUserCancelled(e)) showToast('Purchase failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={[s.banner, urgent && s.bannerUrgent]}
      onPress={unlock}
      activeOpacity={0.85}
      disabled={busy || !pkg}
    >
      <Ionicons
        name={urgent ? 'time' : 'time-outline'}
        size={16}
        color={urgent ? '#FFA94D' : '#00C896'}
      />
      <Text style={[s.text, urgent && s.textUrgent]}>{label}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={urgent ? '#FFA94D' : '#00C896'} />
      ) : (
        <Text style={[s.cta, urgent && s.ctaUrgent]}>
          {pkg ? `Unlock ${price}` : 'Unlock'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0D1F1A',
    borderColor: '#1F3A30',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  bannerUrgent: { backgroundColor: '#1F1505', borderColor: '#3A2A12' },
  text: { flex: 1, fontSize: 13, color: '#9ABFB2', fontWeight: '600' },
  textUrgent: { color: '#D9B589' },
  cta: { fontSize: 13, color: '#00C896', fontWeight: '700' },
  ctaUrgent: { color: '#FFA94D' },
});
