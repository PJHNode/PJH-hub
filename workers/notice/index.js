/**
 * Notice Worker
 * 공지사항 관리
 */

import { SECURITY_HEADERS, ALLOWED_ORIGINS } from '../../shared/constants/index.js';
import { validateSchema, NOTICE_SCHEMA } from '../../shared/validation/index.js';
import { createSessionToken, verifySessionToken } from '../../core/auth/index.js';

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
    
    // 공지사항 목록 조회 (GET /notices)
    if (url.pathname === '/notices' && request.method === 'GET') {
      const notices = await env.NOTICES.list();
      return new Response(JSON.stringify(notices), {
        headers: {
          'Content-Type': 'application/json',
          ...this.getCorsHeaders(request),
          ...SECURITY_HEADERS
        }
      });
    }
    
    // 공지사항 생성 (POST /notices) - 인증 필요
    if (url.pathname === '/notices' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
      
      const token = authHeader.substring(7);
      const payload = await verifySessionToken(token, env.ADMIN_SECRET);
      
      if (!payload || payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
      
      try {
        const body = await request.json();
        const validation = validateSchema(body, NOTICE_SCHEMA);
        
        if (!validation.valid) {
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...SECURITY_HEADERS
            }
          });
        }
        
        const notice = {
          id: crypto.randomUUID(),
          ...body,
          createdAt: Date.now(),
          createdBy: payload.userId
        };
        
        await env.NOTICES.put(notice.id, JSON.stringify(notice));
        
        // Audit Log
        await this.logAudit(env, {
          action: 'create_notice',
          userId: payload.userId,
          noticeId: notice.id,
          timestamp: Date.now()
        });
        
        return new Response(JSON.stringify(notice), {
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
    
    // 공지사항 삭제 (DELETE /notices/:id) - 인증 필요
    if (url.pathname.match(/^\/notices\/[^/]+$/) && request.method === 'DELETE') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
      
      const token = authHeader.substring(7);
      const payload = await verifySessionToken(token, env.ADMIN_SECRET);
      
      if (!payload || payload.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            ...SECURITY_HEADERS
          }
        });
      }
      
      const noticeId = url.pathname.split('/').pop();
      await env.NOTICES.delete(noticeId);
      
      // Audit Log
      await this.logAudit(env, {
        action: 'delete_notice',
        userId: payload.userId,
        noticeId,
        timestamp: Date.now()
      });
      
      return new Response(null, {
        status: 204,
        headers: {
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
  }
};
