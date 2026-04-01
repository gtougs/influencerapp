import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { account, accessToken, subscriptions, clearAuth, setSubscriptions } = useAuthStore();
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ subscriptions: any[] }>('/v1/subscriptions/me', accessToken)
      .then((r) => setSubscriptions(r.subscriptions))
      .catch(() => {});
  }, [accessToken]);

  async function handleLogout() {
    if (accessToken) {
      await api.post('/v1/auth/logout', {}, accessToken).catch(() => {});
    }
    await clearAuth();
    router.replace('/(auth)/login');
  }

  async function openBillingPortal() {
    if (!accessToken) return;
    setBillingLoading(true);
    try {
      const { portalUrl } = await api.post<{ portalUrl: string }>('/v1/subscriptions/portal', {}, accessToken);
      // In production: use expo-linking to open URL
      Alert.alert('Billing Portal', `Open this URL in a browser:\n${portalUrl}`);
    } catch {
      Alert.alert('Error', 'Billing portal unavailable');
    } finally {
      setBillingLoading(false);
    }
  }

  const activeInfluencerSubs = subscriptions.filter(
    (s) => s.status === 'active' || s.status === 'trialing'
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{account?.displayName?.[0] ?? '?'}</Text>
        </View>
        <Text style={styles.name}>{account?.displayName}</Text>
        <Text style={styles.email}>{account?.email}</Text>
      </View>

      {/* Subscriptions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Subscriptions</Text>
        {activeInfluencerSubs.length === 0 ? (
          <Text style={styles.empty}>No active subscriptions. Browse creators to subscribe.</Text>
        ) : (
          activeInfluencerSubs.map((sub) => (
            <View key={sub.id} style={styles.subCard}>
              <Text style={styles.subName}>{sub.display_name ?? 'Influencer'}</Text>
              <View style={[styles.badge, sub.status === 'active' ? styles.activeBadge : styles.trialingBadge]}>
                <Text style={styles.badgeText}>{sub.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.actionBtn} onPress={openBillingPortal} disabled={billingLoading}>
          <Text style={styles.actionText}>{billingLoading ? 'Opening...' : 'Manage Billing'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={handleLogout}>
          <Text style={[styles.actionText, styles.logoutText]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  header: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#7c3aed' },
  name: { fontSize: 20, fontWeight: '700', color: '#111' },
  email: { fontSize: 14, color: '#9ca3af' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#374151' },
  empty: { color: '#9ca3af', fontSize: 14 },
  subCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  subName: { fontSize: 14, fontWeight: '600', color: '#111' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  activeBadge: { backgroundColor: '#dcfce7' },
  trialingBadge: { backgroundColor: '#fef9c3' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  actionBtn: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center',
  },
  logoutBtn: { borderColor: '#fecaca' },
  actionText: { fontSize: 15, fontWeight: '500', color: '#374151' },
  logoutText: { color: '#ef4444' },
});
