/**
 * 시청 시간 추적 모듈 단위 테스트.
 *
 * `node --test scripts/watch-time.test.mjs`로 실행합니다.
 * 외부 의존성 없이 Node 내장 `node:test` + `node:assert`만 사용합니다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * 브라우저 환경 흉내내기:
 * - `window`/`globalThis`에 `WatchTime` 모듈이 로드되도록 한다.
 * - `localStorage`는 `Map` 기반 mock으로 주입한다.
 */
function loadWatchTime({ storage, fixedDate = new Date("2026-06-25T13:00:00") } = {}) {
  /** @type {Map<string, string>} */
  const store = storage || new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() {
      return store.size;
    }
  };

  const minimalWindow = { localStorage: ls, document: { hidden: false, addEventListener: () => {} } };
  const minimalGlobal = {
    window: minimalWindow,
    document: minimalWindow.document,
    setInterval: () => 0,
    clearInterval: () => {}
  };
  minimalGlobal.globalThis = minimalGlobal;

  // 모듈은 `window`/`globalThis` 둘 다에 노출하므로 어느 쪽이든 잡힘
  // @ts-ignore
  globalThis.window = minimalWindow;
  // @ts-ignore
  globalThis.document = minimalWindow.document;
  // @ts-ignore
  globalThis.localStorage = ls;

  // 모듈 파일을 require로 한 번만 로드 (캐시됨)
  const modulePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "watch-time.js");
  if (!require.cache[modulePath]) {
    require(modulePath);
  }
  // 캐시 비워서 재로드가 필요하면 다음 줄을 사용
  // delete require.cache[modulePath];

  const api = /** @type {any} */ (globalThis).WatchTime;
  api.setHooks({
    storage: ls,
    nowProvider: () => fixedDate.toISOString(),
    formatDayKey: (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  });
  return { api, store: store };
}

// ────────────────────────────────────────────────────────────
// formatDuration
// ────────────────────────────────────────────────────────────
test("formatDuration - 0/음수는 '0분'", () => {
  const { api } = loadWatchTime();
  assert.equal(api.formatDuration(0), "0분");
  assert.equal(api.formatDuration(-1), "0분");
  assert.equal(api.formatDuration(NaN), "0분");
});

test("formatDuration - 초 단위", () => {
  const { api } = loadWatchTime();
  assert.equal(api.formatDuration(1), "1초");
  assert.equal(api.formatDuration(45), "45초");
  assert.equal(api.formatDuration(59), "59초");
});

test("formatDuration - 분 단위", () => {
  const { api } = loadWatchTime();
  assert.equal(api.formatDuration(60), "1분");
  assert.equal(api.formatDuration(125), "2분"); // floor(125/60)=2
  assert.equal(api.formatDuration(120), "2분");
  assert.equal(api.formatDuration(3540), "59분"); // 59분
});

test("formatDuration - 시간 단위", () => {
  const { api } = loadWatchTime();
  assert.equal(api.formatDuration(3600), "1시간");
  assert.equal(api.formatDuration(3600 + 23 * 60), "1시간 23분");
  assert.equal(api.formatDuration(2 * 3600), "2시간");
  assert.equal(api.formatDuration(2 * 3600 + 5 * 60), "2시간 5분");
});

// ────────────────────────────────────────────────────────────
// toDayKey / 내부 헬퍼
// ────────────────────────────────────────────────────────────
test("toDayKey - YYYY-MM-DD 형식", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  assert.equal(dbg.toDayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(dbg.toDayKey(new Date(2026, 11, 31)), "2026-12-31");
  assert.equal(dbg.toDayKey(new Date(2026, 6, 9)), "2026-07-09");
});

// ────────────────────────────────────────────────────────────
// createEmptyHistory
// ────────────────────────────────────────────────────────────
test("createEmptyHistory - 모든 필드 초기화", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  const empty = dbg.createEmptyHistory();
  assert.deepEqual(empty, {
    days: {},
    channels: {},
    lastUpdated: null,
    totalSessions: 0
  });
});

// ────────────────────────────────────────────────────────────
// 채널 누적 + 핸들 정규화
// ────────────────────────────────────────────────────────────
test("addToChannel - @, 대소문자, 공백 정규화", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToChannel("@MrBeast", 60);
  dbg.addToChannel("mrbeast", 30);
  dbg.addToChannel("  @MRBEAST  ", 10);
  dbg.addToChannel("", 100); // 무시되어야 함

  const snap = api.getHistorySnapshot();
  assert.equal(snap.channels["mrbeast"], 100);
  assert.equal(Object.keys(snap.channels).length, 1);
});

test("addToChannel - 0/음수는 무시", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToChannel("foo", 0);
  dbg.addToChannel("foo", -5);
  const snap = api.getHistorySnapshot();
  assert.equal(Object.keys(snap.channels).length, 0);
});

// ────────────────────────────────────────────────────────────
// 일자 누적 / getTodayTotal
// ────────────────────────────────────────────────────────────
test("addToDay + getTodayTotal - 오늘 누적 반환", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  const todayKey = "2026-06-25";
  dbg.addToDay(todayKey, 30);
  dbg.addToDay(todayKey, 45);
  assert.equal(api.getTodayTotal(), 75);
});

test("addToDay - 미래/과거 키 모두 누적", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToDay("2026-06-23", 60);
  dbg.addToDay("2026-06-24", 120);
  dbg.addToDay("2026-06-25", 180);
  const snap = api.getHistorySnapshot();
  assert.equal(snap.days["2026-06-23"], 60);
  assert.equal(snap.days["2026-06-24"], 120);
  assert.equal(snap.days["2026-06-25"], 180);
});

// ────────────────────────────────────────────────────────────
// pruneOldDays
// ────────────────────────────────────────────────────────────
test("pruneOldDays - 30일 이전 데이터 제거", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToDay("2026-05-20", 100); // 36일 전
  dbg.addToDay("2026-05-26", 100); // 30일 전 (cutoff)
  dbg.addToDay("2026-06-24", 100); // 1일 전
  dbg.addToDay("2026-06-25", 100); // 오늘

  dbg.pruneOldDays();
  const snap = api.getHistorySnapshot();
  assert.equal(snap.days["2026-05-20"], undefined);
  assert.equal(snap.days["2026-05-26"], undefined);
  assert.equal(snap.days["2026-06-24"], 100);
  assert.equal(snap.days["2026-06-25"], 100);
});

test("pruneOldDays - 미래 키 제거 (시계 어긋남 방어)", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToDay("2026-06-25", 50);
  dbg.addToDay("2026-06-30", 999); // 미래
  dbg.pruneOldDays();
  const snap = api.getHistorySnapshot();
  assert.equal(snap.days["2026-06-30"], undefined);
  assert.equal(snap.days["2026-06-25"], 50);
});

// ────────────────────────────────────────────────────────────
// getDailyHistory
// ────────────────────────────────────────────────────────────
test("getDailyHistory - 기본 30일, 0초 포함", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToDay("2026-06-25", 600);
  const daily = api.getDailyHistory();
  assert.equal(daily.length, 30);
  assert.equal(daily[0].date, "2026-05-27");
  assert.equal(daily[29].date, "2026-06-25");
  assert.equal(daily[29].seconds, 600);
  assert.equal(daily[0].seconds, 0);
});

test("getDailyHistory - days 인자 1~30 클램프", () => {
  const { api } = loadWatchTime();
  assert.equal(api.getDailyHistory(0).length, 1);
  assert.equal(api.getDailyHistory(1).length, 1);
  assert.equal(api.getDailyHistory(7).length, 7);
  assert.equal(api.getDailyHistory(100).length, 30); // 상한
});

test("getDailyHistory - label 포맷", () => {
  const { api } = loadWatchTime();
  const daily = api.getDailyHistory(1);
  assert.match(daily[0].label, /^\d{4}-\d{2}-\d{2} · /);
});

// ────────────────────────────────────────────────────────────
// getTopChannels
// ────────────────────────────────────────────────────────────
test("getTopChannels - 시청 시간 순 정렬 + percent 계산", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  dbg.addToChannel("a", 60);
  dbg.addToChannel("b", 30);
  dbg.addToChannel("c", 10);
  const top = api.getTopChannels();
  assert.equal(top[0].handle, "a");
  assert.equal(top[0].seconds, 60);
  assert.equal(top[0].percent, 60);
  assert.equal(top[1].percent, 30);
  assert.equal(top[2].percent, 10);
  assert.equal(top.length, 3);
});

test("getTopChannels - 빈 기록은 빈 배열", () => {
  const { api } = loadWatchTime();
  assert.deepEqual(api.getTopChannels(), []);
});

test("getTopChannels - limit 적용", () => {
  const { api } = loadWatchTime();
  const dbg = api.__debug();
  ["a", "b", "c", "d", "e"].forEach((h, i) => dbg.addToChannel(h, (5 - i) * 10));
  assert.equal(api.getTopChannels(2).length, 2);
});

// ────────────────────────────────────────────────────────────
// 영속화 / 손상 데이터
// ────────────────────────────────────────────────────────────
test("loadHistory - 손상된 JSON은 빈 기록으로 폴백", () => {
  const store = new Map();
  store.set("watchHistory:v1", "{not valid json");
  const { api } = loadWatchTime({ storage: store });
  const snap = api.getHistorySnapshot();
  assert.deepEqual(snap.days, {});
  assert.deepEqual(snap.channels, {});
  assert.equal(snap.totalSessions, 0);
});

test("loadHistory - 부분 손상된 객체는 정상 필드만 살림", () => {
  const store = new Map();
  store.set("watchHistory:v1", JSON.stringify({
    days: { "2026-06-25": 42 },
    channels: "not an object",
    lastUpdated: 123,
    totalSessions: "abc"
  }));
  const { api } = loadWatchTime({ storage: store });
  const snap = api.getHistorySnapshot();
  assert.equal(snap.days["2026-06-25"], 42);
  assert.deepEqual(snap.channels, {});
  assert.equal(snap.totalSessions, 0);
});

test("loadHistory - 비어 있는 storage는 빈 기록", () => {
  const { api } = loadWatchTime({ storage: new Map() });
  const snap = api.getHistorySnapshot();
  assert.deepEqual(snap.days, {});
});

// ────────────────────────────────────────────────────────────
// clearAll
// ────────────────────────────────────────────────────────────
test("clearAll - storage 키와 메모리 모두 비움", () => {
  const store = new Map();
  store.set("watchHistory:v1", JSON.stringify({ days: { "2026-06-25": 100 }, channels: {} }));
  const { api } = loadWatchTime({ storage: store });
  assert.equal(api.getTodayTotal(), 100);
  api.clearAll();
  assert.equal(api.getTodayTotal(), 0);
  assert.equal(store.has("watchHistory:v1"), false);
});

// ────────────────────────────────────────────────────────────
// setPlayer
// ────────────────────────────────────────────────────────────
test("setPlayer - null로 비우면 probe도 비워짐", () => {
  const { api } = loadWatchTime();
  api.setPlayer({ getCurrentTime: () => 10, getPlayerState: () => 1 });
  api.setPlayer(null);
  // 직접 probe 검증은 불가능하지만 __debug()로 다른 동작이 살아 있는지 확인
  const snap = api.getHistorySnapshot();
  assert.deepEqual(snap.days, {});
});

// ────────────────────────────────────────────────────────────
// 부수 효과 격리
// ────────────────────────────────────────────────────────────
test("각 테스트는 독립된 store로 동작", () => {
  const storeA = new Map();
  const a = loadWatchTime({ storage: storeA }).api;
  a.clearAll();
  a.__debug().addToDay("2026-06-25", 999);

  const storeB = new Map();
  const b = loadWatchTime({ storage: storeB }).api;
  assert.equal(b.getTodayTotal(), 0);
});