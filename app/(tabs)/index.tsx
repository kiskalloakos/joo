import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrencyForPage, peekCurrencyForPage, refreshCurrencyForPage, peekCurrencySettings } from '../../lib/currency';
import { CURRENCIES } from '../../lib/currencies';
import {
  peekRates,
  subscribeRates,
  convert,
  type Rates,
} from '../../lib/exchangeRates';
import {
  Account,
  Cost,
  getDashboard,
  peekDashboard,
  refreshDashboard,
  saveAccount as persistAccount,
  deleteAccount as removeAccount,
  saveCost as persistCost,
  deleteCost as removeCost,
  newId,
  currentMonthKey,
  subscribeMonthlyReset,
} from '../../lib/dashboard';
import { showToast } from '../../lib/toast';
import { hintSeen, markHintSeen } from '../../lib/hints';
import { SetupData, peekSetup, getSetup, refreshSetup, subscribeSetup, type CashViewMode } from '../../lib/setup';
import { glowGreen, glowAmber, glowGreenHero } from '../../lib/glows';
import { surface } from '../../lib/surface';
import { feedback } from '../../lib/feedback';
import {
  Transaction,
  getTransactions,
  logTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../lib/transactions';
import StatementSheet from '../../components/StatementSheet';
import TrialBanner from '../../components/TrialBanner';
import { useDragReorder } from '../../lib/useDragReorder';
import DraggableRow from '../../components/DraggableRow';
import SortableScroll from '../../components/SortableScroll';
import { NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthName(key: string): string {
  const m = parseInt(key.split('-')[1], 10) - 1;
  return MONTH_NAMES[m] ?? key;
}

function txMonthKey(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseAmt(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Signed effect a transaction had on its account when it was created:
// money-in raised the balance, money-out lowered it.
function txEffect(t: Transaction): number {
  return t.direction === 'in' ? t.amount : -t.amount;
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>(() => peekDashboard().accounts);
  const [costs, setCosts] = useState<Cost[]>(() => peekDashboard().costs);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('dashboard'));
  // FX rates for cross-currency cash account summation. peekRates() returns
  // IDENTITY (all 1.0) only on a cold start with no cache — _layout primes
  // this before mounting tabs, so we seed from peek() and resubscribe.
  const [rates, setRates] = useState<Rates>(() => peekRates());
  // Recurrings can be toggled off in Settings; when it is, the Monthly
  // Costs summary below is hidden (it taps through to that now-gone tab).
  // Hero math is intentionally unchanged — costs still exist in data.
  const [showRecurrings, setShowRecurrings] = useState(
    () => peekSetup()?.showRecurrings ?? true,
  );
  // Cash accounts view mode: 'single' = one converted total in the display
  // currency (today's behavior); 'breakdown' = totals grouped by currency.
  const [cashViewMode, setCashViewMode] = useState<CashViewMode>(
    () => peekSetup()?.cashViewMode ?? 'single',
  );

  const [accountModal, setAccountModal] = useState<{ visible: boolean; editing: Account | null }>({
    visible: false,
    editing: null,
  });
  const [moneyModal, setMoneyModal] = useState<{ visible: boolean; mode: 'add' | 'remove' }>({
    visible: false,
    mode: 'add',
  });
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyNote, setMoneyNote] = useState('');
  // Currency the entered amount is in. Converted into each account's own
  // currency on commit, so adding "20 USD" to a EUR account adds the right
  // number of euros.
  const [moneyCurrency, setMoneyCurrency] = useState<string>(
    () => peekCurrencySettings().global,
  );

  const [historyVisible, setHistoryVisible] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statement, setStatement] = useState<{ visible: boolean; year: number; month: number; label: string }>(
    { visible: false, year: new Date().getFullYear(), month: new Date().getMonth(), label: '' },
  );

  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<string>(
    () => peekCurrencySettings().global,
  );

  const closeMoneyModal = useCallback(() => {
    setMoneyModal((prev) => ({ ...prev, visible: false }));
  }, []);

  const openHistory = useCallback(async () => {
    feedback.tap();
    setHistoryVisible(true);
    const list = await getTransactions(500);
    setTransactions(list);
  }, []);

  // The monthly auto-reset now lives in lib/dashboard (runs on any data
  // load, screen-independent). Here we just reflect whatever it returns and
  // surface the one-time toast when it un-pays last month's costs.
  const applyDashboard = useCallback(
    (d: ReturnType<typeof getDashboard> extends Promise<infer T> ? T : never) => {
      setAccounts(d.accounts);
      setCosts(d.costs);
    },
    [],
  );

  useEffect(
    () =>
      subscribeMonthlyReset(({ count, month }) =>
        showToast(
          `Reset ${count} ${count === 1 ? 'cost' : 'costs'} for ${monthName(month)} — last month's payments stayed deducted.`,
        ),
      ),
    [],
  );

  // One-time tip: the account rows have no visible edit/reorder affordance
  // (deliberately — hidden by request), so the first time the user has at
  // least one account on the Dashboard, slide up the same toast the Undo
  // action uses to explain the gestures. Dashboard only mounts after
  // onboarding, so reaching here already implies onboarding is done.
  const reorderHintTried = useRef(false);
  useEffect(() => {
    if (reorderHintTried.current || accounts.length === 0) return;
    reorderHintTried.current = true;
    hintSeen('accountsReorder').then((seen) => {
      if (seen) return;
      markHintSeen('accountsReorder');
      showToast(
        'Tip: tap an account to edit it, or press & hold and drag to reorder.',
        { label: 'Got it', onPress: () => {} },
        8000,
      );
    });
  }, [accounts.length]);

  useEffect(() => {
    let cancelled = false;
    const apply = (d: SetupData | null) => {
      if (cancelled || !d) return;
      setShowRecurrings(d.showRecurrings);
      setCashViewMode(d.cashViewMode);
    };
    getSetup().then(apply);
    refreshSetup().then(apply);
    const unsubscribe = subscribeSetup((d) => {
      if (cancelled) return;
      setShowRecurrings(d.showRecurrings);
      setCashViewMode(d.cashViewMode);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Re-render when FX rates land or refresh (so cross-currency totals stay
  // accurate without a manual reload).
  useEffect(() => subscribeRates(setRates), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDashboard().then((d) => {
        if (!cancelled) applyDashboard(d);
      });
      refreshDashboard().then((d) => {
        if (!cancelled) applyDashboard(d);
      });
      getCurrencyForPage('dashboard').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      refreshCurrencyForPage('dashboard').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      return () => {
        cancelled = true;
      };
    }, [applyDashboard]),
  );

  // ── Math ──────────────────────────────────────────────────────────────────
  // `currency` is the dashboard display currency (per-page override falling
  // back to global). Cash accounts may now carry their own currency; we
  // bucket them per currency, then convert each bucket into the display
  // currency for the hero `totalLiquid`. Accounts with no per-row currency
  // are treated as the display currency (no conversion).
  const liquidByCcy = accounts.reduce<Record<string, number>>((acc, a) => {
    const ccy = a.currency ?? currency;
    acc[ccy] = (acc[ccy] ?? 0) + parseAmt(a.amount);
    return acc;
  }, {});
  const totalLiquid = Object.entries(liquidByCcy).reduce(
    (s, [ccy, amt]) => s + convert(amt, ccy, currency, rates.rates),
    0,
  );
  // Monthly costs only — periodic (quarterly/yearly) bills are kept out of the
  // dashboard figure on purpose and live in Recurrings' separate section.
  // Costs stay single-currency (display currency) by design; multi-currency
  // is limited to Cash Accounts for now.
  const monthlyCosts = costs.filter((c) => (c.intervalMonths ?? 1) === 1);
  const unpaidCosts = monthlyCosts.reduce((s, c) => (c.paid ? s : s + parseAmt(c.amount)), 0);
  const afterPayments = totalLiquid - unpaidCosts;
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';
  const symbolFor = (code: string) =>
    CURRENCIES.find((c) => c.code === code)?.symbol ?? code + ' ';

  // ── Accounts ──────────────────────────────────────────────────────────────
  const openAddAccount = () => {
    setFormName('');
    setFormAmount('');
    // New accounts default to the user's global currency. They can override
    // per-account in the picker below.
    setFormCurrency(peekCurrencySettings().global);
    setAccountModal({ visible: true, editing: null });
  };

  const openEditAccount = (account: Account) => {
    setFormName(account.name);
    setFormAmount(account.amount);
    setFormCurrency(account.currency ?? peekCurrencySettings().global);
    setAccountModal({ visible: true, editing: account });
  };

  const saveAccount = async () => {
    if (!formName.trim()) return;
    const editing = accountModal.editing;
    const account: Account = editing
      ? { ...editing, name: formName.trim(), amount: formAmount, currency: formCurrency }
      : {
          id: newId(),
          name: formName.trim(),
          amount: formAmount,
          position: accounts.length,
          currency: formCurrency,
        };
    setAccounts(
      editing ? accounts.map((a) => (a.id === editing.id ? account : a)) : [...accounts, account],
    );
    setAccountModal({ visible: false, editing: null });
    feedback.success();
    await persistAccount(account);
  };

  // The view-mode toggle now lives only in Settings ("Breakdown by
  // currency"). The Dashboard reads cashViewMode and conditionally renders
  // the per-currency breakdown INSIDE the hero card (further down). No
  // inline button — keeps the Cash Accounts header clean.

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  const reorderAccounts = useCallback(async (next: Account[]) => {
    const repositioned = next.map((a, i) => ({ ...a, position: i }));
    feedback.dragEnd();
    setAccounts((prev) => {
      // Persist any row whose position actually changed
      for (const a of repositioned) {
        const orig = prev.find((p) => p.id === a.id);
        if (orig && orig.position !== a.position) persistAccount(a);
      }
      return repositioned;
    });
  }, []);

  const accountDrag = useDragReorder(accounts, reorderAccounts);

  // ── Native renderers for NestableDraggableFlatList ────────────────────────
  // Per-account currency: amount renders with the account's own symbol
  // (falls back to dashboard display ccy for legacy NULL rows).
  const renderAccountItem = useCallback(
    ({ item: account, drag, isActive }: RenderItemParams<Account>) => {
      const accountSymbol = symbolFor(account.currency ?? currency);
      return (
        <View style={[s.row, isActive && s.rowDragging]}>
          {/* No visible edit affordance: tap the row to edit, long-press to
              reorder (the 3-line handle's old job, now bound to the row). */}
          <TouchableOpacity
            style={s.rowBody}
            onPress={() => openEditAccount(account)}
            onLongPress={accounts.length > 1 ? drag : undefined}
            delayLongPress={150}
            activeOpacity={0.2}
          >
            <Text style={s.rowLabel}>{account.name}</Text>
            <View style={s.rowRight}>
              <Text style={s.rowValue}>{fmt(parseAmt(account.amount), accountSymbol)}</Text>
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [accounts.length, currency],
  );

  const deleteAccount = async (account: Account) => {
    setAccountModal({ visible: false, editing: null });
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    feedback.destroy();
    await removeAccount(account.id);
    showToast(`Deleted ${account.name}`, {
      label: 'Undo',
      onPress: async () => {
        setAccounts((prev) => [...prev, account]);
        await persistAccount(account);
      },
    });
  };

  // ── Add / Remove money flow ───────────────────────────────────────────────
  const openMoneyFlow = (mode: 'add' | 'remove') => {
    if (accounts.length === 0) {
      feedback.error();
      Alert.alert('No accounts', 'Add a cash account first.');
      return;
    }
    feedback.tap();
    setMoneyAmount('');
    setMoneyNote('');
    setMoneyCurrency(peekCurrencySettings().global);
    setMoneyModal({ visible: true, mode });
  };

  const commitMoney = async (account: Account) => {
    const entered = parseAmt(moneyAmount);
    if (entered <= 0) return;
    // The amount is entered in `moneyCurrency`; the account may hold another.
    // Convert into the account's currency before applying it and logging it.
    const accountCcy = account.currency ?? currency;
    const amount = convert(entered, moneyCurrency, accountCcy, rates.rates);
    const direction = moneyModal.mode === 'add' ? 'in' : 'out';
    const delta = direction === 'in' ? amount : -amount;
    const updated: Account = {
      ...account,
      amount: String(parseAmt(account.amount) + delta),
    };
    const note = moneyNote.trim() || null;
    setAccounts(accounts.map((a) => (a.id === account.id ? updated : a)));
    setMoneyModal({ visible: false, mode: moneyModal.mode });
    if (direction === 'in') feedback.moneyIn();
    else feedback.moneyOut();
    await Promise.all([
      persistAccount(updated),
      logTransaction({ accountId: account.id, amount, direction, kind: 'manual', note }),
    ]);
  };

  // ── Edit / delete a logged transaction (from the statement) ───────────────
  // Editing a transaction adjusts the funding account by the difference
  // between the new and old effect — so fixing a typo'd amount or a wrong
  // direction also corrects the balance. account/kind/date stay fixed.
  const handleEditTransaction = useCallback(
    (updated: Transaction) => {
      const original = transactions.find((t) => t.id === updated.id);
      if (!original) return;
      const account = accounts.find((a) => a.id === updated.accountId);
      if (account) {
        const delta = txEffect(updated) - txEffect(original);
        if (delta !== 0) {
          const next: Account = {
            ...account,
            amount: String(parseAmt(account.amount) + delta),
          };
          setAccounts((prev) => prev.map((a) => (a.id === account.id ? next : a)));
          persistAccount(next);
        }
      }
      setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      feedback.success();
      updateTransaction(updated);
    },
    [transactions, accounts],
  );

  // Deleting a transaction reverses its effect on the account balance. If it
  // is a recurring bill's *current* payment, it also un-pays that bill
  // (mirrors un-ticking it in Recurrings) — older cost rows in history are
  // just removed + refunded, since the bill may since have been re-paid.
  // Returns an undo closure that restores the row, the balance and the bill.
  const handleDeleteTransaction = useCallback(
    (tx: Transaction): (() => void) => {
      const account = accounts.find((a) => a.id === tx.accountId) ?? null;
      const refundDelta = -txEffect(tx);

      let costToUnpay: Cost | null = null;
      if (tx.kind === 'cost' && tx.referenceId) {
        const cost = costs.find((c) => c.id === tx.referenceId) ?? null;
        const latestCostTx = transactions
          .filter((t) => t.kind === 'cost' && t.referenceId === tx.referenceId)
          .reduce<Transaction | null>(
            (latest, t) => (!latest || t.createdAt > latest.createdAt ? t : latest),
            null,
          );
        if (cost && cost.paid && latestCostTx?.id === tx.id) costToUnpay = cost;
      }

      // Unmutated snapshots captured for Undo.
      const prevAccount = account;
      const prevCost = costToUnpay;

      if (account) {
        const next: Account = {
          ...account,
          amount: String(parseAmt(account.amount) + refundDelta),
        };
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? next : a)));
        persistAccount(next);
      }
      if (costToUnpay) {
        const unpaid: Cost = {
          ...costToUnpay,
          paid: false,
          paidFromAccountId: null,
          paidMonth: null,
          paidAmount: null,
        };
        setCosts((prev) => prev.map((c) => (c.id === unpaid.id ? unpaid : c)));
        persistCost(unpaid);
      }
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
      feedback.destroy();
      deleteTransaction(tx.id);

      return () => {
        setTransactions((prev) =>
          prev.some((t) => t.id === tx.id)
            ? prev
            : [...prev, tx].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
        restoreTransaction(tx);
        if (prevAccount) {
          setAccounts((prev) => prev.map((a) => (a.id === prevAccount.id ? prevAccount : a)));
          persistAccount(prevAccount);
        }
        if (prevCost) {
          setCosts((prev) => prev.map((c) => (c.id === prevCost.id ? prevCost : c)));
          persistCost(prevCost);
        }
      };
    },
    [accounts, costs, transactions],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <View style={[s.header, { justifyContent: 'center' }]}>
        <View style={s.headerActions}>
          <TouchableOpacity style={s.headerRemoveBtn} onPress={() => openMoneyFlow('remove')}>
            <Ionicons name="remove" size={24} color="#FFA94D" style={glowAmber} />
          </TouchableOpacity>
          <TouchableOpacity style={s.headerAddBtn} onPress={() => openMoneyFlow('add')}>
            <Ionicons name="add" size={24} color="#00C896" style={glowGreen} />
          </TouchableOpacity>
        </View>
      </View>

      <SortableScroll contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <TrialBanner />

        {/* Hero */}
        <TouchableOpacity style={s.heroCard} onPress={openHistory} activeOpacity={0.85}>
          <View style={s.heroTopRow}>
            <Text style={s.heroLabel}>AFTER MONTHLY PAYMENTS</Text>
            <Ionicons name="chevron-forward" size={18} color="#555" />
          </View>
          <Text style={s.heroAmount}>{fmt(afterPayments, symbol)}</Text>
          <View style={s.heroDivider} />
          <View style={s.heroRow}>
            <Text style={s.heroSubLabel}>Current liquidity</Text>
            <Text style={s.heroSubValue}>{fmt(totalLiquid, symbol)}</Text>
          </View>
          {/* Per-currency breakdown, only when the user has 2+ currencies in
              play AND the Settings toggle is ON. Single-currency users see
              the original compact hero — no clutter. */}
          {cashViewMode === 'breakdown' && Object.keys(liquidByCcy).length > 1 && (
            <>
              <View style={s.heroDivider} />
              <Text style={s.heroBreakdownLabel}>BY CURRENCY</Text>
              {Object.entries(liquidByCcy).map(([ccy, amt]) => (
                <View key={ccy} style={s.heroBreakdownRow}>
                  <Text style={s.heroBreakdownCcy}>{ccy}</Text>
                  <Text style={s.heroBreakdownValue}>{fmt(amt, symbolFor(ccy))}</Text>
                </View>
              ))}
            </>
          )}
        </TouchableOpacity>

        {/* Accounts — always a flat list; rows show their own currency
            symbol (per-account currency was the simple win). The
            per-currency breakdown moved up into the hero card. */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Cash Accounts</Text>
          </View>

          {accounts.length === 0 ? (
            <TouchableOpacity style={s.empty} onPress={openAddAccount}>
              <Ionicons name="wallet-outline" size={26} color="#333" />
              <Text style={s.emptyText}>Add your first account</Text>
            </TouchableOpacity>
          ) : (
            <>
              {Platform.OS === 'web' ? (
                accounts.map((account) => {
                  const d = accountDrag(account.id);
                  const accountSymbol = symbolFor(account.currency ?? currency);
                  return (
                    <DraggableRow
                      key={account.id}
                      handlers={{ ...d, draggable: d.draggable && accounts.length > 1 }}
                      style={[
                        s.row,
                        d.isDragging && s.rowDragging,
                        d.isHovered && s.rowDropTarget,
                      ]}
                    >
                      <TouchableOpacity
                        style={s.rowBody}
                        onPress={() => openEditAccount(account)}
                        activeOpacity={0.2}
                      >
                        <Text style={s.rowLabel}>{account.name}</Text>
                        <View style={s.rowRight}>
                          <Text style={s.rowValue}>{fmt(parseAmt(account.amount), accountSymbol)}</Text>
                        </View>
                      </TouchableOpacity>
                    </DraggableRow>
                  );
                })
              ) : (
                <NestableDraggableFlatList
                  data={accounts}
                  keyExtractor={(a) => a.id}
                  renderItem={renderAccountItem}
                  onDragEnd={({ data }) => reorderAccounts(data)}
                  activationDistance={5}
                />
              )}
              <TouchableOpacity style={s.addCostRow} onPress={openAddAccount}>
                <Ionicons name="add-circle-outline" size={16} color="#00C896" style={glowGreen} />
                <Text style={[s.addCostText, glowGreen]}>Add Account</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Monthly costs — managed in Recurrings; this is a tap-through
            summary, so it's hidden when that tab is toggled off. */}
        {showRecurrings && (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.7}
            onPress={() => router.navigate('/recurrings')}
          >
            <View style={s.cardHeader}>
              <View>
                <Text style={s.cardTitle}>Monthly Costs</Text>
                <Text style={s.cardSubtitle}>
                  {fmt(unpaidCosts, symbol)} unpaid · {fmt(monthlyCosts.reduce((sum, c) => sum + parseAmt(c.amount), 0), symbol)} total
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#555" />
            </View>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </SortableScroll>

      {/* Account Modal */}
      <Modal visible={accountModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>
                {accountModal.editing ? 'Edit Account' : 'Add Account'}
              </Text>
              <Text style={s.inputLabel}>Account Name</Text>
              <TextInput
                style={s.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Revolut"
                placeholderTextColor="#444"
                autoFocus
              />
              <Text style={s.inputLabel}>Amount ({formCurrency})</Text>
              <TextInput
                style={s.input}
                value={formAmount}
                onChangeText={setFormAmount}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
              <Text style={s.inputLabel}>Currency</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.ccyPicker}
                contentContainerStyle={s.ccyPickerContent}
                keyboardShouldPersistTaps="handled"
              >
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.ccyPill, formCurrency === c.code && s.ccyPillActive]}
                    onPress={() => setFormCurrency(c.code)}
                  >
                    <Text
                      style={[
                        s.ccyPillText,
                        formCurrency === c.code && s.ccyPillTextActive,
                      ]}
                    >
                      {c.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setAccountModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveAccount}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {accountModal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => deleteAccount(accountModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete account</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* Add / remove money sheet */}
      <Modal visible={moneyModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.overlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeMoneyModal}
            />
            <View style={s.sheet}>
              <View style={s.dragHandleBar} />
              <View style={s.sheetHeaderRow}>
                <Text style={[s.sheetTitle, { marginBottom: 0 }]}>
                  {moneyModal.mode === 'add' ? 'Add money' : 'Remove money'}
                </Text>
                <TouchableOpacity style={s.closeIconBtn} onPress={closeMoneyModal}>
                  <Ionicons name="close" size={20} color="#666" />
                </TouchableOpacity>
              </View>
              <Text style={s.inputLabel}>Amount ({moneyCurrency})</Text>
              <TextInput
                style={s.input}
                value={moneyAmount}
                onChangeText={setMoneyAmount}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={s.inputLabel}>Currency</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.ccyPicker}
                contentContainerStyle={s.ccyPickerContent}
                keyboardShouldPersistTaps="handled"
              >
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[s.ccyPill, moneyCurrency === c.code && s.ccyPillActive]}
                    onPress={() => setMoneyCurrency(c.code)}
                  >
                    <Text
                      style={[
                        s.ccyPillText,
                        moneyCurrency === c.code && s.ccyPillTextActive,
                      ]}
                    >
                      {c.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={s.input}
                value={moneyNote}
                onChangeText={setMoneyNote}
                placeholder={moneyModal.mode === 'add' ? 'Optional: what for? (paycheck, refund…)' : 'Optional: what for? (groceries, rent…)'}
                placeholderTextColor="#3A3A3A"
                maxLength={200}
              />
              <Text style={s.pickerSub}>
                {parseAmt(moneyAmount) > 0
                  ? moneyModal.mode === 'add'
                    ? 'Tap an account to add this to it.'
                    : 'Tap an account to remove from.'
                  : 'Enter an amount, then pick an account.'}
              </Text>
              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                {accounts.map((account, i) => {
                  // Each account renders in its own currency; the entered
                  // amount (in moneyCurrency) is converted into it.
                  const accountCcy = account.currency ?? currency;
                  const accountSymbol = symbolFor(accountCcy);
                  const entered = parseAmt(moneyAmount);
                  const converted = convert(entered, moneyCurrency, accountCcy, rates.rates);
                  const delta = moneyModal.mode === 'add' ? converted : -converted;
                  const newBalance = parseAmt(account.amount) + delta;
                  const goesNegative = newBalance < 0;
                  const disabled = entered <= 0;
                  const isAdd = moneyModal.mode === 'add';
                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={[
                        s.pickerRow,
                        i > 0 && { borderTopWidth: 1, borderTopColor: '#222' },
                        disabled && { opacity: 0.4 },
                      ]}
                      onPress={() => commitMoney(account)}
                      disabled={disabled}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickerName}>{account.name}</Text>
                        <Text style={[s.pickerBalance, goesNegative && s.pickerNegative]}>
                          {fmt(parseAmt(account.amount), accountSymbol)} → {fmt(newBalance, accountSymbol)}
                        </Text>
                      </View>
                      <Ionicons
                        name={isAdd ? 'add-circle-outline' : 'remove-circle-outline'}
                        size={18}
                        color={isAdd ? '#00C896' : '#FFA94D'}
                        style={isAdd ? glowGreen : glowAmber}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* Money log — bank-statement-style read-only history */}
      <Modal visible={historyVisible} transparent animationType="slide">
        <View style={s.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setHistoryVisible(false)}
          />
          <View style={s.sheet}>
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { marginBottom: 0 }]}>Money log</Text>
              <TouchableOpacity style={s.closeIconBtn} onPress={() => setHistoryVisible(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            {transactions.length === 0 ? (
              <View style={s.txEmpty}>
                <Ionicons name="time-outline" size={28} color="#333" />
                <Text style={s.txEmptyText}>No activity yet</Text>
                <Text style={s.txEmptyHint}>
                  Every + / − and every cost paid will appear here.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const groups: { month: string; rows: Transaction[] }[] = [];
                  let lastMonth = '';
                  for (const tx of transactions) {
                    const m = txMonthKey(tx.createdAt);
                    if (m !== lastMonth) {
                      groups.push({ month: m, rows: [] });
                      lastMonth = m;
                    }
                    groups[groups.length - 1].rows.push(tx);
                  }

                  const openStatement = (g: { month: string; rows: Transaction[] }) => {
                    const sample = new Date(g.rows[0].createdAt);
                    feedback.tap();
                    setHistoryVisible(false);
                    setStatement({
                      visible: true,
                      year: sample.getFullYear(),
                      month: sample.getMonth(),
                      label: g.month,
                    });
                  };

                  return (
                    <View style={s.txGroup}>
                      {groups.map((g, i) => (
                        <TouchableOpacity
                          key={g.month}
                          style={[s.txMonthRow, i > 0 && s.txMonthDivider]}
                          onPress={() => openStatement(g)}
                          activeOpacity={0.6}
                        >
                          <Text style={s.txMonthLabel}>{g.month}</Text>
                          <Ionicons name="chevron-forward" size={18} color="#555" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })()}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {statement.visible && (
        <StatementSheet
          visible={statement.visible}
          monthLabel={statement.label}
          monthYear={statement.year}
          monthIndex={statement.month}
          transactions={transactions}
          accounts={accounts}
          symbol={symbol}
          currency={currency}
          onEditTransaction={handleEditTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          onClose={() => setStatement((sx) => ({ ...sx, visible: false }))}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1F3A30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRemoveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1610',
    borderWidth: 1,
    borderColor: '#3A2A18',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFA94D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  scroll: { paddingHorizontal: 16 },
  heroCard: { ...surface, borderRadius: 20, padding: 24, marginBottom: 16 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  heroLabel: { fontSize: 10, fontWeight: '600', color: '#555', letterSpacing: 1.5 },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#00C896',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroDivider: { height: 1, backgroundColor: '#1E1E1E', marginVertical: 18 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroSubLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  heroSubValue: { fontSize: 17, fontWeight: '700', color: '#AAA', fontVariant: ['tabular-nums'] },

  card: { ...surface, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  cardSubtitle: { fontSize: 12, color: '#555', marginTop: 3, fontWeight: '500', fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
    gap: 8,
  },
  costBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowDragging: { opacity: 0.35 },
  rowDropTarget: { borderTopWidth: 2, borderTopColor: '#00C896' },
  rowLabel: { flex: 1, fontSize: 15, color: '#EEE', fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { fontSize: 14, color: '#888', fontWeight: '500', fontVariant: ['tabular-nums'] },
  costMeta: { fontSize: 11, color: '#555', marginTop: 2, fontWeight: '500' },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  strikethrough: { color: '#444', textDecorationLine: 'line-through' },
  empty: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  emptyText: { fontSize: 14, color: '#777', fontWeight: '600' },
  addCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  addCostText: { fontSize: 14, color: '#00C896', fontWeight: '500' },

  // Sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '85%',
  },
  dragHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', letterSpacing: -0.3, marginBottom: 16 },
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
  row2col: { flexDirection: 'row', gap: 12 },
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

  // Delete link inside edit modals
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteLinkText: { fontSize: 13, color: '#FF6B6B', fontWeight: '500' },

  // Picker
  pickerSub: { fontSize: 13, color: '#666', marginBottom: 18, lineHeight: 18, fontWeight: '500' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  pickerName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  pickerBalance: { fontSize: 12, color: '#555', marginTop: 3, fontWeight: '500', fontVariant: ['tabular-nums'] },
  pickerNegative: { color: '#FFA94D' },

  // Money log (history sheet)
  txEmpty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  txEmptyText: { fontSize: 14, color: '#666', fontWeight: '600' },
  txEmptyHint: { fontSize: 12, color: '#444', fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
  txGroup: { marginBottom: 14 },
  txMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 18,
  },
  txMonthDivider: { borderTopWidth: 1, borderTopColor: '#1C1C1C' },
  txMonthLabel: { fontSize: 16, fontWeight: '600', color: '#EEE', letterSpacing: 0.3 },

  // Currency picker pills inside the account add/edit modal.
  ccyPicker: { marginBottom: 20 },
  ccyPickerContent: { gap: 8, paddingRight: 16 },
  ccyPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  ccyPillActive: {
    backgroundColor: '#0D1F1A',
    borderColor: '#1F3A30',
  },
  ccyPillText: { fontSize: 13, color: '#888', fontWeight: '600', letterSpacing: 0.4 },
  ccyPillTextActive: { color: '#00C896' },

  // Per-currency breakdown rendered INSIDE the hero card when the user has
  // multiple currencies AND the Settings toggle is on. Hero stays compact
  // for single-currency users by gating on Object.keys(liquidByCcy).length.
  heroBreakdownLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  heroBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  heroBreakdownCcy: {
    fontSize: 13,
    color: '#777',
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  heroBreakdownValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#CCC',
    fontVariant: ['tabular-nums'],
  },
});
