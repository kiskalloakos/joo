import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Transaction } from '../lib/transactions';
import { Account } from '../lib/dashboard';
import { CURRENCIES } from '../lib/currencies';
import { feedback } from '../lib/feedback';
import { glowGreen, glowAmber } from '../lib/glows';

interface Props {
  visible: boolean;
  monthLabel: string; // e.g. "May 2026"
  monthYear: number;
  monthIndex: number; // 0-11
  transactions: Transaction[]; // all tx; we filter here so caller doesn't repeat work
  accounts: Account[]; // for resolving tx → account name / currency
  symbol: string;
  currency: string; // dashboard display-currency code — fallback for legacy accounts
  onClose: () => void;
  onEditTransaction: (updated: Transaction) => void;
  onDeleteTransaction: (tx: Transaction) => () => void; // returns an Undo closure
}

// Outflow palette — warm amber-leaning so "money out" reads coherently.
// Distinct enough to tell slices apart.
const SLICE_COLORS = [
  '#FFA94D', // amber (primary outflow color)
  '#FFD166', // gold
  '#EF8354', // orange-red
  '#C97B63', // copper
  '#F08080', // soft red
  '#D4A373', // tan
  '#8E7CC3', // lavender (last visible, before Other)
];
const OTHER_COLOR = '#3A3A3A';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

function txDateLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${time}`;
}

interface Slice {
  label: string;
  amount: number;
  color: string;
}

// SVG arc generator for the donut. Returns an SVG path "d" string.
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= Math.PI ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export default function StatementSheet({
  visible,
  monthLabel,
  monthYear,
  monthIndex,
  transactions,
  accounts,
  symbol,
  currency,
  onClose,
  onEditTransaction,
  onDeleteTransaction,
}: Props) {
  const { slices, totalIn, totalOut, biggest, dayTotals, monthTx } = useMemo(() => {
    const monthTx = transactions.filter((t) => {
      const d = new Date(t.createdAt);
      return d.getFullYear() === monthYear && d.getMonth() === monthIndex;
    });

    const totalIn = monthTx.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0);
    const totalOut = monthTx.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0);

    // Group outflow by note (fallback label by kind)
    const groups = new Map<string, number>();
    let biggest: { label: string; amount: number } | null = null;
    for (const t of monthTx) {
      if (t.direction !== 'out') continue;
      const label = t.note ?? (t.kind === 'cost' ? 'Cost' : 'Other');
      groups.set(label, (groups.get(label) ?? 0) + t.amount);
      if (!biggest || t.amount > biggest.amount) {
        biggest = { label, amount: t.amount };
      }
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, SLICE_COLORS.length);
    const rest = sorted.slice(SLICE_COLORS.length);
    const slices: Slice[] = top.map(([label, amount], i) => ({
      label,
      amount,
      color: SLICE_COLORS[i],
    }));
    const otherSum = rest.reduce((s, [, a]) => s + a, 0);
    if (otherSum > 0) {
      slices.push({ label: 'Other', amount: otherSum, color: OTHER_COLOR });
    }

    // Day totals (outflow only) — for the day-strip
    const dayCount = daysInMonth(monthYear, monthIndex);
    const dayTotals = new Array<number>(dayCount).fill(0);
    for (const t of monthTx) {
      if (t.direction !== 'out') continue;
      const day = new Date(t.createdAt).getDate() - 1;
      if (day >= 0 && day < dayCount) dayTotals[day] += t.amount;
    }

    return { slices, totalIn, totalOut, biggest, dayTotals, monthTx };
  }, [transactions, monthYear, monthIndex]);

  const net = totalIn - totalOut;
  const totalForDonut = slices.reduce((s, sl) => s + sl.amount, 0);
  const maxDay = dayTotals.reduce((m, v) => Math.max(m, v), 0);

  // Donut geometry
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 88;
  const stroke = 26;

  // Compute slice arcs
  const arcs = useMemo(() => {
    if (totalForDonut === 0) return [];
    let start = -Math.PI / 2; // start at top
    const out: { d: string; color: string; label: string; amount: number; pct: number }[] = [];
    for (const slice of slices) {
      const pct = slice.amount / totalForDonut;
      const sweep = pct * Math.PI * 2;
      const end = start + sweep;
      // Tiny gap between slices for definition
      const gap = sweep > 0.05 ? 0.015 : 0;
      out.push({
        d: arcPath(cx, cy, radius, start + gap, end - gap),
        color: slice.color,
        label: slice.label,
        amount: slice.amount,
        pct,
      });
      start = end;
    }
    return out;
  }, [slices, totalForDonut, cx, cy, radius]);

  // ── Transaction editor ──────────────────────────────────────────────────
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formDirection, setFormDirection] = useState<'in' | 'out'>('out');
  // Inline undo for a just-deleted row. A global toast renders BEHIND this
  // modal on iOS, so the affordance has to live inside the sheet itself.
  const [undo, setUndo] = useState<{ label: string; run: () => void } | null>(null);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const editingAccount = editing
    ? accounts.find((a) => a.id === editing.accountId) ?? null
    : null;
  const editingCcy = editingAccount?.currency ?? currency;
  const editingSymbol =
    CURRENCIES.find((c) => c.code === editingCcy)?.symbol ?? editingCcy + ' ';
  const formValid = parseFloat(formAmount) > 0;

  const openEditor = (tx: Transaction) => {
    feedback.tap();
    setFormAmount(String(tx.amount));
    setFormNote(tx.note ?? '');
    setFormDirection(tx.direction);
    setEditing(tx);
  };
  const closeEditor = () => setEditing(null);

  const saveEditing = () => {
    if (!editing || !formValid) return;
    onEditTransaction({
      ...editing,
      amount: parseFloat(formAmount),
      direction: formDirection,
      note: formNote.trim() || null,
    });
    setEditing(null);
  };

  const removeEditing = () => {
    if (!editing) return;
    const tx = editing;
    setEditing(null);
    const run = onDeleteTransaction(tx);
    setUndo({ label: tx.note ?? 'transaction', run });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.eyebrow}>STATEMENT</Text>
              <Text style={s.monthTitle}>{monthLabel}</Text>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {totalIn === 0 && totalOut === 0 ? (
              <View style={s.empty}>
                <Ionicons name="bar-chart-outline" size={28} color="#333" />
                <Text style={s.emptyText}>No activity this month</Text>
              </View>
            ) : (
              <>
                {/* Donut + center total */}
                <View style={s.donutWrap}>
                  <Svg width={size} height={size}>
                    {/* Background ring (when there are some slices) */}
                    {totalForDonut > 0 && (
                      <Circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        stroke="#1A1A1A"
                        strokeWidth={stroke}
                        fill="none"
                      />
                    )}
                    {/* No-outflow fallback: dim full ring */}
                    {totalForDonut === 0 && (
                      <Circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        stroke="#1F1F1F"
                        strokeWidth={stroke}
                        fill="none"
                      />
                    )}
                    {arcs.length === 1 ? (
                      // Full-coverage single slice — arc would collapse, draw a Circle instead.
                      <Circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        stroke={arcs[0].color}
                        strokeWidth={stroke}
                        fill="none"
                      />
                    ) : (
                      arcs.map((a, i) => (
                        <Path
                          key={i}
                          d={a.d}
                          stroke={a.color}
                          strokeWidth={stroke}
                          fill="none"
                          strokeLinecap="butt"
                        />
                      ))
                    )}
                  </Svg>
                  <View style={s.donutCenter} pointerEvents="none">
                    <Text style={s.donutCenterLabel}>SPENT</Text>
                    <Text style={[s.donutCenterValue, glowAmber]}>{fmt(totalOut, symbol)}</Text>
                    {biggest && (
                      <Text style={s.donutCenterMeta} numberOfLines={1}>
                        biggest: {biggest.label}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Summary strip */}
                <View style={s.summaryRow}>
                  <View style={s.summaryCard}>
                    <Text style={s.summaryLabel}>IN</Text>
                    <Text style={[s.summaryValue, { color: '#00C896' }, glowGreen]}>
                      +{fmt(totalIn, symbol)}
                    </Text>
                  </View>
                  <View style={s.summaryCard}>
                    <Text style={s.summaryLabel}>OUT</Text>
                    <Text style={[s.summaryValue, { color: '#FFA94D' }, glowAmber]}>
                      −{fmt(totalOut, symbol)}
                    </Text>
                  </View>
                  <View style={s.summaryCard}>
                    <Text style={s.summaryLabel}>NET</Text>
                    <Text
                      style={[
                        s.summaryValue,
                        { color: net >= 0 ? '#00C896' : '#FFA94D' },
                        net >= 0 ? glowGreen : glowAmber,
                      ]}
                    >
                      {net >= 0 ? '+' : '−'}
                      {fmt(Math.abs(net), symbol)}
                    </Text>
                  </View>
                </View>

                {/* Day strip — height = day's spending */}
                {totalOut > 0 && (
                  <View style={s.dayStripCard}>
                    <View style={s.dayStripHeader}>
                      <Text style={s.sectionTitle}>Daily outflow</Text>
                      <Text style={s.dayStripMeta}>
                        peak {maxDay > 0 ? fmt(maxDay, symbol) : '—'}
                      </Text>
                    </View>
                    <DayStrip totals={dayTotals} max={maxDay} />
                    <View style={s.dayStripFooter}>
                      <Text style={s.dayLabel}>1</Text>
                      <Text style={s.dayLabel}>{Math.ceil(dayTotals.length / 2)}</Text>
                      <Text style={s.dayLabel}>{dayTotals.length}</Text>
                    </View>
                  </View>
                )}

                {/* Top expenses list (same data as donut) */}
                {slices.length > 0 && (
                  <View style={s.listCard}>
                    <Text style={s.sectionTitle}>By category</Text>
                    {slices.map((sl) => {
                      const pct = totalForDonut > 0 ? (sl.amount / totalForDonut) * 100 : 0;
                      return (
                        <View key={sl.label} style={s.listRow}>
                          <View style={[s.swatch, { backgroundColor: sl.color }]} />
                          <Text style={s.listLabel} numberOfLines={1}>
                            {sl.label}
                          </Text>
                          <Text style={s.listPct}>{pct.toFixed(0)}%</Text>
                          <Text style={s.listAmount}>{fmt(sl.amount, symbol)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Transactions for this month */}
                {monthTx.length > 0 && (
                  <View style={[s.listCard, { marginTop: 12 }]}>
                    <Text style={s.sectionTitle}>Transactions</Text>
                    {monthTx.map((tx) => {
                      const account = accounts.find((a) => a.id === tx.accountId);
                      const isIn = tx.direction === 'in';
                      const kindLabel =
                        tx.kind === 'cost'
                          ? 'paid'
                          : tx.kind === 'refund'
                            ? 'refunded'
                            : isIn
                              ? 'added'
                              : 'removed';
                      return (
                        <TouchableOpacity
                          key={tx.id}
                          style={s.txRow}
                          onPress={() => openEditor(tx)}
                          activeOpacity={0.6}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={s.txTitle} numberOfLines={1}>
                              {tx.note ?? `${kindLabel.charAt(0).toUpperCase()}${kindLabel.slice(1)}`}
                            </Text>
                            <Text style={s.txMeta}>
                              {txDateLabel(tx.createdAt)}
                              {account ? ` · ${account.name}` : ''}
                              {tx.note ? ` · ${kindLabel}` : ''}
                            </Text>
                          </View>
                          <Text
                            style={[
                              s.txAmount,
                              isIn ? glowGreen : glowAmber,
                              { color: isIn ? '#00C896' : '#FFA94D' },
                            ]}
                          >
                            {isIn ? '+' : '−'}
                            {fmt(tx.amount, symbol)}
                          </Text>
                          <Ionicons name="chevron-forward" size={14} color="#444" />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={{ height: 24 }} />
              </>
            )}
          </ScrollView>

          {undo && (
            <View style={s.undoBar}>
              <Text style={s.undoText} numberOfLines={1}>
                Deleted {undo.label}
              </Text>
              <TouchableOpacity
                style={s.undoBtn}
                onPress={() => {
                  undo.run();
                  setUndo(null);
                }}
              >
                <Text style={s.undoBtnText}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUndo(null)} style={s.undoClose}>
                <Ionicons name="close" size={14} color="#666" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Transaction editor. Nested INSIDE the statement modal on purpose:
          a sibling modal silently fails to present on iOS while the
          statement modal already owns the presentation slot. Manual rows
          get a full form; bill payments get a remove-only sheet. */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={closeEditor}
      >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={s.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeEditor}
          />
          <View style={s.editorSheet}>
            {editing && editing.kind === 'cost' ? (
              <>
                <Text style={s.editorTitle}>Bill payment</Text>
                <Text style={s.editorBillName} numberOfLines={1}>
                  {editing.note ?? 'Recurring bill'}
                </Text>
                <Text style={s.editorBillMeta}>
                  {fmt(editing.amount, editingSymbol)}
                  {editingAccount ? ` · ${editingAccount.name}` : ''} ·{' '}
                  {txDateLabel(editing.createdAt)}
                </Text>
                <Text style={s.editorHint}>
                  This is a recurring bill payment. Removing it marks the bill
                  unpaid and refunds{' '}
                  {editingAccount ? editingAccount.name : 'the account'}. To
                  change the bill itself, edit it in Recurrings.
                </Text>
                <TouchableOpacity style={s.btnRemove} onPress={removeEditing}>
                  <Ionicons name="arrow-undo-outline" size={16} color="#FFB37A" />
                  <Text style={s.btnRemoveText}>Remove payment</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnCancelFull} onPress={closeEditor}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.editorTitle}>Edit transaction</Text>
                {editing && (
                  <Text style={s.editorBillMeta}>
                    {editingAccount ? editingAccount.name : 'Account removed'} ·{' '}
                    {txDateLabel(editing.createdAt)}
                  </Text>
                )}

                <Text style={s.inputLabel}>Direction</Text>
                <View style={s.dirRow}>
                  {(['in', 'out'] as const).map((d) => {
                    const on = formDirection === d;
                    const tint = d === 'in' ? '#00C896' : '#FFA94D';
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[s.dirChip, on && (d === 'in' ? s.dirChipIn : s.dirChipOut)]}
                        onPress={() => {
                          feedback.select();
                          setFormDirection(d);
                        }}
                      >
                        <Ionicons
                          name={d === 'in' ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={on ? tint : '#777'}
                        />
                        <Text style={[s.dirChipText, on && { color: tint }]}>
                          {d === 'in' ? 'Money in' : 'Money out'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={s.inputLabel}>Amount ({editingCcy})</Text>
                <TextInput
                  style={s.input}
                  value={formAmount}
                  onChangeText={setFormAmount}
                  placeholder="0.00"
                  placeholderTextColor="#444"
                  keyboardType="decimal-pad"
                />

                <Text style={s.inputLabel}>Note</Text>
                <TextInput
                  style={s.input}
                  value={formNote}
                  onChangeText={setFormNote}
                  placeholder="Optional"
                  placeholderTextColor="#444"
                  maxLength={200}
                />

                <View style={s.editorActions}>
                  <TouchableOpacity style={s.btnCancel} onPress={closeEditor}>
                    <Text style={s.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.btnSave, !formValid && s.btnSaveDisabled]}
                    onPress={saveEditing}
                    disabled={!formValid}
                  >
                    <Text style={s.btnSaveText}>Save</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={s.deleteLink} onPress={removeEditing}>
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete transaction</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}

function DayStrip({ totals, max }: { totals: number[]; max: number }) {
  const width = 320;
  const height = 56;
  const n = totals.length;
  const gap = 2;
  const barWidth = (width - gap * (n - 1)) / n;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {totals.map((v, i) => {
        const h = max > 0 ? (v / max) * (height - 8) : 0;
        const x = i * (barWidth + gap);
        const y = height - h;
        const color = v === 0 ? '#1A1A1A' : '#FFA94D';
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(h, 2)}
            rx={1.5}
            fill={color}
            opacity={v === 0 ? 1 : 0.85}
          />
        );
      })}
    </Svg>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eyebrow: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.5 },
  monthTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.4, marginTop: 4 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, color: '#555', fontWeight: '600' },

  donutWrap: { alignItems: 'center', marginVertical: 12, position: 'relative' },
  donutCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  donutCenterLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1.5 },
  donutCenterValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFA94D',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
  },
  donutCenterMeta: { fontSize: 10, color: '#555', fontWeight: '500', maxWidth: 140, textAlign: 'center' },

  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#151515',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1, marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },

  dayStripCard: {
    backgroundColor: '#151515',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 12,
  },
  dayStripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dayStripFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  dayLabel: { fontSize: 9, color: '#444', fontWeight: '600', letterSpacing: 0.5 },
  dayStripMeta: { fontSize: 10, color: '#555', fontWeight: '500' },

  listCard: {
    backgroundColor: '#151515',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  sectionTitle: { fontSize: 12, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  listLabel: { flex: 1, fontSize: 13, color: '#DDD', fontWeight: '500' },
  listPct: { fontSize: 11, color: '#666', fontWeight: '500', fontVariant: ['tabular-nums'], width: 36, textAlign: 'right' },
  listAmount: { fontSize: 13, color: '#FFF', fontWeight: '700', fontVariant: ['tabular-nums'], width: 90, textAlign: 'right' },

  // Transactions section (mirrors the money log rows)
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  txTitle: { fontSize: 13, color: '#EEE', fontWeight: '500' },
  txMeta: { fontSize: 11, color: '#555', marginTop: 2, fontWeight: '500' },
  txAmount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Transaction editor sheet
  editorSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
  },
  editorTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', letterSpacing: -0.3 },
  editorBillName: { fontSize: 16, fontWeight: '600', color: '#EEE', marginTop: 10 },
  editorBillMeta: { fontSize: 12, color: '#666', marginTop: 6, fontWeight: '500' },
  editorHint: { fontSize: 12, color: '#777', lineHeight: 18, marginTop: 14, fontWeight: '500' },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#222',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    fontWeight: '500',
  },
  dirRow: { flexDirection: 'row', gap: 8 },
  dirChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  dirChipIn: { backgroundColor: '#10261F', borderColor: '#1F3A30' },
  dirChipOut: { backgroundColor: '#241A10', borderColor: '#3A2A18' },
  dirChipText: { fontSize: 13, color: '#777', fontWeight: '600' },
  editorActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  btnCancelFull: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
    marginTop: 10,
  },
  btnCancelText: { fontSize: 15, color: '#888', fontWeight: '600' },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00C896',
    alignItems: 'center',
  },
  btnSaveDisabled: { opacity: 0.4 },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },
  btnRemove: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#241A10',
    borderWidth: 1,
    borderColor: '#3A2A18',
    marginTop: 20,
  },
  btnRemoveText: { fontSize: 15, color: '#FFB37A', fontWeight: '700' },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 4,
  },
  deleteLinkText: { fontSize: 13, color: '#FF6B6B', fontWeight: '500' },

  // Inline undo bar — lives inside the statement sheet (a global toast would
  // render behind this modal on iOS).
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#222',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 10,
    marginTop: 12,
  },
  undoText: { flex: 1, fontSize: 13, color: '#EEE', fontWeight: '500' },
  undoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1F3A30',
  },
  undoBtnText: { fontSize: 12, color: '#00C896', fontWeight: '700' },
  undoClose: { padding: 6 },
});

// Re-export month names so caller can format if needed.
export { MONTH_NAMES };
