"""원본 공격 표에서 종별 기술 이름/레코드 번호만 변환한다.
python tools/extract_battle_skills.py <원본 root> [--check]
미확인 피해량/TP/효과 필드는 추출하지 않는다. 원본 실행 파일은 배포하지 않는다.
"""
import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import struct

REPO = Path(__file__).resolve().parents[1]
BASE, TABLE, STRIDE = 0x02000000, 0xD02CC, 104


def extract(root):
    arm = (root / 'ftc/arm9.bin').read_bytes()
    overlay = (root / 'ftc/overlay9_19').read_bytes()
    # 실제 기술 이름 조회 코드의 두 테이블 리터럴. 기본 행 뒤의 행만 기술이다.
    for address, expected in [(0x211FE84, BASE + TABLE), (0x211FE8C, BASE + TABLE + 31 * STRIDE)]:
        assert struct.unpack_from('<I', overlay, address - 0x210E8A0)[0] == expected
    species = [line.split('|') for line in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
    assert len(species) == 216
    groups = defaultdict(list)
    for index in range(31, 596):
        owner, pointer = struct.unpack_from('<2I', arm, TABLE + index * STRIDE)
        assert 20 <= owner < 224
        start = pointer - BASE
        chars = []
        for offset in range(start, start + 256, 2):
            value = struct.unpack_from('<H', arm, offset)[0]
            if value == 0:
                break
            chars.append(value)
        else:
            raise ValueError(f'Unterminated attack name: {index}')
        name = b''.join(v.to_bytes(2, 'little') for v in chars).decode('utf-16-le')
        groups[owner].append({'record': index, 'name': name})
    result = {}
    for index, row in enumerate(species):
        # 원본 내부 종 번호에는 앞에 에그8건이 있다. 종 표의 영문 이름도 대조한다.
        record = 0xC0CB0 + index * 132
        pointer = struct.unpack_from('<I', arm, record + 4)[0] - BASE
        assert arm[pointer:arm.index(b'\0', pointer)].decode('ascii') == row[4]
        entries = groups.get(index + 8, [])
        assert (not entries) == (int(row[3]) == 1)
        assert not entries or 2 <= len(entries) <= 4
        result[row[0]] = {'basicRecord': entries[0]['record'] if entries else None, 'skills': entries[1:]}
    assert len(groups) == 204 and sum(len(v['skills']) for v in result.values()) == 361
    assert [v['name'] for v in result['아구몬']['skills']] == ['Pepper Breath', 'Spitfire Blast']
    audit = {'arm9Sha256': hashlib.sha256(arm).hexdigest(), 'overlay19Sha256': hashlib.sha256(overlay).hexdigest(),
             'attackTable': hex(BASE + TABLE), 'stride': STRIDE, 'range': [31, 596],
             'species': 216, 'battleSpecies': 204, 'skills': 361,
             'evidence': 'overlay19 0x0211fa88..0x0211fb0c: owner grouping and skill-name lookup; species internal ID = row + 8',
             'unverified': ['Korean localized name correspondence', 'skill slot to animation correspondence', 'power, TP cost, range, effects, AI and opponent rosters']}
    return result, audit


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    data, audit = extract(args.root)
    for path, value in [(REPO / 'src/data/battle-skills.json', data), (REPO / 'docs/battle-skills-audit.json', audit)]:
        content = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            assert path.read_text(encoding='utf-8') == content, path
        else:
            path.write_text(content, encoding='utf-8', newline='\n')
    print('216 species / 204 battle species / 361 skills verified')
