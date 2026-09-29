// 🛠️ 英靈工房（新聖杯戰爭與鑑賞共用）：一張表單、寫一列完整的英靈殿。技能只能從 WAR_SKILL_ 挑，職階技能照 FORGE_CLS_SKILLS_ 自動附上。為什麼：見 CODE_NOTES.md『WAR_FORGE_』。

var WAR_FORGE_ = {
  RANKS: ['E', 'D', 'C', 'B', 'A', 'EX'],
  // 點數只算引擎真的讀的四格：攻擊（筋力、魔力取高）、耐久、敏捷、寶具（至少 C，有寶具名就有招）；幸運與較低的那一格不算。
  //   每格的價錢＝引擎的階級值（warRank_：E1…A5、EX7），工房跟引擎用同一把尺。
  COST: [['筋力', '魔力'], ['耐久'], ['敏捷'], ['寶具']],
  BUDGET: 18,              // 模擬器量過：18 點最強的做法約等於赫拉克勒斯，碰不到 Saber（理由見 CODE_NOTES『WAR_FORGE_』）
  MAX_SKILLS: 3,
  NAME_MAX: 12, NP_MAX: 16, TEXT_MAX: 40, SKILL_NAME_MAX: 10, DESC_MAX: 120,
  SIX: ['筋力', '耐久', '敏捷', '魔力', '幸運', '寶具'],
  CLASSES: ['Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker']
};
// 出處：決定 AI 怎麼還原這位角色、技能叫什麼名字（Fate 就用 Fate 的技能名、別的作品用那部作品的招式名、原創就自取）。
var WAR_FORGE_ORIGINS_ = {
  fate: { label: 'Fate 角色', frame: '這是 Fate 系列的角色：照 Fate 原作的設定還原真名、職階、能力與性格。',
    skill: '技能名沿用這個角色在 Fate 原作裡的技能名（例：聖人、啟示、魔力放出、黃金律）。' },
  anime: { label: '其他作品角色', frame: '這是其他動漫、漫畫或遊戲的角色，以英靈身分被召喚：照原作的形象、性格與代表能力還原。',
    skill: '技能名取這個角色在原作裡的招牌招式或能力名（例：水之呼吸、瞬間移動、寫輪眼）。' },
  original: { label: '原創', frame: '這是玩家原創的英靈：照描述創作一位全新的從者，自取貼切的中文真名。',
    skill: '技能名照角色形象自取，像寶具那樣有個性（例：鬼之膂力、獅子之心），跟效果清單上的名稱各自獨立。' }
};
// 能挑的技能：每一個效果列一個代表名（同一列只列一次）。存檔時技能名可以自己取，代表名只是預設。
var WAR_FORGE_SKILLS_ = [
  ['first_strike', '直感'], ['survive', '戰鬥續行'], ['ride', '騎乘'], ['stealth', '氣息遮斷'], ['territory', '陣地作成'],
  ['mad', '狂化'], ['nullify_magic', '對魔力'], ['aim', '千里眼'], ['solo', '單獨行動'], ['evade_ranged', '避矢加護'], ['tactics', '軍略'],
  ['crafting', '道具作成'], ['fast_cast', '高速詠唱']
];

function warHeroSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('英靈殿'); }
function warIsOriginal_(row) { return String(row[COL.HERO.SOURCE] || '') !== 'seed'; }
function warCreatorOf_(row) { return String(safeJson_(row[COL.HERO.PERSONA], {}).creator || ''); }
function warRankPts_() {
  var o = {};
  WAR_FORGE_.RANKS.forEach(function (r) { o[r] = warRank_(r); });
  return o;
}
function warSixPts_(six) {
  return WAR_FORGE_.COST.reduce(function (a, g) {
    var v = Math.max.apply(null, g.map(function (k) { return six[k] ? warRank_(six[k]) : 0; }));
    return a + (g.indexOf('寶具') >= 0 ? Math.max(v, WAR_.NP_FLOOR) : v);
  }, 0);
}
// 舊作的階級（A+、B- 這種）→ 工房只有的六階：取字頭，不要整格退回 C。
function warForgeRank_(r) {
  var s = String(r || '').trim().toUpperCase();
  return s.indexOf('EX') === 0 ? 'EX' : (WAR_FORGE_.RANKS.indexOf(s.charAt(0)) >= 0 ? s.charAt(0) : '');
}
// 種子上的 fx → 工房清單上的代表（直感／心眼／全知全能之星共用同一列，挑的時候都叫「直感」）；新規則裡沒有的回空。
function warForgeFx_(f) {
  var row = WAR_SKILL_[f];
  if (!row) return '';
  var hit = WAR_FORGE_SKILLS_.filter(function (p) { return WAR_SKILL_[p[0]] === row; })[0];
  return hit ? hit[0] : '';
}

// 英靈殿一列 → 引擎吃的種子形狀（跟 SEED_SERVANTS 同一個樣子）。
function warSeedFromRow_(row) {
  return {
    id: String(row[COL.HERO.ID]), cls: String(row[COL.HERO.CLS]), realName: String(row[COL.HERO.NAME]),
    gender: String(row[COL.HERO.SEX] || ''), six: safeJson_(row[COL.HERO.SIX], {}),
    classSkills: safeJson_(row[COL.HERO.CLASS_SKILLS], []), skills: safeJson_(row[COL.HERO.SKILLS], []),
    np: String(row[COL.HERO.NP] || ''), persona: safeJson_(row[COL.HERO.PERSONA], {})
  };
}

// 這個帳號叫得到的原創從者：自己做的＋沒人認領的（舊工房留下的）。
function warOriginalsFor_(acct) {
  return getHeroCodexCached().slice(1).filter(function (r) {
    if (!r[COL.HERO.ID] || !warIsOriginal_(r) || String(r[COL.HERO.CLS]) === '御主') return false;
    var c = warCreatorOf_(r);
    return !c || c === acct;
  });
}

function actionWarForgeList(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '請先登入。' });
  var mine = warOriginalsFor_(acct).map(function (r) {
    var s = warSeedFromRow_(r), six = {}, fx = [], lost = [], names = {};
    WAR_FORGE_.SIX.forEach(function (k) { six[k] = warForgeRank_(s.six[k]); });
    (s.skills || []).forEach(function (x) {
      var f = warForgeFx_(x && x.fx);
      if (f && fx.indexOf(f) < 0) { fx.push(f); names[f] = String((x && x.n) || ''); } else if (!f && x && x.n) lost.push(String(x.n));
    });
    return { id: s.id, name: s.realName, cls: s.cls, sex: s.gender, six: six, np: warNpName_(s.np), fx: fx, names: names, lost: lost,
      look: s.persona.look || '', words: s.persona.words || '', owned: warCreatorOf_(r) === acct };
  });
  var canon = SEED_SERVANTS.filter(function (s) { return s.cls !== '御主'; }).map(function (s) { return { id: s.id, name: s.realName, cls: s.cls }; });
  var clsSkills = {};
  WAR_FORGE_.CLASSES.forEach(function (c) { clsSkills[c] = (FORGE_CLS_SKILLS_[c] || []).map(function (k) { return k.n; }); });
  return JSON.stringify({
    success: true, mine: mine, canon: canon, clsSkills: clsSkills,
    origins: Object.keys(WAR_FORGE_ORIGINS_).map(function (k) { return { key: k, label: WAR_FORGE_ORIGINS_[k].label }; }),
    skills: WAR_FORGE_SKILLS_.map(function (p) { return { fx: p[0], name: p[1], txt: WAR_SKILL_[p[0]].txt }; }),
    rule: { ranks: WAR_FORGE_.RANKS, pts: warRankPts_(), cost: WAR_FORGE_.COST, npFloor: WAR_.NP_FLOOR, budget: WAR_FORGE_.BUDGET, maxSkills: WAR_FORGE_.MAX_SKILLS, six: WAR_FORGE_.SIX, classes: WAR_FORGE_.CLASSES, skillNameMax: WAR_FORGE_.SKILL_NAME_MAX, descMax: WAR_FORGE_.DESC_MAX }
  });
}

// 驗表單：回 { ok, msg, h }。h 是清乾淨的欄位。
// editing＝改既有的一位：真名與職階由表上那一列決定，不驗送來的。
function warForgeCheck_(b, editing) {
  b = b || {};
  // 開頭的 = + - @ 會被試算表當成公式（名字變成 #ERROR!、重名檢查永遠比不到）；反斜線會弄壞前端的 onclick。
  var clean = function (v, n) { return String(v || '').replace(/[<>&"'`｜【】\\\r\n\t]/g, '').trim().replace(/^[=+\-@\s]+/, '').slice(0, n); };
  var h = {
    name: clean(b.name, WAR_FORGE_.NAME_MAX), cls: String(b.cls || ''), sex: b.sex === '女' ? '女' : '男',
    np: clean(b.np, WAR_FORGE_.NP_MAX), look: clean(b.look, WAR_FORGE_.TEXT_MAX), words: clean(b.words, WAR_FORGE_.TEXT_MAX), six: {}, fx: [], names: {}
  };
  if (!editing && !/[一-鿿]/.test(h.name)) return { ok: false, msg: '真名需包含中文字。' };
  if (!editing && WAR_FORGE_.CLASSES.indexOf(h.cls) < 0) return { ok: false, msg: '請選擇職階。' };
  if (!h.np) return { ok: false, msg: '請填寫寶具名稱。' };
  var six = b.six || {};
  for (var i = 0; i < WAR_FORGE_.SIX.length; i++) {
    var k = WAR_FORGE_.SIX[i], r = String(six[k] || '');
    if (WAR_FORGE_.RANKS.indexOf(r) < 0) return { ok: false, msg: '請選擇' + k + '。' };
    h.six[k] = r;
  }
  if (warSixPts_(h.six) > WAR_FORGE_.BUDGET) return { ok: false, msg: '點數超過上限（' + WAR_FORGE_.BUDGET + ' 點）。' };
  var allow = WAR_FORGE_SKILLS_.map(function (p) { return p[0]; });
  (Array.isArray(b.fx) ? b.fx : []).forEach(function (f) { if (allow.indexOf(f) >= 0 && h.fx.indexOf(f) < 0) h.fx.push(f); });
  if (h.fx.length > WAR_FORGE_.MAX_SKILLS) return { ok: false, msg: '技能最多 ' + WAR_FORGE_.MAX_SKILLS + ' 個。' };
  var rep = {}, names = b.names || {};
  WAR_FORGE_SKILLS_.forEach(function (p) { rep[p[0]] = p[1]; });
  h.fx.forEach(function (f) { h.names[f] = clean(names[f], WAR_FORGE_.SKILL_NAME_MAX) || rep[f]; });
  var canonNames = SEED_SERVANTS.map(function (s) { return s.realName; }).concat(SEED_MASTERS.map(function (m) { return m.name; }));
  if (!editing && canonNames.indexOf(h.name) >= 0) return { ok: false, msg: '無法使用原作角色的名字。' };
  return { ok: true, h: h };
}

// 存：新做一位（ID＝真名-職階），或改自己的（真名與職階鎖住）。沒人認領的舊作改了就歸你。
function actionWarForgeSave(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '請先登入。' });
  var c = warForgeCheck_(userData.hero, !!String(userData.id || ''));
  if (!c.ok) return JSON.stringify({ success: false, message: c.msg });
  var h = c.h, sh = warHeroSheet_();
  if (!sh) return JSON.stringify({ success: false, message: '找不到英靈殿資料。' });
  var data = sh.getDataRange().getValues();
  var editId = String(userData.id || '');
  var idx = -1;
  if (editId) {
    idx = data.findIndex(function (r, i) { return i > 0 && String(r[COL.HERO.ID]) === editId; });
    if (idx < 0 || !warIsOriginal_(data[idx])) return JSON.stringify({ success: false, message: '找不到這位從者。' });
    var who = warCreatorOf_(data[idx]);
    if (who && who !== acct) return JSON.stringify({ success: false, message: '這位從者屬於其他玩家。' });
    h.name = String(data[idx][COL.HERO.NAME]); h.cls = String(data[idx][COL.HERO.CLS]);
  } else {
    var id = h.name + '-' + h.cls;
    if (data.some(function (r, i) { return i > 0 && (String(r[COL.HERO.ID]) === id || String(r[COL.HERO.NAME]) === h.name); }))
      return JSON.stringify({ success: false, message: '英靈殿已有同名從者。' });
  }
  var width = Math.max(data[0].length, COL.HERO.DAILY_OUTFIT + 1);
  var row = idx >= 0 ? data[idx].slice() : [];
  while (row.length < width) row.push('');
  var persona = idx >= 0 ? safeJson_(row[COL.HERO.PERSONA], {}) : {};
  var lookChanged = idx < 0 || persona.look !== h.look, wordsChanged = idx < 0 || persona.words !== h.words;
  persona.look = h.look; persona.words = h.words; persona.creator = acct;
  // 鑑賞要的日常三格：外貌／性格有變才重翻（舊工房同一組翻譯），失敗就留空，鑑賞會退回用外貌與性格。
  try {
    if (lookChanged) { var dl = translateLookToDaily_(h.name, h.cls, h.look, h.sex); row[COL.HERO.DAILY_LOOK] = dl.look || ''; row[COL.HERO.DAILY_OUTFIT] = dl.outfit || ''; }
    if (wordsChanged) row[COL.HERO.DAILY_WORDS] = translatePersonalityToDaily_(h.name, h.cls, h.words) || '';
  } catch (e) { }
  row[COL.HERO.ID] = idx >= 0 ? editId : h.name + '-' + h.cls;
  row[COL.HERO.CLS] = h.cls;
  row[COL.HERO.NAME] = h.name;
  row[COL.HERO.SEX] = h.sex;
  row[COL.HERO.SIX] = JSON.stringify(h.six);
  row[COL.HERO.CLASS_SKILLS] = JSON.stringify(FORGE_CLS_SKILLS_[h.cls] || []);
  row[COL.HERO.SKILLS] = JSON.stringify(h.fx.map(function (f) { return { n: h.names[f], r: 'B', fx: f }; }));
  if (idx < 0) row[COL.HERO.TRAITS] = '[]';
  row[COL.HERO.NP] = h.np + '（' + h.six['寶具'] + '）';
  row[COL.HERO.PERSONA] = JSON.stringify(persona);
  if (idx < 0) { row[COL.HERO.ALIGN] = '中立'; row[COL.HERO.WARS] = '[]'; }
  row[COL.HERO.SOURCE] = 'ai_gen';
  row[COL.HERO.DAILY_MOE] = '';
  if (idx >= 0) sh.getRange(idx + 1, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  try { CacheService.getScriptCache().remove('FATE_HERO_CODEX'); } catch (e) { }
  return JSON.stringify({ success: true, id: row[COL.HERO.ID], message: idx >= 0 ? '已更新。' : '已登錄「' + h.name + '」。' });
}

// 六圍收進點數上限：超過就從最高的那格往下降一階，不到就把最突出的那格往上加（保住角色的強項），直到剛好用完或加不上去。
function warForgeFit_(six) {
  var R = WAR_FORGE_.RANKS, s = {}, budget = WAR_FORGE_.BUDGET;
  WAR_FORGE_.SIX.forEach(function (k) { s[k] = R.indexOf(warForgeRank_(six && six[k])) >= 0 ? warForgeRank_(six[k]) : 'C'; });
  var cells = function () {   // 算點數的格子：攻擊那組取較高的那一格
    return WAR_FORGE_.COST.map(function (g) { return g.slice().sort(function (a, b) { return R.indexOf(s[b]) - R.indexOf(s[a]); })[0]; });
  };
  for (var guard = 0; guard < 40 && warSixPts_(s) > budget; guard++) {
    var hi = cells().sort(function (a, b) { return R.indexOf(s[b]) - R.indexOf(s[a]); })[0];
    if (R.indexOf(s[hi]) <= 0) break;
    s[hi] = R[R.indexOf(s[hi]) - 1];
  }
  for (var up = 0; up < 40; up++) {
    var grow = cells().filter(function (k) { return R.indexOf(s[k]) < R.indexOf('A'); })
      .sort(function (a, b) { return R.indexOf(s[b]) - R.indexOf(s[a]); })
      .filter(function (k) { var t = {}; for (var x in s) t[x] = s[x]; t[k] = R[R.indexOf(s[k]) + 1]; return warSixPts_(t) <= budget; })[0];
    if (!grow) break;
    s[grow] = R[R.indexOf(s[grow]) + 1];
  }
  return s;
}

// ✨ AI 幫我做：照出處與一句描述寫一份草稿，回給前端填進表單（這裡不存檔，存檔照常走 war_forge_save 的驗證）。
function actionWarForgeAi(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '請先登入。' });
  var og = WAR_FORGE_ORIGINS_[String(userData.origin || '')] || WAR_FORGE_ORIGINS_.original;
  var desc = String(userData.desc || '').replace(/[<>&"'`｜【】\\\r\n\t]/g, ' ').trim().slice(0, WAR_FORGE_.DESC_MAX);
  if (!desc) return JSON.stringify({ success: false, message: '請寫一句描述。' });
  var cls = WAR_FORGE_.CLASSES.indexOf(String(userData.cls || '')) >= 0 ? String(userData.cls) : '';
  var raw = callGeminiAPI(warForgeAiPrompt_(desc, cls), warForgeAiSys_(og), { temperature: 0.9, retries: 2 });
  var out = null;
  try { out = JSON.parse(String(raw || '')); } catch (e) { out = null; }
  if (!out || out._genFailed || typeof out !== 'object' || !String(out.name || '').trim()) return JSON.stringify({ success: false, message: '這次沒有做出來，請換個說法再試一次。' });
  return JSON.stringify({ success: true, hero: warForgeDraft_(out, cls) });
}
function warForgeAiSys_(og) {
  var list = WAR_FORGE_SKILLS_.map(function (p) { return p[0] + '：' + WAR_SKILL_[p[0]].txt; }).join('\n');
  return '你是《命運停駐之夜》的英靈工房，照玩家的描述做出一位從者。' + og.frame + '\n' +
    '★真名：中文，' + WAR_FORGE_.NAME_MAX + ' 字以內。\n' +
    '★職階：Saber／Archer／Lancer／Rider／Caster／Assassin／Berserker 擇一，挑最貼合的。\n' +
    '★六圍：筋力、耐久、敏捷、魔力、幸運、寶具，各填 E／D／C／B／A／EX 其中之一，照傳說有強有弱。' +
    '計點方式：攻擊（筋力、魔力取較高者）＋耐久＋敏捷＋寶具，E=1、D=2、C=3、B=4、A=5、EX=7，四格合計剛好 ' + WAR_FORGE_.BUDGET + ' 點；幸運與較低的攻擊格照形象自由給。\n' +
    '★寶具：名稱 ' + WAR_FORGE_.NP_MAX + ' 字以內，取這位角色最招牌的一招。\n' +
    '★技能：恰好 ' + WAR_FORGE_.MAX_SKILLS + ' 個，每個寫 {"n":"技能名","fx":"效果碼"}。' + og.skill +
    '技能名 ' + WAR_FORGE_.SKILL_NAME_MAX + ' 字以內；效果碼從下面清單挑最貼近這個技能的，三個效果碼各不相同。\n' + list + '\n' +
    '★外貌：一句，' + WAR_FORGE_.TEXT_MAX + ' 字以內，寫看得見的樣子。★性格：一句，' + WAR_FORGE_.TEXT_MAX + ' 字以內。\n' +
    '只輸出 JSON：{"name":"","cls":"","sex":"男或女","six":{"筋力":"","耐久":"","敏捷":"","魔力":"","幸運":"","寶具":""},"np":"","skills":[{"n":"","fx":""}],"look":"","words":""}';
}
function warForgeAiPrompt_(desc, cls) {
  return '描述：' + desc + (cls ? '\n職階指定：' + cls : '');
}
// AI 的回覆 → 表單草稿：數字收進點數上限、效果碼只收清單上的、名字照工房的長度剪。
function warForgeDraft_(o, cls) {
  var cut = function (v, n) { return String(v || '').replace(/[<>&"'`｜【】\\\r\n\t]/g, '').trim().replace(/^[=+\-@\s]+/, '').slice(0, n); };
  var allow = WAR_FORGE_SKILLS_.map(function (p) { return p[0]; }), fx = [], names = {};
  (Array.isArray(o.skills) ? o.skills : []).forEach(function (x) {
    var f = String((x && x.fx) || '');
    if (allow.indexOf(f) < 0 || fx.indexOf(f) >= 0 || fx.length >= WAR_FORGE_.MAX_SKILLS) return;
    fx.push(f); names[f] = cut(x.n, WAR_FORGE_.SKILL_NAME_MAX);
  });
  var c = cls || (WAR_FORGE_.CLASSES.indexOf(String(o.cls || '')) >= 0 ? String(o.cls) : 'Saber');
  return {
    name: cut(o.name, WAR_FORGE_.NAME_MAX), cls: c, sex: o.sex === '女' ? '女' : '男', six: warForgeFit_(o.six || {}),
    np: cut(o.np, WAR_FORGE_.NP_MAX), fx: fx, names: names, look: cut(o.look, WAR_FORGE_.TEXT_MAX), words: cut(o.words, WAR_FORGE_.TEXT_MAX)
  };
}

// 🛠️ 職階技能慣例表（工房自動附贈·不占 3 槽·與種子/AI 生成對稱）
var FORGE_CLS_SKILLS_ = {
  Saber: [{ n: "對魔力", r: "B", fx: "nullify_magic" }], Lancer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }],
  Archer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "單獨行動", r: "C", fx: "solo" }],
  Rider: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "騎乘", r: "B", fx: "ride" }],
  Caster: [{ n: "陣地作成", r: "C", fx: "territory" }, { n: "道具作成", r: "C", fx: "crafting" }],
  Assassin: [{ n: "氣息遮斷", r: "B", fx: "stealth" }], Berserker: [{ n: "狂化", r: "C", fx: "mad" }]
};
