import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChannelInput } from './worker-utils.mjs';

test('채널 핸들을 정규화합니다', () => {
  const result = normalizeChannelInput('@creatorname');
  assert.equal(result.handle, 'creatorname');
  assert.equal(result.channelId, '');
  assert.equal(result.searchQuery, '@creatorname');
});

test('채널 URL에서 channel ID를 정규화합니다', () => {
  const result = normalizeChannelInput('https://www.youtube.com/channel/UC1234567890123456789012');
  assert.equal(result.channelId, 'UC1234567890123456789012');
  assert.equal(result.handle, '');
  assert.equal(result.searchQuery, 'UC1234567890123456789012');
});

test('빈 값은 빈 정규화 결과를 반환합니다', () => {
  const result = normalizeChannelInput('');
  assert.deepEqual(result, {
    raw: '',
    handle: '',
    channelId: '',
    searchQuery: ''
  });
});
