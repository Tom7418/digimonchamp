// 원본 메일 창은 검은 띠의 단발 NANR35/36과 봉투73을 사용한다.
(function(root){
 root.createMailView=function(options={}){
  const data=options.data||root.MAIL_ART,image=new Image();image.src='assets/ui/mail-window.png';
  const raf=options.requestFrame||requestAnimationFrame,cancel=options.cancelFrame||cancelAnimationFrame,now=options.now||(()=>performance.now());
  const reduced=options.reducedMotion||(()=>!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches),states=new WeakMap();
  const duration=s=>s.frames.reduce((n,f)=>n+f[1],0)/data.tickRate;
  function sample(sequence,age){let tick=Math.max(0,age)*data.tickRate;for(const [cell,hold] of sequence.frames){if(tick<hold)return cell;tick-=hold;}return sequence.frames.at(-1)[0];}
  function paint(box,id){
   const canvas=box.querySelector('.mail-art'),ctx=canvas?.getContext?.('2d');if(!ctx)return;
   const c=data.cells[id];ctx.clearRect(0,0,data.width,data.height);ctx.imageSmoothingEnabled=false;
   if(image.complete&&image.naturalWidth)ctx.drawImage(image,c.x,c.y,c.w,c.h,0,0,data.width,data.height);
   else{ctx.fillStyle='#000';ctx.fillRect(...c.bounds);}
  }
  function animate(box,state,phase,done){
   cancel(state.frame);state.phase=phase;state.done=done;box.dataset.mailPhase=phase;
   const sequence=phase==='opening'?data.open:data.close,start=now();
   const finish=()=>{
    state.frame=0;state.phase=phase==='opening'?'open':'closed';box.dataset.mailPhase=state.phase;
    paint(box,sequence.frames.at(-1)[0]);const callback=state.done;state.done=null;callback?.();
   };
   if(reduced()){finish();return;}
   paint(box,sequence.frames[0][0]);
   const step=time=>{if(states.get(box)!==state||state.phase!==phase)return;const age=(time-start)/1000;paint(box,sample(sequence,age));if(age>=duration(sequence))finish();else state.frame=raf(step);};
   state.frame=raf(step);
  }
  return {
   open(box){
    const old=states.get(box);if(old)cancel(old.frame);
    const previous=old?.previous||root.document?.activeElement;
    const state={previous,frame:0,phase:'opening',done:null};states.set(box,state);
    box.focus?.({preventScroll:true});animate(box,state,'opening');
   },
   advance(box,done){
    const state=states.get(box);
    if(!state){done();return;}
    if(state.phase==='closing'||state.phase==='closed')return;
    if(state.phase==='opening'){
     cancel(state.frame);state.frame=0;state.phase='open';box.dataset.mailPhase='open';paint(box,data.open.frames.at(-1)[0]);return;
    }
    animate(box,state,'closing',done);
   },
   hide(box){const state=states.get(box);if(!state)return;cancel(state.frame);states.delete(box);box.dataset.mailPhase='closed';if(state.previous?.isConnected)state.previous.focus?.({preventScroll:true});},
   phase:box=>states.get(box)?.phase||'closed',sample,
  };
 };
 root.ChampMailView=root.createMailView();
})(typeof window!=='undefined'?window:globalThis);
