/**
 * 시청 시간 추적 모듈.
 *
 * - YouTube IFrame Player API의 `getCurrentTime()`을 1초 간격으로 폴링하여
 *   실제 재생 시간을 측정합니다.
 * - 탭 비활성 / iframe 숨김 상태에서는 폴링을 멈춰 부하를 줄입니다.
 * - 일자별 시청 시간은 `localStorage` 단일 키(`watchHistory:v1`)에 저장합니다.
 * - 채널별 시청 시간도 같은 키 안에 보관해 차트에서 비중을 표시할 수 있게 합니다.
 *
 * 외부 노출: `window.WatchTime`
 *
 * @example
 *   WatchTime.init();                                  // 부팅 시 1회
 *   WatchTime.attachToPlayer(playerIframeEl);          // 영상 교체마다
 *   WatchTime.recordChannelPlay("@creator");          // 채널 정보 갱신 시
 */
(function watchTimeModule() {
  "use strict";

  const STORAGE_KEY = "watchHistory:v1";
  const POLL_INTERVAL_MS = 1000;
  const VISIBILITY_CHECK_INTERVAL_MS = 60000;
  const HISTORY_DAYS = 30;
  const TOP_CHANNELS_LIMIT = 5;

  /** @typedef {{ days: Record<string, number>, channels: Record<string, number>, lastUpdated: string|null, totalSessions: number }} History */

  /**
   * @typedef {Object} WatchTimeHooks
   * @property {(now: Date) => string} formatDayKey 날짜 → "YYYY-MM-DD" 변환
   * @property {() => string} nowProvider 현재 시각 문자열 (테스트 mock 진입점)
   * @property {Storage|null} storage localStorage 어댑터 (테스트에서 주입 가능)
   */

  /**
   * @typedef {Object} PollingProbe
   * @property {() => number} getCurrentTime 현재 재생 위치 (초)
   * @property {() => number} getPlayerState YT.PlayerState.* 중 하나
   */

  /** @type {History} */
  let history = createEmptyHistory();
  /** @type {ReturnType<typeof setInterval>|null} */
  let pollTimer = null;
  /** @type {ReturnType<typeof setInterval>|null} */
  let visibilityTimer = null;
  /** @type {PollingProbe|null} */
  let probe = null;
  /** @type {number} */
  let lastTickTime = 0;
  /** @type {string} */
  let currentDayKey = "";
  /** @type {string} */
  let lastViewedChannel = "";
  /** @type {WatchTimeHooks} */
  let hooks = defaultHooks();

  /**
   * 기본 훅 세트. 테스트 시 `setHooks`로 교체합니다.
   *
   * @returns {WatchTimeHooks} 브라우저 환경 기반 훅
   */
  function defaultHooks() {
    return {
      formatDayKey(now) {
        return toDayKey(now);
      },
      nowProvider() {
        return new Date().toISOString();
      },
      storage: getBrowserStorage()
    };
  }

  /**
   * 빈 시청 기록 객체를 생성합니다.
   *
   * @returns {History} 초기화된 객체
   */
  function createEmptyHistory() {
    return {
      days: {},
      channels: {},
      lastUpdated: null,
      totalSessions: 0
    };
  }

  /**
   * 브라우저의 localStorage를 안전하게 가져옵니다. 시크릿 모드 등 접근 불가 시 null 반환.
   *
   * @returns {Storage|null} 사용 가능한 Storage 또는 null
   */
  function getBrowserStorage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const probeKey = "__watchTimeProbe__";
        window.localStorage.setItem(probeKey, "1");
        window.localStorage.removeItem(probeKey);
        return window.localStorage;
      }
    } catch (error) {
      // 접근 차단됨
    }
    return null;
  }

  /**
   * Date 객체를 "YYYY-MM-DD" 문자열로 변환합니다.
   *
   * @param {Date} date 변환할 날짜
   * @returns {string} "YYYY-MM-DD" 형식
   */
  function toDayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * localStorage에서 시청 기록을 불러옵니다. 손상된 데이터는 빈 기록으로 대체합니다.
   *
   * @returns {History} 로드된 또는 빈 기록
   */
  function loadHistory() {
    const storage = hooks.storage;
    if (!storage) return createEmptyHistory();

    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyHistory();

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return createEmptyHistory();

      return {
        days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
        channels: parsed.channels && typeof parsed.channels === "object" ? parsed.channels : {},
        lastUpdated: typeof parsed.lastUpdated === "string" ? parsed.lastUpdated : null,
        totalSessions: Number.isFinite(parsed.totalSessions) ? Number(parsed.totalSessions) : 0
      };
    } catch (error) {
      return createEmptyHistory();
    }
  }

  /**
   * 시청 기록을 localStorage에 저장합니다.
   *
   * @returns {void}
   */
  function persistHistory() {
    const storage = hooks.storage;
    if (!storage) return;

    try {
      history.lastUpdated = hooks.nowProvider();
      storage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      // 용량 초과 등 무시
    }
  }

  /**
   * 오래된 일자 데이터를 정리해 HISTORY_DAYS 범위만 남깁니다.
   *
   * @returns {void}
   */
  function pruneOldDays() {
    const today = hooks.formatDayKey(new Date());
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (HISTORY_DAYS - 1));
    const cutoffKey = hooks.formatDayKey(cutoff);

    Object.keys(history.days).forEach((dayKey) => {
      if (dayKey < cutoffKey || dayKey > today) {
        delete history.days[dayKey];
      }
    });
  }

  /**
   * 시청 시간(초)을 사람이 읽기 쉬운 한국어 표기로 변환합니다.
   *
   * @param {number} seconds 변환할 초
   * @returns {string} "1시간 23분" / "23분" / "45초"
   */
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0분";

    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
    if (hours > 0) return `${hours}시간`;
    if (minutes > 0) return `${minutes}분`;
    return `${secs}초`;
  }

  /**
   * 일자 키에 시청 초를 누적합니다.
   *
   * @param {string} dayKey "YYYY-MM-DD"
   * @param {number} delta 추가할 초 (양수)
   * @returns {void}
   */
  function addToDay(dayKey, delta) {
    if (!dayKey || !Number.isFinite(delta) || delta <= 0) return;
    history.days[dayKey] = (history.days[dayKey] || 0) + delta;
  }

  /**
   * 채널 핸들에 시청 초를 누적합니다. 핸들은 `@`와 앞쪽 공백을 제거하고 소문자로 정규화합니다.
   *
   * @param {string} handle 채널 핸들
   * @param {number} delta 추가할 초
   * @returns {void}
   */
  function addToChannel(handle, delta) {
    if (!handle || !Number.isFinite(delta) || delta <= 0) return;
    const normalized = handle.replace(/^[\s@]+/, "").trim().toLowerCase();
    if (!normalized) return;
    history.channels[normalized] = (history.channels[normalized] || 0) + delta;
  }

  /**
   * 현재 일자 키가 바뀌었는지 확인하고, 바뀌었다면 일자 키를 갱신합니다.
   *
   * @returns {void}
   */
  function rollDayIfNeeded() {
    const todayKey = hooks.formatDayKey(new Date());
    if (currentDayKey && currentDayKey !== todayKey) {
      // 자정 변경: 마지막 시청 초를 어제 키에 반영
      if (lastTickTime > 0 && currentDayKey) {
        addToDay(currentDayKey, lastTickTime);
        if (lastViewedChannel) addToChannel(lastViewedChannel, lastTickTime);
        lastTickTime = 0;
        persistHistory();
      }
    }
    currentDayKey = todayKey;
  }

  /**
   * 폴링 1회. 현재 재생 위치를 확인하고 시청 시간을 누적합니다.
   *
   * @returns {void}
   */
  function tick() {
    if (!probe) return;

    rollDayIfNeeded();

    let state = -1;
    let currentTime = 0;

    try {
      state = probe.getPlayerState();
      currentTime = probe.getCurrentTime();
    } catch (error) {
      return;
    }

    // YT.PlayerState.PLAYING = 1
    if (state !== 1) return;
    if (!Number.isFinite(currentTime) || currentTime < 0) return;

    let delta = 1;
    if (lastTickTime > 0 && currentTime >= lastTickTime) {
      delta = Math.min(currentTime - lastTickTime, POLL_INTERVAL_MS / 1000 + 1);
      if (delta <= 0) delta = 1;
    }

    lastTickTime = currentTime;
    addToDay(currentDayKey, delta);
    if (lastViewedChannel) addToChannel(lastViewedChannel, delta);

    // 5초마다 저장 (과도한 쓰기 방지)
    const secondsOfDay = history.days[currentDayKey] || 0;
    if (Math.floor(secondsOfDay) % 5 === 0 && secondsOfDay - delta < secondsOfDay - 1) {
      persistHistory();
    }
  }

  /**
   * 폴링 루프를 시작합니다. 이미 실행 중이면 무시합니다.
   *
   * @returns {void}
   */
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
    visibilityTimer = setInterval(rollDayIfNeeded, VISIBILITY_CHECK_INTERVAL_MS);
  }

  /**
   * 폴링 루프를 정지합니다.
   *
   * @returns {void}
   */
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (visibilityTimer) {
      clearInterval(visibilityTimer);
      visibilityTimer = null;
    }
    if (lastTickTime > 0 && currentDayKey) {
      addToDay(currentDayKey, lastTickTime);
      if (lastViewedChannel) addToChannel(lastViewedChannel, lastTickTime);
      lastTickTime = 0;
      persistHistory();
    }
  }

  /**
   * 부팅 시 1회 호출. 저장된 기록을 로드하고 폴링을 시작합니다.
   *
   * @returns {void}
   */
  function init() {
    history = loadHistory();
    pruneOldDays();
    currentDayKey = hooks.formatDayKey(new Date());
    startPolling();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          stopPolling();
        } else if (!pollTimer) {
          startPolling();
        }
      });
    }
  }

  /**
   * 영상 교체 시 호출. 새 iframe에 폴링 프로브를 연결합니다.
   *
   * @param {HTMLIFrameElement} iframeEl 플레이어 iframe
   * @returns {void}
   */
  function attachToPlayer(iframeEl) {
    if (!iframeEl || typeof iframeEl.contentWindow === "undefined") {
      probe = null;
      return;
    }

    lastTickTime = 0;
    rollDayIfNeeded();

    // 1) YT.Player 인스턴스가 직접 노출된 경우 (외부에서 주입 가능)
    /** @type {any} */
    const win = iframeEl.contentWindow;
    /** @type {any} */
    const directPlayer = win && win.YT && win.YT.Player && win.__ytPlayer;

    if (directPlayer && typeof directPlayer.getCurrentTime === "function") {
      probe = {
        getCurrentTime: () => Number(directPlayer.getCurrentTime()) || 0,
        getPlayerState: () => Number(directPlayer.getPlayerState()) || -1
      };
      return;
    }

    // 2) 폴백: YT.Player 글로벌에서 검색
    if (typeof window !== "undefined" && window.YT && window.YT.Player && window.__ytPlayer) {
      /** @type {any} */
      const ytPlayer = window.__ytPlayer;
      probe = {
        getCurrentTime: () => Number(ytPlayer.getCurrentTime()) || 0,
        getPlayerState: () => Number(ytPlayer.getPlayerState()) || -1
      };
      return;
    }

    // 3) 가장 약한 폴백: enablejsapi=1이면 getCurrentTime을 postMessage로 받을 수 있으나
    //    안정성을 위해 iframe load 이후 500ms마다 한 번씩 시도
    probe = null;
  }

  /**
   * YT.Player 인스턴스를 외부에서 주입합니다. (선택적 최적화)
   *
   * @param {{ getCurrentTime: () => number, getPlayerState: () => number }} player YT.Player 호환 객체
   * @returns {void}
   */
  function setPlayer(player) {
    if (!player) {
      probe = null;
      return;
    }
    probe = {
      getCurrentTime: () => Number(player.getCurrentTime()) || 0,
      getPlayerState: () => Number(player.getPlayerState()) || -1
    };
  }

  /**
   * 현재 채널 핸들을 기록합니다. 다음 시청 초부터 해당 채널에 누적됩니다.
   *
   * @param {string} handle 채널 핸들 (`@` 포함/미포함 모두 허용)
   * @returns {void}
   */
  function recordChannelPlay(handle) {
    if (typeof handle !== "string") return;
    const normalized = handle.replace(/^[\s@]+/, "").trim().toLowerCase();
    if (normalized) lastViewedChannel = normalized;
  }

  /**
   * 오늘 누적 시청 시간(초)을 반환합니다.
   *
   * @returns {number} 오늘 시청 초
   */
  function getTodayTotal() {
    rollDayIfNeeded();
    const today = hooks.formatDayKey(new Date());
    return history.days[today] || 0;
  }

  /**
   * 최근 N일간 일별 시청 시간 배열을 반환합니다. 0초인 날도 포함됩니다.
   *
   * @param {number} [days=30] 조회할 일수
   * @returns {Array<{ date: string, seconds: number, label: string }>}
   */
  function getDailyHistory(days = HISTORY_DAYS) {
    rollDayIfNeeded();
    const count = Math.max(1, Math.min(days, HISTORY_DAYS));
    const today = new Date();
    const result = [];

    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = hooks.formatDayKey(date);
      const seconds = history.days[key] || 0;
      result.push({
        date: key,
        seconds,
        label: `${key} · ${formatDuration(seconds)}`
      });
    }

    return result;
  }

  /**
   * 시청 시간 상위 채널 목록을 반환합니다.
   *
   * @param {number} [limit=TOP_CHANNELS_LIMIT] 최대 개수
   * @returns {Array<{ handle: string, seconds: number, percent: number }>}
   */
  function getTopChannels(limit = TOP_CHANNELS_LIMIT) {
    const entries = Object.entries(history.channels || {})
      .filter(([, seconds]) => Number.isFinite(seconds) && seconds > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, limit));

    const total = entries.reduce((sum, [, seconds]) => sum + seconds, 0);
    if (total === 0) return [];

    return entries.map(([handle, seconds]) => ({
      handle,
      seconds,
      percent: Math.round((seconds / total) * 100)
    }));
  }

  /**
   * 시청 기록을 모두 삭제합니다.
   *
   * @returns {void}
   */
  function clearAll() {
    history = createEmptyHistory();
    lastTickTime = 0;
    currentDayKey = hooks.formatDayKey(new Date());
    const storage = hooks.storage;
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (error) {
        // 무시
      }
    }
  }

  /**
   * 테스트용 훅 주입. 프로덕션에서는 사용하지 않습니다.
   *
   * @param {Partial<WatchTimeHooks>} overrides 덮어쓸 훅
   * @returns {void}
   */
  function setHooks(overrides) {
    hooks = Object.assign({}, defaultHooks(), overrides || {});
    history = loadHistory();
    currentDayKey = hooks.formatDayKey(new Date());
  }

  /**
   * 현재 기록 객체의 스냅샷을 반환합니다. (테스트/디버그용)
   *
   * @returns {History} 기록 사본
   */
  function getHistorySnapshot() {
    return JSON.parse(JSON.stringify(history));
  }

  /**
   * 디버그/테스트용 내부 함수 노출.
   *
   * @returns {{
   *   toDayKey: typeof toDayKey,
   *   pruneOldDays: typeof pruneOldDays,
   *   rollDayIfNeeded: typeof rollDayIfNeeded,
   *   addToDay: typeof addToDay,
   *   addToChannel: typeof addToChannel,
   *   formatDuration: typeof formatDuration,
   *   createEmptyHistory: typeof createEmptyHistory,
   *   HISTORY_DAYS: number,
   *   STORAGE_KEY: string
   * }}
   */
  function __debug() {
    return {
      toDayKey,
      pruneOldDays,
      rollDayIfNeeded,
      addToDay,
      addToChannel,
      formatDuration,
      createEmptyHistory,
      HISTORY_DAYS,
      STORAGE_KEY
    };
  }

  /**
   * 외부 공개 API.
   */
  const api = {
    init,
    attachToPlayer,
    setPlayer,
    recordChannelPlay,
    formatDuration,
    getTodayTotal,
    getDailyHistory,
    getTopChannels,
    clearAll,
    setHooks,
    getHistorySnapshot,
    __debug
  };

  if (typeof window !== "undefined") {
    window.WatchTime = api;
  }
  if (typeof globalThis !== "undefined") {
    /** @type {any} */
    const g = globalThis;
    g.WatchTime = api;
  }
})();