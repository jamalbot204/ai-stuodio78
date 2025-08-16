import { create } from 'zustand';
import { ChatSession, UserDefinedDefaults, Attachment, AICharacter } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useToastStore } from './useToastStore.ts';
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants.ts';

interface ChatListState {
  chatHistory: ChatSession[];
  isLoadingData: boolean;
  loadChatHistory: () => Promise<void>;
  addChatSession: (session: ChatSession) => Promise<void>;
  deleteChat: (sessionId: string) => Promise<void>;
  updateChatSessionInList: (session: ChatSession) => void;
  createNewChat: () => Promise<void>;
  duplicateChat: (originalSessionId: string) => Promise<void>;
}

export const useChatListStore = create<ChatListState>((set, get) => ({
  chatHistory: [],
  isLoadingData: true,

  loadChatHistory: async () => {
    set({ isLoadingData: true });
    try {
      const sessions = await dbService.getAllChatSessions();
      set({ chatHistory: sessions, isLoadingData: false });
    } catch (error) {
      console.error("Failed to load chat history:", error);
      set({ chatHistory: [], isLoadingData: false });
    }
  },

  addChatSession: async (session: ChatSession) => {
    await dbService.addOrUpdateChatSession(session);
    set(state => ({
      chatHistory: [session, ...state.chatHistory].sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
    }));
  },
  
  updateChatSessionInList: (updatedSession: ChatSession) => {
    set(state => ({
      chatHistory: state.chatHistory
        .map(s => s.id === updatedSession.id ? updatedSession : s)
        .sort((a, b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime())
    }));
  },

  deleteChat: async (sessionId: string) => {
    const { currentChatId, selectChat } = useActiveChatStore.getState();
    const { cleanupOnChatDelete } = useDataStore.getState();
    const showToast = useToastStore.getState().showToast;
    const preDeleteHistory = get().chatHistory;

    await dbService.deleteChatSession(sessionId);
    set(state => ({
      chatHistory: state.chatHistory.filter(s => s.id !== sessionId)
    }));
    await cleanupOnChatDelete(sessionId);

    if (currentChatId === sessionId) {
      const postDeleteHistory = preDeleteHistory.filter(s => s.id !== sessionId);
      const sortedRemaining = [...postDeleteHistory].sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());
      await selectChat(sortedRemaining.length > 0 ? sortedRemaining[0].id : null);
    }
    showToast("Chat deleted!", "success");
  },

  createNewChat: async () => {
    const { addChatSession } = get();
    const { selectChat } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;

    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    let initialModel = DEFAULT_MODEL_ID;
    let initialSettings = { ...DEFAULT_SETTINGS, safetySettings: [...DEFAULT_SAFETY_SETTINGS], ttsSettings: { ...DEFAULT_TTS_SETTINGS }, maxInitialMessagesDisplayed: DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT };

    try {
        const storedUserDefaults = await dbService.getAppMetadata<UserDefinedDefaults>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS);
        if (storedUserDefaults) {
            initialModel = storedUserDefaults.model || DEFAULT_MODEL_ID;
            initialSettings = { ...DEFAULT_SETTINGS, ...storedUserDefaults.settings, safetySettings: storedUserDefaults.settings?.safetySettings?.length ? [...storedUserDefaults.settings.safetySettings] : [...DEFAULT_SAFETY_SETTINGS], ttsSettings: storedUserDefaults.settings?.ttsSettings || { ...DEFAULT_TTS_SETTINGS }, maxInitialMessagesDisplayed: storedUserDefaults.settings?.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT };
        }
    } catch (e) { console.error("Failed to parse user-defined global defaults from IndexedDB", e); }
    
    const newSession: ChatSession = { id: newSessionId, title: 'New Chat', messages: [], createdAt: new Date(), lastUpdatedAt: new Date(), model: initialModel, settings: initialSettings, isCharacterModeActive: false, aiCharacters: [], apiRequestLogs: [], githubRepoContext: null };

    await addChatSession(newSession);
    await selectChat(newSession.id);
    
    showToast("New chat created!", "success");
  },

  duplicateChat: async (originalSessionId: string) => {
    const { chatHistory, addChatSession } = get();
    const { selectChat } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;

    const originalSession = chatHistory.find(s => s.id === originalSessionId);
    if (!originalSession) {
      console.error("Original session not found for duplication");
      showToast("Failed to duplicate: Original chat not found.", "error");
      return;
    }
    
    const newSessionId = `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const newTitle = `${originalSession.title} (Copy)`;
    const newMessages = originalSession.messages.map(msg => ({ ...msg, id: `msg-${Date.now()}-${msg.role}-${Math.random().toString(36).substring(2, 7)}`, attachments: msg.attachments?.map(att => ({ ...att, id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`, uploadState: (att.fileUri && att.uploadState === 'completed_cloud_upload') ? 'completed_cloud_upload' : (att.base64Data ? 'completed' : 'idle'), statusMessage: (att.fileUri && att.uploadState === 'completed_cloud_upload') ? 'Cloud file (copied)' : (att.base64Data ? 'Local data (copied)' : undefined), progress: undefined, error: undefined, isLoading: false })) as Attachment[] | undefined, cachedAudioBuffers: null, cachedAudioSegmentCount: undefined, ttsWordsPerSegmentCache: undefined, exportedMessageAudioBase64: undefined, timestamp: new Date(msg.timestamp) }));
    const newAiCharacters: AICharacter[] | undefined = originalSession.aiCharacters?.map(char => ({ ...char, id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` }));
    const duplicatedSession: ChatSession = { ...originalSession, id: newSessionId, title: newTitle, messages: newMessages, aiCharacters: newAiCharacters, createdAt: new Date(), lastUpdatedAt: new Date(), apiRequestLogs: [], githubRepoContext: originalSession.githubRepoContext ? { ...originalSession.githubRepoContext } : null };

    await addChatSession(duplicatedSession);
    await selectChat(newSessionId);
    showToast("Chat duplicated successfully!", "success");
  },
}));

// Initialize the store by loading the chat history from the database.
useChatListStore.getState().loadChatHistory();