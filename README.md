# Champion Tamer (가제)

디지몬 챔피언쉽(NDS)의 육성·자동배틀 구조를 모티브로 한 비영리 팬게임.
원작의 ROM, 그림, 음원, 데이터는 쓰지 않으며 몬스터는 모두 오리지널이다.

## 실행
```
npm install
npm run dev      # 개발 서버
npm test         # 핵심 로직 테스트
npm run build    # dist/ 생성
```

## 구조
- `src/core/` 게임 규칙 (화면과 무관한 순수 로직): care, evolution, battle, save
- `src/data/` 몬스터·기술 데이터(JSON). 여기만 고치면 종을 추가할 수 있다
- `src/scenes/` Phaser 화면: Boot, Care(사육장), Battle
- `src/ui/` 버튼, 임시 그래픽 생성(art.ts)
- `docs/design.md` 기획 문서

## 진행 상황
- [x] 0 기획 / 1 세팅 / 2 육성 / 3 진화 / 4 자동 배틀
- [ ] 5 토너먼트 / 6 포획 미니게임 / 7 그래픽·사운드 / 8 런처 패키징
