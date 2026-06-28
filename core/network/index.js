/**
 * Core Network Module
 * 네트워크 관련 기능 (WebSocket, Reconnect, Heartbeat)
 * @module core/network
 */

import { randomToken, delay, retryWithBackoff } from '../utils/index.js';

/**
 * WebSocket 연결 옵션
 * @typedef {Object} WebSocketOptions
 * @property {number} heartbeatInterval - 하트비트 간격 (ms)
 * @property {number} reconnectDelay - 재연결 지연 (ms)
 * @property {number} timeout - 연결 타임아웃 (ms)
 * @property {number} maxRetries - 최대 재시도 횟수
 */

/**
 * 안정적인 WebSocket 연결 클래스
 */
export class ReliableWebSocket {
  /**
   * @param {string} url 
   * @param {WebSocketOptions} options 
   */
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      heartbeatInterval: 30000,
      reconnectDelay: 1000,
      timeout: 10000,
      maxRetries: 5,
      ...options
    };
    
    this.ws = null;
    this.messageQueue = [];
    this.isConnecting = false;
    this.shouldReconnect = true;
    this.retryCount = 0;
    this.heartbeatTimer = null;
    this.lastPong = 0;
    
    this.onOpen = null;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
  }
  
  /**
   * 연결 시작
   */
  async connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    
    this.isConnecting = true;
    
    try {
      await retryWithBackoff(
        async () => {
          return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.url);
            const timeoutTimer = setTimeout(() => {
              ws.close();
              reject(new Error('Connection timeout'));
            }, this.options.timeout);
            
            ws.onopen = () => {
              clearTimeout(timeoutTimer);
              this.ws = ws;
              this.isConnecting = false;
              this.retryCount = 0;
              this.setupEventHandlers();
              this.startHeartbeat();
              this.flushMessageQueue();
              if (this.onOpen) this.onOpen();
              resolve();
            };
            
            ws.onerror = (error) => {
              clearTimeout(timeoutTimer);
              reject(error);
            };
          });
        },
        {
          maxRetries: this.options.maxRetries,
          baseDelay: this.options.reconnectDelay
        }
      );
    } catch (error) {
      this.isConnecting = false;
      if (this.onError) this.onError(error);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }
  
  /**
   * 이벤트 핸들러 설정
   */
  setupEventHandlers() {
    this.ws.onmessage = (event) => {
      if (this.onMessage) {
        this.onMessage(event.data);
      }
    };
    
    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (this.onClose) this.onClose();
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
    
    this.ws.onerror = (error) => {
      if (this.onError) this.onError(error);
    };
  }
  
  /**
   * 하트비트 시작
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.lastPong = Date.now();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
        
        // Pong이 너무 오래되면 연결 끊은 것으로 간주
        if (Date.now() - this.lastPong > this.options.heartbeatInterval * 2) {
          this.ws.close();
        }
      }
    }, this.options.heartbeatInterval);
  }
  
  /**
   * 하트비트 중지
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  /**
   * Pong 처리
   */
  handlePong() {
    this.lastPong = Date.now();
  }
  
  /**
   * 재연결 예약
   */
  scheduleReconnect() {
    if (!this.shouldReconnect) return;
    
    this.retryCount++;
    const delay = this.options.reconnectDelay * Math.pow(2, Math.min(this.retryCount - 1, 5));
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }
  
  /**
   * 메시지 전송
   * @param {Object|string} data 
   */
  send(data) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }
  
  /**
   * 메시지 큐 플러시
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(this.messageQueue.shift());
    }
  }
  
  /**
   * 연결 종료
   */
  close() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
    this.messageQueue = [];
  }
  
  /**
   * 연결 상태 확인
   * @returns {boolean}
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

/**
 * BroadcastChannel 래퍼
 */
export class LocalChannel {
  /**
   * @param {string} name 
   */
  constructor(name) {
    this.channel = new BroadcastChannel(name);
    this.onMessage = null;
    
    this.channel.onmessage = (event) => {
      if (this.onMessage) {
        this.onMessage(event.data);
      }
    };
  }
  
  /**
   * 메시지 전송
   * @param {any} data 
   */
  send(data) {
    this.channel.postMessage(data);
  }
  
  /**
   * 연결 종료
   */
  close() {
    this.channel.close();
  }
}

/**
 * Rate Limiter
 */
export class RateLimiter {
  /**
   * @param {number} maxRequests - 최대 요청 수
   * @param {number} windowMs - 윈도우 크기 (ms)
   */
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  /**
   * 요청 허용 여부 확인
   * @param {string} identifier - 식별자 (IP, userId 등)
   * @returns {boolean}
   */
  check(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    let userRequests = this.requests.get(identifier) || [];
    
    // 윈도우 밖의 요청 제거
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (userRequests.length >= this.maxRequests) {
      return false;
    }
    
    userRequests.push(now);
    this.requests.set(identifier, userRequests);
    
    return true;
  }
  
  /**
   * 남은 요청 수
   * @param {string} identifier 
   * @returns {number}
   */
  remaining(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const userRequests = this.requests.get(identifier) || [];
    const validRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }
  
  /**
   * 리셋 시간
   * @param {string} identifier 
   * @returns {number}
   */
  resetTime(identifier) {
    const userRequests = this.requests.get(identifier);
    if (!userRequests || userRequests.length === 0) {
      return 0;
    }
    
    return userRequests[0] + this.windowMs;
  }
  
  /**
   * 식별자 제거
   * @param {string} identifier 
   */
  clear(identifier) {
    this.requests.delete(identifier);
  }
}
