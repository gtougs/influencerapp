import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/services/api';
// @ts-ignore
import EventSource from 'react-native-sse';

interface ChatSession {
  id: string;
  influencerId: string;
  influencer_handle: string;
  display_name: string;
  lastMessageAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export default function ChatScreen() {
  const { accessToken } = useAuthStore();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

  useEffect(() => {
    if (!accessToken) return;
    api.get<{ sessions: ChatSession[] }>('/v1/chat/sessions', accessToken)
      .then((r) => setSessions(r.sessions))
      .catch(() => {});
  }, [accessToken]);

  async function openSession(session: ChatSession) {
    setActiveSession(session);
    if (!accessToken) return;
    const { messages: msgs } = await api.get<{ messages: ChatMessage[] }>(
      `/v1/chat/sessions/${session.id}/messages`, accessToken
    ).catch(() => ({ messages: [] }));
    setMessages(msgs);
  }

  async function sendMessage() {
    if (!input.trim() || !activeSession || !accessToken || streaming) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMessage]);
    setInput('');
    setStreaming(true);
    setStreamBuffer('');

    // SSE stream
    const es = new EventSource(
      `${API_BASE}/v1/chat/sessions/${activeSession.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content: userMessage.content }),
      }
    );

    let fullText = '';

    es.addEventListener('message', (event: any) => {
      if (event.data === '[DONE]') {
        es.close();
        setStreaming(false);
        setStreamBuffer('');
        if (fullText) {
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: fullText,
            createdAt: new Date().toISOString(),
          };
          setMessages((m) => [...m.filter(msg => msg.id !== 'streaming'), assistantMessage]);
        }
        return;
      }

      try {
        const parsed = JSON.parse(event.data);
        if (parsed.token) {
          fullText += parsed.token;
          setStreamBuffer(fullText);
          // Show streaming message
          setMessages((m) => {
            const withoutStreaming = m.filter(msg => msg.id !== 'streaming');
            return [
              ...withoutStreaming,
              { id: 'streaming', role: 'assistant', content: fullText, createdAt: new Date().toISOString() },
            ];
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('error', () => {
      es.close();
      setStreaming(false);
    });
  }

  // Session list view
  if (!activeSession) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Your Conversations</Text>
        {sessions.length === 0 ? (
          <Text style={styles.empty}>
            Subscribe to an influencer in Discover to start chatting with their AI coach.
          </Text>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.sessionCard} onPress={() => openSession(item)}>
                <Text style={styles.sessionName}>{item.display_name}</Text>
                <Text style={styles.sessionHandle}>@{item.influencer_handle}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setActiveSession(null)}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.chatTitle}>{activeSession.display_name}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>
              {item.content}
            </Text>
            {item.id === 'streaming' && (
              <ActivityIndicator size="small" color="#7c3aed" style={{ marginTop: 4 }} />
            )}
          </View>
        )}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask your coach..."
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || streaming}
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  sectionTitle: { fontSize: 20, fontWeight: '700', padding: 16, color: '#111' },
  empty: { textAlign: 'center', color: '#9ca3af', paddingHorizontal: 32, marginTop: 40, lineHeight: 22 },
  sessionCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
  },
  sessionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  sessionHandle: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff',
  },
  backBtn: { color: '#7c3aed', fontSize: 15 },
  chatTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  messageList: { padding: 16, gap: 10, paddingBottom: 8 },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  assistantBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignSelf: 'flex-start' },
  userBubble: { backgroundColor: '#7c3aed', alignSelf: 'flex-end' },
  bubbleText: { fontSize: 15, color: '#111', lineHeight: 21 },
  userBubbleText: { color: '#fff' },
  inputRow: {
    flexDirection: 'row', gap: 8, padding: 12,
    borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff',
  },
  input: {
    flex: 1, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100,
  },
  sendBtn: { backgroundColor: '#7c3aed', borderRadius: 20, paddingHorizontal: 18, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
