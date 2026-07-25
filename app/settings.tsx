import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { AppText as Text } from '../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getCurrencySettings,
  peekCurrencySettings,
  refreshCurrencySettings,
  saveGlobalCurrency,
} from '../lib/currency';
import { surface } from '../lib/surface';
import { supabase } from '../lib/supabase';
import { glowGreen } from '../lib/glows';
import { CURRENCIES } from '../lib/currencies';
import { peekCachedUserEmail, setCachedUserEmail } from '../lib/userProfile';
import { getTabVisibility, peekTabVisibility, saveTabVisibility, type OptionalTab, type TabVisibility } from '../lib/tabVisibility';
import { exportBackup } from '../lib/backup';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const [currency, setCurrency] = useState(() => peekCurrencySettings().global);
  const [email, setEmail] = useState<string | null>(peekCachedUserEmail);
  const [tabVisibility, setTabVisibility] = useState<TabVisibility>(peekTabVisibility);

  const [currencyModal, setCurrencyModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCurrencySettings().then((s) => {
        if (cancelled) return;
        setCurrency(s.global);
      });
      getTabVisibility().then((value) => !cancelled && setTabVisibility(value));
      // The session already holds the email locally. Avoid getUser() here:
      // it validates against the network and was making the profile label pop
      // in after the Settings screen had opened.
      supabase.auth.getSession().then(({ data }) => {
        const nextEmail = data.session?.user?.email ?? null;
        setCachedUserEmail(nextEmail);
        if (!cancelled) setEmail(nextEmail);
      });
      refreshCurrencySettings().then((s) => {
        if (cancelled) return;
        setCurrency(s.global);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign-out failed', error.message);
    }
    // On success, RootLayout's auth listener routes to AuthScreen.
  };

  // Account deletion (App Store 5.1.1(v)). The RPC wipes every user-scoped
  // table and deletes the auth user; we then sign out locally so the root
  // layout's auth listener routes back to AuthScreen.
  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await supabase.auth.signOut();
    } catch (e) {
      setDeleting(false);
      setDeleteModal(false);
      Alert.alert(
        'Delete failed',
        e instanceof Error ? e.message : 'Could not delete the account. Please try again.',
      );
    }
  };

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  const changeCurrency = async (code: string) => {
    setCurrency(code);
    await saveGlobalCurrency(code);
    setCurrencyModal(false);
  };

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);
  const toggleTab = async (tab: OptionalTab) => {
    const next = { ...tabVisibility, [tab]: !tabVisibility[tab] };
    setTabVisibility(next);
    await saveTabVisibility(next);
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Ionicons name="person" size={32} color="#00C896" style={glowGreen} />
          </View>
          <Text style={s.profileName}>{email ?? 'Your Profile'}</Text>
          <Text style={s.profileSub}>joo · personal finance</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={14} color="#FF6B6B" />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>NAVIGATION</Text>
        <View style={s.card}>
          <Text style={s.navHint}>Home is always shown. Turn off anything you do not use.</Text>
          {([
            ['wealth', 'Wealth', 'trending-up-outline'],
            ['debts', 'Debts', 'card-outline'],
            ['revenue', 'Revenue', 'arrow-down-circle-outline'],
            ['projects', 'Projects', 'hammer-outline'],
            ['recurrings', 'Recurring costs', 'repeat-outline'],
          ] as const).map(([key, label, icon], index) => (
            <TouchableOpacity key={key} style={[s.row, index === 0 && s.navFirstRow]} onPress={() => toggleTab(key)}>
              <View style={s.rowIcon}><Ionicons name={icon} size={16} color="#555" /></View>
              <Text style={s.rowLabel}>{label}</Text>
              <Text style={s.rowValue}>{tabVisibility[key] ? 'On' : 'Off'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Preferences */}
        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => setCurrencyModal(true)}>
            <View style={s.rowIcon}>
              <Ionicons name="cash-outline" size={16} color="#555" />
            </View>
            <Text style={s.rowLabel}>Default currency</Text>
            <View style={s.rowRight}>
              <Text style={s.rowValue}>{selectedCurrency?.symbol?.trim()}  {selectedCurrency?.code}</Text>
              <Ionicons name="chevron-forward" size={14} color="#333" style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
        </View>

        <Text style={s.sectionLabel}>YOUR DATA</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={async () => {
              try {
                const shared = await exportBackup();
                if (!shared) Alert.alert('Export unavailable', 'File sharing is not available on this device.');
              } catch {
                Alert.alert('Export failed', 'Your backup could not be created. Please try again.');
              }
            }}
          >
            <View style={s.rowIcon}><Ionicons name="download-outline" size={16} color="#555" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Export backup</Text>
              <Text style={s.rowHint}>Save a private JSON copy of your data</Text>
            </View>
            <Ionicons name="share-outline" size={16} color="#777" />
          </TouchableOpacity>
        </View>

        {/* Account deletion — kept at the bottom and dim on purpose. Apple
            requires it to exist (5.1.1(v)); a destructive action should be
            hard to fire accidentally. The modal handles confirmation. */}
        <TouchableOpacity style={s.deleteRow} onPress={() => setDeleteModal(true)}>
          <Text style={s.deleteRowText}>Delete account</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Currency modal */}
      <Modal visible={currencyModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select Currency</Text>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[s.currencyRow, currency === c.code && s.currencyRowActive]}
                onPress={() => changeCurrency(c.code)}
              >
                <Text style={s.currencySymbol}>{c.symbol}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.currencyCode}>{c.code}</Text>
                  <Text style={s.currencyName}>{c.name}</Text>
                </View>
                {currency === c.code && <Ionicons name="checkmark-circle" size={20} color="#00C896" style={glowGreen} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.closeBtn} onPress={() => setCurrencyModal(false)}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* Delete Account — irreversible. Wipes every user-scoped table and
          the auth user via the delete_my_account() RPC, then signs out. */}
      <Modal visible={deleteModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Delete account</Text>
            <Text style={s.sheetSub}>
              This permanently removes your account and every record in joo —
              cash accounts, costs, debts, investments, savings, revenue,
              transactions, and settings. This cannot be undone.
            </Text>
            <View style={s.sheetActions}>
              <TouchableOpacity
                style={s.btnCancel}
                onPress={() => setDeleteModal(false)}
                disabled={deleting}
              >
                <Text style={s.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnDelete}
                onPress={deleteAccount}
                disabled={deleting}
              >
                <Text style={s.btnDeleteText}>
                  {deleting ? 'Deleting…' : 'Delete forever'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  scroll: { paddingHorizontal: 16 },

  profileCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0D1F1A',
    borderWidth: 2,
    borderColor: '#00C896',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  profileName: { fontSize: 17, fontWeight: '700', color: '#FFF', marginBottom: 4, letterSpacing: -0.3 },
  profileSub: { fontSize: 12, color: '#444', marginBottom: 16, fontWeight: '500' },
  navHint: { color: '#666', fontSize: 12, lineHeight: 17, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  navFirstRow: { borderTopWidth: 0 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A1818',
    backgroundColor: '#1F0D0D',
  },
  signOutText: { fontSize: 12, color: '#FF6B6B', fontWeight: '600' },
  deleteRow: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  deleteRowText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  btnDelete: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3A1818',
    borderWidth: 1,
    borderColor: '#5A2828',
    alignItems: 'center',
  },
  btnDeleteText: { fontSize: 15, color: '#FF6B6B', fontWeight: '700' },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: { ...surface, borderRadius: 14, marginBottom: 24, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  addRow: { borderTopWidth: 1, borderTopColor: '#1C1C1C' },
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 14, color: '#CCC', fontWeight: '500' },
  rowHint: { fontSize: 11, color: '#666', marginTop: 3, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { fontSize: 13, color: '#555', fontWeight: '500' },
  currentTag: { fontSize: 11, color: '#3A6A5A', fontWeight: '500' },

  subtleRow: {
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
    paddingVertical: 11,
  },
  subtleLabel: { flex: 1, fontSize: 12, color: '#555', fontWeight: '500' },
  subtleHint: { fontSize: 10, color: '#333', marginTop: 2, fontWeight: '500' },
  // Prominent CTA when revenue tracking is disabled
  ctaCard: {
    backgroundColor: '#0F1A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F3A30',
    padding: 22,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1F3A30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ctaTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 6, letterSpacing: -0.3 },
  ctaSub: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 18, fontWeight: '500' },
  ctaBtn: {
    backgroundColor: '#00C896',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  overrideBadge: {
    fontSize: 10,
    color: '#00C896',
    fontWeight: '600',
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1A3A2F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Per-page picker rows
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  pageRowLabel: { flex: 1, fontSize: 15, color: '#EEE', fontWeight: '500' },
  pageRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageRowValue: { fontSize: 14, color: '#888', fontWeight: '500' },
  pageRowOverride: {
    color: '#00C896',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  pageRowHint: { fontSize: 10, color: '#444', letterSpacing: 0.5, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 8 },

  subTopBar: { flexDirection: 'row', marginBottom: 10 },
  subBack: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  subBackText: { fontSize: 13, color: '#888', fontWeight: '500' },

  // Sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 10, letterSpacing: -0.3 },
  sheetSub: { fontSize: 13, color: '#555', marginBottom: 18, lineHeight: 18, fontWeight: '500' },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#222',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  toggleText: { fontSize: 14, color: '#CCC', fontWeight: '500' },

  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  btnCancelText: { fontSize: 15, color: '#666', fontWeight: '500' },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00C896',
    alignItems: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },

  // Currency picker
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  currencyRowActive: { backgroundColor: '#222' },
  currencySymbol: { fontSize: 18, color: '#FFF', width: 28, textAlign: 'center', fontWeight: '600' },
  currencyCode: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  currencyName: { fontSize: 12, color: '#555', marginTop: 1, fontWeight: '500' },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, color: '#666', fontWeight: '500' },
});
