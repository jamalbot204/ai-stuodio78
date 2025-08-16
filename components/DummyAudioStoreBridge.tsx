
import React, { memo } from 'react';
import DummyAudio from './DummyAudio.tsx';

/**
 * A bridge component to ensure the DummyAudio singleton is rendered
 * and its controls are connected to the useDummyAudioStore.
 * This follows the pattern of other bridge components in the app for global singletons.
 */
export const DummyAudioStoreBridge: React.FC = memo(() => {
  return <DummyAudio />;
});
