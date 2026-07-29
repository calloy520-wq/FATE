// 戰鬥引擎測試工具：直接載入真正的 gas/Core_Settings.gs + gas/Engine_Fate.gs + gas/Seed_Codex.gs
// 到一個 vm sandbox 裡執行——不複製/改寫任何戰鬥算式，永遠吃到當下 repo 版本的真實引擎。
// 只 stub 掉這三個檔案在載入當下(非函式呼叫時)才會碰到的 GAS 專屬全域物件：
//   - Core_Settings.gs 頂端 API_KEY 常數是立即執行函式，會呼叫 PropertiesService。
//   - resolveFateBattle_ 會呼叫 mcCombatFx_(禮裝被動，定義在 Mystic_Code.gs)——這裡不載入整個
//     Mystic_Code.gs(它有更多 GAS 依賴)，直接 stub 回傳 null(=沒裝禮裝)，因為本工具只測從者本體技能。
//   - enemyRetreatLoc_/aliveEnemyServants_ 等函式用到 SpreadsheetApp，但本工具從不呼叫它們，
//     stub 一個空殼避免載入期 ReferenceError 即可(函式體要等真的呼叫才會執行)。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAS_DIR = path.join(__dirname, '..', '..', 'gas');

function loadEngineContext() {
  const sandbox = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Utilities: { sleep: () => {} },
    mcCombatFx_: () => null, // 沒裝禮裝(本工具不測禮裝加成)
  };
  vm.createContext(sandbox);

  const files = ['Core_Settings.gs', 'Engine_Fate.gs', 'Seed_Codex.gs'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(GAS_DIR, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox;
}

// 種子物件 → 戰鬥單位。單一真實來源，供 duel.js/roundrobin.js 共用——
// ⚠ skills 務必是 classSkills.concat(skills)，逐行對照 Router_Creation.gs:336
// (`row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits })`)：
// 真正遊戲裡職階技能(對魔力/騎乘/氣息遮斷/狂化...)跟固有技能是合併進同一個 skills 陣列給 hasFx_ 讀，
// 兩邊分開存只是種子資料的可讀性分類，不是引擎認知的兩個不同陣列——只複製 seed.skills 會漏掉每個
// 從者的職階技能(遍及全種子庫，非單一角色個案)。
function buildCombatant(ctx, seed, opts) {
  opts = opts || {};
  const c = {
    name: seed.realName, cls: seed.cls,
    six: Object.assign({}, seed.six),
    skills: (seed.classSkills || []).concat(seed.skills || []).map(s => Object.assign({}, s)),
    traits: (seed.traits || []).map(t => Object.assign({}, t)),
    np: seed.np,
    hpMax: 150 + Math.max(8, ctx.rankVal(seed.six['耐久'])) * 6, // svHp 公式(Router_Creation.gs:321)
    mp: 0, mpMax: 0,
    output: opts.output || 60, // servantOutput_ 預設「巡航」檔
    runeMode: 'def',
    npChoice: opts.np ? ctx.bestNpChoice_(seed.realName, seed.cls) : 0,
    horrorUp: false,
  };
  c.hp = c.hpMax;
  if (opts.overrides) Object.assign(c, opts.overrides);
  return c;
}

module.exports = { loadEngineContext, buildCombatant };
