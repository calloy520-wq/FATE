// 🛠️ 英靈工房（新聖杯戰爭與鑑賞共用）：一張表單、寫一列完整的英靈殿。技能只能從 WAR_SKILL_ 挑，職階技能照 FORGE_CLS_SKILLS_ 自動附上。為什麼：見 CODE_NOTES.md『WAR_FORGE_』。

var WAR_FORGE_ = {
  RANKS: ['E', 'D', 'C', 'B', 'A', 'EX'],
  PTS: { E: 1, D: 2, C: 3, B: 4, A: 5, EX: 6 },
  BUDGET: 22,              // 原作從者中位數 20、最高 29（赫拉克勒斯）：做得出好用的，做不出比 Saber 還強的
  MAX_SKILLS: 3,
  NAME_MAX: 12, NP_MAX: 16, TEXT_MAX: 40,
  SIX: ['筋力', '耐久', '敏捷', '魔力', '幸運', '寶具'],
  CLASSES: ['Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker']
};
// 能挑的技能：每一個效果列一個代表名（同一列只列一次）。
var WAR_FORGE_SKILLS_ = [
  ['first_strike', '直感'], ['survive', '戰鬥續行'], ['ride', '騎乘'], ['stealth', '氣息遮斷'], ['territory', '陣地作成'],
  ['mad', '狂化'], ['nullify_magic', '對魔力'], ['aim', '千里眼'], ['solo', '單獨行動'], ['evade_ranged', '避矢加護'], ['tactics', '軍略']
];

function warHeroSheet_() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('英靈殿'); }
function warIsOriginal_(row) { return String(row[COL.HERO.SOURCE] || '') !== 'seed'; }
function warCreatorOf_(row) { return String(safeJson_(row[COL.HERO.PERSONA], {}).creator || ''); }
function warSixPts_(six) {
  return WAR_FORGE_.SIX.reduce(function (a, k) { return a + (WAR_FORGE_.PTS[six[k]] || 0); }, 0);
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
  if (!acct) return JSON.stringify({ success: false, message: '先登入帳號。' });
  var mine = warOriginalsFor_(acct).map(function (r) {
    var s = warSeedFromRow_(r), fx = warSkillsOf_({ skills: s.skills }).fx;
    return { id: s.id, name: s.realName, cls: s.cls, sex: s.gender, six: s.six, np: warNpName_(s.np), fx: fx,
      look: s.persona.look || '', words: s.persona.words || '', owned: warCreatorOf_(r) === acct };
  });
  var canon = SEED_SERVANTS.filter(function (s) { return s.cls !== '御主'; }).map(function (s) { return { id: s.id, name: s.realName, cls: s.cls }; });
  var clsSkills = {};
  WAR_FORGE_.CLASSES.forEach(function (c) { clsSkills[c] = (FORGE_CLS_SKILLS_[c] || []).map(function (k) { return k.n; }); });
  return JSON.stringify({
    success: true, mine: mine, canon: canon, clsSkills: clsSkills,
    skills: WAR_FORGE_SKILLS_.map(function (p) { return { fx: p[0], name: p[1], txt: WAR_SKILL_[p[0]].txt }; }),
    rule: { ranks: WAR_FORGE_.RANKS, pts: WAR_FORGE_.PTS, budget: WAR_FORGE_.BUDGET, maxSkills: WAR_FORGE_.MAX_SKILLS, six: WAR_FORGE_.SIX, classes: WAR_FORGE_.CLASSES }
  });
}

// 驗表單：回 { ok, msg, h }。h 是清乾淨的欄位。
function warForgeCheck_(b) {
  b = b || {};
  var clean = function (v, n) { return String(v || '').replace(/[<>&"'`｜【】\r\n\t]/g, '').trim().slice(0, n); };
  var h = {
    name: clean(b.name, WAR_FORGE_.NAME_MAX), cls: String(b.cls || ''), sex: b.sex === '女' ? '女' : '男',
    np: clean(b.np, WAR_FORGE_.NP_MAX), look: clean(b.look, WAR_FORGE_.TEXT_MAX), words: clean(b.words, WAR_FORGE_.TEXT_MAX), six: {}, fx: []
  };
  if (!/[一-鿿]/.test(h.name)) return { ok: false, msg: '真名要有中文字。' };
  if (WAR_FORGE_.CLASSES.indexOf(h.cls) < 0) return { ok: false, msg: '選一個職階。' };
  if (!h.np) return { ok: false, msg: '寶具要有名字。' };
  var six = b.six || {};
  for (var i = 0; i < WAR_FORGE_.SIX.length; i++) {
    var k = WAR_FORGE_.SIX[i], r = String(six[k] || '');
    if (WAR_FORGE_.RANKS.indexOf(r) < 0) return { ok: false, msg: k + '還沒選。' };
    h.six[k] = r;
  }
  if (warSixPts_(h.six) > WAR_FORGE_.BUDGET) return { ok: false, msg: '六圍超過 ' + WAR_FORGE_.BUDGET + ' 點。' };
  var allow = WAR_FORGE_SKILLS_.map(function (p) { return p[0]; });
  (Array.isArray(b.fx) ? b.fx : []).forEach(function (f) { if (allow.indexOf(f) >= 0 && h.fx.indexOf(f) < 0) h.fx.push(f); });
  if (h.fx.length > WAR_FORGE_.MAX_SKILLS) return { ok: false, msg: '技能最多 ' + WAR_FORGE_.MAX_SKILLS + ' 個。' };
  var canonNames = SEED_SERVANTS.map(function (s) { return s.realName; }).concat(SEED_MASTERS.map(function (m) { return m.name; }));
  if (canonNames.indexOf(h.name) >= 0) return { ok: false, msg: '這是原作角色的名字，換一個。' };
  return { ok: true, h: h };
}

// 存：新做一位（ID＝真名-職階），或改自己的（真名與職階鎖住）。沒人認領的舊作改了就歸你。
function actionWarForgeSave(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '先登入帳號。' });
  var c = warForgeCheck_(userData.hero);
  if (!c.ok) return JSON.stringify({ success: false, message: c.msg });
  var h = c.h, sh = warHeroSheet_();
  if (!sh) return JSON.stringify({ success: false, message: '找不到英靈殿。' });
  var data = sh.getDataRange().getValues();
  var editId = String(userData.id || '');
  var idx = -1;
  if (editId) {
    idx = data.findIndex(function (r, i) { return i > 0 && String(r[COL.HERO.ID]) === editId; });
    if (idx < 0 || !warIsOriginal_(data[idx])) return JSON.stringify({ success: false, message: '找不到這位從者。' });
    var who = warCreatorOf_(data[idx]);
    if (who && who !== acct) return JSON.stringify({ success: false, message: '這位是別人做的。' });
    h.name = String(data[idx][COL.HERO.NAME]); h.cls = String(data[idx][COL.HERO.CLS]);
  } else {
    var id = h.name + '-' + h.cls;
    if (data.some(function (r, i) { return i > 0 && (String(r[COL.HERO.ID]) === id || String(r[COL.HERO.NAME]) === h.name); }))
      return JSON.stringify({ success: false, message: '英靈殿裡已經有這個名字了。' });
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
  var skillName = {};
  WAR_FORGE_SKILLS_.forEach(function (p) { skillName[p[0]] = p[1]; });
  row[COL.HERO.ID] = idx >= 0 ? editId : h.name + '-' + h.cls;
  row[COL.HERO.CLS] = h.cls;
  row[COL.HERO.NAME] = h.name;
  row[COL.HERO.SEX] = h.sex;
  row[COL.HERO.SIX] = JSON.stringify(h.six);
  row[COL.HERO.CLASS_SKILLS] = JSON.stringify(FORGE_CLS_SKILLS_[h.cls] || []);
  row[COL.HERO.SKILLS] = JSON.stringify(h.fx.map(function (f) { return { n: skillName[f], r: 'B', fx: f }; }));
  if (idx < 0) row[COL.HERO.TRAITS] = '[]';
  row[COL.HERO.NP] = h.np + '（' + h.six['寶具'] + '）';
  row[COL.HERO.PERSONA] = JSON.stringify(persona);
  if (idx < 0) { row[COL.HERO.ALIGN] = '中立'; row[COL.HERO.WARS] = '[]'; }
  row[COL.HERO.SOURCE] = 'ai_gen';
  row[COL.HERO.DAILY_MOE] = '';
  if (idx >= 0) sh.getRange(idx + 1, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  try { CacheService.getScriptCache().remove('FATE_HERO_CODEX'); } catch (e) { }
  return JSON.stringify({ success: true, id: row[COL.HERO.ID], message: idx >= 0 ? '改好了。' : '「' + h.name + '」進了英靈殿。' });
}
