import { ChatSession, GeminiSettings, ChatMessage, AICharacter } from '../types.ts'; 
import { USER_DEFINED_GLOBAL_DEFAULTS_KEY } from '../constants.ts';

const DB_NAME = 'GeminiChatDB';
const DB_VERSION = 2; 
const CHAT_SESSIONS_STORE = 'chatSessions';
const APP_METADATA_STORE = 'appMetadata';
const AUDIO_CACHE_STORE = 'audioCache';

// Helper function to strip runtime-only properties from a message before persistence.
const stripRuntimeMessageProperties = (message: ChatMessage): ChatMessage => {
    // This creates a new object, omitting the cachedAudioBuffers property.
    // This property is used for runtime audio caching but should not be persisted in the database,
    // as audio data is stored in the 'audioCache' object store.
    const { cachedAudioBuffers, ...restOfMessage } = message;
    return restOfMessage;
};

interface AppMetadataValue {
    key: string;
    value: any;
}

let dbInstance: IDBDatabase | null = null;
let openingPromise: Promise<IDBDatabase> | null = null; // Manages the promise for the database opening process

function openDB(): Promise<IDBDatabase> {
    // 1. If we have a valid, open instance, reuse it.
    // A simple check for validity could be checking if objectStoreNames are available.
    if (dbInstance && dbInstance.objectStoreNames.length > 0) { 
        return Promise.resolve(dbInstance);
    }

    // 2. If an opening operation is already in progress, return its promise.
    // This prevents multiple concurrent open attempts.
    if (openingPromise) {
        return openingPromise;
    }

    // 3. Otherwise, start a new opening operation.
    openingPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const db = request.result;
            const oldVersion = event.oldVersion;
            
            if (oldVersion < 1) { // Handles initial DB creation
                if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
                    const sessionStore = db.createObjectStore(CHAT_SESSIONS_STORE, { keyPath: 'id' });
                    sessionStore.createIndex('lastUpdatedAt', 'lastUpdatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
                    db.createObjectStore(APP_METADATA_STORE, { keyPath: 'key' });
                }
            }

            if (oldVersion < 2) { // Migration from v1 to v2
                if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
                    db.createObjectStore(AUDIO_CACHE_STORE);
                }

                // Data migration logic
                const transaction = request.transaction;
                if (!transaction) return;
                const sessionStore = transaction.objectStore(CHAT_SESSIONS_STORE);
                const audioStore = transaction.objectStore(AUDIO_CACHE_STORE);
                
                sessionStore.getAll().onsuccess = (getAllEvent) => {
                    const sessions: ChatSession[] = (getAllEvent.target as IDBRequest<ChatSession[]>).result;
                    sessions.forEach(session => {
                        let sessionModified = false;
                        const updatedMessages = session.messages.map(message => {
                            const msgWithBuffers = message as any; // Allow access to old property for migration
                            if (msgWithBuffers.cachedAudioBuffers && Array.isArray(msgWithBuffers.cachedAudioBuffers)) {
                                const buffersToMigrate = msgWithBuffers.cachedAudioBuffers.filter((b: any) => b instanceof ArrayBuffer);
                                if (buffersToMigrate.length > 0) {
                                    buffersToMigrate.forEach((buffer: ArrayBuffer, index: number) => {
                                        const key = `${message.id}_part_${index}`;
                                        audioStore.put(buffer, key);
                                    });

                                    // Create a new message object without the old property and with the new one
                                    const newMessage: Partial<ChatMessage> & { cachedAudioBuffers?: any } = { ...message };
                                    newMessage.cachedAudioSegmentCount = buffersToMigrate.length;
                                    delete newMessage.cachedAudioBuffers;
                                    
                                    sessionModified = true;
                                    return newMessage as ChatMessage;
                                }
                            }
                            return message;
                        });

                        if (sessionModified) {
                            session.messages = updatedMessages;
                            sessionStore.put(session); // Put the modified session back into the store
                        }
                    });
                };
            }
        };

        request.onsuccess = () => {
            dbInstance = request.result;
            dbInstance.onclose = () => { // Handle connection close (e.g., browser closes DB)
                console.warn("IndexedDB connection closed.");
                dbInstance = null;
                openingPromise = null; // Allow re-opening by clearing the current promise
            };
            dbInstance.onversionchange = () => { // Handle version change from another tab
                console.warn("IndexedDB version change detected from another tab. Closing this connection.");
                if(dbInstance) {
                    dbInstance.close(); // This will trigger the 'onclose' handler above
                }
            };
            resolve(dbInstance);
            // Note: openingPromise remains set to this resolved promise.
            // It will be cleared if the DB connection closes (see onclose).
        };

        request.onerror = (_event) => {
            console.error('IndexedDB open error:', request.error);
            openingPromise = null; // Clear promise on error to allow retry
            reject(request.error);
        };

        request.onblocked = () => {
            console.warn('IndexedDB open is blocked. This usually means other tabs are holding an older version of the DB open. Please close them and refresh if issues persist.');
            // Reject the promise to prevent the app from hanging
            reject(new Error('Database open request was blocked. Please close other tabs with this app open and refresh.'));
        };
    });
    return openingPromise;
}

export async function getAudioBuffer(key: string): Promise<ArrayBuffer | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            return reject(new Error(`Object store ${AUDIO_CACHE_STORE} not found.`));
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readonly');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function setAudioBuffer(key: string, buffer: ArrayBuffer): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            return reject(new Error(`Object store ${AUDIO_CACHE_STORE} not found.`));
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readwrite');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        store.put(buffer, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function deleteAudioBuffer(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
            // It's not an error if the store doesn't exist on delete, just means there's nothing to delete.
            return resolve();
        }
        const transaction = db.transaction(AUDIO_CACHE_STORE, 'readwrite');
        const store = transaction.objectStore(AUDIO_CACHE_STORE);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getChatSession(id: string): Promise<ChatSession | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllChatSessions(): Promise<ChatSession[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
         if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return resolve([]); 
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readonly');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()));
        request.onerror = () => reject(request.error);
    });
}

export async function addOrUpdateChatSession(session: ChatSession): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);

        const sessionToStore = {
            ...session,
            messages: session.messages.map(stripRuntimeMessageProperties)
        };
        const request = store.put(sessionToStore);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => { // More specific error handling for the request itself
            console.error("Error during addOrUpdateChatSession put request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function deleteChatSession(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.delete(id); 
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => {
            console.error("Error during deleteChatSession delete request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function getAppMetadata<T>(key: string): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return resolve(undefined); 
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readonly');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.get(key);
        request.onsuccess = () => {
            resolve(request.result ? (request.result as AppMetadataValue).value : undefined);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function setAppMetadata<T>(key: string, value: T): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return reject(new Error(`Object store ${APP_METADATA_STORE} not found.`));
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readwrite');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.put({ key, value });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        request.onerror = (event) => {
            console.error("Error during setAppMetadata put request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function deleteAppMetadata(key: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(APP_METADATA_STORE)) {
            return reject(new Error(`Object store ${APP_METADATA_STORE} not found.`));
        }
        const transaction = db.transaction(APP_METADATA_STORE, 'readwrite');
        const store = transaction.objectStore(APP_METADATA_STORE);
        const request = store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
         request.onerror = (event) => {
            console.error("Error during deleteAppMetadata delete request:", (event.target as IDBRequest).error);
            reject((event.target as IDBRequest).error);
        };
    });
}

export async function clearAllChatData(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE) || !db.objectStoreNames.contains(APP_METADATA_STORE)) {
            console.warn("Attempted to clear data, but one or more object stores do not exist.");
            return resolve(); 
        }
        const transaction = db.transaction([CHAT_SESSIONS_STORE, APP_METADATA_STORE], 'readwrite');
        const sessionStore = transaction.objectStore(CHAT_SESSIONS_STORE);
        const metadataStore = transaction.objectStore(APP_METADATA_STORE);
        
        const sessionClearRequest = sessionStore.clear(); 
        const metadataClearRequest = metadataStore.clear();

        let completedRequests = 0;
        const totalRequests = 2;

        const checkCompletion = () => {
            completedRequests++;
            if (completedRequests === totalRequests) {
                // This will be handled by transaction.oncomplete
            }
        };
        
        sessionClearRequest.onsuccess = checkCompletion;
        sessionClearRequest.onerror = (event) => {
            console.error("Error clearing session store:", (event.target as IDBRequest).error);
            // No explicit reject here, transaction.onerror will handle it
        };

        metadataClearRequest.onsuccess = checkCompletion;
        metadataClearRequest.onerror = (event) => {
            console.error("Error clearing metadata store:", (event.target as IDBRequest).error);
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
            console.error("Error during clearAllChatData transaction:", transaction.error);
            reject(transaction.error);
        };
    });
}

// Keys for AppMetadata store
export const METADATA_KEYS = {
    ACTIVE_CHAT_ID: 'activeChatId',
    MESSAGE_GENERATION_TIMES: 'messageGenerationTimes',
    MESSAGES_TO_DISPLAY_CONFIG: 'messagesToDisplayConfig',
    USER_DEFINED_GLOBAL_DEFAULTS: USER_DEFINED_GLOBAL_DEFAULTS_KEY,
    EXPORT_CONFIGURATION: 'exportConfiguration', // New key for export settings
    API_KEYS: 'apiKeys', // For storing user-managed API keys
    API_KEY_ROTATION: 'apiKeyRotationEnabled',
};


// Phase 1: New Granular Database Functions

async function getAndUpdateSession(chatId: string, updateFn: (session: ChatSession) => ChatSession, updateTimestamp: boolean = true): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(CHAT_SESSIONS_STORE)) {
            return reject(new Error(`Object store ${CHAT_SESSIONS_STORE} not found.`));
        }
        const transaction = db.transaction(CHAT_SESSIONS_STORE, 'readwrite');
        const store = transaction.objectStore(CHAT_SESSIONS_STORE);
        const request = store.get(chatId);

        request.onsuccess = () => {
            const session = request.result;
            if (session) {
                let updatedSession = updateFn(session);
                if (updateTimestamp) {
                    updatedSession = { ...updatedSession, lastUpdatedAt: new Date() };
                }
                
                const sessionToStore = {
                    ...updatedSession,
                    messages: updatedSession.messages.map(stripRuntimeMessageProperties)
                };

                const putRequest = store.put(sessionToStore);
                putRequest.onerror = (event) => reject((event.target as IDBRequest).error);
            } else {
                console.warn(`Session with id ${chatId} not found for update.`);
            }
        };
        request.onerror = () => reject(request.error);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function updateChatTitleInDB(chatId: string, newTitle: string): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, title: newTitle }));
}

export async function updateMessagesInDB(chatId: string, newMessages: ChatMessage[]): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, messages: newMessages }));
}

export async function updateSettingsInDB(chatId: string, newSettings: GeminiSettings): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, settings: newSettings }));
}

export async function updateModelInDB(chatId: string, newModel: string): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, model: newModel }));
}

export async function updateCharactersInDB(chatId: string, newCharacters: AICharacter[]): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, aiCharacters: newCharacters }));
}

export async function updateGithubContextInDB(chatId: string, newContext: ChatSession['githubRepoContext']): Promise<void> {
    return getAndUpdateSession(chatId, (session) => ({ ...session, githubRepoContext: newContext }));
}
