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
    database_overlay = (root / 'ftc/overlay9_16').read_bytes()
    database_raw = (root / 'ui/txt/db_txt_list_txt.dat').read_bytes()
    battle_raw = (root / 'ui/txt/txt_list_txt.dat').read_bytes()
    def texts(raw):
        parts = raw.split(b'<>\n')
        assert parts[0] == b'utf-16'
        return [p.decode('utf-16-le').rstrip('\0') for p in parts[2:]]
    database_text, battle_text = texts(database_raw), texts(battle_raw)
    # 도감은 같은 owner의 첫 행을 건너뛰고 기술 누적 수를 센다.
    # 선택 종의 시작 번호(+53c) + 선택 슬롯(+540) +432가 실제 도감 기술명이다.
    database_checks = {
        0x2112BDC: 0xE59F40A8, 0x2112BE0: 0xE3A00068,
        0x2112BF0: 0xE3530007, 0x2112BF8: 0xE1550003,
        0x2112C10: 0xE59A2008, 0x2112C14: 0xE1520003,
        0x2112C20: 0x058A653C, 0x2112C34: 0xE2866001,
        0x2112C3C: 0xE3580F95, 0x2111FE0: 0xE594253C,
        0x2111FE4: 0xE5941540, 0x2111FEC: 0xE0826001,
        0x21120D0: 0xE2861E1B, 0x21120D4: 0xE3A00001,
        0x21120D8: 0xEBFDA961,
    }
    for address, expected in database_checks.items():
        assert struct.unpack_from('<I', database_overlay, address - 0x210E8A0)[0] == expected, hex(address)
    assert struct.unpack_from('<I', database_overlay, 0x2112C8C - 0x210E8A0)[0] == BASE + TABLE
    # 실제 기술 이름 조회 코드의 두 테이블 리터럴. 기본 행 뒤의 행만 기술이다.
    for address, expected in [(0x211FE84, BASE + TABLE), (0x211FE8C, BASE + TABLE + 31 * STRIDE)]:
        assert struct.unpack_from('<I', overlay, address - 0x210E8A0)[0] == expected
    species = [line.split('|') for line in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]
    assert len(species) == 216
    groups = defaultdict(list)
    previous_owner, skill_index = None, 0
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
        entry = {'record': index, 'name': name}
        if owner == previous_owner:
            # 영문을 번역하지 않고 실제 도감의 조회 번호로 한글을 읽는다.
            localized = database_text[432 + skill_index]
            assert localized and any('\uac00' <= c <= '\ud7a3' for c in localized)
            assert battle_text[1301 + skill_index] == localized
            entry.update(name=localized, englishName=name, dbTextIndex=432 + skill_index)
            skill_index += 1
        else:
            assert owner not in groups, 'Owner groups must be contiguous'
        groups[owner].append(entry)
        previous_owner = owner
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
    assert skill_index == 361
    assert [v['englishName'] for v in result['아구몬']['skills']] == ['Pepper Breath', 'Spitfire Blast']
    assert [v['name'] for v in result['아구몬']['skills']] == ['헤비 플레임', '헤비 버너']
    assert [v['name'] for v in result['토이아구몬']['skills']] == ['토이 플레임']
    audit = {'arm9Sha256': hashlib.sha256(arm).hexdigest(), 'overlay19Sha256': hashlib.sha256(overlay).hexdigest(),
             'attackTable': hex(BASE + TABLE), 'stride': STRIDE, 'range': [31, 596],
             'species': 216, 'battleSpecies': 204, 'skills': 361,
             'localizedNames': {'count': skill_index, 'databaseRange': [432, 793], 'battleRange': [1301, 1662],
                                'instructionChecks': len(database_checks),
                                'databaseOverlaySha256': hashlib.sha256(database_overlay).hexdigest(),
                                'databaseTextSha256': hashlib.sha256(database_raw).hexdigest(),
                                'battleTextSha256': hashlib.sha256(battle_raw).hexdigest(),
                                'evidence': 'overlay16 0x02112bdc..0x02112c40 counts non-first owner rows; 0x02111fe0..0x021120d8 reads database text group1 index432 + species skill start + selected slot'},
             'evidence': 'overlay19 0x0211fa88..0x0211fb0c: owner grouping and skill-name lookup; species internal ID = row + 8',
             'unverified': ['skill slot to animation correspondence', 'power, TP cost, range, effects, AI and opponent rosters']}
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
