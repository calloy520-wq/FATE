/**
 * Config.gs — 全域設定、分頁名稱、欄位、平衡常數
 * 命運停駐之夜 GAS 後端
 *
 * 控制整個遊戲平衡只需調 TUNING 這一塊。
 */

// 分頁名稱（靜態定檔 + 動態存檔）
const SHEETS = {
  // 靜態定檔
  HEROES: '英靈殿',     // ServantTemplates
  MASTERS:'御主殿',     // MasterTemplates
  MAP:    '地圖',       // Locations
  ITEMS:  '道具圖鑑',   // ItemTemplates
  RULES:  '世界規則',   // WorldRules
  WARS:   '戰爭範本',   // Wars
  // 動態存檔
  ACCOUNTS: '帳號',     // Accounts (ms_id)
  BATTLE:   '戰場',     // Battlefield (御主+從者合併，一列一參戰者)
  MEMORY:   '記憶',     // Memory (EAV)
  EVENTS:   '事件',     // EventLog (多人相容)
  CLOCK:    '時鐘',     // GameClock
  HISTORY:  '歷史',     // 戰績紀錄（跨場保留）
  GALLERY:  '鑑賞',     // 鑑賞室：玩家收藏/獲勝留存的英靈（ms_id 隔離，跨場保留）
};

// 各分頁標題列
const HEADERS = {
  [SHEETS.HEROES]: ['servant_id','cls','realName','wars','筋力','耐久','敏捷','魔力','幸運','寶具',
                    'classSkills','skills','traits','np','persona','source','align'],
  [SHEETS.MASTERS]:['master_id','name','war','magic','circuits','melee','magic_rank','home','wish','persona','source'],
  [SHEETS.MAP]:    ['id','name','x','y','danger','leyline','adj','desc'],
  [SHEETS.ITEMS]:  ['item_id','name','type','fx','value','desc'],
  [SHEETS.RULES]:  ['key','text'],
  [SHEETS.WARS]:   ['war_id','name','participants','partial','roster'],

  [SHEETS.ACCOUNTS]: ['ms_id','name','created','current_game','inventory','settings'],
  [SHEETS.BATTLE]:   ['game_id','slot','is_player','master_name','magic','circuits','master_hp','master_hp_max',
                      'master_mp','master_mp_max','seals','melee','magic_rank','location','servant_id',
                      'sv_hp','sv_hp_max','sv_mp','sv_mp_max','upkeep','bond','true_name_known','status',
                      'alive','base_loc','barrier','barrier_max','base_tier','servant_loc','separated','discovered','sv_condition','buff','solo_hours'],
  [SHEETS.MEMORY]:   ['event_id','game_id','turn','entity','fact_type','content','importance','write_ts'],
  [SHEETS.EVENTS]:   ['event_id','write_ts','game_id','day_count','time_hour','location_id','event_type',
                      'actor_id','target_id','log_text','is_global','importance'],
  [SHEETS.CLOCK]:    ['game_id','day','hour','ap','ap_max','mana_countdown','mana_locked'],
  [SHEETS.HISTORY]:  ['ts','ms_id','name','result','war','servant_cls','day','summary'],
  [SHEETS.GALLERY]:  ['ms_id','entry_id','servant_id','cls','realName','six','skills','classSkills',
                      'traits','np','persona','align','bond','condition','active','source','log','created',
                      'won_count','won_day','won_note'],
};

// 靜態分頁（重建 setup 時會重新種子）；動態分頁只建表不動資料
const STATIC_SHEETS = [SHEETS.HEROES, SHEETS.MASTERS, SHEETS.MAP, SHEETS.ITEMS, SHEETS.RULES, SHEETS.WARS];

// ===== 平衡常數（調這裡＝整個經濟/戰鬥平移）=====
const TUNING = {
  // 數值推導
  HP_K: 4, HP_BASE: 90,          // HP上限 = 耐久*HP_K + HP_BASE（A耐久≈290、C≈210，戰鬥更耐打）
  MP_K: 2, MP_BASE: 40,          // 從者靈基魔力上限 = 魔力*MP_K + MP_BASE
  MASTER_MP_K: 2,                // 御主迴路魔力上限 = 迴路*MASTER_MP_K（供給/加固用，別灌太大才有資源管理）
  UPKEEP_DIV: 10,                // 維持費 = (筋耐敏魔)/UPKEEP_DIV + 寶具/UPKEEP_DIV
  MAD_MULT: 2.0,                 // 狂化維持費倍率（力量已烤進數值，成本即平衡點：養不起就反噬）
  MASTER_REGEN_K: 0.6,           // 御主迴路魔力每小時回復 = 迴路 * MASTER_REGEN_K
  SV_NATURAL_CAP: 0.8,           // 從者靈基自然回復上限（80%）；更高需主動供給/補魔/獵魔
  SV_TOPUP: 6,                   // 御主迴路每小時回充從者靈基的速率（餘裕時）
  LEYLINE: { '高':10, '中':5, '低':2 },
  WORKSHOP: 8,                   // Caster 主場工房加成（有「陣地作成」全額，否則半額）
  CRAFT_SUPPLY: 4,               // 道具作成：自製魔力道具的每小時免費供給
  SEP_PENALTY: 0.5,              // 分離供給衰減
  SEP_SOLO: 0.85,               // 單獨行動減免後
  // 戰鬥
  HP_REGEN_K: 0.1,               // 每小時HP緩回 = 耐久*HP_REGEN_K
  COMBAT_MP: 0.12,               // 普通交戰耗魔比例
  NP_MP: 0.35,                   // 寶具解放額外耗魔比例
  FLEE_HP: 0.5,                  // 降到此 HP 比例即觸發撤退（一般交戰不纏鬥至死；令咒決死除外）
  // 時間
  AP_PER_DAY: 12, HOURS_PER_AP: 2,
  // 單獨行動：御主消亡後，從者僅憑此技維持現界的「現界時數」（依階級，每 '+' ×1.25）。無此技→御主一死即消滅。
  SOLO_HOURS: { E:6, D:12, C:24, B:48, A:96, EX:168 },
  // 補魔
  MANA_TURNS: 10, MANA_AP_COST: 2, MANA_BOND: 8,
  // 獵魔（吸食補魔）／擊殺回魔／情境好感
  HUNT_MP_WILLING: 0.5,   // 樂意(惡/狂化)獵食回魔比例
  HUNT_MP_RELUCT:  0.35,  // 不情願(中立)獵食回魔比例
  HUNT_BOND_RELUCT: -6,   // 中立被迫獵食的好感損失
  HUNT_BOND_REFUSE: -3,   // 善向從者連被提議獵食都反感
  HUNT_BOND_EVIL:   2,    // 惡向從者獵食反而愉悅
  KILL_MP: 0.25,          // 擊破敵從者的魔力湧入比例
  GOD_HAND_LIVES: 12,     // 十二試煉（God Hand）：總命數，須擊倒這麼多次才真正死亡（可調低）
};

const RANK_BASE = { 'E':10,'D':20,'C':30,'B':40,'A':50,'EX':60 };

// 階級字串 → 數值（含 + 與 EX）
function rankVal(rank){
  if(!rank || rank==='-' || rank==='?') return 15;
  var plus = (String(rank).match(/\+/g)||[]).length * 5;
  return (RANK_BASE[String(rank).replace(/\+/g,'')] || 15) + plus;
}

// OpenRouter（API key 存 Script Properties，不進程式碼）
const OPENROUTER = {
  url: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'google/gemini-3.1-flash-lite',
};
function getApiKey(){
  return PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY') || '';
}
