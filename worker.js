import { normalizeChannelInput } from './worker-utils.mjs';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Content-Type'
};

/**
 * 표준 로그 출력을 수행하는 로거 객체입니다.
 */
const logger = {
  info(...args) {
    console.log(`[INFO] [${new Date().toISOString()}]`, ...args);
  },
  warn(...args) {
    console.warn(`[WARN] [${new Date().toISOString()}]`, ...args);
  },
  error(...args) {
    console.error(`[ERROR] [${new Date().toISOString()}]`, ...args);
  }
};

/**
 * Cloudflare Workers 환경에 안전한 인메모리 캐시 클래스입니다.
 */
class SimpleCache {
  constructor() {
    this.store = new Map();
  }

  /**
   * 캐시에 값을 저장합니다.
   * @param {string} key 캐시 키
   * @param {any} value 캐시 값
   * @param {number} ttlSeconds 만료 시간 (초 단위)
   */
  set(key, value, ttlSeconds) {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiry });
  }

  /**
   * 캐시에서 값을 가져옵니다. 만료되었다면 null을 반환하고 데이터를 지웁니다.
   * @param {string} key 캐시 키
   * @returns {any | null} 캐시된 값 또는 null
   */
  get(key) {
    const item = this.store.get(key);
    if (!item) return null;

    if (item.expiry <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }
}

// 캐시 인스턴스 정의
const channelResolveCache = new SimpleCache(); // TTL 24시간
const channelUploadsCache = new SimpleCache(); // TTL 1시간
const playlistVideosCache = new SimpleCache(); // TTL 10분


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
 * 문자열로 들어온 숫자 통계를 Number | null 로 정규화합니다.
 *
 * 빈 문자열 / null / undefined / 숫자가 아닌 값은 null 로 반환하여
 * 클라이언트가 "조회수 없음" 상태로 안전하게 처리할 수 있게 합니다.
 *
 * @param {unknown} raw YouTube API가 반환한 통계 값
 * @returns {number | null} 정수 또는 null
 */
function parseStatCount(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
      logger.error('Handle lookup failed:', error.message);
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

  const cacheKey = String(handle).trim().toLowerCase();
  const cachedChannelId = channelResolveCache.get(cacheKey);
  if (cachedChannelId) {
    logger.info(`[Cache Hit] resolve-channel: ${handle} -> ${cachedChannelId}`);
    return jsonResponse({ channelId: cachedChannelId });
  }

  const normalized = normalizeChannelInput(handle);

  const channelId =
    (await resolveChannelById(normalized.channelId, apiKey)) ||
    (await resolveChannelByHandle(normalized.handle, apiKey)) ||
    (await resolveChannelBySearch(normalized.searchQuery, apiKey));

  if (!channelId) {
    return jsonResponse({ error: '채널을 찾을 수 없습니다' }, 404);
  }

  // 캐시에 저장 (24시간)
  channelResolveCache.set(cacheKey, channelId, 86400);
  logger.info(`[Cache Miss] resolve-channel: ${handle} -> ${channelId} (Saved to cache)`);

  return jsonResponse({ channelId });
}

/**
 * 채널 응답을 클라이언트가 쓰기 좋은 형태로 정규화합니다.
 *
 * - `thumbnail`은 항상 채널의 프로필 사진(원형 아바타)을 가리킵니다.
 *   YouTube API는 `snippet.thumbnails`에서 `default`/`medium`/`high` 세 크기를 주는데,
 *   `brandingSettings.image.bannerExternalUrl`은 채널 페이지 상단의 직사각형 배너이므로
 *   절대 thumbnail로 쓰면 안 됩니다.
 * - 채널 배너가 필요해지면 `banner` 필드를 따로 쓰세요.
 *
 * @param {any} channelItem YouTube API의 channels 응답 item
 * @returns {{
 *   id: string,
 *   title: string,
 *   handle: string,
 *   customUrl: string,
 *   thumbnail: string | null,
 *   banner: string | null,
 *   subscribers: number | null,
 *   hiddenSubscribers: boolean,
 *   videoCount: number | null,
 *   viewCount: number | null
 * }} 정규화된 채널 정보
 */
function normalizeChannel(channelItem) {
  const snippet = channelItem.snippet || {};
  const statistics = channelItem.statistics || {};
  const branding = channelItem.brandingSettings || {};

  const handle = String(snippet.customUrl || '').replace(/^@+/, '') || '';
  const profileThumb =
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    snippet.thumbnails?.default?.url ||
    null;
  const banner =
    branding.image?.bannerExternalUrl ||
    null;

  const hiddenSubscribers = statistics.hiddenSubscriberCount === true;
  const subscribersRaw = statistics.subscriberCount;
  const subscribers = hiddenSubscribers
    ? null
    : subscribersRaw !== undefined && subscribersRaw !== null && subscribersRaw !== ''
      ? Number(subscribersRaw)
      : null;

  const videoCountRaw = statistics.videoCount;
  const viewCountRaw = statistics.viewCount;

  return {
    id: channelItem.id || '',
    title: snippet.title || '',
    handle,
    customUrl: snippet.customUrl || '',
    thumbnail: profileThumb,
    banner,
    subscribers,
    hiddenSubscribers,
    videoCount: videoCountRaw !== undefined && videoCountRaw !== '' ? Number(videoCountRaw) : null,
    viewCount: viewCountRaw !== undefined && viewCountRaw !== '' ? Number(viewCountRaw) : null
  };
}

/**
 * 업로드 플레이리스트와 채널 통계를 한 번에 조회합니다.
 *
 * @param {string} channelId 채널 ID
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<{ uploadsPlaylistId: string, channel: ReturnType<typeof normalizeChannel> } | null>}
 */
async function fetchUploadsPlaylistAndChannel(channelId, apiKey) {
  const data = await fetchYouTubeJson(
    `${YT_API}/channels?part=contentDetails,snippet,statistics,brandingSettings&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );

  if (!data.items || data.items.length === 0) {
    return null;
  }

  const item = data.items[0];
  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    return null;
  }

  return { uploadsPlaylistId, channel: normalizeChannel(item) };
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

  const cacheKey = String(channelId).trim();
  const cachedResult = channelUploadsCache.get(cacheKey);
  if (cachedResult) {
    logger.info(`[Cache Hit] get-uploads-playlist: ${channelId}`);
    return jsonResponse(cachedResult);
  }

  const result = await fetchUploadsPlaylistAndChannel(channelId, apiKey);

  if (!result) {
    return jsonResponse({ error: '채널 정보를 찾을 수 없습니다' }, 404);
  }

  // 캐시에 저장 (1시간)
  channelUploadsCache.set(cacheKey, result, 3600);
  logger.info(`[Cache Miss] get-uploads-playlist: ${channelId} (Saved to cache)`);

  return jsonResponse(result);
}

/**
 * 플레이리스트 영상 목록 엔드포인트를 처리합니다.
 *
 * @param {Request} request 요청 객체
 * @param {string} apiKey YouTube API 키
 * @returns {Promise<Response>} 응답
 */
async function handleGetPlaylistVideos(request, apiKey) {
  const { playlistId, maxResults = 50, pageToken = '', limit: rawLimit } = await readJsonBody(request);

  if (!playlistId) {
    return jsonResponse({ error: '플레이리스트 ID가 필요합니다' }, 400);
  }

  // limit 정규화: 1~200 사이 정수만 인정, 그 외는 무시(전체 반환 동작으로 fallback)
  let limit = null;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    const parsed = Number(rawLimit);
    if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1 && parsed <= 200) {
      limit = parsed;
    }
  }

  const cacheKey = `${playlistId}:${maxResults}:${pageToken}:${limit || 'all'}`;
  const cachedResult = playlistVideosCache.get(cacheKey);
  if (cachedResult) {
    logger.info(`[Cache Hit] get-playlist-videos: key=${cacheKey}`);
    return jsonResponse(cachedResult);
  }

  // limit이 있으면 페이지당 크기도 limit에 맞춰서 API 호출 자체를 줄임.
  // YouTube Data API는 playlistItems 기본 정렬이 최신순이므로 별도 정렬 불필요.
  const effectiveMax = limit !== null ? Math.min(50, limit) : Math.min(50, maxResults);

  const url =
    `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}` +
    `&maxResults=${effectiveMax}&key=${apiKey}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

  const data = await fetchYouTubeJson(url);
  const items = data.items || [];
  const videos = [];

  const videoIds = items.map((item) => item.contentDetails?.videoId).filter(Boolean);

  if (videoIds.length > 0) {
    const videosData = await fetchYouTubeJson(
      `${YT_API}/videos?part=contentDetails,snippet,liveStreamingDetails,statistics&id=${encodeURIComponent(videoIds.join(','))}&key=${apiKey}`
    );
    const videoDetailsMap = {};

    videosData.items?.forEach((video) => {
      const liveBroadcastContent = video.snippet?.liveBroadcastContent || 'none';
      const liveStreamingDetails = video.liveStreamingDetails || null;
      videoDetailsMap[video.id] = {
        duration: video.contentDetails?.duration,
        liveBroadcastContent,
        liveStreamingDetails,
        isLiveBroadcast: liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming' || Boolean(liveStreamingDetails),
        viewCount: parseStatCount(video.statistics?.viewCount)
      };
    });

    items.forEach((item) => {
      const videoId = item.contentDetails?.videoId;
      const details = videoDetailsMap[videoId] || {};
      const itemSnippet = item.snippet || {};
      const thumbnails = itemSnippet.thumbnails || {};
      videos.push({
        videoId,
        title: itemSnippet.title || '제목 없음',
        thumbnail: thumbnails.medium?.url || thumbnails.default?.url || thumbnails.high?.url || null,
        publishedAt: itemSnippet.publishedAt || null,
        channelTitle: itemSnippet.channelTitle || '',
        duration: details.duration,
        liveBroadcastContent: details.liveBroadcastContent || 'none',
        liveStreamingDetails: details.liveStreamingDetails || null,
        isLiveBroadcast: details.isLiveBroadcast === true,
        viewCount: details.viewCount ?? null
      });
    });
  }

  const responseData = {
    videos,
    nextPageToken: data.nextPageToken || null,
    limit
  };

  // 캐시에 저장 (10분)
  playlistVideosCache.set(cacheKey, responseData, 600);
  logger.info(`[Cache Miss] get-playlist-videos: key=${cacheKey} (Saved to cache)`);

  return jsonResponse(responseData);
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

    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      try {
        return await env.ASSETS.fetch(request);
      } catch (error) {
        logger.error('ASSETS.fetch failed:', error);
      }
    }

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
};
