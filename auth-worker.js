/**
 * pjh-auth — PJH Hub 통합 계정 시스템
 * ------------------------------------------------------------
 * KV 네임스페이스:
 *   USERS    — key: "user:<userId>"     value: { userId, realName, passwordHash, salt, createdAt, banned }
 *   SESSIONS — key: "session:<token>"   value: { userId, realName, createdAt }  (expirationTtl 적용)
 *
 * 환경변수(secret): ADMIN_PASSWORD — 관리자 콘솔 전용, 일반 유저 인증과는 별개
 *
 * 일반 사용자 엔드포인트
 *   POST /register          { userId, realName, password } → 가입
 *   POST /login             { userId, password }           → { token, userId, realName }
 *   POST /logout            (Authorization: Bearer <token>)
 *   GET  /me                (Authorization: Bearer <token>) → { userId, realName }
 *
 * 관리자 엔드포인트 (Authorization: Bearer <ADMIN_PASSWORD>)
 *   GET    /admin/users           → 전체 가입자 목록
 *   POST   /admin/users/:id/ban   → 계정 정지 (로그인 차단)
 *   POST   /admin/users/:id/unban → 정지 해제
 *   DELETE /admin/users/:id       → 계정 완전 삭제
 *
 * 세션 만료: 7일 (SESSIONS KV expirationTtl)
 */

const ALLOWED_ORIGINS = [
  "https://pjhnode.github.io",
];

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7일

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

function checkAdminAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return false;
  return timingSafeEqual(match[1], env.ADMIN_PASSWORD);
}

// ── 비밀번호 해시 (PBKDF2, salt 포함) ──
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSalt() {
  const arr = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const arr = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── 입력값 검증 ──
const USER_ID_RE = /^[a-zA-Z0-9_]{3,20}$/;

function validateRegisterInput(body) {
  if (!body) return "요청 형식이 올바르지 않습니다.";
  const { userId, realName, password } = body;
  if (!userId || !USER_ID_RE.test(userId)) return "아이디는 영문/숫자/_ 3~20자여야 합니다.";
  if (!realName || typeof realName !== "string" || realName.trim().length < 1 || realName.length > 20) {
    return "이름은 1~20자여야 합니다.";
  }
  if (!password || typeof password !== "string" || password.length < 6 || password.length > 100) {
    return "비밀번호는 6자 이상 100자 이하여야 합니다.";
  }
  return null;
}

async function getSession(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return null;
  const token = match[1];
  const raw = await env.SESSIONS.get("session:" + token);
  if (!raw) return null;
  try {
    return { token, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    // ── POST /register ──
    if (url.pathname === "/register" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "잘못된 요청입니다." }, 400, request);
      }

      const validationError = validateRegisterInput(body);
      if (validationError) return json({ error: validationError }, 400, request);

      const userId = body.userId.trim();
      const realName = body.realName.trim();
      const existing = await env.USERS.get("user:" + userId);
      if (existing) return json({ error: "이미 사용 중인 아이디입니다." }, 409, request);

      const salt = randomSalt();
      const passwordHash = await hashPassword(body.password, salt);

      await env.USERS.put(
        "user:" + userId,
        JSON.stringify({
          userId,
          realName,
          passwordHash,
          salt,
          createdAt: new Date().toISOString(),
          banned: false,
        })
      );

      return json({ ok: true, userId }, 201, request);
    }

    // ── POST /login ──
    if (url.pathname === "/login" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "잘못된 요청입니다." }, 400, request);
      }

      const { userId, password } = body || {};
      if (!userId || !password) return json({ error: "아이디와 비밀번호를 입력하세요." }, 400, request);

      const raw = await env.USERS.get("user:" + userId);
      if (!raw) return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401, request);

      const user = JSON.parse(raw);
      if (user.banned) return json({ error: "정지된 계정입니다." }, 403, request);

      const hash = await hashPassword(password, user.salt);
      if (!timingSafeEqual(hash, user.passwordHash)) {
        return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401, request);
      }

      const token = randomToken();
      await env.SESSIONS.put(
        "session:" + token,
        JSON.stringify({ userId: user.userId, realName: user.realName }),
        { expirationTtl: SESSION_TTL_SECONDS }
      );

      return json({ ok: true, token, userId: user.userId, realName: user.realName }, 200, request);
    }

    // ── POST /logout ──
    if (url.pathname === "/logout" && request.method === "POST") {
      const session = await getSession(request, env);
      if (session) await env.SESSIONS.delete("session:" + session.token);
      return json({ ok: true }, 200, request);
    }

    // ── GET /me ──
    if (url.pathname === "/me" && request.method === "GET") {
      const session = await getSession(request, env);
      if (!session) return json({ error: "Unauthorized" }, 401, request);
      return json({ userId: session.userId, realName: session.realName }, 200, request);
    }

    // ── 관리자: 전체 사용자 목록 ──
    if (url.pathname === "/admin/users" && request.method === "GET") {
      if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, request);
      const list = await env.USERS.list({ prefix: "user:" });
      const users = await Promise.all(
        list.keys.map(async (k) => {
          const raw = await env.USERS.get(k.name);
          try {
            const u = JSON.parse(raw);
            return { userId: u.userId, realName: u.realName, createdAt: u.createdAt, banned: !!u.banned };
          } catch {
            return null;
          }
        })
      );
      return json({ users: users.filter(Boolean) }, 200, request);
    }

    // ── 관리자: 계정 정지 ──
    const banMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/ban$/);
    if (banMatch && request.method === "POST") {
      if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, request);
      const userId = decodeURIComponent(banMatch[1]);
      const raw = await env.USERS.get("user:" + userId);
      if (!raw) return json({ error: "사용자를 찾을 수 없습니다." }, 404, request);
      const user = JSON.parse(raw);
      user.banned = true;
      await env.USERS.put("user:" + userId, JSON.stringify(user));
      return json({ ok: true }, 200, request);
    }

    // ── 관리자: 정지 해제 ──
    const unbanMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/unban$/);
    if (unbanMatch && request.method === "POST") {
      if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, request);
      const userId = decodeURIComponent(unbanMatch[1]);
      const raw = await env.USERS.get("user:" + userId);
      if (!raw) return json({ error: "사용자를 찾을 수 없습니다." }, 404, request);
      const user = JSON.parse(raw);
      user.banned = false;
      await env.USERS.put("user:" + userId, JSON.stringify(user));
      return json({ ok: true }, 200, request);
    }

    // ── 관리자: 계정 삭제 ──
    const deleteMatch = url.pathname.match(/^\/admin\/users\/([^/]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      if (!checkAdminAuth(request, env)) return json({ error: "Unauthorized" }, 401, request);
      const userId = decodeURIComponent(deleteMatch[1]);
      await env.USERS.delete("user:" + userId);
      return json({ ok: true }, 200, request);
    }

    return json({ error: "Not found" }, 404, request);
  },
};
