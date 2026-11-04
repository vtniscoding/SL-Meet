import test from 'node:test';
import assert from 'node:assert/strict';
import { brandColors, roomColors } from '../src/theme/colors.js';

test('Theme Tokens: brand primary and hover colors match design specification', () => {
  assert.equal(brandColors.primary, '#5CA0F2', 'Brand primary must be #5CA0F2');
  assert.equal(brandColors.hover, '#4A8FE0', 'Brand hover must be #4A8FE0');
});

test('Theme Tokens: room background and surface match Google Meet dark ecosystem', () => {
  assert.equal(roomColors.bg, '#000000', 'Room background must be #000000');
  assert.equal(roomColors.surface, '#202124', 'Room surface must be #202124');
});

test('Theme Tokens: control button colors (inactive, active, danger) match standard', () => {
  assert.equal(roomColors.button, '#3C4043', 'Inactive button must be #3C4043');
  assert.equal(roomColors.active, '#8AB4F8', 'Active button must be #8AB4F8');
  assert.equal(roomColors.danger, '#EA4335', 'Danger / leave call button must be #EA4335');
});

