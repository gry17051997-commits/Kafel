import React, { useState, useRef, useEffect } from 'react';
import { View, Text, FlatList, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Platform } from 'react-native';
import { Header } from '@/src/components/Header';
import { Icon } from '@/src/components/Icon';
import { Loading } from '@/src/components/ui';
import { useChat, usePostChat } from '@/src/hooks';
import { useAuth } from '@/src/auth';
import { makeStyles, useTheme } from '@/src/theme';

export default function CzatScreen() {
  const t = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const chatQ = useChat(!!user);
  const postChat = usePostChat();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const messages = chatQ.data || [];

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    try {
      await postChat.mutateAsync(value);
    } catch {
      setText(value);
    }
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <View style={styles.root}>
      <Header title="Czat zespołu" subtitle={`${messages.length} wiadomości`} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {chatQ.isLoading ? (
          <Loading label="Ładuję czat..." />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.sm, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="chat-outline" size={40} color={t.colors.muted} />
                <Text style={styles.emptyText}>Napisz pierwszą wiadomość do ekipy.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View
                testID={`msg-${item.id}`}
                style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}
              >
                {!item.mine && <Text style={styles.author}>{item.displayName}</Text>}
                <Text style={[styles.msgText, item.mine && { color: '#fff' }]}>{item.text}</Text>
                <Text style={[styles.time, item.mine && { color: 'rgba(255,255,255,0.7)' }]}>
                  {fmt(item.createdAt)}
                </Text>
              </View>
            )}
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            testID="chat-input"
            value={text}
            onChangeText={setText}
            placeholder="Napisz wiadomość..."
            placeholderTextColor={t.colors.muted}
            style={styles.input}
            multiline
            onSubmitEditing={send}
          />
          <Pressable
            testID="chat-send"
            onPress={send}
            disabled={!text.trim() || postChat.isPending}
            style={[styles.sendBtn, (!text.trim() || postChat.isPending) && { opacity: 0.5 }]}
          >
            <Icon name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.md, paddingTop: 80 },
  emptyText: { color: t.colors.muted, fontSize: t.font.base },
  bubble: {
    maxWidth: '82%',
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: 2,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: t.colors.brandPrimary, borderBottomRightRadius: 4 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderBottomLeftRadius: 4,
  },
  author: { color: t.colors.brandSecondary, fontSize: t.font.sm, fontWeight: '800' },
  msgText: { color: t.colors.onSurface, fontSize: t.font.lg },
  time: { color: t.colors.muted, fontSize: 10, alignSelf: 'flex-end' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
    paddingTop: t.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    backgroundColor: t.colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: t.colors.surfaceSecondary,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    color: t.colors.onSurface,
    paddingHorizontal: t.spacing.md,
    paddingTop: 12,
    fontSize: t.font.lg,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: t.colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
