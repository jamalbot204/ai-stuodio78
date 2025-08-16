
import { create } from 'zustand';
import { useGlobalUiStore } from './useGlobalUiStore';
import { EditMessagePanelDetails } from '../components/EditMessagePanel';
import { AICharacter, ChatSession, AttachmentWithContext, FilenameInputModalTriggerProps } from '../types';
import { useToastStore } from './useToastStore';

export interface ModalState {
  // State from useAppModals
  isSettingsPanelOpen: boolean;
  isTtsSettingsModalOpen: boolean;
  isEditPanelOpen: boolean;
  editingMessageDetail: EditMessagePanelDetails | null;
  isCharacterManagementModalOpen: boolean;
  isContextualInfoModalOpen: boolean;
  editingCharacterForContextualInfo: AICharacter | null;
  isDebugTerminalOpen: boolean;
  isExportConfigModalOpen: boolean;
  isDeleteConfirmationOpen: boolean;
  deleteTarget: { sessionId: string; messageId: string } | null;
  isResetAudioConfirmationOpen: boolean;
  resetAudioTarget: { sessionId: string; messageId: string } | null;
  isFilenameInputModalOpen: boolean;
  filenameInputModalProps: FilenameInputModalTriggerProps | null;
  isChatAttachmentsModalOpen: boolean;
  attachmentsForModal: AttachmentWithContext[];
  isApiKeyModalOpen: boolean;
  isGitHubImportModalOpen: boolean;
  isInjectedMessageEditModalOpen: boolean;
  injectedMessageEditTarget: { sessionId: string; messageId: string; } | null;
  isMermaidModalOpen: boolean;
  mermaidModalData: { code: string; messageId?: string; fullContent?: string } | null;

  // Actions from useAppModals
  openSettingsPanel: () => void;
  closeSettingsPanel: () => void;
  openTtsSettingsModal: () => void;
  closeTtsSettingsModal: () => void;
  openEditPanel: (details: EditMessagePanelDetails) => void;
  closeEditPanel: () => void;
  openCharacterManagementModal: () => void;
  closeCharacterManagementModal: () => void;
  openCharacterContextualInfoModal: (character: AICharacter) => void;
  closeCharacterContextualInfoModal: () => void;
  openDebugTerminal: () => void;
  closeDebugTerminal: () => void;
  openExportConfigurationModal: () => void;
  closeExportConfigurationModal: () => void;
  requestDeleteConfirmation: (target: { sessionId: string; messageId: string; }) => void;
  cancelDeleteConfirmation: () => void;
  requestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => void;
  cancelResetAudioCacheConfirmation: () => void;
  openFilenameInputModal: (props: FilenameInputModalTriggerProps) => void;
  closeFilenameInputModal: () => void;
  submitFilenameInputModal: (filename: string) => void;
  openChatAttachmentsModal: (session: ChatSession | null) => void;
  closeChatAttachmentsModal: () => void;
  openApiKeyModal: () => void;
  closeApiKeyModal: () => void;
  openGitHubImportModal: () => void;
  closeGitHubImportModal: () => void;
  openInjectedMessageEditModal: (target: { sessionId: string; messageId: string; }) => void;
  closeInjectedMessageEditModal: () => void;
  openMermaidModal: (data: { code: string; messageId?: string; fullContent?: string }) => void;
  closeMermaidModal: () => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  isSettingsPanelOpen: false,
  isTtsSettingsModalOpen: false,
  isEditPanelOpen: false,
  editingMessageDetail: null,
  isCharacterManagementModalOpen: false,
  isContextualInfoModalOpen: false,
  editingCharacterForContextualInfo: null,
  isDebugTerminalOpen: false,
  isExportConfigModalOpen: false,
  isDeleteConfirmationOpen: false,
  deleteTarget: null,
  isResetAudioConfirmationOpen: false,
  resetAudioTarget: null,
  isFilenameInputModalOpen: false,
  filenameInputModalProps: null,
  isChatAttachmentsModalOpen: false,
  attachmentsForModal: [],
  isApiKeyModalOpen: false,
  isGitHubImportModalOpen: false,
  isInjectedMessageEditModalOpen: false,
  injectedMessageEditTarget: null,
  isMermaidModalOpen: false,
  mermaidModalData: null,

  openSettingsPanel: () => {
    set({ isSettingsPanelOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),
  
  openTtsSettingsModal: () => {
    set({ isTtsSettingsModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeTtsSettingsModal: () => set({ isTtsSettingsModalOpen: false }),

  openEditPanel: (details) => {
    set(() => ({
      editingMessageDetail: details,
      isEditPanelOpen: true,
      isSettingsPanelOpen: false,
    }));
    useGlobalUiStore.getState().closeSidebar();
  },
  closeEditPanel: () => set({ isEditPanelOpen: false, editingMessageDetail: null }),

  openCharacterManagementModal: () => {
    set({ isCharacterManagementModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeCharacterManagementModal: () => set({ isCharacterManagementModalOpen: false }),

  openCharacterContextualInfoModal: (character) => {
    set({ editingCharacterForContextualInfo: character, isContextualInfoModalOpen: true });
  },
  closeCharacterContextualInfoModal: () => {
    set({ isContextualInfoModalOpen: false, editingCharacterForContextualInfo: null });
  },

  openDebugTerminal: () => {
    set({ isDebugTerminalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeDebugTerminal: () => set({ isDebugTerminalOpen: false }),

  openExportConfigurationModal: () => {
    set({ isExportConfigModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeExportConfigurationModal: () => set({ isExportConfigModalOpen: false }),

  requestDeleteConfirmation: (target) => {
    set({ deleteTarget: target, isDeleteConfirmationOpen: true });
  },
  cancelDeleteConfirmation: () => {
    set({ isDeleteConfirmationOpen: false, deleteTarget: null });
  },

  requestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => {
    set({ resetAudioTarget: { sessionId, messageId }, isResetAudioConfirmationOpen: true });
  },
  cancelResetAudioCacheConfirmation: () => {
    set({ isResetAudioConfirmationOpen: false, resetAudioTarget: null });
  },

  openFilenameInputModal: (props) => {
    set({ filenameInputModalProps: props, isFilenameInputModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeFilenameInputModal: () => {
    set({ isFilenameInputModalOpen: false, filenameInputModalProps: null });
  },
  submitFilenameInputModal: (filename) => {
    get().filenameInputModalProps?.onSubmit(filename);
    get().closeFilenameInputModal();
  },

  openChatAttachmentsModal: (session) => {
    if (!session || !session.messages || session.messages.length === 0) {
      useToastStore.getState().showToast("No chat session active or session has no messages.", "error");
      return;
    }

    const allAttachments = session.messages.flatMap(msg =>
      (msg.attachments || []).map(att => ({
        attachment: att,
        messageId: msg.id,
        messageTimestamp: msg.timestamp,
        messageRole: msg.role,
        messageContentSnippet: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
      }))
    ).filter(item => item.attachment);

    if (allAttachments.length === 0) {
      useToastStore.getState().showToast("No attachments found in this chat.", "success");
      return;
    }
    
    allAttachments.sort((a, b) => new Date(b.messageTimestamp).getTime() - new Date(a.messageTimestamp).getTime());
    set(() => ({ 
        attachmentsForModal: allAttachments, 
        isChatAttachmentsModalOpen: true,
        isSettingsPanelOpen: false 
    }));
    useGlobalUiStore.getState().closeSidebar();
  },
  closeChatAttachmentsModal: () => {
    set({ isChatAttachmentsModalOpen: false, attachmentsForModal: [] });
  },

  openApiKeyModal: () => {
    set({ isApiKeyModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),

  openGitHubImportModal: () => {
    set({ isGitHubImportModalOpen: true });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeGitHubImportModal: () => set({ isGitHubImportModalOpen: false }),

  openInjectedMessageEditModal: (target) => {
    set({
      isInjectedMessageEditModalOpen: true,
      injectedMessageEditTarget: target,
      isSettingsPanelOpen: false,
    });
    useGlobalUiStore.getState().closeSidebar();
  },
  closeInjectedMessageEditModal: () => {
    set({ isInjectedMessageEditModalOpen: false, injectedMessageEditTarget: null });
  },

  openMermaidModal: (data) => {
    set({ isMermaidModalOpen: true, mermaidModalData: data });
  },
  closeMermaidModal: () => {
    set({ isMermaidModalOpen: false, mermaidModalData: null });
  },
}));
