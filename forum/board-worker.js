// Forum — Cloudflare Worker + D1
// PJH Hub 계정 시스템(pjh-auth)과 연동: 글 작성/삭제 시 Authorization: Bearer <token> 검증
// 카테고리: free(자유게시판), qna(주제별 Q&A)
//
// wrangler.toml:
// [[d1_databases]]
// binding = "DB"
// database_name = "forum"
// database_id = "<YOUR_D1_ID>"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const AUTH_API = "https://pjh-auth.chaostatix.workers.dev";
const CATEGORIES = ["free", "qna"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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
    if (!data || !data.userId) return null;
    return { userId: data.userId, realName: data.realName || data.userId };
  } catch (e) {
    return null;
  }
}

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return; // 콜드스타트당 1회만 — 매 요청마다 CREATE 실행 방지
  await env.DB.exec(
    "CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL DEFAULT 'free', user_id TEXT NOT NULL, real_name TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL, is_answered INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"
  );
  schemaReady = true;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    try {
      await ensureSchema(env);

      const url = new URL(request.url);
      const path = url.pathname;

      // GET /posts?category=free|qna — 목록
      if (request.method === "GET" && path === "/posts") {
        const category = url.searchParams.get("category") || "free";
        if (!CATEGORIES.includes(category)) return json({ error: "잘못된 카테고리" }, 400);

        const { results } = await env.DB.prepare(
          "SELECT id, category, user_id, real_name, title, content, is_answered, created_at FROM posts WHERE category = ? ORDER BY created_at DESC LIMIT 50"
        ).bind(category).all();
        return json(results);
      }

      // POST /posts — 글 작성 (로그인 필수)
      if (request.method === "POST" && path === "/posts") {
        const user = await verifyUser(request);
        if (!user) return json({ error: "로그인이 필요합니다." }, 401);

        const body = await request.json();
        const category = CATEGORIES.includes(body.category) ? body.category : "free";
        const title = (body.title || "").trim();
        const content = (body.content || "").trim();

        if (category === "qna" && !title) return json({ error: "질문 제목을 입력하세요." }, 400);
        if (!content) return json({ error: "내용을 입력하세요." }, 400);
        if (content.length > 1000) return json({ error: "1000자 이하로 작성해주세요." }, 400);
        if (title.length > 100) return json({ error: "제목은 100자 이하로 작성해주세요." }, 400);

        await env.DB.prepare(
          "INSERT INTO posts (category, user_id, real_name, title, content, is_answered, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
        ).bind(category, user.userId, user.realName, title.slice(0, 100), content.slice(0, 1000), Date.now()).run();
        return json({ ok: true });
      }

      // PATCH /posts/:id — 답변 채택 토글 (Q&A 전용, 본인 글만)
      const patchMatch = path.match(/^\/posts\/(\d+)$/);
      if (request.method === "PATCH" && patchMatch) {
        const user = await verifyUser(request);
        if (!user) return json({ error: "로그인이 필요합니다." }, 401);

        const id = parseInt(patchMatch[1]);
        const post = await env.DB.prepare("SELECT user_id, category, is_answered FROM posts WHERE id = ?").bind(id).first();
        if (!post) return json({ error: "글을 찾을 수 없습니다." }, 404);
        if (post.user_id !== user.userId) return json({ error: "본인 글만 수정할 수 있습니다." }, 403);
        if (post.category !== "qna") return json({ error: "Q&A 글만 답변 채택이 가능합니다." }, 400);

        const next = post.is_answered ? 0 : 1;
        await env.DB.prepare("UPDATE posts SET is_answered = ? WHERE id = ?").bind(next, id).run();
        return json({ ok: true, is_answered: next });
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
    } catch (err) {
      // 어떤 단계에서든 예외가 나면 500 + 메시지를 그대로 노출해서 디버깅 가능하게
      return json({ error: "서버 오류: " + (err && err.message ? err.message : String(err)) }, 500);
    }
  }
};
