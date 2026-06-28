/**
 * Quiet Room - Event Handlers
 * 이벤트 핸들러
 * @module quiet-room/handlers
 */

import { state } from './state.js';
import { els, updateRelayStatus, updateRoomStatus, updateOnlineStatus, updateCryptoStatus, appendSystem, appendMessage, setRoomLocked, clearMessages, scrollToBottom } from './ui.js';
import { decryptRoomPacket, startHandshake, respondToHandshake, verifyHandshake } from './crypto.js';
import { sendMessage, closeConnections } from './network.js';

/**
 * WebSocket 메시지 핸들러
 */
export function handleWebSocketMessage(event) {
  try {
    const parsed = JSON.parse(event.data);
    
    // 시스템 메시지
    if (parsed.type === "system") {
      if (parsed.event === "join") {
        appendSystem("✦ " + parsed.nickname + " 님이 입장했습니다");
      } else if (parsed.event === "leave") {
        appendSystem("✧ " + parsed.nickname + " 님이 퇴장했습니다");
      } else if (parsed.event === "timeout") {
        appendSystem("⚠ " + parsed.nickname + " 님이 연결이 끊어졌습니다");
      }
      updateOnlineStatus(parsed.online);
      return;
    }
    
    // 온라인 카운트
    if (parsed.type === "online") {
      updateOnlineStatus(parsed.count);
      return;
    }
    
    // 핸드쉐이크
    if (parsed.type === "handshake") {
      handleHandshake(parsed);
      return;
    }
    
    // Ping/Pong
    if (parsed.type === "ping") {
      sendMessage({ type: "pong", timestamp: parsed.timestamp });
      return;
    }
    
    if (parsed.type === "pong") {
      // Pong 처리 (네트워크 모듈에서 처리)
      return;
    }
    
    // 패킷 수신
    if (parsed.type === "packet" && parsed.roomId === state.roomId) {
      receivePacket(parsed.body);
    }
    
  } catch (e) {
    console.error("Message parse error:", e);
  }
}

/**
 * 핸드쉐이크 핸들러
 */
async function handleHandshake(data) {
  if (data.action === "challenge") {
    // 서버에서 온 챌린지
    const challengeNonce = new Uint8Array(data.nonce.split(',').map(Number));
    const response = await respondToHandshake(data, state.key);
    sendMessage(response);
    
    state.handshakeComplete = true;
    updateCryptoStatus("핸드쉐이크 완료", "good");
  }
}

/**
 * 패킷 수신 및 복호화
 */
async function receivePacket(packet) {
  if (!packet || packet.roomId !== state.roomId || packet.sender === state.clientId) return;
  if (!state.key) return;
  
  // 중복 메시지 확인
  if (state.receivedMessageIds.has(packet.id)) {
    return;
  }
  
  try {
    const message = await decryptRoomPacket(packet, state.key);
    state.decryptFailCount = 0;
    state.receivedMessageIds.add(packet.id);
    
    // 시퀀스 번호 확인
    if (packet.sequence > state.messageSequence) {
      state.messageSequence = packet.sequence;
    }
    
    appendMessage(message, false);
  } catch (e) {
    handleDecryptFailure();
  }
}

/**
 * 복호화 실패 처리
 */
function handleDecryptFailure() {
  state.decryptFailCount++;
  
  if (state.decryptFailCount >= 2) {
    closeConnections();
    setRoomLocked(false);
    clearMessages();
    updateRoomStatus("비밀키 불일치 — 퇴장됨", "warn");
    updateRelayStatus("연결해제", "warn");
    updateCryptoStatus("복호화 실패", "warn");
    appendSystem("비밀키가 맞지 않아 방에서 퇴장되었습니다. 비밀키를 확인 후 다시 입장해주세요.");
    state.decryptFailCount = 0;
    state.key = null;
    state.roomId = null;
  } else {
    updateRelayStatus("복호화 실패 — 비밀키를 확인하세요", "warn");
  }
}

/**
 * 방 입장 핸들러
 */
export async function handleJoinRoom() {
  const roomId = els.roomId.value.trim();
  const secret = els.roomSecret.value;
  const nickname = els.nickname.value.trim() || "익명";
  
  // 기본 검증
  if (!roomId || roomId.length < 4) {
    alert("방 ID는 최소 4자 이상이어야 합니다.");
    return;
  }
  
  if (!secret || secret.length < 8) {
    alert("비밀키는 최소 8자 이상이어야 합니다.");
    return;
  }
  
  els.joinButton.disabled = true;
  els.joinButton.textContent = "입장 중…";
  updateCryptoStatus("키 유도 중…", "");
  
  closeConnections();
  state.decryptFailCount = 0;
  state.receivedMessageIds.clear();
  
  try {
    const { deriveRoomKey } = await import('./crypto.js');
    state.key = await deriveRoomKey(secret, roomId);
    state.roomId = roomId;
    state.nickname = nickname;
    
    // 네트워크 연결
    const { connectLocalChannel, connectWebSocket } = await import('./network.js');
    
    connectLocalChannel("quiet-room:" + state.roomId, {
      onMessage: (data) => receivePacket(data)
    });
    
    connectWebSocket(els.relayUrl.value.trim(), {
      onOpen: () => {
        updateRelayStatus("중계 연결됨", "good");
        state.isConnected = true;
      },
      onMessage: handleWebSocketMessage,
      onClose: () => {
        updateRelayStatus("중계 끊김", "warn");
        state.isConnected = false;
      },
      onError: () => {
        updateRelayStatus("중계 오류", "warn");
      }
    });
    
    setRoomLocked(true);
    els.messageInput.placeholder = "메시지를 입력하세요…";
    els.messageInput.focus();
    
    updateCryptoStatus("AES-GCM 256 활성화", "good");
    updateRoomStatus("입장: " + roomId, "good");
    
    clearMessages();
    history.replaceState(null, "", "#room=" + encodeURIComponent(roomId));
    
  } catch (e) {
    updateCryptoStatus("키 생성 실패", "warn");
    console.error(e);
  } finally {
    els.joinButton.disabled = false;
    els.joinButton.textContent = "방 입장";
  }
}

/**
 * 메시지 전송 핸들러
 */
export async function handleSendMessage(event) {
  event.preventDefault();
  const text = els.messageInput.value.trim();
  
  if (!text || !state.key) return;
  
  const { encryptRoomMessage } = await import('./crypto.js');
  const { sendMessage } = await import('./network.js');
  
  const message = {
    id: crypto.randomUUID(),
    type: "text",
    text: text,
    nickname: state.nickname,
    createdAt: Date.now()
  };
  
  try {
    const packet = await encryptRoomMessage(message, state.key, state.roomId, state.clientId);
    appendMessage(message, true);
    sendMessage({ type: "packet", roomId: state.roomId, body: packet });
    els.messageInput.value = "";
  } catch (e) {
    console.error("Message encryption error:", e);
  }
}

/**
 * 파일 전송 핸들러
 */
export async function handleFileSend(file) {
  if (!file || !state.key) return;
  
  const MAX_SIZE = 3 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    alert("파일 크기는 3MB 이하만 가능합니다.");
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const isImage = file.type.startsWith("image/");
    const message = {
      id: crypto.randomUUID(),
      type: isImage ? "image" : "file",
      dataUrl: e.target.result,
      fileName: file.name,
      nickname: state.nickname,
      createdAt: Date.now(),
    };
    
    const { encryptRoomMessage } = await import('./crypto.js');
    const { sendMessage } = await import('./network.js');
    
    try {
      const packet = await encryptRoomMessage(message, state.key, state.roomId, state.clientId);
      appendMessage(message, true);
      sendMessage({ type: "packet", roomId: state.roomId, body: packet });
    } catch (err) {
      console.error("File encryption error:", err);
    }
  };
  reader.readAsDataURL(file);
}

/**
 * 초대 링크 복사 핸들러
 */
export function handleCopyInvite() {
  const params = new URLSearchParams();
  if (els.roomId.value.trim()) params.set("room", els.roomId.value.trim());
  if (els.relayUrl.value.trim()) params.set("relay", els.relayUrl.value.trim());
  const link = location.origin + location.pathname + "#" + params.toString();
  
  navigator.clipboard.writeText(link).then(() => {
    els.copyInviteButton.textContent = "복사됨 ✓";
    setTimeout(() => {
      els.copyInviteButton.textContent = "초대 링크 복사";
    }, 1400);
  });
}

/**
 * URL에서 파라미터 로드
 */
export function hydrateFromUrl() {
  const hash = new URLSearchParams(location.hash.slice(1));
  els.roomId.value = hash.get("room") || crypto.randomUUID().slice(0, 12);
  els.relayUrl.value = hash.get("relay") || "wss://quiet-room-relay.chaostatix.workers.dev";
  els.nickname.value = "guest-" + crypto.randomUUID().slice(0, 3);
}
