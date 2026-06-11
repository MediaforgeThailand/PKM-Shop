import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatMessage } from '@/lib/ai/miraChat';

export function MessageBubble({ children, message }: { children?: ReactNode; message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystemNotice = message.role === 'system_notice';

  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : isSystemNotice ? styles.systemBubble : styles.assistantBubble]}>
      <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : isSystemNotice ? styles.systemBubbleText : styles.assistantBubbleText]}>
        {message.content}
      </Text>
      {message.sources?.length ? (
        <View style={styles.sources}>
          <Text style={styles.sourcesTitle}>Sources</Text>
          {message.sources.map((source) => (
            <Text key={source.id} style={styles.sourceText}>
              {source.title} - {source.category} - {source.source}
            </Text>
          ))}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export const messageBubbleStyles = StyleSheet.create({
  loadingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
});

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE8E2',
    borderWidth: 1,
  },
  assistantBubbleText: {
    color: '#243B34',
  },
  bubble: {
    borderRadius: 8,
    maxWidth: '92%',
    padding: 14,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  sourceText: {
    color: '#587069',
    fontSize: 12,
    lineHeight: 17,
  },
  sources: {
    borderTopColor: '#E4EEE9',
    borderTopWidth: 1,
    gap: 5,
    marginTop: 12,
    paddingTop: 10,
  },
  sourcesTitle: {
    color: '#3C7864',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#163F34',
  },
  userBubbleText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: '#F3F7F5',
    borderColor: '#BFD5CB',
    borderWidth: 1,
  },
  systemBubbleText: {
    color: '#3C5F53',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
});
