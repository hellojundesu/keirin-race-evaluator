(() => {
  "use strict";

  const state = {
    loaded: false,
    loading: false,
    catalog: null,
    gender: "male",
    selectedClass: "",
    selectedRegistration: "",
    selectedVenue: "",
    mode: "athlete",
    periodYears: 3,
    overview: null,
  };

  const byId = (id) => document.getElementById(id);
  const html = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const normalize = (value) => String(value || "").normalize("NFKC").replace(/[\s　]/g, "").toUpperCase();
  const number = (value) => Number(value || 0).toLocaleString();
  const yen = (value) => `${number(value)}円`;
  const sessionLabels = { morning: "モーニング", day: "デイ", night: "ナイター", midnight: "ミッドナイト" };
  const decisionLabels = [["escape", "逃"], ["sprint", "捲"], ["pass", "差"], ["mark", "マーク"], ["other", "その他"]];

  async function request(path) {
    if (!window.keirinWebApi) throw new Error("Web DBへ接続できません");
    return window.keirinWebApi.request(path);
  }

  function classGroup(value) {
    if (value === "S級S班") return "ss";
    if (["S級1班", "S級2班"].includes(value)) return "s";
    if (["A級1班", "A級2班"].includes(value)) return "a12";
    if (value === "A級3班") return "a3";
    if (value === "L級1班") return "l";
    return "";
  }

  function activeAthletes() {
    return (state.catalog?.items || [])
      .filter((item) => item.kanaStatus !== "retired")
      .sort((a, b) => (a.nameKana || a.name || "").localeCompare(b.nameKana || b.name || "", "ja"));
  }

  function filteredAthletes() {
    const query = normalize(byId("venueAthleteSearch").value);
    return activeAthletes().filter((item) => item.gender === state.gender
      && (!state.selectedClass || classGroup(item.classCode) === state.selectedClass)
      && (!query || normalize(item.name).includes(query) || normalize(item.nameKana).includes(query)));
  }

  function rebuildClassFilter() {
    const choices = state.gender === "female"
      ? [["l", "L1"]]
      : [["ss", "SS"], ["s", "S1・S2"], ["a12", "A1・A2"], ["a3", "A3"]];
    byId("venueClassFilter").innerHTML = '<option value="">すべての級班</option>'
      + choices.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }

  function rebuildAthleteSelect() {
    const items = filteredAthletes();
    const select = byId("venueAthleteSelect");
    select.innerHTML = '<option value="">選択なし</option>' + items.map((item) =>
      `<option value="${html(item.registrationNo)}">${html(item.name)}${item.nameKana ? `（${html(item.nameKana)}）` : ""}</option>`).join("");
    if (items.some((item) => item.registrationNo === state.selectedRegistration)) select.value = state.selectedRegistration;
    else {
      state.selectedRegistration = "";
      showAthleteEmpty();
    }
    byId("venueAthleteCount").textContent = `表示対象 ${number(items.length)}人`;
  }

  function showAthleteEmpty(message = "名前検索または、あいうえお順の一覧から選べます。") {
    byId("venueAthleteEmpty").hidden = false;
    byId("venueAthleteDetail").hidden = true;
    byId("venueAthleteEmpty").querySelector("span").textContent = message;
  }

  async function loadAthleteDetail() {
    if (!state.selectedRegistration) return showAthleteEmpty();
    showAthleteEmpty("場別成績を読み込んでいます。");
    try {
      const data = await request(`/api/venue-stats/athletes/${encodeURIComponent(state.selectedRegistration)}`);
      const athlete = data.athlete;
      byId("venueAthleteName").innerHTML = `${html(athlete.name)}<small>${html(athlete.classCode || "級班不明")}</small>`;
      byId("venueAthleteKana").textContent = athlete.nameKana || "フリガナ未取得";
      byId("venueAthleteTotal").textContent = `合計 ${number(athlete.totalStarts)}走`;
      const rows = state.selectedVenue
        ? (athlete.venues || []).filter((venue) => venue.venueCode === state.selectedVenue)
        : (athlete.venues || []);
      byId("venueAthleteRows").innerHTML = rows.length ? rows.map((venue) => `<tr>
        <td>${html(venue.venueName)}</td><td>${number(venue.starts)}</td><td>${number(venue.wins)}</td><td class="rate">${Number(venue.winRate || 0).toFixed(1)}%</td>
        <td>${number(venue.top2)}</td><td class="rate">${Number(venue.top2Rate || 0).toFixed(1)}%</td><td>${number(venue.top3)}</td><td class="rate">${Number(venue.top3Rate || 0).toFixed(1)}%</td>
        <td>${number(venue.decisionEscape)}・${number(venue.decisionSprint)}・${number(venue.decisionPass)}・${number(venue.decisionMark)}</td></tr>`).join("")
        : '<tr><td colspan="9">選択した競輪場の出走データがありません</td></tr>';
      byId("venueAthleteEmpty").hidden = true;
      byId("venueAthleteDetail").hidden = false;
    } catch (error) {
      showAthleteEmpty(error.message);
    }
  }

  function aggregatePosition(rows, key) {
    return rows.reduce((sum, row) => {
      const item = row[key] || {};
      ["total", "known", "missing", "escape", "sprint", "pass", "mark", "other"].forEach((name) => { sum[name] += Number(item[name] || 0); });
      return sum;
    }, { total: 0, known: 0, missing: 0, escape: 0, sprint: 0, pass: 0, mark: 0, other: 0 });
  }

  function decisionCard(title, stats) {
    return `<h3>${title}</h3><p class="venue-trend-summary">集計 ${number(stats.total)}件 ／ 取得 ${number(stats.known)}件 ／ 欠損 ${number(stats.missing)}件</p>
      <table><thead><tr><th>決まり手</th><th>件数</th><th>割合</th></tr></thead><tbody>${decisionLabels.filter(([code]) => stats[code] || code !== "other").map(([code, label]) => {
        const percent = stats.known ? stats[code] / stats.known * 100 : 0;
        return `<tr><td>${label}<span class="venue-bar"><i style="width:${percent}%"></i></span></td><td>${number(stats[code])}</td><td class="rate">${percent.toFixed(1)}%</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  function payoutItem(label, item) {
    return `<div class="venue-payout-item"><strong>${label}</strong><b>平均 ${yen(item.average)}</b><p>中央値 ${yen(item.median)}<br>範囲 ${yen(item.minimum)} ～ ${yen(item.maximum)}<br>取得 ${number(item.raceCount)}レース（払戻 ${number(item.payoutCount)}件）</p></div>`;
  }

  function renderTrend() {
    const overview = state.overview;
    if (!overview) return;
    const grade = byId("venueTrendGrade").value;
    const session = byId("venueTrendSession").value;
    const decisionFieldSize = Number(byId("venueTrendDecisionFieldSize").value || 0);
    const fieldSize = Number(byId("venueTrendFieldSize").value || 0);
    const rows = (overview.decisionStats || []).filter((row) => row.periodYears === state.periodYears
      && (!grade || row.gradeCode === grade) && (!session || row.sessionCode === session)
      && (!decisionFieldSize || Number(row.fieldSize || 0) === decisionFieldSize));
    const bank = overview.bank;
    byId("venueTrendTitle").textContent = `${overview.venueName}競輪場`;
    byId("venueBankInfo").innerHTML = bank ? `<span>${html(bank.lap)}mバンク</span><span>みなし直線 ${html(bank.straight)}m</span><span>最大カント ${html(bank.cant)}°</span>` : "";
    const decisionFieldLabel = decisionFieldSize ? `${decisionFieldSize}車立て` : "すべて";
    byId("venueTrendFilterLabel").textContent = `過去${state.periodYears}年 ／ 開催区分 ${grade || "すべて"} ／ 時間帯 ${sessionLabels[session] || "すべて"} ／ 車立て ${decisionFieldLabel}`;
    byId("venueTrendRaceCount").textContent = `対象 ${number(rows.reduce((sum, row) => sum + Number(row.raceCount || 0), 0))}レース`;
    byId("venueFirstCard").innerHTML = decisionCard("1着の決まり手", aggregatePosition(rows, "first"));
    byId("venueSecondCard").innerHTML = decisionCard("2着の決まり手", aggregatePosition(rows, "second"));
    const payout = (overview.payoutStats || []).find((row) => row.periodYears === state.periodYears
      && row.gradeCode === grade && row.sessionCode === session && Number(row.fieldSize || 0) === fieldSize);
    const fieldLabel = fieldSize ? `${fieldSize}車立て` : "全車立て";
    byId("venuePayoutContent").innerHTML = payout
      ? `<p class="venue-trend-summary">${fieldLabel}／保存済み払戻データから集計</p><div class="venue-payout-grid">${payoutItem("2車単", payout.quinellaExacta)}${payoutItem("3連単", payout.trifecta)}</div>`
      : `<p class="venue-trend-summary">${fieldLabel}で選択条件に該当する払戻データがありません</p>`;
  }

  async function loadTrendVenue() {
    const code = byId("venueTrendVenue").value;
    if (!code) {
      state.overview = null;
      byId("venueTrendEmpty").hidden = false;
      byId("venueTrendDetail").hidden = true;
      return;
    }
    byId("venueTrendEmpty").hidden = false;
    byId("venueTrendDetail").hidden = true;
    byId("venueTrendEmpty").querySelector("span").textContent = "競輪場データを読み込んでいます。";
    try {
      state.overview = await request(`/api/venue-stats/venues/${encodeURIComponent(code)}`);
      byId("venueTrendEmpty").hidden = true;
      byId("venueTrendDetail").hidden = false;
      renderTrend();
    } catch (error) {
      byId("venueTrendEmpty").querySelector("span").textContent = error.message;
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    document.querySelectorAll("[data-venue-mode]").forEach((button) => button.classList.toggle("active", button.dataset.venueMode === mode));
    byId("venueAthleteView").hidden = mode !== "athlete";
    byId("venueTrendView").hidden = mode !== "trend";
    byId("venuePageTitle").textContent = mode === "athlete" ? "選手別・競輪場成績" : "競輪場の決まり手傾向";
  }

  function bindEvents() {
    document.querySelectorAll("[data-venue-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.venueMode)));
    document.querySelectorAll("[data-venue-gender]").forEach((button) => button.addEventListener("click", () => {
      state.gender = button.dataset.venueGender;
      state.selectedClass = "";
      state.selectedRegistration = "";
      byId("venueAthleteSearch").value = "";
      document.querySelectorAll("[data-venue-gender]").forEach((item) => item.classList.toggle("active", item === button));
      rebuildClassFilter(); rebuildAthleteSelect();
    }));
    byId("venueAthleteSearch").addEventListener("input", rebuildAthleteSelect);
    byId("venueClassFilter").addEventListener("change", (event) => { state.selectedClass = event.target.value; state.selectedRegistration = ""; rebuildAthleteSelect(); });
    byId("venueAthleteSelect").addEventListener("change", (event) => { state.selectedRegistration = event.target.value; loadAthleteDetail(); });
    byId("venueAthleteVenue").addEventListener("change", (event) => { state.selectedVenue = event.target.value; if (state.selectedRegistration) loadAthleteDetail(); });
    byId("venueTrendVenue").addEventListener("change", loadTrendVenue);
    ["venueTrendGrade", "venueTrendSession", "venueTrendDecisionFieldSize", "venueTrendFieldSize"].forEach((id) => byId(id).addEventListener("change", renderTrend));
    document.querySelectorAll("[data-venue-period]").forEach((button) => button.addEventListener("click", () => {
      state.periodYears = Number(button.dataset.venuePeriod);
      document.querySelectorAll("[data-venue-period]").forEach((item) => item.classList.toggle("active", item === button));
      renderTrend();
    }));
  }

  async function activate() {
    if (state.loaded || state.loading) return;
    state.loading = true;
    byId("venuePagePeriod").textContent = "Supabaseから場別成績を読み込んでいます";
    try {
      state.catalog = await request("/api/venue-stats/catalog");
      const meta = state.catalog.metadata || {};
      byId("venuePagePeriod").textContent = `集計対象 ${meta.requestedPeriodStart || "―"} ～ ${meta.requestedPeriodEnd || "―"} ／ 保留 ${number(meta.pendingCount)}件`;
      const venues = state.catalog.venues || [];
      const options = venues.map((venue) => `<option value="${html(venue.venueCode)}">${html(venue.venueName)}</option>`).join("");
      byId("venueAthleteVenue").innerHTML = `<option value="">全競輪場</option>${options}`;
      byId("venueTrendVenue").innerHTML = `<option value="">選択なし</option>${options}`;
      rebuildClassFilter();
      rebuildAthleteSelect();
      state.loaded = true;
    } catch (error) {
      byId("venuePagePeriod").textContent = `読込失敗：${error.message}`;
    } finally {
      state.loading = false;
    }
  }

  bindEvents();
  window.keirinVenueTab = { activate };
})();
