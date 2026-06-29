const form = document.getElementById("creatorForm");
const videoUrlInput = document.getElementById("videoUrlInput");
const clearVideoUrlBtn = document.getElementById("clearVideoUrlBtn");
const playUrlBtn = document.getElementById("playUrlBtn");
const channelInput = document.getElementById("channelInput");
const clearChannelBtn = document.getElementById("clearChannelBtn");
const videoCountInput = document.getElementById("videoCountInput");
const videoCountError = document.getElementById("videoCountError");
const statusEl = document.getElementById("status");
const player = document.getElementById("player");
const loadVideoBtn = document.getElementById("loadVideoBtn");
// "다른 랜덤 영상" 버튼은 사용하지 않음
// const randomAgainBtn = document.getElementById("randomAgainBtn");
const exclude60sCheckbox = document.getElementById("exclude60sCheckbox");
const excludeLiveCheckbox = document.getElementById("excludeLiveCheckbox");
const exclude60sFilterGroup = document.getElementById("exclude60sFilterGroup");
const excludeLiveFilterGroup = document.getElementById("excludeLiveFilterGroup");
const minViewCountInput = document.getElementById("minViewCountInput");
const maxViewCountInput = document.getElementById("maxViewCountInput");
const viewCountError = document.getElementById("viewCountError");
const viewCountToggleBtn = document.getElementById("viewCountToggleBtn");
const viewCountFilterGroup = document.getElementById("viewCountFilterGroup");
const viewCountFilterBody = document.getElementById("viewCountFilterBody");
const cinemaToggleBtn = document.getElementById("cinemaToggleBtn");
const cinemaToggleLabel = cinemaToggleBtn.querySelector(".cinemaToggle__label");
const channelBar = document.getElementById("channelBar");
const channelThumb = document.getElementById("channelThumb");
const channelTitle = document.getElementById("channelTitle");
const channelHandle = document.getElementById("channelHandle");
const channelStatSubs = document.getElementById("channelStatSubs");
const channelStatVideos = document.getElementById("channelStatVideos");
const channelStatViews = document.getElementById("channelStatViews");
const videoGridCard = document.getElementById("videoGridCard");
const videoGrid = document.getElementById("videoGrid");
const videoGridEmpty = document.getElementById("videoGridEmpty");
const gridCount = document.getElementById("gridCount");

let currentChannelHandle = "";
let currentChannel = null;
let currentVideoId = "";
let currentVideos = [];
let currentCandidatePool = [];
let currentPlaybackQueue = [];
let currentQueueFilterKey = null;
let currentPoolIndex = 0;
let currentPlaylistId = "";
let currentNextPageToken = null;
let currentVideoCount = 50; // VIDEO_COUNT_DEFAULT와 동일; 상수는 아래에서 선언되므로 TDZ 회피를 위해 리터럴 사용
let isLoading = false;
let playerLoadTimeoutId = null;
const LOAD_BTN_DEFAULT_LABEL = "랜덤 영상 재생";
const LOAD_BTN_LOADING_LABEL = "불러오는 중...";
const PLAY_URL_BTN_DEFAULT_LABEL = "링크 영상 재생";
const PLAY_URL_BTN_LOADING_LABEL = "영상 불러오는 중...";
const PLAYER_LOAD_TIMEOUT_MS = 12000;
const CINEMA_MODE_KEY = "cinemaMode";
const CHANNEL_HANDLE_KEY = "channelHandle";
const PLAYED_VIDEO_IDS_KEY_PREFIX = "playedVideoIds";
const VIDEO_POOL_CACHE_KEY_PREFIX = "videoPoolCache";
const DEFAULT_STATUS_MESSAGE = "대기 중...";
const AUTOPLAY_DELAY_SEC = 3;
const PLAYBACK_QUEUE_SIZE = 50;
const VIDEO_COUNT_MIN = 1;
const VIDEO_COUNT_MAX = 200;
const VIDEO_COUNT_DEFAULT = 50;

/**
 * 조회수 범위 필터 토글 상태. true면 입력 칸이 활성화되고 필터가 적용됩니다.
 */
let viewCountFilterEnabled = false;

const autoPlayToggleBtn = document.getElementById("autoPlayToggleBtn");
const autoPlayToggleLabel = autoPlayToggleBtn.querySelector(".autoPlayToggle__label");

let autoPlayEnabled = false;
let autoPlayTimeoutId = null;
let isHandlingVideoEnd = false; // 다음 랜덤 영상 무한 로딩 방지

// YouTube embed iframe postMessage 통신용 상수
const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;

const YT_STATE_UNSTARTED = -1;

// YouTube embed 오류 코드
const YT_ERROR_INVALID_PARAM = 2;
const YT_ERROR_HTML5_PLAYER = 5;
const YT_ERROR_VIDEO_NOT_FOUND = 100;
const YT_ERROR_EMBEDDING_NOT_ALLOWED = 101;
const YT_ERROR_EMBEDDING_NOT_ALLOWED_ALT = 150;

const YT_ERROR_MESSAGES = {
  2: "잘못된 매개변수입니다.",
  5: "HTML5 플레이어 오류입니다.",
  100: "삭제/비공개 처리된 영상입니다.",
  101: "외부 사이트 재생이 제한된 영상입니다.",
  150: "외부 사이트 재생이 제한된 영상입니다."
};

const YT_API = "https://www.googleapis.com/youtube/v3";

/**
 * API 서버의 베이스 URL을 반환합니다.
 *
 * @returns {string} API 베이스 URL
 */
function getServerUrl() {
  const configuredUrl = window.__API_BASE_URL__;

  if (typeof configuredUrl === "string") {
    return configuredUrl.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

/**
 * API 경로를 절대 URL 또는 상대 URL로 조합합니다.
 *
 * @param {string} path API 경로
 * @returns {string} 요청 URL
 */
function apiUrl(path) {
  const baseUrl = getServerUrl();
  return baseUrl ? `${baseUrl}${path}` : path;
}

function setStatus(message) {
  statusEl.textContent = message;
}

/**
 * 상태 줄 오른쪽에 시청 기록 초기화 버튼을 함께 표시합니다.
 */
function setAllPlayedStatus() {
  const message = document.createElement("span");
  const resetBtn = document.createElement("button");

  message.className = "statusMessage";
  message.textContent = "이 채널의 필터 조건에 맞는 영상을 모두 재생했습니다.";

  resetBtn.type = "button";
  resetBtn.className = "statusAction";
  resetBtn.textContent = "시청했던 영상 목록 초기화";
  resetBtn.addEventListener("click", () => {
    clearPlayedVideoIds();
    setStatus("시청했던 영상 목록을 초기화했습니다.");
  });

  statusEl.replaceChildren(message, resetBtn);
}

/**
 * 영상을 불러오는 동안 두 재생 버튼을 함께 잠그거나 풉니다.
 */
function setPlaybackControlsLoading(loading, loadButtonLabel = LOAD_BTN_LOADING_LABEL) {
  loadVideoBtn.disabled = loading;
  playUrlBtn.disabled = loading;
  loadVideoBtn.textContent = loading ? loadButtonLabel : LOAD_BTN_DEFAULT_LABEL;
  playUrlBtn.textContent = loading ? PLAY_URL_BTN_LOADING_LABEL : PLAY_URL_BTN_DEFAULT_LABEL;
}

/**
 * iframe 로드 완료 또는 fallback 타이머에서 버튼 잠금을 해제합니다.
 */
function finishPlaybackLoading() {
  if (playerLoadTimeoutId) {
    clearTimeout(playerLoadTimeoutId);
    playerLoadTimeoutId = null;
  }

  isLoading = false;
  setPlaybackControlsLoading(false);
}

/**
 * 영상 링크 입력값 유무에 따라 지우기 버튼 표시 여부를 바꿉니다.
 */
function updateClearVideoUrlBtnVisibility() {
  clearVideoUrlBtn.hidden = videoUrlInput.value.length === 0;
}

function updateClearBtnVisibility() {
  clearChannelBtn.hidden = channelInput.value.length === 0;
}

function saveChannelHandle(value) {
  try {
    localStorage.setItem(CHANNEL_HANDLE_KEY, value);
  } catch (error) {
    // 시크릿 모드/쿠키 차단 등에서 localStorage가 막혀도 무시
  }
}

function clearChannelInput() {
  channelInput.value = "";
  currentChannelHandle = "";
  currentChannel = null;
  currentVideos = [];
  resetPlaybackQueueForNewChannel();
  saveChannelHandle("");
  updateClearBtnVisibility();
  renderChannelBar(null);
  if (videoGrid) {
    videoGrid.replaceChildren();
    videoGridCard.hidden = true;
  }
  if (videoGridEmpty) videoGridEmpty.hidden = true;
  setStatus(DEFAULT_STATUS_MESSAGE);
  channelInput.focus();
}

/**
 * 영상 링크 입력값을 비우고 입력 칸에 포커스를 돌립니다.
 */
function clearVideoUrlInput() {
  videoUrlInput.value = "";
  updateClearVideoUrlBtnVisibility();
  setStatus(DEFAULT_STATUS_MESSAGE);
  videoUrlInput.focus();
}

/**
 * YouTube URL 또는 영상 ID 문자열에서 videoId를 추출합니다.
 */
function parseYoutubeVideoId(value) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (host.endsWith("youtube.com")) {
      const watchId = url.searchParams.get("v");
      if (watchId) return watchId;

      const pathParts = url.pathname.split("/").filter(Boolean);
      const videoPathIndex = pathParts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
      if (videoPathIndex !== -1) {
        return pathParts[videoPathIndex + 1] || "";
      }
    }
  } catch (error) {
    return "";
  }

  return "";
}

/**
 * 입력된 YouTube 영상 링크를 현재 iframe 재생 영역에 직접 재생합니다.
 */
function playVideoFromUrl() {
  if (isLoading) {
    setStatus("현재 영상이 로드 중입니다. 잠시만 기다려주세요.");
    return;
  }

  const videoId = parseYoutubeVideoId(videoUrlInput.value);

  if (!videoId) {
    setStatus("올바른 YouTube 영상 링크를 입력하세요.");
    videoUrlInput.focus();
    return;
  }

  isLoading = true;
  setPlaybackControlsLoading(true, PLAY_URL_BTN_LOADING_LABEL);
  playVideo(videoId);
  setStatus("입력한 링크의 영상을 재생 중입니다.");
}

// ISO 8601 duration을 초 단위로 변환 (예: PT10M30S -> 630)
function parseDuration(duration) {
  if (!duration) return 0;

  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = duration.match(regex);

  if (!match) return 0;

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}

// 영상이 60초 이하인지 판별 (Shorts 대부분이 60초 이내)
function isUnder60s(video) {
  if (!video.duration) return false;
  const seconds = parseDuration(video.duration);
  return seconds <= 60;
}

// 영상이 Live인지 판별
function isLive(video) {
  const broadcastStatus = video.liveBroadcastContent || "none";
  return (
    broadcastStatus === "live" ||
    broadcastStatus === "upcoming" ||
    video.isLiveBroadcast === true ||
    Boolean(video.liveStreamingDetails)
  );
}

// 체크박스 설정과 조회수 범위에 따라 영상 필터링
function filterVideos(videos) {
  return videos.filter(passesFilters);
}

/**
 * 현재 채널 핸들에 해당하는 세션 저장소 키를 만듭니다.
 */
function getPlayedVideoIdsKey() {
  return `${PLAYED_VIDEO_IDS_KEY_PREFIX}:${currentChannelHandle.trim().toLowerCase()}`;
}

/**
 * 현재 브라우저 세션에서 이미 랜덤 재생된 영상 ID 목록을 가져옵니다.
 */
function getPlayedVideoIds() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(getPlayedVideoIdsKey()) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

/**
 * 현재 채널의 랜덤 재생 기록에 영상 ID를 추가합니다.
 */
function savePlayedVideoId(videoId) {
  if (!videoId) return;

  try {
    const playedIds = getPlayedVideoIds();

    if (!playedIds.includes(videoId)) {
      playedIds.push(videoId);
      sessionStorage.setItem(getPlayedVideoIdsKey(), JSON.stringify(playedIds));
    }
  } catch (error) {
    // sessionStorage가 막힌 환경에서는 중복 제외만 건너뜀
  }
}

/**
 * 현재 채널의 랜덤 재생 기록을 초기화합니다.
 */
function clearPlayedVideoIds() {
  try {
    sessionStorage.removeItem(getPlayedVideoIdsKey());
  } catch (error) {
    // sessionStorage가 막힌 환경에서는 무시
  }
}

/**
 * 현재 채널 핸들과 limit에 해당하는 영상 풀 캐시 키를 만듭니다.
 *
 * - limit까지 키에 포함해, 같은 채널이라도 limit이 다르면 다른 풀로 취급합니다.
 *
 * @param {string} handle 채널 핸들
 * @param {number | null} limit 최신 영상 개수 제한
 * @returns {string} sessionStorage 키
 */
function getVideoPoolCacheKey(handle, limit) {
  const handlePart = String(handle || "").trim().toLowerCase();
  const limitPart = limit === null || limit === undefined ? "all" : String(limit);
  return `${VIDEO_POOL_CACHE_KEY_PREFIX}:${handlePart}:${limitPart}`;
}

/**
 * 주어진 채널 핸들(+ limit)의 캐시된 영상 풀을 sessionStorage에서 읽어옵니다.
 *
 * @param {string} handle 채널 핸들
 * @param {number | null} limit 최신 영상 개수 제한
 * @returns {Array<any> | null} 캐시된 영상 배열, 없으면 null
 */
function loadVideoPoolCache(handle, limit) {
  if (!handle) return null;
  try {
    const raw = sessionStorage.getItem(getVideoPoolCacheKey(handle, limit));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

/**
 * 주어진 채널 핸들(+ limit)의 영상 풀을 sessionStorage에 저장합니다.
 *
 * @param {string} handle 채널 핸들
 * @param {number | null} limit 최신 영상 개수 제한
 * @param {Array<any>} videos 영상 배열
 */
function saveVideoPoolCache(handle, limit, videos) {
  if (!handle) return;
  try {
    sessionStorage.setItem(getVideoPoolCacheKey(handle, limit), JSON.stringify(videos));
  } catch (error) {
    // sessionStorage가 막혔거나 용량 초과 시 무시
  }
}

/**
 * 현재 채널의 영상 풀 캐시를 삭제합니다.
 *
 * @param {string} handle 채널 핸들
 * @param {number | null} limit 최신 영상 개수 제한
 */
function clearVideoPoolCache(handle, limit) {
  if (!handle) return;
  try {
    sessionStorage.removeItem(getVideoPoolCacheKey(handle, limit));
  } catch (error) {
    // 무시
  }
}

/**
 * 주어진 영상 배열을 Fisher-Yates 알고리즘으로 제자리 셔플합니다.
 *
 * @param {Array<any>} array 셔플할 배열
 */
function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * 현재 영상 풀과 필터로부터 셔플된 재생 큐를 만듭니다.
 *
 * - `passesFilters`로 필터링 후 셔플, 앞에서부터 최대 PLAYBACK_QUEUE_SIZE 개
 *
 * @param {Array<any>} pool 채널의 전체 영상 풀
 * @param {string} filterKey 큐에 함께 기록할 필터 식별자
 * @returns {Array<any>} 셔플된 큐
 */
function buildPlaybackQueueFromPool(pool, filterKey) {
  const filtered = pool.filter(passesFilters);
  shuffleInPlace(filtered);
  currentPlaybackQueue = filtered.slice(0, PLAYBACK_QUEUE_SIZE);
  currentQueueFilterKey = filterKey;
  return currentPlaybackQueue;
}

/**
 * 큐가 비어 있거나 필터가 바뀌었으면 새로 채웁니다.
 *
 * - 큐가 비어 있으면 시청 기록을 초기화한 뒤 풀에서 새 큐를 만듭니다.
 *   → 사용자가 명시한 "50개 다 재생 시 재생되었던 영상 제외 후 재추첨" 알고리즘.
 * - 채널이 바뀌었거나 풀 자체가 비어 있으면 큐를 비웁니다.
 */
function ensurePlaybackQueue() {
  const filterKey = buildFilterKey();

  if (!currentCandidatePool.length) {
    currentPlaybackQueue = [];
    currentQueueFilterKey = filterKey;
    return;
  }

  // 필터가 바뀌었으면 풀의 시작점부터 처음부터 다시 채웁니다.
  if (filterKey !== currentQueueFilterKey) {
    currentPoolIndex = 0;
    buildPlaybackQueueFromPool(currentCandidatePool, filterKey);
    return;
  }

  // 큐가 비어 있으면 시청 기록을 초기화한 뒤 풀에서 새 큐를 만듭니다.
  if (currentPlaybackQueue.length === 0) {
    clearPlayedVideoIds();
    currentPoolIndex = 0;
    buildPlaybackQueueFromPool(currentCandidatePool, filterKey);
    return;
  }

  // 큐가 아직 남아 있으면 그대로 유지 — 다음 takeNextFromQueue()에서 꺼냅니다.
  return;
}

/**
 * 현재 재생 큐에서 다음에 재생할 영상을 꺼냅니다.
 *
 * - 큐가 비어 있으면 시청 기록을 초기화한 뒤 큐를 다시 채웁니다.
 * - 그래도 후보가 없으면 null 을 반환합니다.
 *
 * @returns {any | null} 다음 영상 또는 null
 */
function takeNextFromQueue() {
  ensurePlaybackQueue();

  if (currentPlaybackQueue.length === 0) return null;

  // 큐에서 가장 먼저 추가된 영상을 꺼냅니다.
  const next = currentPlaybackQueue.shift();

  // 큐가 비어졌으면 다음 50개를 풀에서 가져옵니다.
  if (currentPlaybackQueue.length === 0 && currentCandidatePool.length > currentPoolIndex) {
    currentPlaybackQueue = currentCandidatePool.slice(currentPoolIndex, currentPoolIndex + PLAYBACK_QUEUE_SIZE);
    currentPoolIndex += PLAYBACK_QUEUE_SIZE;
  }

  return next;
}

/**
 * 필터링된 영상 목록에서 이번 세션에 아직 재생하지 않은 후보를 고릅니다.
 */
function getUnplayedCandidates(videos) {
  const playedIds = getPlayedVideoIds();
  return videos.filter((video) => !playedIds.includes(video.videoId));
}

async function resolveChannelId(handle) {
  try {
    const response = await fetch(apiUrl("/api/resolve-channel"), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Server error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return data.channelId;
  } catch (error) {
    console.error('Error resolving channel:', error);
    throw error;
  }
}

async function fetchUploadsPlaylist(channelId) {
  try {
    const response = await fetch(apiUrl("/api/get-uploads-playlist"), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Server error: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    return { uploadsPlaylistId: data.uploadsPlaylistId, channel: data.channel || null };
  } catch (error) {
    console.error('Error fetching uploads playlist:', error);
    throw error;
  }
}

/**
 * 업로드 재생목록의 한 페이지를 가져옵니다.
 *
 * @param {string} playlistId 업로드 재생목록 ID
 * @param {string} [pageToken=''] 다음 페이지 토큰
 * @param {number | null} [limit=null] 최신 영상 개수 제한(서버에 그대로 전달)
 * @returns {Promise<{ videos: Array<any>, nextPageToken: string | null }>} 페이지 응답
 */
async function fetchAllVideosFromPlaylist(playlistId, pageToken = '', limit = null) {
  const body = { playlistId, maxResults: 50, pageToken };
  if (limit !== null && limit !== undefined) body.limit = limit;

  const response = await fetch(apiUrl("/api/get-playlist-videos"), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`Server error: ${response.status}`);

  const data = await response.json();
  return { videos: data.videos, nextPageToken: data.nextPageToken || null };
}

/**
 * 업로드 재생목록의 영상을 페이지네이션으로 가져옵니다.
 *
 * - 각 페이지가 도착할 때마다 `onProgress({ loaded, hasMore })` 호출
 * - `nextPageToken`이 없거나 누적 개수가 `limit`에 도달하면 중단
 *
 * @param {string} playlistId 업로드 재생목록 ID
 * @param {(progress: { loaded: number, hasMore: boolean }) => void} [onProgress] 진행 콜백
 * @param {number | null} [limit=null] 최신 영상 개수 제한
 * @returns {Promise<Array<any>>} 영상 배열 (limit을 넘지 않음)
 */
async function fetchAllCandidateVideos(playlistId, onProgress, limit = null) {
  const allVideos = [];
  let pageToken = '';
  let hasMore = true;
  const notify = typeof onProgress === 'function' ? onProgress : null;
  const limitCap = (limit !== null && limit !== undefined) ? Number(limit) : null;

  while (hasMore) {
    const { videos, nextPageToken } = await fetchAllVideosFromPlaylist(playlistId, pageToken, limit);
    allVideos.push(...videos);
    if (limitCap !== null && allVideos.length >= limitCap) {
      // limit 도달: 초과분을 잘라내고 페이지네이션 종료
      allVideos.length = Math.min(allVideos.length, limitCap);
      hasMore = false;
      break;
    }
    hasMore = Boolean(nextPageToken);
    pageToken = nextPageToken || '';
    if (notify) notify({ loaded: allVideos.length, hasMore });
  }

  return allVideos;
}

// ── YouTube embed iframe 직접 postMessage 통신 ──────────────────────────
// YouTube IFrame API(www-widgetapi.js)는 HTTP 환경에서 origin을
// 강제로 HTTPS로 바꿔 postMessage 통신이 불가하므로 사용하지 않습니다.
// 대신 embed iframe에 직접 "listening" 명령을 보내 상태 변경 이벤트를 수신합니다.

/**
 * iframe이 로드된 후 YouTube embed에 "listening" 명령을 보내
 * 상태 변경 이벤트 수신을 시작합니다.
 */
function sendListeningCommand() {
  try {
    if (player.contentWindow) {
      player.contentWindow.postMessage(
        JSON.stringify({ event: "listening", id: "player", channel: "widget" }),
        "https://www.youtube.com"
      );
    }
  } catch (error) {
    // cross-origin 접근 에러 무시
  }
}

/**
 * YouTube embed에서 onError 이벤트가 발생했을 때 처리합니다.
 *
 * @param {number} errorCode YouTube embed 오류 코드
 */
function handleVideoError(errorCode) {
  finishPlaybackLoading();

  const message = YT_ERROR_MESSAGES[errorCode] || "알 수 없는 오류로 영상을 재생할 수 없습니다.";
  setStatus(`⚠️ ${message}`);

  if (autoPlayEnabled && currentChannelHandle) {
    setStatus(`⚠️ ${message} - 자동으로 다음 영상을 불러옵니다...`);
    setTimeout(() => loadRandomVideo(), 2000);
  }
}

/**
 * YouTube embed iframe의 postMessage 이벤트를 수신해
 * 영상 상태 변경(재생 시작/종료) 및 오류를 감지합니다.
 */
window.addEventListener("message", (event) => {
  if (!event.origin || !event.origin.endsWith("youtube.com")) return;

  try {
    const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    if (!data || typeof data !== "object") return;

    // ✅ infoDelivery 이벤트에서도 playerState를 감지
    if (data.event === "infoDelivery" && data.info && typeof data.info.playerState === "number") {
      const state = data.info.playerState;
      if (state === YT_STATE_PLAYING) {
        finishPlaybackLoading();
      }
      if (state === YT_STATE_ENDED) {
        handleVideoEnded();
      }
      return;
    }

    // 기존 onStateChange도 유지 (혹시 오는 경우 대비)
    if (data.event === "onStateChange") {
      if (data.info === YT_STATE_PLAYING) {
        finishPlaybackLoading();
      }
      if (data.info === YT_STATE_ENDED) {
        handleVideoEnded();
      }
      return;
    }

    if (data.event === "onError") {
      handleVideoError(data.info);
      return;
    }
  } catch (error) {
    // JSON이 아닌 메시지는 무시
  }
});

/**
 * 지정한 videoId를 iframe에 로드하고 재생합니다.
 *
 * @param {string} videoId YouTube 영상 ID
 */
function playVideo(videoId) {
  currentVideoId = videoId;
  clearAutoPlayTimeout();
  if (playerLoadTimeoutId) {
    clearTimeout(playerLoadTimeoutId);
  }
  playerLoadTimeoutId = setTimeout(finishPlaybackLoading, PLAYER_LOAD_TIMEOUT_MS);

  const origin = encodeURIComponent(window.location.origin);
  player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&controls=1&enablejsapi=1&modestbranding=1&origin=${origin}&widget_referrer=${origin}`;

  // ✅ src 변경 후 iframe이 새로 로드되므로 listening 커맨드를 다시 예약
  // (기존 player load 이벤트의 sendListeningCommand와 함께 동작)
  setTimeout(sendListeningCommand, 1000);
  setTimeout(sendListeningCommand, 2500);
}

/**
 * 큰 숫자를 한국어 단위로 줄여 표기합니다.
 *
 * @param {number | null | undefined} value 원본 숫자
 * @returns {string} 포맷된 문자열
 */
function formatStatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const n = Number(value);
  if (n < 1000) return String(n);
  if (n < 10000) return n.toLocaleString("ko-KR");
  if (n < 100000000) {
    const man = n / 10000;
    return `${man.toFixed(man >= 100 ? 0 : 1)}만`;
  }
  const eok = n / 100000000;
  return `${eok.toFixed(eok >= 100 ? 0 : 1)}억`;
}

/**
 * 초 단위 길이를 카드용 짧은 표기로 바꿉니다.
 *
 * @param {number | null | undefined} seconds 초 단위 길이
 * @returns {string} 포맷된 문자열
 */
function formatDurationShort(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "";
  if (seconds <= 60) return "Shorts";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * 채널 통계 바를 그립니다.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   handle: string,
 *   customUrl: string,
 *   thumbnail: string | null,
 *   subscribers: number | null,
 *   hiddenSubscribers: boolean,
 *   videoCount: number | null,
 *   viewCount: number | null
 * } | null} channel 정규화된 채널 정보
 */
function renderChannelBar(channel) {
  if (!channel || !channel.id) {
    channelBar.hidden = true;
    return;
  }

  if (channel.thumbnail) {
    channelThumb.src = channel.thumbnail;
    channelThumb.alt = `${channel.title || "채널"} 썸네일`;
    channelThumb.hidden = false;
  } else {
    channelThumb.removeAttribute("src");
    channelThumb.alt = "";
    channelThumb.hidden = true;
  }

  channelTitle.textContent = channel.title || "채널 정보 없음";

  if (channel.handle) {
    channelHandle.textContent = `@${channel.handle}`;
    channelHandle.hidden = false;
  } else if (channel.customUrl) {
    channelHandle.textContent = channel.customUrl;
    channelHandle.hidden = false;
  } else {
    channelHandle.textContent = "";
    channelHandle.hidden = true;
  }

  channelStatSubs.textContent = channel.hiddenSubscribers
    ? "구독자 비공개"
    : `구독자 ${formatStatNumber(channel.subscribers)}`;

  channelStatVideos.textContent = `영상 ${formatStatNumber(channel.videoCount)}`;
  channelStatViews.textContent = `조회수 ${formatStatNumber(channel.viewCount)}`;

  channelBar.hidden = false;
}

/**
 * 입력된 조회수 문자열을 정수로 변환합니다.
 *
 * - 빈 값 / 숫자 아님 / 음수 → null (필터 없음)
 *
 * @param {string} value 입력 칸의 문자열
 * @returns {number | null} 조회수 또는 null
 */
function parseViewCount(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 현재 입력 칸들의 조회수 범위를 읽어옵니다.
 *
 * @returns {{ min: number | null, max: number | null }} 범위
 */
function getViewCountRange() {
  return {
    min: parseViewCount(minViewCountInput.value),
    max: parseViewCount(maxViewCountInput.value)
  };
}

/**
 * "최신 영상 개수" 입력값을 검증해 정수 또는 null(빈 값/오류)을 돌려줍니다.
 *
 * - 빈 값 → { valid: false, error: "..." } (필수 입력)
 * - 정수가 아님 / 1 미만 / VIDEO_COUNT_MAX 초과 / 소수 → 각 한국어 메시지
 * - 통과 시 { valid: true, value: number, error: "" }
 *
 * @param {string} value 입력 칸의 문자열
 * @returns {{ valid: boolean, value: number | null, error: string }} 검증 결과
 */
function parseVideoCount(value) {
  const raw = String(value === undefined || value === null ? "" : value).trim();

  if (raw === "") {
    return { valid: false, value: null, error: "최신 영상 개수를 입력하세요." };
  }
  if (!/^\d+$/.test(raw)) {
    return { valid: false, value: null, error: "영상 개수는 1 이상의 정수로 입력해 주세요." };
  }

  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < VIDEO_COUNT_MIN) {
    return { valid: false, value: null, error: "영상 개수는 1 이상의 정수로 입력해 주세요." };
  }
  if (n > VIDEO_COUNT_MAX) {
    return { valid: false, value: null, error: `영상 개수는 최대 ${VIDEO_COUNT_MAX}개까지 가능합니다.` };
  }

  return { valid: true, value: n, error: "" };
}

/**
 * "최신 영상 개수" 입력 변경 시 검증 → 인라인 경고 → 제출 버튼 잠금.
 *
 * - 조회수 범위와 동일한 UX 패턴: 통과 시 메시지/테두리 초기화, 실패 시 빨간 테두리 + 메시지.
 */
function onVideoCountInputChange() {
  const result = parseVideoCount(videoCountInput.value);

  videoCountInput.classList.remove("is-invalid");

  if (result.valid) {
    videoCountError.hidden = true;
    videoCountError.textContent = "";
  } else {
    videoCountError.hidden = false;
    videoCountError.textContent = result.error;
    videoCountInput.classList.add("is-invalid");
  }
}

/**
 * 현재 입력값이 유효한지 검증하고 한국어 오류 메시지를 돌려줍니다.
 *
 * @returns {{ valid: boolean, error: string }} 검증 결과
 */
function validateViewCountRange() {
  const rawMin = minViewCountInput.value.trim();
  const rawMax = maxViewCountInput.value.trim();

  if (rawMin !== "" && !/^\d+$/.test(rawMin)) {
    return { valid: false, error: "최소 조회수는 정수로 입력해 주세요." };
  }
  if (rawMax !== "" && !/^\d+$/.test(rawMax)) {
    return { valid: false, error: "최대 조회수는 정수로 입력해 주세요." };
  }

  const { min, max } = getViewCountRange();
  if (min !== null && max !== null && min > max) {
    return { valid: false, error: "최소 조회수가 최대 조회수보다 큽니다." };
  }

  return { valid: true, error: "" };
}

/**
 * 단일 필터 predicate. 랜덤 재생과 그리드 렌더링이 같은 규칙을 공유하도록 합니다.
 *
 * - 호출 시점에 입력값을 다시 읽어, 실시간 필터 변경에 자동으로 반응합니다.
 * - 조회수 범위는 토글이 켜져 있을 때만 적용됩니다.
 *
 * @param {any} video 영상 객체
 * @returns {boolean} 표시 대상이면 true
 */
function passesFilters(video) {
  if (exclude60sCheckbox.checked && isUnder60s(video)) return false;
  if (excludeLiveCheckbox.checked && isLive(video)) return false;

  if (!viewCountFilterEnabled) return true;

  const { min, max } = getViewCountRange();
  const vc = video.viewCount;

  if (min !== null && (vc === null || vc < min)) return false;
  if (max !== null && (vc === null || vc > max)) return false;

  return true;
}

/**
 * 현재 영상 목록에 체크박스 필터와 조회수 범위를 적용해 표시할 항목만 돌려줍니다.
 *
 * @param {Array<any>} videos 전체 영상 목록
 * @returns {Array<any>} 필터링된 영상 목록
 */
function applyGridFilters(videos) {
  return videos.filter(passesFilters);
}

/**
 * 현재 필터 상태를 식별자 문자열로 직렬화합니다.
 *
 * - 재생 큐가 같은 필터인지 비교할 때 사용됩니다.
 * - 조회수 토글이 OFF면 토글/입력값은 키에 포함하지 않습니다.
 * - limit이 바뀌면 다른 식별자로 인식되어 큐가 새로 빌드됩니다.
 *
 * @returns {string} 필터 식별자 (예: "n:50|60s:1|live:0|vc:off" 또는 "n:200|60s:0|live:0|vc:10000-500000")
 */
function buildFilterKey() {
  const limitPart = Number.isFinite(currentVideoCount) ? `n:${currentVideoCount}` : `n:def`;
  const shorts = exclude60sCheckbox.checked ? "1" : "0";
  const live = excludeLiveCheckbox.checked ? "1" : "0";

  if (!viewCountFilterEnabled) {
    return `${limitPart}|60s:${shorts}|live:${live}|vc:off`;
  }

  const { min, max } = getViewCountRange();
  const minPart = min === null ? "*" : String(min);
  const maxPart = max === null ? "*" : String(max);
  return `${limitPart}|60s:${shorts}|live:${live}|vc:${minPart}-${maxPart}`;
}

/**
 * 비디오 그리드를 그립니다. 필터 변경 시에도 그대로 재호출됩니다.
 */
function renderVideoGrid() {
  if (!currentVideos.length) {
    videoGrid.replaceChildren();
    videoGridCard.hidden = true;
    return;
  }

  const filtered = applyGridFilters(currentVideos);
  const fragments = document.createDocumentFragment();

  filtered.forEach((video) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "videoCard";
    card.setAttribute("role", "listitem");
    card.dataset.videoId = video.videoId;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "videoCard__thumbWrap";

    if (video.thumbnail) {
      const img = document.createElement("img");
      img.className = "videoCard__thumb";
      img.src = video.thumbnail;
      img.alt = video.title || "영상 썸네일";
      img.loading = "lazy";
      thumbWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "videoCard__thumb videoCard__thumb--placeholder";
      placeholder.textContent = "썸네일 없음";
      thumbWrap.appendChild(placeholder);
    }

    const seconds = parseDuration(video.duration);
    const durationLabel = formatDurationShort(seconds);
    if (durationLabel) {
      const badge = document.createElement("span");
      const isShorts = durationLabel === "Shorts";
      badge.className = isShorts ? "videoCard__duration videoCard__duration--shorts" : "videoCard__duration";
      badge.textContent = durationLabel;
      thumbWrap.appendChild(badge);
    }

    if (isLive(video)) {
      const liveBadge = document.createElement("span");
      liveBadge.className = "videoCard__liveBadge";
      liveBadge.textContent = "LIVE";
      thumbWrap.appendChild(liveBadge);
    }

    const title = document.createElement("div");
    title.className = "videoCard__title";
    title.textContent = video.title || "제목 없음";
    title.title = video.title || "제목 없음";

    const views = document.createElement("div");
    views.className = "videoCard__views";
    views.textContent = `조회수 ${formatStatNumber(video.viewCount)}`;

    card.appendChild(thumbWrap);
    card.appendChild(title);
    card.appendChild(views);
    fragments.appendChild(card);
  });

  videoGrid.replaceChildren(fragments);
  videoGridCard.hidden = false;
  videoGridEmpty.hidden = filtered.length > 0;
  gridCount.textContent = filtered.length === currentVideos.length
    ? `총 ${currentVideos.length}개`
    : `표시 ${filtered.length} / ${currentVideos.length}개`;

  const moreBtn = document.getElementById("loadMoreBtn");
  if (moreBtn) moreBtn.hidden = !currentNextPageToken;
}

/**
 * 비디오 카드를 클릭했을 때 해당 영상을 바로 재생합니다.
 *
 * @param {string} videoId 재생할 영상 ID
 * @param {string} title 상태 표시용 제목
 */
function playVideoFromGrid(videoId, title) {
  if (isLoading) {
    setStatus("현재 영상이 로드 중입니다. 잠시만 기다려주세요.");
    return;
  }

  isLoading = true;
  setPlaybackControlsLoading(true, PLAY_URL_BTN_LOADING_LABEL);
  currentVideoId = videoId;
  savePlayedVideoId(videoId);
  playVideo(videoId);
  setStatus(`재생 중: ${title}`);
  window.scrollTo({ top: 0, behavior: "smooth" }); // 영상 재생 시 상단으로 스크롤
}

/**
 * 채널이 바뀌었거나 풀이 비어 있을 때 큐/인덱스 상태를 초기화합니다.
 *
 * - 채널 A의 큐가 남아 있는 채로 채널 B의 풀을 받아와도 B 영상으로만 재생되도록 합니다.
 */
function resetPlaybackQueueForNewChannel() {
  currentPlaybackQueue = [];
  currentQueueFilterKey = null;
  currentPoolIndex = 0;
}

async function loadRandomVideo() {
  clearAutoPlayTimeout();
  // 코드 레벨 중복 호출 가드
  if (isLoading) return;

  // "최신 영상 개수" 필수/범위 검증 — 실패 시 즉시 안내하고 중단합니다.
  const videoCountCheck = parseVideoCount(videoCountInput.value);
  if (!videoCountCheck.valid) {
    setStatus(videoCountCheck.error);
    onVideoCountInputChange();
    videoCountInput.focus();
    return;
  }
  currentVideoCount = videoCountCheck.value;

  isLoading = true;
  let startedPlayback = false;
  setPlaybackControlsLoading(true);

  // 채널이 바뀌었으므로 이전 채널의 큐/인덱스를 깨끗이 비웁니다.
  resetPlaybackQueueForNewChannel();

  try {
    setStatus("채널 확인 중...");
    const channelId = await resolveChannelId(currentChannelHandle);

    if (!channelId) {
      setStatus("채널을 찾지 못했습니다. 핸들을 확인하세요.");
      return;
    }

    setStatus("영상 목록 불러오는 중...");
    const { uploadsPlaylistId, channel } = await fetchUploadsPlaylist(channelId);
    currentChannel = channel;
    currentPlaylistId = uploadsPlaylistId;
    renderChannelBar(channel);

    if (!uploadsPlaylistId) {
      setStatus("업로드 재생목록을 찾을 못했습니다.");
      return;
    }

    // 풀 우선순위: ① 캐시 (같은 채널 + 같은 limit 재방문) ② 네트워크 fetch
    let pool = loadVideoPoolCache(currentChannelHandle, currentVideoCount);

    if (!pool) {
      // 캐시 미스: 페이지네이션으로 최신 N개까지 fetch
      const firstPage = await fetchAllVideosFromPlaylist(uploadsPlaylistId, '', currentVideoCount);
      pool = [...firstPage.videos];

      if (firstPage.nextPageToken) {
        const totalProgress = { loaded: pool.length, hasMore: true };
        setStatus(buildCandidateLoadMessage(totalProgress));

        try {
          const allVideos = await fetchAllCandidateVideos(
            uploadsPlaylistId,
            (progress) => setStatus(buildCandidateLoadMessage(progress)),
            currentVideoCount
          );
          pool = allVideos;
        } catch (error) {
          console.error('Error fetching remaining videos:', error);
          // 부분 풀만이라도 진행
        }
      }

      saveVideoPoolCache(currentChannelHandle, currentVideoCount, pool);
    } else {
      setStatus(`캐시에서 최신 ${pool.length}개 로드, 랜덤 선택 중...`);
    }

    currentCandidatePool = pool;

    if (!pool.length) {
      setStatus("재생할 영상을 찾지 못했습니다.");
      return;
    }

    // 그리드 표시용: 풀의 첫 50개 (기존 UX 유지)
    currentVideos = pool.slice(0, 50);
    currentNextPageToken = pool.length > 50 ? "" : null; // 풀에서 그리드 페이지네이션은 더 이상 필요 없음
    renderVideoGrid();

    // 큐 빌드 + 픽업
    pickAndPlayNext();
    startedPlayback = true;
  } catch (error) {
    console.error(error);
    if (error.status === 404) {
      setStatus("채널을 찾지 못했습니다. 핸들 또는 채널 URL을 확인하세요.");
      return;
    }
    setStatus("오류가 발생했습니다. 서버가 실행 중인지 확인하세요.");
  } finally {
    if (!startedPlayback) {
      isLoading = false;
      setPlaybackControlsLoading(false);
    }
  }
}

/**
 * 현재 후보 풀 + 필터에서 다음에 재생할 영상을 큐에서 꺼내 재생합니다.
 *
 * - 큐가 비어 있으면 자동으로 시청 기록을 초기화한 뒤 큐를 새로 채웁니다.
 * - 후보가 아예 없으면 상태 메시지로 안내하고 종료합니다.
 */
function pickAndPlayNext() {
  // 큐가 비어 있거나 필터가 바뀌었으면 (재)빌드
  ensurePlaybackQueue();

  if (currentPlaybackQueue.length === 0) {
    setStatus("필터 조건에 맞는 영상이 없습니다. 제외 옵션을 끄거나 다른 핸들을 시도해 보세요.");
    return;
  }

  const next = takeNextFromQueue();

  if (!next) {
    setStatus("필터 조건에 맞는 영상이 없습니다. 제외 옵션을 끄거나 다른 핸들을 시도해 보세요.");
    return;
  }

  savePlayedVideoId(next.videoId);
  setStatus(`재생 중: ${next.title}`);
  playVideo(next.videoId);
}

/**
 * 후보 풀 누적 진행 상태를 한국어 메시지로 변환합니다.
 *
 * @param {{ loaded: number, hasMore: boolean }} progress 진행 상태
 * @returns {string} 표시 메시지
 */
function buildCandidateLoadMessage(progress) {
  if (progress.hasMore) {
    return `영상 목록 불러오는 중... (${progress.loaded}개+)`;
  }
  return `영상 ${progress.loaded}개 로드 완료, 랜덤 선택 중...`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  currentChannelHandle = channelInput.value.trim();

  if (!currentChannelHandle) {
    setStatus("채널 핸들을 입력하세요.");
    return;
  }

  const validation = validateViewCountRange();
  if (!validation.valid) {
    setStatus("조회수 범위를 올바르게 입력하세요.");
    return;
  }

  saveChannelHandle(currentChannelHandle);
  await loadRandomVideo();
});

// 입력 변화에 따라 클리어 버튼 표시/숨김
videoUrlInput.addEventListener("input", updateClearVideoUrlBtnVisibility);
videoUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    playVideoFromUrl();
  }
});
channelInput.addEventListener("input", () => {
  updateClearBtnVisibility();
});

// "최신 영상 개수" 입력 변화 시 실시간 검증
[videoCountInput].forEach((el) => {
  el.addEventListener("input", onVideoCountInputChange);
  el.addEventListener("change", onVideoCountInputChange);
});

// 클리어 버튼 동작
clearVideoUrlBtn.addEventListener("click", clearVideoUrlInput);
clearChannelBtn.addEventListener("click", clearChannelInput);
playUrlBtn.addEventListener("click", playVideoFromUrl);
player.addEventListener("load", () => {
  finishPlaybackLoading();
  // iframe 로드 완료 후 listening 명령을 보내 상태 이벤트 수신 시작
  // 약간의 지연을 두어 iframe 내부 초기화 완료를 기다림
  setTimeout(sendListeningCommand, 500);
  setTimeout(sendListeningCommand, 1500);
});

// 비디오 그리드 클릭 → 즉시 재생
videoGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".videoCard");
  if (!card) return;
  const videoId = card.dataset.videoId;
  if (!videoId) return;
  const title = card.querySelector(".videoCard__title")?.textContent || "제목 없음";
  playVideoFromGrid(videoId, title);
});

// 체크박스 필터 변화에 그리드만 다시 그림 (랜덤 재생 다시 호출 X) + 박스 흐림 동기화
exclude60sCheckbox.addEventListener("change", () => {
  exclude60sFilterGroup.classList.toggle("is-disabled", !exclude60sCheckbox.checked);
  if (currentVideos.length) renderVideoGrid();
});
excludeLiveCheckbox.addEventListener("change", () => {
  excludeLiveFilterGroup.classList.toggle("is-disabled", !excludeLiveCheckbox.checked);
  if (currentVideos.length) renderVideoGrid();
});

/**
 * 조회수 범위 입력 변경 시 검증 → 인라인 경고 → 제출 버튼 잠금.
 *
 * - 영상 목록은 즉시 재렌더하지 않습니다. 다음 "랜덤 영상 재생" 클릭 시 적용됩니다.
 * - 체크박스 필터와 달리, 입력 중에는 그저 검증 피드백만 갱신합니다.
 * - "최소 조회수가 최대 조회수보다 큽니다" 같이 양쪽 비교 메시지는 양쪽 입력 모두
 *   빨간 테두리로 표시하는 것이 직관적이므로 `error.includes("최소")` 만 검사합니다.
 */
function onViewCountInputChange() {
  // 토글이 꺼져 있으면 입력 자체가 disabled 라 이벤트가 거의 발생하지 않지만,
  // 키보드/IME 등 일부 환경에서 호출될 수 있으므로 명시적으로 무시합니다.
  if (!viewCountFilterEnabled) return;

  const result = validateViewCountRange();

  [minViewCountInput, maxViewCountInput].forEach((el) => {
    el.classList.remove("is-invalid");
  });

  if (result.valid) {
    viewCountError.hidden = true;
    viewCountError.textContent = "";
    loadVideoBtn.disabled = false;
  } else {
    viewCountError.hidden = false;
    viewCountError.textContent = result.error;
    if (result.error.includes("최소")) minViewCountInput.classList.add("is-invalid");
    if (result.error.includes("최대")) maxViewCountInput.classList.add("is-invalid");
    loadVideoBtn.disabled = true;
  }
}

/**
 * 조회수 범위 토글 상태를 적용합니다.
 *
 * - 입력 칸의 disabled 속성 동기화
 * - 박스 영역 흐림 효과(is-disabled) 동기화
 * - 토글 스위치의 aria-checked / 시각 상태 갱신
 * - 본문 표시/숨김
 * - 토글 OFF 시 기존 입력값 검증 메시지/빨간 테두리 초기화
 *
 * @param {boolean} enabled 토글 ON/OFF
 */
function setViewCountFilterEnabled(enabled) {
  viewCountFilterEnabled = enabled;

  viewCountToggleBtn.setAttribute("aria-checked", String(enabled));
  viewCountFilterGroup.classList.toggle("is-disabled", !enabled);
  viewCountFilterBody.hidden = !enabled;
  minViewCountInput.disabled = !enabled;
  maxViewCountInput.disabled = !enabled;

  if (!enabled) {
    // OFF 시 기존 에러 상태/빨간 테두리 정리
    viewCountError.hidden = true;
    viewCountError.textContent = "";
    [minViewCountInput, maxViewCountInput].forEach((el) => el.classList.remove("is-invalid"));
    loadVideoBtn.disabled = false;
  }
}

viewCountToggleBtn.addEventListener("click", () => {
  setViewCountFilterEnabled(!viewCountFilterEnabled);
});

// 초기 상태 적용 (HTML 기본 disabled/aria-checked="false" 와 동기화)
setViewCountFilterEnabled(false);

[minViewCountInput, maxViewCountInput].forEach((el) => {
  el.addEventListener("input", onViewCountInputChange);
  el.addEventListener("change", onViewCountInputChange);
});

// "다른 랜덤 영상" 버튼은 사용하지 않음
// randomAgainBtn.addEventListener("click", async () => {
//   if (!currentChannelHandle) return;
//   await loadRandomVideo();
// });

// 영화관 모드 토글
function setCinemaMode(enabled) {
  document.body.classList.toggle("cinema", enabled);
  cinemaToggleBtn.setAttribute("aria-pressed", String(enabled));
  cinemaToggleLabel.textContent = enabled ? "기본 모드" : "영화관 모드";
  try {
    localStorage.setItem(CINEMA_MODE_KEY, String(enabled));
  } catch (error) {
    // 시크릿 모드/쿠키 차단 등에서 localStorage가 막혀도 무시
  }
}

cinemaToggleBtn.addEventListener("click", () => {
  setCinemaMode(!document.body.classList.contains("cinema"));
});

// 페이지 로드 시 영화관 모드 복원
try {
  if (localStorage.getItem(CINEMA_MODE_KEY) === "true") {
    setCinemaMode(true);
  }
} catch (error) {
  // localStorage 접근 실패 시 기본 모드로 시작
}

// ── 자동 재생 ────────────────────────────────────────────
function handleVideoEnded() {
  // ✅ 이미 처리 중이면 즉시 리턴
  if (isHandlingVideoEnd) return;
  if (!autoPlayEnabled || !currentChannelHandle || isLoading) return;

  isHandlingVideoEnd = true; // ← 플래그 설정

  let countdown = AUTOPLAY_DELAY_SEC;
  setStatus(`자동 재생: ${countdown}초 후 다음 영상 재생...`);
  autoPlayTimeoutId = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      setStatus(`자동 재생: ${countdown}초 후 다음 영상 재생...`);
    } else {
      clearInterval(autoPlayTimeoutId);
      autoPlayTimeoutId = null;
      isHandlingVideoEnd = false; // ← 플래그 해제
      loadRandomVideo();
    }
  }, 1000);
}

function clearAutoPlayTimeout() {
  if (autoPlayTimeoutId) {
    clearInterval(autoPlayTimeoutId);
    autoPlayTimeoutId = null;
  }
  isHandlingVideoEnd = false; // ← 플래그 해제
}

function setAutoPlay(enabled) {
  autoPlayEnabled = enabled;
  autoPlayToggleBtn.setAttribute("aria-pressed", String(enabled));
  autoPlayToggleLabel.textContent = enabled ? "자동 재생 켜짐" : "자동 재생";
  if (!enabled) {
    clearAutoPlayTimeout();
    if (!isLoading) {
      setStatus(DEFAULT_STATUS_MESSAGE);
    }
  }
}

async function loadMoreVideos() {
  if (!currentPlaylistId || !currentNextPageToken || isLoading) return;

  isLoading = true;
  const moreBtn = document.getElementById("loadMoreBtn");
  if (moreBtn) moreBtn.disabled = true;

  try {
    const { videos, nextPageToken } = await fetchAllVideosFromPlaylist(currentPlaylistId, currentNextPageToken);
    currentVideos = [...currentVideos, ...videos];
    currentNextPageToken = nextPageToken;
    renderVideoGrid();
  } catch (error) {
    console.error(error);
  } finally {
    isLoading = false;
    if (moreBtn) {
      moreBtn.disabled = false;
      moreBtn.hidden = !currentNextPageToken; // 더 없으면 숨김
    }
  }
}

// YouTube 영상 종료 감지는 embed iframe의 postMessage를 통해 수행됩니다.
// (window "message" 이벤트 핸들러 참조)

autoPlayToggleBtn.addEventListener("click", () => {
  setAutoPlay(!autoPlayEnabled);
});

// 페이지 로드 시 채널 핸들 복원
try {
  const savedHandle = localStorage.getItem(CHANNEL_HANDLE_KEY);
  if (savedHandle) {
    channelInput.value = savedHandle;
    currentChannelHandle = savedHandle;
  }
} catch (error) {
  // localStorage 접근 실패 시 빈 입력으로 시작
}
updateClearBtnVisibility();
updateClearVideoUrlBtnVisibility();

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  if (e.key === "f" || e.key === "F" || e.key === "ㄹ") {
    e.preventDefault();

    if (!document.fullscreenElement) {
      player.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  }
});

document.getElementById("loadMoreBtn").addEventListener("click", loadMoreVideos);
