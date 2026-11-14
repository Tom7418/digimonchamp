import data from '../data/battle-maps.json';
import { pick, type Rng } from './rng';

/** 원본 ARM9의24바이트 배틀 장소 표. 이름은 웹판 한글 표시명. */
export const BATTLE_MAPS = data.maps;
/** 원본 일반 배틀 선택: 사이버 공간·콜로세움·스타디움·돔 제외. */
export const RANDOM_BATTLE_MAPS = data.randomPool;
export const TITLE_BATTLE_MAPS: Readonly<Record<string, number | null>> = data.titles;

/** 경기를 시작할 때 한 번만 선택한다. null은 원본의 장소 미지정(무작위) 조건. */
export function battleMapFor(matchId: string | undefined, rng: Rng) {
  const fixed = matchId ? TITLE_BATTLE_MAPS[matchId] : null;
  // 챔피언십 경기는 원본 메뉴의 돔 스타디움 지정(overlay10 +4fc=10)을 따른다.
  const id = matchId === 'prelim' || matchId === 'final' ? 10 : fixed ?? pick(rng, RANDOM_BATTLE_MAPS);
  return BATTLE_MAPS[id];
}
