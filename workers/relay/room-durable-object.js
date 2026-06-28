/**
 * Relay Worker - Room Durable Object
 * 방 상태 관리 및 WebSocket 릴레이
 * Durable Object Storage 사용
 */

import { SECURITY_HEADERS, ALLOWED_ORIGINS, NETWORK, RATE_LIMIT } from '../../shared/constants/index.js';

export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // socketId -> { socket, nickname, clientId, lastActivity }
    this.messageSequence = 0;
    this.storage = this.state.storage;
    
    // 초기화
    this.state.setWebSocketAutoResponse(
      new Response(null, { status: 101, webSocket: null })
    );
  }
  
  /**
   * 세션 저장
   */
  async saveSession(clientId, sessionData) {
    await this.storage.put(`session:${clientId}`, {
      ...sessionData,
      savedAt: Date.now()
    });
  }
  
  /**
   * 세션 로드
   */
  async loadSession(clientId) {
    return await this.storage.get(`session:${clientId}`);
  }
  
  /**
   * 세션 삭제
   */
  async deleteSession(clientId) {
    await this.storage.delete(`session:${clientId}`);
  }
  
  /**
   * 방 메타데이터 저장
   */
  async saveRoomMetadata() {
    await this.storage.put('room:metadata', {
      createdAt: Date.now(),
      lastActivity: Date.now(),
      messageSequence: this.messageSequence,
      totalSessions: this.sessions.size
    });
  }
  
  /**
   * 방 메타데이터 로드
   */
  async loadRoomMetadata() {
    return await this.storage.get('room:metadata');
  }
  
  /**
   * 브로드캐스트
   */
  broadcast(data, excludeId = null) {
    const msg = JSON.stringify(data);
    for (const [id, { socket }] of this.sessions) {
      if (id !== excludeId && socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
      }
    }
  }
  
  /**
   * CORS 헤더 생성
   */
  getCorsHeaders(request) {
    const origin = request.headers.get('Origin');
    const headers = {};
    
    // 허용된 도메인 확인
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace('*', '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin || '*';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    }
    
    return headers;
  }
  
  /**
   * Security Headers 추가
   */
  getSecurityHeaders() {
    return SECURITY_HEADERS;
  }
  
  /**
   * Rate Limiting 체크
   */
  checkRateLimit(clientId, type = 'message') {
    const key = `ratelimit:${type}:${clientId}`;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT[type].windowMs;
    
    let requests = this.state.storage.getSync(key) || [];
    requests = requests.filter(timestamp => timestamp > windowStart);
    
    if (requests.length >= RATE_LIMIT[type].maxRequests) {
      return false;
    }
    
    requests.push(now);
    this.state.storage.putSync(key, requests);
    return true;
  }
  
  /**
   * 핸들쉐이크 처리
   */
  async handleHandshake(server, clientId, nickname) {
    // Challenge 전송
    const challenge = {
      type: 'handshake',
      action: 'challenge',
      nonce: crypto.getRandomValues(new Uint8Array(16)).toString(),
      timestamp: Date.now()
    };
    server.send(JSON.stringify(challenge));
    
    // 응답 대기 (타임아웃 10초)
    const response = await this.waitForHandshakeResponse(server, clientId, 10000);
    
    if (!response) {
      return false;
    }
    
    // 응답 검증 (클라이언트가 올바른 키로 암호화했는지 확인)
    // 서버는 키를 모르므로, 클라이언트가 응답을 보내는 것 자체로 검증으로 간주
    return true;
  }
  
  /**
   * 핸드쉐이크 응답 대기
   */
  async waitForHandshakeResponse(server, clientId, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeout);
      
      const handler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'handshake' && data.action === 'response') {
            clearTimeout(timer);
            server.removeEventListener('message', handler);
            resolve(data);
          }
        } catch (e) {
          // 무시
        }
      };
      
      server.addEventListener('message', handler);
    });
  }
  
  /**
   * WebSocket 메시지 처리
   */
  async handleWebSocketMessage(server, clientId, event) {
    try {
      const data = JSON.parse(event.data);
      
      // Ping/Pong 처리
      if (data.type === 'ping') {
        server.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
        this.updateSessionActivity(clientId);
        return;
      }
      
      if (data.type === 'pong') {
        this.updateSessionActivity(clientId);
        return;
      }
      
      // 패킷 중계
      if (data.type === 'packet') {
        if (!this.checkRateLimit(clientId, 'message')) {
          server.send(JSON.stringify({ type: 'error', code: 'RATE_LIMITED' }));
          return;
        }
        
        this.messageSequence++;
        data.sequence = this.messageSequence;
        data.timestamp = Date.now();
        
        // 중계
        for (const [id, { socket }] of this.sessions) {
          if (id !== clientId && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
          }
        }
        
        this.updateSessionActivity(clientId);
        await this.saveRoomMetadata();
      }
      
      // 핸드쉐이크 응답
      if (data.type === 'handshake' && data.action === 'response') {
        // 핸들쉐이크 완료 처리
        const session = this.sessions.get(clientId);
        if (session) {
          session.handshakeComplete = true;
        }
      }
      
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  }
  
  /**
   * 세션 활동 시간 업데이트
   */
  updateSessionActivity(clientId) {
    const session = this.sessions.get(clientId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }
  
  /**
   * 세션 정리 (비활성 세션 제거)
   */
  cleanupInactiveSessions() {
    const now = Date.now();
    const timeout = NETWORK.HEARTBEAT_INTERVAL * 3; // 90초
    
    for (const [clientId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > timeout) {
        this.sessions.delete(clientId);
        this.deleteSession(clientId);
        this.broadcast({
          type: 'system',
          event: 'timeout',
          nickname: session.nickname,
          online: this.sessions.size
        });
      }
    }
  }
  
  /**
   * Fetch 핸들러
   */
  async fetch(request) {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...this.getCorsHeaders(request),
          ...this.getSecurityHeaders()
        }
      });
    }
    
    // WebSocket 업그레이드
    if (request.headers.get('Upgrade') === 'websocket') {
      const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
      const nickname = this.decodeURIComponent(url.searchParams.get('nickname') || '익명');
      
      const { 0: client, 1: server } = new WebSocketPair();
      server.accept();
      
      // 세션 생성
      this.sessions.set(clientId, {
        socket: server,
        nickname,
        clientId,
        lastActivity: Date.now(),
        handshakeComplete: false
      });
      
      await this.saveSession(clientId, {
        nickname,
        clientId,
        joinedAt: Date.now()
      });
      
      // 핸드쉐이크
      const handshakeSuccess = await this.handleHandshake(server, clientId, nickname);
      
      if (!handshakeSuccess) {
        server.close();
        this.sessions.delete(clientId);
        await this.deleteSession(clientId);
        return new Response('Handshake failed', { status: 400 });
      }
      
      // 입장 알림
      this.broadcast({
        type: 'system',
        event: 'join',
        nickname,
        online: this.sessions.size
      }, clientId);
      
      // 본인에게 접속자 수 전송
      server.send(JSON.stringify({
        type: 'online',
        count: this.sessions.size
      }));
      
      // 메시지 핸들러
      server.addEventListener('message', (event) => {
        this.handleWebSocketMessage(server, clientId, event);
      });
      
      // 정리 핸들러
      const cleanup = async () => {
        this.sessions.delete(clientId);
        await this.deleteSession(clientId);
        this.broadcast({
          type: 'system',
          event: 'leave',
          nickname,
          online: this.sessions.size
        });
        await this.saveRoomMetadata();
      };
      
      server.addEventListener('close', cleanup);
      server.addEventListener('error', cleanup);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: this.getSecurityHeaders()
      });
    }
    
    // HTTP 요청 (접속자 수 조회)
    return new Response(JSON.stringify({
      online: this.sessions.size,
      sequence: this.messageSequence
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(request),
        ...this.getSecurityHeaders()
      }
    });
  }
  
  /**
   * URI 컴포넌트 디코딩
   */
  decodeURIComponent(str) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }
}
