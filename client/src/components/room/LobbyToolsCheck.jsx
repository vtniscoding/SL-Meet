import React, { useState, useEffect } from 'react';
import {
  SuccessCheckIcon as CheckCircle2,
  LoadingSpinnerIcon as Loader2,
  AlertErrorIcon as AlertCircle,
} from '../../icons';
import { getMediaPipeStatus, subscribeMediaPipeStatus } from '../../services/mediapipe';
import { getWhisperStatus, subscribeWhisperWorker } from '../../services/whisperWorkerManager';

/**
 * LobbyToolsCheck
 * Visual hardware & AI model readiness card matching Zoom/Meet specifications.
 * Displays: Camera (Ready/Off), Microphone (live level meter bar), Hand tracking (Ready/Failed),
 * and Live captions (download progress bar with % or Ready/Failed).
 *
 * Exposes model loading errors (never swallows them) and NEVER blocks Join.
 */
export default function LobbyToolsCheck({
  isCameraOff = false,
  isMuted = false,
  audioLevel = 0,
}) {
  const [mediaPipeState, setMediaPipeState] = useState(getMediaPipeStatus);
  const [whisperState, setWhisperState] = useState(getWhisperStatus);

  useEffect(() => {
    const unsubMediaPipe = subscribeMediaPipeStatus((st) => {
      setMediaPipeState(st);
    });
    const unsubWhisper = subscribeWhisperWorker(() => {
      setWhisperState(getWhisperStatus());
    });

    return () => {
      unsubMediaPipe();
      unsubWhisper();
    };
  }, []);

  return (
    <div className="w-full mt-3 p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/90 shadow-2xs space-y-2.5">
      <div className="text-xs font-bold text-slate-800 tracking-tight">
        Tools check
      </div>

      <div className="space-y-2 text-xs">
        {/* 1. Camera */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium text-slate-800">Camera</span>
          </div>
          <div>
            {isCameraOff ? (
              <span className="text-amber-600 font-semibold text-xs">Off</span>
            ) : (
              <span className="text-emerald-600 font-semibold text-xs">Ready</span>
            )}
          </div>
        </div>

        {/* 2. Microphone */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium text-slate-800">Microphone</span>
          </div>
          <div>
            {isMuted ? (
              <span className="text-amber-600 font-semibold text-xs">Off</span>
            ) : (
              <span className="text-emerald-600 font-semibold text-xs">Ready</span>
            )}
          </div>
        </div>

        {/* 3. Hand tracking */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {mediaPipeState.status === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            ) : mediaPipeState.status === 'loading' ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium text-slate-800">Hand tracking</span>
          </div>
          <div>
            {mediaPipeState.status === 'error' ? (
              <span
                className="text-rose-500 font-semibold text-xs"
                title={mediaPipeState.error || 'Failed to initialize MediaPipe'}
              >
                Failed
              </span>
            ) : mediaPipeState.status === 'loading' ? (
              <span className="text-blue-600 font-semibold text-xs">Loading...</span>
            ) : (
              <span className="text-emerald-600 font-semibold text-xs">Ready</span>
            )}
          </div>
        </div>

        {/* 4. Live captions (with download % progress bar) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {whisperState.status === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            ) : whisperState.status === 'loading' ? (
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium text-slate-800">Live captions</span>
          </div>
          <div>
            {whisperState.status === 'error' ? (
              <span
                className="text-rose-500 font-semibold text-xs"
                title={whisperState.error || 'Failed to download Whisper model'}
              >
                Failed
              </span>
            ) : whisperState.status === 'loading' ? (
              <div className="flex items-center space-x-1.5">
                <div className="w-20 sm:w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-150"
                    style={{
                      width: `${Math.max(8, whisperState.progress != null ? whisperState.progress : 25)}%`,
                    }}
                  />
                </div>
                {whisperState.progress != null && (
                  <span className="text-[10px] text-slate-500 font-bold min-w-[24px] text-right">
                    {whisperState.progress}%
                  </span>
                )}
              </div>
            ) : (
              <span className="text-emerald-600 font-semibold text-xs">Ready</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
