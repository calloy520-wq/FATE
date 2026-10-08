// 劇情與圖鑑的資料檢查：node tools/story_test.js
// （原本放在卡牌版的 game_test.js，卡牌引擎清掉後搬過來）
const fs = require('fs'), vm = require('vm'), path = require('path');
const T = require('./srw'), GAS = process.env.GAS_DIR || path.join(__dirname, '..', 'gas');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(GAS, 'Game.html'), 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '') + ';this.G=G;', ctx);
vm.runInContext(fs.readFileSync(path.join(GAS, 'SrwTalk.html'), 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '') + ';this.K=SRW_TALK;', ctx);
const G = ctx.G, K = ctx.K;
let pass = 0, fail = 0;
const ok = (c, name, x) => { if (c) pass++; else { fail++; console.log('❌', name, x !== undefined ? String(x).slice(0, 200) : ''); } };

// 圖鑑
ok(Object.keys(G.ENEMIES).every(k => G.LORE[k] && G.LORE[k].length >= 10), '每個敵人都有圖鑑介紹', Object.keys(G.ENEMIES).filter(k => !G.LORE[k]).join());
ok(Object.keys(T.FOES).every(k => G.ENEMIES[k]), '戰棋的每個敵人都有名字與圖鑑', Object.keys(T.FOES).filter(k => !G.ENEMIES[k]).join());
ok(G.BOSSES.concat(G.ELITES).every(k => G.ENEMIES[k]), '魔王、精英的清單都對得上');
ok(G.ENEMIES.xinmo && G.ENEMIES.xinmo.name === '魘' && G.ENEMIES.xinmo.boss, '隱藏魔王是魘');

// 五位女修、真結局、尾聲
ok(G.ORDER.length === 5 && G.ORDER.every(k => G.SERVANTS[k] && G.SERVANTS[k].name && G.SERVANTS[k].hao && G.SERVANTS[k].poem && G.SERVANTS[k].sect), '五位女修都有名字、稱號、詩、門派');
ok(G.ORDER.every(k => { const O = G.SERVANTS[k].origin; return O && O.title && O.text.length >= 600 && !/心魔|岳母/.test(O.text); }), '五位女修都有自己的初遇');
ok(G.ORDER.every(w => G.ENDINGS[w] && G.ENDINGS[w].title && G.ENDINGS[w].text.length >= 3) && G.EPILOGUE && G.EPILOGUE.text.length >= 3, '五位真結局＋共同尾聲');
ok(G.ORDER.every(w => Object.keys(G.EVENTS).filter(k => G.EVENTS[k].who === w).length >= 2), '每位至少 2 個插曲');
ok(Object.values(G.EVENTS).every(E => G.ORDER.includes(E.who) && E.name && E.text && E.end && E.end.length >= 20), '插曲都有收尾');

// 說話人標記〔…〕要緊跟在「」後面（不然會露在畫面上）
const bad = x => /[^」]〔[^〕]*〕/.test(x) || /^〔[^景]/.test(x);
const all = [].concat(G.EPILOGUE.text, ...G.ORDER.map(w => G.ENDINGS[w].text), ...G.ORDER.map(w => [G.SERVANTS[w].desc, G.SERVANTS[w].origin.text]), ...Object.values(G.EVENTS).map(E => [E.text, E.end]));
ok(!all.some(bad), '真結局、尾聲、介紹、初遇、插曲的說話人標記都緊跟在「」後面', all.find(bad));
const S = fs.readFileSync(path.join(GAS, 'Story.html'), 'utf8'), NOVEL = eval(S.match(/var NOVEL = (\[[\s\S]*?\n  \]);/)[1]);
ok(NOVEL.length > 0 && NOVEL.every(c => c.title && c.text.length && c.text.every(p => /^〔景：\w+〕$/.test(p) || !/[^」]〔[^〕]*〕/.test(p))), '小說主線每章都有標題與內容，說話人標記都緊跟在「」後面');

// 用詞：不用「心魔」、不留 Fate 的詞
const data = JSON.stringify([G.ENEMIES, G.LORE, G.ENDINGS, G.EPILOGUE, G.SECTS_LORE, G.EVENTS, G.SERVANTS, K.LINES, K.TALK, K.MID, K.ADD, K.WIN]);
ok(!/心魔/.test(data), '畫面資料裡不再出現「心魔」');
const TERMS = ['寶具', '令咒', '從者', '聖杯', '英靈', '靈基', '禮裝', '冬木', 'Saber', 'Servant', '征服王', '騎士王', 'Boss'];
const seen = JSON.stringify([data, T.SPIRITS, T.SKILLS, T.ITEMS, T.TRAITS, T.ACE, T.ORDER.map(k => T.HEROES[k].w.map(w => w.n)), Object.keys(T.FOES).map(k => T.FOES[k].w.map(w => w.n)), T.STAGES.map(s => [s.n, s.place])]);
ok(!TERMS.some(t => seen.includes(t)), '玩家看得到的文字（劇情、台詞、招式、心訣、功法、法寶）沒有 Fate 用詞', TERMS.filter(t => seen.includes(t)).join());

console.log((fail ? '❌ ' : '✅ ') + pass + ' 項通過' + (fail ? '，' + fail + ' 項沒過' : ''));
if (fail) process.exit(1);
