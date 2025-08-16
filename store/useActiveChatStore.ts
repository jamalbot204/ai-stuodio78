

import { create } from 'zustand';
import { ChatSession } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useChatListStore } from './useChatListStore.ts';
import { useDataStore } from './useDataStore.ts';
import { DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT } from '../constants.ts';

interface ActiveChatState {
  currentChatId: string | null;
  currentChatSession: ChatSession | null;
  loadActiveChatId: () => Promise<void>;
  selectChat: (id: string | null) => Promise<void>;
  updateCurrentChatSession: (updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
}

export const useActiveChatStore = create<ActiveChatState>((set, get) => ({
  currentChatId: null,
  currentChatSession: null,

  loadActiveChatId: async () => {
    // This should be called after chatHistory is loaded
    try {
      const activeChatId = await dbService.getAppMetadata<string | null>(METADATA_KEYS.ACTIVE_CHAT_ID);
      const { chatHistory } = useChatListStore.getState();
      if (chatHistory.length > 0) {
        const validActiveChatId = activeChatId && chatHistory.find(s => s.id === activeChatId) ? activeChatId : chatHistory[0].id;
        get().selectChat(validActiveChatId);
      } else {
        set({ currentChatId: null, currentChatSession: null });
      }
    } catch (error) {
        console.error("Failed to load active chat ID from IndexedDB:", error);
        set({ currentChatId: null, currentChatSession: null });
    }
  },

  selectChat: async (id: string | null) => {
    const { setMessagesToDisplayConfig } = useDataStore.getState();
    const chatList = useChatListStore.getState().chatHistory;

    set({ 
      currentChatId: id, 
      currentChatSession: chatList.find(s => s.id === id) || null 
    });
    await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, id);

    if (id) {
      const selectedChat = chatList.find(c => c.id === id);
      if (selectedChat) {
          const maxInitial = selectedChat.settings.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT;
          await setMessagesToDisplayConfig(prev => ({ ...prev, [id]: Math.min(selectedChat.messages.length, maxInitial)}));
      }
    }
  },

  updateCurrentChatSession: async (updater) => {
    const { currentChatSession } = get();
    if (!currentChatSession) return;

    const updatedSessionCandidate = updater(currentChatSession);
    if (updatedSessionCandidate === null) return; // No update

    const finalUpdatedSession = { ...updatedSessionCandidate, lastUpdatedAt: new Date() };
    
    // Update the list store
    useChatListStore.getState().updateChatSessionInList(finalUpdatedSession);
    
    // Update self
    set({ currentChatSession: finalUpdatedSession });
  },
}));

// This part is crucial. When the chat list changes, we need to update the active session object.
useChatListStore.subscribe(
  (state, prevState) => {
    if (state.chatHistory !== prevState.chatHistory) {
      const { currentChatId } = useActiveChatStore.getState();
      const newCurrentSession = state.chatHistory.find(s => s.id === currentChatId) || null;
      useActiveChatStore.setState({ currentChatSession: newCurrentSession });
    }
  }
);

let hasInitialized = false;
// This listener runs when isLoadingData changes to false.
useChatListStore.subscribe(
  (state, prevState) => {
    if (state.isLoadingData !== prevState.isLoadingData && !state.isLoadingData && !hasInitialized) {
      useActiveChatStore.getState().loadActiveChatId();
      hasInitialized = true;
    }
  }
);
