"""원본 ui/cage_shop_icon_main.*에서 케이지 아이콘 36개를 추출한다.

사용: python tools/extract_cage_icons.py --source-root 원본_root_폴더
4bpp 디지몬과 다른 8bpp 아이콘도 공용 Nitro 디코더에서 처리한다.
"""
import argparse
from pathlib import Path
import extract_sprites as decoder

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    decoder.ROOT = args.source_root.resolve()
    decoder.OUT.mkdir(parents=True, exist_ok=True)
    metadata = decoder.extract('cage_shop_icon', 'ui')
    assert (metadata['width'], metadata['height'], metadata['frames']) == (64, 48, 36)
    print('원본 케이지 아이콘 36개 변환 완료: web/assets/cage_shop_icon.png')
