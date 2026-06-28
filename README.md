# PJH Hub

Zero-Knowledge Platform powered by Cloudflare Workers

## Overview

PJH Hub는 확장 가능한 Zero-Knowledge 플랫폼입니다. 현재 다음 앱들을 제공합니다:

- **Quiet Room**: End-to-end 암호화 채팅방
- *Quiet Board*: (예정)
- *Quiet Share*: (예정)
- *Quiet Vault*: (예정)
- *Quiet Note*: (예정)
- *Quiet Password*: (예정)
- *Quiet Vote*: (예정)

## Features

### Security
- **End-to-End Encryption**: AES-GCM 256-bit
- **Key Verification Handshake**: 입장 시 키 검증
- **No Server Storage**: 서버는 암호화된 패킷만 중계
- **JWT Authentication**: 관리자 인증
- **Security Headers**: CSP, X-Frame-Options, etc.
- **Rate Limiting**: DoS 방지
- **Input Validation**: JSON Schema 검증

### Architecture
- **Core Library**: 재사용 가능한 모듈 (Auth, Crypto, Network, Storage, UI, Utils)
- **Worker Separation**: Relay, Notice, Admin, API Worker 분리
- **Durable Objects**: 세션 지속성
- **ES Modules**: 모던 JavaScript
- **TypeScript Ready**: JSDoc 포함

### Performance
- **WebSocket**: 실시간 통신
- **Heartbeat/Ping-Pong**: 연결 유지
- **Auto Reconnect**: 자동 재연결
- **Compression**: Brotli (예정)
- **Cache API**: 캐싱 (예정)

## Project Structure

```
PJH-Hub/
├── apps/               # 애플리케이션들
│   └── quiet-room/    # Quiet Room 앱
├── core/              # Core Library
│   ├── auth/          # 인증 모듈
│   ├── crypto/        # 암호화 모듈
│   ├── network/       # 네트워크 모듈
│   ├── storage/       # 스토리지 모듈
│   ├── ui/            # UI 컴포넌트
│   └── utils/         # 유틸리티
├── workers/           # Cloudflare Workers
│   ├── relay/         # Relay Worker
│   ├── notice/        # Notice Worker
│   ├── admin/         # Admin Worker
│   └── api/           # API Worker
├── shared/            # 공유 모듈
│   ├── constants/     # 상수
│   └── validation/    # 입력 검증
├── scripts/           # 빌드/배포 스크립트
├── tests/             # 테스트
├── docs/              # 문서
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- Wrangler (Cloudflare Workers CLI)
- Cloudflare Account

### Installation

```bash
# Clone repository
git clone https://github.com/PJHNode/PJH-hub.git
cd PJH-hub

# Install dependencies
npm install

# Install Wrangler
npm install -g wrangler
```

### Configuration

```bash
# Wrangler 로그인
wrangler login

# 환경 변수 설정
wrangler secret put ADMIN_PASSWORD_HASH
wrangler secret put PASSWORD_SALT
wrangler secret put JWT_SECRET
```

### Development

```bash
# 로컬 개발 서버 시작
npm run dev

# Relay Worker 개발
cd workers/relay
wrangler dev

# Notice Worker 개발
cd workers/notice
wrangler dev

# Admin Worker 개발
cd workers/admin
wrangler dev
```

### Deployment

```bash
# 전체 배포
npm run deploy

# 개별 Worker 배포
cd workers/relay
wrangler deploy

cd ../notice
wrangler deploy

cd ../admin
wrangler deploy
```

## Apps

### Quiet Room

End-to-end 암호화 채팅방

**Features:**
- AES-GCM 256-bit 암호화
- Key Verification Handshake
- 파일 전송 (이미지, PDF, 텍스트, ZIP)
- 다크 모드
- 로컬/릴레이 모드
- 자동 재연결

**Usage:**
1. 방 ID와 비밀키 생성
2. 비밀키를 앱 밖에서 공유
3. 초대 링크 전송
4. 대화 시작

## API

### Relay Worker

```
WebSocket: wss://your-worker.workers.dev/room/{roomId}
HTTP GET: /room/{roomId} (접속자 수 조회)
```

### Notice Worker

```
GET /notices - 공지사항 목록
POST /notices - 공지사항 생성 (인증 필요)
DELETE /notices/:id - 공지사항 삭제 (인증 필요)
```

### Admin Worker

```
POST /admin/login - 관리자 로그인
GET /admin/rooms - 방 목록
POST /admin/rooms/:id/kill - 방 종료
GET /admin/logs - 감사 로그
GET /admin/stats - 통계
GET /admin/blocklist - 차단 목록
POST /admin/blocklist - 차단 추가
```

## Security

### Encryption
- AES-GCM 256-bit
- PBKDF2 (200,000 iterations)
- Key Verification Handshake

### Authentication
- JWT (HMAC-SHA256)
- Session Tokens
- Rate Limiting

### Headers
- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Strict-Transport-Security

### Rate Limiting
- Messages: 10/minute
- Files: 3/minute
- Notices: 5/hour
- Admin API: 30/minute

## Contributing

기여를 환영합니다! [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

## License

MIT License - [LICENSE](LICENSE)를 참조하세요.

## Changelog

변경 사항은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.

## Contact

- GitHub: [PJHNode/PJH-hub](https://github.com/PJHNode/PJH-hub)
- Issues: [GitHub Issues](https://github.com/PJHNode/PJH-hub/issues)

## Acknowledgments

- Cloudflare Workers
- Web Crypto API
- BroadcastChannel API
