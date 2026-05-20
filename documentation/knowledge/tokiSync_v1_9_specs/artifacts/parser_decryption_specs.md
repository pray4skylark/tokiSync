# TokiSync Dynamic Parser & Novel Decryptor

TokiSync는 사이트의 구조 변경에 유연하게 대응하기 위해 데이터 추출 논리를 JSON 룰로 분리하고, 강력한 암호화가 적용된 소설 콘텐츠를 실시간 복호화합니다.

---

## 1. GenericParser & JSON Rules
`GenericParser`는 하드코딩된 추출 로직 없이 `toki_parser_rules.json`에 정의된 룰을 따라 DOM을 분석합니다.

### 핵심 기능
- **Selector-Attribute Mapping**: 단순 선택자뿐만 아니라 특정 속성(`attr`) 추출 및 정규식(`regex`) 후처리 지원.
- **Dynamic Key Discovery**: 
  - 사이트가 `data-xxxx` 형태의 동적 속성명을 사용할 경우, 인라인 스크립트에서 정규식으로 해당 키를 실시간 추출하여 적용.
  - *Code*: `_detectDynamicKey(doc, config)`
- **Headless Regex Fallback**: DOM에 렌더링되지 않은 이미지 URL(Next.js 페이로드 등)을 전체 HTML 소스에서 정규식으로 직접 추출.

## 2. Novel Decryption Pipeline
보안이 걸린 소설 콘텐츠를 복호화하여 순수 텍스트로 변환하는 5단계 프로세스입니다.

1.  **Token Extraction**: HTML 소스 내 특정 변수(예: `__token`)에서 암호화된 시드 추출.
2.  **Proof Generation**: 시드와 유저 세션 정보를 결합하여 `HMAC-SHA256` 기반의 검증 증명(Proof) 생성.
3.  **API Verification**: 생성된 증명을 API 엔드포인트로 전송하여 복호화 키(Key) 획득.
4.  **XOR Decryption**: 획득한 키를 사용하여 Base64 인코딩된 바이너리 데이터를 `XOR` 연산으로 복구.
5.  **Cleaning**: 복구된 텍스트에서 불필요한 메타데이터와 시스템 태그를 정규식으로 제거.

## 3. Crawler Protection Bypass
- **Agile Sleep Policy**: 다운로드 중 403/429 에러 발생 시 대기 시간을 동적으로 연장 (v1.9 기준 5단계 티어 적용).
- **Referer & Origin Control**: `GM_xmlhttpRequest`를 사용하여 브라우저의 보안 정책을 우회하고 사이트가 요구하는 헤더를 완벽하게 모방.

---

> [!IMPORTANT]
> **Security Note**: 소설 복호화 키는 절대 로컬 스토리지에 영구 저장하지 않으며, 메모리 상에서만 활용 후 즉시 폐기하여 보안 정책을 준수합니다.
