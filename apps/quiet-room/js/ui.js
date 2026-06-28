/**
 * Quiet Room - UI Module
 * UI 관련 (독립 구현)
 * @module quiet-room/ui
 */

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * DOM 요소 참조
 */
export const els = {
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
  cryptoStatus: document.getElementById("cryptoStatus"),
  relayStatus: document.getElementById("relayStatus"),
  roomStatus: document.getElementById("roomStatus"),
  onlineStatus: document.getElementById("onlineStatus"),
  themeToggle: document.getElementById("themeToggle")
};

/**
 * Relay 상태 업데이트
 */
export function updateRelayStatus(text, cls) {
  els.relayStatus.textContent = text;
  els.relayStatus.className = "status" + (cls ? " " + cls : "");
}

/**
 * Room 상태 업데이트
 */
export function updateRoomStatus(text, cls) {
  els.roomStatus.textContent = text;
  els.roomStatus.className = "status" + (cls ? " " + cls : "");
}

/**
 * 온라인 상태 업데이트
 */
export function updateOnlineStatus(count) {
  els.onlineStatus.textContent = "접속 중 " + count + "명";
  els.onlineStatus.className = "status good";
}

/**
 * 암호화 상태 업데이트
 */
export function updateCryptoStatus(text, cls) {
  els.cryptoStatus.textContent = text;
  els.cryptoStatus.className = "status" + (cls ? " " + cls : "");
}

/**
 * 메시지 지우기
 */
export function clearMessages() {
  els.messages.innerHTML = '<p class="empty" id="emptyMsg">아직 메시지가 없습니다.<br/>방에 입장하면 대화가 시작됩니다.</p>';
}

/**
 * 시스템 메시지 추가
 */
export function appendSystem(text) {
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  els.messages.appendChild(div);
  scrollToBottom();
}

/**
 * 메시지 추가
 */
export function appendMessage(message, isMine) {
  const empty = document.getElementById("emptyMsg");
  if (empty) empty.remove();

  const time = new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const div = document.createElement("div");
  div.className = "message" + (isMine ? " mine" : "");

  let content = "";
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

/**
 * 스크롤 하단으로
 */
export function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

/**
 * 이미지 열기
 */
export function openImage(src) {
  const w = window.open();
  w.document.write('<img src="' + src + '" style="max-width:100%;cursor:pointer" onclick="window.close()" />');
}

/**
 * 방 잠금 상태 설정
 */
export function setRoomLocked(locked) {
  els.messageInput.disabled = !locked;
  els.sendButton.disabled = !locked;
  els.fileButton.disabled = !locked;
  if (!locked) {
    els.messageInput.placeholder = "방에 입장하면 메시지를 보낼 수 있습니다.";
  }
}

/**
 * 테마 토글
 */
export function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    els.themeToggle.textContent = "[ DARK ]";
    return "light";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    els.themeToggle.textContent = "[ LIGHT ]";
    return "dark";
  }
}

/**
 * 테마 초기화
 */
export function initTheme(savedTheme) {
  if (savedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    els.themeToggle.textContent = "[ LIGHT ]";
  } else {
    els.themeToggle.textContent = "[ DARK ]";
  }
}
