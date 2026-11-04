import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW_CHANNELS,
  PIP_CHANNELS,
  HAND_MOTION_CHANNELS,
  APP_CHANNELS,
} from '../src/ipc/channels.js';

test('IPC: WINDOW_CHANNELS defines minimize, maximize toggle, and close events', () => {
  assert.equal(WINDOW_CHANNELS.MINIMIZE, 'window-minimize');
  assert.equal(WINDOW_CHANNELS.MAXIMIZE_TOGGLE, 'window-maximize-toggle');
  assert.equal(WINDOW_CHANNELS.CLOSE, 'window-close');
});

test('IPC: PIP_CHANNELS defines enter, exit and query pip events', () => {
  assert.equal(PIP_CHANNELS.ENTER, 'window-enter-pip');
  assert.equal(PIP_CHANNELS.EXIT, 'window-exit-pip');
  assert.equal(PIP_CHANNELS.IS_PIP, 'window-is-pip');
});

test('IPC: HAND_MOTION_CHANNELS defines hand-motion window control events', () => {
  assert.equal(HAND_MOTION_CHANNELS.MINIMIZE, 'hand-motion-minimize');
  assert.equal(HAND_MOTION_CHANNELS.CLOSE, 'hand-motion-close');
  assert.equal(HAND_MOTION_CHANNELS.TOGGLE_PIN, 'hand-motion-toggle-pin');
});

test('IPC: APP_CHANNELS defines application metadata and monitoring channels', () => {
  assert.equal(APP_CHANNELS.VERSION, 'app-version');
  assert.equal(APP_CHANNELS.OPEN_TRAINING_MONITOR, 'open-training-monitor');
});
