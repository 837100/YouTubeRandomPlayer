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

// 채널 ID 해결 엔드포인트
app.post('/api/resolve-channel', async (req, res) => {
  try {
    const { handle } = req.body;
    
    if (!handle) {
      return res.status(400).json({ error: '채널 핸들이 필요합니다' });
    }

    const searchQuery = `@${handle}`;
    const response = await fetch(
      `${YT_API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(searchQuery)}&key=${apiKey}`
    );
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    const channelId = data.items[0].snippet.channelId;
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
        `${YT_API}/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}` +
        `&maxResults=${maxResults}&key=${apiKey}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

      const response = await fetch(url);
      const data = await response.json();
      
      const items = data.items || [];
      videos.push(
        ...items
          .map((item) => ({
            videoId: item.snippet?.resourceId?.videoId,
            title: item.snippet?.title || '제목 없음',
          }))
          .filter((v) => v.videoId)
      );

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
