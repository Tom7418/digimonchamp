"""원본 게임 안 화면 그림(아이콘·버튼·정보창)을 PNG로 복원한다 (web/assets/ui).

사용법 (Windows PowerShell):
    python tools/extract_ui.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

해석 방법은 extract_title.py의 screen()·cells()와 같다.
- ui/UI_Icon_training: 사육장 아래 도구 줄 아이콘 (손·고기·알약·똥·반창고·주사·케이지·뒤로, 어두운 판도 있음)
- ui/menu_main: 파란 메뉴 버튼, 정보 띠의 bit 글자, 편지 아이콘
- tamer_info: '테이머 정보'·'달성률' 화면 배경
- common/e001_ikusei: 회복 고리 6프레임(2번, 10틱씩)·회복 빛 7프레임(4번, 6틱씩), 강화 기운 10프레임(15번, 3틱씩), 똥 2프레임(26번, 18틱씩 반복), 빗자루 쓸기 2프레임(애니메이션 27번, 18틱씩 반복), 치운 뒤 반짝임 7프레임(32번, 9틱씩)
"""
from extract_title import ROOT, cells, screen

if __name__ == '__main__':
    icons = ['hand', 'meat', 'pill', 'poop', 'heal', 'shot', 'cage', 'back']
    cells(ROOT / 'ui/UI_Icon_training', {i + 1: f'icon_{n}' for i, n in enumerate(icons)}
          | {i + 11: f'icon_{n}_off' for i, n in enumerate(icons)})
    cells(ROOT / 'ui/menu_main', {0: 'btn_blue', 1: 'btn_blue_on', 71: 'label_bit', 73: 'icon_mail'})
    screen(ROOT / 'tamer_info/tamer_info_bg_sub', 'tamer_info')
    screen(ROOT / 'tamer_info/tamer_info_bg_main', 'achievement')
    # 원점(셀 0,0)이 그림 안의 같은 자리에 오도록 고정 틀: 빗자루 (16,28), 반짝임 (16,44)이 원점
    cells(ROOT / 'common/e001_ikusei', {8 + i: f'fx_ring_{i + 1}' for i in range(6)}, box=(-15, -29, 32, 32))  # 원점 (15,29)
    cells(ROOT / 'common/e001_ikusei', {17 + i: f'fx_heal_{i}' for i in range(7)}, box=(-16, -43, 32, 48))  # 원점 (16,43)
    cells(ROOT / 'common/e001_ikusei', {115 + i: f'fx_aura_{i + 1}' for i in range(10)}, box=(-20, -67, 40, 72))  # 원점 (20,67)
    # 머리 위 상태 말풍선 (애니메이션 6번의 셀): 부상·병·배고픔·스트레스(낙서)
    cells(ROOT / 'common/e001_ikusei', {30: 'bubble_injured', 31: 'bubble_sick', 34: 'bubble_hungry', 36: 'bubble_stress'})
    cells(ROOT / 'common/e001_ikusei', {137: 'poop_1', 138: 'poop_2'}, box=(-14, -19, 24, 24))  # 원점 (14,19)
    cells(ROOT / 'common/e001_ikusei', {139: 'broom_1', 140: 'broom_2'}, box=(-16, -28, 34, 34))
    cells(ROOT / 'common/e001_ikusei', {148 + i: f'sparkle_{i + 1}' for i in range(7)}, box=(-16, -44, 32, 48))
