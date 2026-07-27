/**
 * 📔 Diary.gs — 第三軌「日記鑑賞」的全部後端。
 *
 * ⚠ 這一整個檔案是【可整檔刪除】的實驗品。玩家 2026-07「先搭建看看…先從主選單就先分割」——
 *   目的是回答「排程→命中→讀週記 這個迴圈好不好玩」，答案是否就把這檔＋Script_Diary.html
 *   刪掉、拿掉 Index.html 那道門、Router_Action 那幾行註冊，鑑賞與 solo 一行都不會動到。
 *   ★所以本檔【不修改】既有任何檔案的行為，只新增。要共用的東西一律用「讀」的，不去改它。
 *
 * 與鑑賞的關係：
 *   ・存檔完全分流——自己的分頁「日記眾生」＋自己的 game_id 前綴 d_＋自己的 pcId 前綴 DPC_。
 *     你在鑑賞養到 95 的櫻跟這裡的櫻是兩個人，互不污染（CLAUDE.md「資料必須分流不污染」）。
 *   ・共用的是【唯讀資產】：英靈殿種子（heroToKanshouRow_ 造列）、地點表、關係梯度、COL schema。
 *
 * 迴圈：排程一週 → 命中判定 → 生成週記 → 套用增量 → 下一週。
 *   時間單位是「週」不是「回合」——一個遊戲內的週，鑑賞要約 630 次 AI 呼叫，這裡是 1 次。
 */

// 一天切三格。刻意不沿用鑑賞的 5 段（清晨/午後/黃昏/夜/深夜）——排程表是 7×N 的格子，
//   N=3 手機一屏塞得下，N=5 就得橫向捲。這是 UI 決定資料，不是資料決定 UI。
const DIARY_SLOTS_ = ['上午', '下午', '晚上'];
const DIARY_DAYS_ = ['一', '二', '三', '四', '五', '六', '日'];

// 🗓️ 角色行程表（資料驅動·可查詢·不是骰子）。
//   ★這是整個模式的地基：排程玩法要求行程【可預測】，而鑑賞的 kanshouRollDailyLocation_ 是
//   Math.random() 在需要時才擲、不存、擲完就忘——你不可能對「你排完程之後才擲的骰子」做規劃。
//   格式：{ hero: 短名, week: [ 週一..週日 ][ 上午/下午/晚上 ] = 地點名 }
//   地點名沿用 KANSHOU_LOCATIONS_ 的字面（唯讀共用，不另立一套地圖）。
//   ⚠ 骨架期只放三位；驗證迴圈好不好玩不需要 25 位。要加就往這張表加一列。
const DIARY_SCHEDULE_ = [
  {
    hero: '櫻',
    week: [
      ['商店街', '咖啡廳', '遠坂邸'], ['書店二樓', '咖啡廳', '遠坂邸'], ['商店街', '社區公園', '遠坂邸'],
      ['書店二樓', '咖啡廳', '遠坂邸'], ['商店街', '河邊小徑', '遠坂邸'], ['社區公園', '商店街', '咖啡廳'],
      ['古老神社', '河邊小徑', '遠坂邸']
    ]
  },
  {
    hero: '凜',
    week: [
      ['咖啡廳', '書店二樓', '遠坂邸'], ['商店街', '書店二樓', '遠坂邸'], ['咖啡廳', '屋頂花園', '遠坂邸'],
      ['商店街', '書店二樓', '遠坂邸'], ['咖啡廳', '屋頂花園', '遠坂邸'], ['商店街', '咖啡廳', '屋頂花園'],
      ['遠坂邸', '書店二樓', '遠坂邸']
    ]
  },
  {
    hero: '斯卡哈',
    week: [
      ['老道場', '山間小徑', '老道場'], ['老道場', '河邊小徑', '老道場'], ['山間小徑', '老道場', '隱藏溫泉'],
      ['老道場', '山間小徑', '老道場'], ['老道場', '河邊小徑', '隱藏溫泉'], ['山間小徑', '社區公園', '老道場'],
      ['隱藏溫泉', '老道場', '老道場']
    ]
  }
];
// 種子英靈 id ↔ 行程表短名（建檔時要照這張表把人放進世界）。
const DIARY_ROSTER_ = [
  { id: '間桐櫻黑化-Master', name: '櫻' },
  { id: '遠坂凜-Master', name: '凜' },
  { id: '斯卡哈-Lancer', name: '斯卡哈' }
];

// 帳號歸屬。鑑賞那邊是手拼 "【帳號】"+name 的裸字串(且真正的驗證走帳號表)，本檔不去動它，
//   自己用同一支工廠造一個——好處是 set 會自動清掉 ｜|【】 這些會弄壞 MEMORY 格式的字元。
var DIARY_ACCT_TAG_ = makeTextTag_('日記帳號');
var DIARY_WEEK_TAG_ = makeIntTag_('週次', 1);      // 玩家列：現在是第幾週
var DIARY_SUMMARY_TAG_ = makeTextTag_('前情');     // 玩家列：滾動壓縮的記憶摘要

// 📔 自己的分頁。比照 getKanshouPcSheet_ 造表(同一份 COL.PC schema，故 heroToKanshouRow_ 造的列
//   直接能用)，但物理上分開——整個模式要刪掉時，刪這張分頁就乾淨了。
function getDiaryPcSheet_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("日記眾生");
  if (!sh) {
    sh = ss.insertSheet("日記眾生");
    var main = ss.getSheetByName("眾生");
    if (main && main.getLastColumn() > 0) {
      sh.getRange(1, 1, 1, main.getLastColumn()).setValues(main.getRange(1, 1, 1, main.getLastColumn()).getValues());
    } else {
      var hdr = Array(Object.keys(COL.PC).length).fill(""); hdr[0] = "ID";
      sh.appendRow(hdr);
    }
  }
  return sh;
}

// 🔒 本軌自己的歸屬驗證。dispatcher 的 verifyPcOwnership_ 認不得 DPC_（它只查帳號表的
//   solo/鑑賞兩欄），故那邊豁免、驗證責任落在這裡——不是少驗，是換個地方驗。
//   回傳玩家列索引，驗不過回 -1。
function diaryVerify_(data, pcId, acctName) {
  var i = diaryPcIdx_(data, pcId);
  if (i < 0) return -1;
  var acct = String(acctName || "").trim();
  if (!acct || DIARY_ACCT_TAG_.get(data[i][COL.PC.MEMORY]) !== acct) return -1;
  return i;
}
function diaryPcIdx_(data, pcId) {
  for (var i = 1; i < data.length; i++) if (String(data[i][COL.PC.ID]) === String(pcId)) return i;
  return -1;
}
// 某角色在第 d 天(0=週一) 第 s 格的所在地。查不到回空字串——沒有行程＝那格不在任何地方，不會命中。
function diaryWhere_(heroName, d, s) {
  var row = DIARY_SCHEDULE_.find(function (x) { return x.hero === heroName; });
  if (!row || !row.week[d]) return "";
  return String(row.week[d][s] || "");
}

/**
 * 📔 進入日記模式（建檔或接續）。刻意【不共用】鑑賞的帳號連結——各自一條，兩邊存檔互不相干。
 */
function actionEnterDiary(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "未登入帳號。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getDiaryPcSheet_(ss);
  var data = sh.getDataRange().getValues();

  // 這個帳號在本模式已經有 avatar？→ 接續。判準只看「本表 ＋ 帳號標記」，不碰帳號表，
  //   免得跟鑑賞的 linkAccountToKanshouPc_ 互相干擾（本檔不改既有行為）。
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][COL.PC.ID] || "").indexOf("DPC_") !== 0) continue;
    if (DIARY_ACCT_TAG_.get(data[r][COL.PC.MEMORY]) !== acctName) continue;
    return JSON.stringify({
      success: true, pcId: String(data[r][COL.PC.ID]), pcName: String(data[r][COL.PC.NAME]),
      pcSex: String(data[r][COL.PC.SEX] || "男"),
      week: DIARY_WEEK_TAG_.get(data[r][COL.PC.MEMORY]) || 1
    });
  }

  // 首次進場：前端還沒問過名字 → 回 needSetup
  var pcName = String(userData.pcName || "").trim();
  if (!pcName) return JSON.stringify({ success: true, needSetup: true, defaultName: acctName });

  var gameId = "d_" + new Date().getTime();
  var newId = "DPC_" + new Date().getTime();
  var n = Object.keys(COL.PC).length;
  var row = Array(n).fill("");
  row[COL.PC.ID] = newId;
  row[COL.PC.NAME] = pcName;
  row[COL.PC.SEX] = String(userData.pcSex || "男");
  row[COL.PC.FACTION] = "御主";
  row[COL.PC.GAME_ID] = gameId;
  row[COL.PC.LOC] = "我的房間";
  row[COL.PC.DAY] = 1;
  row[COL.PC.HOUR] = 8;
  row[COL.PC.TRAIT] = "普通身影、沉穩、自稱我、不擅言辭";
  row[COL.PC.PREF] = "沉著表象、堅定內裡、安靜、喧鬧";
  row[COL.PC.BACK] = "剛搬來冬木市";
  row[COL.PC.MEMORY] = DIARY_ACCT_TAG_.set("", acctName);
  row[COL.PC.MEMORY] = DIARY_WEEK_TAG_.set(row[COL.PC.MEMORY], 1);
  sh.appendRow(row);

  // 把名冊放進世界。共用鑑賞的造列函式（唯讀共用·不改它），只是塞進本模式的表與 game_id。
  var heroes = getHeroCodexCached().slice(1);
  DIARY_ROSTER_.forEach(function (m) {
    var hero = heroes.find(function (h) { return String(h[COL.HERO.ID]) === m.id; });
    if (!hero) return;
    var hrow = heroToKanshouRow_(hero, gameId, diaryWhere_(m.name, 0, 0) || "商店街", 1);
    hrow[COL.PC.NAME] = m.name;   // 行程表用短名比對，這裡對齊
    sh.appendRow(hrow);
  });
  return JSON.stringify({ success: true, pcId: newId, pcName: pcName, pcSex: row[COL.PC.SEX], week: 1 });
}

/**
 * 📔 本週角色行程表（給前端排程時參考／之後要做「未知行程」就從這裡收斂）。
 */
function actionDiarySchedule(userData, pcId, sheets) {
  return JSON.stringify({
    success: true, slots: DIARY_SLOTS_, days: DIARY_DAYS_,
    // 地點清單沿用鑑賞地圖(唯讀)，排除玩家私室以外的全部可去處。
    locations: KANSHOU_LOCATIONS_.filter(function (l) { return l.region !== 'visit'; })
      .map(function (l) { return { name: l.name, desc: l.desc }; }),
    schedule: DIARY_SCHEDULE_
  });
}

/**
 * 📔 送出一週排程 → 命中判定 → 生成週記 → 套用增量。這是整個模式的核心迴圈。
 * userData.plan = [ [週一上午,下午,晚上], …共7天 ]，每格是地點名（空字串＝那格待在家）。
 */
function actionDiaryWeek(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getDiaryPcSheet_(ss);
  var data = sh.getDataRange().getValues();
  var me = diaryVerify_(data, pcId, userData.acctName);
  if (me < 0) return JSON.stringify({ success: false, message: "查無御主。" });
  var gameId = String(data[me][COL.PC.GAME_ID] || "");
  var week = DIARY_WEEK_TAG_.get(data[me][COL.PC.MEMORY]) || 1;

  var plan = userData.plan;
  if (!Array.isArray(plan) || plan.length !== DIARY_DAYS_.length) {
    return JSON.stringify({ success: false, message: "排程表格式不對（要 7 天）。" });
  }

  // ① 命中判定：玩家該格地點 === 角色該格行程 → 一筆相遇。純比對，不擲骰、不問 AI。
  var hits = [];
  for (var d = 0; d < DIARY_DAYS_.length; d++) {
    for (var s = 0; s < DIARY_SLOTS_.length; s++) {
      var at = String((plan[d] || [])[s] || "").trim();
      if (!at) continue;
      var who = DIARY_SCHEDULE_.filter(function (x) { return diaryWhere_(x.hero, d, s) === at; })
        .map(function (x) { return x.hero; });
      if (who.length) hits.push({ d: d, s: s, loc: at, who: who });
    }
  }

  // ② 撈在世名冊(本模式·本 game_id)的狀態快照，餵給生成階段
  var cast = [];
  for (var i = 1; i < data.length; i++) {
    if (i === me || String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.FACTION]) !== "從者") continue;
    cast.push({
      idx: i, name: String(data[i][COL.PC.NAME]), bond: parseInt(data[i][COL.PC.BOND]) || 0,
      tier: String(data[i][COL.PC.REL_TAG] || ""), pref: String(data[i][COL.PC.PREF] || ""),
      trait: String(data[i][COL.PC.TRAIT] || ""), moe: String(data[i][COL.PC.INTENT] || ""),
      back: String(data[i][COL.PC.BACK] || "")
    });
  }

  var out = diaryGenerate_(data[me], week, hits, cast, DIARY_SUMMARY_TAG_.get(data[me][COL.PC.MEMORY]));
  if (!out) return JSON.stringify({ success: false, message: "週記生成失敗，請再試一次。" });

  // ③ 套用結構化增量。★好感只由 GAS 依「命中次數」給，AI 回的 rel_changes 只當微調並夾住
  //   ——沿用整個專案的鐵則：GAS 掌數值、AI 只說書。
  var applied = [];
  cast.forEach(function (c) {
    var n = hits.filter(function (h) { return h.who.indexOf(c.name) !== -1; }).length;
    var delta = n * DIARY_BOND_PER_HIT_;
    var ai = (out.rel_changes || []).find(function (x) { return String(x.target).trim() === c.name; });
    if (ai) delta += Math.max(-DIARY_AI_ADJUST_CAP_, Math.min(DIARY_AI_ADJUST_CAP_, parseInt(ai.fav_change) || 0));
    if (!delta) return;
    data[c.idx][COL.PC.BOND] = Math.max(0, Math.min(100, c.bond + delta));
    kanshouSyncRelTier_(data, c.idx);
    sh.getRange(c.idx + 1, COL.PC.BOND + 1).setValue(data[c.idx][COL.PC.BOND]);
    sh.getRange(c.idx + 1, COL.PC.REL_TAG + 1).setValue(data[c.idx][COL.PC.REL_TAG]);
    applied.push({ name: c.name, hits: n, from: c.bond, to: data[c.idx][COL.PC.BOND] });
  });

  // ④ 滾動壓縮記憶＋週次前進
  var mem = data[me][COL.PC.MEMORY];
  if (out.summary) mem = DIARY_SUMMARY_TAG_.set(mem, String(out.summary).slice(0, DIARY_SUMMARY_MAX_));
  mem = DIARY_WEEK_TAG_.set(mem, week + 1);
  sh.getRange(me + 1, COL.PC.MEMORY + 1).setValue(mem);

  return JSON.stringify({
    success: true, week: week, nextWeek: week + 1,
    diary: out.diary || "", hits: hits, applied: applied
  });
}

const DIARY_BOND_PER_HIT_ = 2;    // 每命中一格給的好感（GAS 給，不問 AI）
const DIARY_AI_ADJUST_CAP_ = 3;   // AI 微調的上下限——它只能在 GAS 給的基礎上小幅修正
const DIARY_SUMMARY_MAX_ = 300;   // 記憶摘要長度上限（滾動壓縮，控 token）

/**
 * 📔 週記生成。一週一次 AI 呼叫。
 *   給 AI 的東西照這個專案一貫的原則：【只給事實，不給台詞】——人設是行為傾向、相遇是時間地點，
 *   怎麼寫由她們自己長出來。
 */
function diaryGenerate_(meRow, week, hits, cast, prevSummary) {
  var meName = String(meRow[COL.PC.NAME]);
  var hitLines = hits.map(function (h) {
    return '週' + DIARY_DAYS_[h.d] + DIARY_SLOTS_[h.s] + '在「' + h.loc + '」遇到 ' + h.who.join('、')
      + (h.who.length > 1 ? '（兩人以上同時在場）' : '');
  });
  var castLines = cast.map(function (c) {
    return '『' + c.name + '』關係:' + c.tier + '(好感' + c.bond + ') | 性格:' + c.pref
      + ' | 特徵:' + c.trait + (c.moe ? ' | 萌點(僅供內化):' + c.moe : '') + (c.back ? ' | 經歷:' + c.back : '');
  });
  var prompt = '【體裁】：這是玩家『' + meName + '』的第 ' + week + ' 週週記，由他自己執筆、事後回望這一週。\n'
    + '【人物】：\n' + castLines.join('\n') + '\n'
    + (prevSummary ? '\n【前情提要】：' + prevSummary + '\n' : '')
    + '\n【這一週實際發生的相遇】（這是既成事實的完整清單，不可增減人事時地）：\n'
    + (hitLines.length ? hitLines.join('\n') : '（這一週一個人也沒遇到）') + '\n'
    + '\n★【怎麼寫】：以「我」的第一人稱回顧，把上面每一筆相遇寫成連貫的一週，不是條列流水帳。'
    + '沒列在清單上的人這週【沒有出現過】，不可讓她們登場或開口。'
    + '\n★【演出而非說明】：不直述任何人的個性/萌點字面，讓它從她做了什麼、說了什麼裡自己浮出來。'
    + '\n★【篇幅】：約 ' + (hits.length ? Math.min(1200, 300 + hits.length * 90) : 250) + ' 字。';
  var sys = '你是《命運停駐之夜》日記軌的敘事引擎。只輸出 JSON，欄位：'
    + 'diary(這一週的週記全文)、summary(把這週壓縮成 120 字內的前情提要，供下週使用)、'
    + 'rel_changes(陣列，每項 {target:角色名, fav_change:-3~3 的整數}，只做小幅情緒修正，'
    + '主要的好感變動由系統依相遇次數計算，不需要你負責)。';
  try {
    var raw = callGeminiAPI(prompt, sys, { temperature: 0.9 });
    var j = JSON.parse(String(raw).replace(/^```(?:json)?|```$/g, '').trim());
    return (j && typeof j === 'object') ? j : null;
  } catch (e) { return null; }
}
