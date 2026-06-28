/**
 * Quiet Room - Main Entry Point
 * 메인 애플리케이션
 * @module quiet-room/app
 */

import { state, storage, initState, resetState, saveTheme, loadTheme } from './state.js';
import { els, updateRelayStatus, updateRoomStatus, updateOnlineStatus, updateCryptoStatus, clearMessages, setRoomLocked, toggleTheme, initTheme } from './ui.js';
import { handleJoinRoom, handleSendMessage, handleFileSend, handleCopyInvite, hydrateFromUrl } from './handlers.js';
import { randomToken } from '../../../core/utils/index.js';

/**
 * 앱 초기화
 */
function init() {
  // 상태 초기화
  initState();
  
  // 테마 초기화
  const savedTheme = loadTheme();
  initTheme(savedTheme);
  
  // URL 파라미터 로드
  hydrateFromUrl();
  
  // 메시지 초기화
  clearMessages();
  
  // 이벤트 리스너 등록
  setupEventListeners();
  
  // HTTPS 확인
  if (!window.crypto || !window.crypto.subtle) {
    updateCryptoStatus("HTTPS 환경 필요", "warn");
    els.joinButton.disabled = true;
    els.newRoomButton.disabled = true;
  }
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  // 새 방 만들기
  els.newRoomButton.addEventListener("click", () => {
    els.roomId.value = randomToken(12);
    els.roomSecret.value = randomToken(24);
    handleJoinRoom();
  });
  
  // 비밀키 표시/숨기기
  els.showSecretButton.addEventListener("click", () => {
    els.roomSecret.type = els.roomSecret.type === "password" ? "text" : "password";
  });
  
  // 방 입장
  els.joinButton.addEventListener("click", handleJoinRoom);
  
  // 초대 링크 복사
  els.copyInviteButton.addEventListener("click", handleCopyInvite);
  
  // 메시지 지우기
  els.clearButton.addEventListener("click", clearMessages);
  
  // 메시지 전송
  els.form.addEventListener("submit", handleSendMessage);
  
  // 파일 버튼
  els.fileButton.addEventListener("click", () => {
    els.fileInput.click();
  });
  
  // 파일 선택
  els.fileInput.addEventListener("change", () => {
    if (els.fileInput.files[0]) {
      handleFileSend(els.fileInput.files[0]);
      els.fileInput.value = "";
    }
  });
  
  // 드래그 앤 드롭
  els.messages.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.messages.classList.add("drag-over");
  });
  
  els.messages.addEventListener("dragleave", () => {
    els.messages.classList.remove("drag-over");
  });
  
  els.messages.addEventListener("drop", (e) => {
    e.preventDefault();
    els.messages.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSend(file);
    }
  });
  
  // 테마 토글
  els.themeToggle.addEventListener("click", () => {
    const newTheme = toggleTheme();
    saveTheme(newTheme);
  });
  
  // 페이지 언로드 시 연결 종료
  window.addEventListener("beforeunload", () => {
    const { closeConnections } = import('./network.js');
    closeConnections();
  });
}

// 앱 시작
init();
