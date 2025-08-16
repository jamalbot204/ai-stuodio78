
import { GeminiSettings, SafetySetting, HarmCategory, HarmBlockThreshold, TTSSettings, TTSModelId, TTSVoiceId, ExportConfiguration } from './types.ts';

export const APP_TITLE = "Gemini Chat Interface"; // Matches screenshot

// Updated MODEL_DEFINITIONS to include newer models from AI Studio screenshots
// while staying within the Gemini family focus.
export const MODEL_DEFINITIONS = [
  { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash Preview 04-17' },
  { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview 05-20' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash(NEW)' },
  { id: 'gemini-2.5-flash-lite-preview-06-17', name: 'Gemini 2.5 Flash Lite Preview 06-17' },
  { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro Preview 05-06' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro(NEW)' },
  { id: 'learnlm-2.0-flash-experimental', name: 'learn LM 2.0 Flash Experimental' },
];

export const DEFAULT_MODEL_ID = 'gemini-2.5-pro'; // Keeping this as the default per initial guidelines

export const DEFAULT_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export const INITIAL_MESSAGES_COUNT = 10; // Default initial messages for chats if not overridden
export const LOAD_MORE_MESSAGES_COUNT = 50;
export const MAX_WORDS_PER_TTS_SEGMENT = 400; // Max words before splitting TTS, and max per segment.
export const MESSAGE_CONTENT_SNIPPET_THRESHOLD = 350; // Characters

export const TTS_MODELS: { id: TTSModelId; name: string }[] = [
    { id: 'gemini-2.5-flash-preview-tts', name: 'Gemini 2.5 Flash TTS' },
    { id: 'gemini-2.5-pro-preview-tts', name: 'Gemini 2.5 Pro TTS' },
];

export const TTS_VOICES: { id: TTSVoiceId; name: string; description: string }[] = [
    { id: 'Zephyr', name: 'Zephyr', description: 'Bright' },
    { id: 'Puck', name: 'Puck', description: 'Upbeat' },
    { id: 'Charon', name: 'Charon', description: 'Informative' },
    { id: 'Kore', name: 'Kore', description: 'Firm' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Excitable' },
    { id: 'Leda', name: 'Leda', description: 'Youthful' },
    { id: 'Orus', name: 'Orus', description: 'Firm' },
    { id: 'Aoede', name: 'Aoede', description: 'Breezy' },
    { id: 'Callirrhoe', name: 'Callirrhoe', description: 'Easy-going' },
    { id: 'Autonoe', name: 'Autonoe', description: 'Bright' },
    { id: 'Enceladus', name: 'Enceladus', description: 'Breathy' },
    { id: 'Iapetus', name: 'Iapetus', description: 'Clear' },
    { id: 'Umbriel', name: 'Umbriel', description: 'Easy-going' },
    { id: 'Algleba', name: 'Algleba', description: 'Smooth' }, // Typo in image 'Algieba', using 'Algleba' as potentially corrected. If not, adjust.
    { id: 'Despina', name: 'Despina', description: 'Smooth' },
    { id: 'Erinome', name: 'Erinome', description: 'Clear' },
    { id: 'Algenib', name: 'Algenib', description: 'Gravelly' },
    { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Informative' },
    { id: 'Laomedeia', name: 'Laomedeia', description: 'Upbeat' },
    { id: 'Achernar', name: 'Achernar', description: 'Soft' },
    { id: 'Alnilam', name: 'Alnilam', description: 'Firm' },
    { id: 'Schedar', name: 'Schedar', description: 'Even' },
    { id: 'Gacrux', name: 'Gacrux', description: 'Mature' },
    { id: 'Pulcherrima', name: 'Pulcherrima', description: 'Forward' },
    { id: 'Achird', name: 'Achird', description: 'Friendly' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Casual' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Gentle' },
    { id: 'Sadachbia', name: 'Sadachbia', description: 'Lively' },
    { id: 'Sadaltager', name: 'Sadaltager', description: 'Knowledgeable' },
    { id: 'Sulafat', name: 'Sulafat', description: 'Warm' },
];

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
    model: 'gemini-2.5-flash-preview-tts',
    voice: 'Zephyr',
    autoPlayNewMessages: false, // Renamed from autoFetchAudioEnabled
    systemInstruction: '', 
    maxWordsPerSegment: 999999, // Default to a very large number, effectively no split
};

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];


export const DEFAULT_SETTINGS: GeminiSettings = {
  systemInstruction: `You are a helpful AI assistant.`,
  userPersonaInstruction: "I am a user interacting with an AI. My responses are typically inquisitive and direct.", // Added default
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  thinkingBudget: undefined, // Default for thinking budget
  safetySettings: DEFAULT_SAFETY_SETTINGS,
  ttsSettings: DEFAULT_TTS_SETTINGS, 
  contextWindowMessages: undefined, 
  aiSeesTimestamps: false, 
  useGoogleSearch: false, 
  urlContext: [], 
  maxInitialMessagesDisplayed: INITIAL_MESSAGES_COUNT, 
  debugApiRequests: false, 
  showAutoSendControls: true, 
  showReadModeButton: false,
};

export const USER_DEFINED_GLOBAL_DEFAULTS_KEY = 'geminiChatUserDefinedGlobalDefaults';

export const HARM_CATEGORY_LABELS: Record<HarmCategory, string> = {
  [HarmCategory.HARM_CATEGORY_UNSPECIFIED]: "Unspecified",
  [HarmCategory.HARM_CATEGORY_HARASSMENT]: "Harassment",
  [HarmCategory.HARM_CATEGORY_HATE_SPEECH]: "Hate Speech",
  [HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT]: "Sexually Explicit",
  [HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT]: "Dangerous Content",
};

export const HARM_BLOCK_THRESHOLD_LABELS: Record<HarmBlockThreshold, string> = {
  [HarmBlockThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED]: "Unspecified",
  [HarmBlockThreshold.BLOCK_LOW_AND_ABOVE]: "Block Low and Above (Strict)",
  [HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE]: "Block Medium and Above (Default)",
  [HarmBlockThreshold.BLOCK_ONLY_HIGH]: "Block Only High (Cautious)",
  [HarmBlockThreshold.BLOCK_NONE]: "Block None (Relaxed)",
};


// File attachment constants
export const MAX_IMAGE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
// Gemini Flash 1.5 supports: PNG, JPEG, WEBP, HEIC, HEIF.
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
// Common video formats.
export const SUPPORTED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/mov'];
// For other document types like PDF, these will be handled as generic files by the File API.
// We can list them if we want specific client-side validation for them beyond total size.
export const SUPPORTED_DOCUMENT_MIME_TYPES = [
    'application/pdf', 
    'text/plain', 
    'text/markdown', 
    'text/csv',
    'application/javascript', 
    'application/x-python-code', // Common for .py files
    'text/x-python', // Another common MIME for .py
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
];


export const MAX_TOTAL_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25 MB total for all attachments in a single message.

export const DEFAULT_EXPORT_CONFIGURATION: ExportConfiguration = {
  // Core Chat Data
  includeChatSessionsAndMessages: true,
  includeMessageContent: true,
  includeMessageTimestamps: true,
  includeMessageRoleAndCharacterNames: true,
  includeMessageAttachmentsMetadata: true,
  includeFullAttachmentFileData: false, 
  includeCachedMessageAudio: false, 
  includeGroundingMetadata: true,

  // Chat-Specific Settings
  includeChatSpecificSettings: true,

  // AI Characters
  includeAiCharacterDefinitions: true, 

  // API Request Logs
  includeApiLogs: false, 

  // Global Application State
  includeLastActiveChatId: true,
  includeMessageGenerationTimes: true,
  includeUiConfiguration: false, 
  includeUserDefinedGlobalDefaults: false,
  includeApiKeys: true,
};

// Model IDs that should show the Thinking Budget UI
export const MODELS_SUPPORTING_THINKING_BUDGET_UI: string[] = [
  'gemini-2.5-flash-preview-04-17',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.5-pro-preview-05-06',
  'gemini-2.5-pro',
];

// Model IDs that will actually send thinkingConfig to the API
// As per user request, this now includes all Gemini 2.5 Pro and Flash series.
export const MODELS_SENDING_THINKING_CONFIG_API: string[] = [...MODELS_SUPPORTING_THINKING_BUDGET_UI];


export const THINKING_BUDGET_MIN = -1;
export const THINKING_BUDGET_MAX = 32768;
export const THINKING_BUDGET_STEP = 1;
export const THINKING_BUDGET_MARKS = [-1, 0, 32768];

export const MERMAID_FIX_SAFETY_SETTINGS: SafetySetting[] = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

export const MERMAID_FIX_SYSTEM_INSTRUCTION = `You are an expert in Mermaid diagram syntax. The user will provide a Mermaid diagram with syntax errors. Your task is to fix the syntax and return only the corrected, valid Mermaid code block.
--- MERMAID DIAGRAM RULES ---
Follow these strict formatting rules:
1. When needing to display a sequence or items within a single Mermaid node, never use list formats (e.g., '1.', '*'). Instead, integrate the numbering as part of the text using parentheses, like '(1) Text'.
2. All Mermaid diagrams must be designed with a simple and direct structure, completely avoiding the use of subgraphs. The focus must be on direct nodes and links only.
3. Integrate detailed explanations inside nodes using '<br/>' for line breaks. Always wrap node text that contains special characters or multiple words in double quotes "" to ensure correct parsing.
4. Do not add any explanations, apologies, or introductory text like "Here is the fixed code:". Only output the code itself, enclosed in a markdown code block with the 'mermaid' language identifier.
5.Ensure the final code is error-free and ready for immediate copy-pasting.

Example Input:
graph TD
    A --|> B

Example Output:
\`\`\`mermaid
graph RL
    A --> B
\`\`\`
`;
