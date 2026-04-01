import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { registerForPushNotifications } from '@/services/notifications';
import type { AuthResponse } from '@influencerapp/shared-types';

export default function RegisterScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!form.email || !form.password || !form.displayName) return;
    setLoading(true);
    try {
      const res = await api.post<AuthResponse>('/v1/auth/register', {
        ...form,
        role: 'user',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await setAuth({ accessToken: res.accessToken, refreshToken: res.refreshToken }, res.account);
      registerForPushNotifications(res.accessToken).catch(() => {});
      router.replace('/(tabs)/discover');
    } catch (err: any) {
      Alert.alert('Sign up failed', err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const update = (field: string) => (val: string) => setForm((f) => ({ ...f, [field]: val }));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>Get started</Text>
        <Text style={styles.subtitle}>Join for $2/month and access influencer plans</Text>

        <TextInput style={styles.input} placeholder="Your name" value={form.displayName} onChangeText={update('displayName')} autoComplete="name" />
        <TextInput style={styles.input} placeholder="Email" value={form.email} onChangeText={update('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <TextInput style={styles.input} placeholder="Password (8+ chars)" value={form.password} onChangeText={update('password')} secureTextEntry autoComplete="new-password" />

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Create Account'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fafafa',
  },
  button: { backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  link: { textAlign: 'center', color: '#7c3aed', marginTop: 8, fontSize: 14 },
});
