/**
 * Core Utils Module
 * 공통 유틸리티 함수들
 * @module core/utils
 */

/**
 * 랜덤 토큰 생성
 * @param {number} length - 토큰 길이
 * @returns {string} Base64 URL-safe 랜덤 토큰
 */
export function randomToken(length = 16) {
  const arr = crypto.getRandomValues(new Uint8Array(Math.ceil(length * 3 / 4)));
  return btoa(String.fromCharCode(...arr))
    .replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]))
    .slice(0, length);
}

/**
 * ArrayBuffer를 Base64로 변환
 * @param {ArrayBuffer|Uint8Array} buf 
 * @returns {string}
 */
export function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/**
 * Base64를 Uint8Array로 변환
 * @param {string} str 
 * @returns {Uint8Array}
 */
export function fromBase64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

/**
 * HTML 이스케이프
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 체크섬 계산 (SHA-256)
 * @param {ArrayBuffer|Uint8Array} data 
 * @returns {Promise<string>} Hex string
 */
export async function calculateChecksum(data) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 지연 함수
 * @param {number} ms - 밀리초
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 지수 백오프로 재시도
 * @param {Function} fn - 재시도할 함수
 * @param {Object} options - 옵션
 * @param {number} options.maxRetries - 최대 재시도 횟수
 * @param {number} options.baseDelay - 기본 지연 시간
 * @returns {Promise<any>}
 */
export async function retryWithBackoff(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await delay(baseDelay * Math.pow(2, i));
      }
    }
  }
  throw lastError;
}

/**
 * UUID v4 생성
 * @returns {string}
 */
export function uuidv4() {
  return crypto.randomUUID();
}

/**
 * 현재 타임스탬프
 * @returns {number}
 */
export function now() {
  return Date.now();
}

/**
 * 날짜 포맷팅
 * @param {number} timestamp 
 * @param {string} locale 
 * @returns {string}
 */
export function formatDate(timestamp, locale = 'ko-KR') {
  return new Date(timestamp).toLocaleString(locale);
}
