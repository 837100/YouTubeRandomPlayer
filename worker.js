import { normalizeChannelInput } from './worker-utils.mjs';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
};

/**
 * JSON 응답을 만듭니다.
 *
 * @param {unknown} body 응답 본문
 * @param {number} status HTTP 상태 코드
 * @param {HeadersInit} headers 추가 헤더
 * @returns {Response} JSON 응답
 */
function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...headers
    }
  });
}

/**
 * 사용 가능한 API 키를 가져옵니다.
 *
 * @param {{ YOUTUBE_API_KEY?: string, APIKEY?: string }} env Workers 환경 변수
 * @returns {string} API 키
 */
function getApiKey(env) {
  return String(env.YOUTUBE_API_KEY || env.APIKEY || '').trim();
}

/**
 * YouTube API 응답을 JSON으로 읽고 API 오류를 일반 Error로 올립니다.
 *
 * @param {string} url 요청 URL
 * @returns {Promise<any>} JSON 데이터
 */
async function fetchYouTubeJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.error) {
    const message = data.error?.message || `YouTube API error: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

/**
 * 채널 ID로 채널 존재 여부를 확인합니다.
 *
 * @param {string} channelId 채널 ID
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<string>} 확인된 채널 ID
 */
async function resolveChannelById(channelId, apiKey) {
  if (!channelId) return '';

  const data = await fetchYouTubeJson(
    `${YT_API}/channels?part=id&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );

  return data.items?.[0]?.id || '';
}

/**
 * YouTube 핸들로 채널 ID를 조회합니다.
 *
 * @param {string} handle 채널 핸들
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<string>} 확인된 채널 ID
 */
async function resolveChannelByHandle(handle, apiKey) {
  if (!handle) return '';

  const candidates = [`@${handle}`, handle];

  for (const candidate of candidates) {
    try {
      const data = await fetchYouTubeJson(
        `${YT_API}/channels?part=id&forHandle=${encodeURIComponent(candidate)}&key=${apiKey}`
      );

      const channelId = data.items?.[0]?.id;
      if (channelId) return channelId;
    } catch (error) {
      console.error('Handle lookup failed:', error.message);
    }
  }

  return '';
}

/**
 * 마지막 fallback으로 검색 API를 사용해 채널 ID를 찾습니다.
 *
 * @param {string} searchQuery 검색어
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<string>} 확인된 채널 ID
 */
async function resolveChannelBySearch(searchQuery, apiKey) {
  if (!searchQuery) return '';

  const data = await fetchYouTubeJson(
    `${YT_API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`
  );

  return data.items?.[0]?.snippet?.channelId || '';
}

/**
 * Request 본문을 JSON으로 읽습니다.
 *
 * @param {Request} request 요청 객체
 * @returns {Promise<Record<string, any>>} 파싱된 본문
 */
async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

/**
 * CORS preflight 응답을 반환합니다.
 *
 * @returns {Response} preflight 응답
 */
function optionsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * 채널 ID 해결 엔드포인트를 처리합니다.
 *
 * @param {Request} request 요청 객체
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<Response>} 응답
 */
async function handleResolveChannel(request, apiKey) {
  const { handle } = await readJsonBody(request);

  if (!handle) {
    return jsonResponse({ error: '채널 핸들이 필요합니다' }, 400);
  }

  const normalized = normalizeChannelInput(handle);

  const channelId =
    (await resolveChannelById(normalized.channelId, apiKey)) ||
    (await resolveChannelByHandle(normalized.handle, apiKey)) ||
    (await resolveChannelBySearch(normalized.searchQuery, apiKey));

  if (!channelId) {
    return jsonResponse({ error: '채널을 찾을 수 없습니다' }, 404);
  }

  return jsonResponse({ channelId });
}

/**
 * 업로드 플레이리스트 엔드포인트를 처리합니다.
 *
 * @param {Request} request 요청 객체
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<Response>} 응답
 */
async function handleGetUploadsPlaylist(request, apiKey) {
  const { channelId } = await readJsonBody(request);

  if (!channelId) {
    return jsonResponse({ error: '채널 ID가 필요합니다' }, 400);
  }

  const data = await fetchYouTubeJson(
    `${YT_API}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );

  if (!data.items || data.items.length === 0) {
    return jsonResponse({ error: '채널 정보를 찾을 수 없습니다' }, 404);
  }

  const uploadsPlaylistId = data.items[0].contentDetails.relatedPlaylists.uploads;
  return jsonResponse({ uploadsPlaylistId });
}

/**
 * 플레이리스트 영상 목록 엔드포인트를 처리합니다.
 *
 * @param {Request} request 요청 객체
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<Response>} 응답
 */
async function handleGetPlaylistVideos(request, apiKey) {
  const { playlistId, maxResults = 50 } = await readJsonBody(request);

  if (!playlistId) {
    return jsonResponse({ error: '플레이리스트 ID가 필요합니다' }, 400);
  }

  const videos = [];
  let pageToken = '';
  const maxTotal = 200;
  const pageSize = Math.max(1, Math.min(Number(maxResults) || 50, 50));

  while (videos.length < maxTotal) {
    const url =
      `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}` +
      `&maxResults=${pageSize}&key=${apiKey}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const data = await fetchYouTubeJson(url);
    const items = data.items || [];
    const videoIds = items
      .map((item) => item.contentDetails?.videoId)
      .filter(Boolean);

    if (videoIds.length > 0) {
      const videosData = await fetchYouTubeJson(
        `${YT_API}/videos?part=contentDetails,snippet,liveStreamingDetails&id=${encodeURIComponent(videoIds.join(','))}&key=${apiKey}`
      );
      const videoDetailsMap = {};

      videosData.items?.forEach((video) => {
        const liveBroadcastContent = video.snippet?.liveBroadcastContent || 'none';
        const liveStreamingDetails = video.liveStreamingDetails || null;

        videoDetailsMap[video.id] = {
          duration: video.contentDetails?.duration,
          liveBroadcastContent,
          liveStreamingDetails,
          isLiveBroadcast:
            liveBroadcastContent === 'live' ||
            liveBroadcastContent === 'upcoming' ||
            Boolean(liveStreamingDetails)
        };
      });

      items.forEach((item) => {
        const videoId = item.contentDetails?.videoId;
        const details = videoDetailsMap[videoId] || {};

        videos.push({
          videoId,
          title: item.snippet?.title || '제목 없음',
          duration: details.duration,
          liveBroadcastContent: details.liveBroadcastContent || 'none',
          liveStreamingDetails: details.liveStreamingDetails || null,
          isLiveBroadcast: details.isLiveBroadcast === true
        });
      });
    } else {
      items.forEach((item) => {
        videos.push({
          videoId: item.contentDetails?.videoId,
          title: item.snippet?.title || '제목 없음',
          duration: null,
          liveBroadcastContent: 'none',
          liveStreamingDetails: null,
          isLiveBroadcast: false
        });
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken || videos.length >= maxTotal) break;
  }

  return jsonResponse({ videos: videos.slice(0, maxTotal) });
}

/**
 * Workers 진입점입니다.
 */
export default {
  /**
   * 요청을 라우팅합니다.
   *
   * @param {Request} request 요청 객체
   * @param {{ YOUTUBE_API_KEY?: string, APIKEY?: string }} env Workers 환경 변수
   * @returns {Promise<Response>} 응답
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const apiKey = getApiKey(env);

    if (request.method === 'OPTIONS') {
      return optionsResponse();
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return jsonResponse({
        message: 'YouTube Random Player API Server',
        status: 'running',
        apiKeyLoaded: !!apiKey,
        endpoints: {
          health: 'GET /api/health',
          resolveChannel: 'POST /api/resolve-channel',
          getUploadsPlaylist: 'POST /api/get-uploads-playlist',
          getPlaylistVideos: 'POST /api/get-playlist-videos'
        }
      });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return jsonResponse({ status: 'Server is running', apiKeyLoaded: !!apiKey });
    }

    if (!apiKey) {
      return jsonResponse({ error: 'API 키가 설정되지 않았습니다' }, 500);
    }

    if (url.pathname === '/api/resolve-channel' && request.method === 'POST') {
      return handleResolveChannel(request, apiKey);
    }

    if (url.pathname === '/api/get-uploads-playlist' && request.method === 'POST') {
      return handleGetUploadsPlaylist(request, apiKey);
    }

    if (url.pathname === '/api/get-playlist-videos' && request.method === 'POST') {
      return handleGetPlaylistVideos(request, apiKey);
    }

    return jsonResponse({ error: '찾을 수 없는 경로입니다' }, 404);
  }
};
