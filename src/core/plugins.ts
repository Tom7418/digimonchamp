/**
 * 사냥 플러그인 30종 (원작 txt_list 278~307번 이름, 308~337번 설명).
 * 이름·가격·해금 조건·분류는 원본 아이템 표(arm9 0xE067C, src/data/shop.txt)와
 * 사냥 준비 화면(overlay9_12 0x2117F40 이름 표, 0x2114318 분류별 목록)에서 확인했다.
 * 장비 칸 수는 원본 랭크 표(arm9 0x020E213C) +20: 그린·블루 2, 레드·화이트 3, 브론즈부터 4.
 * 각 플러그인이 보여 주는 내용은 원작 설명 글 그대로이고, 화면에 어떻게 보이는지(이름 아래 글, 미니맵 점, 수량 표시)는 웹판 표현이다.
 */
import { ORIGINAL_ITEMS, itemUnlocked } from './hunt';
import { tamerRank } from './titles';
import type { SaveData } from './types';

/** 애널라이저로 알 수 있는 것. 모든 애널라이저는 종류(종 이름)도 알려 준다 */
export type AnalyzeKey = 'stage' | 'family' | 'attr' | 'hp' | 'personality' | 'size';
/** 체커가 수량을 보여 주는 장비 묶음 */
export type CheckKey = 'shot' | 'wire' | 'entrap' | 'damage';
export interface Plugin {
  id: string;
  name: string;
  /** 원본 분류 1 애널라이저, 2 체커, 3 레이더(제너레이터·서치·레이더), 4 메모리 체커 */
  category: 1 | 2 | 3 | 4;
  analyze?: AnalyzeKey[];
  check?: CheckKey[];
  /** 레이더에 보이는 디지몬: 세대(1~6), 속성, 종족 중 하나라도 맞으면 */
  radar?: { stages?: number[]; attrs?: string[]; families?: string[] };
  memory?: boolean;
}
const A = (id: string, name: string, analyze: AnalyzeKey[]): Plugin => ({ id, name, category: 1, analyze });
const K = (id: string, name: string, check: CheckKey[]): Plugin => ({ id, name, category: 2, check });
const R = (id: string, name: string, radar: Plugin['radar']): Plugin => ({ id, name, category: 3, radar });
export const PLUGINS: Plugin[] = [
  A('an_stage', '제네 애널라이저', ['stage']),
  A('an_family', '종족 애널라이저', ['family']),
  A('an_attr', '속성 애널라이저', ['attr']),
  A('an_hp', 'HP 애널라이저', ['hp']),
  A('an_mind', '정신 애널라이저', ['personality']),
  A('an_size', '용량 애널라이저', ['size']),
  A('an_a', '디지 애널라이저α', ['stage', 'family']),
  A('an_b', '디지 애널라이저β', ['stage', 'family', 'attr']),
  A('an_o', '디지 애널라이저Ω', ['stage', 'family', 'attr', 'hp', 'personality', 'size']),
  K('ck_shot', '샷 체커', ['shot']),
  K('ck_wire', '와이어 체커', ['wire']),
  K('ck_entrap', '엔트랩 채커', ['entrap']),
  K('ck_damage', '대미지트랩 체커', ['damage']),
  K('ck_all', '올 체커', ['shot', 'wire', 'entrap', 'damage']),
  // 원작 글은 유년기·성년기·성숙기·완전체. 웹판 세대 1·2 = 유년기Ⅰ·Ⅱ, 3 성장기, 4 성숙기, 5 완전체
  R('gen_a', '제너레이터α', { stages: [1, 2] }),
  R('gen_b', '제너레이터β', { stages: [3] }),
  R('gen_c', '제너레이터γ', { stages: [4] }),
  R('gen_o', '제너레이터Ω', { stages: [5] }),
  R('se_data', '데이터 서치', { attrs: ['데이터', '프리'] }),
  R('se_vaccine', '백신 서치', { attrs: ['백신'] }),
  R('se_virus', '바이러스 서치', { attrs: ['바이러스'] }),
  R('ra_dragon', '레이더 드래곤', { families: ['용'] }),
  R('ra_animal', '레이더 애니멀', { families: ['짐승'] }),
  R('ra_sky', '레이더 스카이', { families: ['새'] }),
  R('ra_aqua', '레이더 아쿠아', { families: ['물'] }),
  R('ra_saint', '레이더 세인트', { families: ['성'] }),
  R('ra_dark', '레이더 다크', { families: ['암흑'] }),
  R('ra_nature', '레이더 네이처', { families: ['벌레풀'] }),
  R('ra_metal', '레이더 메탈', { families: ['기계'] }),
  { id: 'memory', name: '메모리 체커', category: 4, memory: true },
];
export const pluginOf = (id: string) => PLUGINS.find((p) => p.id === id);
export const pluginPrice = (p: Plugin) => ORIGINAL_ITEMS[p.name]?.price ?? 0;

/** 플러그인 장비 칸 수 (원본 랭크 표 +20) */
export const PLUGIN_SLOTS = [0, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4];
export const pluginSlots = (save: Pick<SaveData, 'titles' | 'champion'>) => PLUGIN_SLOTS[Math.max(1, Math.min(10, tamerRank(save)))];
type PluginSave = Pick<SaveData, 'titles' | 'champion' | 'plugins' | 'pluginLoadout'>;
/** 지금 장비한 플러그인: 가진 것만, 중복 없이, 칸 수까지 */
export function equippedPlugins(save: PluginSave): Plugin[] {
  const owned = new Set(save.plugins ?? []);
  return [...new Set(save.pluginLoadout ?? [])].filter((id) => owned.has(id)).slice(0, pluginSlots(save)).map((id) => pluginOf(id)!).filter(Boolean);
}
/** 플러그인을 칸에 넣거나 뺀다. 칸이 다 찼거나 없는 플러그인이면 그대로 */
export function togglePlugin<T extends PluginSave>(save: T, id: string): T {
  const now = equippedPlugins(save).map((p) => p.id);
  if (now.includes(id)) return { ...save, pluginLoadout: now.filter((x) => x !== id) };
  if (now.length >= pluginSlots(save) || !(save.plugins ?? []).includes(id)) return { ...save, pluginLoadout: now };
  return { ...save, pluginLoadout: [...now, id] };
}
/** 장비한 플러그인 효과를 모은 것 */
export interface PluginView {
  /** 종 이름이 보이는가 (애널라이저 하나라도) */
  species: boolean;
  analyze: Set<AnalyzeKey>;
  check: Set<CheckKey>;
  memory: boolean;
  /** 레이더에 이 디지몬이 보이는가 */
  onRadar: (s: { stage: number; attr: string; family: string }) => boolean;
}
export function pluginView(save: PluginSave): PluginView {
  const list = equippedPlugins(save);
  const analyze = new Set(list.flatMap((p) => p.analyze ?? []));
  const radars = list.filter((p) => p.radar).map((p) => p.radar!);
  return {
    species: list.some((p) => p.category === 1),
    analyze,
    check: new Set(list.flatMap((p) => p.check ?? [])),
    memory: list.some((p) => p.memory),
    onRadar: (s) => radars.some((r) => !!(r.stages?.includes(s.stage) || r.attrs?.includes(s.attr) || r.families?.includes(s.family))),
  };
}
/** 상점에 낼 플러그인 (가지지 않았고 해금된 것). 최대 소지 수는 모두 1 */
export const shopPlugins = (save: SaveData) => PLUGINS.filter((p) => !(save.plugins ?? []).includes(p.id) && itemUnlocked(save, p.name));
