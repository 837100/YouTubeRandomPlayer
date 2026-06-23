const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// CORS 활성화
app.use(cors());
app.use(express.json());

// APIKEY.txt에서 API 키 읽기
let apiKey = '';
try {
  apiKey = fs.readFileSync(path.join(__dirname, 'APIKEY.txt'), 'utf-8').trim();
  console.log('✓ API 키 로드 완료');
} catch (error) {
  console.error('✗ API 키 파일을 찾을 수 없습니다:', error.message);
}

const YT_API = "https://www.googleapis.com/youtube/v3";

/**
 * 사용자가 입력한 채널 핸들/URL/ID를 서버에서 처리하기 쉬운 형태로 정리합니다.
 */
function normalizeChannelInput(value) {
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

/**
 * YouTube API 응답을 JSON으로 읽고 API 오류를 일반 Error로 올립니다.
 */
async function fetchYouTubeJson(url) {
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    const message = data.error?.message || `YouTube API error: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

/**
 * 채널 ID로 채널 존재 여부를 확인합니다.
 */
async function resolveChannelById(channelId) {
  if (!channelId) return '';

  const data = await fetchYouTubeJson(
    `${YT_API}/channels?part=id&id=${encodeURIComponent(channelId)}&key=${apiKey}`
  );

  return data.items?.[0]?.id || '';
}

/**
 * YouTube 핸들로 채널 ID를 조회합니다. API가 @ 포함/미포함 중 하나만 받는 경우를 대비해 둘 다 시도합니다.
 */
async function resolveChannelByHandle(handle) {
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
 */
async function resolveChannelBySearch(searchQuery) {
  if (!searchQuery) return '';

  const data = await fetchYouTubeJson(
    `${YT_API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`
  );

  return data.items?.[0]?.snippet?.channelId || '';
}

// 채널 ID 해결 엔드포인트
app.post('/api/resolve-channel', async (req, res) => {
  try {
    const { handle } = req.body;
    
    if (!handle) {
      return res.status(400).json({ error: '채널 핸들이 필요합니다' });
    }

    const normalized = normalizeChannelInput(handle);

    const channelId =
      await resolveChannelById(normalized.channelId) ||
      await resolveChannelByHandle(normalized.handle) ||
      await resolveChannelBySearch(normalized.searchQuery);

    if (!channelId) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    res.json({ channelId });
  } catch (error) {
    console.error('Error resolving channel:', error);
    res.status(500).json({ error: '채널 해결 중 오류 발생' });
  }
});

// Uploads 플레이리스트 ID 조회 엔드포인트
app.post('/api/get-uploads-playlist', async (req, res) => {
  try {
    const { channelId } = req.body;
    
    if (!channelId) {
      return res.status(400).json({ error: '채널 ID가 필요합니다' });
    }

    const response = await fetch(
      `${YT_API}/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${apiKey}`
    );
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: '채널 정보를 찾을 수 없습니다' });
    }

    const uploadsPlaylistId = data.items[0].contentDetails.relatedPlaylists.uploads;
    res.json({ uploadsPlaylistId });
  } catch (error) {
    console.error('Error getting uploads playlist:', error);
    res.status(500).json({ error: 'Uploads 플레이리스트 조회 중 오류 발생' });
  }
});

// 플레이리스트 영상 조회 엔드포인트
app.post('/api/get-playlist-videos', async (req, res) => {
  try {
    const { playlistId, maxResults = 50 } = req.body;
    
    if (!playlistId) {
      return res.status(400).json({ error: '플레이리스트 ID가 필요합니다' });
    }

    const videos = [];
    let pageToken = '';
    const maxTotal = 200;

    while (videos.length < maxTotal) {
      const url = 
        `${YT_API}/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}` +
        `&maxResults=${maxResults}&key=${apiKey}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

      const response = await fetch(url);
      const data = await response.json();
      
      const items = data.items || [];
      
      // 비디오 ID 수집
      const videoIds = items
        .map((item) => item.contentDetails?.videoId)
        .filter(Boolean);

      // 비디오 상세 정보 조회 (duration 및 liveBroadcastContent 확인)
      if (videoIds.length > 0) {
        const videosUrl = 
          `${YT_API}/videos?part=contentDetails,snippet,liveStreamingDetails&id=${encodeURIComponent(videoIds.join(','))}&key=${apiKey}`;
        
        const videosResponse = await fetch(videosUrl);
        const videosData = await videosResponse.json();
        const videoDetailsMap = {};
        
        if (videosData.error) {
          console.error('YouTube videos API error:', videosData.error);
          return res.status(502).json({ error: 'YouTube 영상 상세 정보 조회 중 오류 발생' });
        }

        videosData.items?.forEach(video => {
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

        // 비디오 정보와 상세 정보 결합
        items.forEach((item) => {
          const videoId = item.contentDetails?.videoId;
          const details = videoDetailsMap[videoId] || {};
          
          videos.push({
            videoId: videoId,
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

    res.json({ videos: videos.slice(0, maxTotal) });
  } catch (error) {
    console.error('Error getting playlist videos:', error);
    res.status(500).json({ error: '영상 목록 조회 중 오류 발생' });
  }
});

// 루트 경로 - 서버 상태 안내
app.get('/', (req, res) => {
  res.json({ 
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
});

// 헬스 체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', apiKeyLoaded: !!apiKey });
});

app.listen(PORT, () => {
  console.log(`🚀 서버가 http://localhost:${PORT}에서 실행 중입니다`);
  console.log(`API 키 로드 상태: ${apiKey ? '✓ 로드됨' : '✗ 미로드'}`);
});
