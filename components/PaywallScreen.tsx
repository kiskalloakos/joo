import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { AppText as Text } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { glowGreen } from '../lib/glows';
import {
  getLifetimePackage,
  purchaseLifetime,
  restorePurchases,
  isUserCancelled,
} from '../lib/purchases';

export default function PaywallScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pkg, setPkg] = useState<unknown | null>(null);
  const [loadingPkg, setLoadingPkg] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLifetimePackage().then((p) => {
      if (!cancelled) {
        setPkg(p);
        setLoadingPkg(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Price string straight from the store package when available.
  const priceLabel =
    (pkg as { product?: { priceString?: string } } | null)?.product?.priceString ??
    '$9.99';

  const buy = async () => {
    if (!pkg) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await purchaseLifetime(pkg);
      if (ok) onUnlocked();
      else setError('Purchase did not complete. Please try again.');
    } catch (e) {
      if (!isUserCancelled(e)) {
        setError(e instanceof Error ? e.message : 'Purchase failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setError(null);
    setBusy(true);
    try {
      const ok = await restorePurchases();
      if (ok) onUnlocked();
      else setError('No previous purchase found for this account.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.brandBlock}>
          <Image source={require('../assets/joo-ios-icon.png')} style={s.brandIcon} />
          <Text style={s.tagline}>your trial has ended</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>Unlock joo forever</Text>
          <Text style={s.cardSub}>
            One payment. No subscription. Yours for good — on every device you
            sign in to.
          </Text>

          {[
            'Every account, cost, and debt — unlimited',
            'Cloud sync across your devices',
            'All projections, currencies & tabs',
            'Future updates included',
          ].map((line) => (
            <View key={line} style={s.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color="#00C896" style={glowGreen} />
              <Text style={s.benefitText}>{line}</Text>
            </View>
          ))}

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color="#FF6B6B" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, (busy || loadingPkg || !pkg) && s.primaryBtnDisabled]}
            onPress={buy}
            disabled={busy || loadingPkg || !pkg}
          >
            {busy || loadingPkg ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={s.primaryBtnText}>
                {pkg ? `Unlock — ${priceLabel} once` : 'Unavailable right now'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} onPress={restore} disabled={busy}>
            <Text style={s.secondaryText}>Restore purchase</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={signOut} disabled={busy}>
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  brandBlock: { alignItems: 'center', marginBottom: 28 },
  brandIcon: { width: 118, height: 118, marginBottom: 12 },
  tagline: { fontSize: 14, color: '#666', fontWeight: '500' },

  card: {
    backgroundColor: '#151515',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#222',
    padding: 24,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', letterSpacing: -0.4, marginBottom: 8 },
  cardSub: { fontSize: 14, color: '#888', lineHeight: 20, marginBottom: 20, fontWeight: '500' },

  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  benefitText: { flex: 1, fontSize: 14, color: '#CCC', fontWeight: '500' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1F0D0D',
    borderColor: '#3A1818',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, flex: 1, fontWeight: '500' },

  primaryBtn: {
    backgroundColor: '#00C896',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },

  secondaryBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  secondaryText: { fontSize: 14, color: '#00C896', fontWeight: '600' },

  signOutBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
  signOutText: { fontSize: 13, color: '#555', fontWeight: '500' },
});
