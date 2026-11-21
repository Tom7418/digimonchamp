// 원본 도트만 사용한다. 반응형 배치와 경기 집계 표시는 웹판 정책이다.
(function(root){
 const art='assets/day-result/';
 root.titleMedalHtml=function(match,esc){
  const n=/^m(\d+)$/.exec(match?.id||'');if(!n||+n[1]>60)return '';
  return `<section class="title-medal-result" aria-label="타이틀 메달 획득"><div class="result-win"><img src="${art}win.png" alt="WIN!"></div><div class="medal-panel"><h3>${esc(match.name)}</h3><img class="title-medal" src="${art}medal-${String(+n[1]+1).padStart(2,'0')}.png" alt="${esc(match.name)} 메달"><p>타이틀 메달을 획득!</p></div></section>`;
 };
 root.dayResultCalendarHtml=function(C,morning,marks,esc){
  const seasons=['spring','summer','autumn','winter'],names=['봄','여름','가을','겨울'];
  const season=seasons[morning.season],name=names[morning.season];
  const cells=Array.from({length:C.DAYS_PER_SEASON},(_,i)=>{
   const day=i+1,entries=marks[day]||[],won=entries.filter(x=>x.won).length,remaining=entries.length-won;
   const label=`${day}일${entries.length?': '+entries.map(x=>x.name+(x.won?' (획득)':'')).join(', '):': 예정 경기 없음'}`;
   return `<div class="original-cal-cell${day===morning.day?' today':''}"${day===morning.day?' aria-current="date"':''} title="${esc(label)}" aria-label="${esc(label)}"><div class="cal-date">${day===morning.day?`<img src="${art}day-${day}.png" alt="">`:''}</div>${entries.length?`<div class="cal-counts"><span><img src="${art}checked.png" alt="획득">${won}</span><span><img src="${art}unchecked.png" alt="미획득">${remaining}</span></div>`:''}</div>`;
  }).join('');
  return `<div class="original-day-change"><div class="original-date-card"><img src="${art}${season}.png" alt="${name}"><span><b>${morning.day}</b> 일</span></div><div class="original-calendar" style="background-image:url('${art}calendar-${season}.png')" aria-label="${name} 경기 달력"><div class="original-cal-grid">${cells}</div></div></div><p class="calendar-help">체크 표시는 획득한 타이틀 수입니다. 날짜 위에 포인터를 올리면 경기 이름을 볼 수 있습니다.</p>`;
 };
})(window);
