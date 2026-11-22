// 원본 HP 게이지 그림과 표시용 보간. 엔진 HP/최대 HP는 수정하지 않는다.
(function(root){
 const images=Object.fromEntries(['frame','green','red'].map(name=>{const image=new Image();image.src=`assets/ui/hp-${name}.png`;return [name,image];}));
 const clamp=(value,max)=>Math.max(0,Math.min(max,Number.isFinite(value)?value:0));
 root.createHpBars=function(){
  const states=new Map();let seen=null;
  const now=()=>performance.now();
  function displayed(s,time){const p=Math.max(0,Math.min(1,(time-s.start)/350));return s.from+(s.target-s.from)*(1-(1-p)**3);}
  function sample(key,value,max,time=now()){
   max=Math.max(0,Number.isFinite(max)?max:0);value=clamp(value,max);seen?.add(key);
   let s=states.get(key);
   if(!s||s.max!==max){s={from:value,target:value,max,start:time};states.set(key,s);}
   else if(s.target!==value){s.from=displayed(s,time);s.target=value;s.start=time;}
   return displayed(s,time);
  }
  return {
   sample,
   begin(){seen=new Set();},end(){if(seen)for(const key of states.keys())if(!seen.has(key))states.delete(key);seen=null;},clear(){states.clear();seen=null;},
   busy(time=now()){return [...states.values()].some(s=>Math.abs(displayed(s,time)-s.target)>.01);},
   draw(ctx,key,value,max,x,y,width=58,height=8,red=false,time=now()){
    const shown=sample(key,value,max,time),ratio=max>0?shown/max:0,fill=red?images.red:images.green;
    ctx.save();ctx.imageSmoothingEnabled=false;
    if(images.frame.complete&&images.frame.naturalWidth&&fill.complete&&fill.naturalWidth){
     ctx.drawImage(images.frame,x,y,width,height);
     if(ratio>0)ctx.drawImage(fill,0,0,50*ratio,3,x+width*4/58,y+height*2/8,width*50/58*ratio,height*3/8);
    }else{ctx.fillStyle='#393939';ctx.fillRect(x,y,width,height);ctx.fillStyle=red?'#ff2020':'#42eb21';ctx.fillRect(x+1,y+1,Math.max(0,(width-2)*ratio),Math.max(1,height-2));}
    ctx.restore();return shown;
   },
  };
 };
 root.hpBarHtml=function(value,max,shown=value,red=false){
  const ratio=max>0?clamp(shown,max)/max:0;
  return `<span class="original-hp${red?' enemy-hp':''}" role="progressbar" aria-label="HP" aria-valuemin="0" aria-valuemax="${Math.max(1,max)}" aria-valuenow="${clamp(value,Math.max(0,max))}"><i class="hp-fill" style="transform:scaleX(${ratio})"></i></span>`;
 };
 root.updateHpBar=function(node,value,max,shown=value){
  if(!node)return;
  node.setAttribute('aria-valuemax',Math.max(1,max));node.setAttribute('aria-valuenow',clamp(value,Math.max(0,max)));
  node.querySelector('.hp-fill').style.transform=`scaleX(${max>0?clamp(shown,max)/max:0})`;
 };
})(window);
