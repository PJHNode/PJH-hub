/**
 * Quiet Room - State Management
 * 상태 관리
 * @module quiet-room/state
 */

import { randomToken } from '../../../core/utils/index.js';
import { LocalStorage } from '../../../core/storage/index.js';

/**
 * 앱 상태
 */
export const state = {
  roomId: null,
  nickname: null,
  key: null,
  clientId: randomToken(8),
  channel: null,
  socket: null,
  decryptFailCount: 0,
  handshakeComplete: false,
  messageSequence: 0,
  receivedMessageIds: new Set(),
  isConnected: false
};

/**
 * 로컬 스토리지
 */
export const storage = new LocalStorage('quiet-room');

/**
 * 상태 초기화
 */
export function initState() {
  const savedTheme = storage.get('theme', 'light');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

/**
 * 상태 리셋
 */
export function resetState() {
  state.roomId = null;
  state.nickname = null;
  state.key = null;
  state.clientId = randomToken(8);
  state.channel = null;
  state.socket = null;
  state.decryptFailCount = 0;
  state.handshakeComplete = false;
  state.messageSequence = 0;
  state.receivedMessageIds.clear();
  state.isConnected = false;
}

/**
 * 테마 저장
 */
export function saveTheme(theme) {
  storage.set('theme', theme);
}

/**
 * 테마 로드
 */
export function loadTheme() {
  return storage.get('theme', 'light');
}
