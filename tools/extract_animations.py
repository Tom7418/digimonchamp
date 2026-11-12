"""원본 NANR의 셀 순서·유지 시간·반복 모드를 검증해 웹용 데이터로 변환한다."""
import argparse
import json
import struct
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]

def decode(path, cell_count):
    b = path.read_bytes()
    if b[:4] != b'RNAN' or b[16:20] != b'KNBA':
        raise ValueError(f'Unsupported NANR: {path}')
    # 이 게임의 일부 파일은 컨테이너 길이가 비어 있어 실제 데이터 길이와 오프셋으로 검사한다.
    count, frame_count, seq_offset, frame_offset, cell_offset = struct.unpack_from('<HHIII', b, 24)
    sequences = []
    for i in range(count):
        n, start, kind, mode, offset = struct.unpack_from('<HHIII', b, 24 + seq_offset + i * 16)
        if kind != 0x10000 or mode not in (1, 2) or start >= n:
            raise ValueError(f'Unsupported sequence {path}:{i}')
        frames = []
        for j in range(n):
            element, ticks = struct.unpack_from('<IH', b, 24 + frame_offset + offset + j * 8)
            cell = struct.unpack_from('<H', b, 24 + cell_offset + element)[0]
            if cell >= cell_count or ticks == 0:
                raise ValueError(f'Invalid cell/duration {path}:{i}:{j}')
            frames.append([cell, ticks])
        sequences.append({'frames': frames, 'loop': mode == 2, 'start': start})
    return sequences

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=PROJECT.parent)
    args = parser.parse_args()
    sprites = json.loads((PROJECT / 'web/assets/sprites.json').read_text(encoding='utf-8'))
    banks, ids = [], {}
    for sp in sprites:
        sequences = decode(args.source_root / (sp['source'] + '.nanr'), sp['frames'])
        # 동작명은 원본에 없다. 도트 대조에 따른 임시 대응이며 나머지 동작은 후속 연결한다.
        sequences = [sequences[i] if i < len(sequences) else sequences[0] for i in (0, 2, 28)]
        if sequences not in banks:
            banks.append(sequences)
        ids[sp['id']] = banks.index(sequences)
    data = {'tickRate': 60, 'states': {'idle': 0, 'walk': 1, 'eat': 2}, 'sourceSequences': {'idle': 0, 'walk': 2, 'eat': 28}, 'banks': banks, 'sprites': ids}
    (PROJECT / 'web/assets/animations.js').write_text('window.DIGIMON_ANIMATIONS = ' + json.dumps(data, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'{len(ids)} sprites / {len(banks)} unique animation banks')

if __name__ == '__main__':
    main()
