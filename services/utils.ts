// services/utils.ts
import { MODEL_DEFINITIONS } from '../constants.ts';
import { ChatMessage, ChatMessageRole, Attachment } from '../types.ts';

const SMART_SPLIT_SEARCH_RANGE = 50; // Words before and after the ideal split point.

/**
 * Splits text into segments for Text-to-Speech processing.
 * This function implements a "smart split" logic. If the text exceeds `maxWordsPerSegment`,
 * it calculates an ideal split point and then searches for the nearest sentence-ending
 * punctuation (`.`, `?`, `!`) within a defined word range to create more natural breaks.
 *
 * @param fullText The complete text to be split.
 * @param maxWordsPerSegment The maximum number of words allowed in a single segment, or undefined/non-positive for no splitting.
 * @returns An array of text segments.
 */
export const splitTextForTts = (fullText: string, maxWordsPerSegment?: number): string[] => {
  const words = fullText.trim().split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  if (totalWords === 0) {
    return [];
  }

  // If maxWordsPerSegment is not defined, is non-positive, or if totalWords is within the limit, don't split.
  if (maxWordsPerSegment === undefined || maxWordsPerSegment <= 0 || totalWords <= maxWordsPerSegment) {
    return [fullText];
  }

  const segments: string[] = [];
  let remainingWords = [...words];
  let numSegmentsToCreate = Math.ceil(totalWords / maxWordsPerSegment);

  while (remainingWords.length > 0 && numSegmentsToCreate > 1) {
    const idealSplitPoint = Math.ceil(remainingWords.length / numSegmentsToCreate);
    
    // Define search boundaries within the remaining text
    const searchStart = Math.max(0, idealSplitPoint - SMART_SPLIT_SEARCH_RANGE);
    const searchEnd = Math.min(remainingWords.length - 1, idealSplitPoint + SMART_SPLIT_SEARCH_RANGE);

    const possibleSplitIndices: number[] = [];
    for (let i = searchStart; i <= searchEnd; i++) {
        const word = remainingWords[i];
        if (word.endsWith('.') || word.endsWith('?') || word.endsWith('!')) {
            possibleSplitIndices.push(i);
        }
    }

    let bestSplitIndex = -1;
    if (possibleSplitIndices.length > 0) {
        // Find the index in the possible list that is closest to idealSplitPoint
        bestSplitIndex = possibleSplitIndices.reduce((prev, curr) => {
            return (Math.abs(curr - idealSplitPoint) < Math.abs(prev - idealSplitPoint)) ? curr : prev;
        });
    }

    // If no sentence end was found, fallback to the ideal split point
    const fallbackSplitPoint = Math.min(idealSplitPoint, remainingWords.length - 1);
    const splitIndex = (bestSplitIndex !== -1) ? bestSplitIndex : fallbackSplitPoint;

    // Create the segment. The split is *after* the word at splitIndex.
    const segmentWords = remainingWords.slice(0, splitIndex + 1);
    if (segmentWords.length > 0) {
      segments.push(segmentWords.join(' '));
    }

    // Update remaining words and segments count
    remainingWords = remainingWords.slice(splitIndex + 1);
    numSegmentsToCreate--;
  }

  // Add the final remaining part as the last segment
  if (remainingWords.length > 0) {
    segments.push(remainingWords.join(' '));
  }

  return segments.filter(s => s.trim() !== "");
};


export function sanitizeFilename(
    name: string,
    maxLength: number = 50
  ): string {
    const replacement = '_';
    if (!name) return '';
  
    // Convert to lowercase
    let SaneName = name.toLowerCase();
  
    // Replace sequences of whitespace and hyphens with a single replacement character
    SaneName = SaneName.replace(/[\s-]+/g, replacement);
  
    // Remove any characters that are not alphanumeric or underscore
    SaneName = SaneName.replace(/[^a-z0-9_]/g, '');
  
    // Remove leading/trailing replacement characters
    const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const trimRegex = new RegExp(`^${escapeRegex(replacement)}+|${escapeRegex(replacement)}+$`, 'g');
    SaneName = SaneName.replace(trimRegex, '');
  
    // Truncate to maxLength
    if (SaneName.length > maxLength) {
      SaneName = SaneName.substring(0, maxLength);
      // Ensure it doesn't end with a partial word or the replacement char after truncation
      SaneName = SaneName.replace(new RegExp(`${escapeRegex(replacement)}+$`), '');
    }
    
    // Ensure it's not empty after all operations
    if (!SaneName && name) {
        return 'untitled'; // Or some default
    }
  
    return SaneName;
}

export function triggerDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export const getModelDisplayName = (modelId: string | undefined): string => {
    if (!modelId) return "Unknown Model";
    const model = MODEL_DEFINITIONS.find(m => m.id === modelId);
    return model ? model.name : modelId.split('/').pop() || modelId;
};


// Helper for useGemini.ts
export const findPrecedingUserMessageIndex = (messages: ChatMessage[], targetMessageIndex: number): number => {
  for (let i = targetMessageIndex - 1; i >= 0; i--) {
    if (messages[i].role === ChatMessageRole.USER) {
      return i;
    }
  }
  return -1;
};

export const getHistoryUpToMessage = (messages: ChatMessage[], messageIndex: number): ChatMessage[] => {
  if (messageIndex < 0 || messageIndex >= messages.length) {
    return messages; // Return all messages if index is out of bounds, or handle as an error
  }
  return messages.slice(0, messageIndex);
};

export const getDisplayFileType = (file: Attachment): string => {
  if (file.type === 'image') return "Image";
  if (file.type === 'video') return "Video";
  if (file.mimeType === 'application/pdf') return "PDF";
  if (file.mimeType.startsWith('text/')) return "Text";
  return "File";
};
