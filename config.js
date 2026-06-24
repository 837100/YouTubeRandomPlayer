/**
 * 프론트엔드가 호출할 API 기본 주소를 정합니다.
 *
 * 로컬 개발에서는 Express 서버를 기본값으로 쓰고, 배포 환경에서는
 * 같은 오리진의 /api 경로를 기본으로 사용합니다.
 */
(function setDefaultApiBaseUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof window.__API_BASE_URL__ === 'string') {
    return;
  }

  const hostname = window.location.hostname;
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';

  window.__API_BASE_URL__ = isLocalHost ? 'http://localhost:3000' : '';
})();
