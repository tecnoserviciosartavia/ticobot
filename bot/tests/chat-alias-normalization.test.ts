import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeChatIdForState, mergeChatAliasIds } from '../src/utils/phone.ts';

test('normaliza números y lid al mismo chat estándar', () => {
  assert.equal(normalizeChatIdForState('70099532'), '50670099532@c.us');
  assert.equal(normalizeChatIdForState('50670099532'), '50670099532@c.us');
  assert.equal(normalizeChatIdForState('50670099532@lid'), '50670099532@c.us');
});

test('mergeChatAliasIds unifica aliases del mismo chat estándar', () => {
  const merged = mergeChatAliasIds('70099532', '50670099532', '50670099532@lid', '50670099532@c.us');
  assert.deepEqual(Array.from(merged).sort(), ['50670099532@c.us']);
});
