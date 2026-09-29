// 帳本回寫濾網：照抄底細要丟、共用一個地名的新事實要留
const P=require('./probe.js');const {evalIn}=P;
const lore='\n★【這一步碰到的底細】(玩家這句話碰到了它們)：SABER：飲食是騎士王少數坦率的享受，食量驚人，對粗糙的料理會沉默地表達不滿｜RIDER：討厭鏡子，看到自己的倒影會移開視線｜新都是冬木河對岸的新市區，車站前高樓林立。';
const keep=(n,x)=>evalIn('JSON.stringify(worldNoteDropEcho_('+JSON.stringify([{kind:'規矩',name:n,text:x}])+','+JSON.stringify(lore)+',["SABER","RIDER"]))')!=='[]';
const cases=[[0,'SABER的飲食原則','食量驚人，對粗糙的料理會沉默表達不滿'],[0,'RIDER 討厭鏡子','看到倒影會移開視線'],
 [1,'琥珀咖啡','新都車站旁的咖啡店，拿鐵很好喝'],[1,'美咲','新都車站旁咖啡店的老闆娘，很健談']];
cases.forEach(([want,n,x])=>{const k=keep(n,x); console.log((k===!!want?'✅ ':'❌ ')+(want?'留下 ':'丟掉 ')+n);});
