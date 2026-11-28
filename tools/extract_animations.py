"""원본 NANR의 셀 순서·유지 시간·반복 모드를 검증해 웹용 데이터로 변환한다."""
import argparse
import json
import struct
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]

# 시설 행동 디스패처 0x02118cfc의 기본 동작. 두 번째 값은 코드로 확인한 프레임 수다.
# 생략하면 종별 NANR 한 주기를 쓴다. 25·29는 0x0211cd50~0x0211ce28에서 자세를 바꾼다.
TRAINING_COMMANDS = {
    0: [[8]], 1: [[3, 180]], 2: [[33]], 3: [[0]], 4: [[29]],
    5: [[0]], 6: [[0]], 7: [[35]], 8: [[31]], 9: [[30]],
    10: [[1]], 11: [[1]], 12: [[13]], 13: [[1]], 16: [[4]], 17: [[4]],
    18: [[1]], 19: [[4]],
    20: [[6]], 21: [[14]], 22: [[31]], 23: [[3, 60]], 24: [[11, 180]],
    25: [[32, 30], [15, 30]], 27: [[28]], 28: [[14]],
    29: [[31, 60], [0, 50]], 30: [[34]],
}
# 이 미니 시설들은 실행용 행동표에 독립 항목이 없다. 웹판에서는 같은 종류의 원본 동작을 재사용한다.
TRAINING_ALIASES = {'cm33': 'cm11', 'cm36': 'cm21', 'cm38': 'cm15'}

def facility_training(arm9):
    for i in range(37):
        row = struct.unpack_from('<10I', arm9, 0xc81e0 + i * 40)
        offset = row[0] - 0x02000000
        name = arm9[offset:offset+32].split(b'\0')[0].decode('ascii')
        yield name, row[1:4]

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
        nanr = args.source_root / (sp['source'] + '.nanr')
        if sp['id'].endswith('_digitama') and sp['id'] != 'e000_digitama' and not nanr.exists():
            # e001~e007 디지에그는 e000과 셀 배치(NCER)가 같다. 동작 파일이 없으면 e000 동작을 쓴다
            ids[sp['id']] = ids['e000_digitama']
            continue
        sequences = decode(nanr, sp['frames'])
        # 역할은 실행 코드 추적 근거로 연결한다. 셀 번호는 각 종의 NANR에서 개별 추출.
        if len(sequences) != (2 if sp['id'].endswith('_digitama') else 40):
            raise ValueError('Unexpected species sequence layout: '+sp['id'])
        # 전체 시퀀스를 보존한다. 같은 번호를 모든 상황에 임의 배정하지 않는다.
        if sequences not in banks:
            banks.append(sequences)
        ids[sp['id']] = banks.index(sequences)
    arm9 = (args.source_root / 'ftc/arm9.bin').read_bytes()
    rows = {name[6:10]: action for name, (_, action, _) in facility_training(arm9)}
    profiles = {key: TRAINING_COMMANDS[action] for key, action in rows.items() if action in TRAINING_COMMANDS}
    profiles.update({key: profiles[source] for key, source in TRAINING_ALIASES.items()})
    states = {f'seq_{i}':i for i in range(40)}
    states.update({'idle':0,'walk':2,'eat':14,'hurt':5,'hurtAlt':6,'ko':37,'boundIdle':16,'boundRun':19})
    # 사용자 제공 GIF 분류. 명칭과 원작이 어떤 상황에서 선택하는지는 구분한다.
    names=['idle','eyesClosed','walk','run','surprised','hurt','hurtAlt','attack1','attack2','attack3','attack4','runScared','walkEyesClosed','sleep','eat','sleep2','boundIdle','boundEyesClosed','boundWalk','boundRun','boundSurprised','boundRunScared','boundWalkEyesClosed','boundSleep','boundEat','boundSleep2','zapped',None,'happy','angry','cheering','guard','train','shout','guard2','shoutFrame2',None,'ko','jumpHit',None]
    states.update({name:i for i,name in enumerate(names) if name})
    # overlay18 진화 상태기계 0x0211e090/0x0211e198:39는 진화 중 흰 실루엣.
    states['evolving']=39
    data = {'tickRate':60,'states':states,'sourceSequences':states,'banks':banks,'sprites':ids}
    output = 'window.DIGIMON_ANIMATIONS = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    output += 'window.DIGIMON_ANIMATIONS.trainingActions = ' + json.dumps(profiles, separators=(',', ':')) + ';\n'
    (PROJECT / 'web/assets/animations.js').write_text(output, encoding='utf-8')
    print(f'{len(ids)} sprites / {len(banks)} unique animation banks')

if __name__ == '__main__':
    main()
