const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync('web/cage-fence.js','utf8'),{window});
const rows=Object.values(JSON.parse(fs.readFileSync('docs/cage-art-refresh.json','utf8')).facilities);
test('33 cage fences close around their union without internal cell edges',()=>{
 for(const row of rows){
  const g=window.CageFence.geometry(row.cells),shared=row.cells.reduce((n,[q,r],i)=>n+row.cells.slice(i+1).filter(([x,y])=>[[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]].some(([a,b])=>x-q===a&&y-r===b)).length,0);
  assert.equal(g.edgeCount,6*row.cells.length-2*shared,row.name);
  assert.equal(g.loops.reduce((n,p)=>n+p.length,0),g.edgeCount);
  for(const loop of g.inner)for(const point of loop)assert.ok(point.every(Number.isFinite));
 }
});
test('every cage uses identical world-space rail widths and posts regardless of image resolution',()=>{
 const noop=()=>{};
 for(const radius of [70,140,350])for(const row of rows){
  const widths=[],posts=[];const ctx=new Proxy({stroke(){widths.push(this.lineWidth);},fillRect(x,y,w,h){posts.push([w,h]);}}, {get:(t,p)=>p in t?t[p]:noop});
  window.CageFence.draw(ctx,row.cells,radius);
  assert.deepEqual([...new Set(widths)],[5*(radius/120),2*(radius/120)]);
  for(let i=0;i<posts.length;i+=3){assert.equal(posts[i][0],6*(radius/120));assert.equal(posts[i][1],8*(radius/120));}
 }
});
test('game and downloadable gallery share the fence renderer',()=>{
 const html=fs.readFileSync('web/index.html','utf8'),editor=fs.readFileSync('web/cage-editor.js','utf8'),gallery=fs.readFileSync('web/cage-gallery.html','utf8');
 assert.ok(html.indexOf('cage-fence.js')<html.indexOf('cage-editor.js'));
 assert.match(editor,/CageFence\?\.draw\(ctx,type.cells,R\)/);
 assert.match(gallery,/CageFence.preview/);assert.match(gallery,/link.href=p.dataset.asset/);
});
