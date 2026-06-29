/**
 * pjh-auth — 계정 관리 Worker
 * KV: USERS (계정), SESSIONS (세션 토큰)
 * 환경변수: ADMIN_PASSWORD
 *
 * POST /register        → 회원가입
 * POST /login           → 로그인 → 토큰 발급
 * POST /logout          → 로그아웃
 * GET  /me              → 내 정보 (토큰 필요)
 * GET  /admin/users     → 전체 계정 목록 (관리자)
 * DELETE /admin/users/:id → 계정 삭제 (관리자)
 * POST /admin/users/:id/ban → 계정 정지 (관리자)
 */

const ALLOWED_ORIGINS = [
  "https://pjhnode.github.io",
  "https://pjh-hub.pages.dev",
  "http://localhost",
];

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function json(data, status = 200, request) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json", ...cors(request) }
  });
}

async function hash(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

function genToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,"0")).join("");
}

// Rate limit: KV 기반 (간단 슬라이딩 윈도우)
async function rateLimit(env, key, max, windowSec) {
  const k = "rl:" + key;
  const now = Math.floor(Date.now() / 1000);
  const val = await env.SESSIONS.get(k);
  let data = val ? JSON.parse(val) : { count: 0, window: now };
  if (now - data.window >= windowSec) { data = { count: 0, window: now }; }
  if (data.count >= max) return false;
  data.count++;
  await env.SESSIONS.put(k, JSON.stringify(data), { expirationTtl: windowSec * 2 });
  return true;
}

async function getSession(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const val = await env.SESSIONS.get("sess:" + token);
  if (!val) return null;
  return JSON.parse(val);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    if (request.method === "OPTIONS") return new Response(null, { headers: cors(request) });

    // ── POST /register ─────────────────────────────────────────────
    if (url.pathname === "/register" && request.method === "POST") {
      if (!await rateLimit(env, "reg:" + ip, 5, 3600)) return json({ error: "너무 많은 요청입니다. 잠시 후 다시 시도하세요." }, 429, request);
      const { userId, realName, password } = await request.json();
      if (!userId || !realName || !password) return json({ error: "모든 항목을 입력하세요." }, 400, request);
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(userId)) return json({ error: "아이디는 영문/숫자/_ 3~20자" }, 400, request);
      if (realName.length < 1 || realName.length > 20) return json({ error: "이름은 1~20자" }, 400, request);
      if (password.length < 6 || password.length > 100) return json({ error: "비밀번호는 6~100자" }, 400, request);
      const existing = await env.USERS.get("user:" + userId.toLowerCase());
      if (existing) return json({ error: "이미 사용 중인 아이디입니다." }, 409, request);
      const pwHash = await hash(password);
      const user = { userId: userId.toLowerCase(), realName, pwHash, createdAt: Date.now(), banned: false };
      await env.USERS.put("user:" + userId.toLowerCase(), JSON.stringify(user));
      return json({ ok: true }, 201, request);
    }

    // ── POST /login ────────────────────────────────────────────────
    if (url.pathname === "/login" && request.method === "POST") {
      if (!await rateLimit(env, "login:" + ip, 10, 60)) return json({ error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, 429, request);
      const { userId, password } = await request.json();
      if (!userId || !password) return json({ error: "아이디와 비밀번호를 입력하세요." }, 400, request);
      const val = await env.USERS.get("user:" + userId.toLowerCase());
      if (!val) return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401, request);
      const user = JSON.parse(val);
      if (user.banned) return json({ error: "정지된 계정입니다. 관리자에게 문의하세요." }, 403, request);
      const pwHash = await hash(password);
      if (pwHash !== user.pwHash) return json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401, request);
      const token = genToken();
      await env.SESSIONS.put("sess:" + token, JSON.stringify({ userId: user.userId, realName: user.realName }), { expirationTtl: 60 * 60 * 24 }); // 24시간
      return json({ ok: true, token, userId: user.userId, realName: user.realName }, 200, request);
    }

    // ── POST /logout ───────────────────────────────────────────────
    if (url.pathname === "/logout" && request.method === "POST") {
      const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
      if (token) await env.SESSIONS.delete("sess:" + token);
      return json({ ok: true }, 200, request);
    }

    // ── GET /me ────────────────────────────────────────────────────
    if (url.pathname === "/me" && request.method === "GET") {
      const sess = await getSession(request, env);
      if (!sess) return json({ error: "로그인이 필요합니다." }, 401, request);
      return json({ userId: sess.userId, realName: sess.realName }, 200, request);
    }

    // ── 관리자: 계정 목록 ──────────────────────────────────────────
    if (url.pathname === "/admin/users" && request.method === "GET") {
      const adminPw = (request.headers.get("Authorization") || "").replace("Bearer ", "");
      if (adminPw !== env.ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401, request);
      const list = await env.USERS.list({ prefix: "user:" });
      const users = await Promise.all(list.keys.map(async k => {
        const v = await env.USERS.get(k.name);
        try { const u = JSON.parse(v); const { pwHash, ...safe } = u; return safe; } catch { return null; }
      }));
      return json(users.filter(Boolean).sort((a,b) => b.createdAt - a.createdAt), 200, request);
    }

    // ── 관리자: 계정 삭제 ──────────────────────────────────────────
    const userDelMatch = url.pathname.match(/^\/admin\/users\/([^/]+)$/);
    if (userDelMatch && request.method === "DELETE") {
      const adminPw = (request.headers.get("Authorization") || "").replace("Bearer ", "");
      if (adminPw !== env.ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401, request);
      await env.USERS.delete("user:" + userDelMatch[1]);
      return json({ ok: true }, 200, request);
    }

    // ── 관리자: 계정 정지/해제 ────────────────────────────────────
    const userBanMatch = url.pathname.match(/^\/admin\/users\/([^/]+)\/(ban|unban)$/);
    if (userBanMatch && request.method === "POST") {
      const adminPw = (request.headers.get("Authorization") || "").replace("Bearer ", "");
      if (adminPw !== env.ADMIN_PASSWORD) return json({ error: "Unauthorized" }, 401, request);
      const val = await env.USERS.get("user:" + userBanMatch[1]);
      if (!val) return json({ error: "계정을 찾을 수 없습니다." }, 404, request);
      const user = JSON.parse(val);
      user.banned = userBanMatch[2] === "ban";
      await env.USERS.put("user:" + userBanMatch[1], JSON.stringify(user));
      return json({ ok: true }, 200, request);
    }

    return json({ error: "Not found" }, 404, request);
  }
};
