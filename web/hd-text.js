'use strict';
// 도트 배경/디지몬은 원래 캔버스를 유지하고 글자만 표시 크기×DPR 해상도에서 그린다.
(function(root){
 const layers=new WeakMap(),family='"Championship HD","Malgun Gothic",sans-serif';
 const properties=['textAlign','textBaseline','direction','fillStyle','strokeStyle','lineWidth','lineJoin','miterLimit','globalAlpha','shadowColor','shadowBlur','shadowOffsetX','shadowOffsetY'];
 function font(value){return value.replace(/(\d+(?:\.\d+)?)px.*/,`$1px ${family}`);}
 function create(ctx){
  const canvas=ctx.canvas,parent=canvas?.parentElement;
  if(!parent||!ctx.getTransform||typeof document==='undefined')return null;
  const overlay=document.createElement('canvas');overlay.className='hd-text-layer';overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{position:'absolute',pointerEvents:'none',zIndex:'1',imageRendering:'auto',border:'0',margin:'0',padding:'0'});
  if(getComputedStyle(parent).position==='static')parent.style.position='relative';
  parent.appendChild(overlay);
  const layer={canvas,parent,overlay,ctx:overlay.getContext('2d'),commands:[],active:false};
  for(const method of ['fillText','strokeText']){
   const native=ctx[method].bind(ctx);
   ctx[method]=function(...args){
    if(!layer.active)return native(...args);
    const styles=Object.fromEntries(properties.map(p=>[p,ctx[p]]));
    layer.commands.push({method,args,styles,font:font(ctx.font),matrix:ctx.getTransform()});
   };
  }
  const fillRect=ctx.fillRect.bind(ctx);
  ctx.fillRect=function(...args){
   fillRect(...args);
   // HUD 덮개가 그려질 때 그 아래에 기록된 월드 글자도 지운다.
   if(layer.active&&ctx.globalAlpha>0)layer.commands.push({method:'clearRect',args,matrix:ctx.getTransform()});
  };
  const measure=ctx.measureText.bind(ctx);
  ctx.measureText=function(text){
   if(!layer.active)return measure(text);
   const old=ctx.font;ctx.font=font(old);try{return measure(text);}finally{ctx.font=old;}
  };
  return layer;
 }
 function begin(ctx){
  let layer=layers.get(ctx);if(!layer){layer=create(ctx);if(layer)layers.set(ctx,layer);}
  if(layer){layer.commands.length=0;layer.active=true;}
 }
 function end(ctx){
  const layer=layers.get(ctx);if(!layer||!layer.active)return;
  layer.active=false;
  const {canvas,parent,overlay}=layer,r=canvas.getBoundingClientRect(),pr=parent.getBoundingClientRect(),css=getComputedStyle(canvas);
  const left=parseFloat(css.borderLeftWidth)||0,right=parseFloat(css.borderRightWidth)||0,top=parseFloat(css.borderTopWidth)||0,bottom=parseFloat(css.borderBottomWidth)||0;
  const width=r.width-left-right,height=r.height-top-bottom,dpr=Math.min(3,Math.max(1,root.devicePixelRatio||1));
  if(width<=0||height<=0){overlay.hidden=true;return;}
  overlay.hidden=false;
  Object.assign(overlay.style,{left:`${r.left-pr.left-parent.clientLeft+parent.scrollLeft+left}px`,top:`${r.top-pr.top-parent.clientTop+parent.scrollTop+top}px`,width:`${width}px`,height:`${height}px`});
  const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
  if(overlay.width!==w)overlay.width=w;if(overlay.height!==h)overlay.height=h;
  const dst=layer.ctx,sx=w/canvas.width,sy=h/canvas.height;
  dst.setTransform(1,0,0,1,0,0);dst.clearRect(0,0,w,h);
  for(const command of layer.commands){
   const m=command.matrix;
   dst.setTransform(sx*m.a,sy*m.b,sx*m.c,sy*m.d,sx*m.e,sy*m.f);
   if(command.styles){for(const p of properties)dst[p]=command.styles[p];dst.font=command.font;}
   dst[command.method](...command.args);
  }
 }
 root.HDText={begin,end};
})(window);
