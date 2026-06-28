/**
 * Relay Worker - Main Entry Point
 * WebSocket 릴레이 서버
 */

import { RoomDurableObject } from './room-durable-object.js';
import { SECURITY_HEADERS, ALLOWED_ORIGINS } from '../../shared/constants/index.js';

export default {
  /**
   * Fetch 핸들러
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: {
          'Content-Type': 'application/json',
          ...SECURITY_HEADERS
        }
      });
    }
    
    // WebSocket 업그레이드
    if (request.headers.get('Upgrade') === 'websocket') {
      const roomId = url.pathname.replace(/^\/room\//, '').trim() || 'default';
      
      // Room ID 검증
      if (!/^[a-zA-Z0-9-_]{4,32}$/.test(roomId)) {
        return new Response(JSON.stringify({ error: 'Invalid room ID' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
      
      const id = env.ROOMS.idFromName(roomId);
      const room = env.ROOMS.get(id);
      return room.fetch(request);
    }
    
    // 기본 응답
    return new Response(JSON.stringify({
      name: 'PJH Hub Relay Worker',
      version: '2.0.0',
      status: 'running'
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...SECURITY_HEADERS
      }
    });
  },
  
  /**
   * CORS 헤더 생성
   */
  getCorsHeaders(request) {
    const origin = request.headers.get('Origin');
    const headers = {};
    
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
};
