"""ROOT/common의 원본 아이템 셀에서 UI·바닥용 도트를 추출한다 (표준 라이브러리만 사용)."""
import argparse
from pathlib import Path
import extract_sprites as sprites

def extract_items(source_root, output):
    sprites.ROOT = source_root.resolve()
    captured = []
    write_png = sprites.png
    # 셀 디코더의 RGBA 결과를 받아 필요한 프레임만 잘라 낸다. 원본 파일은 수정하지 않는다.
    sprites.png = lambda path, width, height, pixels: captured.append((width, height, pixels))
    try:
        meta = sprites.extract('i000_item', 'common', '')
    finally:
        sprites.png = write_png
    width, height, pixels = captured[0]
    cell = meta['width']
    output.mkdir(parents=True, exist_ok=True)
    # 원본 셀을 눈으로 확인한 대응: 0~3 고기(먹는 단계), 4 썩은 고기(이전 저장 표시용), 6~9 알약(프로틴, 먹는 단계).
    for name, frame in {'meat': 0, 'meat_1': 1, 'meat_2': 2, 'meat_3': 3, 'rotten': 4, 'pill': 6, 'pill_1': 7, 'pill_2': 8, 'pill_3': 9}.items():
        rgba = b''.join(pixels[(y * width + frame * cell) * 4:(y * width + (frame + 1) * cell) * 4] for y in range(height))
        write_png(output / f'{name}.png', cell, height, rgba)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=sprites.ROOT)
    parser.add_argument('--output', type=Path, default=sprites.OUT / 'items')
    args = parser.parse_args()
    extract_items(args.source_root, args.output)
