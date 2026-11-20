/**
 * 원본 메일 이벤트 중 근거가 확실한 것만 옮긴다 (src/data/events.txt, docs/design.md '원본 메일 이벤트·선물 표').
 * 지금은 랭크 업 때 사장이 보내는 먹이 선물 4통:
 * - 예약: 결과 화면 overlay9_8 0x2111978. 새 랭크 번호 2·4·6·8(레드·브론즈·골드·챔프)이면 이벤트 0x75~0x78
 * - 선물: 선물 표 0x020F00B8 31~34번, 종류 5(사육장 먹이) 값 1·4·2·3
 * - 먹이: 육성 화면 overlay9_18 0x21108C4가 지금 케이지에 놓는다. 값 1 큰 고기1, 2 큰 고기3,
 *   3 큰 고기·케이크·큰 고기·케이크·큰 고기, 4 케이크1 (먹이 종류 2 = 큰 고기, 3 = 케이크)
 * 메일 본문은 원작 글을 옮기지 않고 뜻만 살려 새로 썼다.
 */
import type { SaveData } from './types';

export type GiftFood = 'big' | 'cake';
export interface MailEvent {
  id: number;
  from: string;
  text: string;
  foods: GiftFood[];
}
/** 웹판 랭크 번호(1 그린 ~ 10 마스터) → 이벤트. 원본 랭크 번호는 웹판보다 1 작다 */
export const RANK_UP_MAIL: Record<number, MailEvent> = {
  3: { id: 0x75, from: '사장', text: '레드 랭크 축하한다!\n애써 준 디지몬들에게도 선물을 보내마.\n케이지에 고기를 놓아 두었다.', foods: ['big'] },
  5: { id: 0x76, from: '사장', text: '브론즈 랭크라니, 대단한걸!\n오늘은 잔치다. 케이크를 보냈으니\n디지몬들과 나눠 먹어라.', foods: ['cake'] },
  7: { id: 0x77, from: '사장', text: '골드 랭크! 요즘 네 배틀은\n정말 볼만하더군. 승리 기념으로\n고기를 넉넉히 보냈다.', foods: ['big', 'big', 'big'] },
  9: { id: 0x78, from: '사장', text: '드디어 챔프 랭크까지 왔구나!\n축하의 뜻으로 한 상 차려 보냈다.\n앞으로도 기대하마.', foods: ['big', 'cake', 'big', 'cake', 'big'] },
};
export const mailEvent = (id: number) => Object.values(RANK_UP_MAIL).find((e) => e.id === id);

/** 랭크가 before → after로 올랐을 때 새로 예약할 이벤트 번호 */
export function rankUpMails(before: number, after: number): number[] {
  const out: number[] = [];
  for (let r = before + 1; r <= after; r++) if (RANK_UP_MAIL[r]) out.push(RANK_UP_MAIL[r].id);
  return out;
}
/** 이벤트를 메일함에 예약한다 (원작 메일함은 4통까지, 0x0208B43C) */
export function queueMails(save: SaveData, ids: number[]): SaveData {
  if (!ids.length) return save;
  return { ...save, pendingMails: [...(save.pendingMails ?? []), ...ids].slice(0, 4) };
}
/**
 * 메일을 읽으면 선물을 받는다. 먹이 선물은 고기 재고에 더하고(큰 고기 2개분, 케이크 1개분),
 * 화면이 같은 수의 바닥 먹이를 케이지에 놓는다. 케이크는 원본 먹는 코드(overlay9_18 0x211BC04)에 따로 갈래가 없어 고기와 같다.
 */
export function openMail(save: SaveData, id: number): { save: SaveData; event?: MailEvent } {
  const queue = save.pendingMails ?? [];
  const at = queue.indexOf(id);
  if (at < 0) return { save };
  const event = mailEvent(id);
  const rest = queue.filter((_, i) => i !== at);
  if (!event) return { save: { ...save, pendingMails: rest } };
  const units = event.foods.reduce((n, f) => n + (f === 'big' ? 2 : 1), 0);
  return { save: { ...save, pendingMails: rest, meat: save.meat + units }, event };
}
