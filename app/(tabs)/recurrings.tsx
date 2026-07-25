import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CURRENCIES } from '../../lib/currencies';
import {
  getCurrencyForPage,
  peekCurrencyForPage,
  refreshCurrencyForPage,
} from '../../lib/currency';
import { peekRates, subscribeRates, convert, type Rates } from '../../lib/exchangeRates';
import { surface } from '../../lib/surface';
import {
  Account,
  Cost,
  getDashboard,
  peekDashboard,
  refreshDashboard,
  saveCost as persistCost,
  deleteCost as removeCost,
  saveAccount as persistAccount,
  newId,
  currentMonthKey,
} from '../../lib/dashboard';
import { logTransaction, deleteLastCostTransaction } from '../../lib/transactions';
import { nextOccurrence, parseAmount } from '../../lib/finance';
import { showToast } from '../../lib/toast';
import { feedback } from '../../lib/feedback';
import { glowGreen, glowAmber } from '../../lib/glows';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 1 → Monthly, 3 → Quarterly, 12 → Yearly, anything else → "Every N months".
function freqLabel(n: number): string {
  if (n === 1) return 'Monthly';
  if (n === 3) return 'Quarterly';
  if (n === 12) return 'Yearly';
  return `Every ${n} months`;
}

type FreqMode = 'monthly' | 'quarterly' | 'yearly' | 'custom';
const MODE_INTERVAL: Record<Exclude<FreqMode, 'custom'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};
function modeForInterval(n: number): FreqMode {
  if (n === 1) return 'monthly';
  if (n === 3) return 'quarterly';
  if (n === 12) return 'yearly';
  return 'custom';
}

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseAmt(s: string): number {
  return parseAmount(s);
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type RecurringScope = 'personal' | 'business';

export default function Recurrings({
  embedded = false,
  accountType = 'personal',
  sectionTitle,
  bottomSpacer = 40,
}: {
  embedded?: boolean;
  accountType?: RecurringScope;
  sectionTitle?: string;
  bottomSpacer?: number;
}) {
  const insets = useSafeAreaInsets();
  const [costs, setCosts] = useState<Cost[]>(() => peekDashboard().costs);
  const [accounts, setAccounts] = useState<Account[]>(() => peekDashboard().accounts);
  const [trackW, setTrackW] = useState(0);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('dashboard'));
  // FX rates: costs are in the page's display currency, but a funding cash
  // account may hold a different one — paying converts between the two.
  // peekRates() returns IDENTITY only on a cold start with no cache.
  const [rates, setRates] = useState<Rates>(() => peekRates());
  useEffect(() => subscribeRates(setRates), []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDashboard().then((d) => {
        if (!cancelled) {
          setCosts(d.costs);
          setAccounts(d.accounts);
        }
      });
      refreshDashboard().then((d) => {
        if (!cancelled) {
          setCosts(d.costs);
          setAccounts(d.accounts);
        }
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
    }, []),
  );

  // ── Add / edit / delete ───────────────────────────────────────────────────
  const [costModal, setCostModal] = useState<{ visible: boolean; editing: Cost | null }>({
    visible: false,
    editing: null,
  });
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState(() => peekCurrencyForPage('dashboard'));
  const [formDueDay, setFormDueDay] = useState('1');
  const [formMode, setFormMode] = useState<FreqMode>('monthly');
  const [formCustomN, setFormCustomN] = useState('2');
  const [formDueMonth, setFormDueMonth] = useState(new Date().getMonth() + 1);
  const [monthlyExpanded, setMonthlyExpanded] = useState(true);
  const [periodicExpanded, setPeriodicExpanded] = useState(true);

  // The effective interval the form currently represents.
  const formInterval =
    formMode === 'custom'
      ? Math.max(2, parseInt(formCustomN) || 2)
      : MODE_INTERVAL[formMode];

  const openAdd = () => {
    setFormName('');
    setFormAmount('');
    setFormCurrency(currency);
    setFormDueDay(String(new Date().getDate()));
    setFormMode('monthly');
    setFormCustomN('2');
    setFormDueMonth(new Date().getMonth() + 1);
    feedback.tap();
    setCostModal({ visible: true, editing: null });
  };

  const openEdit = (cost: Cost) => {
    setFormName(cost.name);
    setFormAmount(cost.amount);
    setFormCurrency(cost.currency ?? currency);
    setFormDueDay(String(cost.dueDay ?? 1));
    const interval = cost.intervalMonths ?? 1;
    const mode = modeForInterval(interval);
    setFormMode(mode);
    setFormCustomN(mode === 'custom' ? String(interval) : '2');
    setFormDueMonth(cost.dueMonth ?? new Date().getMonth() + 1);
    feedback.tap();
    setCostModal({ visible: true, editing: cost });
  };

  const saveForm = async () => {
    if (!formName.trim()) return;
    const editing = costModal.editing;
    const dueDay = Math.min(31, Math.max(1, parseInt(formDueDay) || 1));
    const intervalMonths = formInterval;
    // dueMonth anchors non-monthly bills to a calendar month; monthly bills
    // recur every month so it carries no meaning — store null.
    const dueMonth = intervalMonths === 1 ? null : formDueMonth;
    const cost: Cost = editing
      ? { ...editing, name: formName.trim(), amount: formAmount, currency: formCurrency, dueDay, intervalMonths, dueMonth }
      : {
          id: newId(),
          name: formName.trim(),
          amount: formAmount,
          paid: false,
          position: costs.filter((item) => (accountType === 'business' ? item.accountType === 'business' : item.accountType !== 'business')).length,
          dueDay,
          intervalMonths,
          dueMonth,
          paidFromAccountId: null,
          paidMonth: null,
          paidAmount: null,
          currency: formCurrency,
          accountType,
        };
    setCosts(
      editing ? costs.map((c) => (c.id === editing.id ? cost : c)) : [...costs, cost],
    );
    setCostModal({ visible: false, editing: null });
    feedback.success();
    await persistCost(cost);
  };

  const removeForm = async (cost: Cost) => {
    setCostModal({ visible: false, editing: null });
    setCosts((prev) => prev.filter((c) => c.id !== cost.id));
    feedback.destroy();
    await removeCost(cost.id);
    showToast(`Deleted ${cost.name}`, {
      label: 'Undo',
      onPress: async () => {
        setCosts((prev) => [...prev, cost]);
        await persistCost(cost);
      },
    });
  };

  // ── Pay / unpay ───────────────────────────────────────────────────────────
  const [accountPicker, setAccountPicker] = useState<{ visible: boolean; cost: Cost | null }>({
    visible: false,
    cost: null,
  });

  const closeAccountPicker = useCallback(
    () => setAccountPicker({ visible: false, cost: null }),
    [],
  );

  const tapTickbox = (cost: Cost) => {
    if (cost.paid) {
      // Untick — refund to the account it was paid from (if it still exists).
      const refundTo = cost.paidFromAccountId
        ? accounts.find((a) => a.id === cost.paidFromAccountId)
        : null;
      if (refundTo) {
        // Refund exactly what was deducted. paidAmount is snapshotted in the
        // account's own currency at pay time, so this is FX-drift-free and
        // stays correct even if the cost's amount was edited while paid.
        // Legacy rows paid before multi-currency carry no paidAmount — back
        // then the raw cost amount was deducted as-is, so fall back to it.
        const refund = cost.paidAmount ?? parseAmt(cost.amount);
        const updatedAccount: Account = {
          ...refundTo,
          amount: String(parseAmt(refundTo.amount) + refund),
        };
        setAccounts(accounts.map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
        persistAccount(updatedAccount);
        // Reverse the original payment in the ledger (delete the row)
        // instead of stacking an offsetting refund entry.
        deleteLastCostTransaction(cost.id);
      }
      const updated: Cost = { ...cost, paid: false, paidFromAccountId: null, paidMonth: null, paidAmount: null };
      setCosts(costs.map((c) => (c.id === cost.id ? updated : c)));
      persistCost(updated);
      feedback.select();
      return;
    }
    const eligibleAccounts = accounts.filter((account) =>
      accountType === 'business' ? account.accountType === 'business' : account.accountType !== 'business',
    );
    if (eligibleAccounts.length === 0) {
      Alert.alert('No accounts', `Add a ${accountType} account first so you can pay this cost.`);
      return;
    }
    feedback.tap();
    setAccountPicker({ visible: true, cost });
  };

  // Escape hatch: user paid by some means we don't track (cash, someone
  // else paid, points/credits). Marks the cost paid, leaves all cash
  // accounts untouched, and intentionally writes nothing to the money
  // history — there's no real movement to log. The un-pay reversal flow
  // already handles paidFromAccountId === null correctly (the refund
  // lookup gates on truthiness), so flipping back to unpaid later is a
  // clean no-op on balances.
  const payWithoutDeducting = async () => {
    const cost = accountPicker.cost;
    if (!cost) return;
    const updatedCost: Cost = {
      ...cost,
      paid: true,
      paidFromAccountId: null,
      paidMonth: currentMonthKey(),
      paidAmount: null,
    };
    setCosts(costs.map((c) => (c.id === cost.id ? updatedCost : c)));
    setAccountPicker({ visible: false, cost: null });
    feedback.success();
    await persistCost(updatedCost);
  };

  const payFromAccount = async (account: Account) => {
    const cost = accountPicker.cost;
    if (!cost) return;
    // The cost is denominated in the page's display currency; the funding
    // account may hold a different one. Convert into the account's currency,
    // then snapshot the deducted figure on the cost so un-pay refunds exactly
    // what left — no FX drift, and ledger stays in the account's currency.
    const costCcy = cost.currency ?? currency;
    const accountCcy = account.currency ?? currency;
    const deducted = convert(parseAmt(cost.amount), costCcy, accountCcy, rates.rates);
    const updatedAccount: Account = {
      ...account,
      amount: String(parseAmt(account.amount) - deducted),
    };
    const updatedCost: Cost = {
      ...cost,
      paid: true,
      paidFromAccountId: account.id,
      paidMonth: currentMonthKey(),
      paidAmount: deducted,
    };
    setAccounts(accounts.map((a) => (a.id === account.id ? updatedAccount : a)));
    setCosts(costs.map((c) => (c.id === cost.id ? updatedCost : c)));
    setAccountPicker({ visible: false, cost: null });
    feedback.success();
    await Promise.all([
      persistAccount(updatedAccount),
      persistCost(updatedCost),
      logTransaction({
        accountId: account.id,
        amount: deducted,
        direction: 'out',
        kind: 'cost',
        referenceId: cost.id,
        note: cost.name,
      }),
    ]);
  };

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';

  // Monthly costs drive the hero. Periodic (quarterly/yearly/custom) bills are
  // deliberately kept out of the monthly figure and surfaced separately so the
  // "left to pay this month" number stays honest.
  const scopedCosts = costs.filter((cost) =>
    accountType === 'business' ? cost.accountType === 'business' : cost.accountType !== 'business',
  );
  const scopedAccounts = accounts.filter((account) =>
    accountType === 'business' ? account.accountType === 'business' : account.accountType !== 'business',
  );
  const monthlyCosts = scopedCosts.filter((c) => (c.intervalMonths ?? 1) === 1);
  const periodicCosts = scopedCosts.filter((c) => (c.intervalMonths ?? 1) !== 1);

  const total = monthlyCosts.reduce((sum, c) => sum + convert(parseAmt(c.amount), c.currency ?? currency, currency, rates.rates), 0);
  const paid = monthlyCosts.reduce((sum, c) => (c.paid ? sum + convert(parseAmt(c.amount), c.currency ?? currency, currency, rates.rates) : sum), 0);
  const left = Math.max(0, total - paid);
  const pct = total > 0 ? Math.min(1, paid / total) : 0;
  const currentLiquidity = scopedAccounts.reduce(
    (sum, account) => sum + convert(parseAmt(account.amount), account.currency ?? currency, currency, rates.rates),
    0,
  );

  // Unpaid bills always lead the list. Within each paid/unpaid group, preserve
  // the natural due-date order so the next thing to pay is still first.
  const sorted = [...monthlyCosts].sort(
    (a, b) => Number(a.paid) - Number(b.paid) || (a.dueDay ?? 1) - (b.dueDay ?? 1),
  );

  // Periodic: annualized headline, rows sorted by their next due date.
  const annualPeriodic = periodicCosts.reduce(
    (sum, c) => sum + convert(parseAmt(c.amount) * 12 / (c.intervalMonths ?? 1), c.currency ?? currency, currency, rates.rates),
    0,
  );
  const periodicSorted = [...periodicCosts]
    .map((c) => ({ c, due: nextOccurrence(c.dueMonth ?? 1, c.intervalMonths ?? 12) }))
    .sort(
      (a, b) =>
        Number(a.c.paid) - Number(b.c.paid) ||
        a.due.year - b.due.year ||
        a.due.month - b.due.month ||
        (a.c.dueDay ?? 1) - (b.c.dueDay ?? 1),
    );

  // Shared row renderer. `subtitle` is the only thing that differs between the
  // monthly list ("Due 15th") and the periodic list ("Yearly · Mar 2027").
  const renderCostRow = (c: Cost, i: number, subtitle: string) => (
    <Pressable
      key={c.id}
      onPress={() => openEdit(c)}
      style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: '#1A1A1A' }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.rowName, c.paid && s.rowNamePaid]}>{c.name}</Text>
        <Text style={s.rowDue}>{subtitle}</Text>
      </View>
      <Text style={[s.rowAmount, c.paid && s.rowAmountPaid]}>
        {fmt(parseAmt(c.amount), CURRENCIES.find((x) => x.code === (c.currency ?? currency))?.symbol ?? symbol)}
      </Text>
      <Pressable
        onPress={() => tapTickbox(c)}
        hitSlop={8}
        style={[s.statusDot, c.paid ? s.statusPaid : s.statusDue]}
      >
        <Ionicons
          name={c.paid ? 'checkmark' : 'time-outline'}
          size={18}
          color={c.paid ? '#00C896' : '#FFA94D'}
          style={c.paid ? glowGreen : glowAmber}
        />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={[s.container, embedded ? s.embeddedContainer : { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={[s.scroll, embedded && s.embeddedScroll]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!embedded}
      >
        {!embedded && <View style={s.heroCard}>
          <Text style={s.heroLabel}>CURRENT LIQUIDITY</Text>
          <Text style={[s.heroLiquidityAmount, glowGreen]}>{fmt(currentLiquidity, symbol)}</Text>
          <View style={s.progressHeader}>
            <Text style={s.progressLabel}>MONTHLY PAYMENTS</Text>
            <Text style={[s.progressValue, left === 0 && total > 0 && s.progressValueComplete]}>
              {left === 0 && total > 0 ? 'Covered' : `${fmt(paid, symbol)} of ${fmt(total, symbol)}`}
            </Text>
          </View>
          <View
            style={s.barTrack}
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
          >
            <View style={[s.barClip, { width: `${pct * 100}%` }]}>
              <LinearGradient
                colors={['#FFA94D', '#00C896']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: trackW || '100%', height: 6 }}
              />
            </View>
          </View>
          <View style={s.progressFooter}>
            {left === 0 && total > 0 ? <><Ionicons name="checkmark-circle" size={15} color="#00C896" style={glowGreen} /><Text style={[s.progressStatus, glowGreen]}>All monthly costs are covered</Text></> : <Text style={s.progressStatus}>{fmt(left, symbol)} left across {monthlyCosts.length} {monthlyCosts.length === 1 ? 'bill' : 'bills'}</Text>}
          </View>
        </View>}

        {sectionTitle && <Text style={s.embeddedSectionTitle}>{sectionTitle}</Text>}

        {/* Monthly */}
        <View style={s.card}>
          <TouchableOpacity style={s.cardHeader} onPress={() => setMonthlyExpanded((value) => !value)} activeOpacity={0.7}>
            <View>
              <Text style={s.cardTitle}>{accountType === 'business' ? 'Monthly payments' : 'Monthly'}</Text>
              <Text style={s.cardSub}>{fmt(total, symbol)}/mo · {monthlyCosts.length} {monthlyCosts.length === 1 ? 'bill' : 'bills'}</Text>
            </View>
            <Ionicons name={monthlyExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#555" />
          </TouchableOpacity>

          {monthlyExpanded && (sorted.length === 0 ? (
            <TouchableOpacity style={s.empty} onPress={openAdd}>
              <Ionicons name="repeat-outline" size={26} color="#333" />
              <Text style={s.emptyText}>No monthly {accountType === 'business' ? 'payments' : 'costs'} yet</Text>
              <Text style={s.emptyHint}>Tap to add your first recurring {accountType === 'business' ? 'payment' : 'cost'}.</Text>
            </TouchableOpacity>
          ) : (
            <>
              {sorted.map((c, i) => renderCostRow(c, i, `Due ${ordinal(c.dueDay ?? 1)}`))}
              <TouchableOpacity style={s.addCostRow} onPress={openAdd}>
                <Ionicons name="add-circle-outline" size={16} color="#00C896" style={glowGreen} />
                <Text style={[s.addCostText, glowGreen]}>Add {accountType === 'business' ? 'Payment' : 'Recurring'}</Text>
              </TouchableOpacity>
            </>
          ))}
        </View>

        {/* Periodic — quarterly / yearly / custom. Annualized headline; NOT
            folded into the monthly figure above. */}
        {periodicCosts.length > 0 && (
          <View style={[s.card, { marginTop: 14 }]}>
            <TouchableOpacity style={s.cardHeader} onPress={() => setPeriodicExpanded((value) => !value)} activeOpacity={0.7}>
              <View>
                <Text style={s.cardTitle}>{accountType === 'business' ? 'Periodic payments' : 'Periodic'}</Text>
                <Text style={s.cardSub}>
                  {fmt(annualPeriodic, symbol)}/yr · {periodicCosts.length}{' '}
                  {periodicCosts.length === 1 ? 'bill' : 'bills'}
                </Text>
              </View>
              <Ionicons name={periodicExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#555" />
            </TouchableOpacity>
            {periodicExpanded && <>
            {periodicSorted.map(({ c, due }, i) =>
              renderCostRow(
                c,
                i,
                `${freqLabel(c.intervalMonths ?? 12)} · ${
                  due.year === new Date().getFullYear()
                    ? `${MONTHS[due.month - 1]} ${ordinal(c.dueDay ?? 1)}`
                    : `${MONTHS[due.month - 1]} ${due.year}`
                }`,
              ),
            )}
            <TouchableOpacity style={s.addCostRow} onPress={openAdd}>
              <Ionicons name="add-circle-outline" size={16} color="#00C896" style={glowGreen} />
              <Text style={[s.addCostText, glowGreen]}>Add Periodic {accountType === 'business' ? 'Payment' : ''}</Text>
            </TouchableOpacity>
            </>}
          </View>
        )}

        <View style={{ height: bottomSpacer }} />
      </ScrollView>

      <Modal visible={costModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>
                {costModal.editing ? `Edit ${accountType === 'business' ? 'Payment' : 'Cost'}` : `Add Recurring ${accountType === 'business' ? 'Payment' : 'Cost'}`}
              </Text>
              <ScrollView
                style={{ flexShrink: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
              <Text style={s.inputLabel}>Name</Text>
              <TextInput
                style={s.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Netflix"
                placeholderTextColor="#444"
                autoFocus
              />
              <View style={s.row2col}>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Currency</Text>
                  <View style={s.currencyGrid}>
                    {CURRENCIES.map((item) => (
                      <TouchableOpacity key={item.code} style={[s.currencyPill, formCurrency === item.code && s.currencyPillActive]} onPress={() => setFormCurrency(item.code)}>
                        <Text style={[s.currencyPillText, formCurrency === item.code && s.currencyPillTextActive]}>{item.symbol} {item.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.inputLabel}>Amount ({formCurrency})</Text>
                  <TextInput
                    style={s.input}
                    value={formAmount}
                    onChangeText={setFormAmount}
                    placeholder="0.00"
                    placeholderTextColor="#444"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ width: 110 }}>
                  <Text style={s.inputLabel}>Due day</Text>
                  <TextInput
                    style={s.input}
                    value={formDueDay}
                    onChangeText={setFormDueDay}
                    placeholder="15"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>

              <Text style={s.inputLabel}>How often</Text>
              <View style={s.freqRow}>
                {(['monthly', 'quarterly', 'yearly', 'custom'] as FreqMode[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.freqChip, formMode === m && s.freqChipOn]}
                    onPress={() => {
                      feedback.select();
                      setFormMode(m);
                    }}
                  >
                    <Text style={[s.freqChipText, formMode === m && s.freqChipTextOn]}>
                      {m === 'custom' ? 'Custom' : freqLabel(MODE_INTERVAL[m])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formMode === 'custom' && (
                <View style={s.customRow}>
                  <Text style={s.customLabel}>Every</Text>
                  <TextInput
                    style={[s.input, { marginBottom: 0, width: 64, textAlign: 'center' }]}
                    value={formCustomN}
                    onChangeText={setFormCustomN}
                    placeholder="2"
                    placeholderTextColor="#444"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={s.customLabel}>months</Text>
                </View>
              )}

              {formInterval !== 1 && (
                <>
                  <Text style={[s.inputLabel, { marginTop: 18 }]}>
                    {formMode === 'quarterly' ? 'Anchor month (recurs every 3)' : 'Due month'}
                  </Text>
                  <View style={s.monthGrid}>
                    {MONTHS.map((mo, idx) => {
                      const on = formDueMonth === idx + 1;
                      return (
                        <TouchableOpacity
                          key={mo}
                          style={[s.monthChip, on && s.monthChipOn]}
                          onPress={() => {
                            feedback.select();
                            setFormDueMonth(idx + 1);
                          }}
                        >
                          <Text style={[s.monthChipText, on && s.monthChipTextOn]}>{mo}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ height: 4 }} />
                </>
              )}
              </ScrollView>
              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setCostModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveForm}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {costModal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => removeForm(costModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete cost</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={accountPicker.visible}
        transparent
        animationType="slide"
        onRequestClose={closeAccountPicker}
      >
        {/* Tapping the dimmed backdrop dismisses (standard bottom-sheet
            behavior). The inner Pressable becomes the touch responder so
            taps on the sheet itself don't bubble up and close it. */}
        <Pressable style={s.overlay} onPress={closeAccountPicker}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.sheetHeader}>
              <Text style={[s.sheetTitle, { marginBottom: 0, flex: 1 }]}>
                What did you pay with?
              </Text>
              <TouchableOpacity
                onPress={closeAccountPicker}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={s.sheetClose}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#999" />
              </TouchableOpacity>
            </View>
            {accountPicker.cost && (
              <Text style={s.pickerSub}>
                Paying {fmt(parseAmt(accountPicker.cost.amount), symbol)} for{' '}
                <Text style={{ color: '#FFF', fontWeight: '600' }}>
                  {accountPicker.cost.name}
                </Text>
              </Text>
            )}
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {/* Pinned-top escape hatch: paid by some other means; leave
                  all tracked accounts unchanged. Separator below sets it
                  visually apart from the real-account rows beneath. */}
              <TouchableOpacity
                style={s.pickerRowNoDeduct}
                onPress={payWithoutDeducting}
                accessibilityRole="button"
                accessibilityLabel="Mark paid without deducting from any account"
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.pickerName}>Don&apos;t deduct from any account</Text>
                  <Text style={s.pickerBalance}>
                    Paid by other means — accounts unchanged
                  </Text>
                </View>
                <Ionicons name="checkmark-circle-outline" size={18} color="#666" />
              </TouchableOpacity>
              {accountPicker.cost && scopedAccounts.map((account, i) => {
                // Each account renders in its OWN currency. The cost (in the
                // page's display currency) is converted into that currency
                // before the balance preview and the actual deduction.
                const selectedCost = accountPicker.cost;
                if (!selectedCost) return null;
                const costCcy = selectedCost.currency ?? currency;
                const accountCcy = account.currency ?? currency;
                const accountSymbol =
                  CURRENCIES.find((c) => c.code === accountCcy)?.symbol ?? accountCcy + ' ';
                const costInAccountCcy = convert(parseAmt(selectedCost.amount), costCcy, accountCcy, rates.rates);
                const newBalance = parseAmt(account.amount) - costInAccountCcy;
                const goesNegative = newBalance < 0;
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[s.pickerRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#222' }]}
                    onPress={() => payFromAccount(account)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickerName}>{account.name}</Text>
                      <Text style={[s.pickerBalance, goesNegative && s.pickerNegative]}>
                        {fmt(parseAmt(account.amount), accountSymbol)} → {fmt(newBalance, accountSymbol)}
                      </Text>
                      {accountCcy !== costCcy && (
                        <Text style={s.pickerConverted}>
                          Deducts {fmt(costInAccountCcy, accountSymbol)} ({accountCcy})
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#444" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  embeddedContainer: { flex: undefined },
  scroll: { paddingHorizontal: 16, paddingTop: 6 },
  embeddedScroll: { paddingHorizontal: 0, paddingTop: 0 },
  embeddedSectionTitle: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10, marginTop: 6 },

  heroCard: { ...surface, borderRadius: 20, padding: 22, marginBottom: 14 },
  heroLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  heroLiquidityAmount: { fontSize: 38, fontWeight: '800', color: '#00C896', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  progressLabel: { fontSize: 10, fontWeight: '700', color: '#666', letterSpacing: 1.2 },
  progressValue: { fontSize: 12, color: '#999', fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressValueComplete: { color: '#00C896' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E1E1E',
    marginTop: 9,
    overflow: 'hidden',
  },
  barClip: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFooter: { minHeight: 18, flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  progressStatus: { fontSize: 12, color: '#777', fontWeight: '500' },

  card: { ...surface, borderRadius: 20, overflow: 'hidden' },
  cardHeader: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  cardSub: { fontSize: 12, color: '#666', marginTop: 4, fontWeight: '500' },

  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  freqChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    alignItems: 'center',
  },
  freqChipOn: { backgroundColor: '#10261F', borderColor: '#1F3A30' },
  freqChipText: { fontSize: 12, color: '#888', fontWeight: '600' },
  freqChipTextOn: { color: '#00C896' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  customLabel: { fontSize: 14, color: '#888', fontWeight: '500' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: {
    width: '22%',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    alignItems: 'center',
  },
  monthChipOn: { backgroundColor: '#10261F', borderColor: '#1F3A30' },
  monthChipText: { fontSize: 12, color: '#888', fontWeight: '600' },
  monthChipTextOn: { color: '#00C896' },
  addCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  addCostText: { fontSize: 14, color: '#00C896', fontWeight: '500' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  statusDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
  },
  statusPaid: { borderColor: '#1F3A30' },
  statusDue: { borderColor: '#3A2A0F' },
  rowName: { fontSize: 15, fontWeight: '500', color: '#EEE' },
  rowNamePaid: { color: '#777' },
  rowDue: { fontSize: 12, color: '#666', marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },
  rowAmountPaid: { color: '#777' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 8, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: '#777', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#555', textAlign: 'center' },

  // Add / edit cost sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', letterSpacing: -0.3, marginBottom: 16 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
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
  currencyGrid: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  currencyPill: { flex: 1, minWidth: 0, paddingHorizontal: 3, paddingVertical: 9, borderRadius: 10, backgroundColor: '#222', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  currencyPillActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  currencyPillText: { color: '#999', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  currencyPillTextActive: { color: '#07120F' },
  row2col: { flexDirection: 'row', gap: 12 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
    marginTop: 8,
  },
  btnCancelText: { fontSize: 15, color: '#666', fontWeight: '500' },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00C896',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteLinkText: { fontSize: 13, color: '#FF6B6B', fontWeight: '500' },

  pickerSub: { fontSize: 13, color: '#666', marginBottom: 18, lineHeight: 18, fontWeight: '500' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  // Pinned-top "Don't deduct" row in the cost-payment picker. Same paddings
  // as pickerRow so the text aligns; the bottom border sets it apart from
  // the real-account rows that follow.
  pickerRowNoDeduct: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  pickerName: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  pickerBalance: { fontSize: 12, color: '#555', marginTop: 3, fontWeight: '500', fontVariant: ['tabular-nums'] },
  pickerConverted: { fontSize: 11, color: '#777', marginTop: 3, fontWeight: '500', fontVariant: ['tabular-nums'] },
  pickerNegative: { color: '#FFA94D' },
});
