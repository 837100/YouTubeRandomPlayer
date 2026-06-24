/**
 * 사용자가 입력한 채널 핸들/URL/ID를 서버에서 처리하기 쉬운 형태로 정리합니다.
 *
 * @param {string} value 원본 입력값
 * @returns {{ raw: string, handle: string, channelId: string, searchQuery: string }} 정규화 결과
 */
export function normalizeChannelInput(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return { raw: '', handle: '', channelId: '', searchQuery: '' };
  }

  if (/^UC[a-zA-Z0-9_-]{22}$/.test(raw)) {
    return { raw, handle: '', channelId: raw, searchQuery: raw };
  }

  try {
    const url = new URL(raw);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const channelIndex = pathParts.indexOf('channel');

    if (channelIndex !== -1 && /^UC[a-zA-Z0-9_-]{22}$/.test(pathParts[channelIndex + 1] || '')) {
      const channelId = pathParts[channelIndex + 1];
      return { raw, handle: '', channelId, searchQuery: channelId };
    }

    const handlePart = pathParts.find((part) => part.startsWith('@'));
    if (handlePart) {
      const handle = handlePart.replace(/^@+/, '');
      return { raw, handle, channelId: '', searchQuery: `@${handle}` };
    }

    const lastPathPart = pathParts[pathParts.length - 1] || '';
    const searchQuery = lastPathPart || raw;
    return {
      raw,
      handle: searchQuery.replace(/^@+/, ''),
      channelId: '',
      searchQuery
    };
  } catch (error) {
    const handle = raw.replace(/^@+/, '');
    return {
      raw,
      handle,
      channelId: '',
      searchQuery: handle ? `@${handle}` : raw
    };
  }
}
