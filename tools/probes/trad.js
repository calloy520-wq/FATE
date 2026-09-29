// 🈶 toTaiwanTrad_：簡體／舊字形逐字轉台灣正體，一對一、多對一不碰，JSON 結構不壞。
const P=require('./probe.js'); const {evalIn}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,200):''));} };
const conv = s => evalIn('toTaiwanTrad_(' + JSON.stringify(s) + ')');
t(conv('我伸了\u4e2a\u61d2腰，\u968f口把周末野餐的提\u8bae\u629b了出去') === '我伸了個懶腰，隨口把周末野餐的提議拋了出去', '整句簡體轉正體（周 多對一不碰）', conv('我伸了\u4e2a\u61d2腰，\u968f口把周末野餐的提\u8bae\u629b了出去'));
t(conv('翻了\u4e2a白眼，一\u8fb9大笑\u7740一\u8fb9\u987a手撈起') === '翻了個白眼，一邊大笑著一邊順手撈起', '夾雜的簡體字與「\u7740」逐字換', conv('翻了\u4e2a白眼，一\u8fb9大笑\u7740一\u8fb9\u987a手撈起'));
t(conv('客廳\u88cf因\u7232這\u9ebd一鬧') === '客廳裡因為這麼一鬧', '舊字形 \u88cf／\u7232／\u9ebd 換成台灣寫法', conv('客廳\u88cf因\u7232這\u9ebd一鬧'));
t(conv('皇后、頭髮、乾杯、麵包、一隻貓、台北') === '皇后、頭髮、乾杯、麵包、一隻貓、台北', '多對一的字一個都沒動');
const j = conv('{"narration":"他\u8bf4：「好」","options":["\u8fd9\u4e2a"],"scene":"\u53a8房"}');
let o = null; try { o = JSON.parse(j); } catch (e) {}
t(o && o.narration === '他說：「好」' && o.options[0] === '這個' && o.scene === '廚房', 'JSON 字串整包過也還是合法 JSON，鍵沒被動', j);
t(conv('') === '' && conv('純繁體不動') === '純繁體不動', '空字串與純繁體原樣回');
t(evalIn('TRAD_MAP_SIMP_.length===TRAD_MAP_TRAD_.length && TRAD_MAP_SIMP_.length>500') === true, '字表兩端等長且 >500 字');
console.log(bad ? '❌ '+bad+' 條失敗' : '✅ trad.js '+ok+' 條全過');
// 🔗 字表同步：TRAD_MAP_SIMP_ 的每個字都要在 check_simp.py 的字表裡（掃描器與轉換器同一張準則表）
const fs=require('fs'); const py=fs.readFileSync(require('path').join(__dirname,'../../check_simp.py'),'utf8');
const S=new Set((py.split('SIMP = (')[1].split('\n)')[0].match(/"([^"]+)"/g)||[]).map(x=>x.slice(1,-1)).join(''));
const simp=evalIn('TRAD_MAP_SIMP_'); const miss=[...simp].filter(c=>!S.has(c));
t(miss.length===0,'轉換器字表 ⊆ check_simp 字表',miss.join(''));
console.log(bad ? '❌ '+bad+' 條失敗' : '✅ trad.js '+ok+' 條全過');
