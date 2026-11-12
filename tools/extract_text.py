"""원본 게임 문장(root/ui/txt/*.dat)을 읽을 수 있는 텍스트로 풀어 낸다.

사용법 (Windows PowerShell):
    python tools/extract_text.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root" "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root_text"

결과는 저장소 밖(두 번째 인자 폴더)에 둔다. 원작 문장을 그대로 공개 저장소에 올리지 않기 위해서다.
게임 값의 근거로 쓸 때는 docs/design.md에 '원작 텍스트 txt_list #번호'처럼 줄 번호만 적는다.

파일 형식: 'utf-16<>\\n' + 개수(ASCII) + '<>\\n' 다음에 UTF-16LE 문장이 '<>\\n'(1바이트 문자 3개)으로 이어진다.
문장 안의 0x1B 문자는 강조 색 전환 표시이며 여기서는 '⎋'로 바꿔 쓴다.
"""
import sys
from pathlib import Path

FILES = ['txt_list_txt.dat', 'db_txt_list_txt.dat', 'help_text_txt.dat', 'mail_text_txt.dat']


def read_dat(path: Path) -> list[str]:
    parts = path.read_bytes().split(b'<>\n')
    assert parts[0] == b'utf-16', f'{path.name}: 알 수 없는 머리말 {parts[0][:10]!r}'
    out = []
    for p in parts[2:]:
        if len(p) % 2:
            p += b'\0'
        out.append(p.decode('utf-16-le', 'replace').replace('\x1b', '⎋').rstrip('\0'))
    return out


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'root'
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root.parent / 'root_text'
    out.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        lines = read_dat(root / 'ui' / 'txt' / name)
        target = out / name.replace('.dat', '.txt')
        target.write_text(''.join(f'{i}\t{s}\n' for i, s in enumerate(lines)), encoding='utf-8')
        print(f'{name}: {len(lines)}줄 -> {target}')


if __name__ == '__main__':
    main()
