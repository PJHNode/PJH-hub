// Quiet Board — Cloudflare Worker + D1
// D1 바인딩 이름: DB
// wrangler.toml에 추가 필요:
// [[d1_databases]]
// binding = "DB"
// database_name = "quiet-board"
// database_id = "<YOUR_D1_ID>"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname;

    // DB 초기화 (첫 요청 시)
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nickname TEXT NOT NULL,
        content TEXT NOT NULL,
        pw_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // GET /posts — 목록 (최신 50개)
    if (request.method === "GET" && path === "/posts") {
      const { results } = await env.DB.prepare(
        "SELECT id, nickname, content, created_at FROM posts ORDER BY created_at DESC LIMIT 50"
      ).all();
      return json(results);
    }

    // POST /posts — 글 작성
    if (request.method === "POST" && path === "/posts") {
      const body = await request.json();
      const { nickname, content, password } = body;
      if (!nickname || !content || !password) return json({ error: "필드 누락" }, 400);
      if (content.length > 500) return json({ error: "500자 이하로 작성해주세요" }, 400);

      const pwHash = await sha256(password);
      await env.DB.prepare(
        "INSERT INTO posts (nickname, content, pw_hash, created_at) VALUES (?, ?, ?, ?)"
      ).bind(nickname.slice(0, 20), content.slice(0, 500), pwHash, Date.now()).run();
      return json({ ok: true });
    }

    // DELETE /posts/:id — 삭제 (비밀번호 검증)
    const deleteMatch = path.match(/^\/posts\/(\d+)$/);
    if (request.method === "DELETE" && deleteMatch) {
      const id = parseInt(deleteMatch[1]);
      const body = await request.json();
      const { password } = body;
      if (!password) return json({ error: "비밀번호 필요" }, 400);

      const pwHash = await sha256(password);
      const post = await env.DB.prepare("SELECT pw_hash FROM posts WHERE id = ?").bind(id).first();
      if (!post) return json({ error: "글 없음" }, 404);
      if (post.pw_hash !== pwHash) return json({ error: "비밀번호 불일치" }, 403);

      await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  }
};

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
