/**
 * 시청 시간 일별 시각화 모듈.
 *
 * - `WatchTime.getDailyHistory()`와 `WatchTime.getTopChannels()`를 읽어
 *   30일 막대 차트와 채널별 시청 비중을 그립니다.
 * - 외부 라이브러리 없이 네이티브 SVG로 차트를 렌더링합니다.
 * - 모달 열기/닫기, 백드롭 클릭, ESC 키, 닫기 버튼을 처리합니다.
 *
 * 외부 노출: `window.WatchChart`
 */
(function watchChartModule() {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const CHART_HEIGHT = 160;
  const CHART_PADDING = { top: 12, right: 8, bottom: 28, left: 28 };
  const BAR_GAP_RATIO = 0.25;
  const MODAL_ID = "watchHistoryModal";

  /** @type {SVGSVGElement|null} */
  let chartSvg = null;
  /** @type {HTMLElement|null} */
  let channelListEl = null;
  /** @type {HTMLElement|null} */
  let modalEl = null;
  /** @type {HTMLElement|null} */
  let backdropEl = null;
  /** @type {HTMLElement|null} */
  let closeBtnEl = null;
  /** @type {HTMLElement|null} */
  let clearBtnEl = null;
  /** @type {HTMLElement|null} */
  let summaryEl = null;

  /**
   * 모듈을 부팅합니다. DOM 요소를 캐시하고 이벤트 리스너를 연결합니다.
   *
   * @returns {void}
   */
  function init() {
    if (typeof document === "undefined") return;

    modalEl = document.getElementById(MODAL_ID);
    if (!modalEl) return;

    backdropEl = modalEl.querySelector(".watchHistoryModal__backdrop");
    closeBtnEl = modalEl.querySelector(".watchHistoryModal__close");
    clearBtnEl = modalEl.querySelector(".watchHistoryModal__clear");
    summaryEl = modalEl.querySelector(".watchHistoryModal__summary");
    channelListEl = modalEl.querySelector(".watchHistoryModal__channels");

    const svgEl = modalEl.querySelector(".dailyChart");
    if (svgEl && svgEl.namespaceURI === SVG_NS) {
      chartSvg = /** @type {SVGSVGElement} */ (svgEl);
    }

    if (backdropEl) backdropEl.addEventListener("click", close);
    if (closeBtnEl) closeBtnEl.addEventListener("click", close);
    if (clearBtnEl) {
      clearBtnEl.addEventListener("click", () => {
        const confirmed = typeof window !== "undefined" && window.confirm
          ? window.confirm("시청 기록을 모두 삭제하시겠어요?")
          : true;
        if (!confirmed) return;
        if (window.WatchTime) window.WatchTime.clearAll();
        render();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        close();
      }
    });
  }

  /**
   * 모달이 현재 열려 있는지 확인합니다.
   *
   * @returns {boolean} 열림 여부
   */
  function isOpen() {
    return Boolean(modalEl && !modalEl.hidden);
  }

  /**
   * 모달을 엽니다.
   *
   * @returns {void}
   */
  function open() {
    if (!modalEl) return;
    render();
    modalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  /**
   * 모달을 닫습니다.
   *
   * @returns {void}
   */
  function close() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.style.overflow = "";
  }

  /**
   * 차트 + 채널 비중을 다시 그립니다.
   *
   * @returns {void}
   */
  function render() {
    if (!window.WatchTime) return;

    if (summaryEl) {
      const today = window.WatchTime.getTodayTotal();
      const totalAllTime = window.WatchTime.getDailyHistory(30)
        .reduce((sum, entry) => sum + entry.seconds, 0);
      summaryEl.textContent = `오늘 ${window.WatchTime.formatDuration(today)} · 최근 30일 누적 ${window.WatchTime.formatDuration(totalAllTime)}`;
    }

    const daily = window.WatchTime.getDailyHistory(30);
    renderChart(daily);

    const channels = window.WatchTime.getTopChannels(5);
    renderChannelList(channels);
  }

  /**
   * 일별 막대 차트를 SVG로 렌더링합니다.
   *
   * @param {Array<{ date: string, seconds: number, label: string }>} daily 일별 데이터
   * @returns {void}
   */
  function renderChart(daily) {
    if (!chartSvg) return;

    while (chartSvg.firstChild) chartSvg.removeChild(chartSvg.firstChild);

    const width = chartSvg.clientWidth || 600;
    const height = CHART_HEIGHT;
    chartSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;
    const barCount = daily.length;
    const slotWidth = innerWidth / barCount;
    const barWidth = slotWidth * (1 - BAR_GAP_RATIO);

    const maxSeconds = Math.max(60, ...daily.map((d) => d.seconds));

    // 가로선 (max/half/0)
    [0, 0.5, 1].forEach((ratio) => {
      const y = CHART_PADDING.top + innerHeight * (1 - ratio);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(CHART_PADDING.left));
      line.setAttribute("x2", String(width - CHART_PADDING.right));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", ratio === 0 ? "dailyChart__baseline" : "dailyChart__grid");
      chartSvg.appendChild(line);

      if (ratio > 0) {
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", String(CHART_PADDING.left - 4));
        label.setAttribute("y", String(y + 3));
        label.setAttribute("text-anchor", "end");
        label.setAttribute("class", "dailyChart__axisLabel");
        label.textContent = window.WatchTime
          ? window.WatchTime.formatDuration(maxSeconds * ratio)
          : `${Math.round(maxSeconds * ratio)}s`;
        chartSvg.appendChild(label);
      }
    });

    daily.forEach((entry, index) => {
      const slotX = CHART_PADDING.left + slotWidth * index;
      const barX = slotX + (slotWidth - barWidth) / 2;
      const ratio = entry.seconds / maxSeconds;
      const barHeight = Math.max(entry.seconds > 0 ? 2 : 0, innerHeight * ratio);
      const barY = CHART_PADDING.top + innerHeight - barHeight;

      const bar = document.createElementNS(SVG_NS, "rect");
      bar.setAttribute("x", String(barX));
      bar.setAttribute("y", String(barY));
      bar.setAttribute("width", String(barWidth));
      bar.setAttribute("height", String(barHeight));
      bar.setAttribute("rx", "2");
      bar.setAttribute("class", entry.seconds > 0 ? "dailyChart__bar" : "dailyChart__bar dailyChart__bar--empty");
      bar.setAttribute("data-label", entry.label);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = entry.label;
      bar.appendChild(title);
      chartSvg.appendChild(bar);

      // 5개마다 날짜 라벨
      if (index % 5 === 0 || index === daily.length - 1) {
        const labelEl = document.createElementNS(SVG_NS, "text");
        labelEl.setAttribute("x", String(slotX + slotWidth / 2));
        labelEl.setAttribute("y", String(height - CHART_PADDING.bottom + 14));
        labelEl.setAttribute("text-anchor", "middle");
        labelEl.setAttribute("class", "dailyChart__dateLabel");
        labelEl.textContent = entry.date.slice(5); // "MM-DD"
        chartSvg.appendChild(labelEl);
      }
    });
  }

  /**
   * 채널별 시청 비중 리스트를 렌더링합니다.
   *
   * @param {Array<{ handle: string, seconds: number, percent: number }>} channels 채널 목록
   * @returns {void}
   */
  function renderChannelList(channels) {
    if (!channelListEl) return;

    channelListEl.replaceChildren();

    if (!channels.length) {
      const empty = document.createElement("p");
      empty.className = "watchHistoryModal__empty";
      empty.textContent = "아직 채널별 시청 기록이 없습니다.";
      channelListEl.appendChild(empty);
      return;
    }

    const formatter = window.WatchTime
      ? window.WatchTime.formatDuration
      : (sec) => `${sec}초`;

    channels.forEach((channel) => {
      const row = document.createElement("div");
      row.className = "watchHistoryModal__channel";

      const head = document.createElement("div");
      head.className = "watchHistoryModal__channelHead";

      const handleEl = document.createElement("span");
      handleEl.className = "watchHistoryModal__channelHandle";
      handleEl.textContent = `@${channel.handle}`;

      const metaEl = document.createElement("span");
      metaEl.className = "watchHistoryModal__channelMeta";
      metaEl.textContent = `${formatter(channel.seconds)} · ${channel.percent}%`;

      head.appendChild(handleEl);
      head.appendChild(metaEl);

      const barWrap = document.createElement("div");
      barWrap.className = "watchHistoryModal__channelBar";

      const barFill = document.createElement("div");
      barFill.className = "watchHistoryModal__channelBarFill";
      barFill.style.width = `${channel.percent}%`;

      barWrap.appendChild(barFill);

      row.appendChild(head);
      row.appendChild(barWrap);
      channelListEl.appendChild(row);
    });
  }

  /**
   * 외부 공개 API.
   */
  const api = {
    init,
    open,
    close,
    isOpen,
    render
  };

  if (typeof window !== "undefined") {
    window.WatchChart = api;
  }
})();