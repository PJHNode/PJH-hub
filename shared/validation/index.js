/**
 * Shared Validation Module
 * 입력 검증 (JSON Schema 스타일)
 * @module shared/validation
 */

import { VALIDATION, ALLOWED_FILE_TYPES, ERROR_CODES } from '../constants/index.js';

/**
 * 검증 결과
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - 유효 여부
 * @property {string} error - 오류 메시지
 * @property {string} code - 오류 코드
 */

/**
 * 방 ID 검증
 * @param {string} roomId 
 * @returns {ValidationResult}
 */
export function validateRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return { valid: false, error: '방 ID가 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (roomId.length < VALIDATION.ROOM_ID.MIN_LENGTH || roomId.length > VALIDATION.ROOM_ID.MAX_LENGTH) {
    return { 
      valid: false, 
      error: `방 ID는 ${VALIDATION.ROOM_ID.MIN_LENGTH}-${VALIDATION.ROOM_ID.MAX_LENGTH}자여야 합니다.`,
      code: ERROR_CODES.INVALID_INPUT 
    };
  }
  
  if (!VALIDATION.ROOM_ID.PATTERN.test(roomId)) {
    return { valid: false, error: '방 ID는 영문, 숫자, 하이픈, 언더스코어만 사용 가능합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  return { valid: true };
}

/**
 * 닉네임 검증
 * @param {string} nickname 
 * @returns {ValidationResult}
 */
export function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {
    return { valid: false, error: '닉네임이 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (nickname.length < VALIDATION.NICKNAME.MIN_LENGTH || nickname.length > VALIDATION.NICKNAME.MAX_LENGTH) {
    return { 
      valid: false, 
      error: `닉네임은 ${VALIDATION.NICKNAME.MIN_LENGTH}-${VALIDATION.NICKNAME.MAX_LENGTH}자여야 합니다.`,
      code: ERROR_CODES.INVALID_INPUT 
    };
  }
  
  if (!VALIDATION.NICKNAME.PATTERN.test(nickname)) {
    return { valid: false, error: '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  return { valid: true };
}

/**
 * 메시지 검증
 * @param {string} message 
 * @returns {ValidationResult}
 */
export function validateMessage(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: '메시지가 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (message.length < VALIDATION.MESSAGE.MIN_LENGTH || message.length > VALIDATION.MESSAGE.MAX_LENGTH) {
    return { 
      valid: false, 
      error: `메시지는 ${VALIDATION.MESSAGE.MIN_LENGTH}-${VALIDATION.MESSAGE.MAX_LENGTH}자여야 합니다.`,
      code: ERROR_CODES.INVALID_INPUT 
    };
  }
  
  return { valid: true };
}

/**
 * 비밀키 검증
 * @param {string} secret 
 * @returns {ValidationResult}
 */
export function validateSecret(secret) {
  if (!secret || typeof secret !== 'string') {
    return { valid: false, error: '비밀키가 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (secret.length < VALIDATION.SECRET.MIN_LENGTH || secret.length > VALIDATION.SECRET.MAX_LENGTH) {
    return { 
      valid: false, 
      error: `비밀키는 ${VALIDATION.SECRET.MIN_LENGTH}-${VALIDATION.SECRET.MAX_LENGTH}자여야 합니다.`,
      code: ERROR_CODES.INVALID_INPUT 
    };
  }
  
  return { valid: true };
}

/**
 * 파일명 검증
 * @param {string} fileName 
 * @returns {ValidationResult}
 */
export function validateFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: '파일명이 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (fileName.length < VALIDATION.FILE_NAME.MIN_LENGTH || fileName.length > VALIDATION.FILE_NAME.MAX_LENGTH) {
    return { 
      valid: false, 
      error: `파일명은 ${VALIDATION.FILE_NAME.MIN_LENGTH}-${VALIDATION.FILE_NAME.MAX_LENGTH}자여야 합니다.`,
      code: ERROR_CODES.INVALID_INPUT 
    };
  }
  
  if (!VALIDATION.FILE_NAME.PATTERN.test(fileName)) {
    return { valid: false, error: '파일명에 사용할 수 없는 문자가 포함되어 있습니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  return { valid: true };
}

/**
 * 파일 크기 검증
 * @param {number} fileSize 
 * @param {number} maxSize - 최대 크기 (기본: 10MB)
 * @returns {ValidationResult}
 */
export function validateFileSize(fileSize, maxSize = 10 * 1024 * 1024) {
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return { valid: false, error: '유효하지 않은 파일 크기입니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (fileSize > maxSize) {
    return { valid: false, error: `파일 크기는 ${Math.floor(maxSize / 1024 / 1024)}MB 이하여야 합니다.`, code: ERROR_CODES.FILE_TOO_LARGE };
  }
  
  return { valid: true };
}

/**
 * 파일 MIME 타입 검증
 * @param {string} mimeType 
 * @returns {ValidationResult}
 */
export function validateFileType(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') {
    return { valid: false, error: '파일 타입이 필요합니다.', code: ERROR_CODES.INVALID_INPUT };
  }
  
  if (!ALLOWED_FILE_TYPES.includes(mimeType)) {
    return { valid: false, error: '허용되지 않는 파일 타입입니다.', code: ERROR_CODES.INVALID_FILE_TYPE };
  }
  
  return { valid: true };
}

/**
 * JSON Schema 스타일 검증
 * @param {Object} data 
 * @param {Object} schema 
 * @returns {ValidationResult}
 */
export function validateSchema(data, schema) {
  if (schema.required) {
    for (const field of schema.required) {
      if (data[field] === undefined || data[field] === null) {
        return { valid: false, error: `${field} 필드가 필요합니다.`, code: ERROR_CODES.INVALID_INPUT };
      }
    }
  }
  
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (data[field] !== undefined) {
        const result = validateField(data[field], fieldSchema);
        if (!result.valid) {
          return { valid: false, error: `${field}: ${result.error}`, code: result.code };
        }
      }
    }
  }
  
  return { valid: true };
}

/**
 * 필드 검증
 * @param {any} value 
 * @param {Object} fieldSchema 
 * @returns {ValidationResult}
 */
function validateField(value, fieldSchema) {
  const { type, min, max, pattern, enum: enumValues } = fieldSchema;
  
  // 타입 검증
  if (type) {
    if (type === 'string' && typeof value !== 'string') {
      return { valid: false, error: '문자열이어야 합니다.', code: ERROR_CODES.INVALID_INPUT };
    }
    if (type === 'number' && typeof value !== 'number') {
      return { valid: false, error: '숫자여야 합니다.', code: ERROR_CODES.INVALID_INPUT };
    }
    if (type === 'boolean' && typeof value !== 'boolean') {
      return { valid: false, error: '불리언이어야 합니다.', code: ERROR_CODES.INVALID_INPUT };
    }
    if (type === 'array' && !Array.isArray(value)) {
      return { valid: false, error: '배열이어야 합니다.', code: ERROR_CODES.INVALID_INPUT };
    }
  }
  
  // 길이/범위 검증
  if (typeof value === 'string' || Array.isArray(value)) {
    if (min !== undefined && value.length < min) {
      return { valid: false, error: `최소 길이는 ${min}입니다.`, code: ERROR_CODES.INVALID_INPUT };
    }
    if (max !== undefined && value.length > max) {
      return { valid: false, error: `최대 길이는 ${max}입니다.`, code: ERROR_CODES.INVALID_INPUT };
    }
  }
  
  if (typeof value === 'number') {
    if (min !== undefined && value < min) {
      return { valid: false, error: `최소값은 ${min}입니다.`, code: ERROR_CODES.INVALID_INPUT };
    }
    if (max !== undefined && value > max) {
      return { valid: false, error: `최대값은 ${max}입니다.`, code: ERROR_CODES.INVALID_INPUT };
    }
  }
  
  // 패턴 검증
  if (pattern && typeof value === 'string') {
    if (!pattern.test(value)) {
      return { valid: false, error: '형식이 올바르지 않습니다.', code: ERROR_CODES.INVALID_INPUT };
    }
  }
  
  // Enum 검증
  if (enumValues && !enumValues.includes(value)) {
    return { valid: false, error: `허용된 값이 아닙니다: ${enumValues.join(', ')}`, code: ERROR_CODES.INVALID_INPUT };
  }
  
  return { valid: true };
}

/**
 * 메시지 패킷 스키마
 */
export const MESSAGE_PACKET_SCHEMA = {
  required: ['roomId', 'sender', 'iv', 'ct', 'timestamp'],
  properties: {
    roomId: { type: 'string', min: 4, max: 32 },
    sender: { type: 'string', min: 8, max: 32 },
    iv: { type: 'string', min: 16, max: 16 },
    ct: { type: 'string' },
    timestamp: { type: 'number' }
  }
};

/**
 * 공지 스키마
 */
export const NOTICE_SCHEMA = {
  required: ['title', 'content'],
  properties: {
    title: { type: 'string', min: 1, max: 100 },
    content: { type: 'string', min: 1, max: 1000 },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    expiresAt: { type: 'number' }
  }
};

/**
 * 관리자 로그인 스키마
 */
export const ADMIN_LOGIN_SCHEMA = {
  required: ['password'],
  properties: {
    password: { type: 'string', min: 8, max: 128 }
  }
};
