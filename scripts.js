const form = document.getElementById("creatorForm");
const channelInput = document.getElementById("channelInput");
const statusEl = document.getElementById("status");
const player = document.getElementById("player");
const loadVideoBtn = document.getElementById("loadVideoBtn");
// "다른 랜덤 영상" 버튼은 사용하지 않음
// const randomAgainBtn = document.getElementById("randomAgainBtn");
const excludeShortsCheckbox = document.getElementById("excludeShortsCheckbox");
const excludeLiveCheckbox = document.getElementById("excludeLiveCheckbox");
const cinemaToggleBtn = document.getElementById("cinemaToggleBtn");
const cinemaToggleLabel = cinemaToggleBtn.querySelector(".cinemaToggle__label");

let currentChannelHandle = "";
let currentVideoId = "";
let currentVideos = [];
let isLoading = false;
const LOAD_BTN_DEFAULT_LABEL = "랜덤 영상 재생";
const LOAD_BTN_LOADING_LABEL = "불러오는 중...";
const CINEMA_MODE_KEY = "cinemaMode";

// 로컬 서버 주소 (로컬: http://localhost:3000, 배포 시 서버 주소로 변경)
const SERVER_URL = "http://localhost:3000";

const YT_API = "https://www.googleapis.com/youtube/v3";

function setStatus(message) {
  statusEl.textContent = message;
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

// 영상이 Shorts인지 판별 (60초 이하)
function isShorts(video) {
  if (!video.duration) return false;
  const seconds = parseDuration(video.duration);
  return seconds <= 60;
}

// 영상이 Live인지 판별
function isLive(video) {
  return video.liveBroadcastContent === 'live' || video.liveBroadcastContent === 'upcoming';
}

// 체크박스 설정에 따라 영상 필터링
function filterVideos(videos) {
  return videos.filter(video => {
    if (excludeShortsCheckbox.checked && isShorts(video)) {
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
      throw new Error(`Server error: ${response.status}`);
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
  player.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&controls=1&enablejsapi=1&modestbranding=1`;
  // "다른 랜덤 영상" 버튼은 사용하지 않음
  // randomAgainBtn.disabled = false;
}

async function loadRandomVideo() {
  // 코드 레벨 중복 호출 가드
  if (isLoading) return;
  isLoading = true;
  loadVideoBtn.disabled = true;
  loadVideoBtn.textContent = LOAD_BTN_LOADING_LABEL;

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

    if (!videos.length) {
      setStatus("재생할 영상을 찾지 못했습니다.");
      return;
    }

    const random = videos[Math.floor(Math.random() * videos.length)];
    setStatus(`재생 중: ${random.title}`);
    playVideo(random.videoId);
  } catch (error) {
    console.error(error);
    setStatus("오류가 발생했습니다. 서버가 실행 중인지 확인하세요.");
  } finally {
    isLoading = false;
    loadVideoBtn.disabled = false;
    loadVideoBtn.textContent = LOAD_BTN_DEFAULT_LABEL;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  currentChannelHandle = channelInput.value.trim();

  if (!currentChannelHandle) {
    setStatus("채널 핸들을 입력하세요.");
    return;
  }

  await loadRandomVideo();
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