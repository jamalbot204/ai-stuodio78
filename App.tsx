
import React, { memo } from 'react';
import AppContent from './components/AppContent.tsx';
import { AudioStoreBridge } from './components/AudioStoreBridge.tsx';
import { DataStoreBridge } from './components/DataStoreBridge.tsx';
import { AttachmentStoreBridge } from './components/AttachmentStoreBridge.tsx';
import { DummyAudioStoreBridge } from './components/DummyAudioStoreBridge.tsx';

const App: React.FC = memo(() => {
  return (
    <>
      <AudioStoreBridge />
      <DataStoreBridge />
      <AttachmentStoreBridge />
      <DummyAudioStoreBridge />
      <AppContent />
    </>
  );
});

export default App;
