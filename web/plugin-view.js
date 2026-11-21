 'use strict';
(function(root){
 root.pluginLoadoutHtml=function(C,save,esc){
  const slots=C.pluginSlots(save),equipped=C.equippedPlugins(save),ids=equipped.map(p=>p.id);
  const owned=C.PLUGINS.filter(p=>(save.plugins||[]).includes(p.id));
  const labels={1:'애널라이저',2:'체커',3:'레이더',4:'메모리'};
  const analyze={stage:'세대',family:'종족',attr:'속성',hp:'체력',personality:'성격',size:'용량'};
  const check={shot:'샷',wire:'와이어',entrap:'유인·포획 장비',damage:'폭탄·마인'};
  function detail(p){
   if(p.analyze)return '확인: '+p.analyze.map(k=>analyze[k]).join(' · ');
   if(p.check)return '남은 수량: '+p.check.map(k=>check[k]).join(' · ');
   if(p.memory)return '포획한 디지몬의 사용 용량 확인';
   return '미니맵 탐지: '+(p.radar?.stages?.map(n=>C.STAGE_LABEL[n]).join(' · ')||p.radar?.attrs?.join(' · ')||p.radar?.families?.join(' · ')||'대상 디지몬');
  }
  function card(p,slot=false){
   const on=ids.includes(p.id),disabled=!on&&ids.length>=slots;
   // 색상/분류 대응은 웹판 배치. 카트리지 도트는 원본 셀0~3 그대로 사용.
   return `<button type="button" data-plugin="${esc(p.id)}" class="plugin-card ${on?'active':''}" aria-pressed="${on}"${disabled?' disabled':''}><img src="assets/hunt/plugin_${p.category-1}.png" alt="" width="128" height="32"><span><b>${esc(p.name)}</b><small>${esc(slot?'눌러서 해제':detail(p))}</small></span><em>${on?'장착':'장착하기'}</em></button>`;
  }
  const rack=Array.from({length:slots},(_,i)=>equipped[i]?card(equipped[i],true):`<div class="plugin-empty"><b>${i+1}</b><span>빈 슬롯</span></div>`).join('');
  const groups=[1,2,3,4].map(category=>{const list=owned.filter(p=>p.category===category);return list.length?`<section class="plugin-group"><h4>${labels[category]}</h4><div class="plugin-cards">${list.map(p=>card(p)).join('')}</div></section>`:'';}).join('');
  return `<section class="plugin-loadout" aria-label="사냥 플러그인 장비"><h3>플러그인 <span>${ids.length}/${slots}칸</span></h3><div class="plugin-rack">${rack}</div><p class="hint">${ids.length>=slots?'장착 칸이 가득 찼습니다. 장착한 플러그인을 눌러 해제할 수 있어요.':'아래 보유 목록에서 플러그인을 골라 장착하세요.'}</p>${groups||'<p class="hint">가진 플러그인이 없습니다. 상점에서 구입할 수 있어요.</p>'}</section>`;
 };
})(typeof window!=='undefined'?window:globalThis);
