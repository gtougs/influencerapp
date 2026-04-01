import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Modal,
  TextInput, ScrollView, Alert,
} from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
import { Plus, Dumbbell } from 'lucide-react-native';

interface Exercise {
  exerciseName: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  notes?: string;
}

interface WorkoutLog {
  id: string;
  loggedAt: string;
  notes?: string;
  exercises?: Exercise[];
}

export default function WorkoutsScreen() {
  const { accessToken } = useAuthStore();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ notes: '' });
  const [exercises, setExercises] = useState<Exercise[]>([{ exerciseName: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ logs: WorkoutLog[] }>('/v1/workouts', accessToken)
      .then((r) => setLogs(r.logs))
      .catch(() => {});
  }, [accessToken]);

  async function saveWorkout() {
    if (!accessToken) return;
    const validExercises = exercises.filter((e) => e.exerciseName.trim());
    if (validExercises.length === 0) {
      Alert.alert('Add at least one exercise');
      return;
    }
    setSaving(true);
    try {
      const log = await api.post<WorkoutLog>('/v1/workouts', {
        notes: form.notes || undefined,
        exercises: validExercises,
      }, accessToken);
      setLogs((l) => [log, ...l]);
      setShowModal(false);
      setForm({ notes: '' });
      setExercises([{ exerciseName: '' }]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>

      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Dumbbell size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>No workouts logged yet</Text>
            <Text style={styles.emptySubtext}>Tap + to log your first session</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardDate}>{formatDate(item.loggedAt)}</Text>
            {item.notes && <Text style={styles.cardNotes}>{item.notes}</Text>}
          </View>
        )}
      />

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Log Workout</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="How did it feel?"
            value={form.notes}
            onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
            multiline
          />

          <Text style={styles.label}>Exercises</Text>
          {exercises.map((ex, i) => (
            <View key={i} style={styles.exerciseRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Exercise name"
                value={ex.exerciseName}
                onChangeText={(t) => setExercises((e) => e.map((ex2, j) => j === i ? { ...ex2, exerciseName: t } : ex2))}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Sets"
                keyboardType="numeric"
                value={ex.sets?.toString() ?? ''}
                onChangeText={(t) => setExercises((e) => e.map((ex2, j) => j === i ? { ...ex2, sets: parseInt(t) || undefined } : ex2))}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Reps"
                keyboardType="numeric"
                value={ex.reps?.toString() ?? ''}
                onChangeText={(t) => setExercises((e) => e.map((ex2, j) => j === i ? { ...ex2, reps: parseInt(t) || undefined } : ex2))}
              />
            </View>
          ))}

          <TouchableOpacity onPress={() => setExercises((e) => [...e, { exerciseName: '' }])}>
            <Text style={styles.addExercise}>+ Add Exercise</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={saveWorkout}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Workout'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, zIndex: 10,
    backgroundColor: '#7c3aed', width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', elevation: 4,
    shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
  },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySubtext: { fontSize: 14, color: '#9ca3af' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  cardDate: { fontWeight: '600', color: '#111', fontSize: 15 },
  cardNotes: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalContent: { padding: 20, gap: 10, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  modalClose: { color: '#7c3aed', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fafafa',
  },
  exerciseRow: { flexDirection: 'row', gap: 6 },
  addExercise: { color: '#7c3aed', fontSize: 14, fontWeight: '500', marginTop: 4 },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
