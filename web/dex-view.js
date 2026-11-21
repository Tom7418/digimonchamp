 'use strict';
(function(root){
 root.dexViewHtml=function(C,save,selectedNo,esc){
  const entries=C.dexEntries(save),pick=entries.find(e=>e.no===selectedNo&&e.registered)||(!selectedNo?entries.find(e=>e.registered):null);
  function portrait(e,large=false){
   const m=root.DEX_ART.entries[e.id];if(!m)return '';
   const x=m.index%root.DEX_ART.columns*96,y=Math.floor(m.index/root.DEX_ART.columns)*80;
   return `<span class="dex-portrait ${large?'large':''}" aria-hidden="true" style="background-position:-${x}px -${y}px"></span>`;
  }
  const detail=pick?`<div class="dex-detail"><div class="dex-original-stage"><b class="dex-stage-title">${esc(pick.name)}</b>${portrait(pick,true)}</div><div><small>No.${String(pick.no).padStart(3,'0')}</small><h3>${esc(pick.name)}</h3><p>${esc(pick.stage)} · ${esc(pick.attr)} · ${esc(pick.family)}</p><p>용량 ${pick.size}G${C.eraLabel(pick.id)?' · '+esc(C.eraLabel(pick.id)):''}</p><h4>필살기</h4><p>${pick.skills.map(esc).join(' · ')||'없음'}</p></div></div>`:'<p class="hint">디지몬을 손에 넣거나 진화시키면 도감에 등록됩니다.</p>';
  return `<section class="dex-browser"><p class="dex-count">등록 ${C.dexCount(save)} / ${entries.length}</p>${detail}<div class="dex-grid">${entries.map(e=>`<button type="button" data-dex="${e.no}" class="${pick?.no===e.no?'active':''}"${e.registered?'':' disabled'} aria-pressed="${pick?.no===e.no}"><small>No.${String(e.no).padStart(3,'0')}</small>${e.registered?portrait(e):'<span class="dex-unknown" aria-hidden="true">?</span>'}<span>${e.registered?esc(e.name):'미등록'}</span></button>`).join('')}</div></section>`;
 };
})(typeof window!=='undefined'?window:globalThis);
