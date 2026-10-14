const state = {
  options: null,
  items: [],
  total: 0,
  offset: 0,
  limit: 100,
  selectedRegistration: null,
  selectedData: null,
  dirty: false,
  searchTimer: null,
};

const raceState = {
  items: [],
  selectedRaceId: null,
  selectedData: null,
  dirty: false,
  columns: [],
  availableColumns: [],
  fieldType: "all",
  requestSerial: 0,
};

const raceColumnDefinitions = {
  provisional_index: { label: "暫定指数" },
  evaluation_index: { label: "評価指数" },
  start_count: { label: "S" },
  home_count: { label: "H" },
  back_count: { label: "B" },
  formation_performance: { label: "分戦別成績", className: "formation-column" },
  initiative: { label: "先行意欲" },
  second_position: { label: "番手経験" },
  chaos_index: { label: "波乱指数" },
  previous_leg: { label: "前回脚評価" },
  leg_rating: { label: "今日の脚評価" },
  inspection_comment: { label: "前検コメント", className: "comment-column" },
  result_comment: { label: "レース後コメント", className: "comment-column" },
  user_comment: { label: "個人的レースコメント", className: "comment-column" },
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  dbStatus: $("#dbStatus"),
  viewTabs: document.querySelectorAll("[data-view]"),
  raceWorkspace: $("#raceWorkspace"),
  athleteWorkspace: $("#athleteWorkspace"),
  raceDateSearchForm: $("#raceDateSearchForm"),
  raceDiscoveryDate: $("#raceDiscoveryDate"),
  raceDateSearchButton: $("#raceDateSearchButton"),
  dailyRacecards: $("#dailyRacecards"),
  raceImportForm: $("#raceImportForm"),
  raceSourceInput: $("#raceSourceInput"),
  raceImportButton: $("#raceImportButton"),
  raceDateFilter: $("#raceDateFilter"),
  raceDateClear: $("#raceDateClear"),
  raceList: $("#raceList"),
  raceEmptyState: $("#raceEmptyState"),
  raceDetail: $("#raceDetail"),
  raceMeta: $("#raceMeta"),
  raceTitle: $("#raceTitle"),
  lineDisplay: $("#lineDisplay"),
  externalCommentStatus: $("#externalCommentStatus"),
  raceTableHead: $("#raceTableHead"),
  raceEntries: $("#raceEntries"),
  holeCandidates: $("#holeCandidates"),
  raceSaveState: $("#raceSaveState"),
  raceSaveButton: $("#raceSaveButton"),
  commentRefreshButton: $("#commentRefreshButton"),
  columnCustomizeButton: $("#columnCustomizeButton"),
  columnCustomizer: $("#columnCustomizer"),
  columnCustomizeClose: $("#columnCustomizeClose"),
  columnCancelButton: $("#columnCancelButton"),
  columnSaveButton: $("#columnSaveButton"),
  columnList: $("#columnList"),
  sStatsModal: $("#sStatsModal"),
  sStatsClose: $("#sStatsClose"),
  sStatsTitle: $("#sStatsTitle"),
  sStatsSubtitle: $("#sStatsSubtitle"),
  sStatsSummary: $("#sStatsSummary"),
  sStatsBody: $("#sStatsBody"),
  externalCommentModal: $("#externalCommentModal"),
  externalCommentClose: $("#externalCommentClose"),
  externalCommentKicker: $("#externalCommentKicker"),
  externalCommentTitle: $("#externalCommentTitle"),
  externalCommentSubtitle: $("#externalCommentSubtitle"),
  externalCommentBody: $("#externalCommentBody"),
  venueStatsModal: $("#venueStatsModal"),
  venueStatsClose: $("#venueStatsClose"),
  venueStatsTitle: $("#venueStatsTitle"),
  venueStatsSubtitle: $("#venueStatsSubtitle"),
  venueStatsBody: $("#venueStatsBody"),
  searchInput: $("#searchInput"),
  classFilter: $("#classFilter"),
  prefectureFilter: $("#prefectureFilter"),
  resultCount: $("#resultCount"),
  athleteList: $("#athleteList"),
  loadMoreButton: $("#loadMoreButton"),
  emptyState: $("#emptyState"),
  editorForm: $("#editorForm"),
  registrationBadge: $("#registrationBadge"),
  athleteTitle: $("#athleteTitle"),
  saveState: $("#saveState"),
  saveButton: $("#saveButton"),
  resetButton: $("#resetButton"),
  evaluationGrid: $("#evaluationGrid"),
  historyList: $("#historyList"),
  toast: $("#toast"),
};

async function api(path, options = {}) {
  if (window.keirinWebApi) return window.keirinWebApi.request(path, options);
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "処理に失敗しました");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function showToast(message, type = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type === "error" ? "error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { elements.toast.className = "toast"; }, 2800);
}

function setDirty(dirty) {
  state.dirty = dirty;
  elements.saveState.textContent = dirty ? "未保存の変更あり" : "保存済み";
  elements.saveState.classList.toggle("dirty", dirty);
}

function setRaceDirty(dirty) {
  raceState.dirty = dirty;
  elements.raceSaveState.textContent = dirty ? "未保存の変更あり" : "保存済み";
  elements.raceSaveState.classList.toggle("dirty", dirty);
}

function populateSelect(select, values, currentLabel = "すべて") {
  select.innerHTML = `<option value="">${currentLabel}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`;
}

function switchView(view) {
  if (view === "athlete" && raceState.dirty) {
    if (!window.confirm("保存していない脚評価・コメントがあります。破棄して移動しますか？")) return;
    setRaceDirty(false);
  }
  if (view === "race" && state.dirty) {
    if (!window.confirm("保存していない選手情報があります。破棄して移動しますか？")) return;
    setDirty(false);
  }
  elements.raceWorkspace.hidden = view !== "race";
  elements.athleteWorkspace.hidden = view !== "athlete";
  elements.viewTabs.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

async function initialize() {
  try {
    await api("/api/health");
    document.querySelector(".header-status").classList.add("connected");
    elements.dbStatus.textContent = window.keirinWebApi ? "Web DB接続済み" : "DB接続済み";
    const [options, columnPreference] = await Promise.all([
      api("/api/options"),
      api("/api/preferences/race-columns"),
    ]);
    state.options = options;
    raceState.columns = columnPreference.columns;
    raceState.availableColumns = columnPreference.available.map((item) => item.key);
    columnPreference.available.forEach((item) => {
      raceColumnDefinitions[item.key] = {
        label: item.label,
        group: item.group,
        className: item.key === "formation_performance"
          ? "formation-column"
          : (["source_comment", "profile_comment", "user_comment"].includes(item.key) ? "comment-column" : ""),
      };
    });
    populateSelect(elements.classFilter, state.options.classes);
    populateSelect(elements.prefectureFilter, state.options.prefectures);
    const classSelect = elements.editorForm.elements.class_code;
    const prefectureSelect = elements.editorForm.elements.prefecture;
    populateSelect(classSelect, state.options.classes, "選択してください");
    populateSelect(prefectureSelect, state.options.prefectures, "選択してください");
    elements.raceDiscoveryDate.value = localDateString();
    elements.raceDateFilter.value = localDateString();
    await Promise.all([loadRaces(), loadAthletes(true)]);
  } catch (error) {
    elements.dbStatus.textContent = "DB接続エラー";
    showToast(error.message, "error");
  }
}

async function loadRaces() {
  const params = new URLSearchParams();
  if (elements.raceDateFilter.value) params.set("date", elements.raceDateFilter.value);
  try {
    const data = await api(`/api/races?${params}`);
    raceState.items = data.items;
    renderRaceList();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderRaceList() {
  if (!raceState.items.length) {
    elements.raceList.innerHTML = '<p class="race-list-empty">この日付の保存済みレースはありません。</p>';
    return;
  }
  elements.raceList.innerHTML = raceState.items.map((race) => `
    <button type="button" class="race-list-card ${race.race_id === raceState.selectedRaceId ? "active" : ""}" data-race-id="${race.race_id}">
      <span class="race-list-number">${race.race_number}R</span>
      <span class="race-list-main"><strong>${escapeHtml(race.venue_name)}</strong><small>${escapeHtml(race.race_class || "クラス未取得")}・${escapeHtml(race.start_time || "発走時刻なし")}</small></span>
      <span class="race-list-review">脚評価 ${race.reviewed_count}/${race.starters || 0}</span>
    </button>
  `).join("");
}

async function importRaceSource(source, triggerButton = elements.raceImportButton) {
  if (!source) return;
  const originalText = triggerButton.textContent;
  triggerButton.disabled = true;
  triggerButton.textContent = "取得中";
  try {
    const result = await api("/api/races/import", {
      method: "POST",
      body: JSON.stringify({ source }),
    });
    elements.raceDateFilter.value = `${result.race_id.slice(0, 4)}-${result.race_id.slice(4, 6)}-${result.race_id.slice(6, 8)}`;
    await loadRaces();
    await selectRace(result.race_id);
    showToast(result.comment_error
      ? `${result.starters}選手を取込。WINTICKETコメントは取得できませんでした`
      : `${result.starters}選手の出走表とコメントを取り込みました`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    triggerButton.disabled = false;
    triggerButton.textContent = originalText;
  }
}

async function importRace(event) {
  event.preventDefault();
  await importRaceSource(elements.raceSourceInput.value.trim());
}

function renderDailyRacecards(data) {
  if (!data.venues.length) {
    elements.dailyRacecards.innerHTML = '<p class="race-list-empty">この日の開催レースはありません。</p>';
    return;
  }
  elements.dailyRacecards.innerHTML = `
    <p class="daily-race-count">${escapeHtml(data.date)}　${data.venues.length}場・${data.race_count}レース</p>
    ${data.venues.map((venue) => `
      <section class="daily-venue">
        <h3>${escapeHtml(venue.venue_name)}</h3>
        <div class="daily-race-grid">
          ${venue.races.map((race) => `
            <button type="button" class="daily-race-button" data-race-source="${race.race_id}">
              <strong>${race.race_number}R</strong>
              <span>${escapeHtml(race.start_time || "時刻未定")}</span>
              <small>${escapeHtml(race.race_class || "クラス未取得")}${race.starters ? `・${race.starters}車` : ""}</small>
            </button>`).join("")}
        </div>
      </section>`).join("")}`;
}

async function loadDailyRacecards(event) {
  event?.preventDefault();
  const selectedDate = elements.raceDiscoveryDate.value;
  if (!selectedDate) return;
  elements.raceDateSearchButton.disabled = true;
  elements.raceDateSearchButton.textContent = "検索中";
  elements.dailyRacecards.innerHTML = '<p class="race-list-empty">開催レースを取得しています。</p>';
  try {
    const data = await api(`/api/racecards/by-date?date=${encodeURIComponent(selectedDate)}`);
    renderDailyRacecards(data);
  } catch (error) {
    elements.dailyRacecards.innerHTML = `<p class="race-list-empty">${escapeHtml(error.message)}</p>`;
    showToast(error.message, "error");
  } finally {
    elements.raceDateSearchButton.disabled = false;
    elements.raceDateSearchButton.textContent = "この日のレースを検索";
  }
}

async function selectRace(raceId) {
  if (raceState.dirty && raceId !== raceState.selectedRaceId && !window.confirm("保存していない脚評価・コメントがあります。破棄して別のレースを開きますか？")) return;
  const requestedField = raceState.fieldType;
  const requestSerial = ++raceState.requestSerial;
  try {
    const data = await api(`/api/races/${encodeURIComponent(raceId)}?field=${encodeURIComponent(requestedField)}`);
    if (requestSerial !== raceState.requestSerial || requestedField !== raceState.fieldType) return;
    raceState.selectedData = data;
    raceState.selectedRaceId = raceId;
    renderRaceList();
    renderRace();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function indexCell(value, coverage) {
  if (value === null || value === undefined) return '<span class="index-pill muted">未算出</span>';
  return `<span class="index-pill">${value}</span>`;
}

function evaluationMark(value) {
  return value ? `<span class="evaluation-mark mark-${value}">${value}</span>` : '<span class="not-set">―</span>';
}

function previousLegText(entry) {
  const previous = entry.previous_review;
  if (!previous?.leg_rating) return "―";
  if (previous.scope === "same_meeting") {
    return `${previous.leg_rating}・同開催 (${entry.previous_leg_adjustment >= 0 ? "+" : ""}${entry.previous_leg_adjustment})`;
  }
  return `${previous.leg_rating}・前開催（指数対象外）`;
}

function formationPerformanceCell(entry) {
  const stats = entry.formation_performance;
  if (!stats?.formation_count) {
    return '<div class="formation-performance unavailable"><strong>分戦不明</strong><small>並び予想なし</small></div>';
  }
  if (!stats.starts) {
    return `<div class="formation-performance unavailable"><strong>${stats.formation_count}分戦</strong><small>集計実績なし</small></div>`;
  }
  const rate = (value) => value === null || value === undefined ? "―" : `${value}%`;
  const period = stats.period_start && stats.period_end
    ? `${stats.period_start}～${stats.period_end}未満`
    : "集計期間不明";
  return `<div class="formation-performance" title="${stats.data_source || "履歴"}・${period}・${stats.formation_count}分戦時 ${stats.starts}走">
    <div class="formation-heading"><strong>${stats.formation_count}分戦</strong><small>${stats.starts}走</small></div>
    <div class="formation-rates">
      <span><small>勝率</small><strong>${rate(stats.win_rate_percent)}</strong></span>
      <span><small>連対率</small><strong>${rate(stats.top2_rate_percent)}</strong></span>
      <span><small>3連対率</small><strong>${rate(stats.top3_rate_percent)}</strong></span>
    </div>
  </div>`;
}

function incidentNameSummary(entry) {
  const stats = entry.incident_summary;
  if (!stats?.data_available) {
    return '<div class="name-incident-summary unavailable">異常結果 未取込</div>';
  }
  return `<div class="name-incident-summary" title="直近1年 ${stats.period_start}～${stats.period_end}">
    <span class="fall-abandon">落棄 <b>${stats.fall_abandon_count || 0}</b></span>
    <span class="fall-remount">再乗 <b>${stats.fall_remount_count || 0}</b></span>
    <span class="disqualified">失格 <b>${stats.disqualified_count || 0}</b></span>
    <span class="other-abandon">他棄 <b>${stats.other_abandon_count || 0}</b></span>
  </div>`;
}

function raceColumnCell(key, entry) {
  const renderers = {
    provisional_index: () => indexCell(entry.provisional_index),
    evaluation_index: () => indexCell(entry.evaluation_index, entry.evaluation_coverage),
    start_count: () => `<button type="button" class="s-stat-button" data-s-stats="${entry.registration_no}" title="車番別S成績を表示"><span class="stat-value">${entry.start_count ?? "―"}</span><small>車番別</small></button>`,
    home_count: () => `<span class="stat-value">${entry.home_count ?? "―"}</span>`,
    back_count: () => `<span class="stat-value">${entry.back_count ?? "―"}</span>`,
    formation_performance: () => formationPerformanceCell(entry),
    initiative: () => evaluationMark(entry.initiative),
    second_position: () => evaluationMark(entry.second_position),
    chaos_index: () => indexCell(entry.chaos_index),
    relative_score_index: () => indexCell(entry.relative_score_index),
    previous_leg: () => `<span class="previous-leg">${escapeHtml(previousLegText(entry))}</span>`,
    inspection_comment: () => `<button type="button" class="external-comment-button" data-external-comment="inspection" data-registration="${entry.registration_no}">${entry.inspection_comment ? "前検コメントを見る" : "コメントなし"}</button>`,
    result_comment: () => `<button type="button" class="external-comment-button" data-external-comment="result" data-registration="${entry.registration_no}">${entry.result_comment ? "レース後コメントを見る" : "コメントなし"}</button>`,
    leg_rating: () => `<select class="leg-rating" aria-label="${escapeHtml(entry.official_name)}の今日の脚評価"><option value="">未評価</option>${["◎", "◯", "△", "✕"].map((code) => `<option value="${code}" ${entry.leg_rating === code ? "selected" : ""}>${code}</option>`).join("")}</select>`,
    user_comment: () => `<textarea class="race-comment" rows="2" maxlength="1000" aria-label="${escapeHtml(entry.official_name)}のコメント" placeholder="確認したい内容を記録">${escapeHtml(entry.user_comment || "")}</textarea>`,
  };
  const definition = raceColumnDefinitions[key];
  let content;
  if (renderers[key]) {
    content = renderers[key]();
  } else if (Object.prototype.hasOwnProperty.call(entry.evaluation_values || {}, key)) {
    content = evaluationMark(entry.evaluation_values[key]);
  } else if (key === "review_updated_at" && entry[key]) {
    content = escapeHtml(new Date(entry[key]).toLocaleString("ja-JP"));
  } else {
    content = escapeHtml(entry[key] ?? "―");
  }
  return `<td${definition.className ? ` class="${definition.className}"` : ""}>${content}</td>`;
}

function renderLineGroups(groups) {
  const filter = `<fieldset class="field-type-filter" aria-label="過去成績の車立て区分">
    <legend>過去成績</legend>
    ${[["all", "全て"], ["7", "7車"], ["9", "9車"]].map(([value, label]) => `
      <label><input type="radio" name="fieldType" value="${value}" ${raceState.fieldType === value ? "checked" : ""}>${label}</label>
    `).join("")}
  </fieldset>`;
  if (!Array.isArray(groups) || !groups.length) {
    elements.lineDisplay.innerHTML = `<strong class="line-display-title">ライン</strong><span class="line-empty">並び予想を取得できませんでした</span>${filter}`;
    return;
  }
  elements.lineDisplay.innerHTML = `
    <strong class="line-display-title">ライン</strong>
    <div class="line-groups">${groups.map((group) => `
      <span class="line-group">${group.map((number) => `<span class="bike-number bike-${number}">${number}</span>`).join("")}</span>
    `).join("")}</div>${filter}`;
}

function renderRace() {
  const { race, entries } = raceState.selectedData;
  const inspectionCount = entries.filter((entry) => entry.inspection_comment).length;
  const resultCount = entries.filter((entry) => entry.result_comment).length;
  const fieldLabel = { all: "全成績", 7: "7車成績", 9: "9車成績" }[race.field_type_filter] || "全成績";
  elements.raceEmptyState.hidden = true;
  elements.raceDetail.hidden = false;
  elements.raceTitle.textContent = `${race.venue_name} ${race.race_number}R`;
  elements.raceMeta.textContent = `${race.race_date}　${race.start_time || "発走時刻未取得"}　${race.race_class || "クラス未取得"}`;
  renderLineGroups(race.line_groups);
  elements.externalCommentStatus.textContent = `WINTICKETコメント　前検 ${inspectionCount}/${entries.length}人・レース後 ${resultCount}/${entries.length}人`;
  elements.raceTableHead.innerHTML = `<tr>
    <th class="sticky-bike">車番</th>
    <th class="sticky-name">選手名</th>
    ${raceState.columns.map((key) => {
      const definition = raceColumnDefinitions[key];
      return `<th${definition.className ? ` class="${definition.className}"` : ""}>${definition.label}</th>`;
    }).join("")}
  </tr>`;
  elements.raceEntries.innerHTML = entries.map((entry) => {
    return `
      <tr data-registration="${entry.registration_no}">
        <td class="sticky-bike"><span class="bike-number bike-${entry.bike_number}">${entry.bike_number}</span></td>
        <td class="sticky-name"><button type="button" class="athlete-venue-button" data-venue-stats="${entry.registration_no}" title="${escapeHtml(race.venue_name)}での過去3年間の成績を表示">${escapeHtml(entry.official_name)}</button>${incidentNameSummary(entry)}<small>競走得点 ${entry.race_score ?? "―"}</small></td>
        ${raceState.columns.map((key) => raceColumnCell(key, entry)).join("")}
      </tr>`;
  }).join("");
  const candidates = Array.isArray(race.hole_candidates) ? race.hole_candidates : [];
  elements.holeCandidates.innerHTML = candidates.length
    ? `<h3>穴軸推奨候補（${fieldLabel}）</h3>${candidates.map((candidate) => `
        <article class="hole-candidate-card">
          <strong><span class="bike-number bike-${candidate.bike_number}">${candidate.bike_number}</span>${escapeHtml(candidate.official_name)}</strong>
          ${candidate.reasons.map((reason) => `<p>${escapeHtml(reason)}</p>`).join("")}
        </article>`).join("")}`
    : `<h3>穴軸推奨候補（${fieldLabel}）</h3><p class="hole-candidate-none">このレースは該当なし</p>`;
  setRaceDirty(false);
}

function closeSStats() {
  elements.sStatsModal.hidden = true;
}

function closeExternalComment() {
  elements.externalCommentModal.hidden = true;
}

function closeVenueStats() {
  elements.venueStatsModal.hidden = true;
}

function venueRate(value) {
  return value === null || value === undefined ? "―" : `${value}%`;
}

async function openVenueStats(registrationNo) {
  const race = raceState.selectedData?.race;
  const entry = raceState.selectedData?.entries.find(
    (item) => item.registration_no === registrationNo,
  );
  if (!race || !entry) return;
  elements.venueStatsTitle.textContent = `${entry.official_name}　${race.venue_name}成績`;
  elements.venueStatsSubtitle.textContent = `登録番号 ${registrationNo}`;
  elements.venueStatsBody.innerHTML = '<p class="venue-stats-loading">場別成績を読み込んでいます。</p>';
  elements.venueStatsModal.hidden = false;
  try {
    const data = await api(`/api/athletes/${encodeURIComponent(registrationNo)}/venue-stats?venue=${encodeURIComponent(race.venue_code)}`);
    const period = data.source?.period_start && data.source?.period_end
      ? `${data.source.period_start} ～ ${data.source.period_end}`
      : "集計期間不明";
    elements.venueStatsSubtitle.textContent = `${race.venue_name}・${period}`;
    if (!data.available) {
      elements.venueStatsBody.innerHTML = `
        <div class="venue-stats-empty">
          <strong>表示できる場別成績がありません</strong>
          <p>${escapeHtml(data.reason || "該当データなし")}</p>
        </div>`;
      return;
    }
    const venue = data.venue;
    const decisions = [
      ["逃げ", venue.decisionEscape],
      ["捲り", venue.decisionSprint],
      ["差し", venue.decisionPass],
      ["マーク", venue.decisionMark],
    ];
    elements.venueStatsBody.innerHTML = `
      <div class="venue-stats-summary">
        <span><small>出走</small><strong>${venue.starts}走</strong></span>
        <span><small>勝率</small><strong>${venueRate(venue.winRate)}</strong></span>
        <span><small>2連対率</small><strong>${venueRate(venue.top2Rate)}</strong></span>
        <span><small>3連対率</small><strong>${venueRate(venue.top3Rate)}</strong></span>
      </div>
      <div class="venue-stats-counts">
        <span>1着 <strong>${venue.wins}</strong></span>
        <span>2連対 <strong>${venue.top2}</strong></span>
        <span>3連対 <strong>${venue.top3}</strong></span>
        <span>欠場 <strong>${venue.absences}</strong></span>
      </div>
      <section class="venue-decision-breakdown">
        <h3>1・2着時の決まり手</h3>
        <div>${decisions.map(([label, value]) => `<span><small>${label}</small><strong>${value ?? 0}</strong></span>`).join("")}</div>
        <p>決まり手確認済み ${venue.decisionChecked ?? 0}件</p>
      </section>
      <p class="venue-stats-source">${escapeHtml(data.source.denominator_rule || "")}<br>データ更新: ${escapeHtml(data.source.generated_at || "不明")}・保留 ${data.source.pending_count ?? "―"}件</p>`;
  } catch (error) {
    elements.venueStatsBody.innerHTML = `<div class="venue-stats-empty"><strong>場別成績を読み込めませんでした</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function openExternalComment(registrationNo, type) {
  const entry = raceState.selectedData?.entries.find(
    (item) => item.registration_no === registrationNo,
  );
  if (!entry) return;
  const isInspection = type === "inspection";
  elements.externalCommentKicker.textContent = isInspection ? "前検コメント" : "レース後コメント";
  elements.externalCommentTitle.textContent = entry.official_name;
  elements.externalCommentSubtitle.textContent = `${raceState.selectedData.race.venue_name} ${raceState.selectedData.race.race_number}R`;
  if (isInspection) {
    elements.externalCommentBody.innerHTML = entry.inspection_comment
      ? `<section class="comment-day-section"><h3>前検</h3><p>${escapeHtml(entry.inspection_comment).replaceAll("\n", "<br>")}</p></section>`
      : '<p class="comment-empty">コメントなし</p>';
  } else {
    const days = Array.isArray(entry.result_comment_days) ? [...entry.result_comment_days] : [];
    days.sort((left, right) => (left.day_index ?? 99) - (right.day_index ?? 99));
    elements.externalCommentBody.innerHTML = days.length
      ? days.map((day) => `
          <section class="comment-day-section">
            <h3>${escapeHtml(day.day_label || "レース後")}${day.race_number ? `<small>${day.race_number}R</small>` : ""}</h3>
            <p>${escapeHtml(day.comment || "コメントなし").replaceAll("\n", "<br>")}</p>
          </section>`).join("")
      : '<p class="comment-empty">コメントなし</p>';
  }
  elements.externalCommentModal.hidden = false;
  elements.externalCommentClose.focus();
}

async function openSStats(registrationNo) {
  const entry = raceState.selectedData?.entries.find(
    (item) => item.registration_no === registrationNo,
  );
  elements.sStatsTitle.textContent = `${entry?.official_name || registrationNo}　車番別S成績`;
  elements.sStatsSubtitle.textContent = "読み込み中";
  elements.sStatsSummary.innerHTML = "";
  elements.sStatsBody.innerHTML = '<tr><td colspan="4">集計を読み込んでいます。</td></tr>';
  elements.sStatsModal.hidden = false;
  elements.sStatsClose.focus();
  try {
    const data = await api(`/api/athletes/${encodeURIComponent(registrationNo)}/s-by-bike?field=${encodeURIComponent(raceState.fieldType)}`);
    elements.sStatsTitle.textContent = `${data.official_name}　車番別S成績`;
    elements.sStatsSubtitle.textContent = data.period_start
      ? `${data.period_start} ～ ${data.period_end}`
      : "集計データなし";
    elements.sStatsSummary.innerHTML = `
      <span><strong>${data.confirmed_starts}</strong><small>確認済み出走</small></span>
      <span><strong>${data.s_count}</strong><small>S回数</small></span>
      <span><strong>${data.s_rate_percent === null ? "―" : `${data.s_rate_percent}%`}</strong><small>S率</small></span>
      <span><strong>${data.absent_count}</strong><small>欠場</small></span>
      <span><strong>${data.pending_count}</strong><small>保留</small></span>`;
    elements.sStatsBody.innerHTML = data.bikes.map((row) => `
      <tr>
        <td><span class="bike-number bike-${row.bike_number}">${row.bike_number}</span></td>
        <td>${row.confirmed_starts}</td>
        <td><strong>${row.s_count}</strong></td>
        <td>${row.s_rate_percent === null ? "―" : `${row.s_rate_percent}%`}</td>
      </tr>`).join("");
  } catch (error) {
    elements.sStatsSubtitle.textContent = "集計を表示できません";
    elements.sStatsBody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function saveRaceReviews() {
  if (!raceState.selectedRaceId) return;
  const reviews = raceState.selectedData.entries.map((entry) => {
    const row = elements.raceEntries.querySelector(`[data-registration="${entry.registration_no}"]`);
    return {
      registration_no: entry.registration_no,
      leg_rating: row.querySelector(".leg-rating")?.value ?? entry.leg_rating ?? "",
      user_comment: row.querySelector(".race-comment")?.value ?? entry.user_comment ?? "",
    };
  });
  elements.raceSaveButton.disabled = true;
  elements.raceSaveButton.textContent = "保存中";
  try {
    const result = await api(`/api/races/${raceState.selectedRaceId}/reviews`, {
      method: "PUT",
      body: JSON.stringify({ reviews }),
    });
    showToast(result.changed ? `${result.changed}選手分を保存しました` : "変更はありません");
    raceState.dirty = false;
    await selectRace(raceState.selectedRaceId);
    await loadRaces();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.raceSaveButton.disabled = false;
    elements.raceSaveButton.textContent = "脚評価・コメントを保存";
  }
}

function closeColumnCustomizer() {
  elements.columnCustomizer.hidden = true;
  elements.columnCustomizeButton.focus();
}

function moveColumnItem(item, direction) {
  if (direction < 0 && item.previousElementSibling) {
    item.parentElement.insertBefore(item, item.previousElementSibling);
  } else if (direction > 0 && item.nextElementSibling) {
    item.parentElement.insertBefore(item.nextElementSibling, item);
  }
}

function openColumnCustomizer() {
  if (raceState.dirty) {
    showToast("脚評価・コメントを保存してから表示項目を変更してください", "error");
    return;
  }
  const ordered = [
    ...raceState.columns,
    ...raceState.availableColumns.filter((key) => !raceState.columns.includes(key)),
  ];
  elements.columnList.innerHTML = ordered.map((key) => `
    <li class="column-item" draggable="true" data-column-key="${key}">
      <span class="drag-handle" title="ドラッグして移動" aria-hidden="true">⋮⋮</span>
      <label><input type="checkbox" ${raceState.columns.includes(key) ? "checked" : ""}><span>${raceColumnDefinitions[key].label}<small>${raceColumnDefinitions[key].group || "その他"}</small></span></label>
      <span class="column-move">
        <button type="button" data-move="up" aria-label="${raceColumnDefinitions[key].label}を上へ">↑</button>
        <button type="button" data-move="down" aria-label="${raceColumnDefinitions[key].label}を下へ">↓</button>
      </span>
    </li>
  `).join("");
  elements.columnCustomizer.hidden = false;
  elements.columnList.querySelector("input")?.focus();
}

async function saveColumnPreference() {
  const columns = [...elements.columnList.querySelectorAll(".column-item")]
    .filter((item) => item.querySelector("input").checked)
    .map((item) => item.dataset.columnKey);
  if (!columns.length) {
    showToast("表示項目を1つ以上選択してください", "error");
    return;
  }
  elements.columnSaveButton.disabled = true;
  elements.columnSaveButton.textContent = "保存中";
  try {
    const result = await api("/api/preferences/race-columns", {
      method: "PUT",
      body: JSON.stringify({ columns }),
    });
    raceState.columns = result.columns;
    if (raceState.selectedData) renderRace();
    closeColumnCustomizer();
    showToast("表示項目と順番を保存しました");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.columnSaveButton.disabled = false;
    elements.columnSaveButton.textContent = "この並びで保存";
  }
}

async function loadAthletes(reset = false) {
  if (reset) {
    state.offset = 0;
    state.items = [];
  }
  const params = new URLSearchParams({
    q: elements.searchInput.value.trim(),
    class: elements.classFilter.value,
    prefecture: elements.prefectureFilter.value,
    limit: String(state.limit),
    offset: String(state.offset),
  });
  try {
    const data = await api(`/api/athletes?${params}`);
    state.items = reset ? data.items : [...state.items, ...data.items];
    state.total = data.total;
    state.offset = state.items.length;
    renderAthletes();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function renderAthletes() {
  elements.resultCount.textContent = `${state.total.toLocaleString()}件`;
  if (!state.items.length) {
    elements.athleteList.innerHTML = '<div class="empty-state"><p>条件に一致する選手はいません。</p></div>';
  } else {
    elements.athleteList.innerHTML = state.items.map((item) => `
      <button class="athlete-card ${item.registration_no === state.selectedRegistration ? "active" : ""}" data-registration="${item.registration_no}" role="option" aria-selected="${item.registration_no === state.selectedRegistration}">
        <span class="athlete-name">${escapeHtml(item.official_name)}</span>
        <span class="athlete-number">${item.registration_no}</span>
        <span class="athlete-meta">${escapeHtml(item.class_code)}・${escapeHtml(item.prefecture)}${item.primary_style ? `・${escapeHtml(item.primary_style)}` : ""}</span>
      </button>
    `).join("");
  }
  elements.loadMoreButton.hidden = state.items.length >= state.total;
}

async function selectAthlete(registrationNo) {
  if (state.dirty && !window.confirm("保存していない変更があります。破棄して別の選手を開きますか？")) return;
  try {
    state.selectedData = await api(`/api/athletes/${registrationNo}`);
    state.selectedRegistration = registrationNo;
    renderAthletes();
    renderEditor();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function setFormValue(name, value) {
  const field = elements.editorForm.elements[name];
  if (field) field.value = value ?? "";
}

function renderEditor() {
  const { athlete, profile, evaluations, history } = state.selectedData;
  elements.emptyState.hidden = true;
  elements.editorForm.hidden = false;
  elements.registrationBadge.textContent = athlete.registration_no;
  elements.athleteTitle.textContent = athlete.official_name;
  setFormValue("source_name", athlete.source_name);
  setFormValue("official_name", athlete.official_name);
  setFormValue("age", profile.age);
  setFormValue("class_code", profile.class_code);
  setFormValue("prefecture", profile.prefecture);
  setFormValue("home_bank", profile.home_bank);
  setFormValue("cohort", profile.cohort);
  setFormValue("primary_style", profile.primary_style);
  setFormValue("secondary_style", profile.secondary_style);
  setFormValue("evaluation_period", profile.evaluation_period);
  setFormValue("positive_track_affinity_raw", profile.positive_track_affinity_raw);
  setFormValue("negative_track_affinity_raw", profile.negative_track_affinity_raw);
  setFormValue("weak_season_raw", profile.weak_season_raw);
  setFormValue("comment", profile.comment);

  elements.evaluationGrid.innerHTML = evaluations.map((item) => `
    <label class="evaluation-item">
      <span>${escapeHtml(item.display_name)}</span>
      <select name="evaluation_${item.criterion_code}" data-criterion="${item.criterion_code}">
        <option value="">空欄</option>
        ${["◎", "◯", "△", "✕"].map((code) => `<option value="${code}" ${item.value_code === code ? "selected" : ""}>${code}</option>`).join("")}
      </select>
    </label>
  `).join("");
  renderHistory(history);
  setDirty(false);
  elements.editorForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory(history) {
  if (!history.length) {
    elements.historyList.innerHTML = '<p class="history-empty">この管理画面での変更はまだありません。</p>';
    return;
  }
  elements.historyList.innerHTML = `
    <table class="history-table">
      <thead><tr><th>日時</th><th>項目</th><th>変更前</th><th>変更後</th></tr></thead>
      <tbody>${history.map((item) => `
        <tr>
          <td>${escapeHtml(new Date(item.changed_at).toLocaleString("ja-JP"))}</td>
          <td>${escapeHtml(item.field_name)}</td>
          <td>${escapeHtml(item.old_value ?? "空欄")}</td>
          <td>${escapeHtml(item.new_value ?? "空欄")}</td>
        </tr>
      `).join("")}</tbody>
    </table>`;
}

function collectPayload() {
  const form = new FormData(elements.editorForm);
  const athlete = {
    source_name: form.get("source_name"),
    official_name: form.get("official_name"),
    prefecture: form.get("prefecture"),
    cohort: form.get("cohort"),
  };
  const profile = {
    age: form.get("age"),
    class_code: form.get("class_code"),
    prefecture: form.get("prefecture"),
    home_bank: form.get("home_bank"),
    cohort: form.get("cohort"),
    primary_style: form.get("primary_style"),
    secondary_style: form.get("secondary_style"),
    positive_track_affinity_raw: form.get("positive_track_affinity_raw"),
    negative_track_affinity_raw: form.get("negative_track_affinity_raw"),
    weak_season_raw: form.get("weak_season_raw"),
    comment: form.get("comment"),
  };
  const evaluations = {};
  elements.evaluationGrid.querySelectorAll("select[data-criterion]").forEach((select) => {
    evaluations[select.dataset.criterion] = select.value;
  });
  return { athlete, profile, evaluations };
}

async function saveCurrent(event) {
  event.preventDefault();
  if (!elements.editorForm.reportValidity()) return;
  elements.saveButton.disabled = true;
  elements.saveButton.textContent = "保存中";
  try {
    const result = await api(`/api/athletes/${state.selectedRegistration}`, {
      method: "PUT",
      body: JSON.stringify(collectPayload()),
    });
    showToast(result.changed ? `${result.changed}項目を保存しました` : "変更はありません");
    state.selectedData = await api(`/api/athletes/${state.selectedRegistration}`);
    renderEditor();
    await loadAthletes(true);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.saveButton.disabled = false;
    elements.saveButton.textContent = "保存";
  }
}

elements.viewTabs.forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
elements.raceDateSearchForm.addEventListener("submit", loadDailyRacecards);
elements.dailyRacecards.addEventListener("click", (event) => {
  const button = event.target.closest("[data-race-source]");
  if (button) importRaceSource(button.dataset.raceSource, button);
});
elements.raceImportForm.addEventListener("submit", importRace);
elements.raceDateFilter.addEventListener("change", loadRaces);
elements.raceDateClear.addEventListener("click", () => {
  elements.raceDateFilter.value = "";
  loadRaces();
});
elements.raceList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-race-id]");
  if (card) selectRace(card.dataset.raceId);
});
elements.raceEntries.addEventListener("input", () => setRaceDirty(true));
elements.raceEntries.addEventListener("change", () => setRaceDirty(true));
elements.raceEntries.addEventListener("click", (event) => {
  const venueStatsButton = event.target.closest("[data-venue-stats]");
  if (venueStatsButton) openVenueStats(venueStatsButton.dataset.venueStats);
  const button = event.target.closest("[data-s-stats]");
  if (button) openSStats(button.dataset.sStats);
  const commentButton = event.target.closest("[data-external-comment]");
  if (commentButton) {
    openExternalComment(commentButton.dataset.registration, commentButton.dataset.externalComment);
  }
});
elements.lineDisplay.addEventListener("change", (event) => {
  const input = event.target.closest('input[name="fieldType"]');
  if (!input || !raceState.selectedRaceId) return;
  raceState.fieldType = input.value;
  elements.holeCandidates.innerHTML = '<h3>穴軸推奨候補</h3><p class="hole-candidate-none">集計を切り替えています。</p>';
  selectRace(raceState.selectedRaceId);
});
elements.commentRefreshButton.addEventListener("click", () => {
  const source = raceState.selectedData?.race?.source_url || raceState.selectedRaceId;
  if (source) importRaceSource(source, elements.commentRefreshButton);
});
elements.raceSaveButton.addEventListener("click", saveRaceReviews);
elements.columnCustomizeButton.addEventListener("click", openColumnCustomizer);
elements.columnCustomizeClose.addEventListener("click", closeColumnCustomizer);
elements.columnCancelButton.addEventListener("click", closeColumnCustomizer);
elements.columnSaveButton.addEventListener("click", saveColumnPreference);
elements.columnCustomizer.addEventListener("click", (event) => {
  if (event.target === elements.columnCustomizer) closeColumnCustomizer();
});
elements.sStatsClose.addEventListener("click", closeSStats);
elements.sStatsModal.addEventListener("click", (event) => {
  if (event.target === elements.sStatsModal) closeSStats();
});
elements.externalCommentClose.addEventListener("click", closeExternalComment);
elements.externalCommentModal.addEventListener("click", (event) => {
  if (event.target === elements.externalCommentModal) closeExternalComment();
});
elements.venueStatsClose.addEventListener("click", closeVenueStats);
elements.venueStatsModal.addEventListener("click", (event) => {
  if (event.target === elements.venueStatsModal) closeVenueStats();
});
elements.columnList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-move]");
  if (button) moveColumnItem(button.closest(".column-item"), button.dataset.move === "up" ? -1 : 1);
});
elements.columnList.addEventListener("dragstart", (event) => {
  const item = event.target.closest(".column-item");
  if (!item) return;
  item.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", item.dataset.columnKey);
});
elements.columnList.addEventListener("dragend", (event) => {
  event.target.closest(".column-item")?.classList.remove("dragging");
});
elements.columnList.addEventListener("dragover", (event) => {
  event.preventDefault();
  const dragging = elements.columnList.querySelector(".dragging");
  const target = event.target.closest(".column-item");
  if (!dragging || !target || dragging === target) return;
  const rectangle = target.getBoundingClientRect();
  const after = event.clientY > rectangle.top + rectangle.height / 2;
  elements.columnList.insertBefore(dragging, after ? target.nextElementSibling : target);
});
elements.searchInput.addEventListener("input", () => {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(() => loadAthletes(true), 250);
});
elements.classFilter.addEventListener("change", () => loadAthletes(true));
elements.prefectureFilter.addEventListener("change", () => loadAthletes(true));
elements.loadMoreButton.addEventListener("click", () => loadAthletes(false));
elements.athleteList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-registration]");
  if (card) selectAthlete(card.dataset.registration);
});
elements.editorForm.addEventListener("input", () => setDirty(true));
elements.editorForm.addEventListener("change", () => setDirty(true));
elements.editorForm.addEventListener("submit", saveCurrent);
elements.resetButton.addEventListener("click", () => {
  if (state.selectedData) renderEditor();
});
window.addEventListener("beforeunload", (event) => {
  if (state.dirty || raceState.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.columnCustomizer.hidden) closeColumnCustomizer();
  if (event.key === "Escape" && !elements.sStatsModal.hidden) closeSStats();
  if (event.key === "Escape" && !elements.externalCommentModal.hidden) closeExternalComment();
  if (event.key === "Escape" && !elements.venueStatsModal.hidden) closeVenueStats();
});

if (window.keirinWebApi) window.keirinWebApi.onReady(initialize);
else initialize();
