
import React, { memo, useEffect, useRef, useState } from 'react';
import { useModalStore } from '../store/useModalStore';
import { CloseIcon, SitemapIcon, ZoomInIcon, ZoomOutIcon, ResetViewIcon, ArrowDownTrayIcon, SparklesIcon } from './Icons'; // Import new icons
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'; // Import the library components
import { triggerDownload } from '../services/utils'; // Import triggerDownload utility
import { useGeminiApiStore } from '../store/useGeminiApiStore';

// Declare mermaid on the window object for TypeScript
declare global {
  interface Window {
    mermaid?: any;
  }
}

const MermaidModal: React.FC = memo(() => {
  const { isMermaidModalOpen, mermaidModalData, closeMermaidModal } = useModalStore();
  const mermaidContainerRef = useRef<HTMLDivElement>(null);
  const [renderResult, setRenderResult] = useState<{ svg?: string; error?: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isFixing, setIsFixing] = useState(false);

  useEffect(() => {
    if (!isMermaidModalOpen || !window.mermaid || !mermaidModalData) return;

    let isMounted = true;
    setIsLoading(true);
    setRenderResult({});

    const renderMermaid = async () => {
      try {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", "Lucida Sans", Tahoma, sans-serif',
        });
        
        const diagramId = `mermaid-diagram-${Date.now()}`;
        const { svg } = await window.mermaid.render(diagramId, mermaidModalData.code);
        
        if (isMounted) {
          setRenderResult({ svg });
        }
      } catch (error: any) {
        console.error("Mermaid rendering error:", error);
        if (isMounted) {
          const errorMessage = error.str || error.message || 'An unknown error occurred during rendering.';
          setRenderResult({ error: errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;') });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const timer = setTimeout(renderMermaid, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isMermaidModalOpen, mermaidModalData]);

  const handleDownloadSvg = () => {
    if (renderResult.svg) {
      const svgBlob = new Blob([renderResult.svg], { type: 'image/svg+xml' });
      const filename = `mermaid-diagram-${Date.now()}.svg`;
      triggerDownload(svgBlob, filename);
    }
  };

  if (!isMermaidModalOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mermaid-modal-title"
      onClick={closeMermaidModal}
    >
      <div
        className="aurora-panel rounded-none shadow-none w-screen h-screen flex flex-col text-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="flex justify-between items-center mb-4 flex-shrink-0 px-5 sm:px-6 pt-5 sm:pt-6"
        >
          <h2 id="mermaid-modal-title" className="text-xl font-semibold text-gray-100 flex items-center">
            <SitemapIcon className="w-5 h-5 mr-3 text-green-400" />
            Mermaid Diagram Viewer
          </h2>
          <button
            onClick={closeMermaidModal}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close diagram viewer"
          >
            <CloseIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div 
          className="flex-grow overflow-hidden bg-black/20 rounded-md min-h-[300px] relative mx-5 sm:mx-6"
        >
          {isLoading && (
            <div className="text-center text-gray-400">
              <SitemapIcon className="w-12 h-12 text-gray-500 animate-pulse mx-auto" />
              <p className="mt-2">Rendering Diagram...</p>
            </div>
          )}
          {renderResult.svg && (
            <TransformWrapper
              initialScale={1}
              minScale={0.1}
              maxScale={5}
              limitToBounds={false}
              wheel={{ step: 0.1 }}
              panning={{ disabled: false, velocityDisabled: true }}
              doubleClick={{ disabled: true }}
              centerOnInit={true}
              className={(props) => `w-full h-full ${props.state.isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <div className="absolute top-2 right-2 z-10 flex flex-col space-y-2 bg-black/30 p-2 rounded-md shadow-lg">
                    <button
                      onClick={() => zoomIn()}
                      className="p-1.5 text-gray-300 hover:text-white rounded-md transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]"
                      title="Zoom In"
                      aria-label="Zoom In"
                    >
                      <ZoomInIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => zoomOut()}
                      className="p-1.5 text-gray-300 hover:text-white rounded-md transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]"
                      title="Zoom Out"
                      aria-label="Zoom Out"
                    >
                      <ZoomOutIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => resetTransform()}
                      className="p-1.5 text-gray-300 hover:text-white rounded-md transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)]"
                      title="Reset View"
                      aria-label="Reset View"
                    >
                      <ResetViewIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleDownloadSvg}
                      disabled={isLoading || !renderResult.svg || !!renderResult.error}
                      className="p-1.5 text-gray-300 hover:text-white rounded-md transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Download SVG"
                      aria-label="Download SVG diagram"
                    >
                      <ArrowDownTrayIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%' }}
                    contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <div
                      ref={mermaidContainerRef}
                      dangerouslySetInnerHTML={{ __html: renderResult.svg }}
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          )}
          {renderResult.error && (
            <div className="w-full text-left bg-red-900/50 border border-red-500/50 p-4 rounded-md">
              <h3 className="text-md font-semibold text-red-300 mb-2">Rendering Error</h3>
              <pre className="text-xs text-red-200 whitespace-pre-wrap font-mono">
                <code>{renderResult.error}</code>
              </pre>
              <div className="mt-4 pt-4 border-t border-red-400/30">
                {mermaidModalData?.messageId && mermaidModalData?.fullContent && (
                    <button
                        onClick={async () => {
                            if (!mermaidModalData?.messageId || !mermaidModalData?.fullContent) return;
                            setIsFixing(true);
                            try {
                                await useGeminiApiStore.getState().handleFixMermaidCode({
                                    messageId: mermaidModalData.messageId,
                                    badCode: mermaidModalData.code,
                                    fullContent: mermaidModalData.fullContent,
                                });
                            } finally {
                                setIsFixing(false);
                            }
                        }}
                        disabled={isFixing}
                        className="flex items-center px-3 py-2 text-xs font-medium text-white bg-blue-600/80 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(59,130,246,0.6)] disabled:opacity-50 disabled:cursor-wait"
                    >
                        <SparklesIcon className={`w-4 h-4 mr-1.5 ${isFixing ? 'animate-pulse' : ''}`} />
                        {isFixing ? 'Fixing...' : 'Fix with AI'}
                    </button>
                )}
            </div>
            </div>
          )}
        </div>

        <div 
          className="mt-6 flex justify-end flex-shrink-0 px-5 sm:px-6 pb-5 sm:pb-6"
        >
          <button
            onClick={closeMermaidModal}
            className="px-4 py-2 text-sm bg-white/5 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

export default MermaidModal;
