/**
 * Quiet Room - Crypto Module
 * 암호화 관련 (Core Crypto 사용)
 * @module quiet-room/crypto
 */

import { deriveKey, encryptMessage, decryptPacket, createChallenge, respondToChallenge, verifyResponse } from '../../../core/crypto/index.js';
import { CRYPTO } from '../../../shared/constants/index.js';

/**
 * 키 유도
 * @param {string} secret 
 * @param {string} roomId 
 * @returns {Promise<CryptoKey>}
 */
export async function deriveRoomKey(secret, roomId) {
  return deriveKey(secret, roomId);
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
  return encryptMessage(message, key, roomId, senderId);
}

/**
 * 패킷 복호화
 * @param {Object} packet 
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function decryptRoomPacket(packet, key) {
  return decryptPacket(packet, key);
}

/**
 * 핸드쉐이크 시작
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function startHandshake(key) {
  return createChallenge(key);
}

/**
 * 핸드쉐이크 응답
 * @param {Object} challengePacket 
 * @param {CryptoKey} key 
 * @returns {Promise<Object>}
 */
export async function respondToHandshake(challengePacket, key) {
  return respondToChallenge(challengePacket, key);
}

/**
 * 핸드쉐이크 검증
 * @param {Object} responsePacket 
 * @param {CryptoKey} key 
 * @param {Uint8Array} originalNonce 
 * @returns {Promise<boolean>}
 */
export async function verifyHandshake(responsePacket, key, originalNonce) {
  return verifyResponse(responsePacket, key, originalNonce);
}
