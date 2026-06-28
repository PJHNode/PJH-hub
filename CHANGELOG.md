# Changelog

All notable changes to PJH Hub will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Core Library 구축 (Auth, Crypto, Network, Storage, UI, Utils)
- Worker 분리 (Relay, Notice, Admin, API)
- JWT 인증 시스템
- Security Headers (CSP, X-Frame-Options, etc.)
- Input Validation (JSON Schema)
- Rate Limiting
- Durable Object Storage
- Key Verification Handshake
- Heartbeat/Ping-Pong
- Auto Reconnect
- Audit Logging
- UI Components (Toast, Modal, Dialog, Banner)
- Quiet Room ES Modules 리팩토링

### Changed
- 프로젝트 구조 재설계 (apps/, core/, workers/, shared/)
- 전역 변수 제거
- ES Modules 도입
- JSDoc 추가

### Security
- CORS 헤더 제한 (허용 도메인만 접근)
- Security Headers 추가
- Rate Limiting 추가
- Input Validation 추가
- Key Verification Handshake 추가
- JWT 인증 추가

## [1.0.0] - 2024-06-28

### Added
- Quiet Room 초기 버전
- AES-GCM 256-bit 암호화
- WebSocket 릴레이
- 파일 전송
- 다크 모드
- 로컬/릴레이 모드

### Security
- End-to-End Encryption
- No server-side storage
