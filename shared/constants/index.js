/**
 * Shared Constants
 * 공통 상수들
 * @module shared/constants
 */

/**
 * 암호화 관련 상수
 */
export const CRYPTO = {
  ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  PBKDF2_ITERATIONS: 200000,
  PBKDF2_HASH: 'SHA-256',
  CHUNK_SIZE: 64 * 1024, // 64KB
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
};

/**
 * 네트워크 관련 상수
 */
export const NETWORK = {
  HEARTBEAT_INTERVAL: 30000, // 30초
  RECONNECT_DELAY: 1000, // 1초
  CONNECTION_TIMEOUT: 10000, // 10초
  MAX_RETRIES: 5,
  PING_TIMEOUT: 5000, // 5초
};

/**
 * Rate Limiting 관련 상수
 */
export const RATE_LIMIT = {
  MESSAGE: { maxRequests: 10, windowMs: 60000 }, // 1분에 10개
  FILE: { maxRequests: 3, windowMs: 60000 }, // 1분에 3개
  NOTICE: { maxRequests: 5, windowMs: 3600000 }, // 1시간에 5개
  ADMIN_API: { maxRequests: 30, windowMs: 60000 }, // 1분에 30개
};

/**
 * 검증 관련 상수
 */
export const VALIDATION = {
  ROOM_ID: {
    MIN_LENGTH: 4,
    MAX_LENGTH: 32,
    PATTERN: /^[a-zA-Z0-9-_]+$/,
  },
  NICKNAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 20,
    PATTERN: /^[가-힣a-zA-Z0-9_\s-]+$/,
  },
  MESSAGE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 5000,
  },
  FILE_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
    PATTERN: /^[a-zA-Z0-9._\s-]+$/,
  },
  SECRET: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
  },
};

/**
 * 세션 관련 상수
 */
export const SESSION = {
  TOKEN_EXPIRY: 3600, // 1시간
  REFRESH_TOKEN_EXPIRY: 604800, // 7일
  CLEANUP_INTERVAL: 60000, // 1분
};

/**
 * CORS 허용 도메인
 */
export const ALLOWED_ORIGINS = [
  'http://localhost:*',
  'https://localhost:*',
  // 프로덕션 도메인 추가 필요
];

/**
 * Security Headers
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:;",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * 메시지 타입
 */
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system',
  TYPING: 'typing',
  READ_RECEIPT: 'read-receipt',
  REACTION: 'reaction',
  REPLY: 'reply',
  PINNED: 'pinned',
};

/**
 * 시스템 이벤트 타입
 */
export const SYSTEM_EVENTS = {
  JOIN: 'join',
  LEAVE: 'leave',
  KICK: 'kick',
  BAN: 'ban',
  ROOM_CREATED: 'room-created',
  ROOM_DELETED: 'room-deleted',
};

/**
 * 파일 MIME 타입 허용 목록
 */
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/json',
];

/**
 * 오류 코드
 */
export const ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  KEY_MISMATCH: 'KEY_MISMATCH',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
};
