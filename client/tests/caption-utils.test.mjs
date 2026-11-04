import test from 'node:test';
import assert from 'node:assert/strict';
import { colorForSender, dwellMs, mergeCaptionEntries } from '../src/features/room/utils/captionUtils.js';
import { CAPTION_CONFIG } from '../src/features/room/config/captionConfig.js';

test('colorForSender: yields deterministic color adhering to palette', () => {
  const color1 = colorForSender('Alice');
  const color2 = colorForSender('Alice');
  const color3 = colorForSender('Bob');

  assert.equal(color1, color2, 'Same sender name must yield identical color');
  assert.ok(color1.startsWith('#'), 'Color should be hex code');
  assert.ok(CAPTION_CONFIG.SPEAKER_COLORS.includes(color1), 'Color must be in approved palette');
});

test('dwellMs: interim utterance returns configured INTERIM_TTL_MS', () => {
  const interimEntry = { text: 'Hello...', isFinal: false };
  assert.equal(dwellMs(interimEntry), CAPTION_CONFIG.INTERIM_TTL_MS);
});

test('dwellMs: short final utterance clamps to minimum dwell time', () => {
  const shortEntry = { text: 'Hello', isFinal: true };
  assert.equal(dwellMs(shortEntry), CAPTION_CONFIG.DWELL_MIN_MS);
});

test('dwellMs: medium utterance scales between min and max bounds', () => {
  const mediumEntry = { text: 'This is a normal sentence with eight words.', isFinal: true };
  const mediumDwell = dwellMs(mediumEntry);
  assert.ok(mediumDwell >= CAPTION_CONFIG.DWELL_MIN_MS && mediumDwell <= CAPTION_CONFIG.DWELL_MAX_MS);
});

test('dwellMs: very long utterance clamps to maximum dwell time', () => {
  const longEntry = { text: 'word '.repeat(50), isFinal: true };
  assert.equal(dwellMs(longEntry), CAPTION_CONFIG.DWELL_MAX_MS);
});

test('mergeCaptionEntries: appends new final entries correctly', () => {
  const initial = [];
  const entry1 = { senderId: 'user1', text: 'Good morning', isFinal: true, timestamp: 1000 };
  const step1 = mergeCaptionEntries(initial, entry1, 3);
  assert.equal(step1.length, 1);
  assert.equal(step1[0].text, 'Good morning');
});

test('mergeCaptionEntries: updates interim captions in-place for same sender', () => {
  const initial = [{ senderId: 'user1', text: 'Good morning', isFinal: true, timestamp: 1000 }];
  const interim1 = { senderId: 'user2', text: 'How are', isFinal: false, timestamp: 2000 };
  const step1 = mergeCaptionEntries(initial, interim1, 3);
  assert.equal(step1.length, 2);
  assert.equal(step1[1].text, 'How are');

  const interim2 = { senderId: 'user2', text: 'How are you doing today', isFinal: false, timestamp: 2001 };
  const step2 = mergeCaptionEntries(step1, interim2, 3);
  assert.equal(step2.length, 2);
  assert.equal(step2[1].text, 'How are you doing today');
});

test('mergeCaptionEntries: seamlessly replaces interim with finalized sentence', () => {
  const entries = [
    { senderId: 'user1', text: 'Good morning', isFinal: true, timestamp: 1000 },
    { senderId: 'user2', text: 'How are you doing', isFinal: false, timestamp: 2001 },
  ];
  const final2 = { senderId: 'user2', text: 'How are you doing today?', isFinal: true, timestamp: 2002 };
  const merged = mergeCaptionEntries(entries, final2, 3);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].text, 'How are you doing today?');
  assert.equal(merged[1].isFinal, true);
});

test('mergeCaptionEntries: evicts oldest entries using FIFO when capacity exceeded', () => {
  const entries = [
    { senderId: 'user1', text: 'Sentence 1', isFinal: true, timestamp: 1000 },
    { senderId: 'user2', text: 'Sentence 2', isFinal: true, timestamp: 2000 },
    { senderId: 'user3', text: 'Sentence 3', isFinal: true, timestamp: 3000 },
  ];
  const entry4 = { senderId: 'user4', text: 'Sentence 4 triggers eviction', isFinal: true, timestamp: 4000 };
  const merged = mergeCaptionEntries(entries, entry4, 3);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].senderId, 'user2', 'user1 should be evicted');
  assert.equal(merged[2].senderId, 'user4', 'user4 should be newest');
});

