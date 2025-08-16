// services/audioUtils.ts

export function concatenateAudioBuffers(buffers: (ArrayBuffer | null)[]): ArrayBuffer {
    const validBuffers = buffers.filter(buffer => buffer !== null) as ArrayBuffer[];
    if (validBuffers.length === 0) {
        return new ArrayBuffer(0);
    }
    if (validBuffers.length === 1) {
        return validBuffers[0];
    }

    let totalLength = 0;
    validBuffers.forEach(buffer => {
        totalLength += buffer.byteLength;
    });

    const result = new Uint8Array(totalLength);
    let offset = 0;
    validBuffers.forEach(buffer => {
        result.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
    });

    return result.buffer;
}

/**
 * Creates an audio file Blob from raw PCM data.
 * NOTE: Currently, this function *always* creates a WAV file, regardless of the desiredMimeType.
 * True MP3 encoding would require an MP3 encoding library (e.g., LameJS).
 *
 * @param pcmData The raw PCM audio data.
 * @param _desiredMimeType The desired MIME type (e.g., 'audio/mpeg' for MP3, 'audio/wav' for WAV).
 * @param sampleRate The sample rate of the PCM data.
 * @returns A Blob representing the audio file.
 */
export function createAudioFileFromPcm(
    pcmData: ArrayBuffer,
    _desiredMimeType: 'audio/mpeg' | 'audio/wav' = 'audio/wav',
    sampleRate: number = 24000
): Blob {
    // For now, we only implement WAV export due to complexity of client-side MP3 encoding.
    // If desiredMimeType is 'audio/mpeg', we still produce WAV data but the calling
    // function might name the file with an .mp3 extension.

    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;

    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.byteLength;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    const pcmArray = new Uint8Array(pcmData);
    for (let i = 0; i < dataSize; i++) {
        view.setUint8(44 + i, pcmArray[i]);
    }

    // TODO: If desiredMimeType is 'audio/mpeg', integrate an MP3 encoder here.
    // For example, using LameJS:
    // if (desiredMimeType === 'audio/mpeg') {
    //   const lameEncoder = new lamejs.Mp3Encoder(numChannels, sampleRate, /* kbps */ 128);
    //   const samples = new Int16Array(pcmData); // Assuming pcmData is Int16
    //   const mp3Data = [];
    //   const sampleBlockSize = 1152; // Standard LAME block size
    //   for (let i = 0; i < samples.length; i += sampleBlockSize) {
    //     const sampleChunk = samples.subarray(i, i + sampleBlockSize);
    //     const mp3buf = lameEncoder.encodeBuffer(sampleChunk);
    //     if (mp3buf.length > 0) {
    //       mp3Data.push(new Uint8Array(mp3buf));
    //     }
    //   }
    //   const mp3buf = lameEncoder.flush();
    //   if (mp3buf.length > 0) {
    //     mp3Data.push(new Uint8Array(mp3buf));
    //   }
    //   const mergedMp3 = new Uint8Array(mp3Data.reduce((acc, val) => acc + val.length, 0));
    //   let offset = 0;
    //   mp3Data.forEach(chunk => {
    //     mergedMp3.set(chunk, offset);
    //     offset += chunk.length;
    //   });
    //   return new Blob([mergedMp3], { type: 'audio/mpeg' });
    // }

    return new Blob([view], { type: 'audio/wav' }); // Always return WAV for now
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
