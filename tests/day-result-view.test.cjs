const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('web/day-result-view.js','utf8'),c);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('첨부된 도전하는 사람 메달은 m55에서 원본 badge056을 고르고 예선은 표시하지 않는다',()=>{
 const html=c.window.titleMedalHtml({id:'m55',name:'도전하는 사람'},esc);assert.match(html,/medal-56.png/);assert.match(html,/도전하는 사람 메달/);
 for(const id of ['prelim','final','m61','m-1'])assert.equal(c.window.titleMedalHtml({id,name:'x'},esc),'');
});
test('달력은 다음 날 계절과 날짜를 사용하고 획득·미획득 경기를 각각 집계한다',()=>{
 const html=c.window.dayResultCalendarHtml({DAYS_PER_SEASON:8},{season:3,day:1},{1:[{name:'A',won:true},{name:'B',won:false}]},esc);
 assert.match(html,/calendar-winter.png/);assert.equal((html.match(/original-cal-cell/g)||[]).length,8);assert.equal((html.match(/aria-current="date"/g)||[]).length,1);
 assert.match(html,/day-1.png/);assert.match(html,/checked.png" alt="획득">1/);assert.match(html,/unchecked.png" alt="미획득">1/);
 assert.match(html,/1일: A \(획득\), B/);
});
test('경기 이름을 안전하게 표시하고 표시 중 저장·일정을 바꾸지 않는다',()=>{
 const morning={season:0,day:8},marks={8:[{name:'<"경기>',won:false}]},before=JSON.stringify({morning,marks});
 const html=c.window.dayResultCalendarHtml({DAYS_PER_SEASON:8},morning,marks,esc);assert.match(html,/&lt;&quot;경기>/);assert.equal(JSON.stringify({morning,marks}),before);assert.match(html,/day-8.png/);
});
