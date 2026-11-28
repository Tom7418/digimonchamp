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
  // 장면별 기본 배경곡: ARM9 0x0207A2EC가 장면 번호([0x020C7F20])로 0x020BD710 표(4바이트: 시퀀스, 스트림)를 읽어 장면이 바뀔 때 튼다.
  // 장면 → 오버레이는 0x020BCAD0 표. 육성(장면3 = overlay18)·케이지 편집(장면6 = overlay15) SEQ_U_06, 상점(장면4 = overlay17) SEQ_U_21,
  // 도감(장면5 = overlay16) SEQ_U_02, 사냥터 선택(장면9 = overlay12) SEQ_N_03, 배틀 접수(장면11 = overlay10) SEQ_N_05.
  // 오버레이 정체는 각 오버레이가 여는 리소스 이름으로 확인: overlay21 movie/main.vx(오프닝 영상, 코드가 SEQ_N_00, 0x0210ECF4),
  // overlay13 title_menu(타이틀 메뉴, 장면8) SEQ_N_01, overlay2 winner_top_bg(챔피언십 우승, 장면21) SEQ_N_16,
  // overlay11 ending_bg(엔딩, 장면10) SEQ_N_13, overlay4 tamer_info·overlay5 help(장면19·17)는 육성과 같은 SEQ_U_06.
  sceneBgm: { farm: 'SEQ_U_06', cageEdit: 'SEQ_U_06', shop: 'SEQ_U_21', dex: 'SEQ_U_02', huntSelect: 'SEQ_N_03', battleEntry: 'SEQ_N_05', title: 'SEQ_N_01', opening: 'SEQ_N_00', champion: 'SEQ_N_16', ending: 'SEQ_N_13' },
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
    // 부화 overlay9_18 0x0211FE7C (알의 나이가 수명 60분을 넘거나 세 번 두드리면), 치료 연출 0x0211F564(성공)·0x0211F580(실패)
    // 공통 목록 메뉴(ARM9 0x020608D8): 항목을 고르면 UI_SE_005_1, 고른 항목 없이 닫거나 메시지 0x54(돌아가기)면 UI_SE_015_2,
    // 강조 칸이 바뀌면 UI_SE_005_2(음량 0x40, 0x02060604)
    menu: 'UI_SE_005_1', cancel: 'UI_SE_015_2', cursor: 'UI_SE_005_2',
    // 상점에서 값을 치르면 (overlay9_17 0x02111A1C~0x02111A60, 돈 +0x4C8에서 값 +0x1144를 뺀 뒤)
    buy: 'MENU_SE_078',
    // 하루 결과 창(overlay1 today_window, 장면15): 장면 표의 스트림 34. 육성 곡은 장면을 나갈 때 멈춘다(+0x8000)
    dayEnd: 'STRM_JINGLE_ME_S_003_MIX',
    hatch: 'TRAINING_SE_072_1', care: 'DIGI_SE_102', careFail: 'TRAINING_SE_006_3',
    // 청소: 더러운 것 객체 overlay9_18 0x0210EA78(치우는 동작 0x1B 시작)에서 028_2, 20프레임 뒤 메시지 0x82 → 케이지가 0x8D(치움) 방송(0x0210F728)
    clean: 'TRAINING_SE_028_2',
    // 로프: 선 긋기 객체 overlay9_0 상태3(0x02117E40)이 감싼 디지몬마다 메시지 0x23을 보내며 023_3 (0x02117F6C)
    rope: 'HUNT_SE_023_3',
    // 포획: 야생 상태12 진입(0x0211553C)이 장면 관리자에 0x20 → 관리자 상태3 진입(0x0211AEA4)에서 스트림 30
    capture: 'STRM_JINGLE_ME_S_002_3',
    // 기절: 야생 상태10 진입(0x02114CB8, 동작 0xF·밀려남). 로프에 묶인 채 HP가 0이 되면(0x02114424) 이 상태로 간다
    faint: 'HUNT_SE_002',
    // 타이틀 메뉴(overlay13)는 공통 터치 버튼(ARM9 0x0208D4B0·0x0208DA78)을 쓴다: 누르면 UI_SE_005_1
    start: 'UI_SE_005_1',
  },
  // 반복음: 사냥에서 선을 긋는 동안 overlay9_0 0x02117D78
  loops: { draw: 'HUNT_LOOP_DRAW_LOOP' },
};
