# YouTubeRandomPlayer
사용자가 지정한 채널의 영상을 랜덤으로 재생시키는 사이트 입니다.

<img width="1072" height="1036" alt="Image" src="https://github.com/user-attachments/assets/43aca489-0797-4ea1-9f42-a3a90520897a" />

<img width="1904" height="960" alt="Image" src="https://github.com/user-attachments/assets/8f35cdc8-8329-4c7c-8687-726bc0cc1d73" />

## Cloudflare Workers 배포

이 프로젝트는 Cloudflare Workers용 API 엔트리 `worker.js`를 포함합니다.

Cloudflare Pages로 같은 저장소를 배포하는 경우, 루트의 `_worker.js`가 Pages용 진입점이 됩니다.
그래서 Pages에서는 `/api/*` 요청이 이 Worker로 전달되어야 정상 동작합니다.

### Cloudflare 대시보드에서 키 넣기

1. Cloudflare 대시보드에 로그인합니다.
2. `Workers & Pages`로 이동합니다.
3. 해당 Worker를 엽니다.
4. `Settings` > `Variables and Secrets`로 들어갑니다.
5. `Add variable` 또는 `Add secret`을 선택합니다.
6. 이름은 `YOUTUBE_API_KEY`로 입력하고, 값에 YouTube Data API v3 키를 넣습니다.
7. 저장 후 Worker를 다시 배포하거나 재시작합니다.

### 주의할 점

- 코드에서는 이미 `YOUTUBE_API_KEY`를 읽도록 되어 있어서, 별도 코드 수정 없이 동작합니다.
- 프론트엔드가 Worker와 같은 도메인에서 서빙되면 `config.js` 기본값 그대로 `/api`를 사용합니다.
- 프론트엔드와 Worker가 다른 주소면 `config.js`의 `window.__API_BASE_URL__`를 Worker 주소로 바꿔야 합니다.
