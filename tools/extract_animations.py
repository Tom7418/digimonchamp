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
        # 전체 시퀀스를 보존한다. 같은 번호를 모든 상황에 임의 배정하지 않는다.
        if sequences not in banks:
            banks.append(sequences)
        ids[sp['id']] = banks.index(sequences)
    # overlay18 시설 행동표(ARM9 0x020c81e0)와 행동 디스패처를 대조한 대응.
    # 복합 동작은 첫 동작만 표시하며 원작 행동 상태기계 전체의 복제는 아니다.
    commands = {0:8,1:3,2:33,3:0,4:29,6:0,7:35,8:31,9:30,10:1,11:1,12:13,13:1,16:4,17:4,18:1,19:4,20:6,21:14,22:31,25:32,27:28,28:14,29:31,30:34}
    import struct
    arm9 = (args.source_root / 'ftc/arm9.bin').read_bytes()
    training = {}
    for i in range(37):
        row = struct.unpack_from('<10I', arm9, 0xc81e0 + i*40)
        offset = row[0] - 0x02000000
        name = arm9[offset:offset+32].split(b'\0')[0].decode('ascii')
        if name.startswith('field_cm'):
            training[name[6:10]] = commands.get(row[2], 0)
    states = {f'seq_{i}':i for i in range(40)}
    states.update({'idle':0,'walk':2,'eat':14,'hurt':5,'hurtAlt':6,'ko':15,'boundIdle':16,'boundRun':19})
    data = {'tickRate':60,'states':states,'sourceSequences':states,'banks':banks,'sprites':ids,'training':training}
    (PROJECT / 'web/assets/animations.js').write_text('window.DIGIMON_ANIMATIONS = ' + json.dumps(data, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'{len(ids)} sprites / {len(banks)} unique animation banks')

if __name__ == '__main__':
    main()
