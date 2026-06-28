/**
 * API Worker
 * 공통 API 엔드포인트
 */

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
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: Date.now(),
        version: '2.0.0'
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...SECURITY_HEADERS
        }
      });
    }
    
    // API 정보
    if (url.pathname === '/api') {
      return new Response(JSON.stringify({
        name: 'PJH Hub API',
        version: '2.0.0',
        endpoints: {
          relay: '/room/:id',
          notice: '/notices',
          admin: '/admin/*'
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
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
