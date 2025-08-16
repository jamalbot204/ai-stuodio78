import { create } from 'zustand';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useAudioStore } from './useAudioStore.ts';
import {
    ChatMessage, ChatMessageRole, GeminiSettings, Attachment,
    FullResponseData, UserMessageInput, LogApiRequestCallback, ApiRequestLog
} from '../types.ts';
import { getFullChatResponse, generateMimicUserResponse, mapMessagesToFlippedRoleGeminiHistory } from '../services/geminiService.ts';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/EditMessagePanel.tsx';
import { findPrecedingUserMessageIndex, getHistoryUpToMessage } from '../services/utils.ts';
import { useChatListStore } from './useChatListStore.ts';
import { MERMAID_FIX_SYSTEM_INSTRUCTION, MERMAID_FIX_SAFETY_SETTINGS } from '../constants.ts';
import { useToastStore } from './useToastStore.ts';
import { useModalStore } from './useModalStore.ts';

interface GeminiApiState {
    isLoading: boolean;
    currentGenerationTimeDisplay: string;
    lastMessageHadAttachments: boolean;
}

interface GeminiApiActions {
    logApiRequest: LogApiRequestCallback;
    handleSendMessage: (
        promptContent: string,
        attachments?: Attachment[],
        historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string,
        isTemporaryContext?: boolean
    ) => Promise<void>;
    handleContinueFlow: () => Promise<void>;
    handleCancelGeneration: () => Promise<void>;
    handleRegenerateAIMessage: (aiMessageIdToRegenerate: string) => Promise<void>;
    handleRegenerateResponseForUserMessage: (userMessageId: string) => Promise<void>;
    handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments?: Attachment[]) => Promise<void>;
    handleFixMermaidCode: (data: { messageId: string; badCode: string; fullContent: string }) => Promise<void>;
}

export const useGeminiApiStore = create<GeminiApiState & GeminiApiActions>((set, get) => {
    let generationStartTimeRef: number | null = null;
    let abortControllerRef: AbortController | null = null;
    let pendingMessageIdRef: string | null = null;
    let originalMessageSnapshotRef: ChatMessage | null = null;
    let requestCancelledByUserRef = false;
    let onFullResponseCalledForPendingMessageRef = false;
    
    let timerIntervalId: number | undefined;

    const setIsLoading = (loading: boolean) => {
        set({ isLoading: loading });
        if (loading) {
            generationStartTimeRef = Date.now();
            if (timerIntervalId) clearInterval(timerIntervalId);
            set({ currentGenerationTimeDisplay: "0.0s" });
            timerIntervalId = window.setInterval(() => {
                if (generationStartTimeRef !== null) {
                    const elapsedSeconds = (Date.now() - generationStartTimeRef) / 1000;
                    set({ currentGenerationTimeDisplay: `${elapsedSeconds.toFixed(1)}s` });
                }
            }, 100);
        } else {
            if (timerIntervalId) clearInterval(timerIntervalId);
            timerIntervalId = undefined;
            generationStartTimeRef = null;
            set({ currentGenerationTimeDisplay: "0.0s" });
        }
    };

    const logApiRequestDirectly: LogApiRequestCallback = (logDetails) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        if (currentChatSession && currentChatSession.settings.debugApiRequests) {
            const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
            updateCurrentChatSession(session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
        }
    };
    
    const handleCancelGeneration = async () => {
        const { updateCurrentChatSession } = useActiveChatStore.getState();
        const { updateMessages } = useDataStore.getState();
        if (abortControllerRef && !abortControllerRef.signal.aborted) {
            requestCancelledByUserRef = true;
            abortControllerRef.abort();
        }

        setIsLoading(false);
        set({ lastMessageHadAttachments: false });
        onFullResponseCalledForPendingMessageRef = false;
        const currentPendingMessageId = pendingMessageIdRef;
        const currentOriginalSnapshot = originalMessageSnapshotRef;

        const { currentChatSession } = useActiveChatStore.getState();
        if (currentChatSession?.id && currentPendingMessageId) {
             if (currentOriginalSnapshot && currentOriginalSnapshot.id === currentPendingMessageId) {
                await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(msg => msg.id === currentOriginalSnapshot.id ? currentOriginalSnapshot : msg)}) : null);
            } else {
                await updateCurrentChatSession(session => {
                    if (!session) return null;
                    const messageToRemove = session.messages.find(msg => msg.id === currentPendingMessageId && (msg.isStreaming || msg.content === ''));
                    if (messageToRemove) { return { ...session, messages: session.messages.filter(msg => msg.id !== currentPendingMessageId) }; }
                    return session;
                });
            }
            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionAfterUpdate) {
                await updateMessages(sessionAfterUpdate.id, sessionAfterUpdate.messages);
            }
        }
        pendingMessageIdRef = null;
        originalMessageSnapshotRef = null;
    };

    const handleSendMessage = async (
        promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string, isTemporaryContext?: boolean
      ) => {
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();

        if (!currentChatSession || get().isLoading) return;
        if (!activeApiKey?.value) {
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const errorMessage: ChatMessage = {
                    id: `err-${Date.now()}`,
                    role: ChatMessageRole.ERROR,
                    content: "No API key set. Please go to Settings > API Key to set your key.",
                    timestamp: new Date(),
                };
                return { ...session, messages: [...session.messages, errorMessage] };
            });
            const sessionAfterError = useActiveChatStore.getState().currentChatSession;
            if(sessionAfterError) await updateMessages(sessionAfterError.id, sessionAfterError.messages);
            return;
        }

        await rotateActiveKey();
    
        requestCancelledByUserRef = false;
        onFullResponseCalledForPendingMessageRef = false;
        if (!isTemporaryContext) {
            originalMessageSnapshotRef = null;
        }
        set({lastMessageHadAttachments: !!(attachments && attachments.length > 0 && !isTemporaryContext)});
    
        let sessionToUpdate = { ...currentChatSession };
        let baseSettingsForAPICall = { ...currentChatSession.settings };
        let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
        let characterNameForResponse: string | undefined = undefined;
        let userMessageIdForPotentialTitleUpdate: string | null = null;
    
        if (currentChatSession.isCharacterModeActive && characterIdForAPICall) {
            const character = (currentChatSession.aiCharacters || []).find(c => c.id === characterIdForAPICall);
            if (character) {
                settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
                settingsOverrideForAPICall.userPersonaInstruction = undefined;
                settingsOverrideForAPICall._characterIdForAPICall = character.id;
                characterNameForResponse = character.name;
            } else { return; }
        }
    
        let finalUserMessageInputForAPI: UserMessageInput;
        if (currentChatSession.isCharacterModeActive && characterIdForAPICall && !promptContent.trim() && (!attachments || attachments.length === 0) && !historyContextOverride) {
            const characterTriggered = (currentChatSession.aiCharacters || []).find(c => c.id === characterIdForAPICall);
            finalUserMessageInputForAPI = (characterTriggered?.contextualInfo?.trim()) ? { text: characterTriggered.contextualInfo, attachments: [] } : { text: "", attachments: [] };
        } else {
            finalUserMessageInputForAPI = { text: promptContent, attachments: attachments || [] };
        }
    
        if (!characterIdForAPICall && !historyContextOverride && !finalUserMessageInputForAPI.text.trim() && (!finalUserMessageInputForAPI.attachments || finalUserMessageInputForAPI.attachments.length === 0) && !currentChatSession.githubRepoContext) return;
    
        let historyForGeminiSDK: ChatMessage[] = historyContextOverride ? [...historyContextOverride] : [...sessionToUpdate.messages];
    
        let currentTurnUserMessageForUI: ChatMessage | null = null;
        if (!isTemporaryContext) {
            currentTurnUserMessageForUI = { id: `msg-${Date.now()}-user-turn-${Math.random().toString(36).substring(2,7)}`, role: ChatMessageRole.USER, content: finalUserMessageInputForAPI.text, attachments: finalUserMessageInputForAPI.attachments?.map(att => ({...att})), timestamp: new Date() };
            userMessageIdForPotentialTitleUpdate = currentTurnUserMessageForUI.id;
        }
    
        setIsLoading(true);
        abortControllerRef = new AbortController();
    
        const modelMessageId = pendingMessageIdRef || `msg-${Date.now()}-model-${Math.random().toString(36).substring(2,7)}`;
        pendingMessageIdRef = modelMessageId;
        const placeholderAiMessage: ChatMessage = { id: modelMessageId, role: ChatMessageRole.MODEL, content: '', timestamp: new Date(), isStreaming: true, characterName: characterNameForResponse };
    
        let messagesForUIUpdate: ChatMessage[] = [...historyForGeminiSDK];
        if (currentTurnUserMessageForUI) messagesForUIUpdate.push(currentTurnUserMessageForUI);
        
        const existingMessageIndex = messagesForUIUpdate.findIndex(m => m.id === modelMessageId);
        if (existingMessageIndex > -1) {
            messagesForUIUpdate[existingMessageIndex] = placeholderAiMessage;
        } else {
            messagesForUIUpdate.push(placeholderAiMessage);
        }
    
        let newTitleForSession = sessionToUpdate.title;
        if (userMessageIdForPotentialTitleUpdate && sessionToUpdate.title === "New Chat") {
            const userMessagesInHistory = historyForGeminiSDK.filter(m => m.role === ChatMessageRole.USER).length;
            if (userMessagesInHistory === 0) {
                 newTitleForSession = (finalUserMessageInputForAPI.text || "Chat with attachments").substring(0, 35) + ((finalUserMessageInputForAPI.text.length > 35 || (!finalUserMessageInputForAPI.text && finalUserMessageInputForAPI.attachments && finalUserMessageInputForAPI.attachments.length > 0)) ? "..." : "");
            }
        }
    
        await updateCurrentChatSession(s => s ? ({ ...s, messages: messagesForUIUpdate, lastUpdatedAt: new Date(), title: newTitleForSession }) : null);
        
        const sessionAfterUIMessageUpdate = useActiveChatStore.getState().currentChatSession;
        if (sessionAfterUIMessageUpdate) {
            await updateMessages(sessionAfterUIMessageUpdate.id, sessionAfterUIMessageUpdate.messages);
        }

        const activeChatIdForThisCall = currentChatSession.id;
    
        await getFullChatResponse(
            activeApiKey?.value || '', activeChatIdForThisCall, finalUserMessageInputForAPI, currentChatSession.model, baseSettingsForAPICall,
            historyForGeminiSDK,
            async (responseData: FullResponseData) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) return;
                onFullResponseCalledForPendingMessageRef = true;
                if (generationStartTimeRef) await setMessageGenerationTimes(prev => ({...prev, [modelMessageId]: (Date.now() - (generationStartTimeRef || 0)) / 1000}));
                
                const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisCall);
                if (!sessionToUpdate) {
                    console.warn(`[GeminiStore] Session ${activeChatIdForThisCall} not found in master list for background update.`);
                    return;
                }

                const originalMessageSnapshot = originalMessageSnapshotRef;
                let finalContent = responseData.text;
                if(originalMessageSnapshot && originalMessageSnapshot.id === modelMessageId && isTemporaryContext) {
                    finalContent = originalMessageSnapshot.content + responseData.text;
                }
                const newAiMessage: ChatMessage = { ...placeholderAiMessage, content: finalContent, groundingMetadata: responseData.groundingMetadata, isStreaming: false, timestamp: new Date(), characterName: characterNameForResponse };

                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === modelMessageId ? newAiMessage : msg);
                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };

                updateChatSessionInList(updatedSession);
                await updateMessages(updatedSession.id, updatedSession.messages);

                const { triggerAutoPlayForNewMessage } = useAudioStore.getState();
                await triggerAutoPlayForNewMessage(newAiMessage);
            },
            async (errorMsg, isAbortError) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) { setIsLoading(false); set({ lastMessageHadAttachments: false }); return; }
                onFullResponseCalledForPendingMessageRef = false;
                const finalErrorMessage = isAbortError ? `Response aborted.` : `Response failed: ${errorMsg}`;

                const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisCall);
                if (!sessionToUpdate) {
                    console.warn(`[GeminiStore] Session ${activeChatIdForThisCall} not found in master list for error update.`);
                    return;
                }

                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === modelMessageId ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: finalErrorMessage, characterName: characterNameForResponse } : msg);
                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };

                updateChatSessionInList(updatedSession);
                await updateMessages(updatedSession.id, updatedSession.messages);

                if (!requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) { setIsLoading(false); set({ lastMessageHadAttachments: false }); }
            },
            async () => {
                const userDidCancel = requestCancelledByUserRef;
                const currentPendingMsgIdForComplete = pendingMessageIdRef;
                if (userDidCancel && currentPendingMsgIdForComplete === modelMessageId) {}
                else if (currentPendingMsgIdForComplete === modelMessageId) {
                    setIsLoading(false); set({ lastMessageHadAttachments: false });
                    if (!onFullResponseCalledForPendingMessageRef) {
                        const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                        const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisCall);
                        if (sessionToUpdate) {
                            const messageInState = sessionToUpdate.messages.find(m => m.id === modelMessageId);
                            if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) {
                                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === modelMessageId ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date(), characterName: characterNameForResponse } : msg);
                                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };
                                updateChatSessionInList(updatedSession);
                                await updateMessages(updatedSession.id, updatedSession.messages);
                            } else {
                                const updatedSession = { ...sessionToUpdate, lastUpdatedAt: new Date() };
                                updateChatSessionInList(updatedSession);
                            }
                        }
                    } else {
                        const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                        const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisCall);
                        if (sessionToUpdate) {
                            const updatedSession = { ...sessionToUpdate, lastUpdatedAt: new Date() };
                            updateChatSessionInList(updatedSession);
                        }
                    }
                    pendingMessageIdRef = null; originalMessageSnapshotRef = null;
                }
                if (abortControllerRef && currentPendingMsgIdForComplete === modelMessageId) abortControllerRef = null;
                if (currentPendingMsgIdForComplete === modelMessageId) requestCancelledByUserRef = false;
                onFullResponseCalledForPendingMessageRef = false;
            },
            logApiRequestDirectly, abortControllerRef.signal, settingsOverrideForAPICall,
            currentChatSession.aiCharacters
        );
      };

    const handleContinueFlow = async () => {
        const { currentChatSession } = useActiveChatStore.getState();
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { updateMessages } = useDataStore.getState();

        if (!currentChatSession || get().isLoading || currentChatSession.isCharacterModeActive) return;
        if (currentChatSession.messages.length === 0) return;

        await rotateActiveKey();
        requestCancelledByUserRef = false;
        
        const { settings, model, messages } = currentChatSession;
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === ChatMessageRole.MODEL) {
            setIsLoading(true);
            abortControllerRef = new AbortController();
            try {
                const historyForMimic = mapMessagesToFlippedRoleGeminiHistory(messages, settings);
                const mimicContent = await generateMimicUserResponse(
                    activeApiKey?.value || '', model, historyForMimic, settings.userPersonaInstruction || '',
                    settings, logApiRequestDirectly, abortControllerRef.signal
                );
                if (requestCancelledByUserRef) return;
                setIsLoading(false); // Mimic complete, now send as user
                await get().handleSendMessage(mimicContent, [], messages);

            } catch (error: any) {
                console.error("Error during Continue Flow (user mimic):", error);
                const errorMessage = `Flow generation failed: ${error.message}`;
                await useActiveChatStore.getState().updateCurrentChatSession(session => session ? ({ ...session, messages: [...session.messages, {id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: errorMessage, timestamp: new Date()}]}) : null);
                const sessionAfterError = useActiveChatStore.getState().currentChatSession;
                if (sessionAfterError) await updateMessages(sessionAfterError.id, sessionAfterError.messages);
                setIsLoading(false);
            }
        } else {
            await get().handleSendMessage('', [], messages);
        }
    };

    const handleRegenerateAIMessage = async (aiMessageIdToRegenerate: string) => {
        const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { setMessageGenerationTimes, updateMessages } = useDataStore.getState();

        if (!currentChatSession || get().isLoading) return;
        if (!activeApiKey?.value) {
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const errorMessage: ChatMessage = { id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: "No API key set. Please go to Settings > API Key to set your key.", timestamp: new Date() };
                return { ...session, messages: [...session.messages, errorMessage] };
            });
            const sessionAfterError = useActiveChatStore.getState().currentChatSession;
            if(sessionAfterError) await updateMessages(sessionAfterError.id, sessionAfterError.messages);
            return;
        }

        const messageIndex = currentChatSession.messages.findIndex(m => m.id === aiMessageIdToRegenerate);
        if (messageIndex === -1) return;
        
        const originalAiMessage = currentChatSession.messages[messageIndex];
        if (originalAiMessage.role !== ChatMessageRole.MODEL && originalAiMessage.role !== ChatMessageRole.ERROR) return;

        const precedingUserMessageIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageIndex);
        if (precedingUserMessageIndex === -1) return;

        const userMessage = currentChatSession.messages[precedingUserMessageIndex];
        const historyForGeminiSDK = getHistoryUpToMessage(currentChatSession.messages, precedingUserMessageIndex);
        
        await rotateActiveKey();
        requestCancelledByUserRef = false;
        onFullResponseCalledForPendingMessageRef = false;
        originalMessageSnapshotRef = null;
        
        setIsLoading(true);
        abortControllerRef = new AbortController();
        pendingMessageIdRef = aiMessageIdToRegenerate;

        const placeholderAiMessage: ChatMessage = { 
            ...originalAiMessage,
            content: '', 
            timestamp: new Date(), 
            isStreaming: true, 
            role: ChatMessageRole.MODEL,
            cachedAudioBuffers: null, 
            groundingMetadata: undefined 
        };

        await updateCurrentChatSession(session => {
            if (!session) return null;
            const newMessages = session.messages.map(msg => 
                msg.id === aiMessageIdToRegenerate ? placeholderAiMessage : msg
            );
            return { ...session, messages: newMessages };
        });
        
        const sessionAfterPlaceholder = useActiveChatStore.getState().currentChatSession;
        if (sessionAfterPlaceholder) await updateMessages(sessionAfterPlaceholder.id, sessionAfterPlaceholder.messages);

        const finalUserMessageInputForAPI: UserMessageInput = { text: userMessage.content, attachments: userMessage.attachments || [] };
        const baseSettingsForAPICall = { ...currentChatSession.settings };
        let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
        if (currentChatSession.isCharacterModeActive && originalAiMessage.characterName) {
            const character = (currentChatSession.aiCharacters || []).find(c => c.name === originalAiMessage.characterName);
            if (character) {
                settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
                settingsOverrideForAPICall.userPersonaInstruction = undefined;
                settingsOverrideForAPICall._characterIdForAPICall = character.id;
            }
        }
        
        const activeChatIdForThisRegenCall = currentChatSession.id;

        await getFullChatResponse(
            activeApiKey?.value || '', 
            activeChatIdForThisRegenCall, 
            finalUserMessageInputForAPI, 
            currentChatSession.model, 
            baseSettingsForAPICall,
            historyForGeminiSDK,
            async (responseData: FullResponseData) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) return;
                onFullResponseCalledForPendingMessageRef = true;
                if (generationStartTimeRef) await setMessageGenerationTimes(prev => ({...prev, [aiMessageIdToRegenerate]: (Date.now() - (generationStartTimeRef || 0)) / 1000}));
                
                const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisRegenCall);
                if (!sessionToUpdate) return;

                const newAiMessage: ChatMessage = { 
                    ...placeholderAiMessage, 
                    content: responseData.text, 
                    groundingMetadata: responseData.groundingMetadata, 
                    isStreaming: false, 
                    timestamp: new Date(), 
                };
                
                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === aiMessageIdToRegenerate ? newAiMessage : msg);
                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };
                
                updateChatSessionInList(updatedSession);
                await updateMessages(updatedSession.id, updatedSession.messages);

                const { triggerAutoPlayForNewMessage } = useAudioStore.getState();
                await triggerAutoPlayForNewMessage(newAiMessage);
            },
            async (errorMsg, isAbortError) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) { setIsLoading(false); return; }
                onFullResponseCalledForPendingMessageRef = false;
                const finalErrorMessage = isAbortError ? `Response aborted.` : `Response failed: ${errorMsg}`;

                const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisRegenCall);
                if (!sessionToUpdate) return;
                
                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === aiMessageIdToRegenerate ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: finalErrorMessage } : msg);
                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };

                updateChatSessionInList(updatedSession);
                await updateMessages(updatedSession.id, updatedSession.messages);

                if (!requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) { setIsLoading(false); }
            },
            async () => {
                const userDidCancel = requestCancelledByUserRef;
                const currentPendingMsgIdForComplete = pendingMessageIdRef;
                if (userDidCancel && currentPendingMsgIdForComplete === aiMessageIdToRegenerate) {}
                else if (currentPendingMsgIdForComplete === aiMessageIdToRegenerate) {
                    setIsLoading(false);
                    if (!onFullResponseCalledForPendingMessageRef) {
                        const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                        const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisRegenCall);
                        if (sessionToUpdate) {
                            const messageInState = sessionToUpdate.messages.find(m => m.id === aiMessageIdToRegenerate);
                            if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) {
                                const updatedMessages = sessionToUpdate.messages.map(msg => msg.id === aiMessageIdToRegenerate ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date() } : msg );
                                const updatedSession = { ...sessionToUpdate, messages: updatedMessages, lastUpdatedAt: new Date() };
                                updateChatSessionInList(updatedSession);
                                await updateMessages(updatedSession.id, updatedSession.messages);
                            } else {
                                const updatedSession = { ...sessionToUpdate, lastUpdatedAt: new Date() };
                                updateChatSessionInList(updatedSession);
                            }
                        }
                    } else {
                        const { updateChatSessionInList, chatHistory } = useChatListStore.getState();
                        const sessionToUpdate = chatHistory.find(s => s.id === activeChatIdForThisRegenCall);
                        if(sessionToUpdate) {
                            const updatedSession = { ...sessionToUpdate, lastUpdatedAt: new Date() };
                            updateChatSessionInList(updatedSession);
                        }
                    }
                    pendingMessageIdRef = null;
                }
                if (abortControllerRef && currentPendingMsgIdForComplete === aiMessageIdToRegenerate) abortControllerRef = null;
                if (currentPendingMsgIdForComplete === aiMessageIdToRegenerate) requestCancelledByUserRef = false;
                onFullResponseCalledForPendingMessageRef = false;
            },
            logApiRequestDirectly, 
            abortControllerRef.signal, 
            settingsOverrideForAPICall,
            currentChatSession.aiCharacters
        );
    };

    const handleRegenerateResponseForUserMessage = async (userMessageId: string) => {
        const { currentChatSession } = useActiveChatStore.getState();
        if (!currentChatSession || get().isLoading) return;

        const userMessageIndex = currentChatSession.messages.findIndex(m => m.id === userMessageId);
        if (userMessageIndex === -1 || userMessageIndex + 1 >= currentChatSession.messages.length) return;

        const aiMessageToRegenerate = currentChatSession.messages[userMessageIndex + 1];
        if (aiMessageToRegenerate.role !== ChatMessageRole.MODEL && aiMessageToRegenerate.role !== ChatMessageRole.ERROR) return;

        await handleRegenerateAIMessage(aiMessageToRegenerate.id);
    };

    const handleEditPanelSubmit = async (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails, newAttachments: Attachment[] = []) => {
        const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
        const { updateMessages } = useDataStore.getState();
        const { messageId } = editingMessageDetail;
        if(!currentChatSession) return;
        
        const messageIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;
        
        const originalMessage = currentChatSession.messages[messageIndex];
        const combinedAttachments = [...(originalMessage.attachments || []), ...newAttachments];

        if (action === EditMessagePanelAction.SAVE_AND_SUBMIT) {
            const updatedUserMessage = { ...originalMessage, content: newContent, attachments: combinedAttachments, cachedAudioBuffers: null };
            const historyBeforeEdit = currentChatSession.messages.slice(0, messageIndex);
            
            await updateCurrentChatSession(session => session ? ({...session, messages: [...historyBeforeEdit, updatedUserMessage]}) : null);
            
            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionAfterUpdate) await updateMessages(sessionAfterUpdate.id, sessionAfterUpdate.messages);

            if(sessionAfterUpdate) {
                await get().handleSendMessage(newContent, updatedUserMessage.attachments, historyBeforeEdit);
            }

        } else if (action === EditMessagePanelAction.CONTINUE_PREFIX) {
            const messageWithNewContent = { ...originalMessage, content: newContent, attachments: combinedAttachments, isStreaming: false, cachedAudioBuffers: null };
            const historyContext = getHistoryUpToMessage(currentChatSession.messages, messageIndex);
            
            pendingMessageIdRef = messageId;
            originalMessageSnapshotRef = messageWithNewContent;

            await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(m => m.id === messageId ? {...messageWithNewContent, isStreaming: true} : m)}) : null);
            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionAfterUpdate) await updateMessages(sessionAfterUpdate.id, sessionAfterUpdate.messages);

            await get().handleSendMessage(
                newContent, combinedAttachments, historyContext, undefined, true
            );
        } else if (action === EditMessagePanelAction.SAVE_LOCALLY) {
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const newMessages = session.messages.map(msg => 
                    msg.id === messageId ? { ...msg, content: newContent, attachments: combinedAttachments, cachedAudioBuffers: null } : msg
                );
                return { ...session, messages: newMessages };
            });
            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if (sessionAfterUpdate) await updateMessages(sessionAfterUpdate.id, sessionAfterUpdate.messages);
        }
    };

    return {
        isLoading: false, currentGenerationTimeDisplay: "0.0s", lastMessageHadAttachments: false,
        logApiRequest: logApiRequestDirectly,
        handleCancelGeneration,
        handleSendMessage,
        handleContinueFlow,
        handleRegenerateAIMessage,
        handleRegenerateResponseForUserMessage,
        handleEditPanelSubmit,
        handleFixMermaidCode: async (data) => {
            const { messageId, badCode, fullContent } = data;
            const { activeApiKey, rotateActiveKey } = useApiKeyStore.getState();
            const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
            const { updateMessages } = useDataStore.getState();
            const { openMermaidModal } = useModalStore.getState();
            const { showToast } = useToastStore.getState();
    
            if (!currentChatSession || !activeApiKey?.value) {
                showToast("Cannot fix: No active session or API key.", "error");
                return;
            }
    
            await rotateActiveKey();
            const apiKey = useApiKeyStore.getState().activeApiKey?.value;
            if (!apiKey) {
                showToast("Cannot fix: No active API key after rotation.", "error");
                return;
            }
    
            try {
                const { GoogleGenAI } = await import('@google/genai');
                const ai = new GoogleGenAI({ apiKey });
    
                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: badCode }] }],
                    config: {
                        systemInstruction: MERMAID_FIX_SYSTEM_INSTRUCTION,
                        temperature: 0.1,
                        topP: 0.95,
                        topK: 64,
                        safetySettings: MERMAID_FIX_SAFETY_SETTINGS,
                    },
                });
    
                const responseText = result.text;
                if (!responseText) {
                    throw new Error("AI returned an empty response.");
                }
    
                const codeBlockRegex = /```mermaid\n([\s\S]*?)\n```/;
                const match = responseText.match(codeBlockRegex);
                const fixedCode = match ? match[1].trim() : responseText.trim();
    
                if (!fixedCode) {
                     throw new Error("AI response could not be parsed into a code block.");
                }
    
                const newContent = fullContent.replace(badCode, fixedCode);
    
                await updateCurrentChatSession(session => {
                    if (!session) return null;
                    const newMessages = session.messages.map(msg =>
                        msg.id === messageId ? { ...msg, content: newContent } : msg
                    );
                    return { ...session, messages: newMessages };
                });
    
                const updatedSession = useActiveChatStore.getState().currentChatSession;
                if (updatedSession) {
                    await updateMessages(updatedSession.id, updatedSession.messages);
                }
    
                openMermaidModal({
                    code: fixedCode,
                    messageId: messageId,
                    fullContent: newContent,
                });
    
                showToast("Mermaid diagram fixed by AI!", "success");
    
            } catch (error: any) {
                console.error("AI fix failed:", error);
                showToast(`AI fix failed: ${error.message}`, "error");
            }
        },
    };
});
