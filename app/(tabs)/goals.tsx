import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CURRENCIES } from '../../lib/currencies';
import { getCurrency, peekCurrencySettings, refreshCurrency } from '../../lib/currency';
import { surface } from '../../lib/surface';
import { newId } from '../../lib/dashboard';
import { Goal, getGoals, peekGoals, refreshGoals, saveGoal, deleteGoal } from '../../lib/goals';
import { goalMonthlyPace, parseAmount } from '../../lib/finance';
import { showToast } from '../../lib/toast';
import { feedback } from '../../lib/feedback';
import { glowGreen } from '../../lib/glows';
import EmojiPicker, { GOAL_EMOJIS } from '../../components/EmojiPicker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseAmt(s: string): number {
  return parseAmount(s);
}

// 'YYYY-MM-DD' <-> Date, both in LOCAL time so the picked day can't drift
// across a timezone boundary (matches monthsUntil's local parse).
function parseYMD(iso?: string | null): Date {
  if (iso) {
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}
function toYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Whole months from now to a 'YYYY-MM-DD' deadline. Negative = past.
function monthsUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

export default function Goals() {
  const insets = useSafeAreaInsets();
  const [goals, setGoals] = useState<Goal[]>(peekGoals);
  const [currency, setCurrency] = useState(() => peekCurrencySettings().global);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getGoals().then((g) => !cancelled && setGoals(g));
      refreshGoals().then((g) => !cancelled && setGoals(g));
      getCurrency().then((c) => !cancelled && setCurrency(c));
      refreshCurrency().then((c) => !cancelled && setCurrency(c));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';

  const [modal, setModal] = useState<{ visible: boolean; editing: Goal | null }>({
    visible: false,
    editing: null,
  });
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formCurrent, setFormCurrent] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (e.type === 'dismissed' || !d) return;
    setFormDeadline(toYMD(d));
  };

  const openAdd = () => {
    setFormName('');
    setFormEmoji('');
    setFormTarget('');
    setFormCurrent('');
    setFormDeadline('');
    setShowPicker(false);
    feedback.tap();
    setModal({ visible: true, editing: null });
  };

  const openEdit = (g: Goal) => {
    setFormName(g.name);
    setFormEmoji(g.emoji ?? '');
    setFormTarget(g.targetAmount);
    setFormCurrent(g.currentAmount);
    setFormDeadline(g.deadline ?? '');
    setShowPicker(false);
    feedback.tap();
    setModal({ visible: true, editing: g });
  };

  const saveForm = async () => {
    if (!formName.trim()) return;
    const editing = modal.editing;
    const deadline = formDeadline.trim() || null;
    const goal: Goal = editing
      ? {
          ...editing,
          name: formName.trim(),
          emoji: formEmoji.trim() || null,
          targetAmount: formTarget,
          currentAmount: formCurrent,
          deadline,
        }
      : {
          id: newId(),
          name: formName.trim(),
          emoji: formEmoji.trim() || null,
          targetAmount: formTarget,
          currentAmount: formCurrent,
          deadline,
          position: goals.length,
        };
    setGoals(editing ? goals.map((g) => (g.id === editing.id ? goal : g)) : [...goals, goal]);
    setModal({ visible: false, editing: null });
    feedback.success();
    await saveGoal(goal);
  };

  const removeForm = async (g: Goal) => {
    setModal({ visible: false, editing: null });
    setGoals((prev) => prev.filter((x) => x.id !== g.id));
    feedback.destroy();
    await deleteGoal(g.id);
    showToast(`Deleted ${g.name}`, {
      label: 'Undo',
      onPress: async () => {
        setGoals((prev) => [...prev, g]);
        await saveGoal(g);
      },
    });
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <Text style={s.title}>Your goals</Text>
          <TouchableOpacity style={s.addBtn} onPress={openAdd}>
            <Ionicons name="add" size={20} color="#00C896" style={glowGreen} />
          </TouchableOpacity>
        </View>

        {goals.length === 0 ? (
          <TouchableOpacity style={s.empty} onPress={openAdd} activeOpacity={0.8}>
            <Ionicons name="flag-outline" size={28} color="#333" />
            <Text style={s.emptyText}>Set your first goal</Text>
            <Text style={s.emptyHint}>
              Saving for something, or paying something off — track the progress.
            </Text>
          </TouchableOpacity>
        ) : (
          goals.map((g) => {
            const target = parseAmt(g.targetAmount);
            const current = parseAmt(g.currentAmount);
            const pct = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
            const done = target > 0 && current >= target;
            const ml = monthsUntil(g.deadline);
            let hint: string | null = null;
            if (g.deadline) {
              if (done) hint = 'Reached 🎉';
              else if (ml === null) hint = null;
              else if (ml < 0) hint = `Past due (${g.deadline})`;
              else
                hint = `~${fmt(goalMonthlyPace(target, current, ml), symbol)}/mo to reach by ${g.deadline}`;
            } else if (done) {
              hint = 'Reached 🎉';
            }
            return (
              <Pressable key={g.id} style={s.card} onPress={() => openEdit(g)}>
                <View style={s.cardTop}>
                  <View style={s.cardLeft}>
                    <Text style={s.emoji}>{g.emoji || '🎯'}</Text>
                    <Text style={s.name}>{g.name}</Text>
                  </View>
                  <Text style={s.pctText}>{Math.round(pct * 100)}%</Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      { width: `${pct * 100}%` },
                      done && s.barFillDone,
                    ]}
                  />
                </View>
                <View style={s.cardBottom}>
                  <Text style={s.amounts}>
                    {fmt(current, symbol)}{' '}
                    <Text style={s.amountsMuted}>of {fmt(target, symbol)}</Text>
                  </Text>
                  {hint && <Text style={s.hint}>{hint}</Text>}
                </View>
              </Pressable>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={modal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>{modal.editing ? 'Edit Goal' : 'New Goal'}</Text>
              <EmojiPicker
                value={formEmoji}
                onChange={setFormEmoji}
                options={GOAL_EMOJIS}
              />
              <Text style={s.inputLabel}>Name</Text>
              <TextInput
                style={s.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Emergency fund"
                placeholderTextColor="#444"
                autoFocus
              />
              <View style={s.row2col}>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Target ({currency})</Text>
                  <TextInput
                    style={s.input}
                    value={formTarget}
                    onChangeText={setFormTarget}
                    placeholder="10000"
                    placeholderTextColor="#444"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Saved so far</Text>
                  <TextInput
                    style={s.input}
                    value={formCurrent}
                    onChangeText={setFormCurrent}
                    placeholder="0"
                    placeholderTextColor="#444"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Text style={s.inputLabel}>Deadline — optional</Text>
              {Platform.OS === 'web' ? (
                // @react-native-community/datetimepicker has no usable web
                // render (degrades to a thin line). The browser's native
                // date input speaks our exact 'YYYY-MM-DD' storage format,
                // so no conversion is needed.
                React.createElement('input', {
                  type: 'date',
                  value: formDeadline,
                  onChange: (e: any) => setFormDeadline(e.target.value),
                  style: {
                    backgroundColor: '#222',
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 16,
                    color: '#FFF',
                    marginBottom: 20,
                    border: '1px solid #2C2C2C',
                    fontWeight: 500,
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                    outline: 'none',
                  },
                })
              ) : (
                <>
                  <Pressable
                    style={[s.input, s.dateField]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowPicker((v) => !v);
                    }}
                  >
                    <Text style={formDeadline ? s.dateText : s.datePlaceholder}>
                      {formDeadline || 'No deadline'}
                    </Text>
                    {formDeadline ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          setFormDeadline('');
                          setShowPicker(false);
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color="#666" />
                      </Pressable>
                    ) : (
                      <Ionicons name="calendar-outline" size={16} color="#666" />
                    )}
                  </Pressable>
                  {showPicker && (
                    <View style={s.pickerWrap}>
                      <DateTimePicker
                        value={parseYMD(formDeadline)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        themeVariant="dark"
                        onChange={onPickDate}
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity
                          style={s.pickerDone}
                          onPress={() => setShowPicker(false)}
                        >
                          <Text style={s.pickerDoneText}>Done</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </>
              )}
              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveForm}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {modal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => removeForm(modal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete goal</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  scroll: { paddingHorizontal: 16, paddingTop: 6 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  title: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#1F3A30',
  },

  card: { ...surface, borderRadius: 18, padding: 18, marginBottom: 12 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 20 },
  name: { fontSize: 15, fontWeight: '500', color: '#EEE' },
  pctText: { fontSize: 13, fontWeight: '700', color: '#00C896', fontVariant: ['tabular-nums'] },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1E1E1E',
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#00C896' },
  barFillDone: { backgroundColor: '#00C896' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  amounts: { fontSize: 14, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },
  amountsMuted: { color: '#666', fontWeight: '500' },
  hint: { fontSize: 11, color: '#777', fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: '#777', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#555', textAlign: 'center' },

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
    maxHeight: '90%',
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
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  dateText: { fontSize: 16, color: '#FFF', fontWeight: '500' },
  datePlaceholder: { fontSize: 16, color: '#444', fontWeight: '500' },
  pickerWrap: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    marginTop: -8,
    marginBottom: 20,
    paddingBottom: 6,
  },
  pickerDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  pickerDoneText: { fontSize: 15, color: '#00C896', fontWeight: '700' },
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
});
