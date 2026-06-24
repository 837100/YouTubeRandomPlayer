# YouTubeRandomPlayer
사용자가 지정한 채널의 영상을 랜덤으로 재생시키는 사이트 입니다.

<img width="1072" height="1036" alt="Image" src="https://github.com/user-attachments/assets/43aca489-0797-4ea1-9f42-a3a90520897a" />

<img width="1904" height="960" alt="Image" src="https://github.com/user-attachments/assets/8f35cdc8-8329-4c7c-8687-726bc0cc1d73" />

## Cloudflare Workers 배포

이 프로젝트는 Cloudflare Workers용 API 엔트리 `worker.js`를 포함합니다.

1. Worker 비밀 값으로 YouTube API 키를 넣습니다.
   ```bash
   wrangler secret put YOUTUBE_API_KEY
   ```
2. `wrangler.toml` 기준으로 `worker.js`를 배포합니다.
3. 프론트엔드가 같은 오리진에서 서빙되면 `config.js`의 기본값 그대로 `/api`를 사용합니다.
4. 프론트엔드와 Worker가 다른 주소면 `config.js`의 `window.__API_BASE_URL__`를 Worker 주소로 바꿉니다.
