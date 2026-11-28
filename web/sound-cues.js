'use strict';

// 원작 사운드 대응표 (docs/sound-handoff, 이름은 sound_data.sdat의 SYMB 이름).
// 음원 파일은 저장소에 없다. web/assets/audio/manifest.js에 이름 → 파일을 적으면 그 소리를 쓰고,
// 없으면 game-audio.js의 웹판 합성음(효과음)·사냥 합성 환경음을 그대로 쓴다.
window.ORIGINAL_SOUND_CUES = {
  sdatSha256: '2aa95452bd2a917a19fcf5fbf673e942eda59d5dcef162b82a53e46ed0670ddd',
  // 사냥터 배경곡: ARM9 0x020CA010 88바이트 행의 첫 값(지도 인덱스 = 사냥터×2 + 밤), overlay9_0 0x0211A170에서 재생.
  // 낮·밤 지도의 곡이 같아 밤이 되어도 곡을 이어서 튼다.
  huntBgm: {
    '다이나 초원': 'SEQ_N_06', '대초원': 'SEQ_N_06', '모쥬라의 숲': 'SEQ_U_13', '부츠 정글': 'SEQ_N_07',
    '미끌미끌 늪': 'SEQ_N_07', '암반 계곡': 'SEQ_U_10', '파도치는 해변': 'SEQ_U_08', '크롬 광산': 'SEQ_N_08',
    '기계 공장': 'SEQ_N_08', '하수도': 'SEQ_N_08', '눈의 왕국': 'SEQ_U_12', '바위산': 'SEQ_U_10',
    '용암지대': 'SEQ_U_10', '이글이글 사막': 'SEQ_U_11', '오아시스': 'SEQ_U_13', '잉카 유적': 'SEQ_U_12',
  },
  // 배틀 맵 번호(0~10)별 배경곡: overlay9_19 0x021134B8~0x0211359C (배틀 객체 +0x1F0 = 맵 번호)
  battleBgm: ['SEQ_N_09', 'SEQ_U_15', 'SEQ_N_11', 'SEQ_U_15', 'SEQ_U_16', 'SEQ_N_11', 'SEQ_N_04', 'SEQ_U_16', 'SEQ_N_10', 'SEQ_N_10', 'SEQ_N_12'],
  // 결과 화면 배경곡: overlay9_8 0x02110668~0x021106F4. 이번 경기들을 모두 이겼으면 15, 하나라도 졌으면 14 (+0xCAC 승패 배열)
  resultBgm: { won: 'SEQ_N_15', lost: 'SEQ_N_14' },
  // 효과음: 웹판 이름 → 원작 이름
  effects: {
    // 섭취 overlay9_18 0x0211BC04: 세대(종 표 +0xC) 3 이하 027_4, 4 이상 027_2, 프로틴 027_3
    feed: 'TRAINING_SE_027_4', feedLarge: 'TRAINING_SE_027_2', protein: 'TRAINING_SE_027_3',
    // 사냥 샷 overlay9_0 0x02125F2C·0x02125F54(일반·연사), 0x02125E2C(산탄)
    shot: 'HUNT_SE_039_7', spread: 'HUNT_SE_039_9',
    // 진화 연출 시작 overlay9_18 0x0211E8AC·0x0211F6A0 (진화 대상 +0x1E8이 있을 때)
    evolution: 'STRM_TRAINING_029_1',
    // 결과 화면 overlay9_8: 타이틀을 새로 얻으면(+0x810 문구 0x67E) 0x021111F0, 랭크가 오르면(+0x804) 0x021118A4
    medal: 'STRM_JINGLE_ME_S_011', rankUp: 'STRM_JINGLE_ME_S_010',
    // 병·부상이 날 때 overlay9_18 0x021187B4(스트레스 100 → 병), 0x0211D68C(훈련 뒤 부상)
    sick: 'DIGI_SE_032_4',
  },
  // 반복음: 사냥에서 선을 긋는 동안 overlay9_0 0x02117D78
  loops: { draw: 'HUNT_LOOP_DRAW_LOOP' },
};
