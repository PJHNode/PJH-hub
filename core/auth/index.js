/**
 * Core Auth Module
 * 인증 관련 기능 (JWT/Session Token)
 * @module core/auth
 */

import { randomToken, delay } from '../utils/index.js';

/**
 * 세션 토큰 생성
 * @param {Object} payload - 토큰 페이로드
 * @param {string} secret - 서버 비밀키
 * @param {number} expiresIn - 만료 시간 (초)
 * @returns {string} JWT 토큰
 */
export async function createSessionToken(payload, secret, expiresIn = 3600) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = await signHMAC(
    `${encodedHeader}.${encodedPayload}`,
    secret
  );
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * 세션 토큰 검증
 * @param {string} token - JWT 토큰
 * @param {string} secret - 서버 비밀키
 * @returns {Promise<Object|null>} 토큰 페이로드 또는 null (검증 실패)
 */
export async function verifySessionToken(token, secret) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }
    
    const expectedSignature = await signHMAC(
      `${encodedHeader}.${encodedPayload}`,
      secret
    );
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // 만료됨
    }
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * HMAC-SHA256 서명
 * @param {string} data 
 * @param {string} secret 
 * @returns {Promise<string>} Base64URL 인코딩된 서명
 */
async function signHMAC(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(data)
  );
  
  return base64UrlEncode(signature);
}

/**
 * Base64URL 인코딩
 * @param {string|ArrayBuffer} input 
 * @returns {string}
 */
function base64UrlEncode(input) {
  if (typeof input === 'string') {
    input = new TextEncoder().encode(input);
  }
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL 디코딩
 * @param {string} str 
 * @returns {string}
 */
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return atob(str);
}

/**
 * 비밀번호 해싱 (PBKDF2)
 * @param {string} password 
 * @param {string} salt 
 * @returns {Promise<string>} Base64 인코딩된 해시
 */
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(derivedBits)));
}

/**
 * 비밀번호 검증
 * @param {string} password 
 * @param {string} salt 
 * @param {string} hash 
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, salt, hash) {
  const computedHash = await hashPassword(password, salt);
  return computedHash === hash;
}

/**
 * 랜덤 솔트 생성
 * @param {number} length 
 * @returns {string}
 */
export function generateSalt(length = 16) {
  return randomToken(length);
}

/**
 * 세션 관리자
 */
export class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = null;
  }
  
  /**
   * 세션 생성
   * @param {string} userId 
   * @param {Object} metadata 
   * @param {number} ttl - TTL (초)
   * @returns {string} 세션 ID
   */
  create(userId, metadata = {}, ttl = 3600) {
    const sessionId = randomToken(32);
    this.sessions.set(sessionId, {
      userId,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl * 1000
    });
    return sessionId;
  }
  
  /**
   * 세션 조회
   * @param {string} sessionId 
   * @returns {Object|null}
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return session;
  }
  
  /**
   * 세션 삭제
   * @param {string} sessionId 
   */
  delete(sessionId) {
    this.sessions.delete(sessionId);
  }
  
  /**
   * 만료된 세션 정리 시작
   * @param {number} interval - 정리 간격 (ms)
   */
  startCleanup(interval = 60000) {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions.entries()) {
        if (now > session.expiresAt) {
          this.sessions.delete(id);
        }
      }
    }, interval);
  }
  
  /**
   * 정리 중지
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
