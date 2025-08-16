import React, { useEffect, memo, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CloseIcon, ClipboardIcon, CheckIcon, SitemapIcon } from './Icons.tsx'; // Added SitemapIcon
import AdvancedAudioPlayer from './AdvancedAudioPlayer.tsx';
import { useAudioStore } from '../store/useAudioStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { useModalStore } from '../store/useModalStore'; // Added useModalStore

// Import and register only the necessary languages
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('jsx', jsx);

interface ReadModeViewProps {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  onGoToMessage?: () => void;
}

// Re-using the CodeBlock component logic for consistent styling
const CodeBlock: React.FC<React.PropsWithChildren<{ inline?: boolean; className?: string }>> = memo(({
  inline,
  className,
  children,
}) => {
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, '');
  const match = /language-([\w.-]+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const isMermaid = lang.toLowerCase() === 'mermaid'; // Check for mermaid language

  const { openMermaidModal } = useModalStore.getState(); // Get the action from the modal store

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeString).then(() => {
        setIsCodeCopied(true);
        setTimeout(() => setIsCodeCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy code: ', err);
        alert('Failed to copy code.');
    });
  };

  if (inline) {
    return (
      <code className="bg-black/30 text-indigo-300 rounded px-1 py-0.5 font-mono text-sm border border-white/10">
        {children}
      </code>
    );
  }

  return (
    <div className="relative group/codeblock my-2 rounded-md overflow-hidden border border-white/10 bg-[#0A0910]">
      <div className="flex justify-between items-center px-4 py-1.5 bg-black/20">
        <span className="text-xs text-gray-300 font-mono">{lang || 'code'}</span>
        <div className="flex items-center space-x-2"> {/* Container for multiple buttons */}
          {isMermaid && (
            <button
              onClick={() => openMermaidModal({ code: codeString })}
              title="Render Diagram"
              aria-label="Render Mermaid diagram"
              className="p-1.5 bg-black/30 text-gray-300 hover:text-white rounded-md transition-all duration-150 opacity-0 group-hover/codeblock:opacity-100 focus:opacity-100 hover:shadow-[0_0_8px_1px_rgba(34,197,94,0.6)]"
            >
              <SitemapIcon className="w-4 h-4 text-green-400" />
            </button>
          )}
          <button onClick={handleCopyCode} title={isCodeCopied ? "Copied!" : "Copy code"} aria-label={isCodeCopied ? "Copied code to clipboard" : "Copy code to clipboard"} className="p-1.5 bg-black/30 text-gray-300 hover:text-white rounded-md transition-all duration-150 opacity-0 group-hover/codeblock:opacity-100 focus:opacity-100 hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]">
              {isCodeCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {lang ? (
        <SyntaxHighlighter
          style={atomDark}
          language={lang}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', fontSize: '0.9em', backgroundColor: 'transparent' }}
        >
          {codeString}
        </SyntaxHighlighter>
      ) : (
        <pre className="bg-transparent text-gray-200 p-4 text-sm font-mono overflow-x-auto m-0">
          <code>{codeString}</code>
        </pre>
      )}
    </div>
  );
});

const ReadModeView: React.FC<ReadModeViewProps> = memo(({ isOpen, content, onClose, onGoToMessage }) => {
  const { audioPlayerState, handleClosePlayerViewOnly, seekRelative, seekToAbsolute, togglePlayPause, increaseSpeed, decreaseSpeed } = useAudioStore();
  const { currentChatSession } = useActiveChatStore();

  const handleGoToMessageFromReadMode = useCallback(() => {
    if (onGoToMessage) {
      onClose(); // Close the modal
      // Add a small delay to ensure the modal is gone before scrolling
      setTimeout(() => onGoToMessage(), 100); 
    }
  }, [onGoToMessage, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isAudioBarVisible = !!(audioPlayerState.currentMessageId || audioPlayerState.isLoading || audioPlayerState.isPlaying || audioPlayerState.currentPlayingText);
  
  const getFullTextForAudioBar = () => {
    if (!audioPlayerState.currentMessageId || !currentChatSession) return audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audioPlayerState.currentMessageId.split('_part_')[0];
    const message = currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audioPlayerState.currentPlayingText || "Playing audio...");
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex flex-col p-4 sm:p-8 md:p-12 pt-24"
      onClick={onClose} // Close on clicking the background
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent background click when clicking the button
          onClose();
        }}
        className="absolute top-4 right-4 text-gray-400 p-2 rounded-full z-10 transition-shadow hover:text-white hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
        aria-label="Close Read Mode"
      >
        <CloseIcon className="w-7 h-7" />
      </button>

      {isAudioBarVisible && (
        <div 
            className="flex-shrink-0 w-full mx-auto pb-4"
            onClick={(e) => e.stopPropagation()} // Stop click from bubbling to the background
        >
          <AdvancedAudioPlayer
            audioPlayerState={audioPlayerState}
            onCloseView={handleClosePlayerViewOnly}
            onSeekRelative={seekRelative}
            onSeekToAbsolute={seekToAbsolute}
            onTogglePlayPause={togglePlayPause}
            currentMessageText={getFullTextForAudioBar()}
            onGoToMessage={handleGoToMessageFromReadMode}
            onIncreaseSpeed={increaseSpeed}
            onDecreaseSpeed={decreaseSpeed}
          />
        </div>
      )}

      <div
        className="flex-grow w-full mx-auto overflow-y-auto hide-scrollbar"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the content area
      >
        <div className="aurora-panel p-6 sm:p-8 rounded-lg markdown-content">
             <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock, p: 'div' }}>
                {content}
            </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

export default ReadModeView;
