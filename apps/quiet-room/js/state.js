/**
 * Quiet Room - State Management
 * 상태 관리 (독립 구현)
 * @module quiet-room/state
 */

/**
 * 랜덤 토큰 생성
 */
function randomToken(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 로컬 스토리지 래퍼
 */
class LocalStorage {
  constructor(prefix) {
    this.prefix = prefix;
  }

  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(`${this.prefix}:${key}`);
      return value ? JSON.parse(value) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value));
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(`${this.prefix}:${key}`);
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
  }

  clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix + ':')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('LocalStorage error:', e);
    }
  }
}

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
