# 작업 안내 (Codex · Claude Code 공용)

이 저장소는 NDS 「디지몬 챔피언십」(2008)의 시스템을 브라우저로 옮기는 비공식 비영리 팬게임이다.
Codex와 Claude Code가 번갈아 작업하므로 아래 규칙을 지킨다.

## 먼저 읽을 것
- `docs/roadmap.md` — 현재 진행 상태와 다음에 할 일 (작업을 마치면 갱신)
- `docs/design.md` — 원작 규칙, 플레이 영상으로 확인한 값, 임시 값 표, 아직 없는 기능
- `README.md` — 실행·배포 방법과 파일 구조

## 구조
- `src/core/` 규칙 엔진 (TypeScript, 화면 코드 없음). 사육·진화·배틀·타이틀·상점·사냥 규칙은 여기에만 둔다.
- `src/data/evolutions.txt` 220여 종 진화표 (한 줄에 한 종, 조건 DSL)
- `web/` 실제 배포되는 화면 (빌드 없는 바닐라 JS)
  - `game.js` 화면 그리기·입력·저장. 규칙은 직접 계산하지 말고 `ChampCore`(web/core.js) 함수를 호출한다.
  - `core.js` `src/core` 빌드 결과. **직접 수정 금지** — `npm run build:core`로 다시 만든다.
  - `cage-layout.js`, `cage-editor.js` 육각 케이지 배치·편집
  - `assets/` 원본에서 변환한 스프라이트 (`tools/extract_sprites.py`)
- `src/scenes/` 예전 Phaser 화면. 배포하지 않으며 사냥(HuntScene) 이식 때 참고용.

## 작업 순서
1. 시작 전에 `git pull`로 최신 main을 받는다. 다른 도구가 같은 파일을 고치고 있을 수 있다.
2. 규칙을 바꾸면 `src/core`를 고치고 `tests/core.test.ts`에 테스트를 추가한 뒤 `npm run build:core`.
3. 확인: `npm test` (vitest + node:test), `npx tsc --noEmit`, `python tools/check_web.py`
4. 커밋 메시지는 한국어로, 무엇을 왜 바꿨는지 쓴다. main에 푸시하면 GitHub Actions가 테스트 → core.js 빌드 → Pages 배포를 한다.
5. 작업을 마치면 `docs/roadmap.md`의 상태와 다음 할 일을 갱신한다.
6. 원작 수치를 새로 확인했거나 임시 값을 정했으면 `docs/design.md` 표에 근거(영상·위키·임시)와 함께 적는다.

## 규칙
- 원작에서 확인한 값과 임시로 정한 값을 섞지 말고 주석이나 문서에 구분해 둔다.
- 환경: Windows + VS Code 우선. PowerShell 명령은 Windows 문법으로 쓴다.
- 원본 게임 파일(ROM 등)은 저장소에 올리지 않는다. 변환한 PNG만 `web/assets`에 둔다.
- 저장 형식(`localStorage` 키 `champion-web-v2`)을 바꾸면 기존 저장 데이터 이전 방법을 함께 만든다.
