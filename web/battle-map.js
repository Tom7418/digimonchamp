'use strict';
(function(root){
  // 배경은 원본 해상도 그대로 캐시한다. 전투 위치만 경기장 안쪽으로 투영하며 규칙 좌표는 바꾸지 않는다.
  root.createBattleMapRenderer=function({makeCanvas}={}){
    const images=new Map(),surfaces=new Map();
    const viewport={x:28,y:70,scale:.75};
    makeCanvas=makeCanvas||(()=>{
      if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(416,272);
      return typeof document!=='undefined'?document.createElement('canvas'):null;
    });
    function preload(map){
      if(!images.has(map.asset)){
        const img=new Image(),entry={img,failed:false,fallback:false};
        img.decoding='async';img.fetchPriority='high';
        img.onerror=()=>{
          if(!entry.fallback&&map.asset.endsWith('.png')){entry.fallback=true;img.src=map.asset;}
          else entry.failed=true;
        };
        img.src=map.asset.replace(/\.png$/,'.webp');images.set(map.asset,entry);
      }
      return images.get(map.asset).img;
    }
    function status(map){
      const img=preload(map),entry=images.get(map.asset);
      return entry.failed?'failed':img.complete&&img.naturalWidth?'ready':'loading';
    }
    function spriteScale(meta){
      // 보통 종은 원본 도트 크기, 큰 종은 전체 비율을 유지하며 화면에 맞춘다.
      return Math.min(1/viewport.scale,80/(Math.max(1,meta?.baseline||60)*viewport.scale),80/(Math.max(1,meta?.body||40)*viewport.scale));
    }
    function draw(ctx,map,width,height){
      const img=preload(map);
      ctx.fillStyle='#203a3d';ctx.fillRect(0,0,width,height);
      ctx.imageSmoothingEnabled=false;
      if(status(map)==='ready'){
        let surface=surfaces.get(map.asset);
        if(!surface){
          surface=makeCanvas();
          if(surface){surface.width=map.width;surface.height=map.height;
            const buffer=surface.getContext('2d');buffer.imageSmoothingEnabled=false;buffer.drawImage(img,0,0,map.width,map.height);
            surfaces.set(map.asset,surface);if(surfaces.size>3)surfaces.delete(surfaces.keys().next().value);
          }
        }else{surfaces.delete(map.asset);surfaces.set(map.asset,surface);}
        const scale=Math.min(width/map.width,height/map.height);
        const w=map.width*scale,h=map.height*scale;
        ctx.drawImage(surface||img,(width-w)/2,(height-h)/2,w,h);return true;
      }
      return false;
    }
    return {preload,status,draw,spriteScale,viewport};
  };
})(window);
