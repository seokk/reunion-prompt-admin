# reunion-admin 프로젝트 분석 문서

## 1) 한눈에 보는 구조
- 프론트엔드: Next.js(App Router) + React 19 + Tailwind
- 백엔드: Firebase Cloud Functions(v2, callable)
- DB: Turso(libSQL)
- 배포 대상:
  - 정적 프론트: Firebase Hosting(`out`)
  - 서버 로직: Firebase Functions(`functions`)

루트와 Functions가 분리된 모노레포 형태이며, 데이터 조회는 프론트 서버 컴포넌트에서 직접 DB 접근, 데이터 수정은 Firebase callable function을 통해 처리합니다.

## 2) 디렉터리/파일 역할
- `app/layout.tsx`: 루트 레이아웃, 메타데이터 설정
- `app/page.tsx`: 메인 페이지 서버 컴포넌트, `prompt_types` + `prompt_versions` 조회 후 클라이언트 컴포넌트에 전달
- `app/prompts/manager.tsx`: 실제 UI/상태 관리(타입 선택, 버전 목록/검색/정렬, 팝업 편집, ACTIVE 지정, 버전 추가)
- `lib/db.ts`: 루트 런타임(Next)용 Turso 클라이언트 생성
- `lib/firebase.ts`: 브라우저 Firebase 앱/Functions 초기화
- `functions/src/index.ts`: callable 함수들(`createPromptVersion`, `setActivePromptVersion`, `updatePromptVersion` 등)
- `functions/src/db.ts`: Functions 런타임용 Turso 클라이언트 싱글톤
- `config.yml`: 루트 DB 접속 정보(현재 평문)
- `firebase.json`: Hosting/Functions 배포 설정
- `scripts/test-db.ts`: 로컬 DB 연결 확인 스크립트

## 3) 실행 흐름
### 3.1 초기 렌더링(조회)
1. 사용자가 `/` 접속
2. `app/page.tsx`(서버 컴포넌트)에서 `prompt_types`, `prompt_versions`를 각각 조회
3. `prompt_type_id` 기준으로 버전들을 타입에 매핑한 뒤 `PromptManager`에 전달
4. 브라우저에서 좌측 `Prompt Types` / 우측 `Prompt Versions` 관리 UI 렌더링

### 3.2 수정 저장(변경)
1. 좌측에서 `prompt_type` 선택 → 우측에 해당 `prompt_versions` 리스트 표시
2. 버전 행 더블클릭(또는 편집 버튼) → 팝업 에디터 열기
3. Save 클릭 시 `httpsCallable(functions, 'updatePromptVersion')` 호출
4. Functions에서 `prompt_versions.content` 업데이트
5. 성공 시 클라이언트 로컬 상태 즉시 반영

### 3.3 버전 관리(추가/ACTIVE)
1. `빈 버전 추가` 또는 `현재 버전 복사 추가` 클릭
2. `createPromptVersion` callable 호출 (`MAX(version)+1`로 신규 버전 생성)
3. 성공 시 리스트에 즉시 추가 후 자동 선택/편집 가능
4. `ACTIVE 지정` 클릭 시 `setActivePromptVersion` callable 호출
5. 동일 타입 내 ACTIVE 상태를 단일 버전으로 재정렬/반영

## 4) 설정/빌드/배포 포인트
- 루트 `package.json`
  - `npm run dev`: Next 개발 서버
  - `npm run build`: Next 빌드(`next build --webpack`)
  - `npm run start`: 프로덕션 서버 실행
  - `npm run test:db`: Turso 연결 테스트
- Functions `functions/package.json`
  - `npm run build`, `npm run deploy`, `npm run logs`
- `next.config.js` + `next.config.ts` 동시 존재
  - 둘 다 `output: 'export'` 설정
  - 실제 적용 파일 하나로 통일 필요
- `firebase.json`
  - Hosting 정적 경로 `out`
  - 모든 경로 `index.html` rewrite
  - Functions predeploy에 `lint`, `build` 포함
- Firebase Functions 배포 시 callable 신규 추가/수정이 있으면 `--only functions` 배포가 필수
- UI 변경 후 Hosting 반영 전에는 루트 `npm run build`로 `out` 갱신 필요

## 5) 코드 관점 진단(유지보수 핵심)
### 강점
- 프롬프트 타입/버전 운영 흐름이 UI에 반영되어 실사용 관리 시나리오와 맞음
- 버전 추가(빈/복사), ACTIVE 지정, 검색/정렬 등 운영 기능이 갖춰짐
- 모달 편집 기반으로 버전 목록 가독성 확보(리스트는 1줄 미리보기 중심)
- Functions DB 클라이언트 싱글톤으로 재사용성 양호

### 주의/리스크
1. 민감정보 노출 위험
- `config.yml`에 Turso 토큰이 평문 저장됨
- 리포 유출/공유 시 즉시 보안 이슈

2. 조회 경로 불일치 가능성
- 조회는 Next 서버(`lib/db.ts`), 수정은 Firebase Functions(`functions/src/db.ts`)
- 환경변수/권한 세팅이 서로 다르면 조회는 되고 수정이 실패(또는 반대)하는 드리프트 가능
- 실제 발생 사례:
  - 루트 `config.yml`의 `TURSO_AUTH_TOKEN`과 `functions/.env`의 토큰이 불일치
  - 조회는 정상, `createPromptVersion`는 Turso 404(`LibsqlError SERVER_ERROR 404`)로 실패

3. 정적 배포 전략과 서버컴포넌트 조회의 충돌 여지
- `output: 'export'`는 정적 export 지향
- 동시에 `app/page.tsx`가 서버에서 DB 조회하는 구조
- 배포 방식(완전 정적 vs 서버 런타임 제공)을 명확히 결정해야 안정적 운영 가능

4. 구성 파일 중복
- `next.config.js`와 `next.config.ts` 동시 존재
- 실제 적용 우선순위 혼선으로 디버깅 비용 증가

5. 문서/구현 불일치
- `blueprint.md`는 `/api/prompts` 기반 클라이언트 fetch 구조를 설명
- 현재 구현은 서버 컴포넌트 직접 조회 구조

6. callable 함수별 동작 차이로 인한 배포/브라우저 이슈 가능
- `updatePrompt` 호출에서 CORS preflight 문제가 발생한 이력이 있음
- 현재 프론트는 우회용 callable `updatePromptVersion` 사용 중
- Functions 수정 후 Hosting 번들이 구버전이면 브라우저에서 이전 callable을 계속 호출할 수 있음

## 6) 권장 정비 우선순위
1. 비밀키 즉시 교체/분리
- Turso 토큰 재발급
- 루트/Functions 모두 Secret Manager 또는 `.env*` 기반으로 분리
- Git에 비밀정보 커밋 금지 규칙 고정

2. 데이터 접근 아키텍처 단일화
- 선택 A: 조회/수정 모두 Functions(API) 경유
- 선택 B: 조회/수정 모두 Next 서버 액션/API 경유
- 현재처럼 이원화 시 운영 복잡도 증가
- 특히 Turso 인증정보를 루트/Functions 양쪽에서 따로 관리 중이라 드리프트 방지 체계 필요

3. 배포 전략 확정
- Firebase Hosting 정적 export 중심이면 조회도 클라이언트 API fetch로 정렬
- 서버 컴포넌트 DB 조회 유지하려면 정적 export 전략 재검토

4. 설정 파일 정리
- `next.config.*` 하나로 통일
- `README.md`를 실제 구조 기준으로 업데이트

5. 문서 싱크
- `blueprint.md`를 현재 코드와 일치하도록 갱신
- callable 이름(`updatePromptVersion` 등)과 실제 수정 대상 테이블(`prompt_versions`) 기준으로 문서 갱신

## 7) 신규 개발 시 권장 작업 규칙
- 변경 전 체크:
  - 조회/수정 경로 둘 다 영향을 받는지 확인
  - 배포 대상(Hosting/Functions) 중 어디를 건드리는지 명확히 기록
- 변경 후 체크:
  - `npm run test:db`
  - 루트 빌드 + Functions 빌드/배포 점검
  - 프롬프트 조회/수정 E2E 수동 점검
  - 확인 항목:
    - 버전 추가(빈/복사)
    - ACTIVE 지정
    - 버전 더블클릭/편집 팝업 열림
    - 팝업 저장 후 리스트 미리보기 갱신
- 문서 동기화:
  - 구조 변경 시 이 문서 + `blueprint.md` 동시 업데이트

## 8) 현재 코드 기준 핵심 엔트리포인트
- 프론트 진입: `app/page.tsx`
- 프론트 상호작용: `app/prompts/manager.tsx`
- 프론트 DB 조회 클라이언트: `lib/db.ts`
- 수정/버전관리 API: `functions/src/index.ts`의 `updatePromptVersion`, `createPromptVersion`, `setActivePromptVersion`
- Functions DB 클라이언트: `functions/src/db.ts`

## 9) 최근 작업 이력(요약)
- UI/UX:
  - `prompt_types` 좌측 / `prompt_versions` 우측 구조로 재편
  - 버전 리스트 1줄 미리보기 + 더블클릭/행 편집 아이콘으로 팝업 편집
  - 버전 검색/정렬(`ACTIVE 우선`, `최신`, `오름차순`) 추가
- 기능:
  - 버전 추가(빈 버전 / 현재 버전 복사) 구현
  - ACTIVE 버전 지정 구현
  - 미저장 변경사항 경고(confirm) 추가
- 안정화:
  - Functions lint `max-len` 에러 정리
  - Turso 토큰 불일치 문제 해결(`functions/.env` 동기화)
  - `updatePrompt` CORS 이슈 우회용 `updatePromptVersion` callable 도입
  - 편집 팝업 렌더링 문제 해결(현재 팝업 동작 상태)
