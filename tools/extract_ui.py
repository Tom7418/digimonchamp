"""원본 게임 안 화면 그림(아이콘·버튼·정보창)을 PNG로 복원한다 (web/assets/ui).

사용법 (Windows PowerShell):
    python tools/extract_ui.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

해석 방법은 extract_title.py의 screen()·cells()와 같다.
- ui/UI_Icon_training: 사육장 아래 도구 줄 아이콘 (손·고기·알약·똥·반창고·주사·케이지·뒤로, 어두운 판도 있음)
- ui/menu_main: 파란 메뉴 버튼, 정보 띠의 bit 글자, 편지 아이콘
- tamer_info: '테이머 정보'·'달성률' 화면 배경
"""
from extract_title import ROOT, cells, screen

if __name__ == '__main__':
    icons = ['hand', 'meat', 'pill', 'poop', 'heal', 'shot', 'cage', 'back']
    cells(ROOT / 'ui/UI_Icon_training', {i + 1: f'icon_{n}' for i, n in enumerate(icons)}
          | {i + 11: f'icon_{n}_off' for i, n in enumerate(icons)})
    cells(ROOT / 'ui/menu_main', {0: 'btn_blue', 1: 'btn_blue_on', 71: 'label_bit', 73: 'icon_mail'})
    screen(ROOT / 'tamer_info/tamer_info_bg_sub', 'tamer_info')
    screen(ROOT / 'tamer_info/tamer_info_bg_main', 'achievement')
