/**
 * 원본 메일 이벤트 중 근거가 확실한 것만 옮긴다 (src/data/events.txt, docs/design.md '원본 메일 이벤트·선물 표').
 * 지금은 랭크 업 때 사장이 보내는 먹이 선물 4통:
 * - 예약: 결과 화면 overlay9_8 0x2111978. 새 랭크 번호 2·4·6·8(레드·브론즈·골드·챔프)이면 이벤트 0x75~0x78
 * - 선물: 선물 표 0x020F00B8 31~34번, 종류 5(사육장 먹이) 값 1·4·2·3
 * - 먹이: 육성 화면 overlay9_18 0x21108C4가 지금 케이지에 놓는다. 값 1 큰 고기1, 2 큰 고기3,
 *   3 큰 고기·케이크·큰 고기·케이크·큰 고기, 4 케이크1 (먹이 종류 2 = 큰 고기, 3 = 케이크)
 * 메일 본문은 원작 글을 옮기지 않고 뜻만 살려 새로 썼다.
 */
import { originalSpecies } from './data';
import { MONEY_MAX } from './titles';
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

// ---------- NPC 매입 제안 (원본 overlay9_18 0x2129064) ----------
/**
 * 하루 한 번(10·15·20시 중 처음 맞은 정각, 하루 횟수 +0x18) 100면 주사위를 굴려 5 미만이면
 * 무작위 세대(0~6)를 하나 골라 그 세대인 첫 디지몬을 사겠다는 메일이 온다.
 * 값 = 종 기본 가격(디지몬 표 +0x80) × (8 + 0~3) / 10, 메일은 이벤트 0x5E~0x62 중 하나.
 * 확인했지만 아직 옮기지 않은 것: 주사위 5~9의 다른 매입(이벤트 0x64, 디지몬 +0x24·+0x3D·+0x08 조건),
 * 프리 배틀 활약 뒤 다음 날 50%로 오는 매입(값 ×3, 이벤트 0x65~0x69, 후보는 overlay9_19 0x2111B14).
 */
export const OFFER_HOURS = [10, 15, 20];
export interface NpcOffer { id: number; uid: number; price: number; from: string }
const OFFER_FROM = ['철수', '영희', '오타틱 테이머', '배틀왕', '부자 누님']; // 이벤트 0x5E~0x62 보낸 사람 (events.txt)
const OFFER_TEXT = [
  '{name}(을)를 우리 팀에 데려가고 싶어!\n{price}bit 줄 테니 넘겨 주지 않을래?',
  '실례지만 {name}(을)를\n{price}bit에 양보해 주실 수 있나요?',
  '{name}, 정말 멋진데!\n{price}bit 낼 테니 나한테 줘!',
  '{name}(이)랑 꼭 같이 해 보고 싶어.\n{price}bit면 어때?',
  '나도 {name} 같은 녀석을 키우고 싶어…\n{price}bit 준비했어!',
];
export const offerText = (o: NpcOffer, name: string) => OFFER_TEXT[(o.id - 0x5e) % OFFER_TEXT.length].replace('{name}', name).replace('{price}', o.price.toLocaleString('ko-KR'));
/** 정각마다 부른다. 오늘 이미 굴렸으면 null. 굴렸으면 offerDay를 기록한 저장과(있으면) 제안을 돌려준다 */
export function rollNpcOffer(save: SaveData, day: number, hour: number, rng: () => number): { save: SaveData; offer?: NpcOffer } | null {
  if (save.offerDay === day || !OFFER_HOURS.includes(hour)) return null;
  const next = { ...save, offerDay: day };
  if (Math.floor(rng() * 100) >= 5) return { save: next };
  const stage = Math.floor(rng() * 7);
  const d = save.digimon.find((x) => !x.isEgg && originalSpecies(x.speciesId)?.stage === stage);
  const base = d ? originalSpecies(d.speciesId)?.price ?? 0 : 0;
  if (!d || base <= 0) return { save: next };
  const price = Math.floor((base * (8 + Math.floor(rng() * 4))) / 10);
  const id = 0x5e + Math.floor(rng() * 5);
  const offer = { id, uid: d.uid, price, from: OFFER_FROM[id - 0x5e] };
  return { save: { ...next, npcOffer: offer }, offer };
}
/** 제안에 답한다. 받아들이면 디지몬을 건네고 값을 받는다 (소지금 상한 적용) */
export function answerNpcOffer(save: SaveData, accept: boolean): SaveData {
  const o = save.npcOffer;
  if (!o) return save;
  const { npcOffer, ...rest } = save;
  if (!accept || !save.digimon.some((d) => d.uid === o.uid)) return rest;
  return { ...rest, digimon: save.digimon.filter((d) => d.uid !== o.uid), bits: Math.min(MONEY_MAX, save.bits + o.price) };
}
