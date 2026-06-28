/* ============================================================
   admin-notice.js (v2)
   ------------------------------------------------------------
  
   <script src="./admin-notice.js"></script> 한 줄만 추가하면 됩니다.
   ============================================================ */

(function () {
  const NOTICE_WORKER = "https://pjh-hub-notices.chaostatix.workers.dev";
  const RELAY_WORKER_HTTP = "https://quiet-room-relay.chaostatix.workers.dev";

  const SESSION_KEY = "pjh_admin_token";
  let pollTimer = null;
  let currentTab = "notice";

  function buildModal() {
    const overlay = document.createElement("div");
    overlay.id = "adminModalOverlay";
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.7);
      display: none; align-items: center; justify-content: center;
      z-index: 9999; font-family: var(--font-sans, sans-serif);
      padding: 16px;
    `;

    overlay.innerHTML = `
      <div id="adminModalBox" style="
        background: var(--surface, #141414); border: 1px solid var(--border, #2a2a2a);
        width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto;
        color: var(--text, #e8e8e8);
      ">
        <div id="authStep" style="padding: 20px;">
          <p style="font-family: var(--font-mono, monospace); font-size: 11px; letter-spacing: 0.08em;
                     text-transform: uppercase; color: var(--sub, #888); margin-bottom: 14px;">
            Admin Access
          </p>
          <input id="adminPwInput" type="password" placeholder="비밀번호"
                 style="width:100%; padding:10px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);
                        color: var(--text,#e8e8e8); font-family: var(--font-mono, monospace); font-size:13px;" />
          <p id="authError" style="color:#d56; font-size:11px; margin-top:8px; min-height:14px;"></p>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button id="authSubmitBtn" style="flex:1; padding:9px; background:var(--mark-bg,#e8e8e8);
                    color:var(--mark-fg,#0d0d0d); border:none; font-weight:700; cursor:pointer;
                    font-family: var(--font-mono, monospace); font-size:12px;">확인</button>
            <button id="authCancelBtn" style="flex:1; padding:9px; background:transparent;
                    color:var(--sub,#888); border:1px solid var(--border,#2a2a2a); cursor:pointer;
                    font-family: var(--font-mono, monospace); font-size:12px;">취소</button>
          </div>
        </div>

        <div id="consoleStep" style="display:none;">
          <div style="display:flex; border-bottom:1px solid var(--border,#2a2a2a);">
            <button class="admin-tab-btn" data-tab="notice" style="flex:1; padding:10px; background:transparent;
                    border:none; color:var(--text,#e8e8e8); cursor:pointer; font-family:var(--font-mono,monospace);
                    font-size:11px; letter-spacing:0.04em; border-bottom:2px solid var(--mark-bg,#e8e8e8);">공지</button>
            <button class="admin-tab-btn" data-tab="rooms" style="flex:1; padding:10px; background:transparent;
                    border:none; color:var(--sub,#888); cursor:pointer; font-family:var(--font-mono,monospace);
                    font-size:11px; letter-spacing:0.04em; border-bottom:2px solid transparent;">방 모니터링</button>
            <button class="admin-tab-btn" data-tab="settings" style="flex:1; padding:10px; background:transparent;
                    border:none; color:var(--sub,#888); cursor:pointer; font-family:var(--font-mono,monospace);
                    font-size:11px; letter-spacing:0.04em; border-bottom:2px solid transparent;">설정</button>
            <button id="consoleCloseBtn" style="padding:10px 14px; background:transparent;
                    border:none; color:var(--sub,#888); cursor:pointer; font-size:14px;">✕</button>
          </div>

          <div id="tabPanel-notice" class="admin-tab-panel" style="padding:16px;">
            <input id="noticeTitleInput" type="text" placeholder="제목 (필수)" maxlength="200"
                   style="width:100%; padding:10px; margin-bottom:8px; background:#0d0d0d;
                          border:1px solid var(--border,#2a2a2a); color: var(--text,#e8e8e8);
                          font-size:13px;" />
            <textarea id="noticeBodyInput" placeholder="내용 (선택)" maxlength="2000" rows="3"
                   style="width:100%; padding:10px; background:#0d0d0d; resize:vertical;
                          border:1px solid var(--border,#2a2a2a); color: var(--text,#e8e8e8);
                          font-size:13px; font-family: var(--font-sans, sans-serif);"></textarea>
            <p id="noticeError" style="color:#d56; font-size:11px; margin-top:6px; min-height:14px;"></p>
            <button id="noticeSubmitBtn" style="width:100%; padding:9px; background:var(--mark-bg,#e8e8e8);
                    color:var(--mark-fg,#0d0d0d); border:none; font-weight:700; cursor:pointer;
                    font-family: var(--font-mono, monospace); font-size:12px; margin-bottom:14px;">게시</button>

            <p style="font-size:10px; color:var(--sub,#888); font-family:var(--font-mono,monospace);
                      letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">기존 공지</p>
            <div id="adminNoticeList" style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;"></div>
          </div>

          <div id="tabPanel-rooms" class="admin-tab-panel" style="display:none; padding:16px;">
            <div style="display:flex; gap:8px; margin-bottom:12px;">
              <div style="flex:1; padding:10px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);">
                <p style="font-size:9px; color:var(--sub,#888); text-transform:uppercase; letter-spacing:0.05em;">활성 방</p>
                <p id="statTotalRooms" style="font-size:20px; font-weight:700; font-family:var(--font-mono,monospace);">—</p>
              </div>
              <div style="flex:1; padding:10px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);">
                <p style="font-size:9px; color:var(--sub,#888); text-transform:uppercase; letter-spacing:0.05em;">총 접속자</p>
                <p id="statTotalConn" style="font-size:20px; font-weight:700; font-family:var(--font-mono,monospace);">—</p>
              </div>
            </div>
            <div id="roomList" style="display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto;"></div>
            <p id="roomsError" style="color:#d56; font-size:11px; margin-top:8px;"></p>
          </div>

          <div id="tabPanel-settings" class="admin-tab-panel" style="display:none; padding:16px;">
            <p style="font-size:10px; color:var(--sub,#888); font-family:var(--font-mono,monospace);
                      letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">긴급 배너</p>
            <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; cursor:pointer;">
              <input type="checkbox" id="bannerActiveToggle" />
              배너 활성화
            </label>
            <input id="bannerMessageInput" type="text" placeholder="배너 메시지 (예: 서버 점검 중입니다)" maxlength="300"
                   style="width:100%; padding:10px; margin-bottom:8px; background:#0d0d0d;
                          border:1px solid var(--border,#2a2a2a); color: var(--text,#e8e8e8); font-size:13px;" />
            <select id="bannerLevelSelect" style="width:100%; padding:9px; margin-bottom:8px; background:#0d0d0d;
                    border:1px solid var(--border,#2a2a2a); color: var(--text,#e8e8e8); font-size:12px;">
              <option value="info">안내 (회색)</option>
              <option value="warn" selected>주의 (노란색)</option>
              <option value="danger">긴급 (빨간색)</option>
            </select>
            <button id="bannerSubmitBtn" style="width:100%; padding:9px; background:var(--mark-bg,#e8e8e8);
                    color:var(--mark-fg,#0d0d0d); border:none; font-weight:700; cursor:pointer;
                    font-family: var(--font-mono, monospace); font-size:12px; margin-bottom:18px;">배너 저장</button>
            <p id="bannerError" style="color:#d56; font-size:11px; margin-top:-12px; margin-bottom:14px; min-height:14px;"></p>

            <p style="font-size:10px; color:var(--sub,#888); font-family:var(--font-mono,monospace);
                      letter-spacing:0.06em; text-transform:uppercase; margin-bottom:8px;">IP 차단 목록</p>
            <div style="display:flex; gap:6px; margin-bottom:8px;">
              <input id="blockIpInput" type="text" placeholder="차단할 IP 주소"
                     style="flex:1; padding:9px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);
                            color: var(--text,#e8e8e8); font-size:12px; font-family:var(--font-mono,monospace);" />
              <button id="blockIpAddBtn" style="padding:9px 14px; background:var(--mark-bg,#e8e8e8);
                      color:var(--mark-fg,#0d0d0d); border:none; font-weight:700; cursor:pointer; font-size:12px;">추가</button>
            </div>
            <div id="blockList" style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto;"></div>
            <p id="blockError" style="color:#d56; font-size:11px; margin-top:8px;"></p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  const overlay = buildModal();
  const authStep = overlay.querySelector("#authStep");
  const consoleStep = overlay.querySelector("#consoleStep");
  const pwInput = overlay.querySelector("#adminPwInput");
  const authError = overlay.querySelector("#authError");
  const authSubmitBtn = overlay.querySelector("#authSubmitBtn");

  function openModal() {
    overlay.style.display = "flex";
    const existingToken = sessionStorage.getItem(SESSION_KEY);
    if (existingToken) {
      enterConsole();
    } else {
      showAuthStep();
    }
  }

  function closeModal() {
    overlay.style.display = "none";
    pwInput.value = "";
    authError.textContent = "";
    stopPolling();
  }

  function showAuthStep() {
    authStep.style.display = "block";
    consoleStep.style.display = "none";
    setTimeout(() => pwInput.focus(), 50);
  }

  async function handleAuthSubmit() {
    const pw = pwInput.value;
    if (!pw) {
      authError.textContent = "비밀번호를 입력하세요.";
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = "확인 중...";
    authError.textContent = "";

    try {
      const res = await fetch(`${NOTICE_WORKER}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pw}` },
      });

      if (res.status === 200) {
        sessionStorage.setItem(SESSION_KEY, pw);
        pwInput.value = "";
        enterConsole();
      } else {
        authError.textContent = "비밀번호가 올바르지 않습니다.";
        pwInput.value = "";
        pwInput.focus();
      }
    } catch (e) {
      authError.textContent = "서버에 연결할 수 없습니다.";
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = "확인";
    }
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY);
  }

  function handleUnauthorized() {
    sessionStorage.removeItem(SESSION_KEY);
    stopPolling();
    authError.textContent = "인증이 만료되었습니다. 다시 입력해주세요.";
    showAuthStep();
  }

  function enterConsole() {
    authStep.style.display = "none";
    consoleStep.style.display = "block";
    switchTab("notice");
    startPolling();
  }

  function switchTab(tab) {
    currentTab = tab;
    overlay.querySelectorAll(".admin-tab-btn").forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.style.color = active ? "var(--text, #e8e8e8)" : "var(--sub, #888)";
      btn.style.borderBottomColor = active ? "var(--mark-bg, #e8e8e8)" : "transparent";
    });
    overlay.querySelectorAll(".admin-tab-panel").forEach((panel) => {
      panel.style.display = panel.id === `tabPanel-${tab}` ? "block" : "none";
    });

    if (tab === "notice") refreshAdminNoticeList();
    if (tab === "rooms") refreshRooms();
    if (tab === "settings") {
      refreshBanner();
      refreshBlocklist();
    }
  }

  overlay.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (overlay.style.display !== "flex") return;
      if (currentTab === "rooms") refreshRooms();
    }, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function handleNoticeSubmit() {
    const titleInput = overlay.querySelector("#noticeTitleInput");
    const bodyInput = overlay.querySelector("#noticeBodyInput");
    const noticeError = overlay.querySelector("#noticeError");
    const btn = overlay.querySelector("#noticeSubmitBtn");

    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title) {
      noticeError.textContent = "제목을 입력하세요.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "게시 중...";
    noticeError.textContent = "";

    try {
      const res = await fetch(`${NOTICE_WORKER}/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ title, body }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        noticeError.textContent = err.error || "게시 중 오류가 발생했습니다.";
        return;
      }

      titleInput.value = "";
      bodyInput.value = "";
      refreshAdminNoticeList();
      if (typeof window.loadNotices === "function") window.loadNotices();
    } catch (e) {
      noticeError.textContent = "네트워크 오류가 발생했습니다.";
    } finally {
      btn.disabled = false;
      btn.textContent = "게시";
    }
  }

  async function refreshAdminNoticeList() {
    const listEl = overlay.querySelector("#adminNoticeList");
    try {
      const res = await fetch(`${NOTICE_WORKER}/notices`);
      const notices = await res.json();
      if (!notices.length) {
        listEl.innerHTML = `<p style="font-size:11px; color:var(--sub,#888);">등록된 공지가 없습니다.</p>`;
        return;
      }
      listEl.innerHTML = notices.map((n) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;
                    padding:8px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);">
          <span style="font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(n.title)}</span>
          <button class="notice-del-btn" data-id="${n.id}" style="flex-shrink:0; padding:4px 8px; background:transparent;
                  border:1px solid var(--border,#2a2a2a); color:#d56; cursor:pointer; font-size:10px;">삭제</button>
        </div>
      `).join("");

      listEl.querySelectorAll(".notice-del-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleNoticeDelete(btn.dataset.id));
      });
    } catch (e) {
      listEl.innerHTML = `<p style="font-size:11px; color:#d56;">목록을 불러올 수 없습니다.</p>`;
    }
  }

  async function handleNoticeDelete(id) {
    try {
      const res = await fetch(`${NOTICE_WORKER}/notices/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      refreshAdminNoticeList();
      if (typeof window.loadNotices === "function") window.loadNotices();
    } catch (e) {}
  }

  async function refreshRooms() {
    const roomListEl = overlay.querySelector("#roomList");
    const roomsError = overlay.querySelector("#roomsError");
    const statRooms = overlay.querySelector("#statTotalRooms");
    const statConn = overlay.querySelector("#statTotalConn");

    try {
      const res = await fetch(`${RELAY_WORKER_HTTP}/admin/rooms`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error();

      const data = await res.json();
      statRooms.textContent = data.totalRooms;
      statConn.textContent = data.totalConnections;
      roomsError.textContent = "";

      if (!data.rooms.length) {
        roomListEl.innerHTML = `<p style="font-size:11px; color:var(--sub,#888);">활성화된 방이 없습니다.</p>`;
        return;
      }

      roomListEl.innerHTML = data.rooms.map((r) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;
                    padding:8px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);">
          <div style="overflow:hidden;">
            <p style="font-size:11px; font-family:var(--font-mono,monospace); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.roomId)}</p>
            <p style="font-size:9px; color:var(--sub,#888);">접속 ${r.online}명</p>
          </div>
          <button class="kill-room-btn" data-room="${escapeHtml(r.roomId)}" style="flex-shrink:0; padding:5px 10px;
                  background:transparent; border:1px solid #d56; color:#d56; cursor:pointer; font-size:10px;">강제 종료</button>
        </div>
      `).join("");

      roomListEl.querySelectorAll(".kill-room-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleKillRoom(btn.dataset.room));
      });
    } catch (e) {
      roomsError.textContent = "방 목록을 불러올 수 없습니다.";
    }
  }

  async function handleKillRoom(roomId) {
    if (!confirm(`"${roomId}" 방을 강제 종료하시겠습니까? 접속 중인 모든 사용자가 즉시 퇴장됩니다.`)) return;
    try {
      const res = await fetch(`${RELAY_WORKER_HTTP}/admin/rooms/${encodeURIComponent(roomId)}/kill`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      refreshRooms();
    } catch (e) {}
  }

  async function refreshBanner() {
    const toggle = overlay.querySelector("#bannerActiveToggle");
    const msgInput = overlay.querySelector("#bannerMessageInput");
    const levelSelect = overlay.querySelector("#bannerLevelSelect");
    try {
      const res = await fetch(`${NOTICE_WORKER}/banner`);
      const banner = await res.json();
      toggle.checked = !!banner.active;
      msgInput.value = banner.message || "";
      if (banner.level) levelSelect.value = banner.level;
    } catch (e) {}
  }

  async function handleBannerSubmit() {
    const toggle = overlay.querySelector("#bannerActiveToggle");
    const msgInput = overlay.querySelector("#bannerMessageInput");
    const levelSelect = overlay.querySelector("#bannerLevelSelect");
    const bannerError = overlay.querySelector("#bannerError");
    const btn = overlay.querySelector("#bannerSubmitBtn");

    const active = toggle.checked;
    const message = msgInput.value.trim();

    if (active && !message) {
      bannerError.textContent = "배너를 활성화하려면 메시지를 입력하세요.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "저장 중...";
    bannerError.textContent = "";

    try {
      const res = await fetch(`${NOTICE_WORKER}/banner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ active, message, level: levelSelect.value }),
      });

      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        bannerError.textContent = err.error || "저장 중 오류가 발생했습니다.";
        return;
      }

      if (typeof window.loadBanner === "function") window.loadBanner();
    } catch (e) {
      bannerError.textContent = "네트워크 오류가 발생했습니다.";
    } finally {
      btn.disabled = false;
      btn.textContent = "배너 저장";
    }
  }

  async function refreshBlocklist() {
    const blockListEl = overlay.querySelector("#blockList");
    const blockError = overlay.querySelector("#blockError");
    try {
      const res = await fetch(`${RELAY_WORKER_HTTP}/admin/blocklist`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      const data = await res.json();
      blockError.textContent = "";

      if (!data.blocklist.length) {
        blockListEl.innerHTML = `<p style="font-size:11px; color:var(--sub,#888);">차단된 IP가 없습니다.</p>`;
        return;
      }

      blockListEl.innerHTML = data.blocklist.map((ip) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;
                    padding:7px 8px; background:#0d0d0d; border:1px solid var(--border,#2a2a2a);">
          <span style="font-size:11px; font-family:var(--font-mono,monospace);">${escapeHtml(ip)}</span>
          <button class="unblock-btn" data-ip="${escapeHtml(ip)}" style="flex-shrink:0; padding:4px 8px;
                  background:transparent; border:1px solid var(--border,#2a2a2a); color:var(--sub,#888);
                  cursor:pointer; font-size:10px;">해제</button>
        </div>
      `).join("");

      blockListEl.querySelectorAll(".unblock-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleUnblock(btn.dataset.ip));
      });
    } catch (e) {
      blockError.textContent = "차단 목록을 불러올 수 없습니다.";
    }
  }

  async function handleBlockAdd() {
    const input = overlay.querySelector("#blockIpInput");
    const blockError = overlay.querySelector("#blockError");
    const ip = input.value.trim();
    if (!ip) {
      blockError.textContent = "IP 주소를 입력하세요.";
      return;
    }
    try {
      const res = await fetch(`${RELAY_WORKER_HTTP}/admin/blocklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ip }),
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        blockError.textContent = err.error || "추가 중 오류가 발생했습니다.";
        return;
      }
      input.value = "";
      blockError.textContent = "";
      refreshBlocklist();
    } catch (e) {
      blockError.textContent = "네트워크 오류가 발생했습니다.";
    }
  }

  async function handleUnblock(ip) {
    try {
      const res = await fetch(`${RELAY_WORKER_HTTP}/admin/blocklist/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      refreshBlocklist();
    } catch (e) {}
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  authSubmitBtn.addEventListener("click", handleAuthSubmit);
  overlay.querySelector("#authCancelBtn").addEventListener("click", closeModal);
  overlay.querySelector("#consoleCloseBtn").addEventListener("click", closeModal);
  overlay.querySelector("#noticeSubmitBtn").addEventListener("click", handleNoticeSubmit);
  overlay.querySelector("#bannerSubmitBtn").addEventListener("click", handleBannerSubmit);
  overlay.querySelector("#blockIpAddBtn").addEventListener("click", handleBlockAdd);

  pwInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAuthSubmit();
  });

  overlay.querySelector("#blockIpInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleBlockAdd();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display === "flex") closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      openModal();
    }
  });

  const openBtn = document.getElementById("adminOpenBtn");
  if (openBtn) {
    openBtn.addEventListener("click", openModal);
  }

  if (typeof window.loadNotices === "function") {
    setInterval(() => {
      if (document.visibilityState === "visible") window.loadNotices();
    }, 5000);
  }

  function ensureBannerEl() {
    let el = document.getElementById("emergencyBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "emergencyBanner";
      el.style.cssText = `
        display: none; padding: 8px 16px; text-align: center;
        font-family: var(--font-mono, monospace); font-size: 12px;
        letter-spacing: 0.02em; position: relative; z-index: 100;
      `;
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  const BANNER_COLORS = {
    info:   { bg: "#1a2a3a", fg: "#9cc8e8", border: "#2a4a6a" },
    warn:   { bg: "#3a2e10", fg: "#ffe0a0", border: "#6a4a10" },
    danger: { bg: "#3a1010", fg: "#ffb0b0", border: "#6a1010" },
  };

  async function loadBanner() {
    try {
      const res = await fetch(`${NOTICE_WORKER}/banner`);
      const banner = await res.json();
      const el = ensureBannerEl();
      if (banner.active && banner.message) {
        const colors = BANNER_COLORS[banner.level] || BANNER_COLORS.warn;
        el.style.background = colors.bg;
        el.style.color = colors.fg;
        el.style.borderBottom = `1px solid ${colors.border}`;
        el.textContent = banner.message;
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    } catch (e) {}
  }

  window.loadBanner = loadBanner;
  loadBanner();
  setInterval(() => {
    if (document.visibilityState === "visible") loadBanner();
  }, 5000);
})();
