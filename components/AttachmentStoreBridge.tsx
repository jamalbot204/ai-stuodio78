import { useEffect } from 'react';
import { useAttachmentStore } from '../store/useAttachmentStore.ts';
import { useApiKeyStore } from '../store/useApiKeyStore.ts';
import { useGeminiApiStore } from '../store/useGeminiApiStore.ts';
import { useToastStore } from '../store/useToastStore.ts';

export const AttachmentStoreBridge = () => {
  const { setDependencies } = useAttachmentStore.getState();
  const activeApiKey = useApiKeyStore(s => s.activeApiKey);
  const logApiRequest = useGeminiApiStore(s => s.logApiRequest);
  const showToast = useToastStore(s => s.showToast);

  useEffect(() => {
    setDependencies({
      getApiKey: () => activeApiKey?.value || '',
      getLogApiRequest: () => logApiRequest,
      getShowToast: () => showToast,
    });
  }, [activeApiKey, logApiRequest, showToast, setDependencies]);

  return null; // This component renders nothing.
};
