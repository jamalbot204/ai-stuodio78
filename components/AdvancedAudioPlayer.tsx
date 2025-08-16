
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { AudioPlayerState } from '../types.ts';
import {
  SpeakerWaveIcon,
  XCircleIcon,
  RewindIcon,
  PlayIcon,
  PauseIcon,
  FastForwardIcon,
  PlusIcon,
  MinusIcon,
  BookOpenIcon,
} from './Icons.tsx';
import GoToMessageButton from './GoToMessageButton.tsx'; // Import the new button

const PlayPauseButtonIcon: React.FC<{ isLoading: boolean; isPlaying: boolean }> = memo(({ isLoading, isPlaying }) => {
  if (isLoading) {
    return (
      <svg className="animate-spin h-5 w-5 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    );
  }
  if (isPlaying) {
    return <PauseIcon className="w-5 h-5 text-orange-400" />;
  }
  return <PlayIcon className="w-5 h-5 text-green-400" />;
});

interface AdvancedAudioPlayerProps {
  audioPlayerState: AudioPlayerState;
  onCloseView: () => void; // Renamed from onStopPlayback
  onSeekRelative: (offsetSeconds: number) => void;
  onSeekToAbsolute: (timeInSeconds: number) => void;
  onTogglePlayPause?: () => void;
  currentMessageText?: string | null;
  onGoToMessage?: () => void;
  onIncreaseSpeed: () => void;
  onDecreaseSpeed: () => void;
  onEnterReadMode?: () => void;
}

const AdvancedAudioPlayer: React.FC<AdvancedAudioPlayerProps> = memo(({
  audioPlayerState,
  onCloseView, // Updated prop name
  onSeekRelative,
  onSeekToAbsolute,
  onTogglePlayPause,
  currentMessageText,
  onGoToMessage,
  onIncreaseSpeed,
  onDecreaseSpeed,
  onEnterReadMode,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [visualSeekTime, setVisualSeekTime] = useState<number | null>(null);
  const rangeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSeeking) {
      setVisualSeekTime(null);
    }
  }, [isSeeking, audioPlayerState.currentTime]);

  const formatTime = useCallback((timeInSeconds: number | undefined): string => {
    if (timeInSeconds === undefined || isNaN(timeInSeconds) || timeInSeconds < 0) return '0:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const handleRangeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(event.target.value);
    setVisualSeekTime(newTime);
  }, []);

  const handleRangeMouseDown = useCallback(() => {
    if (!audioPlayerState.duration) return;
    setIsSeeking(true);
    setVisualSeekTime(audioPlayerState.currentTime || 0);
  }, [audioPlayerState.duration, audioPlayerState.currentTime]);

  const handleRangeMouseUp = useCallback(() => {
    if (isSeeking && visualSeekTime !== null && audioPlayerState.duration && audioPlayerState.duration > 0) {
      onSeekToAbsolute(visualSeekTime);
    }
    setIsSeeking(false);
    setVisualSeekTime(null);
  }, [isSeeking, visualSeekTime, audioPlayerState.duration, onSeekToAbsolute]);

  const handleProgressClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.currentTarget || !audioPlayerState.duration) return; 
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    if (width === 0) return;
    const newTime = (clickX / width) * audioPlayerState.duration;
    onSeekToAbsolute(newTime);
  }, [audioPlayerState.duration, onSeekToAbsolute]);

  const {
    isLoading,
    isPlaying,
    currentMessageId,
    error,
    currentTime,
    duration,
    currentPlayingText,
    playbackRate,
  } = audioPlayerState;

  if (!currentMessageId && !isLoading && !isPlaying && !currentPlayingText) {
    return null;
  }

  const displayTime = isSeeking && visualSeekTime !== null ? visualSeekTime : (currentTime || 0);
  const totalDuration = duration || 0;
  const progressPercent = totalDuration > 0 ? (displayTime / totalDuration) * 100 : 0;

  const displayMessageText = currentMessageText || currentPlayingText || "Audio Playback";
  let partNumberDisplay = "";
  if (currentMessageId) {
    const partMatch = currentMessageId.match(/_part_(\d+)/);
    if (partMatch && partMatch[1]) {
      partNumberDisplay = ` (Part ${parseInt(partMatch[1], 10) + 1})`;
    }
  }
  const snippet = (displayMessageText.length > 25 ? displayMessageText.substring(0, 22) + "..." : displayMessageText) + partNumberDisplay;

  const playPauseButtonTitle = isLoading ? "Loading audio..." : (isPlaying ? "Pause" : "Play");
  const speedButtonBaseClass = "p-1 text-gray-400 hover:text-white rounded-full transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed";


  return (
    <div
      className="aurora-panel text-gray-200 p-2 shadow-xl border-b border-[var(--aurora-border)] flex flex-col relative z-50"
      role="toolbar"
      aria-label="Audio Player"
    >
      {/* First Row: Icon, Text, Playback Buttons, Close Button */}
      <div className="flex items-center w-full space-x-1.5 sm:space-x-2">
        {/* Icon and Text Info */}
        <div className="flex items-center space-x-1.5 flex-shrink min-w-0 sm:max-w-[150px] md:max-w-sm">
          <SpeakerWaveIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold truncate" title={displayMessageText + partNumberDisplay}>
              {snippet}
            </span>
            {error && <span className="text-xs text-red-400 truncate" title={error}>{error}</span>}
          </div>
          {onGoToMessage && currentMessageId && (
            <GoToMessageButton onClick={onGoToMessage} disabled={!currentMessageId} />
          )}
          {onEnterReadMode && currentMessageId && (
            <button
              onClick={onEnterReadMode}
              disabled={!currentMessageId}
              className={`p-1.5 text-gray-400 hover:text-purple-300 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-1 flex-shrink-0`}
              title="Enter Read Mode"
              aria-label="Enter Read Mode for playing message"
            >
              <BookOpenIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Player Controls (Buttons) - Centered */}
        <div className="flex items-center space-x-1 sm:space-x-2 flex-grow justify-center">
            <button
            onClick={() => onSeekRelative(-10)}
            className="p-1.5 text-gray-400 hover:text-white rounded-full transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Rewind 10s"
            aria-label="Rewind 10 seconds"
            disabled={isLoading || !currentMessageId || !duration}
            >
            <RewindIcon className="w-4 h-4" />
            </button>

            <button
                onClick={onDecreaseSpeed}
                className={speedButtonBaseClass}
                title="Decrease speed"
                aria-label="Decrease playback speed"
                disabled={isLoading || !currentMessageId || !duration}
            >
                <MinusIcon className="w-3.5 h-3.5" />
            </button>

            <button
            onClick={onTogglePlayPause}
            className="p-1.5 sm:p-2 text-gray-200 bg-white/10 rounded-full transition-all hover:shadow-[0_0_10px_2px_rgba(90,98,245,0.6)] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)] focus:ring-offset-2 focus:ring-offset-black"
            title={playPauseButtonTitle}
            aria-label={playPauseButtonTitle}
            disabled={!onTogglePlayPause || (!isLoading && !currentMessageId)}
            >
              <PlayPauseButtonIcon isLoading={isLoading} isPlaying={isPlaying} />
            </button>
            
            <span className="text-xs text-gray-300 font-mono w-10 text-center tabular-nums" title={`Playback speed: ${playbackRate}x`}>
                {playbackRate.toFixed(2)}x
            </span>

            <button
                onClick={onIncreaseSpeed}
                className={speedButtonBaseClass}
                title="Increase speed"
                aria-label="Increase playback speed"
                disabled={isLoading || !currentMessageId || !duration}
            >
                <PlusIcon className="w-3.5 h-3.5" />
            </button>

            <button
            onClick={() => onSeekRelative(10)}
            className="p-1.5 text-gray-400 hover:text-white rounded-full transition-all hover:shadow-[0_0_8px_1px_rgba(255,255,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fast-Forward 10s"
            aria-label="Fast-Forward 10 seconds"
            disabled={isLoading || !currentMessageId || !duration}
            >
            <FastForwardIcon className="w-4 h-4" />
            </button>
        </div>
      
        {/* Close Button - Pushed to the right */}
        <div className="flex-shrink-0 ml-auto">
            <button
                onClick={onCloseView} // Updated to use onCloseView
                className="p-1.5 text-gray-400 rounded-full transition-all hover:text-red-400 hover:shadow-[0_0_10px_1px_rgba(239,68,68,0.7)]"
                title="Close Player"
                aria-label="Close audio player"
            >
                <XCircleIcon className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Second Row: Progress Bar and Time */}
      <div className="flex items-center w-full space-x-1 px-1 pt-1.5 sm:pt-2">
            <span className="text-xs text-gray-400 w-8 text-right tabular-nums flex-shrink-0">{formatTime(displayTime)}</span>
            <div
                className="flex-grow h-1.5 sm:h-2 bg-black/30 rounded-full cursor-pointer group relative min-w-[30px] sm:min-w-[50px]"
                onClick={handleProgressClick}
            >
                <div
                    className="absolute top-0 left-0 h-full bg-blue-500 group-hover:bg-blue-400 rounded-full transition-colors"
                    style={{ width: `${progressPercent}%` }}
                />
                <input
                    ref={rangeInputRef}
                    type="range"
                    min="0"
                    max={totalDuration}
                    value={displayTime}
                    onMouseDown={handleRangeMouseDown}
                    onMouseUp={handleRangeMouseUp}
                    onTouchStart={handleRangeMouseDown}
                    onTouchEnd={handleRangeMouseUp}
                    onChange={handleRangeChange}
                    className="absolute top-1/2 left-0 w-full h-4 opacity-0 cursor-pointer m-0 p-0 transform -translate-y-1/2"
                    disabled={isLoading || !totalDuration}
                    aria-label="Audio progress seek"
                />
            </div>
            <span className="text-xs text-gray-400 w-8 tabular-nums flex-shrink-0">{formatTime(totalDuration)}</span>
        </div>
    </div>
  );
});

export default AdvancedAudioPlayer;
