/**
 * Quiet Room - Network Module
 * 네트워크 관련 (Core Network 사용)
 * @module quiet-room/network
 */

import { ReliableWebSocket, LocalChannel } from '../../../core/network/index.js';
import { NETWORK } from '../../../shared/constants/index.js';
import { state } from './state.js';

/**
 * WebSocket 연결
 * @type {ReliableWebSocket|null}
 */
export let wsConnection = null;

/**
 * Local Channel 연결
 * @type {LocalChannel|null}
 */
export let localChannel = null;

/**
 * WebSocket 연결 시작
 * @param {string} url 
 * @param {Object} handlers 
 */
export function connectWebSocket(url, handlers) {
  if (wsConnection) {
    wsConnection.close();
  }
  
  wsConnection = new ReliableWebSocket(url, {
    heartbeatInterval: NETWORK.HEARTBEAT_INTERVAL,
    reconnectDelay: NETWORK.RECONNECT_DELAY,
    timeout: NETWORK.CONNECTION_TIMEOUT,
    maxRetries: NETWORK.MAX_RETRIES
  });
  
  wsConnection.onOpen = handlers.onOpen;
  wsConnection.onMessage = handlers.onMessage;
  wsConnection.onClose = handlers.onClose;
  wsConnection.onError = handlers.onError;
  
  wsConnection.connect();
}

/**
 * Local Channel 연결
 * @param {string} name 
 * @param {Object} handlers 
 */
export function connectLocalChannel(name, handlers) {
  if (localChannel) {
    localChannel.close();
  }
  
  localChannel = new LocalChannel(name);
  localChannel.onMessage = handlers.onMessage;
}

/**
 * 메시지 전송
 * @param {Object|string} data 
 */
export function sendMessage(data) {
  if (wsConnection && wsConnection.isConnected()) {
    wsConnection.send(data);
  }
  
  if (localChannel) {
    localChannel.send(data);
  }
}

/**
 * 연결 종료
 */
export function closeConnections() {
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
  
  if (localChannel) {
    localChannel.close();
    localChannel = null;
  }
  
  state.isConnected = false;
}

/**
 * 연결 상태 확인
 * @returns {boolean}
 */
export function isConnected() {
  return wsConnection && wsConnection.isConnected();
}
