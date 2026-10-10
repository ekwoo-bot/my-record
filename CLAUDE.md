# 나의 기록 — 작업 안내 (Claude용)

성인이 된 이후의 경험을 기록하고 취업할 때 이력으로 활용하는 개인용 웹앱.
주로 휴대폰 홈 화면 앱(PWA)으로 사용한다.

- 배포 주소: https://ekwoo-bot.github.io/my-record/
- 저장소: https://github.com/ekwoo-bot/my-record (공개, `main` 브랜치 → GitHub Pages가 루트에서 바로 배포)

## 사용자와 일하는 방식
- 사용자는 코딩을 모르는 대학생이다. 모든 설명은 **한국어로, 초보자 눈높이로 짧게** 한다. 무엇을 왜 하는지 함께 말한다.
- 기능은 한 번에 다 만들지 말고 단계로 나눈다. 단계마다:
  1. 만들고 → 브라우저에서 직접 확인하는 방법(체크리스트)을 알려 준다.
  2. 사용자가 "확인했어"라고 하면 그때 **한국어 메시지로 커밋**한다. 예: `9단계: ○○ 기능 추가`
  3. **GitHub에 올리기(push)는 사용자에게 한 번 확인받고** 한다. 올리면 1~2분 뒤 휴대폰 앱에 반영된다.
- 화면의 모든 글자는 한국어로 쓴다.
- 커밋 작성자 이메일은 GitHub noreply 주소로 설정되어 있다(`git config user.email`). 개인 이메일을 커밋이나 파일에 넣지 않는다.

## 기술 규칙
- HTML, CSS, JavaScript만 쓴다. 프레임워크와 빌드 도구는 쓰지 않는다.
- JS는 `<script>` 태그로 순서대로 불러오는 일반 스크립트다(모듈 아님). 그래야 `index.html`을 더블클릭(file://)해도 동작한다. 파일끼리는 전역 함수와 변수로 서로 부른다.
  - 불러오는 순서: `db.js → backup.js → attachments.js → storage.js → tags.js → moments.js → periods.js → app.js`
- 데이터는 서버 없이 브라우저의 IndexedDB(`my-record-db`)에 저장한다.
- 사용자가 쓴 글은 항상 `textContent`로 화면에 넣는다. `innerHTML`은 쓰지 않는다.
- 코드 주석은 한국어로 짧게 단다(기존 코드와 같은 분위기로).

## 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 뼈대. 메인 리스트, 입력 시트(이력·빠른 메모·순간·기간), 설정 화면, 사진 뷰어 |
| `css/style.css` | 모바일 우선 스타일. 색은 `:root` 변수 |
| `js/db.js` | IndexedDB 열기/업그레이드, 저장소별 읽기·쓰기 함수 |
| `js/backup.js` | 백업 JSON 내보내기(공유 창/다운로드)·불러오기, 불러오기 전 상태 보관, 30일 알림 |
| `js/attachments.js` | 사진 압축(긴 쪽 1600px JPEG), 10MB 제한, 링크, 입력 창의 첨부 편집기(`createAttachmentEditor`) |
| `js/storage.js` | 저장 공간 사용량(80% 경고), 영구 저장(`navigator.storage.persist`) |
| `js/tags.js` | 역량 태그(기본 7개 + 직접 만든 태그), 태그 고르기, 검색(`matchesQuery`) |
| `js/moments.js` | "의미 있는 순간" 탭 |
| `js/periods.js` | 기간 관리, 기간별/연도별 묶어 보기(`appendItems`) |
| `js/app.js` | 이력 리스트, 입력 창, 빠른 메모, STAR, 필터, 탭, 설정 화면, 시작(`init`), 서비스 워커 등록 |
| `sw.js` | 오프라인 지원. 네트워크 우선이고, 실패하면 캐시를 쓴다 |
| `manifest.webmanifest`, `icons/` | 홈 화면 앱 정보와 아이콘 |

## 데이터 구조 (IndexedDB, 현재 버전 6)
- `records`: `{ id, title, startDate, endDate, category, content, star:{s,t,a,r}, tags:[], important, isDraft, createdAt, updatedAt }`
  - 하루짜리는 `endDate === startDate`, 진행 중이면 `endDate === ""`
- `moments`: `{ id, date, title, thoughts, createdAt, updatedAt }`
- `attachments`: `{ id, ownerId, kind:'file'|'link', name, type, size, blob | url, createdAt }`. `ownerId` 색인으로 이력과 순간에 연결된다.
- `tags`: 직접 만든 태그 `{ name, createdAt }` (기본 태그는 코드 상수 `DEFAULT_TAGS`)
- `periods`: `{ id, name, startDate, endDate, createdAt }`
- `meta`: 기기별 설정(`lastBackupAt`, `preImportSnapshot`). 백업에 넣지 않는다.

## 변경할 때 꼭 지킬 것
- **새 저장소나 색인이 필요하면** `DB_VERSION`을 1 올리고, `onupgradeneeded`에 `if (oldVersion < N) { ... }` 블록을 **추가만** 한다. 기존 블록은 고치지 않는다(사용자 데이터 보호).
- 백업 대상 저장소를 추가하면 `DATA_STORES`에도 넣는다. 불러오기 확인 문구의 개수 표시(`backup.js`)도 같이 확인한다.
- 예전 데이터에는 새 필드가 없을 수 있다. 읽을 때 기본값으로 처리한다(예: `getStar()`, `record.tags || []`).
- **새 JS/CSS 파일을 만들면** `index.html`의 script 순서와 `sw.js`의 `APP_FILES`에 추가하고, `CACHE_NAME` 버전을 올린다.
- 날짜는 `"YYYY-MM-DD"` 문자열로 저장하고, 화면에는 `formatDate()`로 `YYYY.MM.DD`로 보여 준다.

## 확인(테스트) 방법
- 문법 검사: `node --check js/*.js sw.js`
- 동작 확인: 필요하면 headless Chrome을 DevTools 프로토콜로 조작해서 확인한다.
  - 프로필 폴더(`--user-data-dir`)는 **짧고 평범한 경로**를 쓴다(예: `%TEMP%\pwaprof`). 대시가 많이 들어간 긴 경로에서는 Cache Storage가 "Entry already exists" 오류를 냈다.
  - 서비스 워커는 http(s)에서만 동작하므로 작은 로컬 서버로 확인한다.
  - 테스트가 끝나면 테스트용 Chrome 프로세스와 임시 프로필을 정리한다.

## 나중에 해 볼 수 있는 아이디어 (사용자가 보류함)
- 직접 만든 달력: PC Chrome 기본 달력에서 스크롤로 달이 바뀌어도 위의 달 표시가 안 바뀌는 문제. 휴대폰 기본 달력은 사용자가 만족해서 보류했다.
