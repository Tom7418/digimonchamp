// 그림/반응형 배치만 담당한다. 장비 칸·보유 수량·사용 효과는 기존 엔진을 따른다.
(function(root){
 const labels={2:'샷',3:'와이어',4:'고기',5:'미끼',6:'라이트',7:'폭탄',8:'마인',9:'함정'};
 root.huntItemLoadoutHtml=function(C,save,esc){
  const now=C.huntItems(save),all=[...C.SHOTS,...C.BAITS,...C.GEARS],art=root.HUNT_ITEM_UI.icons;
  const owned=all.filter(x=>C.gearCount(save,x.id)>0||now.includes(x.id));
  function icon(id){const a=art[id];return a?`<span class="hunt-item-icon" aria-hidden="true" style="background-position:-${a.x*2}px -${a.y*2}px"></span>`:'';}
  function button(x,slot=null){
   const on=now.includes(x.id),count=C.gearCount(save,x.id),disabled=!on&&(now.length>=C.HUNT_ITEM_SLOTS||count<=0);
   const label=`${x.name} · ${count}개 · ${on?'눌러서 해제':'장착하기'}`;
   return `<button type="button" data-hunt-item="${esc(x.id)}" class="hunt-item-card${slot!==null?' hunt-item-slot':''}${on?' active':''}${count===0?' depleted':''}" aria-label="${esc(label)}" aria-pressed="${on}"${disabled?' disabled':''}>${slot!==null?`<span class="hunt-slot-number">${slot+1}</span>`:''}<span class="hunt-item-art">${icon(x.id)}</span><span class="hunt-item-copy"><b>${esc(x.name)}</b><small>${count===0?'소진':`×${count}`}</small></span>${slot===null?`<em>${on?'장착 중':'장착'}</em>`:''}</button>`;
  }
  const rack=Array.from({length:C.HUNT_ITEM_SLOTS},(_,i)=>{
   const x=all.find(x=>x.id===now[i]);
   return x?button(x,i):`<div class="hunt-item-slot hunt-item-empty" aria-label="${i+1}번 빈 장비 칸"><span class="hunt-slot-number">${i+1}</span><span class="hunt-item-art"></span><b>빈 칸</b></div>`;
  }).join('');
  const groups=Object.entries(labels).map(([category,label])=>{
   const items=owned.filter(x=>art[x.id]?.category===+category);
   return items.length?`<section class="hunt-item-group"><h4>${label}</h4><div class="hunt-item-cards">${items.map(x=>button(x)).join('')}</div></section>`:'';
  }).join('');
  return `<section class="hunt-items" aria-label="사냥 아이템 장비"><h3>사냥 아이템 <span>${now.length}/${C.HUNT_ITEM_SLOTS}칸</span></h3><div class="hunt-item-rack">${rack}</div><p class="hint">${now.length>=C.HUNT_ITEM_SLOTS?'5칸을 모두 장비했습니다. 위 아이템을 눌러 빼고 다른 아이템을 골라 주세요.':'아래 보유 목록에서 아이템을 골라 장비하세요. 위 아이템을 누르면 해제됩니다.'}</p>${groups||'<p class="hint">가진 사냥 아이템이 없습니다. 상점에서 구입할 수 있어요.</p>'}<p class="hint">장비한 아이템만 사냥터에서 사용할 수 있습니다. 로프와 기본 와이어는 별도로 가져갑니다.</p></section>`;
 };
})(typeof window!=='undefined'?window:globalThis);
