// ── Utilities ──────────────────────────────────────────────────────────────

function randomToken(len) {
  const arr = crypto.getRandomValues(new Uint8Array(Math.ceil(len * 3 / 4)));
  return btoa(String.fromCharCode(...arr))
    .replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]))
    .slice(0, len);
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Crypto ─────────────────────────────────────────────────────────────────

async function deriveKey(secret, roomId) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey(
    "raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(roomId), iterations: 200000, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// 비밀키 검증용 토큰: 메시지 암호화 키와는 별개의 값.
// 서버는 이 토큰만 보고 "같은 방에 같은 비밀키로 들어왔는지" 확인하며,
// 토큰만으로는 메시지를 복호화할 수 없으므로 서버는 여전히 내용을 모른다 (Zero-knowledge 유지).
// HMAC-SHA256(secret, roomId + ":verify") 의 결과를 hex 문자열로 변환.
async function deriveVerifyToken(secret, roomId) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", keyMaterial, enc.encode(roomId + ":verify"));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function encryptMessage(message) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.key, plaintext);
  return { roomId: state.roomId, sender: state.clientId, iv: toBase64(iv), ct: toBase64(ciphertext) };
}

async function decryptPacket(packet) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(packet.iv) },
    state.key,
    fromBase64(packet.ct)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ── State ──────────────────────────────────────────────────────────────────

var state = {
  roomId: null, nickname: null, key: null,
  clientId: randomToken(8), channel: null, socket: null,
  decryptFailCount: 0,
  relayUrl: null,         // 재연결 시 사용
  verifyToken: null,      // 재연결 시 사용
  reconnectAttempts: 0,
  reconnectTimer: null,
  heartbeatTimer: null,
  intentionalClose: false, // 사용자가 명시적으로 나갈 때 재연결 안 하도록
};

// ── DOM refs ───────────────────────────────────────────────────────────────

var els = {
  roomId:           document.getElementById("roomId"),
  roomSecret:       document.getElementById("roomSecret"),
  nickname:         document.getElementById("nickname"),
  relayUrl:         document.getElementById("relayUrl"),
  newRoomButton:    document.getElementById("newRoomButton"),
  showSecretButton: document.getElementById("showSecretButton"),
  joinButton:       document.getElementById("joinButton"),
  copyInviteButton: document.getElementById("copyInviteButton"),
  clearButton:      document.getElementById("clearButton"),
  form:             document.getElementById("form"),
  messageInput:     document.getElementById("messageInput"),
  sendButton:       document.getElementById("sendButton"),
  fileInput:        document.getElementById("fileInput"),
  fileButton:       document.getElementById("fileButton"),
  messages:         document.getElementById("messages"),
  cryptoStatus:     document.getElementById("cryptoStatus"),
  relayStatus:      document.getElementById("relayStatus"),
  roomStatus:       document.getElementById("roomStatus"),
  onlineStatus:     document.getElementById("onlineStatus"),
};

// ── UI helpers ─────────────────────────────────────────────────────────────

function updateRelayStatus(text, cls) {
  els.relayStatus.textContent = text;
  els.relayStatus.className = "status" + (cls ? " " + cls : "");
}

function updateRoomStatus(text, cls) {
  els.roomStatus.textContent = text;
  els.roomStatus.className = "status" + (cls ? " " + cls : "");
}

function updateOnlineStatus(count) {
  els.onlineStatus.textContent = "접속 중 " + count + "명";
  els.onlineStatus.className = "status good";
}

function resetOnlineStatus() {
  els.onlineStatus.textContent = "오프라인";
  els.onlineStatus.className = "status";
}

function clearMessages() {
  els.messages.innerHTML = '<p class="empty" id="emptyMsg">아직 메시지가 없습니다.<br/>방에 입장하면 대화가 시작됩니다.</p>';
}

function appendSystem(text) {
  var div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  els.messages.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function appendMessage(message, isMine) {
  var empty = document.getElementById("emptyMsg");
  if (empty) empty.remove();

  var time = new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  var div = document.createElement("div");
  div.className = "message" + (isMine ? " mine" : "");

  var content = "";
  if (message.type === "image" && message.dataUrl) {
    content = '<img class="msg-image" src="' + escapeHtml(message.dataUrl) + '" alt="이미지" onclick="openImage(this.src)" />';
  } else if (message.type === "file" && message.dataUrl) {
    content = '<a class="msg-file" href="' + escapeHtml(message.dataUrl) + '" download="' + escapeHtml(message.fileName || "file") + '">📎 ' + escapeHtml(message.fileName || "파일 다운로드") + '</a>';
  } else {
    content = '<p>' + escapeHtml(message.text) + '</p>';
  }

  div.innerHTML =
    '<div class="message-meta">' +
    '<span class="sender">' + escapeHtml(message.nickname) + '</span>' +
    '<span>' + time + '</span>' +
    '</div>' + content;

  els.messages.appendChild(div);
  scrollToBottom();
}

function openImage(src) {
  var w = window.open();
  w.document.write('<img src="' + src + '" style="max-width:100%;cursor:pointer" onclick="window.close()" />');
}

// ── 잘못된 키로 입장 시 강제 퇴장 (서버 측 토큰 검증 거부로 대부분 사전 차단되지만,
//    혹시 모를 경우를 대비해 클라이언트 측 폴백으로 유지) ──────────────────────

function handleDecryptFailure() {
  state.decryptFailCount++;
  if (state.decryptFailCount >= 2) {
    leaveRoom();
    clearMessages();
    updateRoomStatus("비밀키 불일치 — 퇴장됨", "warn");
    els.cryptoStatus.textContent = "복호화 실패";
    els.cryptoStatus.className = "status warn";
    appendSystem("비밀키가 맞지 않아 방에서 퇴장되었습니다. 비밀키를 확인 후 다시 입장해주세요.");
    state.decryptFailCount = 0;
  } else {
    updateRelayStatus("복호화 실패 — 비밀키를 확인하세요", "warn");
  }
}

function setRoomLocked(locked) {
  els.messageInput.disabled = !locked;
  els.sendButton.disabled   = !locked;
  els.fileButton.disabled   = !locked;
  if (!locked) {
    els.messageInput.placeholder = "방에 입장하면 메시지를 보낼 수 있습니다.";
  }
}

// ── Network ────────────────────────────────────────────────────────────────

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  // 30초마다 ping을 보내 연결을 살아있게 유지하고, 끊김을 빠르게 감지한다.
  state.heartbeatTimer = setInterval(function () {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      try { state.socket.send(JSON.stringify({ type: "ping" })); } catch (e) {}
    }
  }, 30000);
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
}

function closeConnections() {
  state.intentionalClose = true;
  clearReconnectTimer();
  stopHeartbeat();
  if (state.channel) { state.channel.close(); state.channel = null; }
  if (state.socket)  { state.socket.close();  state.socket = null;  }
  resetOnlineStatus();
}

function leaveRoom() {
  closeConnections();
  setRoomLocked(false);
  state.key = null;
  state.roomId = null;
  state.verifyToken = null;
}

function connectLocalChannel() {
  state.channel = new BroadcastChannel("quiet-room:" + state.roomId);
  state.channel.addEventListener("message", function(event) { receivePacket(event.data); });
}

function connectRelay(url, isReconnect) {
  if (!url) {
    updateRelayStatus("로컬 모드 (같은 브라우저 탭만)");
    // 로컬 모드에서는 중계 서버가 없으니, 본인만 있는 것으로 접속자 수 표시
    updateOnlineStatus(1);
    return;
  }

  state.relayUrl = url;
  state.intentionalClose = false;

  try {
    var base = url.replace(/\/+$/, "");
    var wsUrl = base + "/room/" + encodeURIComponent(state.roomId)
      + "?clientId=" + encodeURIComponent(state.clientId)
      + "&nickname=" + encodeURIComponent(state.nickname)
      + "&verifyToken=" + encodeURIComponent(state.verifyToken || "");

    updateRelayStatus(isReconnect ? "재연결 중…" : "연결 중…", "warn");

    var socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.addEventListener("open", function() {
      state.reconnectAttempts = 0;
      updateRelayStatus("중계 연결됨", "good");
      startHeartbeat();
    });

    socket.addEventListener("message", function(event) {
      var parsed;
      try { parsed = JSON.parse(event.data); } catch(e) { return; }

      if (parsed.type === "pong") {
        return; // heartbeat 응답, 별도 처리 불필요 (연결이 살아있다는 신호)
      }

      if (parsed.type === "error") {
        if (parsed.code === "KEY_MISMATCH") {
          updateRoomStatus("비밀키가 일치하지 않습니다", "warn");
          updateRelayStatus("입장 거부됨", "warn");
          appendSystem("이 방은 이미 다른 비밀키로 운영 중입니다. 비밀키를 확인 후 다시 시도해주세요.");
          state.intentionalClose = true; // 재연결 시도 안 함
          leaveRoom();
          els.joinButton.disabled = false;
          els.joinButton.textContent = "방 입장";
        }
        return;
      }

      if (parsed.type === "system") {
        if (parsed.event === "join") {
          appendSystem("✦ " + parsed.nickname + " 님이 입장했습니다");
        } else if (parsed.event === "leave") {
          appendSystem("✧ " + parsed.nickname + " 님이 퇴장했습니다");
        } else if (parsed.event === "kill") {
          appendSystem("⚠ " + (parsed.message || "관리자에 의해 방이 종료되었습니다."));
          state.intentionalClose = true;
          leaveRoom();
          updateRoomStatus("방이 종료됨", "warn");
        }
        if (typeof parsed.online === "number") updateOnlineStatus(parsed.online);
        return;
      }

      if (parsed.type === "online") {
        updateOnlineStatus(parsed.count);
        return;
      }

      if (parsed.type === "packet" && parsed.roomId === state.roomId) {
        receivePacket(parsed.body);
      }
    });

    socket.addEventListener("close", function(event) {
      stopHeartbeat();
      resetOnlineStatus();

      // 서버가 비밀키 불일치로 업그레이드 자체를 거부한 경우 (HTTP 403 -> WS 레벨에서는
      // 연결이 곧바로 닫히는 형태로 전달됨). 이 경우는 재연결을 시도하면 안 된다.
      if (event.code === 4003 || state.lastUpgradeRejected) {
        updateRoomStatus("비밀키가 일치하지 않습니다", "warn");
        updateRelayStatus("입장 거부됨", "warn");
        appendSystem("이 방은 이미 다른 비밀키로 운영 중입니다. 비밀키를 확인 후 다시 시도해주세요.");
        state.intentionalClose = true;
        leaveRoom();
        els.joinButton.disabled = false;
        els.joinButton.textContent = "방 입장";
        return;
      }

      if (state.intentionalClose) {
        updateRelayStatus("연결 해제", "warn");
        return;
      }

      updateRelayStatus("연결 끊김 — 재연결 시도 중…", "warn");
      scheduleReconnect();
    });

    socket.addEventListener("error", function() {
      updateRelayStatus("중계 오류", "warn");
    });

  } catch(e) {
    updateRelayStatus("중계 URL 확인 필요", "warn");
  }
}

function scheduleReconnect() {
  if (state.intentionalClose || !state.roomId || !state.key) return;
  clearReconnectTimer();

  state.reconnectAttempts = Math.min(state.reconnectAttempts + 1, 6);
  // 지수 백오프: 1s, 2s, 4s, 8s, 16s, 최대 30s
  var delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), 30000);

  state.reconnectTimer = setTimeout(function () {
    if (state.intentionalClose || !state.roomId) return;
    connectRelay(state.relayUrl, true);
  }, delay);
}

// 탭이 다시 보이게 될 때(백그라운드에서 돌아왔을 때) 연결 상태를 즉시 재확인.
// 모바일/노트북에서 절전 후 복귀 시 소켓이 죽어있는데 close 이벤트가 안 온 경우를 잡아준다.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState !== "visible") return;
  if (!state.roomId || !state.key) return;
  if (state.socket && state.socket.readyState === WebSocket.OPEN) return;
  if (state.socket && (state.socket.readyState === WebSocket.CONNECTING)) return;
  if (!state.intentionalClose) {
    scheduleReconnect();
  }
});

function receivePacket(packet) {
  if (!packet || packet.roomId !== state.roomId || packet.sender === state.clientId) return;
  if (!state.key) return;
  decryptPacket(packet).then(function(message) {
    state.decryptFailCount = 0;
    appendMessage(message, false);
  }).catch(function() {
    handleDecryptFailure();
  });
}

function broadcastPacket(packet) {
  if (state.channel) state.channel.postMessage(packet);
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify({ type: "packet", roomId: state.roomId, body: packet }));
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

function joinRoom() {
  var roomId   = els.roomId.value.trim();
  var secret   = els.roomSecret.value;
  var nickname = els.nickname.value.trim() || "익명";

  if (!roomId || !secret) { alert("방 ID와 비밀키가 필요합니다."); return; }

  els.joinButton.disabled = true;
  els.joinButton.textContent = "입장 중…";
  els.cryptoStatus.textContent = "키 유도 중…";
  els.cryptoStatus.className = "status";

  closeConnections();
  state.decryptFailCount = 0;
  state.reconnectAttempts = 0;

  Promise.all([deriveKey(secret, roomId), deriveVerifyToken(secret, roomId)]).then(function(results) {
    state.roomId      = roomId;
    state.nickname    = nickname;
    state.key         = results[0];
    state.verifyToken = results[1];
    state.intentionalClose = false;

    connectLocalChannel();
    connectRelay(els.relayUrl.value.trim());

    setRoomLocked(true);
    els.messageInput.placeholder = "메시지를 입력하세요…";
    els.messageInput.focus();

    els.cryptoStatus.textContent = "AES-GCM 256 활성화";
    els.cryptoStatus.className   = "status good";
    updateRoomStatus("입장: " + roomId, "good");

    clearMessages();
    history.replaceState(null, "", "#room=" + encodeURIComponent(roomId));

  }).catch(function() {
    els.cryptoStatus.textContent = "키 생성 실패";
    els.cryptoStatus.className = "status warn";
  }).finally(function() {
    els.joinButton.disabled = false;
    els.joinButton.textContent = "방 입장";
  });
}

function sendMessage(event) {
  event.preventDefault();
  var text = els.messageInput.value.trim();
  if (!text || !state.key) return;
  var message = { type: "text", text: text, nickname: state.nickname, createdAt: Date.now() };
  encryptMessage(message).then(function(packet) {
    appendMessage(message, true);
    broadcastPacket(packet);
    els.messageInput.value = "";
  });
}

function sendFile(file) {
  if (!file || !state.key) return;

  var MAX = 3 * 1024 * 1024;
  if (file.size > MAX) { alert("파일 크기는 3MB 이하만 가능합니다."); return; }

  var reader = new FileReader();
  reader.onload = function(e) {
    var isImage = file.type.startsWith("image/");
    var message = {
      type: isImage ? "image" : "file",
      dataUrl: e.target.result,
      fileName: file.name,
      nickname: state.nickname,
      createdAt: Date.now(),
    };
    encryptMessage(message).then(function(packet) {
      appendMessage(message, true);
      broadcastPacket(packet);
    });
  };
  reader.readAsDataURL(file);
}

function copyInvite() {
  var params = new URLSearchParams();
  if (els.roomId.value.trim())   params.set("room",  els.roomId.value.trim());
  if (els.relayUrl.value.trim()) params.set("relay", els.relayUrl.value.trim());
  var link = location.origin + location.pathname + "#" + params.toString();
  navigator.clipboard.writeText(link).then(function() {
    els.copyInviteButton.textContent = "복사됨 ✓";
    setTimeout(function() { els.copyInviteButton.textContent = "초대 링크 복사"; }, 1400);
  });
}

function hydrateFromUrl() {
  var hash = new URLSearchParams(location.hash.slice(1));
  els.roomId.value   = hash.get("room")  || randomToken(12);
  els.relayUrl.value = hash.get("relay") || "wss://quiet-room-relay.chaostatix.workers.dev";
  els.nickname.value = "guest-" + randomToken(3);
}

// ── 다크모드 토글 ──────────────────────────────────────────────────────────

function initTheme() {
  var saved = localStorage.getItem("qr-theme");
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

function toggleTheme() {
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("qr-theme", "light");
    document.getElementById("themeToggle").textContent = "[ DARK ]";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("qr-theme", "dark");
    document.getElementById("themeToggle").textContent = "[ LIGHT ]";
  }
}

// ── Event listeners ────────────────────────────────────────────────────────

els.newRoomButton.addEventListener("click", function() {
  els.roomId.value     = randomToken(12);
  els.roomSecret.value = randomToken(24);
  joinRoom();
});

els.showSecretButton.addEventListener("click", function() {
  els.roomSecret.type = els.roomSecret.type === "password" ? "text" : "password";
});

els.joinButton.addEventListener("click", joinRoom);
els.copyInviteButton.addEventListener("click", copyInvite);
els.clearButton.addEventListener("click", clearMessages);
els.form.addEventListener("submit", sendMessage);

els.fileButton.addEventListener("click", function() { els.fileInput.click(); });
els.fileInput.addEventListener("change", function() {
  if (els.fileInput.files[0]) { sendFile(els.fileInput.files[0]); els.fileInput.value = ""; }
});

els.messages.addEventListener("dragover", function(e) { e.preventDefault(); els.messages.classList.add("drag-over"); });
els.messages.addEventListener("dragleave", function() { els.messages.classList.remove("drag-over"); });
els.messages.addEventListener("drop", function(e) {
  e.preventDefault();
  els.messages.classList.remove("drag-over");
  var file = e.dataTransfer.files[0];
  if (file) sendFile(file);
});

var themeBtn = document.getElementById("themeToggle");
if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

window.addEventListener("beforeunload", function () {
  state.intentionalClose = true;
});

// ── Init ───────────────────────────────────────────────────────────────────

initTheme();
hydrateFromUrl();
clearMessages();
resetOnlineStatus();

(function() {
  var btn = document.getElementById("themeToggle");
  if (!btn) return;
  var isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "[ LIGHT ]" : "[ DARK ]";
})();

if (!window.crypto || !window.crypto.subtle) {
  els.cryptoStatus.textContent = "HTTPS 환경 필요";
  els.cryptoStatus.className = "status warn";
  els.joinButton.disabled = true;
  els.newRoomButton.disabled = true;
}
