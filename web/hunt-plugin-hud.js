// 원본 사냥 HUD 그림. 표시 권한·탐지 대상·용량 값은 기존 엔진에서 전달받는다.
(function(root){
 root.createHuntPluginHud=function(data=root.HUNT_PLUGIN_ART){
  const image=new Image(),frame=new Image();image.src='assets/hunt/plugin-hud.png';frame.src='assets/hunt/radar-frame.png';
  function cell(ctx,id,x,y,w,h){const c=data.cells[id];if(!c||!image.complete||!image.naturalWidth)return false;ctx.drawImage(image,c.x,c.y,c.w,c.h,x,y,w??c.w,h??c.h);return true;}
  // 이 NANR는 반복 동작이 아니다. 기존 웹판의 묶임/탐지 색 구분에 원본 두 셀을 사용한다.
  function markerCell(bound){return data.marker.frames[bound?0:1][0];}
  function radar(ctx,hunt,mm,species){
   ctx.save();ctx.imageSmoothingEnabled=false;
   if(frame.complete&&frame.naturalWidth){
    // 원본 비대칭 금색 모서리는 2배 크기로 보존하고 가운데만 늘린다.
    const sx=[0,3,59,68],sy=[0,2,58,62],dx=[mm.x-6,mm.x,mm.x+mm.w,mm.x+mm.w+18],dy=[mm.y-4,mm.y,mm.y+mm.h,mm.y+mm.h+8];
    for(let j=0;j<3;j++)for(let i=0;i<3;i++)ctx.drawImage(frame,sx[i],sy[j],sx[i+1]-sx[i],sy[j+1]-sy[j],dx[i],dy[j],dx[i+1]-dx[i],dy[j+1]-dy[j]);
   }
   else{ctx.fillStyle='#143e32';ctx.fillRect(mm.x-6,mm.y-6,mm.w+12,mm.h+12);}
   if(hunt.map?.complete&&hunt.map.naturalWidth)ctx.drawImage(hunt.map,0,0,hunt.size.w,hunt.size.h,mm.x,mm.y,mm.w,mm.h);
   for(const w of hunt.wilds){if(w.gone||!(w.bound>0||hunt.plug?.onRadar(species(w.id))))continue;cell(ctx,markerCell(w.bound>0),mm.x+w.x*mm.k-1.5,mm.y+w.y*mm.k-1.5,3,3);}
   cell(ctx,data.viewport,mm.x+hunt.cam.x*mm.k,mm.y+hunt.cam.y*mm.k,960/hunt.zoom*mm.k,560/hunt.zoom*mm.k);ctx.restore();
  }
  function attribute(ctx,name,x,y,size=12){const id=data.attributes[name];if(id===undefined)return false;ctx.save();ctx.imageSmoothingEnabled=false;const c=data.cells[id];const h=size*c.h/c.w;const ok=cell(ctx,id,x,y+(size-h)/2,size,h);ctx.restore();return ok;}
  function memory(ctx,current,max){
   const text=String(Math.max(0,Math.trunc(current)))+'G/'+String(Math.max(0,Math.trunc(max)))+'G',scale=2;
   const ids=Array.from(text,ch=>ch==='G'?data.g:ch==='/'?data.divider:data.digits[Number(ch)]);
   const width=ids.reduce((n,id)=>n+data.cells[id].w*scale+2,0),x=944-width;let pen=x;
   ctx.save();ctx.imageSmoothingEnabled=false;ctx.fillStyle='#102d35';ctx.fillRect(x-8,8,width+16,34);
   for(const id of ids){const c=data.cells[id];cell(ctx,id,pen,25-c.h*scale/2,c.w*scale,c.h*scale);pen+=c.w*scale+2;}ctx.restore();
   return {x:x-8,width:width+16};
  }
  return {radar,attribute,memory,markerCell};
 };
})(typeof window!=='undefined'?window:globalThis);
