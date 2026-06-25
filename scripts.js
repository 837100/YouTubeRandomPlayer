const form = document.getElementById("creatorForm");
const videoUrlInput = document.getElementById("videoUrlInput");
const clearVideoUrlBtn = document.getElementById("clearVideoUrlBtn");
const playUrlBtn = document.getElementById("playUrlBtn");
const channelInput = document.getElementById("channelInput");
const clearChannelBtn = document.getElementById("clearChannelBtn");
const statusEl = document.getElementById("status");
const player = document.getElementById("player");
const loadVideoBtn = document.getElementById("loadVideoBtn");
// "다른 랜덤 영상" 버튼은 사용하지 않음
// const randomAgainBtn = document.getElementById("randomAgainBtn");
const exclude60sCheckbox = document.getElementById("exclude60sCheckbox");
const excludeLiveCheckbox = document.getElementById("excludeLiveCheckbox");
const cinemaToggleBtn = document.getElementById("cinemaToggleBtn");
const cinemaToggleLabel = cinemaToggleBtn.querySelector(".cinemaToggle__label");
const watchStatsBtn = document.getElementById("watchStatsBtn");
const watchStatsToday = document.getElementById("watchStatsToday");
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
const DEFAULT_STATUS_MESSAGE = "대기 중...";
const WATCH_BADGE_REFRESH_MS = 1000;

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

// 체크박스 설정에 따라 영상 필터링
function filterVideos(videos) {
  return videos.filter(video => {
    if (exclude60sCheckbox.checked && isUnder60s(video)) {
      return false;
    }
    if (excludeLiveCheckbox.checked && isLive(video)) {
      return false;
    }
    return true;
  });
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

async function fetchAllVideosFromPlaylist(playlistId, maxTotal = 200) {
  try {
    const response = await fetch(apiUrl("/api/get-playlist-videos"), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId, maxResults: 50 })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.videos;
  } catch (error) {
    console.error('Error fetching playlist videos:', error);
    throw error;
  }
}

function playVideo(videoId) {
  currentVideoId = videoId;
  if (playerLoadTimeoutId) {
    clearTimeout(playerLoadTimeoutId);
  }
  playerLoadTimeoutId = setTimeout(finishPlaybackLoading, PLAYER_LOAD_TIMEOUT_MS);
  player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&controls=1&enablejsapi=1&modestbranding=1`;
  // "다른 랜덤 영상" 버튼은 사용하지 않음
  // randomAgainBtn.disabled = false;

  if (window.WatchTime) {
    window.WatchTime.attachToPlayer(player);
  }
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

  if (window.WatchTime && (channel.handle || channel.customUrl)) {
    const handleValue = channel.handle || channel.customUrl.replace(/^@+/, "");
    window.WatchTime.recordChannelPlay(handleValue);
  }
}

/**
 * 현재 영상 목록에 체크박스 필터를 적용해 표시할 항목만 돌려줍니다.
 *
 * @param {Array<any>} videos 전체 영상 목록
 * @returns {Array<any>} 필터링된 영상 목록
 */
function applyGridFilters(videos) {
  return videos.filter((video) => {
    if (exclude60sCheckbox.checked && isUnder60s(video)) return false;
    if (excludeLiveCheckbox.checked && isLive(video)) return false;
    return true;
  });
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

    card.appendChild(thumbWrap);
    card.appendChild(title);
    fragments.appendChild(card);
  });

  videoGrid.replaceChildren(fragments);
  videoGridCard.hidden = false;
  videoGridEmpty.hidden = filtered.length > 0;
  gridCount.textContent = filtered.length === currentVideos.length
    ? `총 ${currentVideos.length}개 (최대 200개 표시)`
    : `표시 ${filtered.length} / ${currentVideos.length}개`;
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
}

async function loadRandomVideo() {
  // 코드 레벨 중복 호출 가드
  if (isLoading) return;
  isLoading = true;
  let startedPlayback = false;
  setPlaybackControlsLoading(true);

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
    renderChannelBar(channel);

    if (!uploadsPlaylistId) {
      setStatus("업로드 재생목록을 찾을 못했습니다.");
      return;
    }

    const videos = await fetchAllVideosFromPlaylist(uploadsPlaylistId);
    currentVideos = videos;
    renderVideoGrid();

    if (!videos.length) {
      setStatus("재생할 영상을 찾지 못했습니다.");
      return;
    }

    const filtered = filterVideos(videos);

    if (!filtered.length) {
      setStatus("필터 조건에 맞는 영상이 없습니다. 제외 옵션을 끄거나 다른 핸들을 시도해 보세요.");
      return;
    }

    let candidates = getUnplayedCandidates(filtered);

    if (!candidates.length) {
      setAllPlayedStatus();
      return;
    }

    const random = candidates[Math.floor(Math.random() * candidates.length)];
    savePlayedVideoId(random.videoId);
    setStatus(`재생 중: ${random.title}`);
    playVideo(random.videoId);
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  currentChannelHandle = channelInput.value.trim();

  if (!currentChannelHandle) {
    setStatus("채널 핸들을 입력하세요.");
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

// 클리어 버튼 동작
clearVideoUrlBtn.addEventListener("click", clearVideoUrlInput);
clearChannelBtn.addEventListener("click", clearChannelInput);
playUrlBtn.addEventListener("click", playVideoFromUrl);
player.addEventListener("load", () => {
  finishPlaybackLoading();
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

// 필터 체크박스 변화에 그리드만 다시 그림 (랜덤 재생 다시 호출 X)
exclude60sCheckbox.addEventListener("change", () => {
  if (currentVideos.length) renderVideoGrid();
});
excludeLiveCheckbox.addEventListener("change", () => {
  if (currentVideos.length) renderVideoGrid();
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

// ── 시청 시간 추적 / 시각화 통합 ──────────────────────────
function refreshWatchBadge() {
  if (!watchStatsToday || !window.WatchTime) return;
  const seconds = window.WatchTime.getTodayTotal();
  watchStatsToday.textContent = window.WatchTime.formatDuration(seconds);
}

if (window.WatchTime) {
  window.WatchTime.init();
  refreshWatchBadge();
  setInterval(refreshWatchBadge, WATCH_BADGE_REFRESH_MS);
}

if (window.WatchChart) {
  window.WatchChart.init();
}

if (watchStatsBtn) {
  watchStatsBtn.addEventListener("click", () => {
    if (window.WatchChart) window.WatchChart.open();
  });
}
