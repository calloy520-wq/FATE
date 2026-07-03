// 戰鬥引擎測試工具：直接載入真正的 gas/Core_Settings.gs + gas/Engine_Fate.gs + gas/Seed_Codex.gs
// 到一個 vm sandbox 裡執行——不複製/改寫任何戰鬥算式，永遠吃到當下 repo 版本的真實引擎。
// 只 stub 掉這三個檔案在載入當下(非函式呼叫時)才會碰到的 GAS 專屬全域物件：
//   - Core_Settings.gs 頂端 API_KEY 常數是立即執行函式，會呼叫 PropertiesService。
//   - resolveFateBattle_ 會呼叫 mcCombatFx_(禮裝被動，定義在 Mystic_Code.gs)——這裡不载入整個
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

module.exports = { loadEngineContext };
