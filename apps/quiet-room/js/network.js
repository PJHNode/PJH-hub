/**
 * Quiet Room - Network Module
 * 네트워크 관련 (독립 구현)
 * @module quiet-room/network
 */

import { state } from './state.js';

const NETWORK = {
  HEARTBEAT_INTERVAL: 30000,
  RECONNECT_DELAY: 2000,
  CONNECTION_TIMEOUT: 10000,
  MAX_RETRIES: 5
};

/**
 * Reliable WebSocket 클래스
 */
class ReliableWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      heartbeatInterval: options.heartbeatInterval || NETWORK.HEARTBEAT_INTERVAL,
      reconnectDelay: options.reconnectDelay || NETWORK.RECONNECT_DELAY,
      timeout: options.timeout || NETWORK.CONNECTION_TIMEOUT,
      maxRetries: options.maxRetries || NETWORK.MAX_RETRIES
    };
    this.socket = null;
    this.reconnectCount = 0;
    this.heartbeatTimer = null;
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
  }

  connect() {
    try {
      this.socket = new WebSocket(this.url);
      this.socket.binaryType = 'arraybuffer';
      
      this.socket.onopen = () => {
        this.reconnectCount = 0;
        this.startHeartbeat();
        if (this.onOpen) this.onOpen();
      };
      
      this.socket.onmessage = (event) => {
        if (this.onMessage) this.onMessage(event);
      };
      
      this.socket.onclose = () => {
        this.stopHeartbeat();
        if (this.onClose) this.onClose();
        this.tryReconnect();
      };
      
      this.socket.onerror = (error) => {
        if (this.onError) this.onError(error);
      };
      
      // 타임아웃
      setTimeout(() => {
        if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      }, this.options.timeout);
      
    } catch (error) {
      if (this.onError) this.onError(error);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, this.options.heartbeatInterval);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  tryReconnect() {
    if (this.reconnectCount < this.options.maxRetries) {
      this.reconnectCount++;
      const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectCount - 1);
      setTimeout(() => this.connect(), delay);
    }
  }

  send(data) {
    if (this.isConnected()) {
      this.socket.send(JSON.stringify(data));
    }
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  close() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

/**
 * Local Channel 클래스
 */
class LocalChannel {
  constructor(name) {
    this.name = name;
    this.channel = new BroadcastChannel(name);
    this.onMessage = null;
    
    this.channel.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event);
    };
  }

  send(data) {
    this.channel.postMessage(data);
  }

  close() {
    this.channel.close();
  }
}

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
