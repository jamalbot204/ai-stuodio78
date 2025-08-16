

import { useEffect } from 'react';
import { useAudioStore } from '../store/useAudioStore.ts';

export const AudioStoreBridge = () => {
  const { init, cleanup } = useAudioStore.getState();

  // This effect handles the lifecycle of the audio store's internal state (like AudioContext).
  useEffect(() => {
    init();
    return () => {
      cleanup();
    };
  }, [init, cleanup]);

  return null; // This component renders nothing.
};