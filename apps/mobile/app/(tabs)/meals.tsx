import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Modal,
  TextInput, ScrollView, Alert,
} from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { Plus, UtensilsCrossed } from 'lucide-react-native';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface MealItem {
  foodName: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

interface MealLog {
  id: string;
  loggedAt: string;
  mealType?: MealType;
  notes?: string;
  items?: MealItem[];
}

interface MacroSummary {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealsScreen() {
  const { accessToken } = useAuthStore();
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [summary, setSummary] = useState<MacroSummary | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [items, setItems] = useState<MealItem[]>([{ foodName: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      api.get<{ logs: MealLog[] }>('/v1/meals', accessToken),
      api.get<MacroSummary>(`/v1/meals/summary?date=${today}`, accessToken),
    ]).then(([logsRes, sumRes]) => {
      setLogs(logsRes.logs);
      setSummary(sumRes);
    }).catch(() => {});
  }, [accessToken]);

  async function saveMeal() {
    if (!accessToken) return;
    const validItems = items.filter((i) => i.foodName.trim());
    if (validItems.length === 0) { Alert.alert('Add at least one food item'); return; }
    setSaving(true);
    try {
      const log = await api.post<MealLog>('/v1/meals', { mealType, items: validItems }, accessToken);
      setLogs((l) => [log, ...l]);
      setShowModal(false);
      setItems([{ foodName: '' }]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Daily summary */}
      {summary && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Today's Totals</Text>
          <View style={styles.macros}>
            {[
              { label: 'Calories', value: summary.totalCalories, unit: 'kcal' },
              { label: 'Protein', value: summary.totalProtein, unit: 'g' },
              { label: 'Carbs', value: summary.totalCarbs, unit: 'g' },
              { label: 'Fat', value: summary.totalFat, unit: 'g' },
            ].map(({ label, value, unit }) => (
              <View key={label} style={styles.macro}>
                <Text style={styles.macroValue}>{Math.round(value)}</Text>
                <Text style={styles.macroUnit}>{unit}</Text>
                <Text style={styles.macroLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <UtensilsCrossed size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>No meals logged yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.mealType}>{item.mealType ?? 'meal'}</Text>
              <Text style={styles.cardDate}>
                {new Date(item.loggedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </View>
          </View>
        )}
      />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Meal</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Meal Type</Text>
          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setMealType(t)}
                style={[styles.mealTypeBtn, mealType === t && styles.mealTypeBtnActive]}
              >
                <Text style={[styles.mealTypeBtnText, mealType === t && styles.mealTypeBtnTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Food Items</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Food name"
                value={item.foodName}
                onChangeText={(t) => setItems((it) => it.map((x, j) => j === i ? { ...x, foodName: t } : x))}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="kcal"
                keyboardType="numeric"
                value={item.calories?.toString() ?? ''}
                onChangeText={(t) => setItems((it) => it.map((x, j) => j === i ? { ...x, calories: parseInt(t) || undefined } : x))}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="P(g)"
                keyboardType="numeric"
                value={item.proteinG?.toString() ?? ''}
                onChangeText={(t) => setItems((it) => it.map((x, j) => j === i ? { ...x, proteinG: parseFloat(t) || undefined } : x))}
              />
            </View>
          ))}

          <TouchableOpacity onPress={() => setItems((i) => [...i, { foodName: '' }])}>
            <Text style={styles.addItem}>+ Add Item</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveMeal}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Meal'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  summary: {
    backgroundColor: '#7c3aed', padding: 16, margin: 16, borderRadius: 14,
  },
  summaryTitle: { color: '#ede9fe', fontSize: 13, fontWeight: '500', marginBottom: 10 },
  macros: { flexDirection: 'row', justifyContent: 'space-around' },
  macro: { alignItems: 'center' },
  macroValue: { fontSize: 22, fontWeight: '700', color: '#fff' },
  macroUnit: { fontSize: 11, color: '#ddd6fe' },
  macroLabel: { fontSize: 11, color: '#c4b5fd', marginTop: 2 },
  fab: {
    position: 'absolute', bottom: 24, right: 24, zIndex: 10,
    backgroundColor: '#7c3aed', width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealType: { fontSize: 14, fontWeight: '600', color: '#7c3aed', textTransform: 'capitalize' },
  cardDate: { fontSize: 12, color: '#9ca3af' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalContent: { padding: 20, gap: 10, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  modalClose: { color: '#7c3aed', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 },
  mealTypeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mealTypeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb' },
  mealTypeBtnActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  mealTypeBtnText: { fontSize: 13, color: '#6b7280', textTransform: 'capitalize' },
  mealTypeBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, backgroundColor: '#fafafa',
  },
  itemRow: { flexDirection: 'row', gap: 6 },
  addItem: { color: '#7c3aed', fontSize: 14, fontWeight: '500', marginTop: 4 },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
