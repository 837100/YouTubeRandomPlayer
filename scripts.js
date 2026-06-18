const form = document.getElementById("creatorForm");
const channelInput = document.getElementById("channelInput");
const statusEl = document.getElementById("status");
const player = document.getElementById("player");
const randomAgainBtn = document.getElementById("randomAgainBtn");

let currentChannelHandle = "";
let currentVideoId = "";

// 로컬 서버 주소 (로컬: http://localhost:3000, 배포 시 서버 주소로 변경)
const SERVER_URL = "http://localhost:3000";

const YT_API = "https://www.googleapis.com/youtube/v3";

function setStatus(message) {
  statusEl.textContent = message;
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
  randomAgainBtn.disabled = false;
}

async function loadRandomVideo() {
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
      setStatus("업로드 재생목록을 찾지 못했습니다.");
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
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  currentChannelHandle = channelInput.value.trim();

  if (!currentChannelHandle) {
    setStatus("채널 핸들을 입력하세요.");
    return;
  }

  randomAgainBtn.disabled = true;
  await loadRandomVideo();
});

randomAgainBtn.addEventListener("click", async () => {
  if (!currentChannelHandle) return;
  await loadRandomVideo();
});