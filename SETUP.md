# YouTube Random Player

YouTube 크리에이터의 영상을 랜덤으로 재생하는 웹사이트입니다.

## 프로젝트 구조

```
YouTubeRandomPlayer/
├── index.html          # 프론트엔드 HTML
├── scripts.js          # 프론트엔드 JavaScript
├── stylee.css          # 스타일시트
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

로컬 서버를 통해 실행 (포트 8000):

```bash
npm install -g serve
serve -s . -p 8000
```

실행 후 브라우저에서 [http://localhost:8000](http://localhost:8000) 접속

## 사용 방법

1. 크리에이터 핸들 입력 (예: `youtube`, `creatorname`)
2. "랜덤 영상 재생" 클릭
3. 해당 크리에이터의 영상 중 하나가 랜덤으로 재생됨
4. "다른 랜덤 영상" 버튼으로 계속 영상 변경 가능

## 배포 시 주의사항

### GitHub Pages에 배포할 경우

1. **프론트엔드만 업로드** (HTML, CSS, JS)
2. **백엔드 서버는 별도 호스팅** (Heroku, Railway, Render 등)
3. `scripts.js`의 `SERVER_URL` 변경:
   ```javascript
   const SERVER_URL = "https://your-backend-server.com"; // 실제 서버 주소
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

## 라이선스

MIT

## 기여

Pull Request 환영합니다!
