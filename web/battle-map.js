'use strict';
(function(root){
  // 경기가 바뀔 때만 이미지를 읽고 원본416×272 비율로 전체를 표시한다.
  // 배틀 규칙/위치 계산은 기존480×250 공간을 유지하고 그림만 위아래32px 확장한다.
  root.createBattleMapRenderer=function(){
    const images=new Map();
    function preload(map){
      if(!images.has(map.id)){
        const img=new Image();img.src=map.asset;images.set(map.id,img);
      }
      return images.get(map.id);
    }
    function draw(ctx,map,width,height){
      const img=preload(map);
      ctx.fillStyle='#203a3d';ctx.fillRect(0,0,width,height);
      if(img.complete&&img.naturalWidth){
        const scale=Math.min(width/map.width,height/map.height);
        const w=map.width*scale,h=map.height*scale;
        ctx.drawImage(img,(width-w)/2,(height-h)/2,w,h);
      }
    }
    return {preload,draw};
  };
})(window);
