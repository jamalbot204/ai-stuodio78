import { create } from 'zustand';
import { ChatSession, ExportConfiguration, Attachment, ChatMessage, ApiKey, UserDefinedDefaults, GeminiSettings, AICharacter, ChatMessageRole, HarmCategory, HarmBlockThreshold } from '../types.ts';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService.ts';
import { DEFAULT_EXPORT_CONFIGURATION, INITIAL_MESSAGES_COUNT, DEFAULT_SETTINGS, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { useToastStore } from './useToastStore.ts';
import { useActiveChatStore } from './useActiveChatStore';
import { useChatListStore } from './useChatListStore.ts';
import { useModalStore } from './useModalStore.ts';
import { sanitizeFilename, triggerDownload } from '../services/utils.ts';
import JSZip from 'jszip';

// Helper function to convert a base64 string to a Blob.
function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: mimeType });
}

// Helper function to convert a Blob to a base64 string.
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]); // remove the `data:...;base64,` part
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}


interface DataStoreState {
  messagesToDisplayConfig: Record<string, number>;
  currentExportConfig: ExportConfiguration;
  messageGenerationTimes: Record<string, number>;
  isExporting: boolean;
  exportProgress: number;

  // Actions
  init: () => Promise<void>;
  cleanupOnChatDelete: (chatId: string) => Promise<void>;

  // Persistence Actions
  setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  setMessageGenerationTimes: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  handleManualSave: (isSilent?: boolean) => Promise<void>;
  
  // Import/Export Actions
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  exportChatToTxt: () => void;
  handleImportAll: () => Promise<void>;

  // New Granular Persistence API
  updateTitle: (chatId: string, newTitle: string) => Promise<void>;
  updateMessages: (chatId: string, newMessages: ChatMessage[]) => Promise<void>;
  updateSettings: (chatId: string, newSettings: GeminiSettings) => Promise<void>;
  updateModel: (chatId: string, newModel: string) => Promise<void>;
  updateCharacters: (chatId: string, newCharacters: AICharacter[]) => Promise<void>;
  updateGithubContext: (chatId: string, newContext: ChatSession['githubRepoContext']) => Promise<void>;
}

const transformImportedData = async (
    importedRawData: any,
    zip: JSZip | null
  ): Promise<{
    sessions: ChatSession[],
    generationTimes: Record<string, number>,
    displayConfig: Record<string,number>,
    activeChatId?: string | null,
    exportConfiguration?: ExportConfiguration,
    apiKeys?: ApiKey[],
  }> => {
    const importedGenerationTimes: Record<string, number> =
      (importedRawData?.data?.messageGenerationTimes && typeof importedRawData.data.messageGenerationTimes === 'object')
      ? importedRawData.data.messageGenerationTimes : {};

    const importedDisplayConfig: Record<string, number> = 
      (importedRawData?.data?.messagesToDisplayConfig && typeof importedRawData.data.messagesToDisplayConfig === 'object')
      ? importedRawData.data.messagesToDisplayConfig : {};
      
    const importedExportConfig: ExportConfiguration | undefined = 
        (importedRawData?.data?.exportConfigurationUsed && typeof importedRawData.data.exportConfigurationUsed === 'object') // Check new key first
        ? { ...DEFAULT_EXPORT_CONFIGURATION, ...importedRawData.data.exportConfigurationUsed }
        : (importedRawData?.data?.exportConfiguration && typeof importedRawData.data.exportConfiguration === 'object') // Fallback for older exports
        ? { ...DEFAULT_EXPORT_CONFIGURATION, ...importedRawData.data.exportConfiguration }
        : undefined;

    const importedApiKeys: ApiKey[] | undefined =
        (importedRawData?.data?.apiKeys && Array.isArray(importedRawData.data.apiKeys))
        ? importedRawData.data.apiKeys : undefined;


    let importedActiveChatId: string | null | undefined = undefined;
    if (importedRawData?.data?.appState && Array.isArray(importedRawData.data.appState)) {
        const activeChatState = importedRawData.data.appState.find((s: any) => s.key === 'activeId');
        if (activeChatState) {
            importedActiveChatId = activeChatState.value;
        }
    } else if (importedRawData?.data?.lastActiveChatId) { // Support older single key format
        importedActiveChatId = importedRawData.data.lastActiveChatId;
    }


    if (importedRawData?.data?.chats) { 
        const audioWritePromises: Promise<void>[] = [];
        
        const sessions: ChatSession[] = await Promise.all(importedRawData.data.chats.map(async (s: any) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            lastUpdatedAt: new Date(s.lastUpdatedAt),
            messages: await Promise.all(s.messages.map(async (m: any) => {
                const importedMessage: Partial<ChatMessage> = {
                    ...m,
                    timestamp: new Date(m.timestamp),
                    groundingMetadata: m.groundingMetadata || undefined,
                    characterName: m.characterName || undefined, 
                };

                if (m.attachments && zip) {
                    importedMessage.attachments = await Promise.all(m.attachments.map(async (att: any) => {
                        const importedAttachment: Attachment = { ...att };
                        if(att.filePath) {
                            const fileInZip = zip.file(att.filePath);
                            if(fileInZip) {
                                const fileBlob = await fileInZip.async('blob');
                                const base64 = await blobToBase64(fileBlob);
                                importedAttachment.base64Data = base64;
                                importedAttachment.dataUrl = `data:${fileBlob.type};base64,${base64}`;
                            }
                        }
                        
                        if (importedAttachment.fileUri && importedAttachment.fileApiName) {
                            importedAttachment.uploadState = 'completed_cloud_upload';
                            importedAttachment.statusMessage = 'Cloud file (from import)';
                        } else if (importedAttachment.base64Data) {
                            importedAttachment.uploadState = 'completed';
                            importedAttachment.statusMessage = 'Local data (from import)';
                        } else {
                            importedAttachment.uploadState = 'error_client_read'; 
                            importedAttachment.statusMessage = 'Imported file data missing.';
                            importedAttachment.error = 'Incomplete file data from import.';
                        }
                        return importedAttachment;
                    }));
                } else {
                    importedMessage.attachments = m.attachments || undefined;
                }
                
                if (m.audioFilePaths && Array.isArray(m.audioFilePaths) && zip) {
                    const validBuffers: ArrayBuffer[] = [];
                    for (let i = 0; i < m.audioFilePaths.length; i++) {
                        const filePath = m.audioFilePaths[i];
                        const fileInZip = zip.file(filePath);
                        if (fileInZip) {
                            const buffer = await fileInZip.async('arraybuffer');
                            if (buffer) {
                                validBuffers.push(buffer);
                                audioWritePromises.push(dbService.setAudioBuffer(`${m.id}_part_${i}`, buffer));
                            }
                        }
                    }
                    if(validBuffers.length > 0) {
                        importedMessage.cachedAudioSegmentCount = validBuffers.length;
                    }
                }
                
                delete importedMessage.audioFilePaths;

                return importedMessage as ChatMessage;
            })),
            settings: {
                ...DEFAULT_SETTINGS, 
                ...s.settings,      
                safetySettings: s.settings?.safetySettings?.length ? s.settings.safetySettings : [...DEFAULT_SAFETY_SETTINGS],
                ttsSettings: s.settings?.ttsSettings || { ...DEFAULT_TTS_SETTINGS }, 
                aiSeesTimestamps: s.settings?.aiSeesTimestamps === undefined ? DEFAULT_SETTINGS.aiSeesTimestamps : s.settings.aiSeesTimestamps,
                useGoogleSearch: s.settings?.useGoogleSearch === undefined ? DEFAULT_SETTINGS.useGoogleSearch : s.settings.useGoogleSearch,
                urlContext: s.settings?.urlContext || DEFAULT_SETTINGS.urlContext || [],
                maxInitialMessagesDisplayed: s.settings?.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT,
                debugApiRequests: s.settings?.debugApiRequests === undefined ? DEFAULT_SETTINGS.debugApiRequests : s.settings.debugApiRequests,
            },
            isCharacterModeActive: s.isCharacterModeActive || false, 
            aiCharacters: (s.aiCharacters || []).map((char: any) => ({ ...char, contextualInfo: char.contextualInfo || ''})),
            apiRequestLogs: (s.apiRequestLogs || []).map((log: any) => ({
                ...log,
                timestamp: new Date(log.timestamp)
            })),                   
        })));

        await Promise.all(audioWritePromises);

        return { 
            sessions, 
            generationTimes: importedGenerationTimes, 
            displayConfig: importedDisplayConfig,
            activeChatId: importedActiveChatId,
            exportConfiguration: importedExportConfig,
            apiKeys: importedApiKeys,
        };
    }

    if (typeof importedRawData !== 'object' || importedRawData === null ) {
      console.error("Imported JSON structure is invalid.");
      return { sessions: [], generationTimes: {}, displayConfig: {}, activeChatId: null };
    }
    console.warn("Attempting to import legacy data format. Some features or data might be missing or transformed.")
    return { 
        sessions: [], 
        generationTimes: importedGenerationTimes, 
        displayConfig: importedDisplayConfig, 
        activeChatId: importedActiveChatId,
        exportConfiguration: importedExportConfig,
        apiKeys: importedApiKeys,
    };
  };

export const useDataStore = create<DataStoreState>((set, get) => ({
  messagesToDisplayConfig: {},
  currentExportConfig: DEFAULT_EXPORT_CONFIGURATION,
  messageGenerationTimes: {},
  isExporting: false,
  exportProgress: 0,

  init: async () => {
    try {
        const storedConfig = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG);
        if (storedConfig) {
            set({ messagesToDisplayConfig: storedConfig });
        }

        const storedExportConfig = await dbService.getAppMetadata<ExportConfiguration>(METADATA_KEYS.EXPORT_CONFIGURATION);
        set({ currentExportConfig: storedExportConfig || DEFAULT_EXPORT_CONFIGURATION });
        
        const storedGenTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES);
        if (storedGenTimes) {
            set({ messageGenerationTimes: storedGenTimes });
        }
    } catch (error) {
        console.error("Failed to load persisted app data:", error);
    }
  },

  setMessagesToDisplayConfig: async (updater) => {
    const newConfig = typeof updater === 'function' ? updater(get().messagesToDisplayConfig) : updater;
    set({ messagesToDisplayConfig: newConfig });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, newConfig);
  },

  setCurrentExportConfig: async (newConfig) => {
    set({ currentExportConfig: newConfig });
    await dbService.setAppMetadata(METADATA_KEYS.EXPORT_CONFIGURATION, newConfig);
  },
  
  setMessageGenerationTimes: async (updater) => {
    const newTimes = typeof updater === 'function' ? updater(get().messageGenerationTimes) : updater;
    set({ messageGenerationTimes: newTimes });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newTimes);
  },

  cleanupOnChatDelete: async (chatId) => {
    const { messageGenerationTimes, messagesToDisplayConfig } = get();
    const chatHistory = useChatListStore.getState().chatHistory;
    if (!chatHistory) return;

    const chatToDelete = chatHistory.find(s => s.id === chatId);

    const newDisplayConfig = { ...messagesToDisplayConfig };
    delete newDisplayConfig[chatId];
    set({ messagesToDisplayConfig: newDisplayConfig });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, newDisplayConfig);

    if (chatToDelete) {
        const newGenTimes = { ...messageGenerationTimes };
        chatToDelete.messages.forEach(msg => delete newGenTimes[msg.id]);
        set({ messageGenerationTimes: newGenTimes });
        await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newGenTimes);
    }
  },

  handleManualSave: async (isSilent: boolean = false) => {
    const chatHistory = useChatListStore.getState().chatHistory;
    const currentChatId = useActiveChatStore.getState().currentChatId;
    const showToast = useToastStore.getState().showToast;

    const { messageGenerationTimes, messagesToDisplayConfig, currentExportConfig } = get();

    try {
      for (const session of chatHistory) {
        await dbService.addOrUpdateChatSession(session);
      }
      if (currentChatId) {
        await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, currentChatId);
      }
      await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, messageGenerationTimes);
      await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, messagesToDisplayConfig);
      await dbService.setAppMetadata(METADATA_KEYS.EXPORT_CONFIGURATION, currentExportConfig);
      
    } catch (error) {
      console.error("Save operation failed:", error);
      if (!isSilent) {
        showToast("Failed to save app state.", "error");
      }
      // Re-throw to allow callers (like the manual save button) to handle it.
      throw error;
    }
  },
  
  handleExportChats: async (chatIdsToExport, exportConfig) => {
    if (get().isExporting) {
        useToastStore.getState().showToast("An export is already in progress.", "error");
        return;
    }
    const showToast = useToastStore.getState().showToast;
    const chatHistory = useChatListStore.getState().chatHistory;

    const sessionsToExport = chatHistory.filter(s => chatIdsToExport.includes(s.id));
    if (sessionsToExport.length === 0) {
        showToast("Selected chats could not be found.", "error");
        return;
    }

    set({ isExporting: true, exportProgress: 0 });
    showToast(`Preparing export for ${sessionsToExport.length} chat(s)...`, "success", 10000);

    try {
      const zip = new JSZip();
      const attachmentsFolder = zip.folder("attachments");
      const audioFolder = zip.folder("audio");

      const processedSessionsForJson: Partial<ChatSession>[] = [];

      for (let i = 0; i < sessionsToExport.length; i++) {
          const session = sessionsToExport[i];
          const processedSession: Partial<ChatSession> = { ...session };
          
          if (!exportConfig.includeApiLogs) delete processedSession.apiRequestLogs;

          processedSession.messages = await Promise.all(session.messages.map(async (message) => {
              const processedMessage: Partial<ChatMessage> = { ...message };
              
              if (exportConfig.includeCachedMessageAudio && message.cachedAudioSegmentCount && message.cachedAudioSegmentCount > 0) {
                  processedMessage.audioFilePaths = [];
                  for (let j = 0; j < message.cachedAudioSegmentCount; j++) {
                      const audioBuffer = await dbService.getAudioBuffer(`${message.id}_part_${j}`);
                      if (audioBuffer) {
                          const filename = `${message.id}_part_${j}.mp3`;
                          audioFolder?.file(filename, audioBuffer);
                          processedMessage.audioFilePaths.push(`audio/${filename}`);
                      }
                  }
              }
              
              delete processedMessage.cachedAudioSegmentCount;
              delete processedMessage.cachedAudioBuffers;
              if (!exportConfig.includeMessageContent) delete processedMessage.content;
              if (!exportConfig.includeMessageTimestamps) delete processedMessage.timestamp;
              if (!exportConfig.includeMessageRoleAndCharacterNames) { delete processedMessage.role; delete processedMessage.characterName; }
              if (!exportConfig.includeGroundingMetadata) delete processedMessage.groundingMetadata;
              
              if (message.attachments) {
                  if (!exportConfig.includeMessageAttachmentsMetadata) {
                      delete processedMessage.attachments;
                  } else {
                      processedMessage.attachments = message.attachments.map(att => {
                          const attachmentToExport: Partial<Attachment> = { ...att };
                          if (exportConfig.includeFullAttachmentFileData && att.base64Data) {
                              const blob = base64ToBlob(att.base64Data, att.mimeType);
                              const filename = `${att.id}-${att.name}`;
                              attachmentsFolder?.file(filename, blob);
                              attachmentToExport.filePath = `attachments/${filename}`;
                          }
                          delete attachmentToExport.base64Data;
                          delete attachmentToExport.dataUrl;
                          return attachmentToExport as Attachment;
                      });
                  }
              }
              return processedMessage as ChatMessage;
          }));
          
          if (!exportConfig.includeChatSpecificSettings) { delete processedSession.settings; delete processedSession.model; }
          if (!exportConfig.includeAiCharacterDefinitions) delete processedSession.aiCharacters;

          processedSessionsForJson.push(processedSession);
          set({ exportProgress: Math.round(((i + 1) / sessionsToExport.length) * 50) });
      }

      const exportData: any = { version: '2.0-zip', exportedAt: new Date().toISOString(), data: {} };
      if (processedSessionsForJson.length > 0) exportData.data.chats = processedSessionsForJson;
      if (exportConfig.includeLastActiveChatId) exportData.data.lastActiveChatId = useActiveChatStore.getState().currentChatId;
      if (exportConfig.includeMessageGenerationTimes) exportData.data.messageGenerationTimes = get().messageGenerationTimes;
      if (exportConfig.includeUiConfiguration) exportData.data.messagesToDisplayConfig = get().messagesToDisplayConfig;
      if (exportConfig.includeUserDefinedGlobalDefaults) exportData.data.userDefinedGlobalDefaults = await dbService.getAppMetadata<any>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS);
      if (exportConfig.includeApiKeys) exportData.data.apiKeys = await dbService.getAppMetadata<any>(METADATA_KEYS.API_KEYS);
      exportData.data.exportConfigurationUsed = exportConfig;
      
      zip.file("export.json", JSON.stringify(exportData, null, 2));

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" }, (metadata) => {
          set({ exportProgress: 50 + Math.round(metadata.percent * 0.5) });
      });

      const now = new Date();
      const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      const fileNameSuffix = chatIdsToExport.length === 1 ? `_chat-${chatIdsToExport[0].substring(0,8)}` : `_selected-chats`;
      triggerDownload(zipBlob, `gemini-chat-export-${timestamp}${fileNameSuffix}.zip`);

      showToast("Export complete!", "success");
    } catch (e: any) {
      console.error("Error during export process:", e);
      showToast(`Export failed: ${e.message}`, "error");
    } finally {
      set({ isExporting: false, exportProgress: 0 });
    }
  },

  exportChatToTxt: () => {
    const { currentChatSession } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;
    const { openFilenameInputModal } = useModalStore.getState();

    if (!currentChatSession) {
        showToast("No active chat session to export.", "error");
        return;
    }

    const defaultFilename = `${sanitizeFilename(currentChatSession.title, 50)}.txt`;

    openFilenameInputModal({
        defaultFilename,
        promptMessage: "Enter a filename for the text export:",
        onSubmit: (finalFilename) => {
            const content = currentChatSession.messages
                .filter(msg => msg.role === ChatMessageRole.USER || msg.role === ChatMessageRole.MODEL)
                .map(msg => {
                    let roleLabel = `{${msg.role}}`;
                    if (msg.role === ChatMessageRole.MODEL) {
                        roleLabel = currentChatSession.isCharacterModeActive && msg.characterName
                            ? msg.characterName
                            : '{model}';
                    }
                     if (msg.role === ChatMessageRole.USER) {
                        roleLabel = '{user}';
                    }
                    return `${roleLabel} : ${msg.content}`;
                })
                .join('\n');

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            triggerDownload(blob, finalFilename.endsWith('.txt') ? finalFilename : `${finalFilename}.txt`);
            showToast("Chat exported to text file!", "success");
        }
    });
  },

  handleImportAll: async () => {
    const showToast = useToastStore.getState().showToast;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip,application/json,application/zip';
    input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                const jsonFile = zip.file('export.json');
                if (!jsonFile) throw new Error("ZIP file is missing 'export.json'.");
                const jsonContent = await jsonFile.async('string');
                const importedRawData = JSON.parse(jsonContent);
                await processImport(importedRawData, zip);
            } else { // Assume JSON
                const text = await file.text();
                const importedRawData = JSON.parse(text);
                await processImport(importedRawData, null);
            }
        } catch (err: any) {
            showToast(`Import Failed: ${err.message || "Unknown error."}`, "error");
        }
    };
    input.click();

    async function processImport(importedRawData: any, zip: JSZip | null) {
      const { sessions, generationTimes, displayConfig, activeChatId, exportConfiguration, apiKeys } = await transformImportedData(importedRawData, zip);

      if (sessions.length === 0 && !Object.keys(generationTimes).length && !activeChatId && !Object.keys(displayConfig).length) {
        showToast("Could not import: File empty or format unrecognized.", "error");
        return;
      }

      for (const session of sessions) await dbService.addOrUpdateChatSession(session);
      const currentGenTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES) || {};
      await get().setMessageGenerationTimes({ ...currentGenTimes, ...generationTimes });

      if (importedRawData?.data?.userDefinedGlobalDefaults) await dbService.setAppMetadata<UserDefinedDefaults>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS, importedRawData.data.userDefinedGlobalDefaults);
      if (exportConfiguration) await get().setCurrentExportConfig(exportConfiguration);
      if (apiKeys) await dbService.setAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS, apiKeys);

      await useChatListStore.getState().loadChatHistory();
      const allSessionsAfterImport = useChatListStore.getState().chatHistory;

      const newDisplayConfigFromImport: Record<string, number> = {};
      allSessionsAfterImport.forEach(session => {
        newDisplayConfigFromImport[session.id] = displayConfig[session.id] !== undefined ? Math.min(session.messages.length, displayConfig[session.id]) : Math.min(session.messages.length, session.settings?.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT);
      });
      await get().setMessagesToDisplayConfig(newDisplayConfigFromImport);

      const newActiveId = activeChatId && allSessionsAfterImport.find(s => s.id === activeChatId) ? activeChatId : (allSessionsAfterImport[0]?.id || null);
      await useActiveChatStore.getState().selectChat(newActiveId);

      let toastMessage = `Import successful! ${sessions.length} session(s) processed.`;
      if (apiKeys?.length) {
        toastMessage += ` ${apiKeys.length} API key(s) processed. App will refresh.`;
        showToast(toastMessage, "success", 2500);
        setTimeout(() => window.location.reload(), 2500);
      } else {
        showToast(toastMessage, "success");
      }
    }
  },

  // New Granular Persistence API
  updateTitle: async (chatId, newTitle) => {
    try {
      await dbService.updateChatTitleInDB(chatId, newTitle);
    } catch (e) {
      console.error("Failed to update title in DB", e);
      useToastStore.getState().showToast("Failed to save title change.", "error");
    }
  },
  updateMessages: async (chatId, newMessages) => {
    try {
      await dbService.updateMessagesInDB(chatId, newMessages);
    } catch (e) {
      console.error("Failed to update messages in DB", e);
      useToastStore.getState().showToast("Failed to save message changes.", "error");
    }
  },
  updateSettings: async (chatId, newSettings) => {
    try {
      await dbService.updateSettingsInDB(chatId, newSettings);
    } catch (e) {
      console.error("Failed to update settings in DB", e);
      useToastStore.getState().showToast("Failed to save settings.", "error");
    }
  },
  updateModel: async (chatId, newModel) => {
    try {
      await dbService.updateModelInDB(chatId, newModel);
    } catch (e) {
      console.error("Failed to update model in DB", e);
      useToastStore.getState().showToast("Failed to save model change.", "error");
    }
  },
  updateCharacters: async (chatId, newCharacters) => {
    try {
      await dbService.updateCharactersInDB(chatId, newCharacters);
    } catch (e) {
      console.error("Failed to update characters in DB", e);
      useToastStore.getState().showToast("Failed to save character changes.", "error");
    }
  },
  updateGithubContext: async (chatId, newContext) => {
    try {
      await dbService.updateGithubContextInDB(chatId, newContext);
    } catch (e) {
      console.error("Failed to update GitHub context in DB", e);
      useToastStore.getState().showToast("Failed to save GitHub context.", "error");
    }
  },
}));

// Initialize store by loading data
useDataStore.getState().init();