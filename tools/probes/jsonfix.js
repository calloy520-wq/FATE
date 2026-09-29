// 🩹 模型 JSON 壞掉時的修復：兩次 A/B 各壞一回合（真換行＋截斷／打錯字），修得回來就不用花第二顆模型。
const P=require('./probe.js'); const {evalIn}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,200):''));} };
const fix=s=>{ const r=evalIn('repairAiJson_('+JSON.stringify(s)+')'); return r==null?null:JSON.parse(r); };

console.log('\n── ① 本來就好的 JSON：原樣可解');
const good='{"narration":"清晨。<br><br>凜笑了。","options":["a","b"],"scene":"客廳"}';
t(evalIn('repairAiJson_('+JSON.stringify(good)+')')===good,'一字不動');

console.log('\n── ② 第一輪第 3 步的形狀：narration 裡有真換行，而且在 intimacy_feedback 中途被截斷');
const trunc='{\n  "narration": "清晨六點半。\n\n櫻微微一愣，說「哪有這回事呢」。\n\n凜皺起眉頭。\n\n",\n  "options": [\n    "伸出手輕輕摸摸櫻的頭",\n    "笑著勸凜別那麼兇",\n    "順著凜的話問櫻最近的夢境",\n    "站起身去廚房幫兩人續杯紅茶",\n    "拿抱枕輕輕敲一下凜的頭",\n    "沉默不語地看著她們"\n  ],\n  "intimacy_feedback": {\n    "player": {\n      "physical_state": "",\n      "appearance_extras": "穿著日常便服"\n    },\n    "npcs": [\n      {\n        "name": "';
const r2=fix(trunc);
t(r2 && /櫻微微一愣/.test(r2.narration),'narration 救回來',r2&&r2.narration);
t(r2 && /\n\n/.test(r2.narration),'段落換行保留（之後 sanitizeAiData_ 會轉 <br>）');
t(r2 && r2.options.length===6 && r2.options[5]==='沉默不語地看著她們','六條選項救回來',r2&&JSON.stringify(r2.options));

console.log('\n── ③ 第二輪第 4 步的形狀：模型打錯字 $leave"');
const typo='{"narration":"清晨的微光。<br><br>凜手指一僵：「那種電子產品，本小姐才沒花多少時間！」","options":["站起身走向凜","拉著凜的手","轉頭對櫻微笑","伸手將櫻抱進懷裡","拿過茶壺續滿紅茶","靠向凜的耳邊"],"intimacy_feedback":{"player":{"physical_state":"","appearance_extras":"日常便服"},"npcs":[{"name":"凜","noticed":"發現我對她新買的手機很感興趣"}]},"world_note":[{"kind":"物品","name":"凜的新手機","text":"上週剛買。","sex":"異"}],"scene":"我的房間","cast":{"join":[],$leave":[]}}';
const r3=fix(typo);
t(r3 && /本小姐才沒花多少時間/.test(r3.narration),'narration 救回來');
t(r3 && r3.options.length===6,'選項救回來',r3&&r3.options.length);
t(r3 && r3.scene==='我的房間','scene 救回來',r3&&r3.scene);

console.log('\n── ③b 第三輪的兩種新壞法：多一個 ]、world_note 的鍵沒加引號（十次有七次壞）');
const extra='{"narration":"我將手中的茶杯放下後，順勢在兩人身邊的沙發坐了下來。\n\n凜拿著紅茶杯的手微微一頓。","options":["伸手輕輕捏了捏凜的臉頰","順勢將櫻摟進自己懷裡","開玩笑說凜其實很期待","問櫻週末想吃什麼甜點","站起身去廚房準備早餐","催促兩人快把紅茶喝完"],"intimacy_feedback":{"player":{"physical_state":"","appearance_extras":"穿著日常便服"},"npcs":[{"name":"凜","noticed":"答應了週末一起去商店街的邀約"}]}],"world_note":[{"kind":"地點","name":"商店街","text":"冬木市的熱鬧街區。","sex":""}],"scene":"我的房間客廳","cast":{"join":[],"leave":[]}}';
const r4=fix(extra);
t(r4 && /凜拿著紅茶杯的手微微一頓/.test(r4.narration) && r4.options.length===6 && r4.scene==='我的房間客廳','多一個 ] → 敘事／選項／場景都救回來',r4&&JSON.stringify(r4).slice(0,120));
const unq='{\n  "narration": "清晨六點十分的冬木市還籠罩在一片薄霧裡。\n\n凜坐在沙發邊緣，輕哼了一聲接過茶杯。\n\n",\n  "options": ["在凜身邊坐下並喝口茶","笑著伸手揉揉櫻的頭髮","問她們早餐想吃點什麼","靠向凜的肩膀不說話","牽起櫻的手傳遞暖意","轉身回廚房準備早餐"],\n  "world_note": [{"kind": "地點", name: "我的房間", text: "位於冬木市的普通住宅。", sex: ""}],\n  "scene": "我的房間客廳",\n  "cast": {"join": ["凜","櫻"], "leave": []}\n}';
const r5=fix(unq);
t(r5 && /輕哼了一聲接過茶杯/.test(r5.narration) && r5.options.length===6 && r5.scene==='我的房間客廳','真換行＋鍵沒加引號 → 都救回來',r5&&JSON.stringify(r5).slice(0,120));

console.log('\n── ④ 邊界');
t(fix('好的，以下是結果：{"narration":"一段夠長的敘事，超過二十個字才算數喔喔喔。","options":[]}')!==null,'前面多了一句話也行');
t(fix('這不是 JSON')===null,'完全不是 JSON → null');
t(fix('{"narration":"太短","options":[')===null,'壞掉又只撈到幾個字 → null（不值得救）');
const q=fix('{"narration":"她說：\\"好\\"。\n然後走了，這句要夠長才會被收下來。","options":["x"]');
t(q && q.narration.indexOf('"好"')>=0,'跳脫過的引號還原正確',q&&q.narration);

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
