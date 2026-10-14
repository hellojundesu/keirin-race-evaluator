(() => {
  "use strict";

  const config = window.KEIRIN_WEB_CONFIG;
  if (!config?.projectUrl || !config?.publishableKey) {
    throw new Error("Supabaseの公開設定がありません");
  }

  const sessionKey = "keirin_web_session_v1";
  const snapshotCache = new Map();
  const readyCallbacks = [];
  let session = null;
  let ready = false;

  function parseStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
    else localStorage.removeItem(sessionKey);
  }

  async function authRequest(path, body, accessToken = null) {
    const headers = {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${config.projectUrl}/auth/v1${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.message || data.error_description || "認証に失敗しました");
    return data;
  }

  function normalizedSession(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
      user: data.user,
    };
  }

  async function refreshSession() {
    if (!session?.refresh_token) throw new Error("ログインしてください");
    const data = await authRequest("/token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    saveSession(normalizedSession(data));
    return session;
  }

  async function ensureSession() {
    if (!session) session = parseStoredSession();
    if (!session?.access_token) throw new Error("ログインしてください");
    if (Number(session.expires_at || 0) <= Date.now() + 60_000) {
      await refreshSession();
    }
    return session;
  }

  async function restRequest(method, path, body, headers = {}, retry = true) {
    await ensureSession();
    const response = await fetch(`${config.projectUrl}/rest/v1${path}`, {
      method,
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && retry && session?.refresh_token) {
      await refreshSession();
      return restRequest(method, path, body, headers, false);
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || `データ取得に失敗しました (${response.status})`);
    return data;
  }

  async function getSnapshot(recordType, recordKey) {
    const cacheKey = `${recordType}\u0000${recordKey}`;
    if (snapshotCache.has(cacheKey)) return structuredClone(snapshotCache.get(cacheKey));
    const query = `/shared_snapshots?select=payload&record_type=eq.${encodeURIComponent(recordType)}&record_key=eq.${encodeURIComponent(recordKey)}&limit=1`;
    const rows = await restRequest("GET", query);
    if (!rows?.length) throw new Error(`Web用データがありません: ${recordType}/${recordKey}`);
    snapshotCache.set(cacheKey, rows[0].payload);
    return structuredClone(rows[0].payload);
  }

  async function getOwnRows(table, query = "") {
    return restRequest("GET", `/${table}${query}`);
  }

  function mergeAthleteOverride(detail, override) {
    if (!override || typeof override !== "object") return detail;
    Object.assign(detail.athlete, override.athlete || {});
    Object.assign(detail.profile, override.profile || {});
    const values = override.evaluations || {};
    detail.evaluations.forEach((item) => {
      if (Object.hasOwn(values, item.criterion_code)) item.value_code = values[item.criterion_code] || null;
    });
    return detail;
  }

  async function raceList(dateValue = "") {
    const data = await getSnapshot("races_index", "global");
    const reviews = await getOwnRows("user_race_reviews", "?select=race_id,registration_no,leg_rating,user_comment");
    const counts = new Map();
    reviews.forEach((row) => {
      if (row.leg_rating || row.user_comment) counts.set(row.race_id, (counts.get(row.race_id) || 0) + 1);
    });
    data.items = data.items
      .filter((item) => !dateValue || item.race_date === dateValue)
      .map((item) => ({ ...item, reviewed_count: counts.get(item.race_id) || 0 }));
    return data;
  }

  async function raceDetail(raceId, fieldType) {
    const normalizedField = ["7", "9"].includes(fieldType) ? fieldType : "all";
    const data = await getSnapshot("race_detail", `${raceId}:${normalizedField}`);
    const reviews = await getOwnRows(
      "user_race_reviews",
      `?select=registration_no,leg_rating,user_comment,updated_at&race_id=eq.${encodeURIComponent(raceId)}`,
    );
    const byAthlete = new Map(reviews.map((row) => [row.registration_no, row]));
    data.entries.forEach((entry) => {
      const review = byAthlete.get(entry.registration_no);
      entry.leg_rating = review?.leg_rating || null;
      entry.user_comment = review?.user_comment || null;
      entry.review_updated_at = review?.updated_at || null;
    });
    return data;
  }

  async function saveRaceReviews(raceId, payload) {
    const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
    await restRequest("DELETE", `/user_race_reviews?race_id=eq.${encodeURIComponent(raceId)}`);
    const active = reviews
      .map((row) => ({
        user_id: session.user.id,
        race_id: raceId,
        registration_no: String(row.registration_no),
        leg_rating: String(row.leg_rating || "").trim() || null,
        user_comment: String(row.user_comment || "").trim() || null,
      }))
      .filter((row) => row.leg_rating || row.user_comment);
    if (active.length) {
      await restRequest(
        "POST",
        "/user_race_reviews?on_conflict=user_id,race_id,registration_no",
        active,
        { Prefer: "resolution=merge-duplicates,return=minimal" },
      );
    }
    return { ok: true, changed: active.length, saved_at: new Date().toISOString() };
  }

  async function getAthletes(url) {
    const data = await getSnapshot("athletes_index", "global");
    const query = (url.searchParams.get("q") || "").trim().toLocaleLowerCase("ja");
    const classCode = url.searchParams.get("class") || "";
    const prefecture = url.searchParams.get("prefecture") || "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0);
    const filtered = data.items.filter((item) => {
      const matchesQuery = !query || [item.registration_no, item.official_name, item.source_name]
        .some((value) => String(value || "").toLocaleLowerCase("ja").includes(query));
      return matchesQuery
        && (!classCode || item.class_code === classCode)
        && (!prefecture || item.prefecture === prefecture);
    });
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset };
  }

  async function getAthlete(registrationNo) {
    const detail = await getSnapshot("athlete_detail", registrationNo);
    const rows = await getOwnRows(
      "user_athlete_overrides",
      `?select=payload,updated_at&registration_no=eq.${encodeURIComponent(registrationNo)}&limit=1`,
    );
    return mergeAthleteOverride(detail, rows?.[0]?.payload);
  }

  async function saveAthlete(registrationNo, payload) {
    const beforeRows = await getOwnRows(
      "user_athlete_overrides",
      `?select=payload&registration_no=eq.${encodeURIComponent(registrationNo)}&limit=1`,
    );
    const before = JSON.stringify(beforeRows?.[0]?.payload || {});
    const after = JSON.stringify(payload || {});
    await restRequest(
      "POST",
      "/user_athlete_overrides?on_conflict=user_id,registration_no",
      { user_id: session.user.id, registration_no: registrationNo, payload },
      { Prefer: "resolution=merge-duplicates,return=minimal" },
    );
    return { ok: true, changed: before === after ? 0 : 1, saved_at: new Date().toISOString() };
  }

  async function venueStats(registrationNo, venueCode) {
    const [athlete, metadata] = await Promise.all([
      getSnapshot("venue_stats", registrationNo),
      getSnapshot("venue_stats_meta", "global"),
    ]);
    const normalizedVenue = String(venueCode || "").padStart(2, "0");
    const venue = athlete.venues?.find((item) => String(item.venueCode || "").padStart(2, "0") === normalizedVenue);
    const source = {
      schema_version: metadata.schemaVersion,
      generated_at: metadata.generatedAt,
      period_start: metadata.actualPeriodStart,
      period_end: metadata.actualPeriodEnd,
      pending_count: metadata.pendingCount,
      denominator_rule: metadata.denominatorRule,
    };
    if (!venue) {
      return {
        available: false,
        reason: "対象期間中、この競輪場での出走実績はありません",
        athlete: { registration_no: registrationNo, official_name: athlete.name, class_code: athlete.classCode },
        venue_code: normalizedVenue,
        source,
      };
    }
    return {
      available: true,
      athlete: { registration_no: registrationNo, official_name: athlete.name, class_code: athlete.classCode },
      venue,
      source,
    };
  }

  async function request(path, options = {}) {
    await ensureSession();
    const url = new URL(path, window.location.origin);
    const method = String(options.method || "GET").toUpperCase();
    const body = typeof options.body === "string" ? JSON.parse(options.body) : options.body;

    if (method === "GET" && url.pathname === "/api/health") return getSnapshot("health", "global");
    if (method === "GET" && url.pathname === "/api/options") return getSnapshot("options", "global");
    if (url.pathname === "/api/preferences/race-columns") {
      const defaults = await getSnapshot("race_columns", "default");
      if (method === "GET") {
        const rows = await getOwnRows("user_preferences", "?select=value_json&preference_key=eq.race_columns&limit=1");
        return { ...defaults, columns: rows?.[0]?.value_json || defaults.columns };
      }
      await restRequest(
        "POST",
        "/user_preferences?on_conflict=user_id,preference_key",
        { user_id: session.user.id, preference_key: "race_columns", value_json: body.columns },
        { Prefer: "resolution=merge-duplicates,return=minimal" },
      );
      return { ok: true, columns: body.columns, saved_at: new Date().toISOString() };
    }
    if (method === "GET" && url.pathname === "/api/races") return raceList(url.searchParams.get("date") || "");
    if (method === "GET" && url.pathname === "/api/racecards/by-date") {
      const dateValue = url.searchParams.get("date") || "";
      const races = (await raceList(dateValue)).items;
      const grouped = new Map();
      races.forEach((race) => {
        if (!grouped.has(race.venue_code)) grouped.set(race.venue_code, { venue_code: race.venue_code, venue_name: race.venue_name, races: [] });
        grouped.get(race.venue_code).races.push(race);
      });
      return { date: dateValue, venues: [...grouped.values()], race_count: races.length };
    }
    if (method === "POST" && url.pathname === "/api/races/import") {
      const raceId = String(body?.source || "").match(/\d{12}/)?.[0];
      if (!raceId) throw new Error("12桁のレースIDを入力してください");
      const data = await getSnapshot("race_detail", `${raceId}:all`).catch(() => null);
      if (!data) throw new Error("このレースはまだWebへ同期されていません。PC側で取り込んでから差分送信してください");
      return { ok: true, race_id: raceId, starters: data.entries.length, comment_error: null };
    }

    const reviewMatch = url.pathname.match(/^\/api\/races\/(\d{12})\/reviews$/);
    if (reviewMatch && method === "PUT") return saveRaceReviews(reviewMatch[1], body);
    const raceMatch = url.pathname.match(/^\/api\/races\/(\d{12})$/);
    if (raceMatch && method === "GET") return raceDetail(raceMatch[1], url.searchParams.get("field") || "all");

    const venueMatch = url.pathname.match(/^\/api\/athletes\/(\d{5,6})\/venue-stats$/);
    if (venueMatch && method === "GET") return venueStats(venueMatch[1], url.searchParams.get("venue"));
    const sMatch = url.pathname.match(/^\/api\/athletes\/(\d{5,6})\/s-by-bike$/);
    if (sMatch && method === "GET") {
      const field = ["7", "9"].includes(url.searchParams.get("field")) ? url.searchParams.get("field") : "all";
      return getSnapshot("s_by_bike", `${sMatch[1]}:${field}`);
    }
    if (url.pathname === "/api/athletes" && method === "GET") return getAthletes(url);
    const athleteMatch = url.pathname.match(/^\/api\/athletes\/(\d{5,6})$/);
    if (athleteMatch && method === "GET") return getAthlete(athleteMatch[1]);
    if (athleteMatch && method === "PUT") return saveAthlete(athleteMatch[1], body);
    throw new Error(`Web版で未対応の処理です: ${method} ${url.pathname}`);
  }

  function showLogin(message = "") {
    document.body.classList.add("web-locked");
    document.querySelector("#loginScreen").hidden = false;
    document.querySelector("#loginError").textContent = message;
  }

  function showApplication() {
    document.querySelector("#loginScreen").hidden = true;
    document.body.classList.remove("web-locked");
    document.querySelector("#signedInEmail").textContent = session?.user?.email || "ログイン中";
  }

  function fireReady() {
    if (ready) return;
    ready = true;
    showApplication();
    readyCallbacks.splice(0).forEach((callback) => callback());
  }

  async function login(email, password) {
    const data = await authRequest("/token?grant_type=password", { email, password });
    saveSession(normalizedSession(data));
    fireReady();
  }

  async function logout() {
    try {
      if (session?.access_token) await authRequest("/logout", undefined, session.access_token);
    } catch {
      // Local logout must still complete if the remote session has already expired.
    }
    saveSession(null);
    location.reload();
  }

  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#loginButton");
    const error = document.querySelector("#loginError");
    button.disabled = true;
    button.textContent = "ログイン中";
    error.textContent = "";
    try {
      const form = new FormData(event.currentTarget);
      await login(String(form.get("email") || "").trim(), String(form.get("password") || ""));
    } catch (loginError) {
      showLogin(loginError.message);
    } finally {
      button.disabled = false;
      button.textContent = "ログイン";
    }
  });
  document.querySelector("#logoutButton").addEventListener("click", logout);

  session = parseStoredSession();
  if (session) {
    ensureSession().then(fireReady).catch(() => {
      saveSession(null);
      showLogin("セッションの有効期限が切れました。もう一度ログインしてください");
    });
  } else {
    showLogin();
  }

  window.keirinWebApi = Object.freeze({
    request,
    onReady(callback) {
      if (ready) callback();
      else readyCallbacks.push(callback);
    },
  });
})();
