# Contributing to PJH Hub

기여해 주셔서 감사합니다! PJH Hub에 기여하는 방법을 안내합니다.

## Code of Conduct

- 존중과 친절하게 대하세요
- 건설적인 피드백을 제공하세요
- 타인의 코드를 존중하세요

## How to Contribute

### Reporting Bugs

버그를 발견하면 [GitHub Issues](https://github.com/PJHNode/PJH-hub/issues)에 등록해주세요:

- 제목: 명확하고 간결하게
- 설명: 버그 재현 방법
- 환경: OS, 브라우저, Node.js 버전
- 스크린샷: 가능한 경우

### Suggesting Enhancements

기능 제안은 [GitHub Issues](https://github.com/PJHNode/PJH-hub/issues)에 등록해주세요:

- 제목: 기능 설명
- 설명: 기능의 필요성과 사용 사례
- 대안: 이미 존재하는 해결책

### Pull Requests

1. Fork repository
2. Feature branch 생성: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Pull Request 생성

### Coding Standards

- **ES Modules**: 모든 파일은 ES Modules로 작성
- **JSDoc**: 모든 함수에 JSDoc 주석 추가
- **SOLID**: 단일 책임 원칙 준수
- **Naming**: camelCase (변수/함수), PascalCase (클래스)
- **Formatting**: 일관된 들여쓰기 (2 spaces)

### Code Structure

```
// 파일 상단 주석
/**
 * Module 설명
 * @module path/to/module
 */

// Import
import { something } from './path.js';

// Export
export function myFunction() {
  // 구현
}
```

### Testing

테스트를 작성해주세요:

```javascript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule.js';

describe('myFunction', () => {
  it('should do something', () => {
    expect(myFunction()).toBe('expected');
  });
});
```

### Documentation

문서를 업데이트해주세요:

- README.md: 새로운 기능 설명
- CHANGELOG.md: 변경 사항 기록
- JSDoc: 코드 주석

## Development Workflow

1. Issue 생성 (버그/기능)
2. Discussion (설계 논의)
3. Branch 생성
4. 개발
5. 테스트
6. Pull Request
7. Code Review
8. Merge

## Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/)를 따르세요:

```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: update build
```

## Review Process

Pull Request는 최소 1명의 승인이 필요합니다:

- 코드 품질
- 테스트 커버리지
- 문서 업데이트
- 보안 검토

## License

기여한 코드는 MIT License로 라이선스됩니다.

## Questions?

[GitHub Discussions](https://github.com/PJHNode/PJH-hub/discussions)에 질문하세요.
