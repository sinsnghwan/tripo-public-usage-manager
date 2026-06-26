(() => {
  "use strict";

  const SUPABASE_URL = "https://pacxelpgvhiykoptknfx.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_z5zP1C4-nrcMTkbUXtzjPg_g4xkJGwY";
  const ROOM_CODE = "VR-CLASS-2026";

  const IDENTITY_KEY = "tripoManagerIdentityV2";
  const SHARED_MODE_KEY = "tripoManagerSharedModeV2";
  const PENDING_QUEUE_KEY = "tripoManagerPendingQueueV2";
  const MIGRATION_KEY = "tripoManagerMigrationV2";
  const LEGACY_BACKUP_KEY = "tripoManagerLegacyBackupV1";
  const PANEL_POSITION_KEY = "tripoCreditManagerPanelPositionV1";
  const COLLAPSE_KEY = "tripoManagerCollapseV2";
  const LAST_NOTIFIED_VERSION_KEY = "tripoManagerLastNotifiedVersionV2";

  const LEGACY_STATE_KEYS = [
    "tripoCreditManagerStateV1",
    "tripoCreditDetectorStateV3"
  ];

  const TEAM_OPTIONS = ["1팀", "2팀", "3팀", "4팀", "선생님"];
  const EMAIL_WAIT_MS = 6500;
  const POLL_MS = 1000;
  const SYNC_MS = 5000;
  const APP_VERSION_KEY = "tripo-public-manager";
  const VERSION_CHECK_MS = 15 * 60 * 1000;

  const state = {
    identity: null,
    sharedMode: {
      enabled: false,
      sessionId: null,
      baselineEmail: "",
      knownSharedEmail: "",
      startedAt: null
    },
    currentCredit: null,
    sharedCredit: null,
    myRecords: [],
    teamTotals: [],
    mismatchLogs: [],
    pendingQueue: [],
    busy: false,
    notice: "",
    error: "",
    collapsed: {
      myRecords: false,
      teamTotals: false,
      mismatches: true
    },
    updateInfo: {
      available: false,
      latestVersion: "",
      downloadUrl: "",
      message: "",
      required: false
    }
  };

  const bypassButtons = new WeakSet();

  function nowIso() {
    return new Date().toISOString();
  }

  function uuid() {
    return crypto.randomUUID();
  }

  function randomSecret() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(value));
  }

  function browserName() {
    const ua = navigator.userAgent;
    if (/Whale\//i.test(ua)) return "Whale";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/Chrome\//i.test(ua)) return "Chrome";
    return "Chromium";
  }


  function compareVersions(a, b) {
    const pa = String(a || "").split(".").map((part) => Number(part) || 0);
    const pb = String(b || "").split(".").map((part) => Number(part) || 0);
    const length = Math.max(pa.length, pb.length);

    for (let index = 0; index < length; index += 1) {
      const av = pa[index] || 0;
      const bv = pb[index] || 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  }

  async function notifyUpdateOnce(updateInfo) {
    const version = String(updateInfo?.latestVersion || "").trim();
    if (!version) return;

    const stored = await chrome.storage.local.get(LAST_NOTIFIED_VERSION_KEY);
    if (stored[LAST_NOTIFIED_VERSION_KEY] === version) return;

    const response = await chrome.runtime.sendMessage({
      type: "TRIPO_SHOW_UPDATE_NOTIFICATION",
      version,
      required: updateInfo.required === true,
      message:
        updateInfo.message ||
        (updateInfo.required
          ? "필수 업데이트가 있습니다. GitHub에서 최신 ZIP을 다시 받은 뒤 기존 확장 프로그램 폴더를 교체하고 새로고침해주세요."
          : "새 버전이 있습니다. GitHub에서 최신 ZIP을 다시 받은 뒤 기존 확장 프로그램 폴더를 교체하고 새로고침해주세요.")
    });

    if (response?.ok) {
      await chrome.storage.local.set({
        [LAST_NOTIFIED_VERSION_KEY]: version
      });
    }
  }

  async function checkForUpdates(showResult = false) {
    try {
      const rows = await api(
        `tripo_app_versions?app_key=eq.${encodeURIComponent(APP_VERSION_KEY)}&select=latest_version,download_url,update_message,required&limit=1`
      );

      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row?.latest_version) {
        throw new Error("Supabase에 최신 버전 정보가 없습니다.");
      }

      const currentVersion = chrome.runtime.getManifest().version;
      const available = compareVersions(currentVersion, row.latest_version) < 0;

      state.updateInfo = {
        available,
        latestVersion: row.latest_version,
        downloadUrl: row.download_url || "",
        message: row.update_message || "",
        required: row.required === true
      };

      if (available) {
        await notifyUpdateOnce(state.updateInfo);
      }

      if (showResult && !available) {
        state.notice = `현재 최신 버전 ${currentVersion}을 사용 중입니다.`;
        state.error = "";
      }

      render();
    } catch (error) {
      console.warn("[Tripo Manager] update check failed", error);

      if (showResult) {
        state.error = "업데이트 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";
        render();
      }
    }
  }

  function parseCredit(text) {
    const cleaned = String(text ?? "").trim().replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }

  async function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  async function saveIdentity() {
    await chrome.storage.local.set({ [IDENTITY_KEY]: state.identity });
  }

  async function saveSharedMode() {
    await chrome.storage.local.set({ [SHARED_MODE_KEY]: state.sharedMode });
  }

  async function savePendingQueue() {
    await chrome.storage.local.set({ [PENDING_QUEUE_KEY]: state.pendingQueue });
  }

  async function saveCollapsed() {
    await chrome.storage.local.set({ [COLLAPSE_KEY]: state.collapsed });
  }

  async function api(path, { method = "GET", body, prefer = "" } = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    return text ? JSON.parse(text) : null;
  }

  async function rpc(name, args) {
    return api(`rpc/${name}`, { method: "POST", body: args });
  }

  function identityArgs() {
    if (!state.identity) throw new Error("사용자 등록이 필요합니다.");
    return {
      p_member_id: state.identity.memberId,
      p_install_id: state.identity.installId,
      p_install_secret: state.identity.installSecret
    };
  }

  async function loadLocalState() {
    const result = await storageGet([
      IDENTITY_KEY,
      SHARED_MODE_KEY,
      PENDING_QUEUE_KEY,
      MIGRATION_KEY,
      COLLAPSE_KEY
    ]);
    state.identity = result[IDENTITY_KEY] || null;
    state.sharedMode = {
      ...state.sharedMode,
      ...(result[SHARED_MODE_KEY] || {})
    };
    state.pendingQueue = Array.isArray(result[PENDING_QUEUE_KEY])
      ? result[PENDING_QUEUE_KEY]
      : [];
    state.collapsed = {
      ...state.collapsed,
      ...(result[COLLAPSE_KEY] || {})
    };
  }

  async function registerMember(displayName, teamName) {
    const memberId = uuid();
    const installId = uuid();
    const installSecret = randomSecret();

    const rows = await rpc("tripo_v2_register_member", {
      p_member_id: memberId,
      p_display_name: displayName,
      p_team_name: teamName,
      p_install_id: installId,
      p_install_secret: installSecret,
      p_browser_name: browserName()
    });

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.member_id) throw new Error("사용자 등록 결과가 올바르지 않습니다.");

    state.identity = {
      memberId: row.member_id,
      displayName: row.display_name,
      teamName: row.team_name,
      installId,
      installSecret,
      linkCode: row.link_code || ""
    };
    await saveIdentity();
    await migrateLegacyOnce();
    await refreshServerData();
  }

  async function linkExistingMember(memberId, linkCode) {
    const installId = uuid();
    const installSecret = randomSecret();

    const rows = await rpc("tripo_v2_link_install", {
      p_member_id: memberId.trim(),
      p_link_code: linkCode.trim(),
      p_install_id: installId,
      p_install_secret: installSecret,
      p_browser_name: browserName()
    });

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.member_id) throw new Error("기존 사용자 연결에 실패했습니다.");

    state.identity = {
      memberId: row.member_id,
      displayName: row.display_name,
      teamName: row.team_name,
      installId,
      installSecret,
      linkCode: ""
    };
    await saveIdentity();
    await refreshServerData();
  }

  function findCreditElement() {
    const candidates = [];

    for (const bolt of document.querySelectorAll('[class*="i-tripo:bolt"]')) {
      if (bolt.closest("#tripo-public-manager-panel")) continue;

      const interactive = bolt.closest('button, a, [role="button"]');
      const containers = interactive ? [interactive] : [];

      let parent = bolt.parentElement;
      for (let depth = 0; parent && depth < 4; depth += 1, parent = parent.parentElement) {
        if (!containers.includes(parent)) containers.push(parent);
      }

      for (const container of containers) {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;

        const text = (container.innerText || container.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

        for (const match of text.matchAll(/\d[\d,]*/g)) {
          const value = parseCredit(match[0]);
          if (value === null) continue;

          let score = 0;
          if (rect.top < 90) score += 500;
          if (rect.left > window.innerWidth * 0.35) score += 120;
          if (interactive && container === interactive) score += 100;
          if (/업그레이드|upgrade/i.test(text)) score += 80;

          if (
            rect.top >= 90 &&
            /생성|재생성|텍스처|리깅|애니메이션|generate|create|retry/i.test(text)
          ) {
            score -= 600;
          }

          if (rect.width < 24 && rect.height < 24) score -= 300;
          candidates.push({ node: container, value, score });
        }
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.value - a.value;
    });

    return candidates[0] || null;
  }

  function extractPaidAction(button) {
    if (!(button instanceof HTMLButtonElement)) return null;
    if (button.closest("#tripo-public-manager-panel")) return null;
    if (!button.querySelector('[class*="i-tripo:bolt"]')) return null;

    const text = (button.innerText || button.textContent || "").replace(/\s+/g, " ").trim();
    const matches = [...text.matchAll(/(\d[\d,]*)/g)];
    if (!matches.length) return null;

    const amountText = matches[matches.length - 1][1];
    const credits = parseCredit(amountText);
    if (!credits || credits <= 0) return null;

    const actionType = text
      .replace(amountText, "")
      .replace(/[⚡·|]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "유료 작업";

    return { credits, actionType };
  }

  function visibleEmail() {
    for (const label of document.querySelectorAll('label[for="userEmail"]')) {
      if (label.closest("#tripo-public-manager-panel")) continue;
      const input = label.parentElement?.querySelector('input[type="text"],input[type="email"]');
      const value = input?.value?.trim().toLowerCase();
      if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
    }
    return "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(check, timeoutMs = EMAIL_WAIT_MS, intervalMs = 150) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = check();
      if (value) return value;
      await sleep(intervalMs);
    }
    return null;
  }

  function findProfileButton() {
    const buttons = [...document.querySelectorAll("button")];
    return buttons
      .map((button) => {
        const rect = button.getBoundingClientRect();
        let score = 0;
        if (rect.top < 100 && rect.left > window.innerWidth * 0.72) score += 100;
        if (button.querySelector('img[src*="avatar"], [class*="user"], [class*="person"]')) score += 80;
        if (/프로필|profile|account/i.test(button.getAttribute("aria-label") || "")) score += 100;
        return { button, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.button || null;
  }

  function findPersonalInfoButton() {
    return [...document.querySelectorAll("button,div,[role=menuitem]")]
      .find((node) => (node.textContent || "").trim() === "개인 정보") || null;
  }

  function closePersonalInfoModal() {
    const email = visibleEmail();
    if (!email) return;

    const labels = [...document.querySelectorAll('label[for="userEmail"]')];
    const modalRoot = labels[0]?.closest('[role="dialog"], .fixed, .absolute') || labels[0]?.parentElement?.parentElement;
    const closeButton = modalRoot
      ? [...modalRoot.querySelectorAll("button")].find((button) =>
          /닫기|close/i.test(button.getAttribute("aria-label") || "") ||
          button.querySelector('[class*="close"]')
        )
      : null;

    if (closeButton) {
      closeButton.click();
    } else {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  }

  async function readTripoEmailAutomatically() {
    const existing = visibleEmail();
    if (existing) return existing;

    const profileButton = findProfileButton();
    if (!profileButton) throw new Error("Tripo 프로필 버튼을 찾지 못했습니다.");
    profileButton.click();

    const personalInfo = await waitFor(findPersonalInfoButton, 3000);
    if (!personalInfo) throw new Error("Tripo 개인 정보 메뉴를 찾지 못했습니다.");
    personalInfo.click();

    const email = await waitFor(visibleEmail, EMAIL_WAIT_MS);
    if (!email) throw new Error("Tripo 이메일을 읽지 못했습니다.");

    closePersonalInfoModal();
    return email;
  }

  async function getConfiguredSharedAccount() {
    const rows = await rpc("tripo_v2_get_shared_account", {
      ...identityArgs(),
      p_room_code: ROOM_CODE
    });

    const row = Array.isArray(rows) ? rows[0] : rows;
    const email = String(row?.shared_login_id || "").trim().toLowerCase();

    if (!email) {
      throw new Error("Supabase에 공용 Tripo 계정이 설정되지 않았습니다.");
    }

    return email;
  }

  async function startSharedMode() {
    if (!state.identity) throw new Error("먼저 사용자 등록을 완료해주세요.");

    if (state.updateInfo.available && state.updateInfo.required) {
      throw new Error(
        `필수 업데이트 ${state.updateInfo.latestVersion}가 있습니다.\n` +
        `업데이트 후 공용 모드를 사용할 수 있습니다.`
      );
    }

    state.busy = true;
    state.notice = "공용 계정과 현재 Tripo 계정을 확인하고 있습니다…";
    render();

    try {
      const configuredSharedEmail = await getConfiguredSharedAccount();
      const actualEmail = await readTripoEmailAutomatically();

      if (actualEmail.toLowerCase() !== configuredSharedEmail) {
        state.sharedMode = {
          enabled: false,
          sessionId: null,
          baselineEmail: "",
          knownSharedEmail: configuredSharedEmail,
          startedAt: null
        };
        await saveSharedMode();

        throw new Error(
          `현재 로그인 계정은 공용 계정이 아닙니다.\n` +
          `공용 계정: ${configuredSharedEmail}\n` +
          `현재 계정: ${actualEmail}\n` +
          `개인 계정에서는 공용 모드를 켤 수 없습니다.`
        );
      }

      const rows = await rpc("tripo_v2_start_session", {
        ...identityArgs(),
        p_baseline_login_id: configuredSharedEmail,
        p_room_code: ROOM_CODE,
        p_browser_name: browserName()
      });
      const row = Array.isArray(rows) ? rows[0] : rows;

      state.sharedMode = {
        enabled: true,
        sessionId: row.session_id,
        baselineEmail: configuredSharedEmail,
        knownSharedEmail: configuredSharedEmail,
        startedAt: row.started_at || nowIso()
      };
      state.notice = `공용 모드 ON · 기준 계정 ${configuredSharedEmail}`;
      state.error = "";
      await saveSharedMode();
    } finally {
      state.busy = false;
      render();
    }
  }

  async function stopSharedMode(reason = "manual_off") {
    if (state.sharedMode.sessionId && state.identity) {
      try {
        await rpc("tripo_v2_end_session", {
          ...identityArgs(),
          p_session_id: state.sharedMode.sessionId,
          p_end_reason: reason
        });
      } catch (error) {
        console.warn("[Tripo Manager] session end failed", error);
      }
    }

    state.sharedMode = {
      enabled: false,
      sessionId: null,
      baselineEmail: "",
      knownSharedEmail:
        state.sharedMode.knownSharedEmail ||
        state.sharedMode.baselineEmail ||
        "",
      startedAt: null
    };
    await saveSharedMode();
    render();
  }

  async function recordMismatch(actualEmail, actionType) {
    const payload = {
      ...identityArgs(),
      p_session_id: state.sharedMode.sessionId,
      p_baseline_login_id: state.sharedMode.baselineEmail,
      p_actual_login_id: actualEmail || "(읽기 실패)",
      p_attempted_action: actionType,
      p_browser_name: browserName()
    };

    try {
      await rpc("tripo_v2_log_mismatch", payload);
    } catch (error) {
      await enqueue("mismatch", payload);
    }
  }

  async function validateAccountBeforeAction(actionType) {
    if (!state.sharedMode.enabled) {
      throw new Error("공용 사용 모드를 켜야 사용할 수 있습니다.");
    }

    const actualEmail = await readTripoEmailAutomatically();
    const baseline = state.sharedMode.baselineEmail.toLowerCase();
    const match = actualEmail.toLowerCase() === baseline;

    if (!match) {
      await recordMismatch(actualEmail, actionType);
      await stopSharedMode("account_changed");
      throw new Error(
        `Tripo 로그인 계정이 변경되었습니다.\n` +
        `기준 계정: ${baseline}\n` +
        `현재 계정: ${actualEmail}\n` +
        `공용 모드가 자동으로 종료되었습니다.`
      );
    }

    return actualEmail;
  }

  async function createUsageRecord(actionType, credits, actualEmail) {
    const payload = {
      ...identityArgs(),
      p_session_id: state.sharedMode.sessionId,
      p_display_name_snapshot: state.identity.displayName,
      p_usage_amount: credits,
      p_action_type: actionType,
      p_shared_mode_enabled: true,
      p_baseline_login_id: state.sharedMode.baselineEmail,
      p_actual_login_id: actualEmail,
      p_account_match: true,
      p_blocked: false,
      p_browser_name: browserName(),
      p_source: "button_click"
    };

    try {
      await rpc("tripo_v2_record_usage", payload);
    } catch (error) {
      await enqueue("usage", payload);
      throw new Error("네트워크 오류로 임시 저장했습니다. 연결되면 자동 전송됩니다.");
    }
  }

  async function enqueue(type, payload) {
    state.pendingQueue.push({
      id: uuid(),
      type,
      payload,
      queuedAt: nowIso()
    });
    await savePendingQueue();
  }

  async function flushPendingQueue() {
    if (!state.pendingQueue.length) return;

    const remaining = [];
    for (const item of state.pendingQueue) {
      try {
        if (item.type === "usage") {
          await rpc("tripo_v2_record_usage", item.payload);
        } else if (item.type === "mismatch") {
          await rpc("tripo_v2_log_mismatch", item.payload);
        } else if (item.type === "legacy") {
          await rpc("tripo_v2_migrate_legacy", item.payload);
        }
      } catch {
        remaining.push(item);
      }
    }
    state.pendingQueue = remaining;
    await savePendingQueue();
  }

  async function migrateLegacyOnce() {
    if (!state.identity) return;

    const local = await storageGet([MIGRATION_KEY, ...LEGACY_STATE_KEYS]);
    if (local[MIGRATION_KEY]?.completed) return;

    const legacy = LEGACY_STATE_KEYS
      .map((key) => local[key])
      .find((value) => value && typeof value === "object");

    const records = legacy?.records || legacy?.claimedRecords || [];
    await chrome.storage.local.set({
      [LEGACY_BACKUP_KEY]: {
        backedUpAt: nowIso(),
        source: legacy || null
      }
    });

    if (!Array.isArray(records) || records.length === 0) {
      await chrome.storage.local.set({
        [MIGRATION_KEY]: {
          version: 2,
          completed: true,
          completedAt: nowIso(),
          migratedCount: 0
        }
      });
      return;
    }

    const migrationId = uuid();
    const payload = {
      ...identityArgs(),
      p_migration_id: migrationId,
      p_records: records.map((record) => ({
        display_name_snapshot: record.userName || state.identity.displayName,
        usage_amount: Number(record.credits || record.amount || 0),
        action_type: record.actionName || "기존 로컬 기록",
        created_at: record.createdAt || record.claimedAt || nowIso(),
        source: "legacy_local",
        account_verified: false,
        user_verified: false
      })).filter((record) => record.usage_amount > 0)
    };

    try {
      const rows = await rpc("tripo_v2_migrate_legacy", payload);
      await chrome.storage.local.set({
        [MIGRATION_KEY]: {
          version: 2,
          completed: true,
          completedAt: nowIso(),
          migrationRecordId: migrationId,
          result: rows
        }
      });
    } catch {
      await enqueue("legacy", payload);
      await chrome.storage.local.set({
        [MIGRATION_KEY]: {
          version: 2,
          completed: false,
          queued: true,
          migrationRecordId: migrationId
        }
      });
    }
  }

  async function refreshServerData() {
    if (!state.identity) return;

    const rows = await rpc("tripo_v2_get_dashboard", {
      ...identityArgs(),
      p_room_code: ROOM_CODE
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result) return;

    state.myRecords = result.my_records || [];
    state.teamTotals = result.team_totals || [];
    state.mismatchLogs = result.mismatch_logs || [];
    state.sharedCredit = Number.isFinite(result.current_credit)
      ? result.current_credit
      : state.sharedCredit;
    render();
  }

  async function updateSharedCreditIfLower(credit) {
    if (!state.identity || credit === null) return;
    try {
      const rows = await rpc("tripo_v2_update_credit_if_lower", {
        ...identityArgs(),
        p_room_code: ROOM_CODE,
        p_new_credit: credit
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (Number.isFinite(row?.current_credit)) state.sharedCredit = row.current_credit;
    } catch (error) {
      console.warn("[Tripo Manager] credit sync failed", error);
    }
  }

  async function forceSharedCredit(credit) {
    if (!state.identity || credit === null) return;
    const rows = await rpc("tripo_v2_force_credit", {
      ...identityArgs(),
      p_room_code: ROOM_CODE,
      p_new_credit: credit
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    state.sharedCredit = row?.current_credit ?? credit;
    render();
  }

  async function exportExcelFromServer() {
    if (!state.identity) throw new Error("사용자 등록이 필요합니다.");

    const rows = await rpc("tripo_v2_get_export_all", {
      ...identityArgs(),
      p_room_code: ROOM_CODE
    });
    const result = Array.isArray(rows) ? rows[0] : rows;
    const usage = result?.usage_records || [];
    const mismatch = result?.mismatch_logs || [];

    const all = [
      ...usage.map((row) => ({
        display_name: row.display_name_snapshot,
        member_id: row.member_id,
        created_at: row.created_at,
        action_type: row.action_type,
        usage_amount: row.usage_amount,
        shared_mode_enabled: row.shared_mode_enabled,
        baseline: row.baseline_tripo_login_id,
        actual: row.actual_tripo_login_id,
        account_match: row.account_match,
        blocked: row.blocked,
        browser_name: row.browser_name,
        install_id: row.install_id,
        session_id: row.shared_session_id,
        event_type: "사용 기록"
      })),
      ...mismatch.map((row) => ({
        display_name: row.display_name,
        member_id: row.member_id,
        created_at: row.created_at,
        action_type: row.attempted_action,
        usage_amount: 0,
        shared_mode_enabled: true,
        baseline: row.baseline_tripo_login_id,
        actual: row.actual_tripo_login_id,
        account_match: false,
        blocked: true,
        browser_name: row.browser_name,
        install_id: row.install_id,
        session_id: row.shared_session_id,
        event_type: "계정 불일치"
      }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (all.length === 0) {
      throw new Error("Supabase에 내보낼 전체 사용 기록이 없습니다.");
    }

    const header = [
      "사용자 이름", "사용자 ID", "사용 일시", "작업 종류", "사용량",
      "공용 모드 여부", "기준 Tripo 로그인 아이디", "실제 Tripo 로그인 아이디",
      "계정 일치 여부", "작업 차단 여부", "브라우저", "설치 ID",
      "공용 세션 ID", "기록 종류"
    ];

    const xmlEscape = (value) => escapeHtml(value);
    const cells = (values) => values.map((value) =>
      `<Cell><Data ss:Type="${typeof value === "number" ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`
    ).join("");

    const bodyRows = all.map((row) => `<Row>${cells([
      row.display_name,
      row.member_id,
      formatDateTime(row.created_at),
      row.action_type,
      Number(row.usage_amount || 0),
      row.shared_mode_enabled ? "예" : "아니오",
      row.baseline,
      row.actual,
      row.account_match ? "정상" : "불일치",
      row.blocked ? "예" : "아니오",
      row.browser_name,
      row.install_id,
      row.session_id,
      row.event_type
    ])}</Row>`).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Tripo 사용 기록">
  <Table>
   <Row ss:StyleID="Header">${cells(header)}</Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tripo-public-usage-${new Date().toISOString().slice(0, 10)}.xml`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ensurePanel() {
    let panel = document.getElementById("tripo-public-manager-panel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "tripo-public-manager-panel";
    panel.innerHTML = `
      <header class="tpm-header">
        <strong>Tripo 공용 사용 관리</strong>
        <div>
          <button id="tpm-settings" title="설정">⚙</button>
          <button id="tpm-minimize" title="접기">−</button>
        </div>
      </header>
      <div id="tpm-body">
        <div class="tpm-credit">
          <span>현재 공용 크레딧</span>
          <strong id="tpm-credit-value">찾는 중…</strong>
        </div>

        <div id="tpm-notice" class="tpm-notice"></div>
        <div id="tpm-error" class="tpm-error"></div>

        <div id="tpm-update-card" class="tpm-update-card" hidden>
          <div>
            <strong id="tpm-update-title">새 버전이 있습니다.</strong>
            <div id="tpm-update-message"></div>
          </div>
          <button id="tpm-update-download">업데이트 다운로드</button>
        </div>

        <div id="tpm-register" class="tpm-card">
          <strong>최초 사용자 등록</strong>
          <label>소속</label>
          <select id="tpm-team">
            <option value="">선택</option>
            ${TEAM_OPTIONS.map((team) => `<option>${team}</option>`).join("")}
          </select>
          <label>사용자 이름</label>
          <input id="tpm-name" maxlength="30" placeholder="이름 입력">
          <button id="tpm-register-button" class="primary">등록</button>
          <details>
            <summary>기존 사용자로 다른 PC 연결</summary>
            <input id="tpm-link-member" placeholder="사용자 ID">
            <input id="tpm-link-code" placeholder="연결 코드">
            <button id="tpm-link-button">기존 사용자 연결</button>
          </details>
        </div>

        <div id="tpm-identity" class="tpm-card" hidden>
          <div class="row">
            <div>
              <small>등록 사용자</small>
              <strong id="tpm-user"></strong>
            </div>
            <span class="badge">이름 고정</span>
          </div>
          <div class="meta" id="tpm-member-id"></div>
          <div class="meta" id="tpm-link-code-view"></div>
        </div>

        <div id="tpm-mode" class="tpm-card" hidden>
          <div class="row">
            <div>
              <small>공용 사용 모드</small>
              <strong id="tpm-mode-state">OFF</strong>
            </div>
            <button id="tpm-mode-button">켜기</button>
          </div>
          <div class="meta" id="tpm-baseline">개인 사용 가능 · 공용 사용량에는 기록되지 않습니다.</div>
        </div>

        <details id="tpm-my-section" open>
          <summary>내 사용 기록</summary>
          <div id="tpm-my-summary" class="summary"></div>
          <div id="tpm-my-records"></div>
        </details>

        <details id="tpm-team-section" open>
          <summary>팀별 합계</summary>
          <div id="tpm-team-totals"></div>
        </details>

        <details id="tpm-mismatch-section">
          <summary>계정 불일치 기록</summary>
          <div id="tpm-mismatches"></div>
        </details>

        <div class="actions">
          <button id="tpm-force-credit">현재값을 공용 기준으로</button>
          <button id="tpm-export">엑셀 내보내기</button>
          <button id="tpm-check-update">업데이트 확인</button>
        </div>
      </div>
      <div id="tpm-overlay" hidden><span>처리 중…</span></div>
    `;
    document.body.appendChild(panel);

    enableDragging(panel);

    panel.querySelector("#tpm-settings").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "TRIPO_OPEN_OPTIONS" });
    });
    panel.querySelector("#tpm-minimize").addEventListener("click", () => {
      const body = panel.querySelector("#tpm-body");
      body.hidden = !body.hidden;
      panel.querySelector("#tpm-minimize").textContent = body.hidden ? "+" : "−";
    });
    panel.querySelector("#tpm-update-download").addEventListener("click", () => {
      const url = state.updateInfo.downloadUrl;
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    panel.querySelector("#tpm-register-button").addEventListener("click", async () => {
      await runBusy(async () => {
        const name = panel.querySelector("#tpm-name").value.trim();
        const team = panel.querySelector("#tpm-team").value;
        if (!team || !name) throw new Error("소속과 이름을 입력해주세요.");
        await registerMember(name, team);
      });
    });
    panel.querySelector("#tpm-link-button").addEventListener("click", async () => {
      await runBusy(async () => {
        await linkExistingMember(
          panel.querySelector("#tpm-link-member").value,
          panel.querySelector("#tpm-link-code").value
        );
      });
    });
    panel.querySelector("#tpm-mode-button").addEventListener("click", async () => {
      await runBusy(async () => {
        if (state.sharedMode.enabled) await stopSharedMode("manual_off");
        else await startSharedMode();
      });
    });
    panel.querySelector("#tpm-force-credit").addEventListener("click", async () => {
      await runBusy(async () => {
        const found = findCreditElement();
        if (!found) throw new Error("Tripo 현재 크레딧을 찾지 못했습니다.");
        await forceSharedCredit(found.value);
      });
    });
    panel.querySelector("#tpm-export").addEventListener("click", async () => {
      await runBusy(exportExcelFromServer);
    });

    panel.querySelector("#tpm-check-update").addEventListener("click", async () => {
      await runBusy(async () => {
        await checkForUpdates(true);
      });
    });

    return panel;
  }

  async function runBusy(fn) {
    if (state.busy) return;
    state.busy = true;
    state.error = "";
    render();
    try {
      await fn();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    } finally {
      state.busy = false;
      render();
    }
  }

  function render() {
    const panel = ensurePanel();
    const shownCredit = Number.isFinite(state.currentCredit)
      ? state.currentCredit
      : state.sharedCredit;
    panel.querySelector("#tpm-credit-value").textContent =
      shownCredit === null ? "찾는 중…" : shownCredit.toLocaleString("ko-KR");

    panel.querySelector("#tpm-notice").textContent = state.notice || "";
    panel.querySelector("#tpm-error").textContent = state.error || "";

    const updateCard = panel.querySelector("#tpm-update-card");
    const updateTitle = panel.querySelector("#tpm-update-title");
    const updateMessage = panel.querySelector("#tpm-update-message");
    updateCard.hidden = !state.updateInfo.available;

    if (state.updateInfo.available) {
      updateTitle.textContent = state.updateInfo.required
        ? `필수 업데이트 ${state.updateInfo.latestVersion}`
        : `새 버전 ${state.updateInfo.latestVersion}`;

      updateMessage.textContent =
        state.updateInfo.message ||
        "최신 버전을 설치해주세요.";
    }
    panel.querySelector("#tpm-register").hidden = Boolean(state.identity);
    panel.querySelector("#tpm-identity").hidden = !state.identity;
    panel.querySelector("#tpm-mode").hidden = !state.identity;

    if (state.identity) {
      panel.querySelector("#tpm-user").textContent =
        `${state.identity.teamName} · ${state.identity.displayName}`;
      panel.querySelector("#tpm-member-id").textContent =
        `사용자 ID: ${state.identity.memberId}`;
      panel.querySelector("#tpm-link-code-view").textContent =
        state.identity.linkCode
          ? `다른 PC 연결 코드: ${state.identity.linkCode}`
          : "연결 코드는 최초 등록 PC에서 확인하세요.";
    }

    panel.querySelector("#tpm-mode-state").textContent =
      state.sharedMode.enabled ? "ON" : "OFF";
    panel.querySelector("#tpm-mode-state").className =
      state.sharedMode.enabled ? "on" : "off";
    panel.querySelector("#tpm-mode-button").textContent =
      state.sharedMode.enabled ? "끄기" : "켜기";
    panel.querySelector("#tpm-baseline").textContent =
      state.sharedMode.enabled
        ? `기준 Tripo 계정: ${state.sharedMode.baselineEmail}`
        : state.sharedMode.knownSharedEmail
          ? `개인 사용 가능 · 공용 계정 ${state.sharedMode.knownSharedEmail} 사용 시 ON 필요`
          : "개인 사용 가능 · 공용 계정은 공용 모드를 한 번 켜서 등록해주세요.";

    const total = state.myRecords.reduce(
      (sum, row) => sum + Number(row.usage_amount || 0), 0
    );
    panel.querySelector("#tpm-my-summary").textContent =
      `누적 사용량: ${total.toLocaleString("ko-KR")} 크레딧`;

    panel.querySelector("#tpm-my-records").innerHTML =
      state.myRecords.slice(0, 10).map((row) => `
        <div class="item">
          <div><strong>${escapeHtml(row.action_type)}</strong>
          <small>${formatDateTime(row.created_at)}</small></div>
          <b>-${Number(row.usage_amount).toLocaleString("ko-KR")}</b>
        </div>
      `).join("") || `<div class="empty">아직 기록이 없습니다.</div>`;

    panel.querySelector("#tpm-team-totals").innerHTML =
      TEAM_OPTIONS.map((team) => {
        const row = state.teamTotals.find((item) => item.team_name === team);
        return `<div class="item"><strong>${team}</strong><b>${Number(row?.total_usage || 0).toLocaleString("ko-KR")}</b></div>`;
      }).join("");

    panel.querySelector("#tpm-mismatches").innerHTML =
      state.mismatchLogs.slice(0, 20).map((row) => `
        <div class="mismatch">
          <strong>${formatDateTime(row.created_at)} · ${escapeHtml(row.attempted_action)}</strong>
          <small>기준: ${escapeHtml(row.baseline_tripo_login_id)}</small>
          <small>실제: ${escapeHtml(row.actual_tripo_login_id)}</small>
        </div>
      `).join("") || `<div class="empty">불일치 기록이 없습니다.</div>`;

    panel.querySelector("#tpm-overlay").hidden = !state.busy;
  }

  function enableDragging(panel) {
    const header = panel.querySelector(".tpm-header");
    let dragging = false;
    let sx = 0, sy = 0, sl = 0, st = 0;

    const clamp = (left, top) => ({
      left: Math.max(8, Math.min(left, window.innerWidth - panel.offsetWidth - 8)),
      top: Math.max(8, Math.min(top, window.innerHeight - 54))
    });

    chrome.storage.local.get(PANEL_POSITION_KEY).then((result) => {
      const pos = result[PANEL_POSITION_KEY];
      if (pos) {
        const next = clamp(pos.left, pos.top);
        panel.style.left = `${next.left}px`;
        panel.style.top = `${next.top}px`;
        panel.style.right = "auto";
      }
    });

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      dragging = true;
      sx = event.clientX; sy = event.clientY; sl = rect.left; st = rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      event.preventDefault();
      event.stopPropagation();
    }, true);

    window.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const next = clamp(sl + event.clientX - sx, st + event.clientY - sy);
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    window.addEventListener("pointerup", async () => {
      if (!dragging) return;
      dragging = false;
      const rect = panel.getBoundingClientRect();
      await chrome.storage.local.set({
        [PANEL_POSITION_KEY]: { left: rect.left, top: rect.top }
      });
    }, true);
  }

  async function handlePaidClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("button")
      : null;
    if (!button || bypassButtons.has(button)) return;

    const action = extractPaidAction(button);
    if (!action) return;

    // 공용 모드 OFF에서도 공용 계정으로 생성되는 기록 누락은 막아야 합니다.
    // 먼저 원래 클릭을 멈춘 뒤 현재 Tripo 계정을 확인합니다.
    if (!state.sharedMode.enabled) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      await runBusy(async () => {
        if (!state.identity) {
          throw new Error("먼저 사용자 등록을 완료해주세요.");
        }

        const actualEmail = await readTripoEmailAutomatically();
        const knownSharedEmail = (
          state.sharedMode.knownSharedEmail ||
          state.sharedMode.baselineEmail ||
          ""
        ).toLowerCase();

        if (knownSharedEmail && actualEmail.toLowerCase() === knownSharedEmail) {
          throw new Error(
            `현재 Tripo 계정은 등록된 공용 계정입니다.\n` +
            `공용 계정: ${knownSharedEmail}\n` +
            `공용 사용 모드를 켠 뒤 생성해주세요.`
          );
        }

        state.notice =
          `개인 계정 사용 · 공용 사용량에는 기록되지 않습니다.\n` +
          `현재 계정: ${actualEmail}`;
        state.error = "";

        bypassButtons.add(button);
        button.click();
        queueMicrotask(() => bypassButtons.delete(button));
      });
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    await runBusy(async () => {
      if (!state.identity) throw new Error("먼저 사용자 등록을 완료해주세요.");
      const actualEmail = await validateAccountBeforeAction(action.actionType);
      await createUsageRecord(action.actionType, action.credits, actualEmail);
      state.notice = `${action.actionType} · ${action.credits}크레딧 기록 완료`;

      bypassButtons.add(button);
      button.click();
      queueMicrotask(() => bypassButtons.delete(button));
      await refreshServerData();
    });
  }

  async function tickCredit() {
    const found = findCreditElement();
    if (!found) return;
    state.currentCredit = found.value;

    if (!Number.isFinite(state.sharedCredit) || found.value < state.sharedCredit) {
      await updateSharedCreditIfLower(found.value);
    }
    render();
  }

  async function start() {
    ensurePanel();
    await loadLocalState();
    render();
    await checkForUpdates();

    if (state.identity) {
      await migrateLegacyOnce();
      await flushPendingQueue();
      await refreshServerData();
    }

    document.addEventListener("click", (event) => {
      void handlePaidClick(event);
    }, true);

    setInterval(() => void tickCredit(), POLL_MS);
    setInterval(async () => {
      if (!state.identity) return;
      await flushPendingQueue();
      await refreshServerData();
    }, SYNC_MS);

    setInterval(() => {
      void checkForUpdates(false);
    }, VERSION_CHECK_MS);


  }

  void start();
})();
