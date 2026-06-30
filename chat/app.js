// ── 상수 ───────────────────────────────────────────────────────────────────
var RELAY_URL_DEFAULT = "wss://quiet-room-relay.chaostatix.workers.dev";

// ── 유틸 ───────────────────────────────────────────────────────────────────
function randomToken(len) {
  var arr = crypto.getRandomValues(new Uint8Array(Math.ceil(len * 3 / 4)));
  return btoa(String.fromCharCode.apply(null, arr))
    .replace(/[+/=]/g, function (c) { return { "+": "-", "/": "_", "=": "" }[c]; })
    .slice(0, len);
}
function toBase64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function fromBase64(str) { return Uint8Array.from(atob(str), function (c) { return c.charCodeAt(0); }); }
function escapeHtml(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ── 암호화 (개인방 전용) ───────────────────────────────────────────────────
async function deriveKey(secret, roomId) {
  var enc = new TextEncoder();
  var raw = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(roomId), iterations: 200000, hash: "SHA-256" },
    raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

// 비밀키 검증 토큰 (서버가 같은 방에 다른 비밀키로 입장하는 걸 막기 위함)
async function deriveVerifyToken(secret, roomId) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sig = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(roomId + ":verify"));
  return Array.from(new Uint8Array(sig)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

async function encryptPayload(obj) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, state.key, new TextEncoder().encode(JSON.stringify(obj)));
  return { roomId: state.roomId, sender: state.clientId, iv: toBase64(iv), ct: toBase64(ct) };
}
async function decryptPayload(packet) {
  var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(packet.iv) }, state.key, fromBase64(packet.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── 상태 ───────────────────────────────────────────────────────────────────
var state = {
  roomId: null, nickname: null, key: null, isPublic: false,
  clientId: randomToken(8), channel: null, socket: null,
  verifyToken: null, relayUrl: null,
  reconnectAttempts: 0, reconnectTimer: null, heartbeatTimer: null,
  intentionalClose: false,
  msgWindowStart: 0, msgCount: 0,
};

// ── DOM ────────────────────────────────────────────────────────────────────
var els = {
  onlineStatus: document.getElementById("onlineStatus"),
  roomStatus: document.getElementById("roomStatus"),
  cryptoStatus: document.getElementById("cryptoStatus"),
  relayStatus: document.getElementById("relayStatus"),
  userStatus: document.getElementById("userStatus"),
  tabPublic: document.getElementById("tabPublic"),
  tabPrivate: document.getElementById("tabPrivate"),
  loginRequiredNotice: document.getElementById("loginRequiredNotice"),
  publicSection: document.getElementById("publicSection"),
  privateSection: document.getElementById("privateSection"),
  publicRoomList: document.getElementById("publicRoomList"),
  roomId: document.getElementById("roomId"),
  roomSecret: document.getElementById("roomSecret"),
  nickname: document.getElementById("nickname"),
  relayUrl: document.getElementById("relayUrl"),
  newRoomButton: document.getElementById("newRoomButton"),
  showSecretButton: document.getElementById("showSecretButton"),
  joinButton: document.getElementById("joinButton"),
  copyInviteButton: document.getElementById("copyInviteButton"),
  clearButton: document.getElementById("clearButton"),
  form: document.getElementById("form"),
  messageInput: document.getElementById("messageInput"),
  sendButton: document.getElementById("sendButton"),
  fileInput: document.getElementById("fileInput"),
  fileButton: document.getElementById("fileButton"),
  messages: document.getElementById("messages"),
  themeToggle: document.getElementById("themeToggle"),
};

// ── UI 헬퍼 ────────────────────────────────────────────────────────────────
function setStatus(el, text, cls) { el.textContent = text; el.className = "status" + (cls ? " " + cls : ""); }
function resetOnlineStatus() { setStatus(els.onlineStatus, "참여자 —"); }

function clearMessages() {
  els.messages.innerHTML = '<p class="empty" id="emptyMsg">방을 선택하거나 입장하면 채팅이 시작됩니다.</p>';
}

function appendSystem(text, cls) {
  var div = document.createElement("div");
  div.className = cls || "system-msg";
  div.textContent = text;
  els.messages.appendChild(div);
  // column-reverse 레이아웃에서는 scrollTop 0 이 "맨 아래(최신)" 위치
  els.messages.scrollTop = 0;
}

function appendMessage(message, isMine) {
  var empty = document.getElementById("emptyMsg");
  if (empty) empty.remove();
  var time = new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  var div = document.createElement("div");
  div.className = "message" + (isMine ? " mine" : "") + (state.isPublic ? " public" : "");
  var body = "";
  if (message.type === "image" && message.dataUrl) {
    body = '<img class="msg-image" src="' + escapeHtml(message.dataUrl) + '" alt="이미지" onclick="openImage(this.src)" />';
  } else if (message.type === "file" && message.dataUrl) {
    body = '<a class="msg-file" href="' + escapeHtml(message.dataUrl) + '" download="' + escapeHtml(message.fileName || "file") + '">[파일] ' + escapeHtml(message.fileName || "파일") + '</a>';
  } else {
    body = "<p>" + escapeHtml(message.text) + "</p>";
  }
  div.innerHTML = '<div class="message-meta"><span class="sender">' + escapeHtml(message.nickname) + '</span><span>' + time + '</span></div>' + body;
  els.messages.appendChild(div);
  // column-reverse 레이아웃에서는 scrollTop 0 이 "맨 아래(최신)" 위치
  els.messages.scrollTop = 0;
}

function openImage(src) {
  var w = window.open();
  w.document.write('<img src="' + src + '" style="max-width:100%;cursor:pointer" onclick="window.close()" />');
}

function setRoomLocked(locked, allowFile) {
  els.messageInput.disabled = !locked;
  els.sendButton.disabled = !locked;
  els.fileButton.disabled = !locked || !allowFile;
  if (!locked) els.messageInput.placeholder = "방에 입장하면 메시지를 보낼 수 있습니다.";
}

// ── PJH Hub 세션 연동 ──────────────────────────────────────────────────────
function getHubSession() {
  if (window.PJHAuth) return window.PJHAuth.getSession();
  return null;
}

function refreshAuthUI() {
  var session = getHubSession();
  if (session) {
    els.userStatus.textContent = session.realName + " (" + session.userId + ")";
    els.userStatus.style.display = "";
    els.loginRequiredNotice.style.display = "none";
  } else {
    els.userStatus.style.display = "none";
  }
  return session;
}

// ── 네트워크 ────────────────────────────────────────────────────────────────
function stopHeartbeat() {
  if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
}
function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatTimer = setInterval(function () {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      try { state.socket.send(JSON.stringify({ type: "ping" })); } catch (e) {}
    }
  }, 30000);
}
function clearReconnectTimer() {
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
}

function closeConnections() {
  state.intentionalClose = true;
  clearReconnectTimer();
  stopHeartbeat();
  if (state.channel) { state.channel.close(); state.channel = null; }
  if (state.socket) { state.socket.close(); state.socket = null; }
  resetOnlineStatus();
}

function leaveRoom() {
  closeConnections();
  setRoomLocked(false, false);
  state.key = null;
  state.roomId = null;
  state.verifyToken = null;
  state.isPublic = false;
}

function connectLocalChannel() {
  state.channel = new BroadcastChannel("quiet-room:" + state.roomId);
  state.channel.addEventListener("message", function (e) {
    var data = e.data;
    if (!data) return;
    // 공개방: 평문 메시지가 그대로 옴 (relay 의 handleRelayMessage 형태와 동일)
    if (state.isPublic) { handleRelayMessage(data); return; }
    // 개인방: BroadcastChannel 에는 packet 객체가 래핑 없이 그대로 옴 (relay 와 다른 경로)
    if (data.roomId === state.roomId && data.sender !== state.clientId) {
      receivePrivatePacket(data);
    }
  });
}

function connectRelay(url, opts) {
  opts = opts || {};
  if (!url) { setStatus(els.relayStatus, "로컬 모드"); if (opts.isPublic) setStatus(els.onlineStatus, "접속 중 1명", "good"); return; }

  state.relayUrl = url;
  state.intentionalClose = false;

  try {
    var qs = "?clientId=" + encodeURIComponent(state.clientId) + "&nickname=" + encodeURIComponent(state.nickname);
    if (opts.isPublic) qs += "&public=1";
    else qs += "&verifyToken=" + encodeURIComponent(state.verifyToken || "");

    var wsUrl = url.replace(/\/+$/, "") + "/room/" + encodeURIComponent(state.roomId) + qs;
    setStatus(els.relayStatus, opts.isReconnect ? "재연결 중…" : "연결 중…", "warn");

    var socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.addEventListener("open", function () {
      state.reconnectAttempts = 0;
      setStatus(els.relayStatus, "연결됨", "good");
      startHeartbeat();
    });

    socket.addEventListener("message", function (e) {
      var parsed;
      try { parsed = JSON.parse(e.data); } catch (err) { return; }

      if (parsed.type === "pong") return;

      if (parsed.type === "error" && parsed.code === "KEY_MISMATCH") {
        appendSystem("[경고] 이 방은 이미 다른 비밀키로 운영 중입니다. 비밀키를 확인 후 다시 시도해주세요.");
        setStatus(els.roomStatus, "비밀키가 일치하지 않습니다", "warn");
        state.intentionalClose = true;
        leaveRoom();
        els.joinButton.disabled = false;
        els.joinButton.textContent = "방 입장";
        return;
      }

      handleRelayMessage(parsed);
    });

    socket.addEventListener("close", function (event) {
      stopHeartbeat();
      resetOnlineStatus();

      if (event.code === 4003) {
        appendSystem("[경고] 이 방은 이미 다른 비밀키로 운영 중입니다.");
        setStatus(els.roomStatus, "비밀키가 일치하지 않습니다", "warn");
        state.intentionalClose = true;
        leaveRoom();
        els.joinButton.disabled = false;
        els.joinButton.textContent = "방 입장";
        return;
      }

      if (event.code === 4000) {
        appendSystem("[알림] 관리자에 의해 방이 종료되었습니다.");
        state.intentionalClose = true;
        leaveRoom();
        return;
      }

      if (state.intentionalClose) { setStatus(els.relayStatus, "끊김", "warn"); return; }

      setStatus(els.relayStatus, "끊김 — 재연결 중…", "warn");
      scheduleReconnect(opts.isPublic);
    });

    socket.addEventListener("error", function () {
      setStatus(els.relayStatus, "오류", "warn");
    });
  } catch (e) {
    setStatus(els.relayStatus, "URL 오류", "warn");
  }
}

function scheduleReconnect(isPublic) {
  if (state.intentionalClose || !state.roomId) return;
  clearReconnectTimer();
  state.reconnectAttempts = Math.min(state.reconnectAttempts + 1, 6);
  var delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), 30000);
  state.reconnectTimer = setTimeout(function () {
    if (state.intentionalClose || !state.roomId) return;
    connectRelay(state.relayUrl, { isPublic: isPublic, isReconnect: true });
  }, delay);
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  if (!state.roomId) return;
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) return;
  if (!state.intentionalClose) scheduleReconnect(state.isPublic);
});

function handleRelayMessage(parsed) {
  if (!parsed) return;

  if (parsed.type === "system") {
    if (parsed.event === "join") appendSystem("+ " + parsed.nickname + " 님이 입장했습니다");
    else if (parsed.event === "leave") appendSystem("- " + parsed.nickname + " 님이 퇴장했습니다");
    else if (parsed.event === "rateLimit") appendSystem("[경고] " + (parsed.message || "메시지 속도 제한"), "rate-limit-msg");
    else if (parsed.event === "kill") {
      appendSystem("[알림] " + (parsed.message || "관리자에 의해 방이 종료되었습니다."));
      state.intentionalClose = true;
      leaveRoom();
    }
    if (typeof parsed.online === "number") setStatus(els.onlineStatus, "접속 중 " + parsed.online + "명", "good");
    return;
  }

  if (parsed.type === "online") { setStatus(els.onlineStatus, "접속 중 " + parsed.count + "명", "good"); return; }

  if (parsed.type === "packet" && parsed.roomId === state.roomId && parsed.sender !== state.clientId) {
    receivePrivatePacket(parsed.body);
    return;
  }

  // 공개방 평문 메시지
  if (state.isPublic && parsed.type === "text" && parsed.sender !== state.clientId) {
    appendMessage(parsed, false);
  }
}

function receivePrivatePacket(packet) {
  if (!state.key) return;
  decryptPayload(packet).then(function (msg) {
    appendMessage(msg, false);
  }).catch(function () {
    appendSystem("[경고] 메시지를 복호화할 수 없습니다.");
  });
}

function broadcastPacket(packet) {
  if (state.channel) state.channel.postMessage(packet);
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "packet", roomId: state.roomId, body: packet }));
  }
}

function broadcastPublic(message) {
  message.sender = state.clientId;
  if (state.channel) state.channel.postMessage(message);
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(message));
  }
}

// ── 탭 전환 ────────────────────────────────────────────────────────────────
els.tabPublic.addEventListener("click", function () {
  els.tabPublic.classList.add("active");
  els.tabPrivate.classList.remove("active");
  els.publicSection.style.display = "";
  els.privateSection.style.display = "none";
  leaveRoom();
  clearMessages();
  refreshAuthUI();
});

els.tabPrivate.addEventListener("click", function () {
  els.tabPrivate.classList.add("active");
  els.tabPublic.classList.remove("active");
  els.privateSection.style.display = "";
  els.publicSection.style.display = "none";
  leaveRoom();
  clearMessages();
});

// ── 공개방 입장 ────────────────────────────────────────────────────────────
function joinPublicRoom(roomId, roomName) {
  var session = refreshAuthUI();
  if (!session) {
    els.loginRequiredNotice.style.display = "";
    appendSystem("공개 채팅방은 PJH Hub 로그인이 필요합니다.");
    return;
  }

  leaveRoom();
  state.roomId = roomId;
  state.nickname = session.realName;
  state.isPublic = true;
  state.intentionalClose = false;

  connectLocalChannel();
  connectRelay(RELAY_URL_DEFAULT, { isPublic: true });

  setRoomLocked(true, false);
  els.messageInput.placeholder = roomName + "에서 대화 중...";
  els.messageInput.focus();
  setStatus(els.cryptoStatus, "평문 (공개방)");
  setStatus(els.roomStatus, roomName, "good");
  clearMessages();
  appendSystem("+ " + roomName + "에 입장했습니다.");
}

els.publicRoomList.querySelectorAll(".room-card").forEach(function (card) {
  card.addEventListener("click", function () {
    joinPublicRoom(card.dataset.room, card.dataset.name);
  });
});

// ── 메시지 전송 ────────────────────────────────────────────────────────────
function clientRateLimitOk() {
  var now = Date.now();
  if (!state.msgWindowStart || now - state.msgWindowStart >= 1500) {
    state.msgWindowStart = now;
    state.msgCount = 1;
    return true;
  }
  if (state.msgCount >= 3) return false;
  state.msgCount++;
  return true;
}

els.form.addEventListener("submit", function (event) {
  event.preventDefault();
  var text = els.messageInput.value.trim();
  if (!text || text.length > 2000) return;

  if (!clientRateLimitOk()) {
    appendSystem("[경고] 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도하세요.", "rate-limit-msg");
    return;
  }

  if (state.isPublic) {
    var session = getHubSession();
    if (!session) { appendSystem("로그인이 만료되었습니다. 다시 로그인해주세요."); leaveRoom(); return; }
    var message = { type: "text", text: text, nickname: state.nickname, createdAt: Date.now() };
    appendMessage(message, true);
    broadcastPublic(message);
  } else {
    if (!state.key) return;
    var pmessage = { type: "text", text: text, nickname: state.nickname, createdAt: Date.now() };
    encryptPayload(pmessage).then(function (packet) {
      appendMessage(pmessage, true);
      broadcastPacket(packet);
    });
  }
  els.messageInput.value = "";
});

// ── 파일 전송 (개인방 전용) ────────────────────────────────────────────────
function sendFile(file) {
  if (!file || !state.key || state.isPublic) return;
  if (file.size > 3 * 1024 * 1024) { alert("3MB 이하 파일만 전송 가능합니다."); return; }
  var reader = new FileReader();
  reader.onload = function (e) {
    var isImage = file.type.startsWith("image/");
    var message = { type: isImage ? "image" : "file", dataUrl: e.target.result, fileName: file.name, nickname: state.nickname, createdAt: Date.now() };
    encryptPayload(message).then(function (packet) { appendMessage(message, true); broadcastPacket(packet); });
  };
  reader.readAsDataURL(file);
}

els.fileButton.addEventListener("click", function () { els.fileInput.click(); });
els.fileInput.addEventListener("change", function () { if (els.fileInput.files[0]) { sendFile(els.fileInput.files[0]); els.fileInput.value = ""; } });
els.messages.addEventListener("dragover", function (e) { e.preventDefault(); els.messages.classList.add("drag-over"); });
els.messages.addEventListener("dragleave", function () { els.messages.classList.remove("drag-over"); });
els.messages.addEventListener("drop", function (e) { e.preventDefault(); els.messages.classList.remove("drag-over"); if (e.dataTransfer.files[0]) sendFile(e.dataTransfer.files[0]); });

// ── 개인방 입장 ────────────────────────────────────────────────────────────
function joinRoom() {
  var roomId = els.roomId.value.trim();
  var secret = els.roomSecret.value;
  var nickname = (els.nickname.value.trim() || "익명").slice(0, 20);
  if (!roomId || !secret) { alert("방 ID와 비밀키가 필요합니다."); return; }

  els.joinButton.disabled = true;
  els.joinButton.textContent = "입장 중…";
  setStatus(els.cryptoStatus, "키 유도 중…");
  leaveRoom();
  state.reconnectAttempts = 0;

  Promise.all([deriveKey(secret, roomId), deriveVerifyToken(secret, roomId)]).then(function (results) {
    state.roomId = roomId;
    state.nickname = nickname;
    state.key = results[0];
    state.verifyToken = results[1];
    state.isPublic = false;
    state.intentionalClose = false;

    connectLocalChannel();
    connectRelay(els.relayUrl.value.trim() || RELAY_URL_DEFAULT, { isPublic: false });

    setRoomLocked(true, true);
    els.messageInput.placeholder = "메시지를 입력하세요…";
    els.messageInput.focus();
    setStatus(els.cryptoStatus, "AES-GCM 256", "good");
    setStatus(els.roomStatus, "개인방: " + roomId, "good");
    clearMessages();
    history.replaceState(null, "", "#room=" + encodeURIComponent(roomId));
  }).catch(function () {
    setStatus(els.cryptoStatus, "키 생성 실패", "warn");
  }).finally(function () {
    els.joinButton.disabled = false;
    els.joinButton.textContent = "방 입장";
  });
}

function copyInvite() {
  var params = new URLSearchParams();
  if (els.roomId.value.trim()) params.set("room", els.roomId.value.trim());
  params.set("relay", els.relayUrl.value.trim() || RELAY_URL_DEFAULT);
  navigator.clipboard.writeText(location.origin + location.pathname + "#" + params.toString()).then(function () {
    els.copyInviteButton.textContent = "복사됨";
    setTimeout(function () { els.copyInviteButton.textContent = "초대 링크 복사"; }, 1400);
  });
}

function hydrateFromUrl() {
  var hash = new URLSearchParams(location.hash.slice(1));
  els.roomId.value = hash.get("room") || randomToken(12);
  els.relayUrl.value = hash.get("relay") || RELAY_URL_DEFAULT;
  els.nickname.value = "guest-" + randomToken(3);
  if (hash.get("room")) els.tabPrivate.click();
}

els.newRoomButton.addEventListener("click", function () {
  els.roomId.value = randomToken(12);
  els.roomSecret.value = randomToken(24);
  joinRoom();
});
els.showSecretButton.addEventListener("click", function () {
  els.roomSecret.type = els.roomSecret.type === "password" ? "text" : "password";
});
els.joinButton.addEventListener("click", joinRoom);
els.copyInviteButton.addEventListener("click", copyInvite);
els.clearButton.addEventListener("click", clearMessages);

window.addEventListener("beforeunload", function () { state.intentionalClose = true; });

// ── 다크모드 ───────────────────────────────────────────────────────────────
function initTheme() {
  var saved = localStorage.getItem("qr-theme");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
}
function toggleTheme() {
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("qr-theme", "light");
    els.themeToggle.textContent = "[ DARK ]";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("qr-theme", "dark");
    els.themeToggle.textContent = "[ LIGHT ]";
  }
}
if (els.themeToggle) {
  els.themeToggle.addEventListener("click", toggleTheme);
  var isDarkInit = document.documentElement.getAttribute("data-theme") === "dark";
  els.themeToggle.textContent = isDarkInit ? "[ LIGHT ]" : "[ DARK ]";
}

// ── 초기화 ─────────────────────────────────────────────────────────────────
initTheme();
hydrateFromUrl();
clearMessages();
refreshAuthUI();

if (!window.crypto || !window.crypto.subtle) {
  setStatus(els.cryptoStatus, "HTTPS 필요", "warn");
}
