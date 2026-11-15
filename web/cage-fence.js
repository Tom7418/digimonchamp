'use strict';
// 게임과 이미지 목록이 같은 월드 좌표 펜스를 쓴다. 그림 파일 해상도/종류에 따른 예외는 없다.
(function(root){
 const cache=new Map(),STYLE={background:'#113146',rail:'#279fcf',light:'#7feffa',post:'#0d273a',postBlue:'#5be1f4',white:'#dfffff'};
 const key=p=>p.map(n=>Math.round(n*1e6)).join(',');
 function inset(points,d){return points.map((p,i)=>{
  const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
  const u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
  const x=[p[0]-u[1]/lu*d,p[1]+u[0]/lu*d],y=[p[0]-v[1]/lv*d,p[1]+v[0]/lv*d],cross=u[0]*v[1]-u[1]*v[0];
  if(Math.abs(cross)<1e-7)return x;
  const t=((y[0]-x[0])*v[1]-(y[1]-x[1])*v[0])/cross;return [x[0]+t*u[0],x[1]+t*u[1]];
 });}
 function geometry(cells,R=140){
  const id=R+'|'+JSON.stringify(cells);if(cache.has(id))return cache.get(id);
  const edges=new Map(),all=[];
  for(const [q,r] of cells){
   const cx=Math.sqrt(3)*R*(q+r/2),cy=R*1.5*r;
   const v=Array.from({length:6},(_,i)=>{const a=(i*60-90)*Math.PI/180;return [cx+R*Math.cos(a),cy+R*Math.sin(a)].map(n=>Math.round(n*1e6)/1e6);});all.push(...v);
   for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],ka=key(a),kb=key(b),k=[ka,kb].sort().join('/');if(edges.has(k))edges.delete(k);else edges.set(k,{a,b,ka,kb});}
  }
  const unused=new Set(edges.values()),loops=[];
  while(unused.size){
   let e=unused.values().next().value;const start=e.ka,points=[e.a];unused.delete(e);
   while(e.kb!==start){
    points.push(e.b);const choices=[...unused].filter(n=>n.ka===e.kb);if(!choices.length)throw Error('Open cage fence');
    const ux=e.b[0]-e.a[0],uy=e.b[1]-e.a[1];const turn=n=>{const vx=n.b[0]-n.a[0],vy=n.b[1]-n.a[1];return (Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy)+2*Math.PI)%(2*Math.PI);};
    e=choices.sort((a,b)=>turn(a)-turn(b))[0];unused.delete(e);
   }loops.push(points);
  }
  const unit=R/120,bounds={left:Math.min(...all.map(p=>p[0])),top:Math.min(...all.map(p=>p[1])),right:Math.max(...all.map(p=>p[0])),bottom:Math.max(...all.map(p=>p[1]))};
  bounds.width=bounds.right-bounds.left;bounds.height=bounds.bottom-bounds.top;
  const result={loops,inner:loops.map(p=>inset(p,10*unit)),rails:loops.map(p=>inset(p,5*unit)),bounds,unit,edgeCount:edges.size};cache.set(id,result);return result;
 }
 function path(ctx,loops){for(const points of loops){ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();}}
 function draw(ctx,cells,R=140){
  const g=geometry(cells,R),u=g.unit;ctx.save();
  // 옛 그림에 구워진 가는 펜스는 동일한 바탕 띠로 완전히 가린다. 안쪽 장면은 건드리지 않는다.
  ctx.beginPath();path(ctx,g.loops);path(ctx,g.inner);ctx.fillStyle=STYLE.background;ctx.fill('evenodd');
  ctx.lineJoin='round';ctx.lineCap='butt';
  for(const points of g.rails){
   for(const [color,width] of [[STYLE.rail,5],[STYLE.light,2]]){ctx.beginPath();path(ctx,[points]);ctx.strokeStyle=color;ctx.lineWidth=width*u;ctx.stroke();}
   for(let j=0;j<points.length;j++){
    const a=points[j],b=points[(j+1)%points.length],n=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/(38*u)));
    for(let i=0;i<n;i++){
     const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;
     for(const [color,box] of [[STYLE.post,[-3,-4,6,8]],[STYLE.postBlue,[-2,-3,4,5]],[STYLE.white,[-1,-2,2,2]]]){ctx.fillStyle=color;ctx.fillRect(x+box[0]*u,y+box[1]*u,box[2]*u,box[3]*u);}
    }
   }
  }ctx.restore();
 }
 function preview(canvas,img,cells,{radius=120,width,height}={}){
  const g=geometry(cells,radius),b=g.bounds,pad=2;canvas.width=width||Math.ceil(b.width)+pad*2;canvas.height=height||Math.ceil(b.height)+pad*2;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate((canvas.width-b.width)/2-b.left,(canvas.height-b.height)/2-b.top);
  ctx.beginPath();path(ctx,g.loops);ctx.clip();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,b.left,b.top,b.width,b.height);draw(ctx,cells,radius);ctx.restore();return canvas;
 }
 root.CageFence={geometry,draw,preview,style:STYLE};
})(window);
