'use strict';

(function (root) {
  root.openBattleEntry = function ({ C, getSave, showModal, $, esc, nameOf, canFight, prepare, start, persist }) {
    const freeSteps = ['경기 형식', '상대 팀', '출전 디지몬', '배틀 로비'];
    const titleSteps = ['타이틀 매치', '출전 디지몬', '배틀 로비'];
    const tactics = ['일반', '지원', '특수'];
    const roster = [];
    let format, offer, prepared, titleRoute = false;
    const bits = n => n.toLocaleString('ko-KR') + ' ฿';
    const dateKey = d => [d.year, d.season, d.day].join(':');
    const freeOpen = d => d.hour >= 8 && d.hour < 21;
    const body = () => $('#modal-body');
    const primary = () => $('#modal-ok');
    const team = () => roster.map(uid => getSave().digimon.find(d => d.uid === uid));

    function step(index, title, content, { back, next, label = '취소' } = {}) {
      const steps = titleRoute ? titleSteps : freeSteps;
      const progress = steps.map((name, i) => `<li${i === index ? ' aria-current="step"' : ''}>${name}</li>`).join('');
      showModal(title, `<section class="battle-entry"><ol class="battle-entry-steps" aria-label="배틀 준비 단계">${progress}</ol>
        ${back ? '<button type="button" class="quiet entry-back" data-entry-back>‹ 이전</button>' : ''}
        ${content}</section>`, 'BATTLE ENTRY', label);
      const modal = $('#modal');
      modal.classList.add('battle-entry-modal');
      modal.scrollTop = 0;
      if (back) body().querySelector('[data-entry-back]').onclick = () => back();
      if (next) primary().onclick = next;
      const heading = $('#modal-title');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }

    function formatStep() {
      if (titleRoute) resetSelection();
      titleRoute = false;
      step(0, '배틀 형식 선택', `<div class="battle-format-options">${[1, 3].map(n =>
        `<button type="button" data-format="${n}"><b>${n} vs ${n}</b><span>${n === 1 ? '한 마리로 출전' : '세 마리로 팀 출전'}</span></button>`
      ).join('')}<button type="button" class="entry-title-option" data-title-route><b>타이틀 매치</b><span>경기 규정에 맞춰 출전</span></button></div>`);
      body().querySelector('[data-title-route]').onclick = () => {
        resetSelection();
        titleRoute = true;
        opponentStep();
      };
      for (const button of body().querySelectorAll('[data-format]')) {
        button.onclick = () => {
          const chosen = Number(button.dataset.format);
          if (format !== chosen) resetSelection();
          format = chosen;
          opponentStep();
        };
      }
    }

    function resetSelection() {
      roster.length = 0;
      format = offer = prepared = undefined;
    }

    function opponents(save, date) {
      const day = dateKey(date);
      if (titleRoute) return C.todaysMatches(save).map(match => {
        const holder = C.titleHolder(match.id);
        return { group: '타이틀 매치', name: match.name, members: holder?.members, day,
          key: `title:${day}:${match.id}:${match.name}`, opponent: holder?.name, limits: C.entryLimits(match),
          reward: match.id === 'prelim' ? `예선 통과 상금 ${bits(C.PRELIM_PRIZE)}` : match.id === 'final' ? `챔피언십 우승 상금 ${bits(C.CHAMP_PRIZE)}` : '',
          setup: { title: match.name, match, format: match.format, foes: match.foes, stage: match.stage, scale: match.scale, prize: match.prize } };
      });
      const choices = [];
      const challenge = save.challenge;
      const challenger = challenge && C.npcTeam(challenge.team);
      if (challenger?.members.length === format) {
        choices.push({ group: '도전장', name: `${challenge.from}의 도전 「${challenge.name}」`,
          members: challenger.members, key: `rival:${challenge.id}:${challenge.team}`, challengeId: challenge.id,
          setup: { title: `${challenge.from}의 도전 「${challenge.name}」`, format, stage: 3, scale: 1, prize: challenge.prize, rival: challenge.team } });
      }
      const dateArgs = [date.year, date.season, date.day];
      function addFree(free, group, extra = false) {
        choices.push({ group, extra, name: free.label, members: free.foes, day,
          key: `free:${day}:${free.label}:${free.foes.map(f => f.no).join(',')}`, closed: !freeOpen(date),
          setup: { title: `프리 배틀 ${free.label}`, format, stage: free.stage, scale: 1, prize: free.prize, free } });
      }
      for (const free of C.freeBattleLineup(...dateArgs).filter(f => f.format === format)) addFree(free, '프리 배틀');
      if (format === 3) {
        for (const free of C.extraFreeBattleLineup(...dateArgs)) addFree(free, C.STAGE_LABEL[free.stage], true);
      }
      return choices;
    }

    function offerProblem(choice) {
      const save = getSave(), date = C.dateOf(save.clock), setup = choice.setup;
      if ((choice.day && choice.day !== dateKey(date)) ||
          (setup.free && !freeOpen(date)) ||
          (setup.match && !C.todaysMatches(save).some(m => m.id === setup.match.id && m.name === setup.match.name)) ||
          (setup.rival && (save.challenge?.id !== choice.challengeId || save.challenge?.team !== setup.rival))) return '이 경기는 지금 신청할 수 없습니다.';
      return save.bits < (setup.match?.fee ?? 0) ? '참가비가 부족합니다.' : '';
    }

    const speciesList = members => members?.map(d => C.getSpecies(d.speciesId).name).join(' · ');
    const reward = choice => choice.reward || `상금 ${bits(choice.setup.prize)}`;
    function opponentStep(error = '') {
      const save = getSave(), date = C.dateOf(save.clock), choices = opponents(save, date);
      const extraGroups = [...new Set(choices.filter(choice => choice.extra).map(choice => choice.group))];
      const sections = (titleRoute ? ['타이틀 매치'] : ['도전장', '프리 배틀', ...extraGroups]).map(group => {
        const matches = choices.flatMap((choice, i) => {
          if (choice.group !== group) return [];
          const { setup } = choice;
          return [`<button type="button" data-opponent="${i}"${choice.closed ? ' disabled' : ''}><b>${esc(choice.name)}</b>
            <small>${[`${setup.format} vs ${choice.members?.length ?? setup.foes ?? setup.format}`, choice.opponent, speciesList(choice.members) || '상대 편성은 로비에서 공개', reward(choice),
              setup.match?.fee ? `참가비 ${bits(setup.match.fee)}` : '', choice.limits].filter(Boolean).map(esc).join(' · ')}</small></button>`];
        });
        if (extraGroups.includes(group)) {
          return `<details class="entry-stage-teams"><summary>${esc(group)} · ${matches.length}팀</summary><div class="menu-list">${matches.join('')}</div></details>`;
        }
        if (!matches.length && group === '도전장') return '';
        const note = group === '타이틀 매치' && !matches.length ? '현재 신청할 수 있는 타이틀 매치가 없습니다. (07:00~15:00)' :
          group === '프리 배틀' && !freeOpen(date) ? '프리 배틀은 08:00~21:00에 신청할 수 있습니다.' : '';
        const schedule = titleRoute && !matches.length ? C.upcoming(save)[0] : '';
        return `<section class="battle-opponent-group">${titleRoute ? '' : `<h3>${group}</h3>`}${note ? `<p class="hint">${note}</p>` : ''}
          ${schedule ? `<p class="hint">다음 일정 · ${esc(schedule)}</p>` : ''}<div class="menu-list">${matches.join('')}</div></section>`;
      }).join('');
      const notice = error ? `<p class="entry-issue" role="status">${esc(error)}</p>` : '';
      step(titleRoute ? 0 : 1, titleRoute ? '타이틀 매치' : `${format} vs ${format} 상대 선택`, notice + sections, { back: formatStep });
      for (const button of body().querySelectorAll('[data-opponent]')) {
        button.onclick = () => {
          const choice = choices[Number(button.dataset.opponent)];
          const problem = offerProblem(choice);
          if (problem) return opponentStep(problem);
          if (offer?.key !== choice.key) {
            prepared = undefined;
            if (format !== choice.setup.format) roster.length = 0;
          }
          offer = choice;
          format = choice.setup.format;
          rosterStep();
        };
      }
    }

    function eligibility(d) {
      if (!d) return '사육 중인 디지몬을 선택해 주세요.';
      if (!canFight(d)) return d.isEgg ? '부화 전' : d.dying ? '빈사 상태' : d.sick ? '병에 걸림' : d.injured ? '부상 상태' : 'HP 부족';
      return offer.setup.match ? C.entryProblems(offer.setup.match, [d]).join(' · ') : '';
    }

    function rosterStep(error = '') {
      const save = getSave();
      const selected = team();
      for (let i = roster.length - 1; i >= 0; i--) if (eligibility(selected[i])) roster.splice(i, 1);
      const cards = save.digimon.map(d => {
        const problem = eligibility(d);
        const detail = problem || `${C.STAGE_LABEL[C.getSpecies(d.speciesId).stage]} · ${d.personality} · 배틀 ${d.battles}회`;
        const sp = d.isEgg ? '' : C.supportSkills(d.speciesId, d.personality).map(s => `${s.name} (${s.tpCost}TP)`).join(' · ');
        return `<button type="button" data-entrant="${d.uid}" aria-pressed="false"${problem ? ' disabled' : ''}><b><span class="roster-order"></span>${esc(nameOf(d))}</b>
          <small>${esc(detail)}</small>${sp ? `<small>SP · ${esc(sp)}</small>` : ''}</button>`;
      }).join('');
      step(titleRoute ? 1 : 2, '출전 디지몬 선택', `<p class="entry-match">${esc(offer.name)}</p>
        <p class="hint">디지몬 ${format}마리를 골라 주세요.${format === 3 ? ' 선택한 순서대로 출전합니다.' : ''}</p>
        ${error ? `<p class="entry-issue" role="status">${esc(error)}</p>` : ''}
        <div class="battle-roster">${cards || '<p class="hint">사육 중인 디지몬이 없습니다.</p>'}</div>
        <p id="entry-roster-status" class="hint" role="status"></p>`,
      { back: opponentStep, next: lobbyStep, label: '로비로 이동' });

      const buttons = [...body().querySelectorAll('[data-entrant]')];
      function updateSelection() {
        for (const b of buttons) {
          const order = roster.indexOf(Number(b.dataset.entrant));
          b.classList.toggle('active', order >= 0);
          b.setAttribute('aria-pressed', String(order >= 0));
          b.querySelector('.roster-order').textContent = order >= 0 ? `${order + 1}. ` : '';
        }
        primary().disabled = roster.length !== format;
        const names = team().filter(Boolean).map(nameOf).join(' → ');
        body().querySelector('#entry-roster-status').textContent = `선택 ${roster.length}/${format}${names ? ' · ' + names : ''}`;
      }
      for (const b of buttons) b.onclick = () => {
        const uid = Number(b.dataset.entrant), index = roster.indexOf(uid);
        if (index >= 0) roster.splice(index, 1);
        else if (!eligibility(getSave().digimon.find(d => d.uid === uid))) {
          if (format === 1) roster[0] = uid;
          else if (roster.length < format) roster.push(uid);
        }
        updateSelection();
      };
      updateSelection();
    }

    function portrait(d) {
      const art = root.DEX_ART, entry = art?.entries[d.speciesId];
      if (!entry) return '';
      const x = entry.index % art.columns * 96, y = Math.floor(entry.index / art.columns) * 80;
      return `<span class="dex-portrait" aria-hidden="true" style="background-position:-${x}px -${y}px"></span>`;
    }

    function teamProblem() {
      return roster.length !== format ? `디지몬 ${format}마리를 선택해 주세요.` : team().map(eligibility).find(Boolean) || '';
    }

    function lobbyStep() {
      const problem = offerProblem(offer);
      if (problem) return opponentStep(problem);
      const issue = teamProblem();
      if (issue) return rosterStep(issue);
      // 로비에 표시한 상대와 경기장을 출전 시에도 그대로 사용한다.
      prepared ??= prepare(offer.setup);
      const { map, foes } = prepared, fee = offer.setup.match?.fee ?? 0;
      const allies = team().map((d, i) => `<li>${portrait(d)}<b>${i + 1}. ${esc(nameOf(d))}</b>
        <div class="entry-tactics" role="group" aria-label="${esc(nameOf(d))} 작전">${tactics.map(t =>
          `<button type="button" data-tactic="${d.uid}" data-mode="${t}" aria-pressed="${(d.tactic ?? '일반') === t}">${t}</button>`).join('')}</div></li>`).join('');
      const enemies = foes.map((f, i) => {
        const species = C.getSpecies(f.speciesId).name, nick = offer.members?.[i]?.nick;
        return `<li>${portrait(f)}<b>${i + 1}. ${esc(nick || species)}</b>${nick && nick !== species ? `<small>${esc(species)}</small>` : ''}</li>`;
      }).join('');
      step(titleRoute ? 2 : 3, '배틀 로비', `<p class="entry-match">${esc(offer.name)}</p><p class="hint">${format} vs ${foes.length} · ${esc(map?.name ?? '일반 경기장')} · ${fee ? '참가비 ' + bits(fee) : '무료 출전'} · ${esc(reward(offer))}</p>
        <div class="entry-teams"><section><h3>내 팀</h3><ol>${allies}</ol></section><section><h3>${esc(offer.opponent || '상대 팀')}</h3><ol>${enemies}</ol></section></div>`,
      { back: () => rosterStep(), label: '배틀 시작', next: () => {
        const unavailable = offerProblem(offer);
        if (unavailable) return opponentStep(unavailable);
        const invalid = teamProblem();
        if (invalid) return rosterStep(invalid);
        start(offer.setup, [...roster], prepared);
      } });
      const buttons = [...body().querySelectorAll('[data-tactic]')];
      for (const button of buttons) button.onclick = () => {
        const d = getSave().digimon.find(mon => mon.uid === Number(button.dataset.tactic));
        if (!d) return;
        d.tactic = button.dataset.mode;
        persist();
        for (const other of buttons) if (other.dataset.tactic === button.dataset.tactic)
          other.setAttribute('aria-pressed', String(other.dataset.mode === d.tactic));
      };
    }

    formatStep();
  };
})(window);
