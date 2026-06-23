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

let currentChannelHandle = "";
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
const DEFAULT_STATUS_MESSAGE = "대기 중...";

// 로컬 서버 주소 (로컬: http://localhost:3000, 배포 시 서버 주소로 변경)
const SERVER_URL = "http://localhost:3000";

const YT_API = "https://www.googleapis.com/youtube/v3";

function setStatus(message) {
  statusEl.textContent = message;
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
  saveChannelHandle("");
  updateClearBtnVisibility();
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

async function resolveChannelId(handle) {
  try {
    const response = await fetch(`${SERVER_URL}/api/resolve-channel`, {
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

async function fetchUploadsPlaylistId(channelId) {
  try {
    const response = await fetch(`${SERVER_URL}/api/get-uploads-playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.uploadsPlaylistId;
  } catch (error) {
    console.error('Error fetching uploads playlist:', error);
    throw error;
  }
}

async function fetchAllVideosFromPlaylist(playlistId, maxTotal = 200) {
  try {
    const response = await fetch(`${SERVER_URL}/api/get-playlist-videos`, {
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
    const uploadsPlaylistId = await fetchUploadsPlaylistId(channelId);

    if (!uploadsPlaylistId) {
      setStatus("업로드 재생목록을 찾을 못했습니다.");
      return;
    }

    const videos = await fetchAllVideosFromPlaylist(uploadsPlaylistId);
    currentVideos = videos;

    if (!videos.length) {
      setStatus("재생할 영상을 찾지 못했습니다.");
      return;
    }

    const filtered = filterVideos(videos);

    if (!filtered.length) {
      setStatus("필터 조건에 맞는 영상이 없습니다. 제외 옵션을 끄거나 다른 핸들을 시도해 보세요.");
      return;
    }

    const random = filtered[Math.floor(Math.random() * filtered.length)];
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
