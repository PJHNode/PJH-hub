/* ============================================================
   auth-widget.js
   ------------------------------------------------------------
   PJH Hub 통합 계정 시스템 — 로그인/가입 UI + 세션 관리.
   sessionStorage 키("pjh_session")는 PJH Hub와 채팅 페이지가
   공통으로 읽는 약속된 키이므로, 채팅 페이지에서도 이 스크립트를
   그대로 불러와 재사용한다 (동일 출처/도메인이므로 sessionStorage 공유됨).

   사용법: index.html, quiet-room/index.html 양쪽 모두
   <script src="../auth-widget.js"></script> (경로는 상대위치에 맞게)
   ============================================================ */

(function () {
  const AUTH_API = "https://pjh-auth.chaostatix.workers.dev";
  const SESSION_KEY = "pjh_session"; // { token, userId, realName }

  // ── 세션 읽기/쓰기 (전역에서 재사용 가능하도록 window에 노출) ──
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  window.PJHAuth = {
    getSession,
    setSession,
    clearSession,
    API: AUTH_API,
  };

  // ── 아래는 PJH Hub 메인 페이지에 로그인/가입 UI가 있는 경우에만 동작.
  //    DOM에 해당 요소가 없으면(예: 채팅 페이지 자체 UI를 쓰는 경우) 조용히 종료. ──
  const loginNavBtn = document.getElementById("loginNavBtn");
  if (!loginNavBtn) return;

  const els = {
    loginNavBtn: document.getElementById("loginNavBtn"),
    logoutNavBtn: document.getElementById("logoutNavBtn"),
    userStatus: document.getElementById("userStatus"),
    authSection: document.getElementById("authSection"),
    authTabLogin: document.getElementById("authTabLogin"),
    authTabRegister: document.getElementById("authTabRegister"),
    authLoginForm: document.getElementById("authLoginForm"),
    authRegisterForm: document.getElementById("authRegisterForm"),
    loginId: document.getElementById("loginId"),
    loginPw: document.getElementById("loginPw"),
    loginErr: document.getElementById("loginErr"),
    loginBtn: document.getElementById("loginBtn"),
    regId: document.getElementById("regId"),
    regName: document.getElementById("regName"),
    regPw: document.getElementById("regPw"),
    regErr: document.getElementById("regErr"),
    registerBtn: document.getElementById("registerBtn"),
  };

  function updateAuthUI() {
    const session = getSession();
    if (session) {
      els.userStatus.textContent = session.realName + " (" + session.userId + ")";
      els.userStatus.style.display = "";
      els.logoutNavBtn.style.display = "";
      els.loginNavBtn.style.display = "none";
      els.authSection.style.display = "none";
    } else {
      els.userStatus.style.display = "none";
      els.logoutNavBtn.style.display = "none";
      els.loginNavBtn.style.display = "";
    }
  }

  els.loginNavBtn.addEventListener("click", function () {
    els.authSection.style.display = els.authSection.style.display === "none" ? "block" : "none";
  });

  els.authTabLogin.addEventListener("click", function () {
    els.authTabLogin.classList.add("active");
    els.authTabRegister.classList.remove("active");
    els.authLoginForm.style.display = "";
    els.authRegisterForm.style.display = "none";
  });

  els.authTabRegister.addEventListener("click", function () {
    els.authTabRegister.classList.add("active");
    els.authTabLogin.classList.remove("active");
    els.authRegisterForm.style.display = "";
    els.authLoginForm.style.display = "none";
  });

  els.loginBtn.addEventListener("click", async function () {
    const userId = els.loginId.value.trim();
    const password = els.loginPw.value;
    els.loginErr.textContent = "";

    if (!userId || !password) {
      els.loginErr.textContent = "아이디와 비밀번호를 입력하세요.";
      return;
    }

    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "로그인 중...";

    try {
      const res = await fetch(AUTH_API + "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        els.loginErr.textContent = data.error || "로그인에 실패했습니다.";
        return;
      }
      setSession({ token: data.token, userId: data.userId, realName: data.realName });
      els.loginId.value = "";
      els.loginPw.value = "";
      updateAuthUI();
    } catch (e) {
      els.loginErr.textContent = "네트워크 오류가 발생했습니다.";
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = "로그인";
    }
  });

  els.registerBtn.addEventListener("click", async function () {
    const userId = els.regId.value.trim();
    const realName = els.regName.value.trim();
    const password = els.regPw.value;
    els.regErr.textContent = "";

    if (!userId || !realName || !password) {
      els.regErr.textContent = "모든 항목을 입력하세요.";
      return;
    }

    els.registerBtn.disabled = true;
    els.registerBtn.textContent = "가입 중...";

    try {
      const res = await fetch(AUTH_API + "/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, realName, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        els.regErr.textContent = data.error || "가입에 실패했습니다.";
        return;
      }
      els.regErr.style.color = "#6c6";
      els.regErr.textContent = "가입 완료! 로그인해주세요.";
      els.loginId.value = userId;
      els.authTabLogin.click();
    } catch (e) {
      els.regErr.textContent = "네트워크 오류가 발생했습니다.";
    } finally {
      els.registerBtn.disabled = false;
      els.registerBtn.textContent = "가입하기";
    }
  });

  els.logoutNavBtn.addEventListener("click", async function () {
    const session = getSession();
    if (session) {
      try {
        await fetch(AUTH_API + "/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + session.token },
        });
      } catch (e) {}
    }
    clearSession();
    updateAuthUI();
  });

  updateAuthUI();
})();
