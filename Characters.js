// FATE 自創角色：聖杯戰爭的自創英靈（meta.customServant）與自由沙盒的自創角色、同行（meta.sandboxChars／sandboxParty）。
// 和 Code.js 共用 GAS 的全域空間；這個檔只放函式與「不引用其他檔案」的常數，載入順序不影響（tests/load-order.js 會檢查）。

// ==================== 自創英靈：玩家自訂外貌、職階、能力、寶具，存在自己的 meta.customServant ====================
// 只能當玩家的主從者，不頂替原作七組；強度依能力值換算，上限與現有最強的英靈相同
const CUSTOM_SERVANT_ID_ = 'custom_servant';
let ACTIVE_CUSTOM_SERVANT_ = null;
const CUSTOM_SERVANT_CLASSES_ = ['Saber', 'Archer', 'Lancer', 'Rider', 'Caster', 'Assassin', 'Berserker', 'Ruler', 'Avenger', 'Alter Ego', 'Moon Cancer', 'Foreigner', 'Shielder', 'Pretender'];
const SERVANT_RANKS_ = ['EX', 'A++', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E+', 'E'];
const SERVANT_STAT_KEYS_ = [['str', '筋力'], ['end', '耐久'], ['agi', '敏捷'], ['mana', '魔力'], ['luck', '幸運'], ['np', '寶具']];

// 帶入現有英靈：只帶外貌與能力值當起點，玩家可以再改（黑 Saber 不可開局召喚，所以不提供）
const SERVANT_TEMPLATES_ = {
  saber: { cls: 'Saber', stats: 'B,B,B,A,A+,A++', np: '誓約勝利之劍' },
  archer: { cls: 'Archer', stats: 'D,C,C,B,E,C', np: '無限劍製' },
  lancer: { cls: 'Lancer', stats: 'B,C,A,C,E,B', np: '刺穿死棘之槍' },
  rider: { cls: 'Rider', stats: 'B,D,A,C,E,A+', np: '騎英之韁繩' },
  caster: { cls: 'Caster', stats: 'E,D,C,A+,B,C', np: '萬符必應破戒' },
  assassin: { cls: 'Assassin', stats: 'C,E,A+,E,A,E', np: '燕返' },
  berserker: { cls: 'Berserker', stats: 'A+,A,A,A,B,A', np: '十二試煉' },
  gilgamesh: { cls: 'Archer', stats: 'B,C,C,B,A,EX', np: '天地乖離開闢之星' },
  scathach: { cls: 'Lancer', stats: 'B,A,A,C,D,A+', np: '貫穿死翔之槍' },
  jeanne: { cls: 'Ruler', stats: 'B,B,A,A,C,A', np: '吾主在此' },
  jalter: { cls: 'Avenger', stats: 'A,C,A,A+,D,A+', np: '吼哮吧，吾之憤怒' },
  mordred: { cls: 'Saber', stats: 'B+,A,B,B,D,A', np: '向我敬愛的父王叛逆' },
  okita: { cls: 'Saber', stats: 'C,E,A+,E,D,C', np: '無明三段突' },
  tamamo: { cls: 'Caster', stats: 'E,E,B,A,D,B', np: '水天日光天照八野鎮石' },
  ereshkigal: { cls: 'Lancer', stats: 'B,A,C,A,EX,A+', np: '靈峰踏抱冥府鞴' },
  karna: { cls: 'Lancer', stats: 'B,C,A,B,D,EX', np: '日輪啊，順從死亡' },
  hassan: { cls: 'Assassin', stats: 'B,C,A,C,E,C', np: '妄想心音' }
};

function setActiveCustomServant_(cs) {
  const next = (cs && typeof cs === 'object' && cs.name && cs.core) ? cs : null;
  if (JSON.stringify(next) === JSON.stringify(ACTIVE_CUSTOM_SERVANT_)) return;
  ACTIVE_CUSTOM_SERVANT_ = next;
  CHAR_DB_MEMO_ = null;
}

function cleanTagText_(v, maxLen) {
  return String(v || '').replace(/[\r\n\t]+/g, ' ').replace(/[{}<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function normalizeServantRank_(v) {
  const r = String(v || '').toUpperCase().replace(/\s+/g, '');
  return SERVANT_RANKS_.indexOf(r) >= 0 ? r : 'C';
}

function customServantParamsText_(stats) {
  return SERVANT_STAT_KEYS_.map(([k, zh]) => `${zh}:${normalizeServantRank_(stats && stats[k])}`).join(' ');
}

// 身形選單 → 標籤（自創英靈預設沒有身高資訊時，NovelAI 常把成熟女性角色畫得很高）
function customServantCore_(cs) {
  const core = String((cs && cs.core) || '');
  const b = cs && cs.build;
  const tag = b === 'petite' ? 'petite, short' : (b === 'tall' ? (cs.gender === 'boy' ? 'tall male' : 'tall female') : '');
  if (!tag || /\b(petite|tall female|tall male|short stature)\b/i.test(core)) return core;
  return `${core}, ${tag}`;
}

// 能力值換算成戰力等級（2～5）：全 A 以上才到最高級
function customServantTier_(stats) {
  const val = r => ({ 'EX': 6, 'A++': 5.6, 'A+': 5.3, 'A': 5, 'B+': 4.3, 'B': 4, 'C+': 3.3, 'C': 3, 'D+': 2.3, 'D': 2, 'E+': 1.3, 'E': 1 })[normalizeServantRank_(r)];
  const avg = SERVANT_STAT_KEYS_.reduce((sum, [k]) => sum + val(stats && stats[k]), 0) / SERVANT_STAT_KEYS_.length;
  if (avg >= 4.8) return 5;
  if (avg >= 4.0) return 4;
  if (avg >= 3.0) return 3;
  return 2;
}

function sanitizeCustomServant_(raw) {
  const r = raw || {};
  const name = cleanTagText_(r.name, 24);
  if (!name) throw new Error('請替自創英靈取一個真名！');
  const core = cleanTagText_(r.core, 500);
  if (!core) throw new Error('請填寫自創英靈的核心外觀 Tags（可先輸入中文描述再按「✨ 找提示」）。');
  const stats = {};
  SERVANT_STAT_KEYS_.forEach(([k]) => { stats[k] = normalizeServantRank_(r.stats && r.stats[k]); });
  return {
    id: CUSTOM_SERVANT_ID_,
    name: name,
    cls: CUSTOM_SERVANT_CLASSES_.indexOf(String(r.cls)) >= 0 ? String(r.cls) : 'Saber',
    gender: r.gender === 'boy' ? 'boy' : 'girl',
    core: core,
    outfit: cleanTagText_(r.outfit, 400),
    uc: cleanTagText_(r.uc, 300),
    officialTag: cleanTagText_(r.officialTag, 80),
    expression: cleanTagText_(r.expression, 60),
    build: ['petite', 'average', 'tall'].indexOf(String(r.build)) >= 0 ? String(r.build) : '',
    npVisual: cleanTagText_(r.npVisual, 200),
    stats: stats,
    npName: cleanTagText_(r.npName, 30),
    npEffect: cleanTagText_(r.npEffect, 150),
    personality: cleanTagText_(r.personality, 150),
    tier: customServantTier_(stats)
  };
}

function getServantTier_(id) {
  if (id === CUSTOM_SERVANT_ID_ && ACTIVE_CUSTOM_SERVANT_) return Number(ACTIVE_CUSTOM_SERVANT_.tier) || 3;
  return SERVANT_TIER_[id] || 3;
}

function describeCustomServantForPrompt_(cs) {
  if (!cs || !cs.name) return '';
  return `【自創英靈設定（原創英靈，依此扮演，不要套用其他既有英靈的身分、寶具或口吻）】ID:${CUSTOM_SERVANT_ID_} | 真名:${cs.name} | 職階:${cs.cls} | 性別:${cs.gender === 'boy' ? '男' : '女'} | 能力:${customServantParamsText_(cs.stats)} | 寶具:「${cs.npName || '未公開'}」${cs.npEffect ? '— ' + cs.npEffect : ''}${cs.personality ? ' | 個性:' + cs.personality : ''}`;
}

// 前端「帶入現有英靈」用：外貌取自 GameData.js，職階、能力值、寶具取自上面的表
function getServantTemplates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const charDb = getCharAppearanceMap_(ss);
  const order = ['', 'str', 'end', 'agi', 'mana', 'luck', 'np'];
  return Object.keys(SERVANT_TEMPLATES_).filter(id => charDb[id]).map(id => {
    const t = SERVANT_TEMPLATES_[id];
    const ranks = t.stats.split(',');
    const stats = {};
    order.slice(1).forEach((k, i) => { stats[k] = ranks[i]; });
    return {
      id: id,
      name: charDb[id].triggers.split(',')[0].trim(),
      gender: charDb[id].gender,
      cls: t.cls,
      core: charDb[id].coreTraits,
      outfit: charDb[id].defaultOutfit,
      uc: charDb[id].uc,
      expression: CHAR_DEFAULT_EXPRESSION_[id] || '',
      npVisual: NP_VISUAL_EFFECTS_[id] || '',
      npName: t.np,
      stats: stats
    };
  });
}

// 「✨ 找提示」：把中文描述翻成 Danbooru 標籤；如果描述的是現有作品角色，推薦正確的官方角色標籤拼法
function enhanceServantAppearance(zhDesc, gender, name, cls, kind) {
  const genderTag = gender === 'boy' ? 'boy' : 'girl';
  const everyday = kind === 'sandbox'; // 沙盒自創角色：一般人，服裝是日常穿著
  const systemPrompt = [
    'You are an expert NovelAI Diffusion V5 & Danbooru prompt writer for Fate/Type-Moon style characters.',
    'The user is designing an original (or existing) Heroic Spirit. Convert the Traditional Chinese description into precise Danbooru tags.',
    'Output strictly valid JSON with keys: "official_tag", "core_tags", "outfit_tags", "uc_tags", "expression_tag", "np_visual_tags", "build", "advice_zh".',
    '- build: body height judged from the description: "petite" (small, childlike, short), "tall" (tall, imposing, mature goddess-like only if the description says tall), otherwise "average". Do NOT put height tags in core_tags.',
    '- official_tag: if the name/description clearly refers to an existing character with a Danbooru character tag, give the EXACT tag spelling (e.g. "scathach (fate)", "sasaki kojirou (fate)", "artoria pendragon (fate)"). Otherwise "".',
    `- core_tags: start with "${genderTag}", then official_tag if any, then permanent physical traits ONLY (hair color, hair length/style, eye color, skin, body, age look). NO clothes, NO style, NO background.`,
    everyday ? '- outfit_tags: the everyday outfit described (clothes, legwear, footwear, accessories) ONLY; no armor or weapons unless described. Must be clothed.' : '- outfit_tags: the default battle outfit (clothes, armor, legwear, footwear, accessories) ONLY. Must be clothed.',
    '- uc_tags: 3-6 negative tags that prevent the most likely mistakes (wrong hair color/length, wrong skin, etc.).',
    '- expression_tag: one short default facial expression fitting the personality (e.g. "confident smile").',
    '- np_visual_tags: short English tags for the Noble Phantasm visual effect.',
    '- advice_zh: 1-2 short Traditional Chinese tips (e.g. which tag to weight with 1.2::tag:: if the model may get it wrong).'
  ].join('\n');
  const userMsg = `Name: ${String(name || '').slice(0, 40)}\nClass: ${String(cls || '').slice(0, 20)}\nGender: ${genderTag}\nChinese Description: ${String(zhDesc || '').slice(0, 400)}`;
  const res = callGeminiLiteJson_(systemPrompt, userMsg, 0.2, 900) || {};
  // Gemini 偶爾把標籤回成陣列、建議裡寫 Stable Diffusion 的 (tag:1.2) 權重寫法 → 統一成字串與 NovelAI 的 1.2::tag::
  ['official_tag', 'core_tags', 'outfit_tags', 'uc_tags', 'expression_tag', 'np_visual_tags', 'build'].forEach(k => {
    if (Array.isArray(res[k])) res[k] = res[k].map(x => String(x).trim()).filter(Boolean).join(', ');
  });
  if (typeof res.advice_zh === 'string') res.advice_zh = res.advice_zh.replace(/\(([^():]+):\s*([\d.]+)\)/g, '$2::$1::');
  return res;
}

// 預覽：mode = 'game'（遊戲實際畫法）或 'official'（模擬 NovelAI 官網預設：只打角色標籤、負面預設「重」、步驟 23、引導 7）
function previewCustomServant(raw, mode) {
  const cs = sanitizeCustomServant_(raw);
  const gTag = cs.gender === 'boy' ? '1boy' : '1girl';
  if (mode === 'official') {
    const base = cs.officialTag
      ? `${gTag}, solo, ${cs.officialTag}`
      : [gTag, 'solo', normalizeCharCoreForNai_(customServantCore_(cs), cs.gender).replace(/^(girl|boy),\s*/i, ''), cs.outfit].filter(Boolean).join(', ');
    return generateNovelAIImageSafe_({
      prompt: base,
      noStyle: true,
      qualityTags: 'very aesthetic, masterpiece, no text',
      baseUc: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
      characters: [],
      width: 832, height: 1216, steps: 23, scale: 7, cfgRescale: 0
    });
  }
  const core = normalizeCharCoreForNai_(customServantCore_(cs), cs.gender);
  const action = ensureExpression_('standing, looking at viewer, cowboy shot, dynamic pose', cs.expression || 'light smile');
  return generateNovelAIImageSafe_({
    prompt: `${gTag}, solo, glowing magic circle, summoning, mana particles, dramatic lighting`,
    artStyle: 'official',
    characters: [{
      prompt: [core, formatCharacterOutfitPrompt_(cs.outfit), action].filter(Boolean).join(', '),
      uc: [cs.uc, 'holding weapon, multiple views'].filter(Boolean).join(', '),
      gender: cs.gender, x: 0.5, y: 0.5
    }],
    width: 832, height: 1216, steps: 28, scale: 5.0, cfgRescale: 0.25
  });
}

// ==================== 自由沙盒：玩家自創角色（最多 6 位，同行最多 2 位） ====================
// 只存在沙盒那一列存檔（meta.sandboxChars／meta.sandboxParty）；聖杯戰爭模式不讀、提示詞也不加
const SANDBOX_CHAR_MAX_ = 5;
const SANDBOX_PARTY_MAX_ = 2;
let ACTIVE_SANDBOX_CHARS_ = [];

function sanitizeSandboxChar_(raw, id) {
  const r = raw || {};
  const name = cleanTagText_(r.name, 20).replace(/[,，]/g, '');
  if (!name) throw new Error('請替角色取個名字！');
  const core = cleanTagText_(r.core, 500);
  if (!core) throw new Error('請填寫外觀 Tags（可先輸入中文描述再按「✨ 找提示」）。');
  return {
    id: id,
    name: name,
    gender: r.gender === 'boy' ? 'boy' : 'girl',
    build: ['petite', 'average', 'tall'].indexOf(String(r.build)) >= 0 ? String(r.build) : '',
    core: core,
    outfit: cleanTagText_(r.outfit, 400),
    uc: cleanTagText_(r.uc, 300),
    expression: cleanTagText_(r.expression, 60),
    personality: cleanTagText_(r.personality, 150),
    relation: cleanTagText_(r.relation, 60)
  };
}

function setActiveSandboxChars_(list) {
  const next = (Array.isArray(list) ? list : []).filter(c => c && /^sbc_\d+$/.test(String(c.id)) && c.name && c.core).slice(0, SANDBOX_CHAR_MAX_);
  if (JSON.stringify(next) === JSON.stringify(ACTIVE_SANDBOX_CHARS_)) return;
  ACTIVE_SANDBOX_CHARS_ = next;
  CHAR_DB_MEMO_ = null;
}

// 同行可以是現有角色（GameData.js 的本作角色）或玩家自創角色
function sandboxPartyCandidates_(meta) {
  const ids = new Set((Array.isArray(meta && meta.sandboxChars) ? meta.sandboxChars : []).map(c => c && c.id));
  (typeof FATE_CHARACTERS_ !== 'undefined' ? FATE_CHARACTERS_ : []).forEach(c => { if (c.id !== 'player_master') ids.add(c.id); });
  return ids;
}
function sandboxPartyOf_(meta) {
  const ids = sandboxPartyCandidates_(meta);
  return (Array.isArray(meta && meta.sandboxParty) ? meta.sandboxParty : []).filter(id => ids.has(id)).slice(0, SANDBOX_PARTY_MAX_);
}
function sandboxMemberName_(meta, id) {
  const own = (Array.isArray(meta && meta.sandboxChars) ? meta.sandboxChars : []).find(c => c && c.id === id);
  if (own) return own.name;
  const c = (typeof FATE_CHARACTERS_ !== 'undefined' ? FATE_CHARACTERS_ : []).find(x => x.id === id);
  return c ? String(c.names || id).split(',')[0].trim() : id;
}

// 玩家行動寫的時段和現在不同（清晨說要看夕陽、白天說看夜景）：提示詞補一行時間檢查，避免劇情跳時間
// （系統提示詞已有「時間以狀態列為準」，flash-lite 常不聽；像物品檢查一樣放在動態段前面才有用）
const TIME_WORDS_ = {
  '清晨': /早上|清晨|早晨|日出|朝陽|晨光/,
  '白天': /中午|正午|午後|下午|大白天/,
  '黃昏': /夕陽|黃昏|傍晚|晚霞|日落/,
  '深夜': /夜景|深夜|半夜|星空|月光|夜空|午夜|晚上|今晚|夜裡/
};
function detectTimeMismatch_(userAction, period) {
  const act = String(userAction || '').replace(/晚安|早安|午安/g, '');
  const hits = Object.keys(TIME_WORDS_).filter(k => {
    const m = act.match(TIME_WORDS_[k]);
    if (!m) return false;
    // 「明天早上」「等到傍晚」「晚上再去」是約之後的時間，不算
    const before = act.slice(Math.max(0, m.index - 3), m.index);
    return !/明天|明早|明晚|等到|之後|待會|再/.test(before);
  });
  if (!hits.length || hits.indexOf(period) >= 0) return '';
  return hits.map(k => act.match(TIME_WORDS_[k])[0]).join('」「');
}

// 玩家說要一個人行動：同行者這回合不跟
function isAloneAction_(text) {
  return /一個人|獨自|單獨|自己一個|隻身|獨行/.test(String(text || ''));
}

// 沒有同行、也沒提到自創角色時一個字都不加（使用者：沒同行就不用花）
function describeSandboxCharsForPrompt_(meta, userAction) {
  const list = Array.isArray(meta && meta.sandboxChars) ? meta.sandboxChars : [];
  const party = sandboxPartyOf_(meta);
  // 玩家在「👥 同行」換了人：告訴 AI 誰離開、誰加入（上一回合的同行存在 sandboxPartyPrev）
  const prev = Array.isArray(meta && meta.sandboxPartyPrev) ? meta.sandboxPartyPrev : party;
  const left = prev.filter(id => party.indexOf(id) < 0);
  const joined = party.filter(id => prev.indexOf(id) < 0);
  const descOwn = c => `${c.name}（ID:${c.id}・玩家自創・${c.gender === 'boy' ? '男' : '女'}${c.relation ? '・' + c.relation : ''}${c.personality ? '・個性:' + c.personality : ''}）`;
  const desc = id => { const own = list.find(c => c.id === id); return own ? descOwn(own) : `${sandboxMemberName_(meta, id)}（ID:${id}・依原作個性）`; };
  const act = String(userAction || '');
  const alone = isAloneAction_(act);
  const called = list.filter(c => party.indexOf(c.id) < 0 && act.indexOf(c.name) >= 0);
  const lines = [];
  if (left.length) lines.push(`【同行變動】${left.map(id => sandboxMemberName_(meta, id)).join('、')} 已經離開玩家身邊（各自回去了）：本回合不在場，不要寫她們還跟著，也不要填進 present_chars，除非玩家去找她們。`);
  if (joined.length) lines.push(`【同行變動】${joined.map(id => sandboxMemberName_(meta, id)).join('、')} 剛來到玩家身邊會合：本回合開頭自然地寫她們登場。`);
  if (party.length) lines.push(alone
    ? `【同行中】${party.map(desc).join('、')}：玩家本回合說要一個人行動，她們這次不跟（留在原處或各自活動），不要寫她們在場、也不要填進 present_chars。`
    : `【同行中】${party.map(desc).join('、')}：正跟在玩家身邊，本回合一定在場（用這個 ID 填進 present_chars），依個性說話行動；不要放進 guest_chars。`);
  if (called.length) lines.push(`【玩家提到的自創角色（目前不在身邊）】${called.map(descOwn).join('、')}：玩家去找或叫來時登場，用這個 ID 填進 present_chars（不要放進 guest_chars）。`);
  return lines.join('\n');
}

// 前端存檔、刪除、切換同行共用：只接受沙盒那一列
function updateSandboxMeta_(playerName, fn) {
  const cleanName = validatePlayerName_(playerName);
  if (!isSandboxKey_(cleanName)) throw new Error('自創角色只能在自由沙盒使用！');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const saveSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const meta = safeJsonParse_(row[31], {});
    meta.sandboxChars = Array.isArray(meta.sandboxChars) ? meta.sandboxChars : [];
    fn(meta);
    meta.sandboxParty = sandboxPartyOf_(meta);
    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

function saveSandboxCharacter(playerName, raw) {
  return updateSandboxMeta_(playerName, meta => {
    const list = meta.sandboxChars;
    const existing = raw && list.findIndex(c => c && c.id === raw.id);
    if (existing >= 0) {
      list[existing] = sanitizeSandboxChar_(raw, list[existing].id);
      return;
    }
    if (list.length >= SANDBOX_CHAR_MAX_) throw new Error(`自創角色最多 ${SANDBOX_CHAR_MAX_} 位，請先刪掉一位。`);
    let n = 1;
    while (list.some(c => c && c.id === 'sbc_' + n)) n++;
    const ch = sanitizeSandboxChar_(raw, 'sbc_' + n);
    list.push(ch);
    // 新角色在同行有空位時直接加入同行
    const party = sandboxPartyOf_(meta);
    if (party.length < SANDBOX_PARTY_MAX_) meta.sandboxParty = party.concat([ch.id]);
  });
}

function deleteSandboxCharacter(playerName, id) {
  return updateSandboxMeta_(playerName, meta => {
    meta.sandboxChars = meta.sandboxChars.filter(c => c && c.id !== id);
  });
}

function setSandboxParty(playerName, ids) {
  return updateSandboxMeta_(playerName, meta => {
    const valid = sandboxPartyCandidates_(meta);
    const uniq = [];
    (Array.isArray(ids) ? ids : []).forEach(id => { if (valid.has(id) && uniq.indexOf(id) < 0) uniq.push(id); });
    if (uniq.length > SANDBOX_PARTY_MAX_) throw new Error(`同行最多 ${SANDBOX_PARTY_MAX_} 位。`);
    meta.sandboxParty = uniq;
  });
}

// 定裝預覽：照遊戲實際畫法（同一組外貌、服裝、負面標籤）
function previewSandboxCharacter(raw) {
  const ch = sanitizeSandboxChar_(raw, 'sbc_preview');
  const gTag = ch.gender === 'boy' ? '1boy' : '1girl';
  const core = normalizeCharCoreForNai_(customServantCore_(ch), ch.gender);
  const action = ensureExpression_('standing, looking at viewer, cowboy shot, relaxed pose', ch.expression || 'light smile');
  return generateNovelAIImageSafe_({
    prompt: `${gTag}, solo, simple background, soft lighting`,
    artStyle: 'official',
    characters: [{
      prompt: [core, formatCharacterOutfitPrompt_(ch.outfit), action].filter(Boolean).join(', '),
      uc: [ch.uc, 'holding weapon, multiple views'].filter(Boolean).join(', '),
      gender: ch.gender, x: 0.5, y: 0.5
    }],
    width: 832, height: 1216, steps: 28, scale: 5.0, cfgRescale: 0.25
  });
}

