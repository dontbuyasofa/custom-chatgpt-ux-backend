// src/lib/store.ts
// Simple in-memory store for local dev.
// We'll replace this with a real database later.

export type ConversationStore = {
  pageToConversation: Map<string, string>;
};

const store: ConversationStore = {
  pageToConversation: new Map<string, string>(),
};

export function getConversationIdForPage(pageId: string): string | undefined {
  return store.pageToConversation.get(pageId);
}

export function setConversationIdForPage(pageId: string, conversationId: string) {
  store.pageToConversation.set(pageId, conversationId);
}
