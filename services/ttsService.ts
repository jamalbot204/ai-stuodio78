import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { TTSSettings, LogApiRequestCallback, ApiRequestPayload } from '../types.ts';
import { formatGeminiError } from './geminiService.ts';

const aiInstancesCache = new Map<string, GoogleGenAI>();

function createAiInstance(apiKey: string): GoogleGenAI {
    if (aiInstancesCache.has(apiKey)) {
        return aiInstancesCache.get(apiKey)!;
    }
    const newInstance = new GoogleGenAI({ apiKey });
    aiInstancesCache.set(apiKey, newInstance);
    return newInstance;
}


/**
 * Generates speech from text using the Gemini API.
 * @param apiKey The API key to use for this request.
 * @param text The text to synthesize.
 * @param ttsSettings The TTS configuration (model, voice, systemInstruction).
 * @param logApiRequest Optional callback to log the API request.
 * @param signal Optional AbortSignal to cancel the API request.
 * @returns A Promise that resolves to an ArrayBuffer containing the audio data.
 */
export async function generateSpeech(
  apiKey: string,
  text: string,
  ttsSettings: TTSSettings,
  logApiRequest?: LogApiRequestCallback,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  if (!apiKey) {
    throw new Error("TTS API Key not configured.");
  }
  const ai = createAiInstance(apiKey);

  let textToSynthesize = text;
  if (ttsSettings.systemInstruction && ttsSettings.systemInstruction.trim() !== '') {
    textToSynthesize = `${ttsSettings.systemInstruction.trim()} : ${text}`;
  }

  const requestContents: Part[] = [{ text: textToSynthesize }];

  const apiConfig: any = { 
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        voiceName: ttsSettings.voice
      }
    }
  };

  // System instruction is now prepended to the text, so it's removed from apiConfig.
  // if (ttsSettings.systemInstruction && ttsSettings.systemInstruction.trim() !== '') {
  //   apiConfig.systemInstruction = ttsSettings.systemInstruction;
  // }


  if (logApiRequest) {
    const payload: ApiRequestPayload = {
      model: ttsSettings.model,
      contents: requestContents,
      config: apiConfig, 
    };
    logApiRequest({
      requestType: 'tts.generateSpeech',
      payload: payload
    });
  }

  try {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: ttsSettings.model,
        contents: requestContents,
        config: apiConfig
    });
    
    if (signal?.aborted) { 
      throw new DOMException('Aborted', 'AbortError');
    }

    const firstCandidatePart = response.candidates?.[0]?.content?.parts?.[0];
    let base64Data: string | undefined;

    if (firstCandidatePart && 
        'inlineData' in firstCandidatePart && 
        firstCandidatePart.inlineData &&
        typeof firstCandidatePart.inlineData.data === 'string' &&
        typeof firstCandidatePart.inlineData.mimeType === 'string' &&
        firstCandidatePart.inlineData.mimeType.startsWith('audio/')) {
        
        base64Data = firstCandidatePart.inlineData.data;
    }
    else if (firstCandidatePart && 
             typeof (firstCandidatePart as any).data === 'string' &&
             typeof (firstCandidatePart as any).mimeType === 'string' &&
             (firstCandidatePart as any).mimeType.startsWith('audio/')) {
        
        base64Data = (firstCandidatePart as any).data;
    }


    if (base64Data) {
      const byteString = atob(base64Data);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      return byteArray.buffer;
    } else {
      console.error('TTS Service: No audio data found in TTS response or in expected format.', response);
      throw new Error('No audio data received from TTS API in expected format.');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
        console.log('TTS fetch aborted.');
        throw error;
    }
    console.error('Gemini TTS API error:', error);
    const formattedError = formatGeminiError(error);
    throw new Error(formattedError); 
  }
}

interface PlayPcmAudioResult {
    sourceNode: AudioBufferSourceNode;
    duration: number;
}

/**
 * Plays raw L16 PCM audio data using the Web Audio API.
 * @param audioContext The AudioContext instance.
 * @param pcmDataBuffer The ArrayBuffer containing the L16 PCM audio data.
 * @param sampleRate The sample rate of the PCM data (e.g., 24000 for Gemini TTS).
 * @returns A Promise that resolves to an object containing the AudioBufferSourceNode and its duration.
 */
export function playPcmAudio(
    audioContext: AudioContext,
    pcmDataBuffer: ArrayBuffer,
    sampleRate: number = 24000
): Promise<PlayPcmAudioResult> {
  return new Promise<PlayPcmAudioResult>((resolve, reject) => {
    try {
      const numberOfChannels = 1; 
      const bytesPerSample = 2; 
      const frameCount = pcmDataBuffer.byteLength / (numberOfChannels * bytesPerSample);

      if (frameCount <= 0) {
        reject(new Error("PCM data buffer is empty or invalid."));
        return;
      }
      
      const audioBuffer = audioContext.createBuffer(
        numberOfChannels,
        frameCount,
        sampleRate
      );

      const pcmDataView = new Int16Array(pcmDataBuffer); 
      const channelData = audioBuffer.getChannelData(0); 

      for (let i = 0; i < frameCount; i++) {
        channelData[i] = pcmDataView[i] / 32768.0;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      const duration = audioBuffer.duration;
      // const offset = Math.max(0, Math.min(startTimeOffset, duration)); 

      resolve({ sourceNode: source, duration: duration }); 

    } catch (error: any) {
      console.error('Error processing raw PCM audio data:', error);
      reject(new Error(`Failed to process PCM audio: ${error?.message || 'Unknown processing error'}`));
    }
  });
}
