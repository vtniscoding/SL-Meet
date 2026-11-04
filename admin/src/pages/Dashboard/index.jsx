import React, { useState, useRef, useCallback } from 'react';
import { useAslAggregator } from '@sl-meet/shared';
import {
  useGestureDataset,
  useTrainingCamera,
  useGestureRecording,
  AdminLoginModal,
  useAdminAuth,
} from '../../features';
import { MainLayout } from '../../components';
import DataLabellingPage from '../DataLabelling';
import DatasetPage from '../Dataset';
import MonitoringPage from '../Monitoring';
import NlpPage from '../NLP';

/**
 * Admin Dashboard: Training, Dataset, NLP & Monitoring Management Center
 * High-cohesion modular architecture coordinating 4 primary views:
 * 1. Data Labeling (Main training canvas & smart recorder)
 * 2. Dataset (Dedicated sample roster & management view)
 * 3. Natural Language Processing (ASL grammar & phrase builder)
 * 4. Monitoring (60 FPS telemetry & MediaPipe inspector)
 */
export default function AdminDashboard({ initialTab = 'training' }) {
  // Navigation Tab State: 'training' | 'dataset' | 'nlp' | 'monitoring'
  const [activeTab, setActiveTab] = useState(
    initialTab === 'monitoring' || initialTab === 'debugger'
      ? 'monitoring'
      : initialTab === 'dataset'
      ? 'dataset'
      : initialTab === 'nlp' || initialTab === 'phrases'
      ? 'nlp'
      : 'training'
  );

  // Hidden file input for backup JSON import
  const importInputRef = useRef(null);

  // Telemetry Overlays State
  const [showRadar, setShowRadar] = useState(true);
  const [showSubtitles, setShowSubtitles] = useState(true);

  // NLP Grammar State
  const [phraseSignCount, setPhraseSignCount] = useState(2);
  const [firstSignChoice, setFirstSignChoice] = useState('');
  const [secondSignChoice, setSecondSignChoice] = useState('');
  const [thirdSignChoice, setThirdSignChoice] = useState('');
  const [phraseTranslation, setPhraseTranslation] = useState('');
  const [phraseDesc, setPhraseDesc] = useState('');

  // 1. ASL Aggregator for live sentence formation and subtitle preview
  const { currentSentence, pushGesture, clearTranscript, notifyHandReset } = useAslAggregator(
    2800,
    6,
    650,
    2200,
    1800
  );

  // 2. Gesture & NLP Dataset Hook
  const dataset = useGestureDataset(true);

  // 3. Admin Authentication Hook
  const auth = useAdminAuth(() => dataset.loadAllData());

  // Ref bridge for frame capture
  const onCaptureFrameRef = useRef(null);

  // 4. Training Camera & Motion Tracking Hook
  const camera = useTrainingCamera({
    activeTab,
    gesturesCount: dataset.gesturesList.length,
    loadAllData: dataset.loadAllData,
    setStatusMsg: dataset.setStatusMsg,
    pushGesture,
    notifyHandReset,
    onCaptureFrame: (payload) => onCaptureFrameRef.current?.(payload),
  });

  // 5. Gesture Recording Pipeline Hook
  const recording = useGestureRecording({
    cameraActive: camera.cameraActive,
    cameraActiveRef: camera.cameraActiveRef,
    isAuthenticated: auth.isAuthenticated,
    activeTab,
    gesturesList: dataset.gesturesList,
    setStatusMsg: dataset.setStatusMsg,
  });

  onCaptureFrameRef.current = recording.handleCaptureFrame;

  // Tab change handler with graceful video loop pause
  const handleTabChange = useCallback(
    (nextTab) => {
      if (nextTab !== 'training' && nextTab !== 'gestures') {
        // Pause 60 FPS video render and inference loops when leaving Data Labeling
        camera.stopCamera(false);
      } else if (nextTab === 'training' || nextTab === 'gestures') {
        if (
          camera.cameraStreamRef.current &&
          camera.cameraStreamRef.current.active &&
          !camera.isCameraOff
        ) {
          camera.startCamera();
        }
      }
      setActiveTab(nextTab);
    },
    [camera]
  );

  // Save phrase rule wrapper for NLP Tab
  const handleSavePhraseRuleWrapper = useCallback(() => {
    dataset.handleSavePhraseRule({
      phraseSignCount,
      firstSignChoice,
      secondSignChoice,
      thirdSignChoice,
      phraseTranslation,
      phraseDesc,
      onSuccess: () => {
        setFirstSignChoice('');
        setSecondSignChoice('');
        setThirdSignChoice('');
        setPhraseTranslation('');
        setPhraseDesc('');
      },
    });
  }, [
    dataset,
    phraseSignCount,
    firstSignChoice,
    secondSignChoice,
    thirdSignChoice,
    phraseTranslation,
    phraseDesc,
  ]);

  // Auth gate
  if (!auth.isAuthenticated) {
    return (
      <AdminLoginModal
        adminKey={auth.adminKey}
        setAdminKey={auth.setAdminKey}
        handleVerifyKey={auth.handleVerifyKey}
        authError={auth.authError}
        loading={auth.loading}
      />
    );
  }

  return (
    <MainLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {/* Hidden File Input for Backup JSON Import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={dataset.handleImportJson}
      />

      {/* Page 1: Data Labeling (Main Gesture Training Stage) */}
      {(activeTab === 'training' || activeTab === 'gestures') && (
        <DataLabellingPage
          stageContainerRef={camera.stageContainerRef}
          videoRef={camera.videoRef}
          canvasRef={camera.canvasRef}
          cameraActive={camera.cameraActive}
          liveDetection={camera.liveDetection}
          videoDevices={camera.videoDevices}
          selectedCameraId={camera.selectedCameraId}
          handleChangeCamera={camera.handleChangeCamera}
          handleToggleCamera={camera.handleToggleCamera}
          autoFollowZoom={camera.autoFollowZoom}
          setAutoFollowZoom={camera.setAutoFollowZoom}
          stageTelemetry={camera.stageTelemetry}
          showRadar={showRadar}
          setShowRadar={setShowRadar}
          showSubtitles={showSubtitles}
          setShowSubtitles={setShowSubtitles}
          currentSentence={currentSentence}
          clearTranscript={clearTranscript}
          recordingMode={recording.recordingMode}
          setRecordingMode={recording.setRecordingMode}
          recordingPhase={recording.recordingPhase}
          countdown={recording.countdown}
          isBusyRecording={recording.isBusyRecording}
          capturedPayload={recording.capturedPayload}
          setCapturedPayload={recording.setCapturedPayload}
          conflictInfo={recording.conflictInfo}
          handleStartSmartRecording={recording.handleStartSmartRecording}
          cancelRecordingSession={recording.cancelRecordingSession}
          gestureName={recording.gestureName}
          setGestureName={recording.setGestureName}
          gesturesList={dataset.gesturesList}
          existingLabels={dataset.existingLabels}
          groupedGestures={dataset.groupedGestures}
          handleSaveSample={dataset.handleSaveSample}
          loading={dataset.loading}
          statusMsg={dataset.statusMsg}
        />
      )}

      {/* Page 2: Dataset (Dedicated Full-Screen Sample Management) */}
      {activeTab === 'dataset' && (
        <DatasetPage
          gesturesList={dataset.gesturesList}
          existingLabels={dataset.existingLabels}
          filteredRosterEntries={dataset.filteredRosterEntries}
          datasetStats={dataset.datasetStats}
          rosterSearch={dataset.rosterSearch}
          setRosterSearch={dataset.setRosterSearch}
          rosterFilter={dataset.rosterFilter}
          setRosterFilter={dataset.setRosterFilter}
          loadAllData={dataset.loadAllData}
          handleRenameLabel={dataset.handleRenameLabel}
          handleDeleteLabelGroup={dataset.handleDeleteLabelGroup}
          handleDeleteSample={dataset.handleDeleteSample}
          onSelectLabelForTraining={(label) => {
            recording.setGestureName(label);
            handleTabChange('training');
          }}
          handleExportJson={dataset.handleExportJson}
          onTriggerImportJson={() => importInputRef.current?.click()}
          loading={dataset.loading}
          statusMsg={dataset.statusMsg}
        />
      )}

      {/* Page 3: Natural Language Processing (NLP) & Grammar Rules */}
      {(activeTab === 'nlp' || activeTab === 'phrases') && (
        <NlpPage
          phraseSignCount={phraseSignCount}
          setPhraseSignCount={setPhraseSignCount}
          firstSignChoice={firstSignChoice}
          setFirstSignChoice={setFirstSignChoice}
          secondSignChoice={secondSignChoice}
          setSecondSignChoice={setSecondSignChoice}
          thirdSignChoice={thirdSignChoice}
          setThirdSignChoice={setThirdSignChoice}
          phraseTranslation={phraseTranslation}
          setPhraseTranslation={setPhraseTranslation}
          phraseDesc={phraseDesc}
          setPhraseDesc={setPhraseDesc}
          existingLabels={dataset.existingLabels}
          handleSavePhraseRule={handleSavePhraseRuleWrapper}
          handleDeletePhraseRule={dataset.handleDeletePhraseRule}
          phrasesList={dataset.phrasesList}
          loading={dataset.loading}
          statusMsg={dataset.statusMsg}
          loadAllData={dataset.loadAllData}
        />
      )}

      {/* Page 4: Monitoring & AI Vision Telemetry Debugger */}
      {(activeTab === 'monitoring' || activeTab === 'debugger') && (
        <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col">
          <MonitoringPage
            isEmbedded={true}
            sharedStream={camera.cameraStreamRef.current}
            onStreamAcquired={(stream) => {
              camera.cameraStreamRef.current = stream;
              camera.setCameraStream?.(stream);
              camera.setCameraActive?.(true);
            }}
          />
        </div>
      )}
    </MainLayout>
  );
}
