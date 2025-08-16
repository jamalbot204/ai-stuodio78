import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore';
import { useDataStore } from './useDataStore';
import { useToastStore } from './useToastStore';
import { useModalStore } from './useModalStore';
import { useApiKeyStore } from './useApiKeyStore';
import { useSelectionStore } from './useSelectionStore';
import { useAudioStore } from './useAudioStore';
import { uploadFileViaApi, deleteFileViaApi } from '../services/geminiService';
import { Attachment } from '../types';
import { useGeminiApiStore } from './useGeminiApiStore';
import * as dbService from '../services/dbService.ts';

// Helper function from the old hook
function base64StringToFile(base64String: string, filename: string, mimeType: string): File {
  try {
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
  } catch (error) {
    console.error("Error in base64StringToFile:", error);
    throw new Error("Failed to convert base64 string to File object.");
  }
}

interface InteractionActions {
  copyMessage: (content: string) => Promise<boolean>;
  deleteSingleMessage: (messageId: string) => Promise<void>;
  deleteMessageAndSubsequent: (messageId: string) => Promise<void>;
  deleteMultipleMessages: (messageIds: string[]) => Promise<void>;
  clearApiLogs: () => Promise<void>;
  clearChatCache: () => void;
  reUploadAttachment: (messageId: string, attachmentId: string) => Promise<void>;
  resetAudioCache: (messageId: string) => Promise<void>;
}

export const useInteractionStore = create<InteractionActions>(() => ({
  copyMessage: async (content) => {
    try {
      await navigator.clipboard.writeText(content);
      useToastStore.getState().showToast("Copied!", "success");
      return true;
    } catch (err) {
      console.error("Failed to copy message: ", err);
      useToastStore.getState().showToast("Failed to copy message.", "error");
      return false;
    }
  },

  deleteSingleMessage: async (messageId) => {
    const { handleStopAndCancelAllForCurrentAudio } = useAudioStore.getState();
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    const messageToDelete = currentChatSession?.messages.find(m => m.id === messageId);

    if (messageToDelete?.cachedAudioSegmentCount) {
        handleStopAndCancelAllForCurrentAudio();
        // Asynchronously delete audio from DB
        const deletePromises: Promise<void>[] = [];
        for (let i = 0; i < messageToDelete.cachedAudioSegmentCount; i++) {
            deletePromises.push(dbService.deleteAudioBuffer(`${messageToDelete.id}_part_${i}`));
        }
        await Promise.all(deletePromises).catch(console.error);
    }

    await updateCurrentChatSession((session) => {
      if (!session) return null;
      const newMessages = session.messages.filter(m => m.id !== messageId);
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        delete newTimesState[messageId];
        return newTimesState;
      }).catch(console.error);

      return { ...session, messages: newMessages };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    useToastStore.getState().showToast("Message deleted.", "success");
  },

  deleteMessageAndSubsequent: async (messageId) => {
    const { handleStopAndCancelAllForCurrentAudio } = useAudioStore.getState();
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    
    const messageIndex = currentChatSession?.messages.findIndex(m => m.id === messageId) ?? -1;
    if (messageIndex === -1 || !currentChatSession) return;
    
    const messagesToDelete = currentChatSession.messages.slice(messageIndex);

    // Stop audio if any of the deleted messages are playing
    if (messagesToDelete.some(m => m.cachedAudioSegmentCount)) {
        handleStopAndCancelAllForCurrentAudio();
    }
    
    // Asynchronously delete all associated audio files
    const deletePromises: Promise<void>[] = [];
    messagesToDelete.forEach(msg => {
        if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
            for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
    });
    await Promise.all(deletePromises).catch(console.error);

    await updateCurrentChatSession((session) => {
      if (!session) return null;
      const newMessages = session.messages.slice(0, messageIndex);
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messagesToDelete.forEach(msg => delete newTimesState[msg.id]);
        return newTimesState;
      }).catch(console.error);

      return { ...session, messages: newMessages };
    });
    
    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }
  },

  deleteMultipleMessages: async (messageIds) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();
    const { toggleSelectionMode } = useSelectionStore.getState();

    if (messageIds.length === 0 || !currentChatSession) return;

    const idSet = new Set(messageIds);
    const messagesToDelete = currentChatSession.messages.filter(m => idSet.has(m.id));

    // Asynchronously delete audio
    const deletePromises: Promise<void>[] = [];
    messagesToDelete.forEach(msg => {
        if (msg.cachedAudioSegmentCount && msg.cachedAudioSegmentCount > 0) {
            for (let i = 0; i < msg.cachedAudioSegmentCount; i++) {
                deletePromises.push(dbService.deleteAudioBuffer(`${msg.id}_part_${i}`));
            }
        }
    });
    await Promise.all(deletePromises).catch(console.error);
    
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const newMessages = session.messages.filter(m => !idSet.has(m.id));
      
      setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messageIds.forEach(id => delete newTimesState[id]);
        return newTimesState;
      }).catch(console.error);
      
      return { ...session, messages: newMessages };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if (updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }

    useToastStore.getState().showToast(`${messageIds.length} message(s) deleted.`, "success");
    toggleSelectionMode();
  },

  clearApiLogs: async () => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;
    await updateCurrentChatSession(session => session ? ({ ...session, apiRequestLogs: [] }) : null);
    useToastStore.getState().showToast("API logs cleared for this session.", "success");
  },

  clearChatCache: () => {
    const { isSettingsPanelOpen, closeSettingsPanel } = useModalStore.getState();
    const { currentChatSession } = useActiveChatStore.getState();

    if (!currentChatSession) {
      useToastStore.getState().showToast("No active chat session to clear cache for.", "error");
      return;
    }
    useToastStore.getState().showToast("Model cache will be cleared on next interaction if settings changed.", "success");
    if (isSettingsPanelOpen) closeSettingsPanel();
  },
  
  resetAudioCache: async (messageId) => {
    const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
    const { updateMessages } = useDataStore.getState();
    if (!currentChatSession) return;

    const message = currentChatSession.messages.find(m => m.id === messageId);
    if (!message || !message.cachedAudioSegmentCount || message.cachedAudioSegmentCount === 0) {
        useToastStore.getState().showToast("No audio cache to reset.", "success");
        return;
    }

    const segmentCount = message.cachedAudioSegmentCount;

    // Delete audio from DB
    const deletePromises: Promise<void>[] = [];
    for (let i = 0; i < segmentCount; i++) {
        deletePromises.push(dbService.deleteAudioBuffer(`${messageId}_part_${i}`));
    }
    await Promise.all(deletePromises);

    // Update state
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;
      const updatedMessages = [...session.messages];
      const { cachedAudioBuffers, cachedAudioSegmentCount, ttsWordsPerSegmentCache, ...restOfMessage } = updatedMessages[messageIndex];
      updatedMessages[messageIndex] = restOfMessage as any;
      return { ...session, messages: updatedMessages };
    });

    const updatedSession = useActiveChatStore.getState().currentChatSession;
    if(updatedSession) {
        await updateMessages(updatedSession.id, updatedSession.messages);
    }
    useToastStore.getState().showToast("Audio cache reset for message.", "success");
  },

  reUploadAttachment: async (messageId, attachmentId) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    const { activeApiKey } = useApiKeyStore.getState();
    const logApiRequest = useGeminiApiStore.getState().logApiRequest;
    const showToast = useToastStore.getState().showToast;
    const { updateMessages } = useDataStore.getState();
    
    if (!currentChatSession || !activeApiKey?.value) return;

    let originalAttachment: Attachment | undefined;
    await updateCurrentChatSession(session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;
      const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
      if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
      originalAttachment = session.messages[messageIndex].attachments![attachmentIndex];
      const updatedAttachments = [...session.messages[messageIndex].attachments!];
      updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: true, reUploadError: undefined, statusMessage: "Re-uploading..." };
      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
      return { ...session, messages: updatedMessages };
    });

    if (!originalAttachment || !originalAttachment.base64Data || !originalAttachment.mimeType) {
      showToast("Cannot re-upload: Missing original file data.", "error");
      await updateCurrentChatSession(session => {
         if (!session) return null;
          const messageIndex = session.messages.findIndex(m => m.id === messageId);
          if (messageIndex === -1) return session;
           const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
          if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
          const updatedAttachments = [...session.messages[messageIndex].attachments!];
            updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: false, reUploadError: "Missing original file data.", statusMessage: "Re-upload failed: data missing." };
            const updatedMessages = [...session.messages];
            updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
            return { ...session, messages: updatedMessages };
      });
      return;
    }

    try {
      const fileToReUpload = base64StringToFile(originalAttachment.base64Data, originalAttachment.name, originalAttachment.mimeType);
      const uploadResult = await uploadFileViaApi(activeApiKey.value, fileToReUpload, logApiRequest);
      if (uploadResult.error || !uploadResult.fileUri || !uploadResult.fileApiName) { throw new Error(uploadResult.error || "Failed to get new file URI from API."); }

      if (originalAttachment.fileApiName) {
        try { await deleteFileViaApi(activeApiKey.value, originalAttachment.fileApiName, logApiRequest); } 
        catch (deleteError: any) { console.warn("Failed to delete old file during re-upload:", deleteError); showToast(`Old file deletion failed: ${deleteError.message}`, "error"); }
      }

      await updateCurrentChatSession(session => {
        if (!session) return null;
        const messageIndex = session.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return session;
        const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
        if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
        const updatedAttachments = [...session.messages[messageIndex].attachments!];
        updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], fileUri: uploadResult.fileUri, fileApiName: uploadResult.fileApiName, uploadState: 'completed_cloud_upload', statusMessage: 'Cloud URL refreshed.', isReUploading: false, reUploadError: undefined, error: undefined };
        const updatedMessages = [...session.messages];
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
        return { ...session, messages: updatedMessages };
      });
      
      const sessionAfterSuccess = useActiveChatStore.getState().currentChatSession;
      if (sessionAfterSuccess) {
          await updateMessages(sessionAfterSuccess.id, sessionAfterSuccess.messages);
      }

      showToast("File URL refreshed successfully!", "success");

    } catch (error: any) {
      console.error("Error re-uploading attachment:", error);
      showToast(`Re-upload failed: ${error.message || "Unknown error"}`, "error");
      await updateCurrentChatSession(session => {
        if (!session) return null;
        const messageIndex = session.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return session;
        const attachmentIndex = session.messages[messageIndex].attachments?.findIndex(a => a.id === attachmentId);
        if (attachmentIndex === undefined || attachmentIndex === -1 || !session.messages[messageIndex].attachments) return session;
        const updatedAttachments = [...session.messages[messageIndex].attachments!];
        updatedAttachments[attachmentIndex] = { ...updatedAttachments[attachmentIndex], isReUploading: false, reUploadError: error.message || "Unknown re-upload error.", statusMessage: "Re-upload failed." };
        const updatedMessages = [...session.messages];
        updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], attachments: updatedAttachments };
        return { ...session, messages: updatedMessages };
      });
    }
  },
}));
