(() => {
  "use strict";

  const SUPABASE_URL = "https://pacxelpgvhiykoptknfx.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_z5zP1C4-nrcMTkbUXtzjPg_g4xkJGwY";
  const APP_KEY = "tripo-public-manager";

  const currentVersionNode = document.querySelector("#current-version");
  const latestVersionNode = document.querySelector("#latest-version");
  const statusNode = document.querySelector("#update-status");
  const releaseListNode = document.querySelector("#release-list");
  const refreshButton = document.querySelector("#refresh-updates");

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function api(path) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }

    return text ? JSON.parse(text) : [];
  }

  function renderReleaseList(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      releaseListNode.innerHTML =
        '<div class="empty">등록된 업데이트 내역이 없습니다.</div>';
      return;
    }

    releaseListNode.innerHTML = rows.map((row) => {
      const notes = Array.isArray(row.change_items)
        ? row.change_items
        : [];

      return `
        <article class="release-item">
          <div class="release-top">
            <span class="release-version">v${escapeHtml(row.version)}</span>
            <span class="release-date">${escapeHtml(formatDate(row.released_at))}</span>
          </div>
          <div class="release-title">${escapeHtml(row.title || "업데이트")}</div>
          <ul class="release-notes">
            ${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        </article>
      `;
    }).join("");
  }

  async function loadUpdates() {
    refreshButton.disabled = true;
    statusNode.classList.remove("error");
    statusNode.textContent = "업데이트 내역을 불러오고 있습니다.";

    try {
      const [versionRows, releaseRows] = await Promise.all([
        api(
          `tripo_app_versions?app_key=eq.${encodeURIComponent(APP_KEY)}` +
          `&select=latest_version&limit=1`
        ),
        api(
          `tripo_app_release_notes?app_key=eq.${encodeURIComponent(APP_KEY)}` +
          `&select=version,title,change_items,released_at` +
          `&order=released_at.desc&limit=30`
        )
      ]);

      latestVersionNode.textContent =
        versionRows?.[0]?.latest_version || "정보 없음";

      renderReleaseList(releaseRows);
      statusNode.textContent =
        `총 ${releaseRows.length}개의 업데이트 내역을 불러왔습니다.`;
    } catch (error) {
      console.error("[Tripo Manager] release notes load failed", error);
      latestVersionNode.textContent = "확인 실패";
      statusNode.classList.add("error");
      statusNode.textContent =
        "업데이트 내역을 불러오지 못했습니다. Supabase SQL 적용 여부를 확인해주세요.";
      releaseListNode.innerHTML =
        '<div class="empty">데이터를 불러올 수 없습니다.</div>';
    } finally {
      refreshButton.disabled = false;
    }
  }

  currentVersionNode.textContent = chrome.runtime.getManifest().version;
  refreshButton.addEventListener("click", () => {
    void loadUpdates();
  });

  void loadUpdates();
})();
