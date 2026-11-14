'use strict';
(function(root){
  /** 결과는 이미 엔진에 반영되어 있다. 이 큐는 저장/진화 규칙을 다시 실행하지 않는다. */
  root.createEvolutionPlayer=function(options){
    const {data,loadSpecies,drawSpecies,valid=()=>true,canStart=()=>true,onComplete=()=>{},onDrain=()=>{},dialog,canvas,skipButton}=options;
    const queue=[],phases=Object.entries(data.phases),total=phases.reduce((n,[,ticks])=>n+ticks,0)/data.tickRate;
    let active=null,last=null,image=null;
    function artwork(){
      if(!image){image=new Image();image.src='assets/evolution/effects.png';}
      return image;
    }
    function enqueue(event){
      const copy={uid:event.uid,from:event.from,to:event.to};
      queue.push(copy);loadSpecies(copy.from);loadSpecies(copy.to);artwork();
    }
    function finish(skipped=false){
      if(active){last={...active.event};active=null;onComplete(last,skipped);}
      if(!queue.length){if(dialog?.open)dialog.close();onDrain(last);last=null;}
    }
    function skip(){if(!active&&queue.length)active={event:queue.shift(),elapsed:0,waiting:0};finish(true);}
    function clear(){queue.length=0;active=null;last=null;if(dialog?.open)dialog.close();}
    function snapshot(){
      if(!active)return null;
      let tick=active.elapsed*data.tickRate,phase='reveal',progress=1;
      for(const [name,ticks] of phases){if(tick<ticks){phase=name;progress=tick/ticks;break;}tick-=ticks;}
      let speciesId=active.event.from;
      if(phase==='morph'){
        // 원본의20,18,…,2 틱 간격과 반주기 교대를 사용한다.
        let time=tick;
        for(let period=20;period>=2;period-=2){
          if(time<period){speciesId=time>=period/2?active.event.to:active.event.from;break;}
          time-=period;
        }
      }else if(['hold','whiteout','flash','reveal'].includes(phase))speciesId=active.event.to;
      const white=['gather','morph','hold'].includes(phase);
      return {...active.event,elapsed:active.elapsed,phase,progress,speciesId,white,loading:active.loading};
    }
    function ready(asset){return asset?.image?.complete&&asset.image.naturalWidth>0;}
    function failed(asset){return !asset || (asset.image.complete&&asset.image.naturalWidth===0);}
    function update(dt){
      if(!active){
        while(queue.length&&!valid(queue[0].uid))queue.shift();
        if(!queue.length){if(dialog?.open)dialog.close();if(last){onDrain(last);last=null;}return;}
        if(!canStart(queue[0].uid))return;
        active={event:queue.shift(),elapsed:0,waiting:0,loading:true};
      }
      if(!valid(active.event.uid)){finish(true);return;}
      if(dialog&&!dialog.open)dialog.showModal();
      const from=loadSpecies(active.event.from),to=loadSpecies(active.event.to),fx=artwork();
      if(failed(from)||failed(to)||(fx.complete&&!fx.naturalWidth)){finish(true);return;}
      active.loading=!(ready(from)&&ready(to)&&fx.complete&&fx.naturalWidth>0);
      const delta=Math.max(0,Number.isFinite(dt)?dt:0);
      if(active.loading){active.waiting+=delta;if(active.waiting>=8){finish(true);return;}}
      else active.elapsed+=delta;
      if(active.elapsed>=total){finish();return;}
      if(canvas)draw(canvas.getContext('2d'),canvas.width,canvas.height);
    }
    function cell(ctx,index,x,y,scale=1){
      if(!image?.complete||!image.naturalWidth)return;
      const [bx,by,bw,bh]=data.bounds[index];
      ctx.drawImage(image,index*data.width+bx,by,bw,bh,x-bw*scale/2,y-bh*scale/2,bw*scale,bh*scale);
    }
    function draw(ctx,w,h){
      const state=snapshot();if(!state)return;
      ctx.imageSmoothingEnabled=false;ctx.fillStyle='#071d2b';ctx.fillRect(0,0,w,h);
      ctx.textAlign='center';ctx.fillStyle='#e6fcff';ctx.font='16px sans-serif';
      if(state.loading){ctx.fillText('진화 모습을 불러오는 중…',w/2,h/2);return;}
      const cx=w/2,foot=h*.72;
      const a=loadSpecies(state.speciesId),scale=Math.min(3.2,(h*.45)/Math.max(1,a.baseline),(w*.45)/Math.max(1,a.body));
      cell(ctx,data.platformCell,cx,foot+2,1.5);
      drawSpecies(ctx,state.speciesId,cx,foot,scale,state.white,state.elapsed);
      if(['intro','gather','morph','hold'].includes(state.phase)){
        const seq=data.sequences[0],duration=seq.frames.reduce((n,f)=>n+f[1],0);
        for(let i=0;i<12;i++){
          let tick=(state.elapsed*data.tickRate+i*9)%duration,index=seq.frames.at(-1)[0];
          for(const [frame,hold] of seq.frames){if(tick<hold){index=frame;break;}tick-=hold;}
          // 배치·궤도는 웹판 정책. 그림/프레임/유지 시간은 원본 시퀀스 그대로다.
          const angle=i*Math.PI/6+state.elapsed*2.8,radius=48+Math.min(38,a.body*scale/2);
          cell(ctx,index,cx+Math.cos(angle)*radius,foot-30+Math.sin(angle)*32-i%3*18,1.4);
        }
      }
      cell(ctx,data.labelCell,cx,42,Math.min(1.8,(w-40)/data.bounds[data.labelCell][2]));
      ctx.font='bold 16px sans-serif';ctx.fillStyle='#c9f5ff';
      ctx.fillText(`${state.from} → ${state.to}`,cx,h-24,w-30);
      const flash=state.phase==='whiteout'?state.progress:state.phase==='flash'?1-state.progress:0;
      if(flash>0){ctx.fillStyle=`rgba(255,255,255,${flash})`;ctx.fillRect(0,0,w,h);}
    }
    skipButton?.addEventListener('click',skip);
    dialog?.addEventListener('cancel',event=>{event.preventDefault();skip();});
    function appearance(uid){
      return active?.event.uid===uid?active.event.from:queue.find(event=>event.uid===uid)?.from;
    }
    return {enqueue,update,draw,skip,clear,snapshot,appearance,get busy(){return !!active||queue.length>0;},get total(){return total;}};
  };
})(window);
