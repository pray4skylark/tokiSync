# 📜 TokiSync Update History

## [Client] tokiSyncScript.js
| Version | Date | Changes |
| :--- | :--- | :--- |
| **v1.7.3** | 2025-12-01 | - **[Refactor]** 업데이트 확인 로직 개선 (XHR -> Iframe DOM 파싱)으로 정확도 향상 |
| **v1.7.2** | 2025-12-01 | - **[New]** 업데이트 확인 결과를 서버(`library_index.json`)에 저장하는 기능 추가 |
| **v1.7.1** | 2025-12-01 | - **[Fix]** 업데이트 확인 시 `last_episode` 변수명 불일치 버그 수정 (0화인 작품도 체크하도록 개선) |
| **v1.7.0** | 2025-12-01 | - **[New]** 전체 라이브러리 업데이트 확인 기능 추가<br>- **[Fix]** TokiView 최적화를 위한 메타데이터(last_episode, file_count) 전송 로직 추가 |
| **v1.6.2** | 2025-12-01 | - **[New]** 누락 파일 로그(`!MISSING_FILES_LOG.txt`) 생성 기능<br>- **[New]** 디버그 모드 및 대시보드 연동 메뉴 추가<br>- **[Perf]** 이미지 병렬 다운로드(Batch) 적용 |
| **v1.2.1** | 2025-11-XX | - **[Fix]** 오디오 인터페이스(AudioContext) 백그라운드 생존 기술 적용 |

## [Server] TokiSync (API)
| Version | Date | Changes |
| :--- | :--- | :--- |
| **v1.1.0** | 2025-12-01 | - **[New]** `get_library` API 추가 (라이브러리 인덱스 조회)<br>- **[Update]** `save_info` 시 `last_episode`, `file_count` 저장하도록 스키마 확장 |
| **v1.0.0** | 2025-11-XX | - 초기 릴리즈 (업로드, 이어올리기, 히스토리 확인) |

## [Server] TokiView (Dashboard)
| Version | Date | Changes |
| :--- | :--- | :--- |
| **v1.0.0** | 2025-12-01 | - **[Initial]** 대시보드 웹 앱 런칭<br>- **[Perf]** `library_index.json` 캐싱 및 SSR 적용<br>- **[Perf]** `info.json` 메타데이터 우선 읽기로 스캔 속도 최적화 |
