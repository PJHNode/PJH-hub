/**
 * quiet-room-relay / worker.js
 * ------------------------------------------------------------
 * 변경 사항 (기존 Room 클래스 기반 확장):
 *   1. Room이 생성/종료될 때 Registry DO 에 등록/해제 신호를 보냄
 *      → 관리자 콘솔에서 "현재 활성 방 목록"을 조회할 수 있게 됨
 *   2. 관리자가 보낸 IP가 차단 목록에 있으면 WebSocket 업그레이드 자체를 거부
 *   3. 관리자 API 라우트 추가:
 *        GET    /admin/rooms              -> 활성 방 + 접속자 수 목록
 *        POST   /admin/rooms/:id/kill     -> 해당 방 강제 종료
 *        GET    /admin/blocklist          -> 차단된 IP 목록
 *        POST   /admin/blocklist          -> IP 추가 { ip }
 *        DELETE /admin/blocklist/:ip      -> IP 제거
 *        GET    /admin/stats              -> 전체 통계 (방 수, 총 접속자 수)
 *
 * 인증: Authorization: Bearer <ADMIN_PASSWORD> 헤더 필요 (모든 /admin/* 라우트)
 * Registry DO 는 SINGLETON 하나만 사용 (idFromName("global"))
 */

// ── 비밀번호 timing-safe 비교 ──
function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) result |= aBytes[i] ^ bBytes[i];
  return result === 0;
}

function checkAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return false;
  return timingSafeEqual(match[1], env.ADMIN_PASSWORD);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function getClientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// ============================================================
// Registry Durable Object
// 싱글톤. 모든 Room의 생성/종료/인원변동을 추적하고,
// IP 차단 목록을 보관한다.
// ============================================================
export class Registry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map(); // roomId -> { online, lastUpdate }
    this.blocklist = new Set();
    this.hydrated = false;
  }

  async hydrate() {
    if (this.hydrated) return;
    const stored = await this.state.storage.get("blocklist");
    if (stored) this.blocklist = new Set(stored);
    this.hydrated = true;
  }

  async persistBlocklist() {
    await this.state.storage.put("blocklist", Array.from(this.blocklist));
  }

  async fetch(request) {
    await this.hydrate();
    const url = new URL(request.url);

    // ── 내부 호출: Room DO가 자신의 상태를 보고 ──
    if (request.method === "POST" && url.pathname === "/internal/report") {
      const body = await request.json();
      if (body.online === 0) {
        this.rooms.delete(body.roomId);
      } else {
        this.rooms.set(body.roomId, { online: body.online, lastUpdate: Date.now() });
      }
      return json({ ok: true });
    }

    // ── 방 목록 조회 ──
    if (request.method === "GET" && url.pathname === "/internal/rooms") {
      const list = Array.from(this.rooms.entries()).map(([roomId, info]) => ({
        roomId,
        online: info.online,
        lastUpdate: info.lastUpdate,
      }));
      return json({ rooms: list, totalRooms: list.length, totalConnections: list.reduce((s, r) => s + r.online, 0) });
    }

    // ── 차단 목록 조회 ──
    if (request.method === "GET" && url.pathname === "/internal/blocklist") {
      return json({ blocklist: Array.from(this.blocklist) });
    }

    // ── IP 추가 ──
    if (request.method === "POST" && url.pathname === "/internal/blocklist") {
      const body = await request.json();
      if (body.ip) {
        this.blocklist.add(body.ip);
        await this.persistBlocklist();
      }
      return json({ ok: true, blocklist: Array.from(this.blocklist) });
    }

    // ── IP 제거 ──
    if (request.method === "POST" && url.pathname === "/internal/blocklist/remove") {
      const body = await request.json();
      if (body.ip) {
        this.blocklist.delete(body.ip);
        await this.persistBlocklist();
      }
      return json({ ok: true, blocklist: Array.from(this.blocklist) });
    }

    // ── IP 차단 여부 확인 (Room DO가 입장 시 조회) ──
    if (request.method === "GET" && url.pathname === "/internal/check-ip") {
      const ip = url.searchParams.get("ip") || "";
      return json({ blocked: this.blocklist.has(ip) });
    }

    return json({ error: "Not found" }, 404);
  }
}

// ============================================================
// Room Durable Object (기존 + 확장)
// ============================================================
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // socketId -> { socket, nickname, ip }
    this.roomId = null;
    this.verifyToken = null; // 첫 입장자가 설정한 비밀키 검증 토큰 (기준값)
  }

  broadcast(data, excludeId = null) {
    const msg = JSON.stringify(data);
    for (const [id, { socket }] of this.sessions) {
      if (id !== excludeId && socket.readyState === WebSocket.OPEN) {
        socket.send(msg);
      }
    }
  }

  async reportToRegistry() {
    if (!this.roomId) return;
    try {
      const id = this.env.REGISTRY.idFromName("global");
      const registry = this.env.REGISTRY.get(id);
      await registry.fetch("https://internal/internal/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: this.roomId, online: this.sessions.size }),
      });
    } catch (e) {
      // Registry 호출 실패는 채팅 기능에 영향 주지 않도록 무시
    }
  }

  async checkIpBlocked(ip) {
    try {
      const id = this.env.REGISTRY.idFromName("global");
      const registry = this.env.REGISTRY.get(id);
      const res = await registry.fetch(`https://internal/internal/check-ip?ip=${encodeURIComponent(ip)}`);
      const data = await res.json();
      return data.blocked === true;
    } catch (e) {
      return false; // Registry 조회 실패 시 차단하지 않음 (가용성 우선)
    }
  }

  // ── 관리자에 의한 강제 종료 ──
  async killRoom() {
    this.broadcast({ type: "system", event: "kill", message: "관리자에 의해 방이 종료되었습니다." });
    for (const [, { socket }] of this.sessions) {
      try { socket.close(4000, "Room killed by admin"); } catch (e) {}
    }
    this.sessions.clear();
    this.verifyToken = null;
    await this.state.storage.delete("verifyToken").catch(() => {});
    await this.reportToRegistry();
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ── 내부: 관리자 콘솔의 kill 명령 ──
    if (request.method === "POST" && url.pathname === "/internal/kill") {
      await this.killRoom();
      return json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ online: this.sessions.size });
    }

    const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
    const nickname = decodeURIComponent(url.searchParams.get("nickname") || "익명");
    const roomId = url.searchParams.get("roomId") || "unknown";
    const verifyToken = url.searchParams.get("verifyToken") || "";
    this.roomId = roomId;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    // ── IP 차단 확인 ──
    const blocked = await this.checkIpBlocked(ip);
    if (blocked) {
      return new Response("Forbidden", { status: 403 });
    }

    // ── 비밀키 검증 토큰 확인 ──
    // 이 방에 처음 입장하는 사람이면 토큰을 "기준값"으로 저장(영속화).
    // 이후 입장자는 이 기준값과 일치해야만 WebSocket 업그레이드를 허용한다.
    // 서버는 토큰만 비교할 뿐, 실제 메시지를 복호화할 수 있는 키는 절대 모른다 (Zero-knowledge 유지).
    if (!verifyToken) {
      return new Response("Bad Request: verifyToken required", { status: 400 });
    }

    if (this.verifyToken === null) {
      // 영속 스토리지에서 기존 토큰 복원 시도 (DO가 재시작된 경우 대비)
      this.verifyToken = (await this.state.storage.get("verifyToken")) || null;
    }

    if (this.verifyToken === null) {
      // 첫 입장자: 토큰을 기준값으로 등록
      this.verifyToken = verifyToken;
      await this.state.storage.put("verifyToken", verifyToken);
    } else if (this.verifyToken !== verifyToken) {
      // 토큰 불일치: WebSocket을 일단 수락한 뒤 즉시 에러를 전달하고 명시적 코드로 닫는다.
      // (핸드셰이크 단계에서 그냥 403을 내려주면 브라우저 쪽 close 이벤트에 code가
      //  정확히 전달되지 않는 경우가 있어, 수락 후 즉시 닫는 방식이 더 안정적이다.)
      const { 0: rejectClient, 1: rejectServer } = new WebSocketPair();
      rejectServer.accept();
      rejectServer.send(JSON.stringify({ type: "error", code: "KEY_MISMATCH" }));
      rejectServer.close(4003, "Key mismatch");
      return new Response(null, { status: 101, webSocket: rejectClient });
    }

    // 방에 아무도 없어졌으면(전원 퇴장) 다음 입장자가 새 기준값을 설정할 수 있도록 리셋.
    // (sessions.size 가 0인 시점에 이 로직을 cleanup에서 처리함 — 아래 참고)

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.sessions.set(clientId, { socket: server, nickname, ip });

    this.broadcast({ type: "system", event: "join", nickname, online: this.sessions.size }, clientId);
    server.send(JSON.stringify({ type: "online", count: this.sessions.size }));

    await this.reportToRegistry();

    server.addEventListener("message", (event) => {
      // heartbeat ping에는 pong으로 응답하고, 중계 로직으로는 넘기지 않음
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
          return;
        }
      } catch (e) {
        // JSON 파싱 실패 시 일반 패킷으로 간주하고 그대로 중계
      }

      for (const [id, { socket }] of this.sessions) {
        if (id !== clientId && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      }
    });

    const cleanup = () => {
      this.sessions.delete(clientId);
      this.broadcast({ type: "system", event: "leave", nickname, online: this.sessions.size });
      this.reportToRegistry();

      // 방에 아무도 남지 않으면 비밀키 기준값을 리셋한다.
      // 그래야 같은 roomId라도 나중에 완전히 새로운 비밀키로 다시 시작할 수 있다.
      if (this.sessions.size === 0) {
        this.verifyToken = null;
        this.state.storage.delete("verifyToken").catch(() => {});
      }
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }
}

// ============================================================
// 메인 fetch 핸들러 (라우팅)
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    // ── 관리자 API ──
    if (url.pathname.startsWith("/admin/")) {
      if (!checkAuth(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const registryId = env.REGISTRY.idFromName("global");
      const registry = env.REGISTRY.get(registryId);

      // GET /admin/rooms
      if (request.method === "GET" && url.pathname === "/admin/rooms") {
        const res = await registry.fetch("https://internal/internal/rooms");
        return new Response(await res.text(), { headers: json({}).headers });
      }

      // GET /admin/stats
      if (request.method === "GET" && url.pathname === "/admin/stats") {
        const res = await registry.fetch("https://internal/internal/rooms");
        const data = await res.json();
        return json({
          totalRooms: data.totalRooms,
          totalConnections: data.totalConnections,
          timestamp: Date.now(),
        });
      }

      // POST /admin/rooms/:id/kill
      const killMatch = url.pathname.match(/^\/admin\/rooms\/([^/]+)\/kill$/);
      if (request.method === "POST" && killMatch) {
        const roomId = decodeURIComponent(killMatch[1]);
        const roomDoId = env.ROOMS.idFromName(roomId);
        const room = env.ROOMS.get(roomDoId);
        await room.fetch("https://internal/internal/kill", { method: "POST" });
        return json({ ok: true, killed: roomId });
      }

      // GET /admin/blocklist
      if (request.method === "GET" && url.pathname === "/admin/blocklist") {
        const res = await registry.fetch("https://internal/internal/blocklist");
        return new Response(await res.text(), { headers: json({}).headers });
      }

      // POST /admin/blocklist  { ip }
      if (request.method === "POST" && url.pathname === "/admin/blocklist") {
        const body = await request.json();
        if (!body.ip || typeof body.ip !== "string") {
          return json({ error: "ip가 필요합니다." }, 400);
        }
        const res = await registry.fetch("https://internal/internal/blocklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: body.ip.trim() }),
        });
        return new Response(await res.text(), { headers: json({}).headers });
      }

      // DELETE /admin/blocklist/:ip
      const blockDelMatch = url.pathname.match(/^\/admin\/blocklist\/(.+)$/);
      if (request.method === "DELETE" && blockDelMatch) {
        const ip = decodeURIComponent(blockDelMatch[1]);
        const res = await registry.fetch("https://internal/internal/blocklist/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip }),
        });
        return new Response(await res.text(), { headers: json({}).headers });
      }

      return json({ error: "Not found" }, 404);
    }

    // ── 기존 채팅 relay 라우트 ──
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Quiet Room relay is running.");
    }

    const roomId = url.pathname.replace(/^\/room\//, "").trim() || "default";

    // ── IP 차단 사전 확인 (Room DO 진입 전, 빠른 차단) ──
    const ip = getClientIp(request);
    try {
      const registryId = env.REGISTRY.idFromName("global");
      const registry = env.REGISTRY.get(registryId);
      const checkRes = await registry.fetch(`https://internal/internal/check-ip?ip=${encodeURIComponent(ip)}`);
      const checkData = await checkRes.json();
      if (checkData.blocked) {
        return new Response("Forbidden", { status: 403 });
      }
    } catch (e) {
      // Registry 조회 실패 시 통과 (가용성 우선)
    }

    // roomId를 쿼리에 추가해서 Room DO 가 자기 이름을 알 수 있게 전달
    const forwardUrl = new URL(request.url);
    forwardUrl.searchParams.set("roomId", roomId);
    const forwardRequest = new Request(forwardUrl.toString(), request);

    const id = env.ROOMS.idFromName(roomId);
    const room = env.ROOMS.get(id);
    return room.fetch(forwardRequest);
  },
};
