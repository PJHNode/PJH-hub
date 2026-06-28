/**
 * Quiet Room - Crypto Module
 * 암호화 관련 (독립 구현)
 * @module quiet-room/crypto
 */

const CRYPTO = {
  ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  SALT_LENGTH: 16,
  ITERATIONS: 200000
};

/**
 * 키 유도 (PBKDF2)
 * @param {string} secret 
 * @param {string} roomId 
 * @returns {Promise<CryptoKey>}
 */
export async function deriveRoomKey(secret, roomId) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const salt = encoder.encode(roomId);
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: CRYPTO.ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: CRYPTO.ALGORITHM,
      length: CRYPTO.KEY_LENGTH
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 메시지 암호화
 * @param {Object} message 
 * @param {CryptoKey} key 
 * @param {string} roomId 
 * @param {string} senderId 
 * @returns {Promise<Object>}
 */
export async function encryptRoomMessage(message, key, roomId, senderId) {
  const encoder = new TextEncoder();
  const data = JSON.stringify(message);
  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO.IV_LENGTH));
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: CRYPTO.ALGORITHM,
      iv: iv
    },
    key,
    encoder.encode(data)
  );
  
  return {
    roomId,
    sender: senderId,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
    timestamp: Date.now()
  };
}

/**
 * 패킷 복호화
 * @param {Object} packet 
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function decryptRoomPacket(packet, key) {
  const iv = new Uint8Array(packet.iv);
  const data = new Uint8Array(packet.data);
  
  const decrypted = await crypto.subtle.decrypt(
    {
      name: CRYPTO.ALGORITHM,
      iv: iv
    },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

/**
 * 핸드쉐이크 시작
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function startHandshake(key) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  return {
    type: 'handshake',
    action: 'challenge',
    nonce: Array.from(nonce),
    timestamp: Date.now()
  };
}

/**
 * 핸드쉐이크 응답
 * @param {Object} challengePacket 
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function respondToHandshake(challengePacket, key) {
  return {
    type: 'handshake',
    action: 'response',
    nonce: challengePacket.nonce,
    timestamp: Date.now()
  };
}

/**
 * 핸드쉐이크 검증
 * @param {Object} responsePacket 
 * @param {CryptoKey} key 
 * @param {Uint8Array} originalNonce 
 * @returns {Promise<boolean>}
 */
export async function verifyHandshake(responsePacket, key, originalNonce) {
  return JSON.stringify(responsePacket.nonce) === JSON.stringify(Array.from(originalNonce));
}
