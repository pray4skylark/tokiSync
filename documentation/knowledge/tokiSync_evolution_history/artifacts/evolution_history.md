# tokiSync Evolution History & Philosophy

이 문서는 프로젝트가 단순한 기능 추가를 넘어, 어떤 논리적 흐름으로 진화했는지 설명합니다. AI는 새로운 기능을 제안할 때 이 타임라인의 '논리적 흐름'을 준수해야 합니다.

## 🚀 Version Milestones

### v1.5 (UI/UX Foundation)
- **철학**: 사용자 경험의 시각적 완성도 확보.
- **핵심**: Vue.js 기반의 현대적 UI 프레임워크 도입. 테마 시스템(Sepia/Dark) 및 모바일 제스처 기초 확립.

### v1.6 (Performance Optimization)
- **철학**: 대규모 라이브러리 환경에서의 효율성 극대화.
- **핵심**: 'Fast Path' (File ID Tracking) 도입. 구글 드라이브 전체 스캔을 피하기 위한 캐시 가속화 로직 구현.

### v1.7 (Observability & Speed)
- **철학**: 개발 편의성 및 데이터 전송 안정성 확보.
- **핵심**: 'LogBox/Turbo' 도입. 디버깅 및 실시간 로그 모니터링 시스템 구축. 6분할 터보 다운로드 엔진 통합.

### v1.8 (Data Infrastructure Modernization)
- **철학**: 구조적 표준화 및 확장성 확보. (가장 중요한 변곡점)
- **핵심**: 'Drive API V3' 전면 마이그레이션 및 'GenericParser' 전환. 하드코딩된 파서 로직을 JSON 규칙 시스템으로 추상화.

### v1.9 (Refinement & UX Polishing)
- **철학**: 복잡해진 기능을 사용자 친화적으로 재구성.
- **핵심**: 'Tabbed UI' 도입. 모달 너비 520px 확장 및 소설 복호화 파이프라인의 최종 안정화.

---

## 🤖 [AI 지침]
새로운 기능을 제안하거나 수정할 때, 해당 작업이 어느 버전의 철학에 기여하는지 명시하십시오. 
- 예: "이 수정은 v1.8의 데이터 표준화 원칙을 따르며, v1.9의 UI 현대화 사양을 반영합니다."
