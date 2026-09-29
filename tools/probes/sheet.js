// 假試算表：2D 陣列 backed，只實作被用到的 Sheet API
const fs=require('fs'),path=require('path'),vm=require('vm');
const GAS=process.env.GAS_DIR||require('path').join(__dirname,'../../gas');
let _REG=null;   // 目前這一局的分頁註冊表（setName 要能就地改鍵）
function mkSheet(name, rows){
  const s={_n:name,_d:rows};
  s.getName=()=>s._n;
  s.setName=n=>{ if(_REG){ delete _REG[s._n]; _REG[n]=s; } s._n=n; return s; };
  s.getLastRow=()=>s._d.length;
  s.getLastColumn=()=>(s._d[0]||[]).length;
  s.getDataRange=()=>mkRange(s,1,1,s._d.length,(s._d[0]||[]).length);
  s.getRange=(r,c,nr,nc)=>mkRange(s,r,c,nr===undefined?1:nr,nc===undefined?1:nc);
  s.appendRow=a=>{s._d.push(a.slice());return s;};
  s.insertSheet=()=>s;
  s.deleteRow=i=>{s._d.splice(i-1,1);};
  s.deleteRows=(i,n)=>{s._d.splice(i-1,n);};
  s.clear=()=>{s._d.length=0;};
  s.setFrozenRows=()=>s;
  s.getMaxColumns=()=>(s._d[0]||[]).length;
  s.insertColumnsAfter=()=>s;
  s.sort=()=>s;
  return s;
}
function mkRange(sh,r,c,nr,nc){
  return {
    getValues(){const o=[];for(let i=0;i<nr;i++){const row=sh._d[r-1+i]||[];const rr=[];for(let j=0;j<nc;j++)rr.push(row[c-1+j]===undefined?'':row[c-1+j]);o.push(rr);}return o;},
    getValue(){return (sh._d[r-1]||[])[c-1]??'';},
    setValues(v){for(let i=0;i<v.length;i++){if(!sh._d[r-1+i])sh._d[r-1+i]=[];for(let j=0;j<v[i].length;j++)sh._d[r-1+i][c-1+j]=v[i][j];}return this;},
    setValue(v){if(!sh._d[r-1])sh._d[r-1]=[];sh._d[r-1][c-1]=v;return this;},
    setFontWeight(){return this;},setBackground(){return this;},setNumberFormat(){return this;},
  };
}
function build(sheets){
  _REG=sheets;
  const props=Object.assign({}, process.env.GAS_PROPS ? JSON.parse(process.env.GAS_PROPS) : {}),cache={};   // 探針可用 GAS_PROPS='{"OPENROUTER_API_KEY":"k"}' 預埋指令碼屬性
  const SS={
    getSheetByName:n=>sheets[n]||null,
    insertSheet:n=>(sheets[n]=mkSheet(n,[])),
    getSheets:()=>Object.values(sheets),
    getId:()=>'fake',
  };
  const ctx={console,Math,Date,JSON,String,Number,Boolean,Array,Object,RegExp,parseInt,parseFloat,isNaN,encodeURIComponent,decodeURIComponent,
   SpreadsheetApp:{getActiveSpreadsheet:()=>SS,getActive:()=>SS,flush(){},openById:()=>SS},
   PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty(k,v){props[k]=String(v)},deleteProperty(k){delete props[k]},getProperties:()=>props})},
   CacheService:{getScriptCache:()=>({get:k=>cache[k]??null,put(k,v){cache[k]=v},remove(k){delete cache[k]}})},
   Logger:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){},waitLock(){}})},
   ScriptApp:{getProjectTriggers:()=>[],deleteTrigger(){},newTrigger:()=>({timeBased:()=>({after:()=>({create(){}})})})},
   Utilities:{sleep(){},formatDate:()=>'',getUuid:()=>'u'+Math.random().toString(36).slice(2)},
   UrlFetchApp:{fetch:()=>({getContentText:()=>'{}',getResponseCode:()=>200})},
   HtmlService:{createTemplateFromFile:()=>({evaluate:()=>({setTitle:()=>({addMetaTag:()=>({})})})})}};
  ctx.globalThis=ctx; vm.createContext(ctx);
  const files=fs.readdirSync(GAS).filter(f=>f.endsWith('.gs')).sort();
  vm.runInContext(files.map(f=>fs.readFileSync(path.join(GAS,f),'utf8')).join('\n'),ctx,{filename:'ALL.gs'});
  return {ctx, evalIn:c=>vm.runInContext(c,ctx,{filename:'eval'}), sheets, mkSheet};
}
module.exports={build,mkSheet};
