/**
 * 원본 메일 이벤트 중 근거가 확실한 것만 옮긴다 (src/data/events.txt, docs/design.md '원본 메일 이벤트·선물 표').
 * 지금은 랭크 업 때 사장이 보내는 먹이 선물 4통:
 * - 예약: 결과 화면 overlay9_8 0x2111978. 새 랭크 번호 2·4·6·8(레드·브론즈·골드·챔프)이면 이벤트 0x75~0x78
 * - 선물: 선물 표 0x020F00B8 31~34번, 종류 5(사육장 먹이) 값 1·4·2·3
 * - 먹이: 육성 화면 overlay9_18 0x21108C4가 지금 케이지에 놓는다. 값 1 큰 고기1, 2 큰 고기3,
 *   3 큰 고기·케이크·큰 고기·케이크·큰 고기, 4 케이크1 (먹이 종류 2 = 큰 고기, 3 = 케이크)
 * 메일 본문은 원작 글을 옮기지 않고 뜻만 살려 새로 썼다.
 */
import eventsRaw from '../data/events.txt?raw';
import { npcTeam } from './battle';
import { dateOf, originalSpecies } from './data';
import { maxStageForRank } from './evolution';
import { MONEY_MAX, tamerRank } from './titles';
import type { SaveData } from './types';

export type GiftFood = 'big' | 'cake';
export interface MailEvent {
  id: number;
  from: string;
  text: string;
  foods: GiftFood[];
  /** 배틀 신청 (선물 종류 1): 상대 팀 번호(팀 표)와 상금 */
  battle?: { team: number; prize: number; name: string };
}
// 원본 이벤트 표·선물 표 (tools/extract_events.py)
const EVENT_ROWS = new Map<number, { from: string; gift: number }>();
const GIFT_ROWS = new Map<number, { kind: number; value: number; value2: number }>();
for (const line of eventsRaw.split(/\r?\n/)) {
  const f = line.split('|');
  if (f[0] === 'event') EVENT_ROWS.set(+f[1], { from: f[2], gift: +f[6] });
  else if (f[0] === 'gift') GIFT_ROWS.set(+f[1], { kind: +f[2], value: +f[3], value2: +f[4] });
}
/** 배틀 신청 메일 (이벤트 0x7B~0xAE, 선물 종류 1). 본문은 새로 썼다 */
function battleEvent(id: number): MailEvent | undefined {
  const e = EVENT_ROWS.get(id), g = e && GIFT_ROWS.get(e.gift);
  const team = g?.kind === 1 ? npcTeam(g.value) : null;
  if (!e || !g || !team) return undefined;
  const text = BOSS_TEXT[id] ?? `${team.name} 팀으로 한판 붙자!\n이기면 상금 ${g.value2.toLocaleString('ko-KR')}bit.\n도전을 받겠어?`;
  return { id, from: e.from, text, foods: [], battle: { team: g.value, prize: g.value2, name: team.name } };
}
// ---------- 사장 배틀 (팀 151 「디지털 아리나」, 상금 400,000 — 선물 표 85번) ----------
/**
 * 0xAD 첫 신청: 챔피언십 본선 마지막 경기를 이긴 결과 화면(overlay9_19 0x21120AC — 모드 0·본선·마지막 경기 +0x1F208,
 * 결과 4 = 승리)에서 +0x11C가 0이면 +0x11C와 +0x124를 켜고, 육성 화면(overlay9_18 0x21211B8)이 +0x124를 보고 메일을 넣는다.
 * 0xAE 재도전: +0x11C가 켜져 있고 +0x120이 0이며, 계절 첫날(날 % 8 == 0) 12:00 정각이면(0x21211D8~0x212122C) 보낸다.
 * 본문은 원작 글을 옮기지 않고 새로 썼다.
 */
export const BOSS_INTRO_MAIL = 0xad;
export const BOSS_REMATCH_MAIL = 0xae;
export const BOSS_TEAM = 151;
const BOSS_TEXT: Record<number, string> = {
  [BOSS_INTRO_MAIL]: '챔피언십 우승, 잘 봤다.\n이 대회를 연 사람으로서\n챔피언의 실력을 직접 확인하고 싶군.\n상금은 400,000bit. 받겠나?',
  [BOSS_REMATCH_MAIL]: '다시 한 번 붙어 보겠나?\n네 디지몬들이 얼마나 컸는지\n궁금하구나. 상금은 400,000bit.',
};
/** 매시 정각과 배틀이 끝난 뒤에 부른다. 챔피언이 되면 첫 신청, 그 뒤로 사장을 이기기 전까지 계절 첫날 12시마다 재도전 */
export function rollBossMail(save: SaveData): SaveData {
  if (!save.champion) return save;
  if ((save.pendingMails ?? []).length >= 4) return save;
  if (!save.bossIntro) return queueMails({ ...save, bossIntro: true }, [BOSS_INTRO_MAIL]);
  const d = dateOf(save.clock);
  if (save.bossBeaten || d.day !== 1 || d.hour !== 12 || d.minute !== 0) return save;
  if ((save.pendingMails ?? []).includes(BOSS_REMATCH_MAIL) || save.challenge?.team === BOSS_TEAM) return save;
  return queueMails(save, [BOSS_REMATCH_MAIL]);
}
/** 배틀 신청 상대를 이겼을 때. 사장 팀이면 재도전 메일을 멈춘다 (웹판) */
export function rivalBeaten(save: SaveData, team: number): SaveData {
  return team === BOSS_TEAM ? { ...save, bossBeaten: true } : save;
}

/** 웹판 랭크 번호(1 그린 ~ 10 마스터) → 이벤트. 원본 랭크 번호는 웹판보다 1 작다 */
export const RANK_UP_MAIL: Record<number, MailEvent> = {
  3: { id: 0x75, from: '사장', text: '레드 랭크 축하한다!\n애써 준 디지몬들에게도 선물을 보내마.\n케이지에 고기를 놓아 두었다.', foods: ['big'] },
  5: { id: 0x76, from: '사장', text: '브론즈 랭크라니, 대단한걸!\n오늘은 잔치다. 케이크를 보냈으니\n디지몬들과 나눠 먹어라.', foods: ['cake'] },
  7: { id: 0x77, from: '사장', text: '골드 랭크! 요즘 네 배틀은\n정말 볼만하더군. 승리 기념으로\n고기를 넉넉히 보냈다.', foods: ['big', 'big', 'big'] },
  9: { id: 0x78, from: '사장', text: '드디어 챔프 랭크까지 왔구나!\n축하의 뜻으로 한 상 차려 보냈다.\n앞으로도 기대하마.', foods: ['big', 'cake', 'big', 'cake', 'big'] },
};
export const mailEvent = (id: number): MailEvent | undefined => Object.values(RANK_UP_MAIL).find((e) => e.id === id) ?? battleEvent(id) ?? morningEvent(id);

// ---------- 아침 메일: 어머니 소식·디지몬이 찾아낸 것 (원본 overlay9_18 0x21120E4 → 0x2129944) ----------
/**
 * 새 날 아침, 계절 첫날이 아니면 4%(100면 주사위가 25의 배수 — 0x211215C)로 21가지 중 하나:
 * 0~9 어머니 소식 0xAF~0xB8(글만), 10~20 '디지몬이 무언가를 찾아냄' 0xB9~0xC3
 * (5·10·100·500·5,000비트, 프로틴·약·상처약 1개씩 두 벌). 나머지 날은 원작이 차례대로 보내는 도움말 메일(3~0x41)과
 * 계절 첫날 메일(0x42~0x51)인데, 웹판은 자체 안내가 있어 옮기지 않는다.
 * 확인했지만 미적용: '찾아냄' 때 무작위 디지몬 +0x2C 칸 변화(0x207DAAC 인자 1·5), 생일 메일 0xC5~0xC7(생일 설정이 없음).
 */
const MOTHER_TEXT = [
  '요즘 날씨가 계속 맑구나.\n혹시 산몬 덕분일까?',
  '끼니는 거르지 말고 챙겨 먹으렴.\n안 먹다간 워매몬처럼 될라.',
  '쿠네몬을 정글 케이지에 두었더니\n커다란 투구벌레가 되었다더라!\n신기하지?',
  '키우기 벅차면 놓아줘도 괜찮단다.\n언젠가 또 만나게 될 거야.',
  '에테몬을 바이러스 기운에 잔뜩 쐬었더니\n은빛으로 바뀌었다는구나!',
  '다르크몬에게 배틀을 시켜 어둠 기운을 키웠더니\n심술궂은 아가씨가 되었대.',
  '플로라몬은 예쁘고 향기도 좋아서\n곁에 있으면 마음이 편해지더라.',
  '가오가몬, 가루몬, 구루몬…\n이름이 비슷해서 헷갈린다니까.',
  '고래몬은 덩치가 정말 크지?\n어쩐지 멋있더구나.',
  '쉬라몬이 원뿔몬이 되는 건 다 아는 얘기지.\n배틀만 시키면 된다잖니!',
];
export type MailItem = 'pills' | 'medicine' | 'salve';
/** 선물 종류 3의 아이템 번호 → 웹판 재고 (1 프로틴, 3 약, 2 상처약 — 받을 때 글 202·203·204) */
const GIFT_ITEM: Record<number, { key: MailItem; name: string }> = { 1: { key: 'pills', name: '알약(프로틴)' }, 3: { key: 'medicine', name: '약' }, 2: { key: 'salve', name: '상처약' } };
export interface MorningGift { bits?: number; item?: { key: MailItem; name: string; count: number } }
function morningEvent(id: number): (MailEvent & { gift?: MorningGift }) | undefined {
  if (id >= 0xaf && id <= 0xb8) return { id, from: '어머니', text: MOTHER_TEXT[id - 0xaf], foods: [] };
  if (id < 0xb9 || id > 0xc3) return undefined;
  const e = EVENT_ROWS.get(id), g = e && GIFT_ROWS.get(e.gift);
  if (!g) return undefined;
  const gift: MorningGift = g.kind === 4 ? { bits: g.value } : g.kind === 3 && GIFT_ITEM[g.value] ? { item: { ...GIFT_ITEM[g.value], count: g.value2 || 1 } } : {};
  const what = gift.bits ? `${gift.bits.toLocaleString('ko-KR')}bit` : gift.item ? `${gift.item.name} ${gift.item.count}개` : '무언가';
  return { id, from: '안내', text: `디지몬이 케이지에서 무언가를 찾아낸 모양이야!\n${what}를 손에 넣었다.`, foods: [], gift };
}
/** 새 날 아침에 부른다. dayOfSeason은 1부터 */
export function rollMorningMail(save: SaveData, dayOfSeason: number, rng: () => number): SaveData {
  if (dayOfSeason === 1 || Math.floor(rng() * 100) % 25 !== 0) return save;
  return queueMails(save, [0xaf + Math.floor(rng() * 21)]);
}

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
  let next: SaveData = { ...save, pendingMails: rest, meat: save.meat + units };
  const gift = (event as MailEvent & { gift?: MorningGift }).gift;
  if (gift?.bits) next = { ...next, bits: Math.min(MONEY_MAX, next.bits + gift.bits) };
  if (gift?.item) next = { ...next, [gift.item.key]: next[gift.item.key] + gift.item.count };
  return { save: next, event };
}

// ---------- 라이벌 배틀 신청 (원본 overlay9_18 0x2129450) ----------
/**
 * 13~18시 정각마다(쿨타임 +0x1C, 20분마다 1 감소) 메일함이 차 있지 않으면 굴린다.
 * 라이벌 k = 0~4(철수·영희·오타틱 테이머·배틀왕·부자 누님)를 고르고 100면 주사위가 20의 배수(5%)이며,
 * 지금 랭크의 진화 한도(랭크 표 +24) 세대 이상인 디지몬이 있으면 이벤트 0x7B + 10k + 랭크 번호(0~9) 메일.
 * 메일을 열면 '도전을 받겠습니까?' → 상대는 팀 표 101~150, 상금은 선물 표 값2 (arm9 0x0208B8A8).
 */
export const RIVAL_HOURS = [13, 14, 15, 16, 17, 18];
export function rollRivalChallenge(save: SaveData, hour: number, rng: () => number): SaveData {
  if (!RIVAL_HOURS.includes(hour) || (save.pendingMails ?? []).length >= 4) return save;
  const k = Math.floor(rng() * 5);
  if (Math.floor(rng() * 100) % 20 !== 0) return save;
  const rank = tamerRank(save);
  if (!save.digimon.some((d) => !d.isEgg && (originalSpecies(d.speciesId)?.stage ?? 0) >= maxStageForRank(rank))) return save;
  return queueMails(save, [0x7b + 10 * k + (rank - 1)]);
}

// ---------- NPC 매입 제안 (원본 overlay9_18 0x2129064) ----------
/**
 * 10·15·20시 정각마다(쿨타임 +0x18: 굴리면 1, 20분마다 1 감소 — 0x2128FBC) 100면 주사위를 굴려 5 미만이면
 * 무작위 세대(0~6)를 하나 골라 그 세대인 첫 디지몬을 사겠다는 메일이 온다.
 * 값 = 종 기본 가격(디지몬 표 +0x80) × (8 + 0~3) / 10, 메일은 이벤트 0x5E~0x62 중 하나.
 * 주사위 5~9의 디지몬 콜렉터(0x64)와 프리 배틀 활약 매입(0x65~0x69)은 아래 함수에서 다룬다.
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
// 0x64 디지몬 콜렉터, 0x65~0x69 프리 배틀 활약 매입 (보낸 사람은 0x5E~0x62와 같은 다섯 명)
const COLLECTOR_TEXT = '{name}(이)랑 함께라면\n잘 지낼 수 있을 것 같아.\n{price}bit 줄 테니 보내 줄래?';
const BATTLE_OFFER_TEXT = [
  '{name}의 배틀 봤어!\n우리 팀에 꼭 필요해.\n{price}bit 줄게!',
  '{name}처럼 강한 디지몬이\n있으면 좋겠어요.\n{price}bit에 양보해 주세요.',
  '그 배틀의 {name}, 대단하던데!\n{price}bit로 거래하자!',
  '{name}(을)를 우리 팀에 맞이하고 싶다!\n{price}bit 어떤가!',
  '{name} 정말 강하더라.\n나도 갖고 싶어!\n{price}bit 낼게.',
];
export const offerText = (o: NpcOffer, name: string) => {
  const t = o.id === COLLECTOR_OFFER ? COLLECTOR_TEXT : o.id >= BATTLE_OFFER ? BATTLE_OFFER_TEXT[(o.id - BATTLE_OFFER) % 5] : OFFER_TEXT[(o.id - 0x5e) % OFFER_TEXT.length];
  return t.replace('{name}', name).replace('{price}', o.price.toLocaleString('ko-KR'));
};
export const COLLECTOR_OFFER = 0x64;
export const BATTLE_OFFER = 0x65;
/**
 * 정각마다 부른다. 굴릴 시각이 아니거나 답하지 않은 제안이 있으면(웹판: 제안은 하나씩) null.
 * 100면 주사위 0~4: 무작위 세대(rand % 7) 첫 디지몬, 값 = 기본 가격 × (8 + rand % 4)/10, 0x5E~0x62.
 * 5~9: 배(+0x08)가 0이고 페널티(+0x3D)가 3 이상인 첫 디지몬을 기본 가격에 — 0x64 디지몬 콜렉터(0x2129340).
 *   원본은 +0x24 = 0도 보는데 그 칸의 뜻을 몰라 웹판은 보지 않는다(임시).
 */
export function rollNpcOffer(save: SaveData, hour: number, rng: () => number): { save: SaveData; offer?: NpcOffer } | null {
  if (!OFFER_HOURS.includes(hour) || save.npcOffer) return null;
  const next = save;
  const dice = Math.floor(rng() * 100);
  if (dice >= 10) return { save: next };
  if (dice >= 5) {
    const d = save.digimon.find((x) => !x.isEgg && x.hunger <= 0 && x.penalties >= 3);
    const base = d ? originalSpecies(d.speciesId)?.price ?? 0 : 0;
    if (!d || base <= 0) return { save: next };
    const offer = { id: COLLECTOR_OFFER, uid: d.uid, price: base, from: '디지몬 콜렉터' };
    return { save: { ...next, npcOffer: offer }, offer };
  }
  const stage = Math.floor(rng() * 7);
  const d = save.digimon.find((x) => !x.isEgg && originalSpecies(x.speciesId)?.stage === stage);
  const base = d ? originalSpecies(d.speciesId)?.price ?? 0 : 0;
  if (!d || base <= 0) return { save: next };
  const price = Math.floor((base * (8 + Math.floor(rng() * 4))) / 10);
  const id = 0x5e + Math.floor(rng() * 5);
  const offer = { id, uid: d.uid, price, from: OFFER_FROM[id - 0x5e] };
  return { save: { ...next, npcOffer: offer }, offer };
}

/**
 * 프리 배틀을 이긴 뒤 매입 후보 정하기 (overlay9_19 0x2111A0C~0x2111B24).
 * 디지몬이 5마리 이상이면, 상대 첫 디지몬을 쓰러뜨린 것이 내 첫째·둘째 출전 디지몬이면(원본은 두 칸만 본다)
 * rand % 100이 10보다 클 때(89%) 그 디지몬을 후보로 둔다.
 */
export function pickOfferCandidate(save: SaveData, units: { id: number; team: 0 | 1; uid?: number; koBy?: number }[], rng: () => number): SaveData {
  if (save.digimon.length < 5) return save;
  const mine = units.filter((u) => u.team === 0).slice(0, 2);
  const foe = units.find((u) => u.team === 1);
  const killer = mine.find((u) => foe?.koBy !== undefined && u.id === foe.koBy);
  if (!killer?.uid || Math.floor(rng() * 100) <= 10) return save;
  return { ...save, offerCandidate: killer.uid };
}
/**
 * 후보가 있으면 다음 판정 때(육성 화면, 시각과 상관없이 — overlay9_18 0x2129084) 50%로 제안하고, 어느 쪽이든 후보를 지운다.
 * 값 = 기본 가격 × 3 × (8 + rand % 5)/10, 메일 0x65 + rand % 5.
 */
export function rollBattleOffer(save: SaveData, rng: () => number): SaveData {
  if (save.offerCandidate === undefined || save.npcOffer) return save;
  const { offerCandidate, ...rest } = save;
  if (Math.floor(rng() * 2) === 0) return rest;
  const d = save.digimon.find((x) => x.uid === offerCandidate);
  const base = d ? originalSpecies(d.speciesId)?.price ?? 0 : 0;
  if (!d || base <= 0) return rest;
  const step = Math.floor((base * 3) / 10);
  const price = base * 3 - 2 * step + step * Math.floor(rng() * 5);
  const k = Math.floor(rng() * 5);
  return { ...rest, npcOffer: { id: BATTLE_OFFER + k, uid: d.uid, price, from: OFFER_FROM[k] } };
}
export function answerNpcOffer(save: SaveData, accept: boolean): SaveData {
  const o = save.npcOffer;
  if (!o) return save;
  const { npcOffer, ...rest } = save;
  if (!accept || !save.digimon.some((d) => d.uid === o.uid)) return rest;
  return { ...rest, digimon: save.digimon.filter((d) => d.uid !== o.uid), bits: Math.min(MONEY_MAX, save.bits + o.price) };
}
