// 📏 提示詞體重計：攔下真正送進 callGeminiAPI 的 system / history / user，逐塊秤字數
const {build,mkSheet}=require('./sheet.js');
const HDR={
 "眾生":["ID","名字"],"鑑賞眾生":["ID","名字"],"帳號":["帳號名","PC","建立","KPC"],
 "英靈殿":["英靈ID"],"御主殿":["ID"],"坤圖":["區","地名","類型","座標","描述","x","戰"],"歷史暫存":["pcId","speaker","content","ts"],
};
const sheets={};
for(const k of Object.keys(HDR)) sheets[k]=mkSheet(k,[Array(60).fill("").map((_,i)=>HDR[k][i]||("c"+i))]);
const {ctx,evalIn}=build(sheets);

// 種子：英靈殿/御主殿/坤圖
evalIn('seedFateCodex_(SpreadsheetApp.getActiveSpreadsheet())');
console.log('英靈殿 %d 筆', sheets['英靈殿']._d.length-1);

// 🎲 釘死亂數（單一真實來源·2026-09）：探針比對的是「同樣輸入→同樣輸出」，而 GAS 這邊到處在擲骰
//    （巧遇/約定/夜襲/登場日/地點洗牌…）。不釘的話同一支探針會時綠時紅，而「紅了先重跑一次」
//    這個習慣一旦養成，真的 bug 也會被當成偶發放過去——這個專案幾乎每個 bug 都是零錯誤訊息的那種。
//    印出 seed 是為了紅燈重現得出來；SEED=n 可以掃不同種子。
const SEED = parseInt(process.env.SEED || '', 10) || 20260917;
evalIn('(function(){ var s=' + SEED + '; Math.random=function(){ s=(s*1103515245+12345)%2147483648; return s/2147483648; }; })()');
if (process.env.SEED) console.log('🎲 seed=' + SEED);

// 攔截 AI 呼叫
let CAP=null;
evalIn('callGeminiAPI = function(prompt, sysOverride, config){ __CAP__({prompt:prompt, sys:sysOverride, config:config}); return null; }');
ctx.__CAP__=o=>{CAP=o;};

const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
// 🌟 2026-09 起始住民整組取消（開局一片空白），所以探針要人就得自己召喚。
//    回傳被召進來的 heroId 陣列；n 超過英靈殿筆數就召滿為止。
function summonN(acctName, kpc, n, skipIds) {
  const HC = JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
  const skip = (skipIds || []).map(String);
  const out = [];
  const rows = sheets['英靈殿']._d.slice(1);
  for (let i = 0; i < rows.length && out.length < n; i++) {
    const id = String(rows[i][HC.ID] || '');
    if (!id || skip.indexOf(id) >= 0) continue;
    const r = run({ action: 'kanshou_summon_hero', acctName: acctName, pcId: kpc, heroId: id });
    if (r && r.success) out.push(id);
  }
  return out;
}
module.exports={ctx,evalIn,sheets,run,cap:()=>CAP,reset:()=>{CAP=null;},SEED,summonN};
