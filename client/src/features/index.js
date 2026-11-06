// ==========================================
// 1. Auth Feature
// ==========================================
export { default as AuthModal } from './auth/components/AuthModal.jsx';
export { default as ProfileAvatarMenu } from './auth/components/ProfileAvatarMenu.jsx';
export { AuthProvider, useAuth } from './auth/context/AuthContext.jsx';

// ==========================================
// 1b. System Updater Feature
// ==========================================
export { UpdaterProvider, useUpdater } from './updater/context/UpdaterContext.jsx';

// ==========================================
// 2. Dashboard Feature
// ==========================================
export { default as RoomHistoryCard } from './dashboard/components/RoomHistoryCard.jsx';
export {
  useRoomHistory,
  saveRoomToHistory,
  ROOM_HISTORY_EVENT,
} from './dashboard/hooks/useRoomHistory.js';

// ==========================================
// 3. Room Feature - Components
// ==========================================
export { default as ErrorBoundary } from './room/components/common/ErrorBoundary.jsx';
export { default as ParticipantAvatar } from './room/components/video/ParticipantAvatar.jsx';
export { default as MeetingControlBar } from './room/components/controls/MeetingControlBar.jsx';
export { default as MeetingLayoutEngine } from './room/components/video/MeetingLayoutEngine.jsx';
export { default as MeetingVideoTile } from './room/components/video/MeetingVideoTile.jsx';
export { default as MeetingChatDrawer } from './room/components/drawers/MeetingChatDrawer.jsx';
export { default as MeetingParticipantsDrawer } from './room/components/drawers/MeetingParticipantsDrawer.jsx';
export { default as MeetingConfirmModal } from './room/components/modals/MeetingConfirmModal.jsx';
export { default as MeetingPipView } from './room/components/overlays/MeetingPipView.jsx';
export { default as HandMotionWindow } from './room/components/overlays/HandMotionWindow.jsx';
export { default as AslSubtitleOverlay } from './room/components/overlays/AslSubtitleOverlay.jsx';
export { default as CommunicationModePicker } from './room/components/controls/CommunicationModePicker.jsx';
export { default as LobbyToolsCheck } from './room/components/lobby/LobbyToolsCheck.jsx';
export { default as CaptionDock } from './room/components/captions/CaptionDock.jsx';
export { default as SpeechLane } from './room/components/captions/SpeechLane.jsx';
export { default as AslStrip } from './room/components/captions/AslStrip.jsx';
export { default as CaptionSettingsPopover } from './room/components/captions/CaptionSettingsPopover.jsx';
export { default as CaptionHistoryDrawer } from './room/components/captions/CaptionHistoryDrawer.jsx';
export { default as DockFooter } from './room/components/captions/DockFooter.jsx';

// Room Feature - Hooks
export * from './room/hooks/useLocalMedia.js';
export * from './room/hooks/useSocket.js';
export * from './room/hooks/useWebRTC.js';
export * from './room/hooks/useScreenShare.js';
export * from './room/hooks/useHandTrackingWorker.js';
export * from './room/hooks/useSpeechToText.js';
export * from './room/hooks/useCaptionPrefs.js';
export * from './room/hooks/useCaptionFeed.js';
export * from './room/hooks/useRoomModeration.js';
export * from './room/hooks/usePeerAudioActivity.js';
export * from './room/hooks/legacyEnergyVad.js';

// Room Feature - Services
export * from './room/services/audioMix.js';
export * from './room/services/modelCache.js';
export * from './room/services/whisperWorkerManager.js';

// Room Feature - Config & Utils
export * from './room/config/captionConfig.js';
export * from './room/config/sttConfig.js';
export * from './room/utils/captionUtils.js';
export * from './room/utils/exportTranscript.js';
