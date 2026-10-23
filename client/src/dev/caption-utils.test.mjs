import assert from 'node:assert/strict';
import { colorForSender, dwellMs, mergeCaptionEntries } from '../components/room/captions/captionUtils.js';
import { CAPTION_CONFIG } from '../config/captionConfig.js';

console.log('🧪 Starting Caption Utilities Tests...');

// 1. Test colorForSender determinism and diversity
{
  const color1 = colorForSender('Alice');
  const color2 = colorForSender('Alice');
  const color3 = colorForSender('Bob');

  assert.equal(color1, color2, 'Same sender name must yield identical color');
  assert.ok(color1.startsWith('#'), 'Color should be hex code');
  assert.ok(CAPTION_CONFIG.SPEAKER_COLORS.includes(color1), 'Color must be in approved palette');
  console.log('  ✓ colorForSender: deterministic and adheres to palette');
}

// 2. Test dwellMs calculation & clamping
{
  // Interim utterance returns INTERIM_TTL_MS
  const interimEntry = { text: 'Hello...', isFinal: false };
  assert.equal(dwellMs(interimEntry), CAPTION_CONFIG.INTERIM_TTL_MS, 'Interim utterance must return INTERIM_TTL_MS (8000ms)');

  // Short final utterance clamps to minimum dwell
  const shortEntry = { text: 'Hello', isFinal: true };
  const shortDwell = dwellMs(shortEntry);
  assert.equal(shortDwell, CAPTION_CONFIG.DWELL_MIN_MS, 'Short sentence must clamp to DWELL_MIN_MS (3500ms)');

  // Medium final utterance scales with word count
  const mediumEntry = { text: 'This is a normal sentence with eight words.', isFinal: true };
  const mediumDwell = dwellMs(mediumEntry);
  assert.ok(mediumDwell >= CAPTION_CONFIG.DWELL_MIN_MS && mediumDwell <= CAPTION_CONFIG.DWELL_MAX_MS, 'Medium sentence must be between min and max');

  // Extremely long final utterance clamps to maximum dwell
  const longEntry = { text: 'word '.repeat(50), isFinal: true };
  const longDwell = dwellMs(longEntry);
  assert.equal(longDwell, CAPTION_CONFIG.DWELL_MAX_MS, 'Very long sentence must clamp to DWELL_MAX_MS (12000ms)');
  console.log('  ✓ dwellMs: correctly clamps to configured [min, max] bounds');
}

// 3. Test mergeCaptionEntries
{
  // Case A: Appending new final entry
  const initial = [];
  const entry1 = { senderId: 'user1', text: 'Good morning', isFinal: true, timestamp: 1000 };
  const step1 = mergeCaptionEntries(initial, entry1, 3);
  assert.equal(step1.length, 1);
  assert.equal(step1[0].text, 'Good morning');

  // Case B: In-place update for interim caption from same sender
  const interim1 = { senderId: 'user2', text: 'How are', isFinal: false, timestamp: 2000 };
  const step2 = mergeCaptionEntries(step1, interim1, 3);
  assert.equal(step2.length, 2);
  assert.equal(step2[1].text, 'How are');

  // Same sender updates interim to more text
  const interim2 = { senderId: 'user2', text: 'How are you doing today', isFinal: false, timestamp: 2001 };
  const step3 = mergeCaptionEntries(step2, interim2, 3);
  assert.equal(step3.length, 2, 'Interim update should update entry in-place, not create duplicate');
  assert.equal(step3[1].text, 'How are you doing today');

  // Same sender finalizes
  const final2 = { senderId: 'user2', text: 'How are you doing today?', isFinal: true, timestamp: 2002 };
  const step4 = mergeCaptionEntries(step3, final2, 3);
  assert.equal(step4.length, 2);
  assert.equal(step4[1].text, 'How are you doing today?');
  assert.equal(step4[1].isFinal, true);

  // Case C: FIFO eviction when exceeding maxEntries (set to 3)
  const entry3 = { senderId: 'user3', text: 'Third sentence', isFinal: true, timestamp: 3000 };
  const step5 = mergeCaptionEntries(step4, entry3, 3);
  assert.equal(step5.length, 3);

  const entry4 = { senderId: 'user4', text: 'Fourth sentence triggers eviction', isFinal: true, timestamp: 4000 };
  const step6 = mergeCaptionEntries(step5, entry4, 3);
  assert.equal(step6.length, 3, 'Entries should be capped at maxEntries (3)');
  assert.equal(step6[0].senderId, 'user2', 'Oldest entry (user1) should be evicted');
  assert.equal(step6[2].senderId, 'user4', 'Newest entry should be at the end');

  console.log('  ✓ mergeCaptionEntries: handles interim replacements, finalization, and FIFO limits');
}

console.log('🎉 All Caption Utilities tests passed successfully!\n');
