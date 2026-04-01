import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Image, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';

interface Influencer {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  followerCount: number;
  specialtyTags: string[];
}

export default function DiscoverScreen() {
  const { accessToken } = useAuthStore();
  const router = useRouter();
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    api.get<{ influencers: Influencer[] }>(`/v1/influencers${q}`, accessToken)
      .then((r) => setInfluencers(r.influencers))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken, search]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search creators..."
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#7c3aed" />
      ) : (
        <FlatList
          data={influencers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/influencer/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{item.displayName[0]}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.handle}>@{item.handle}</Text>
                {item.bio && <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text>}
                <View style={styles.tags}>
                  {item.specialtyTags.slice(0, 3).map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No creators found</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  search: {
    margin: 16, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    fontSize: 15,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: '#fff',
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6',
  },
  avatar: { width: 52, height: 52 },
  avatarImg: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#ede9fe',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: '#7c3aed' },
  cardBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111' },
  handle: { fontSize: 13, color: '#9ca3af', marginTop: 1 },
  bio: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: '#7c3aed', fontWeight: '500' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
});
