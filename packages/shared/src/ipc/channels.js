/**
 * Shared IPC Channel Constants across SL-Meet Electron Applications (Admin & Client)
 */
export const WINDOW_CHANNELS = {
  MINIMIZE: 'window-minimize',
  MAXIMIZE_TOGGLE: 'window-maximize-toggle',
  CLOSE: 'window-close',
  IS_MAXIMIZED: 'window-is-maximized',
  MAXIMIZED_STATE: 'window-maximized-state',
};

export const PIP_CHANNELS = {
  ENTER: 'window-enter-pip',
  EXIT: 'window-exit-pip',
  IS_PIP: 'window-is-pip',
  STATE_CHANGED: 'pip-mode-changed',
};

export const HAND_MOTION_CHANNELS = {
  MINIMIZE: 'hand-motion-minimize',
  TOGGLE_PIN: 'hand-motion-toggle-pin',
  CLOSE: 'hand-motion-close',
  CLOSED_STATE: 'hand-motion-window-closed',
};

export const APP_CHANNELS = {
  VERSION: 'app-version',
  OPEN_TRAINING_MONITOR: 'open-training-monitor',
  CHECK_FOR_UPDATES: 'app-check-for-updates',
  DOWNLOAD_UPDATE: 'app-download-update',
  INSTALL_UPDATE: 'app-install-update',
  UPDATE_STATUS: 'app-update-status',
};

