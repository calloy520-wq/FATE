// 在 node 裡載入戰棋引擎（gas/Srw.html；名字、圖鑑跟 gas/Game.html 共用）
const fs=require('fs'), vm=require('vm'), path=require('path');
const GAS=process.env.GAS_DIR||path.join(__dirname,'..','gas');
const strip=f=>fs.readFileSync(path.join(GAS,f),'utf8').replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');
const ctx={console}; vm.createContext(ctx);
vm.runInContext(strip('Game.html')+'\n;this.G=G;',ctx,{filename:'Game.html'});
vm.runInContext(strip('Srw.html')+'\n;this.T=T;',ctx,{filename:'Srw.html'});
module.exports=ctx.T;
