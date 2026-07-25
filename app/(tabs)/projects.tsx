import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getCurrencyForPage, peekCurrencyForPage, refreshCurrencyForPage } from '../../lib/currency';
import { CURRENCIES } from '../../lib/currencies';
import { surface } from '../../lib/surface';
import { newId } from '../../lib/dashboard';
import { feedback } from '../../lib/feedback';
import { glowGreen } from '../../lib/glows';
import { showToast } from '../../lib/toast';
import { parseAmount } from '../../lib/finance';
import { peekRates, subscribeRates, convert, type Rates } from '../../lib/exchangeRates';
import {
  Project,
  ProjectCost,
  ProjectsData,
  peekProjects,
  getProjects,
  refreshProjects,
  saveProject,
  deleteProject,
  saveProjectCost,
  deleteProjectCost,
} from '../../lib/projects';
import { registerProjectsHeaderAction } from '../../lib/projectsHeaderActions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function symbolFor(code: string): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code + ' ';
}

// 'YYYY-MM-DD' <-> Date in LOCAL time so the picked day can't drift across a
// timezone boundary for project scheduling.
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
function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function Projects() {
  const [data, setData] = useState<ProjectsData>(peekProjects);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('projects'));
  const [rates, setRates] = useState<Rates>(() => peekRates());
  // Which project card is expanded (its costs shown). One at a time.
  const [expanded, setExpanded] = useState<string | null>(null);
  // Whether the "Previous projects" (finished) section is open.
  const [prevExpanded, setPrevExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getProjects().then((d) => !cancelled && setData(d));
      refreshProjects().then((d) => !cancelled && setData(d));
      getCurrencyForPage('projects').then((c) => !cancelled && setCurrency(c));
      refreshCurrencyForPage('projects').then((c) => !cancelled && setCurrency(c));
      const unsub = subscribeRates((r) => !cancelled && setRates(r));
      return () => {
        cancelled = true;
        unsub();
      };
    }, []),
  );

  const symbol = symbolFor(currency);

  const costsFor = (projectId: string) =>
    data.costs.filter((c) => c.projectId === projectId);

  // Project total: every line item converted from its own currency into the
  // tab's display currency, then summed.
  const projectTotal = (projectId: string) =>
    costsFor(projectId).reduce(
      (sum, c) =>
        sum + convert(parseAmount(c.amount), c.currency || currency, currency, rates.rates),
      0,
    );

  // ── Project add / edit ────────────────────────────────────────────────────
  const [projectModal, setProjectModal] = useState<{ visible: boolean; editing: Project | null }>({
    visible: false,
    editing: null,
  });
  const [projectName, setProjectName] = useState('');

  const openAddProject = useCallback(() => {
    setProjectName('');
    feedback.tap();
    setProjectModal({ visible: true, editing: null });
  }, []);

  useFocusEffect(useCallback(() => registerProjectsHeaderAction(openAddProject), [openAddProject]));
  const openEditProject = (p: Project) => {
    setProjectName(p.name);
    feedback.tap();
    setProjectModal({ visible: true, editing: p });
  };
  const closeProjectModal = () => setProjectModal({ visible: false, editing: null });

  const saveProjectForm = async () => {
    if (!projectName.trim()) return;
    const editing = projectModal.editing;
    const project: Project = editing
      ? { ...editing, name: projectName.trim() }
      : {
          id: newId(),
          name: projectName.trim(),
          position: data.projects.length,
          finished: false,
        };
    setData((d) => ({
      ...d,
      projects: editing
        ? d.projects.map((p) => (p.id === editing.id ? project : p))
        : [...d.projects, project],
    }));
    closeProjectModal();
    feedback.success();
    await saveProject(project);
  };

  const removeProject = async (p: Project) => {
    // Snapshot the project's costs so Undo can fully restore it.
    const costsSnapshot = data.costs.filter((c) => c.projectId === p.id);
    closeProjectModal();
    setData((d) => ({
      projects: d.projects.filter((x) => x.id !== p.id),
      costs: d.costs.filter((c) => c.projectId !== p.id),
    }));
    if (expanded === p.id) setExpanded(null);
    feedback.destroy();
    await deleteProject(p.id);
    showToast(`Deleted ${p.name}`, {
      label: 'Undo',
      onPress: async () => {
        setData((d) => ({
          projects: [...d.projects, p],
          costs: [...d.costs, ...costsSnapshot],
        }));
        // The project row must exist before its costs (FK), so re-save it first.
        await saveProject(p);
        for (const c of costsSnapshot) await saveProjectCost(c);
      },
    });
  };

  // Mark a project finished (tucked under "Previous projects") or reopen it.
  const toggleFinish = async (p: Project) => {
    const updated: Project = { ...p, finished: !p.finished };
    setData((d) => ({
      ...d,
      projects: d.projects.map((x) => (x.id === p.id ? updated : x)),
    }));
    closeProjectModal();
    feedback.success();
    if (updated.finished) {
      setExpanded(null);
      setPrevExpanded(true);
      showToast(`${p.name} moved to previous projects`, { label: 'Got it', onPress: () => {} });
    }
    await saveProject(updated);
  };

  // ── Cost add / edit ───────────────────────────────────────────────────────
  const [costModal, setCostModal] = useState<{
    visible: boolean;
    projectId: string | null;
    editing: ProjectCost | null;
  }>({ visible: false, projectId: null, editing: null });
  const [costLabel, setCostLabel] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(currency);
  const [costDate, setCostDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const openAddCost = (projectId: string) => {
    setCostLabel('');
    setCostAmount('');
    setCostCurrency(currency);
    setCostDate('');
    setShowDatePicker(false);
    feedback.tap();
    setCostModal({ visible: true, projectId, editing: null });
  };
  const openEditCost = (cost: ProjectCost) => {
    setCostLabel(cost.label);
    setCostAmount(cost.amount);
    setCostCurrency(cost.currency || currency);
    setCostDate(cost.date ?? '');
    setShowDatePicker(false);
    feedback.tap();
    setCostModal({ visible: true, projectId: cost.projectId, editing: cost });
  };
  const closeCostModal = () => {
    setCostModal({ visible: false, projectId: null, editing: null });
    setShowDatePicker(false);
  };

  const costValid = costLabel.trim().length > 0 && parseAmount(costAmount) > 0;

  const saveCostForm = async () => {
    const { projectId, editing } = costModal;
    if (!projectId || !costValid) return;
    const cost: ProjectCost = editing
      ? {
          ...editing,
          label: costLabel.trim(),
          amount: costAmount,
          currency: costCurrency,
          date: costDate || null,
        }
      : {
          id: newId(),
          projectId,
          label: costLabel.trim(),
          amount: costAmount,
          currency: costCurrency,
          date: costDate || null,
          position: costsFor(projectId).length,
        };
    setData((d) => ({
      ...d,
      costs: editing
        ? d.costs.map((c) => (c.id === editing.id ? cost : c))
        : [...d.costs, cost],
    }));
    closeCostModal();
    feedback.success();
    await saveProjectCost(cost);
  };

  const removeCost = async (cost: ProjectCost) => {
    closeCostModal();
    setData((d) => ({ ...d, costs: d.costs.filter((c) => c.id !== cost.id) }));
    feedback.destroy();
    await deleteProjectCost(cost.id);
    showToast(`Deleted ${cost.label}`, {
      label: 'Undo',
      onPress: async () => {
        setData((d) => ({ ...d, costs: [...d.costs, cost] }));
        await saveProjectCost(cost);
      },
    });
  };

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (e.type === 'dismissed' || !d) return;
    setCostDate(toYMD(d));
  };

  const activeProjects = data.projects.filter((p) => !p.finished);
  const finishedProjects = data.projects.filter((p) => p.finished);

  // Shared card renderer — used by both the active list and the
  // "Previous projects" section.
  const renderProjectCard = (project: Project) => {
    const isOpen = expanded === project.id;
    const projectCosts = costsFor(project.id);
    const total = projectTotal(project.id);
    return (
      <View key={project.id} style={s.card}>
        <Pressable
          style={s.cardHeader}
          onPress={() => {
            feedback.select();
            setExpanded(isOpen ? null : project.id);
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[s.projectName, project.finished && s.projectNameFinished]}>
              {project.name}
            </Text>
            <Text style={s.projectMeta}>
              {projectCosts.length} {projectCosts.length === 1 ? 'cost' : 'costs'}
            </Text>
          </View>
          <Text style={s.projectTotal}>{fmt(total, symbol)}</Text>
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#555"
            style={{ marginLeft: 8 }}
          />
        </Pressable>

        {isOpen && (
          <View style={s.cardBody}>
            {projectCosts.map((cost) => {
              const cSym = symbolFor(cost.currency || currency);
              const date = fmtDate(cost.date);
              return (
                <TouchableOpacity
                  key={cost.id}
                  style={s.costRow}
                  onPress={() => openEditCost(cost)}
                  activeOpacity={0.6}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.costLabel} numberOfLines={1}>
                      {cost.label}
                    </Text>
                    {date && <Text style={s.costDate}>{date}</Text>}
                  </View>
                  <Text style={s.costAmount}>
                    {fmt(parseAmount(cost.amount), cSym)}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color="#444" />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={s.addCostRow} onPress={() => openAddCost(project.id)}>
              <Ionicons name="add-circle-outline" size={16} color="#00C896" style={glowGreen} />
              <Text style={[s.addCostText, glowGreen]}>Add cost</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.editProjectRow} onPress={() => openEditProject(project)}>
              <Ionicons name="pencil-outline" size={13} color="#666" />
              <Text style={s.editProjectText}>Edit project</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container} collapsable={false}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {data.projects.length === 0 ? (
          <TouchableOpacity style={s.empty} onPress={openAddProject} activeOpacity={0.8}>
            <Ionicons name="construct-outline" size={28} color="#333" />
            <Text style={s.emptyText}>Start your first project</Text>
            <Text style={s.emptyHint}>
              Track what something costs — building a house, a renovation, a trip.
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            {activeProjects.map(renderProjectCard)}
            {finishedProjects.length > 0 && (
              <>
                <Pressable
                  style={s.prevHeader}
                  onPress={() => {
                    feedback.select();
                    setPrevExpanded((v) => !v);
                  }}
                >
                  <Text style={s.prevHeaderText}>Previous projects</Text>
                  <View style={s.prevCount}>
                    <Text style={s.prevCountText}>{finishedProjects.length}</Text>
                  </View>
                  <Ionicons
                    name={prevExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#555"
                  />
                </Pressable>
                {prevExpanded && finishedProjects.map(renderProjectCard)}
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Project add / edit */}
      <Modal visible={projectModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>
                {projectModal.editing ? 'Edit Project' : 'New Project'}
              </Text>
              <Text style={s.inputLabel}>Project name</Text>
              <TextInput
                style={s.input}
                value={projectName}
                onChangeText={setProjectName}
                placeholder="e.g. Building a house"
                placeholderTextColor="#444"
                autoFocus
              />
              <View style={s.sheetActions}>
                <TouchableOpacity style={s.btnCancel} onPress={closeProjectModal}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnSave, !projectName.trim() && s.btnSaveDisabled]}
                  onPress={saveProjectForm}
                  disabled={!projectName.trim()}
                >
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {projectModal.editing && (
                <TouchableOpacity
                  style={s.btnFinish}
                  onPress={() => toggleFinish(projectModal.editing!)}
                >
                  <Ionicons
                    name={projectModal.editing.finished ? 'refresh-outline' : 'checkmark-done-outline'}
                    size={15}
                    color="#888"
                  />
                  <Text style={s.btnFinishText}>
                    {projectModal.editing.finished ? 'Reopen project' : 'Finish project'}
                  </Text>
                </TouchableOpacity>
              )}
              {projectModal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => removeProject(projectModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete project</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cost add / edit */}
      <Modal visible={costModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>{costModal.editing ? 'Edit Cost' : 'Add Cost'}</Text>
              <ScrollView
                style={{ flexShrink: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={s.inputLabel}>What is it</Text>
                <TextInput
                  style={s.input}
                  value={costLabel}
                  onChangeText={setCostLabel}
                  placeholder="e.g. Roofing"
                  placeholderTextColor="#444"
                  autoFocus
                />

                <Text style={s.inputLabel}>Amount ({costCurrency})</Text>
                <TextInput
                  style={s.input}
                  value={costAmount}
                  onChangeText={setCostAmount}
                  placeholder="0.00"
                  placeholderTextColor="#444"
                  keyboardType="decimal-pad"
                />

                <Text style={s.inputLabel}>Currency</Text>
                <View style={s.ccyPickerContent}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.ccyPill, costCurrency === c.code && s.ccyPillActive]}
                      onPress={() => setCostCurrency(c.code)}
                    >
                      <Text
                        style={[
                          s.ccyPillText,
                          costCurrency === c.code && s.ccyPillTextActive,
                        ]}
                      >
                          {c.symbol} {c.code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>Date — optional</Text>
                {Platform.OS === 'web' ? (
                  // @react-native-community/datetimepicker has no usable web
                  // render; the browser's native date input speaks our exact
                  // 'YYYY-MM-DD' storage format.
                  React.createElement('input', {
                    type: 'date',
                    value: costDate,
                    onChange: (e: any) => setCostDate(e.target.value),
                    style: {
                      backgroundColor: '#222',
                      borderRadius: 12,
                      padding: 14,
                      fontSize: 16,
                      color: '#FFF',
                      marginBottom: 4,
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
                        setShowDatePicker((v) => !v);
                      }}
                    >
                      <Text style={costDate ? s.dateText : s.datePlaceholder}>
                        {fmtDate(costDate) || 'No date'}
                      </Text>
                      {costDate ? (
                        <Pressable
                          hitSlop={10}
                          onPress={() => {
                            setCostDate('');
                            setShowDatePicker(false);
                          }}
                        >
                          <Ionicons name="close-circle" size={18} color="#666" />
                        </Pressable>
                      ) : (
                        <Ionicons name="calendar-outline" size={16} color="#666" />
                      )}
                    </Pressable>
                    {showDatePicker && (
                      <View style={s.pickerWrap}>
                        <DateTimePicker
                          value={parseYMD(costDate)}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          themeVariant="dark"
                          onChange={onPickDate}
                        />
                        {Platform.OS === 'ios' && (
                          <TouchableOpacity
                            style={s.pickerDone}
                            onPress={() => setShowDatePicker(false)}
                          >
                            <Text style={s.pickerDoneText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              <View style={s.sheetActions}>
                <TouchableOpacity style={s.btnCancel} onPress={closeCostModal}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.btnSave, !costValid && s.btnSaveDisabled]}
                  onPress={saveCostForm}
                  disabled={!costValid}
                >
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {costModal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => removeCost(costModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete cost</Text>
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
  scroll: { paddingHorizontal: 16, paddingTop: 112 },

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

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8, paddingHorizontal: 24 },
  emptyText: { fontSize: 14, color: '#777', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#555', textAlign: 'center', lineHeight: 17 },

  card: { ...surface, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  projectName: { fontSize: 15, fontWeight: '600', color: '#EEE' },
  projectMeta: { fontSize: 12, color: '#555', marginTop: 3, fontWeight: '500' },
  projectTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#00C896',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  cardBody: { borderTopWidth: 1, borderTopColor: '#1C1C1C', paddingHorizontal: 18 },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  costLabel: { fontSize: 14, color: '#EEE', fontWeight: '500' },
  costDate: { fontSize: 11, color: '#555', marginTop: 2, fontWeight: '500' },
  costAmount: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  addCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  addCostText: { fontSize: 14, color: '#00C896', fontWeight: '500' },
  editProjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    paddingBottom: 16,
  },
  editProjectText: { fontSize: 12, color: '#666', fontWeight: '500' },

  // "Previous projects" (finished) section
  prevHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  prevHeaderText: { fontSize: 12, fontWeight: '600', color: '#666', letterSpacing: 0.5, flex: 1 },
  prevCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: '#1C1C1C',
    alignItems: 'center',
  },
  prevCountText: { fontSize: 11, color: '#888', fontWeight: '700', fontVariant: ['tabular-nums'] },
  projectNameFinished: { color: '#888' },

  // Sheets
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
    marginBottom: 4,
  },
  dateText: { fontSize: 16, color: '#FFF', fontWeight: '500' },
  datePlaceholder: { fontSize: 16, color: '#444', fontWeight: '500' },
  pickerWrap: {
    backgroundColor: '#161616',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    marginTop: 8,
    paddingBottom: 6,
  },
  pickerDone: { alignSelf: 'flex-end', paddingHorizontal: 18, paddingVertical: 8 },
  pickerDoneText: { fontSize: 15, color: '#00C896', fontWeight: '700' },

  // Currency picker pills (matches the Add/Remove money sheet)
  ccyPicker: { marginBottom: 20 },
  ccyPickerContent: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginBottom: 20 },
  ccyPill: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  ccyPillActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  ccyPillText: { fontSize: 11, color: '#999', fontWeight: '600', textAlign: 'center' },
  ccyPillTextActive: { color: '#07120F' },

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
  btnSaveDisabled: { opacity: 0.4 },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },
  btnFinish: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2C2C2C',
    marginTop: 10,
  },
  btnFinishText: { fontSize: 14, color: '#AAA', fontWeight: '600' },
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
