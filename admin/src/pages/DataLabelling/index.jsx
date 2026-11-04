import React from 'react';
import { TrainingStage, RecordingDeck } from '../../features';

/**
 * Data Labeling Page (Main Gesture Training Screen)
 * Combines 60 FPS Two-Hand Motion Tracking Stage and Smart Recording Deck.
 */
export default function DataLabellingPage({
  // Camera & Tracking Props
  stageContainerRef,
  videoRef,
  canvasRef,
  cameraActive,
  liveDetection,
  videoDevices,
  selectedCameraId,
  handleChangeCamera,
  handleToggleCamera,
  autoFollowZoom,
  setAutoFollowZoom,
  stageTelemetry,
  showRadar,
  setShowRadar,
  showSubtitles,
  setShowSubtitles,
  currentSentence,
  clearTranscript,

  // Recording Pipeline Props
  recordingMode,
  setRecordingMode,
  recordingPhase,
  countdown,
  isBusyRecording,
  capturedPayload,
  setCapturedPayload,
  conflictInfo,
  handleStartSmartRecording,
  cancelRecordingSession,
  gestureName,
  setGestureName,

  // Dataset Labels & Save Handler
  gesturesList,
  existingLabels,
  groupedGestures,
  handleSaveSample,

  // Shared State
  loading,
  statusMsg,
}) {
  return (
    <div className="flex-1 flex flex-col gap-3.5 h-full min-h-0 w-full p-4 sm:p-5 overflow-hidden relative">
      {/* 60 FPS Auto-Follow Stage Canvas + HUD */}
      <TrainingStage
        stageContainerRef={stageContainerRef}
        videoRef={videoRef}
        canvasRef={canvasRef}
        cameraActive={cameraActive}
        liveDetection={liveDetection}
        recordingPhase={recordingPhase}
        recordingMode={recordingMode}
        countdown={countdown}
        isBusyRecording={isBusyRecording}
        videoDevices={videoDevices}
        selectedCameraId={selectedCameraId}
        handleChangeCamera={handleChangeCamera}
        handleToggleCamera={handleToggleCamera}
        gesturesCount={gesturesList.length}
        autoFollowZoom={autoFollowZoom}
        setAutoFollowZoom={setAutoFollowZoom}
        stageTelemetry={stageTelemetry}
        showRadar={showRadar}
        setShowRadar={setShowRadar}
        showSubtitles={showSubtitles}
        setShowSubtitles={setShowSubtitles}
        currentSentence={currentSentence}
        clearTranscript={clearTranscript}
        cancelRecordingSession={cancelRecordingSession}
      />

      {/* Smart Recording Control Deck */}
      <RecordingDeck
        recordingMode={recordingMode}
        setRecordingMode={setRecordingMode}
        isBusyRecording={isBusyRecording}
        gestureName={gestureName}
        setGestureName={setGestureName}
        existingLabels={existingLabels}
        groupedGestures={groupedGestures}
        cameraActive={cameraActive}
        recordingPhase={recordingPhase}
        countdown={countdown}
        handleStartSmartRecording={handleStartSmartRecording}
        handleSaveSample={() => handleSaveSample(gestureName, capturedPayload, () => setCapturedPayload(null))}
        capturedPayload={capturedPayload}
        setCapturedPayload={setCapturedPayload}
        conflictInfo={conflictInfo}
        loading={loading}
        statusMsg={statusMsg}
      />
    </div>
  );
}

