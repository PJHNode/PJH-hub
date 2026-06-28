/**
 * Core Crypto Module
 * 암호화 관련 기능 (Key Verification Handshake 포함)
 * @module core/crypto
 */

import { toBase64, fromBase64, calculateChecksum } from '../utils/index.js';

/**
 * 비밀키에서 AES-GCM 키 유도
 * @param {string} secret - 비밀키
 * @param {string} roomId - 방 ID (salt로 사용)
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(secret, roomId) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(roomId),
      iterations: 200000,
      hash: "SHA-256"
    },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * 메시지 암호화
 * @param {Object} message - 암호화할 메시지
 * @param {CryptoKey} key - AES-GCM 키
 * @param {string} roomId - 방 ID
 * @param {string} senderId - 발신자 ID
 * @returns {Promise<Object>} 암호화된 패킷
 */
export async function encryptMessage(message, key, roomId, senderId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(message));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  
  return {
    roomId,
    sender: senderId,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    timestamp: Date.now()
  };
}

/**
 * 패킷 복호화
 * @param {Object} packet - 암호화된 패킷
 * @param {CryptoKey} key - AES-GCM 키
 * @returns {Promise<Object>} 복호화된 메시지
 */
export async function decryptPacket(packet, key) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(packet.iv) },
    key,
    fromBase64(packet.ct)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Key Verification Handshake - Challenge 생성
 * @param {CryptoKey} key - AES-GCM 키
 * @returns {Promise<Object>} Challenge 패킷
 */
export async function createChallenge(key) {
  const challenge = {
    type: 'challenge',
    nonce: crypto.getRandomValues(new Uint8Array(16)),
    timestamp: Date.now()
  };
  return encryptMessage(challenge, key, 'verify', 'client');
}

/**
 * Key Verification Handshake - Challenge 응답
 * @param {Object} challengePacket - Challenge 패킷
 * @param {CryptoKey} key - AES-GCM 키
 * @returns {Promise<Object>} Response 패킷
 */
export async function respondToChallenge(challengePacket, key) {
  const decrypted = await decryptPacket(challengePacket, key);
  
  const response = {
    type: 'challenge-response',
    nonce: decrypted.nonce,
    timestamp: Date.now()
  };
  
  return encryptMessage(response, key, 'verify', 'server');
}

/**
 * Key Verification Handshake - 응답 검증
 * @param {Object} responsePacket - Response 패킷
 * @param {CryptoKey} key - AES-GCM 키
 * @param {Uint8Array} originalNonce - 원본 nonce
 * @returns {Promise<boolean>} 검증 결과
 */
export async function verifyResponse(responsePacket, key, originalNonce) {
  try {
    const decrypted = await decryptPacket(responsePacket, key);
    return decrypted.type === 'challenge-response' && 
           arraysEqual(decrypted.nonce, originalNonce);
  } catch {
    return false;
  }
}

/**
 * Uint8Array 비교
 * @param {Uint8Array} a 
 * @param {Uint8Array} b 
 * @returns {boolean}
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 파일 청킹
 * @param {ArrayBuffer} fileData 
 * @param {number} chunkSize - 청크 크기 (기본 64KB)
 * @returns {Array<Uint8Array>} 청크 배열
 */
export function chunkFile(fileData, chunkSize = 64 * 1024) {
  const chunks = [];
  const data = new Uint8Array(fileData);
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 청크 암호화
 * @param {Uint8Array} chunk - 청크 데이터
 * @param {CryptoKey} key - AES-GCM 키
 * @param {number} chunkIndex - 청크 인덱스
 * @returns {Promise<Object>} 암호화된 청크
 */
export async function encryptChunk(chunk, key, chunkIndex) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    chunk
  );
  
  return {
    index: chunkIndex,
    iv: toBase64(iv),
    data: toBase64(ciphertext),
    checksum: await calculateChecksum(chunk)
  };
}

/**
 * 청크 복호화
 * @param {Object} encryptedChunk - 암호화된 청크
 * @param {CryptoKey} key - AES-GCM 키
 * @returns {Promise<Uint8Array>} 복호화된 청크
 */
export async function decryptChunk(encryptedChunk, key) {
  const ciphertext = fromBase64(encryptedChunk.data);
  const iv = fromBase64(encryptedChunk.iv);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  const checksum = await calculateChecksum(decrypted);
  if (checksum !== encryptedChunk.checksum) {
    throw new Error('Checksum mismatch');
  }
  
  return new Uint8Array(decrypted);
}
