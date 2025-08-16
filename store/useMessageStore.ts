import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore';
import { useDataStore } from './useDataStore';
import { useToastStore } from './useToastStore';
import { useModalStore } from './useModalStore';
import { ChatMessage, ChatMessageRole } from '../types.ts';
import { INITIAL_MESSAGES_COUNT, LOAD_MORE_MESSAGES_COUNT } from '../constants.ts';

interface MessageStoreState {
  visibleMessages: ChatMessage[];
  totalMessagesInSession: number;
  canLoadMore: boolean;
  messagesToDisplayCount: number;
}

interface MessageStoreActions {
  loadMoreMessages: () => void;
  loadAllMessages: () => void;
  insertUserAiPairAfter: (afterMessageId: string) => Promise<void>;
  _updateState: () => void; // Internal action to sync state
}

export const useMessageStore = create<MessageStoreState & MessageStoreActions>((set, get) => ({
  visibleMessages: [],
  totalMessagesInSession: 0,
  canLoadMore: false,
  messagesToDisplayCount: 0,

  _updateState: () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { messagesToDisplayConfig } = useDataStore.getState();

    if (!currentChatSession) {
      set({ visibleMessages: [], totalMessagesInSession: 0, canLoadMore: false, messagesToDisplayCount: 0 });
      return;
    }

    const count = messagesToDisplayConfig[currentChatSession.id] ?? currentChatSession.settings?.maxInitialMessagesDisplayed ?? INITIAL_MESSAGES_COUNT;
    const totalMessages = currentChatSession.messages.length;

    set({
      visibleMessages: currentChatSession.messages.slice(-count),
      totalMessagesInSession: totalMessages,
      canLoadMore: count < totalMessages,
      messagesToDisplayCount: count,
    });
  },

  loadMoreMessages: () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { setMessagesToDisplayConfig } = useDataStore.getState();
    if (!currentChatSession) return;
    
    setMessagesToDisplayConfig(prev => {
        const currentCount = get().messagesToDisplayCount;
        const totalMessages = get().totalMessagesInSession;
        return { ...prev, [currentChatSession.id]: Math.min(currentCount + LOAD_MORE_MESSAGES_COUNT, totalMessages) };
    });
  },
  
  loadAllMessages: () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const { setMessagesToDisplayConfig } = useDataStore.getState();
    if (!currentChatSession) return;

    setMessagesToDisplayConfig(prev => ({ ...prev, [currentChatSession.id]: get().totalMessagesInSession }));
  },

  insertUserAiPairAfter: async (afterMessageId) => {
    const { updateCurrentChatSession } = useActiveChatStore.getState();
    const { setMessagesToDisplayConfig, updateMessages } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;
    const { openInjectedMessageEditModal } = useModalStore.getState();
    
    let success = false;
    let newUserId = '';
    let sessionId = '';

    await updateCurrentChatSession(session => {
      if (!session) return null;
      
      const afterMessageIndex = session.messages.findIndex(m => m.id === afterMessageId);
      if (afterMessageIndex === -1) {
        console.error("[MessageStore] Message to insert after not found:", afterMessageId);
        showToast("Error: Original message not found for injection.", "error");
        return session;
      }
      
      const newUserMessage: ChatMessage = {
        id: `msg-${Date.now()}-empty-user-${Math.random().toString(36).substring(2, 9)}`,
        role: ChatMessageRole.USER,
        content: "",
        timestamp: new Date(),
        attachments: [],
        isStreaming: false,
        cachedAudioBuffers: null,
      };
      newUserId = newUserMessage.id; // Capture the new user message ID
      sessionId = session.id; // Capture the session ID

      const newAiMessage: ChatMessage = {
        id: `msg-${Date.now()}-empty-ai-${Math.random().toString(36).substring(2, 9)}`,
        role: ChatMessageRole.MODEL,
        content: "",
        timestamp: new Date(),
        attachments: [],
        isStreaming: false,
        cachedAudioBuffers: null,
        characterName: session.isCharacterModeActive && session.aiCharacters?.length ? session.aiCharacters[0].name : undefined,
      };

      const newMessages = [
        ...session.messages.slice(0, afterMessageIndex + 1),
        newUserMessage,
        newAiMessage,
        ...session.messages.slice(afterMessageIndex + 1),
      ];
      
      const currentDisplayCount = get().messagesToDisplayCount;
      const newDisplayCount = Math.min(newMessages.length, currentDisplayCount + 2);
      
      setMessagesToDisplayConfig(prev => ({ ...prev, [session.id]: newDisplayCount })).catch(console.error);
      
      success = true; 
      return { ...session, messages: newMessages, lastUpdatedAt: new Date() };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    if (success) {
      showToast("Empty message pair inserted.", "success");
      // Open the modal with the new user message ID
      openInjectedMessageEditModal({ sessionId, messageId: newUserId });
    }
  },
}));

// Subscribe to other stores to keep this derived state up-to-date
useActiveChatStore.subscribe(useMessageStore.getState()._updateState);
useDataStore.subscribe(
    (state, prevState) => {
        if (state.messagesToDisplayConfig !== prevState.messagesToDisplayConfig) {
            useMessageStore.getState()._updateState();
        }
    }
);

// Initialize the state when the app loads
useMessageStore.getState()._updateState();