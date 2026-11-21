/**
 * 도감 (원본 도감 화면 overlay9_16, 순서 표 arm9 0x020EDE78 → src/data/dex.txt).
 * 등록: 원본은 진화하거나 포획한 종의 칸에 1을 쓴다(육성 overlay9_18 0x211A0FC, 사냥 overlay9_14 0x210F63C).
 * 웹판은 기존 save.seen(손에 넣거나 진화한 종)을 등록으로 쓴다.
 * 원작 도감 설명 글(db_txt_list)은 저장소에 옮기지 않는다. 이름·세대·속성·종족·용량·필살기 이름만 보여 준다.
 */
import dexRaw from '../data/dex.txt?raw';
import { battleSkills } from './battle-skills';
import { STAGE_LABEL, getSpecies, originalSpecies } from './data';
import type { SaveData, Stage } from './types';

export const DEX_ORDER: readonly string[] = dexRaw.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
export interface DexEntry {
  no: number;
  id: string;
  registered: boolean;
  name: string;
  stage: string;
  attr: string;
  family: string;
  size: number;
  skills: string[];
}
const ERA = ['', '초기', '펜듀럼', '초기·펜듀럼'];
export function dexEntries(save: Pick<SaveData, 'seen'>): DexEntry[] {
  const seen = new Set(save.seen);
  return DEX_ORDER.map((id, i) => {
    const sp = getSpecies(id), o = originalSpecies(id);
    return {
      no: i + 1, id, registered: seen.has(id), name: sp.name, stage: STAGE_LABEL[sp.stage as Stage],
      attr: sp.attr, family: o?.family ?? sp.family, size: o?.size ?? sp.size, skills: battleSkills(id).map((s) => s.name),
    };
  });
}
/** 시대 표기 (원본 디지몬 표 +108) */
export const eraLabel = (id: string) => ERA[originalSpecies(id)?.era ?? 0] ?? '';
export const dexCount = (save: Pick<SaveData, 'seen'>) => DEX_ORDER.filter((id) => save.seen.includes(id)).length;
