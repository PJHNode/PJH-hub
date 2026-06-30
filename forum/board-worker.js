// Forum — Cloudflare Worker + D1
// PJH Hub 계정 시스템(pjh-auth)과 연동: 글 작성/삭제 시 Authorization: Bearer <token> 검증
//
// wrangler.toml:
// [[d1_databases]]
// binding = "DB"
// database_name = "forum"
// database_id = "<YOUR_D1_ID>"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const AUTH_API = "https://pjh-auth.chaostatix.workers.dev";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// pjh-auth에 토큰을 던져 현재 로그인한 사용자 정보를 받아온다.
// auth-widget.js의 setSession({ token, userId, realName }) 구조와 짝을 맞춤.
async function verifyUser(request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  try {
    const res = await fetch(AUTH_API + "/me", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // 기대 형태: { userId, realName } (로그인 응답과 동일 필드 사용)
    if (!data || !data.userId) return null;
    return { userId: data.userId, realName: data.realName || data.userId };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        real_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // GET /posts — 목록 (로그인 불필요, 읽기는 누구나 가능)
    if (request.method === "GET" && path === "/posts") {
      const { results } = await env.DB.prepare(
        "SELECT id, user_id, real_name, content, created_at FROM posts ORDER BY created_at DESC LIMIT 50"
      ).all();
      return json(results);
    }

    // POST /posts — 글 작성 (로그인 필수)
    if (request.method === "POST" && path === "/posts") {
      const user = await verifyUser(request);
      if (!user) return json({ error: "로그인이 필요합니다." }, 401);

      const body = await request.json();
      const content = (body.content || "").trim();
      if (!content) return json({ error: "내용을 입력하세요." }, 400);
      if (content.length > 500) return json({ error: "500자 이하로 작성해주세요." }, 400);

      await env.DB.prepare(
        "INSERT INTO posts (user_id, real_name, content, created_at) VALUES (?, ?, ?, ?)"
      ).bind(user.userId, user.realName, content.slice(0, 500), Date.now()).run();
      return json({ ok: true });
    }

    // DELETE /posts/:id — 삭제 (로그인 필수 + 본인 글만)
    const deleteMatch = path.match(/^\/posts\/(\d+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const user = await verifyUser(request);
      if (!user) return json({ error: "로그인이 필요합니다." }, 401);

      const id = parseInt(deleteMatch[1]);
      const post = await env.DB.prepare("SELECT user_id FROM posts WHERE id = ?").bind(id).first();
      if (!post) return json({ error: "글을 찾을 수 없습니다." }, 404);
      if (post.user_id !== user.userId) return json({ error: "본인 글만 삭제할 수 있습니다." }, 403);

      await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }
};
