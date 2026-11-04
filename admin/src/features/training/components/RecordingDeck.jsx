import React from 'react';
import {
  KeyboardShortcutIcon,
  NetworkRadioIcon,
  SuccessCheckIcon,
  CloseIcon,
  AlertWarningIcon,
} from '@sl-meet/shared/icons';

/**
 * Smart Recording Deck for Data Labeling
 * Provides static/dynamic mode toggle, label input, hands-free hotkeys, and pre-save inspection.
 */
export default function RecordingDeck({
  recordingMode = 'static',
  setRecordingMode,
  isBusyRecording = false,
  gestureName = '',
  setGestureName,
  existingLabels = [],
  groupedGestures = {},
  cameraActive = false,
  recordingPhase = 'idle',
  countdown = 3,
  handleStartSmartRecording,
  handleSaveSample,
  capturedPayload = null,
  setCapturedPayload,
  conflictInfo = null,
  loading = false,
  statusMsg = '',
}) {
  return (
    <div className="bg-[#181920] border border-white/5 p-4 rounded-xl space-y-3 shrink-0">
      {/* Row 1: Recording Modality Toggle + Spacebar Hint */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex bg-[#20222A] p-1 rounded-xl border border-white/5">
          <button
            type="button"
            disabled={isBusyRecording}
            onClick={() => {
              setRecordingMode('static');
              setCapturedPayload(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              recordingMode === 'static'
                ? 'bg-[#5CA0F2] text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Static Pose (k-NN • 63D/126D)
          </button>
          <button
            type="button"
            disabled={isBusyRecording}
            onClick={() => {
              setRecordingMode('dynamic');
              setCapturedPayload(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              recordingMode === 'dynamic'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Dynamic Motion (DTW • 24 Keyframes)
          </button>
        </div>

        <div className="hidden xl:flex items-center space-x-1.5 text-[11px] text-slate-400">
          <KeyboardShortcutIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-200 font-mono text-[10px]">
              Space
            </kbd>{' '}
            for hands-free 3-2-1 record
          </span>
        </div>
      </div>

      {/* Row 2: Label Input + Record + Save */}
      <div className="flex items-center space-x-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            list="existing-gesture-labels"
            value={gestureName}
            onChange={(e) => setGestureName(e.target.value)}
            placeholder={
              recordingMode === 'dynamic'
                ? 'Motion Sign Label (e.g. Hello, Thank You, Please)'
                : 'Static Sign Label (e.g. A, B, Good, Nice, Meet)'
            }
            className="w-full bg-[#20222A] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#5CA0F2]"
          />
          <datalist id="existing-gesture-labels">
            {existingLabels.map((lbl) => (
              <option key={lbl} value={lbl} />
            ))}
          </datalist>
          {gestureName && groupedGestures[gestureName.trim()] && (
            <span className="absolute right-2.5 top-2 text-[10px] bg-[#5CA0F2]/15 text-[#5CA0F2] px-2 py-0.5 rounded-full border border-[#5CA0F2]/30">
              {groupedGestures[gestureName.trim()].length} saved
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleStartSmartRecording}
          disabled={!cameraActive}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-colors border outline-none disabled:opacity-50 shrink-0 cursor-pointer ${
            isBusyRecording
              ? 'bg-[#EA4335] text-white border-transparent'
              : 'bg-[#EA4335]/15 hover:bg-[#EA4335]/25 text-rose-300 border-[#EA4335]/40'
          }`}
        >
          <NetworkRadioIcon className="w-4 h-4 text-rose-400 animate-pulse" />
          <span>
            {recordingPhase === 'preroll'
              ? `Ready (${countdown}s)...`
              : recordingPhase === 'capturing'
              ? `Capturing (${countdown}s)...`
              : recordingMode === 'dynamic'
              ? 'Record Motion (3s)'
              : 'Record Pose (3s)'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleSaveSample}
          disabled={!capturedPayload || isBusyRecording || loading}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-md disabled:opacity-50 shrink-0 cursor-pointer border-none outline-none"
        >
          <SuccessCheckIcon className="w-4 h-4" />
          <span>Save Sign</span>
        </button>
      </div>

      {/* Pre-Save Quality & Conflict Inspector */}
      {capturedPayload && (
        <div className="bg-[#20222A] border border-white/10 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center flex-wrap gap-2">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  capturedPayload.mode === 'dynamic'
                    ? 'bg-sky-950/80 text-[#5CA0F2] border-[#5CA0F2]/40'
                    : 'bg-purple-950/80 text-purple-300 border-purple-500/30'
                }`}
              >
                {capturedPayload.mode === 'dynamic'
                  ? `Dynamic ${capturedPayload.handCount}H • ${capturedPayload.sequenceLength}×${capturedPayload.dimension}D DTW`
                  : capturedPayload.handCount === 2
                  ? 'Unified 2-Hand 126D'
                  : 'Single-Hand 63D'}
              </span>

              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                  capturedPayload.qualityScore >= 80
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                    : capturedPayload.qualityScore >= 60
                    ? 'bg-amber-950/70 text-amber-300 border-amber-500/30'
                    : 'bg-rose-950/70 text-rose-300 border-rose-500/30'
                }`}
              >
                Quality: {capturedPayload.qualityScore}%
              </span>

              <span className="text-[11px] text-slate-400">
                {capturedPayload.keptFrames} clean frames
                {capturedPayload.motionAmplitude
                  ? ` • travel ${capturedPayload.motionAmplitude}x palm`
                  : ''}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setCapturedPayload(null)}
              className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors cursor-pointer border-none bg-transparent"
              title="Discard captured sample"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {conflictInfo?.hasConflict && (
            <div className="flex items-start space-x-2 bg-amber-950/50 border border-amber-500/40 text-amber-200 px-3 py-2 rounded-lg text-[11px]">
              <AlertWarningIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Dataset Overlap Warning:</strong> Closest existing class is{' '}
                <strong className="text-white">"{conflictInfo.conflictingLabel}"</strong>{' '}
                (dist: {conflictInfo.distance}, ~{conflictInfo.similarityPct}% similar). Verify
                handshape/motion before saving under a different label.
              </span>
            </div>
          )}
        </div>
      )}

      {statusMsg && (
        <div className="text-xs text-[#8AB4F8] font-medium flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg">
          <span className="truncate">{statusMsg}</span>
        </div>
      )}
    </div>
  );
}

