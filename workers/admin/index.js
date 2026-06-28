/**
 * Admin Worker
 * 관리자 API 및 인증
 */

import { SECURITY_HEADERS, ALLOWED_ORIGINS } from '../../shared/constants/index.js';
import { validateSchema, ADMIN_LOGIN_SCHEMA } from '../../shared/validation/index.js';
import { createSessionToken, verifySessionToken, hashPassword, verifyPassword, generateSalt } from '../../core/auth/index.js';

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
    
    // 관리자 로그인 (POST /admin/login)
    if (url.pathname === '/admin/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const validation = validateSchema(body, ADMIN_LOGIN_SCHEMA);
        
        if (!validation.valid) {
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...SECURITY_HEADERS
            }
          });
        }
        
        // 비밀번호 검증
        const hashedPassword = await hashPassword(body.password, env.PASSWORD_SALT);
        if (hashedPassword !== env.ADMIN_PASSWORD_HASH) {
          return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...SECURITY_HEADERS
            }
          });
        }
        
        // 세션 토큰 생성
        const token = await createSessionToken(
          { userId: 'admin', role: 'admin' },
          env.JWT_SECRET,
          3600
        );
        
        // Audit Log
        await this.logAudit(env, {
          action: 'admin_login',
          userId: 'admin',
          timestamp: Date.now()
        });
        
        return new Response(JSON.stringify({ token }), {
          headers: {
            'Content-Type': 'application/json',
            ...this.getCorsHeaders(request),
            ...SECURITY_HEADERS
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
    }
    
    // 인증 미들웨어가 필요한 엔드포인트
    const authResult = await this.authenticate(request, env);
    if (!authResult.authenticated) {
      return authResult.response;
    }
    
    const payload = authResult.payload;
    
    // 방 목록 조회 (GET /admin/rooms)
    if (url.pathname === '/admin/rooms' && request.method === 'GET') {
      // KV에서 방 목록 조회 (구현 필요)
      const rooms = [];
      return new Response(JSON.stringify(rooms), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 방 종료 (POST /admin/rooms/:id/kill)
    if (url.pathname.match(/^\/admin\/rooms\/[^/]+\/kill$/) && request.method === 'POST') {
      const roomId = url.pathname.split('/')[3];
      // 방 종료 로직 (구현 필요)
      
      await this.logAudit(env, {
        action: 'kill_room',
        userId: payload.userId,
        roomId,
        timestamp: Date.now()
      });
      
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 로그 조회 (GET /admin/logs)
    if (url.pathname === '/admin/logs' && request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const logs = await this.getAuditLogs(env, limit);
      return new Response(JSON.stringify(logs), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 통계 조회 (GET /admin/stats)
    if (url.pathname === '/admin/stats' && request.method === 'GET') {
      const stats = {
        totalRooms: 0,
        totalUsers: 0,
        totalMessages: 0,
        uptime: process.uptime ? process.uptime() : 0
      };
      return new Response(JSON.stringify(stats), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 차단 목록 (GET /admin/blocklist)
    if (url.pathname === '/admin/blocklist' && request.method === 'GET') {
      const blocklist = [];
      return new Response(JSON.stringify(blocklist), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 차단 추가 (POST /admin/blocklist)
    if (url.pathname === '/admin/blocklist' && request.method === 'POST') {
      try {
        const body = await request.json();
        // 차단 로직 (구현 필요)
        
        await this.logAudit(env, {
          action: 'block_user',
          userId: payload.userId,
          targetUserId: body.userId,
          timestamp: Date.now()
        });
        
        return new Response(JSON.stringify({ success: true }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            ...this.getCorsHeaders(request),
            ...SECURITY_HEADERS
          }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
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
   * 인증 미들웨어
   */
  async authenticate(request, env) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        authenticated: false,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        })
      };
    }
    
    const token = authHeader.substring(7);
    const payload = await verifySessionToken(token, env.JWT_SECRET);
    
    if (!payload || payload.role !== 'admin') {
      return {
        authenticated: false,
        response: new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        })
      };
    }
    
    return { authenticated: true, payload };
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
      headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    }
    
    return headers;
  },
  
  /**
   * Audit Log 기록
   */
  async logAudit(env, logData) {
    const logId = crypto.randomUUID();
    await env.AUDIT_LOGS.put(logId, JSON.stringify(logData));
  },
  
  /**
   * Audit Log 조회
   */
  async getAuditLogs(env, limit = 100) {
    const logs = [];
    const list = await env.AUDIT_LOGS.list({ limit });
    
    for (const key of list.keys) {
      const log = await env.AUDIT_LOGS.get(key.name);
      if (log) {
        logs.push(JSON.parse(log));
      }
    }
    
    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }
};
