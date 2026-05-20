# TokiSync Development Standards & Evolution

TokiSync는 장기적인 유지보수와 프리미엄 사용자 경험을 위해 엄격한 디자인 및 개발 표준을 유지합니다.

---

## 1. UI/UX Design System (The Premium Feel)
모든 UI 요소는 Antigravity의 프리미엄 미학 기준을 따릅니다.

- **Layout**: 
  - 모달 기본 너비: **520px** (콘텐츠 집중도 극대화).
  - 테두리 곡률: **24px ~ 48px** (부드러운 곡선 적용).
- **Aesthetics**: 
  - **Glassmorphism**: `backdrop-blur-xl`과 저채도 반투명 배경(`bg-zinc-900/40`) 필수 사용.
  - **Micro-animations**: 상태 변화 시 `transition-all duration-300` 이상의 부드러운 전환 효과 적용.
- **Typography**: 가독성을 위해 `font-black`과 `tracking-widest`를 조합한 대문자 레이블 활용.

## 2. Coding Conventions
- **GAS (Backend)**:
  - 전역 스코프에서는 반드시 **`var`** 사용 (V8 TDZ 이슈 방지).
  - 모든 파일 상단에 `@file`, `@description`, `@version` 명시.
- **Vue (Frontend)**:
  - 컴포넌트 로직은 가능한 **Composables**(`useStore`, `useProgressMarker` 등)로 분리하여 재사용성 확보.
  - 반응성 데이터는 `ref`와 `computed`를 명확히 구분하여 사용.

## 3. Evolution History (Milestones)
- **v1.5**: 초기 아키텍처 정립 및 `Base64` 이미지 처리 도입.
- **v1.7**: **EBHJ** 엔진 탑재 및 다운로드 속도 700% 가속.
- **v1.8**: **Drive API v3** 전면 전환 및 **Viewer V2** (Locator System) 도입.
- **v1.8.3**: 소설 TXT 포맷 지원 및 API 기반 복호화 안정화.
- **v1.9 (Current)**: 탭 기반 통합 UI 모던화 및 **Dynamic Parser Rules** 시스템 완성.

## 4. Future Roadmap (Maintenance)
- **Code Pruning**: `downloader.js` 내의 중복된 정규표현식 로직을 `GenericParser`로 완전 이관.
- **Security**: OAuth 토큰 발급 및 사용 주기 단축을 통한 보안 강화.
- **Performance**: 대용량 라이브러리 로딩 시 가상 스크롤(Virtual Scroll) 최적화.

---

> [!IMPORTANT]
> **Core Value**: TokiSync의 코드는 단순한 기능 구현을 넘어, 읽기 쉽고 아름다운 구조를 유지해야 합니다. (Simplicity First & Surgical Changes 준수)
