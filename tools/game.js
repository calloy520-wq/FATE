// 在 node 裡載入 gas/Game.html 的引擎（給測試與模擬器用）
const fs=require('fs'), vm=require('vm'), path=require('path');
const GAS=process.env.GAS_DIR||path.join(__dirname,'..','gas');
const src=fs.readFileSync(path.join(GAS,'Game.html'),'utf8').replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');
const ctx={console}; vm.createContext(ctx); vm.runInContext(src+'\n;this.G=G;',ctx,{filename:'Game.html'});
module.exports=ctx.G;
