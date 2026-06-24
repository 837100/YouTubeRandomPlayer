# YouTube Random Player

YouTube 크리에이터의 영상을 랜덤으로 재생하는 웹사이트입니다.

## 프로젝트 구조

```
YouTubeRandomPlayer/
├── index.html          # 프론트엔드 HTML
├── config.js           # 프론트엔드 API 주소 기본값
├── scripts.js          # 프론트엔드 JavaScript
├── stylee.css          # 스타일시트
├── worker.js           # Cloudflare Workers용 API 엔트리
├── worker-utils.mjs    # Workers/테스트 공용 유틸
├── wrangler.toml       # Workers 배포 설정
├── servers/            # 백엔드 디렉터리
│   ├── server.js       # Node.js 서버
│   ├── package.json    # Node.js 의존성
│   ├── APIKEY.txt      # YouTube API 키 (로컬에만 있음)
│   └── node_modules/   # npm 의존성
└── .gitignore          # Git 제외 파일
```

## 필수 요구사항

- **Node.js** (v14 이상)
- **YouTube API 키** (YouTube Data API v3)

## 설정 방법

### 1. YouTube API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성
3. "YouTube Data API v3" 활성화
4. API 키 생성 (API 및 서비스 → 사용자 인증 정보)

### 2. API 키 설정

`servers/` 폴더에 `APIKEY.txt` 파일 생성 후 API 키 입력:

```bash
mkdir -p servers
echo "YOUR_API_KEY_HERE" > servers/APIKEY.txt
```

### 3. 백엔드 서버 시작

> 서버 명령은 모두 `servers/` 디렉터리 안에서 실행합니다.

#### 방법 1: npm 사용
```bash
cd servers
npm install
npm start
```

#### 방법 2: Node.js 직접 실행
```bash
cd servers
npm install
node server.js
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 4. 프론트엔드 실행

> ⚠️ **중요**: `index.html`을 브라우저에서 직접 열면 CORS 문제 등으로 정상 동작하지 않습니다. 반드시 로컬 서버를 통해 실행하세요.
>
> ⚠️ **반드시 프로젝트 루트에서 실행**하세요. `servers/` 폴더 안에서 `serve`를 실행하면 `index.html`이 아닌 그 안의 파일 목록이 보입니다. `serve`는 `index.html`을 자동으로 찾아 열도록 설계되어 있으므로, cwd는 `index.html`이 있는 위치여야 합니다.

로컬 서버를 통해 실행 (포트 8000):

```bash
# 프로젝트 루트에서
npx serve -s . -p 8000
```

> 💡 포트 8000이 이미 사용 중이면 `serve`가 경고 없이 다른 포트로 자동 폴백합니다. 브라우저 주소창이 비어 보인다면 터미널 출력의 `Accepting connections at http://localhost:XXXXX` 줄에서 실제 포트를 확인하세요.

실행 후 브라우저에서 [http://localhost:8000](http://localhost:8000) 접속

### Cloudflare Workers로 배포하기

1. Worker 비밀 값에 YouTube API 키를 넣습니다.
   ```bash
   wrangler secret put YOUTUBE_API_KEY
   ```
2. `worker.js`를 배포합니다.
3. 프론트엔드와 Worker가 같은 오리진이면 `config.js`를 그대로 둡니다.
4. 프론트엔드와 Worker가 다른 도메인이면 `config.js`의 `window.__API_BASE_URL__`을 Worker 주소로 바꿉니다.

## 사용 방법

1. 크리에이터 핸들 입력 (예: `youtube`, `creatorname`)
2. "랜덤 영상 재생" 클릭
3. 해당 크리에이터의 영상 중 하나가 랜덤으로 재생됨
4. "다른 랜덤 영상" 버튼으로 계속 영상 변경 가능

## 배포 시 주의사항

### GitHub Pages에 배포할 경우

1. **프론트엔드만 업로드** (HTML, CSS, JS)
2. **백엔드 서버는 별도 호스팅** (Heroku, Railway, Render 등)
3. `config.js`의 `window.__API_BASE_URL__` 변경:
   ```javascript
   window.__API_BASE_URL__ = "https://your-backend-server.com";
   ```

### APIKEY.txt는 절대 커밋하지 말것!

`.gitignore`에 이미 추가되어 있습니다:
```
APIKEY.txt
node_modules/
.env
```

## 문제 해결

### "서버가 실행 중인지 확인하세요" 오류
- 백엔드 서버가 실행 중인지 확인: `http://localhost:3000/api/health`
- Node.js와 npm 설치 확인: `npm --version`

### "채널을 찾지 못했습니다" 오류
- 핸들명 입력 확인 (@ 기호 없이)
- API 키가 올바른지 확인

### CORS 오류
- 서버의 CORS가 활성화되어 있는지 확인 (`cors` 라이브러리 사용 중)
- 프론트엔드와 백엔드 주소 확인

## API 엔드포인트

### POST `/api/resolve-channel`
채널 핸들로 채널 ID 조회
```json
{
  "handle": "creatorname"
}
```

### POST `/api/get-uploads-playlist`
채널의 업로드 플레이리스트 ID 조회
```json
{
  "channelId": "UC..."
}
```

### POST `/api/get-playlist-videos`
플레이리스트의 영상 목록 조회
```json
{
  "playlistId": "UU...",
  "maxResults": 50
}
```

### GET `/api/health`
서버 상태 확인


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


## 라이선스

MIT

## 기여

Pull Request 환영합니다!
