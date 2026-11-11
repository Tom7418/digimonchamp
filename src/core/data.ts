import speciesJson from '../data/species.json';
import movesJson from '../data/moves.json';
import type { Move, Species, Stage } from './types';

export const SPECIES: Record<string, Species> = Object.fromEntries(
  (speciesJson as Species[]).map((s) => [s.id, s]),
);
export const MOVES: Record<string, Move> = Object.fromEntries(
  (movesJson as Move[]).map((m) => [m.id, m]),
);

export const STAGE_ORDER: Stage[] = ['egg', 'baby1', 'baby2', 'rookie', 'champion', 'ultimate'];
export const STAGE_LABEL: Record<Stage, string> = {
  egg: '알',
  baby1: '유년기1',
  baby2: '유년기2',
  rookie: '성장기',
  champion: '성숙기',
  ultimate: '완전체',
};

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

export function getMove(id: string): Move {
  const m = MOVES[id];
  if (!m) throw new Error(`Unknown move: ${id}`);
  return m;
}

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}
