// 本機／CI 測試：在 Node 中載入 Code.js，測試不需要 Google 服務的純邏輯函式
// 執行：node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// GAS 會把所有 .js 檔放在同一個全域空間，這裡照同樣順序載入
const src = ['GameData.js', 'Lore.js', 'Code.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
const ctx = { console, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } };
vm.createContext(ctx);
vm.runInContext(src + `
;this.T = { updateRyuudouRoute_, resolveFactionKey_, matchFuyukiLocation_, applyInventoryChanges_,
  computeDynamicLocationInfo_, FUYUKI_LOCATIONS_, isCapturedOrDefeatedStatusText_, syncCapturedServantFaction_,
  areAllRivalFactionsResolved_, updateKeyEvents_, normalizeCharCoreForNai_, stripCountTags_, excerptForDirector_,
  formatCharacterOutfitPrompt_, isNudeOutfitTags_, applyRumorUpdates_, formatNovelStoryText_, FATE_GM_SYSTEM_PROMPT_, stripBadInteractionPrefix_, buildCountTags_, isOutOfPovView_, getContactChannel_, removeCharacterMentions_, pickNaiSize_, outfitSimilarity_, autoAdaptSmartOutfit_, parseJsonLoose_, advanceTimePeriod_, buildNaiPayloadFromScene_, gateFactionElimination_, describeWarStateForPrompt_, publicIntelText_, initFactionIntel_, updateFactionIntel_ };`, ctx);
const T = ctx.T;

let ok = 0, bad = 0;
function eq(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (pass) ok++; else bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const Z = '臟硯組 (真Assassin陣營)';
const R = '柳洞寺組 (Caster/Assassin陣營)';
const M = '間桐組 (Rider陣營)';
const base = () => ({
  '衛宮組 (Saber陣營)': '存活 (中立警戒)', '遠坂組 (Archer陣營)': '存活', '教會組 (Lancer陣營)': '存活',
  [M]: '存活 (隱蔽觀察)', [R]: '存活 (敵對防備)', '愛因茲貝倫組 (Berserker陣營)': '存活'
});
const route = (meta, f, out, cap, present) => T.updateRyuudouRoute_(meta, f, out || [], cap || '', new Set(present || []));

// ---- 真Assassin 路線 ----
let m = {}, r, f;
r = route(m, base());
eq('沒人退場不觸發', Z in r.factions, false);

m = {}; r = route(m, base(), ['caster']);
eq('美狄亞退場 → 觸發臟硯組', Z in r.factions, true);
eq('旗標', m.routeFlags, { medeaOut: true, kojirouOut: true, trueAssassin: 'ACTIVE' });
eq('兩騎皆退場 → 柳洞寺組結束', T.isCapturedOrDefeatedStatusText_(r.factions[R]), true);
eq('有異變風聲', r.report.length > 0, true);

m = {}; r = route(m, base(), ['assassin']);
eq('只有小次郎退場 → 美狄亞仍在', T.isCapturedOrDefeatedStatusText_(r.factions[R]), false);
eq('只有小次郎退場 → 也觸發', Z in r.factions, true);

m = {}; f = base(); f[M] = '已淘汰'; r = route(m, f, ['caster']);
eq('間桐已覆滅 → 不觸發', Z in r.factions, false);

m = {}; f = base(); f[R] = '存活・美狄亞已被擊敗，小次郎仍鎮守山門'; r = route(m, f);
eq('從劇情文字判斷美狄亞退場', m.routeFlags.medeaOut && (Z in r.factions), true);

m = {}; f = base(); f[R] = '已淘汰 (後台廝殺)'; r = route(m, f);
eq('後台淘汰柳洞寺 → 觸發', Z in r.factions, true);
const m2 = { routeFlags: m.routeFlags };
eq('不會重複觸發', route(m2, r.factions).report, '');
route(m2, r.factions, ['hassan']);
eq('哈桑退場 → DEFEATED', m2.routeFlags.trueAssassin, 'DEFEATED');

m = {}; r = route(m, base(), [], 'caster');
eq('收服美狄亞（間桐仍在）→ 哈桑取代小次郎', Z in r.factions, true);
eq('收服美狄亞（間桐仍在）→ 柳洞寺組結束', T.isCapturedOrDefeatedStatusText_(r.factions[R]), true);
m = {}; f = base(); f[M] = '已淘汰'; r = route(m, f, [], 'caster');
eq('收服美狄亞（間桐已滅）→ 小次郎仍守山門', T.isCapturedOrDefeatedStatusText_(r.factions[R]), false);
eq('一般收服邏輯略過柳洞寺兩騎', T.syncCapturedServantFaction_(base(), 'assassin', '')[R], base()[R]);

f = base(); Object.keys(f).forEach(k => { f[k] = '已淘汰'; }); f[Z] = '存活 (潛伏暗殺)';
eq('臟硯組未解決 → 不能全破', T.areAllRivalFactionsResolved_(f), false);
f = base(); f[Z] = '存活 (潛伏暗殺)';
eq('柳洞寺危險度顯示哈桑', T.computeDynamicLocationInfo_('柳洞寺', T.FUYUKI_LOCATIONS_['柳洞寺'], f, '', 'WAR', {}).danger.includes('咒腕'), true);

// ---- 陣營名稱對應 ----
f = base(); f[Z] = 'x';
eq('Saber陣營 → 衛宮組', T.resolveFactionKey_('Saber陣營', f), '衛宮組 (Saber陣營)');
eq('遠坂凜 → 遠坂組', T.resolveFactionKey_('遠坂凜', f), '遠坂組 (Archer陣營)');
eq('真Assassin → 臟硯組', T.resolveFactionKey_('真Assassin', f), Z);
eq('小次郎 → 柳洞寺組', T.resolveFactionKey_('小次郎', f), R);
eq('完整名稱', T.resolveFactionKey_(R, f), R);
eq('對不上 → 丟棄', T.resolveFactionKey_('路人甲', f), '');

// ---- 地點 ----
eq('未知地名 → null（維持原地）', T.matchFuyukiLocation_('冬木中學屋頂'), null);
eq('別名', T.matchFuyukiLocation_('前往柳洞寺').key, '柳洞寺');
eq('完整名稱', T.matchFuyukiLocation_('冬木新都・高樓商業區').key, '新都商業區');

// ---- 道具 ----
const ir = T.applyInventoryChanges_([{ id: 'mana_gem_s', name: '魔力結晶(小)', qty: 2, tier: 1, type: 'consumable' }], ['mana_gem_s', 'nope'], [], false);
eq('只回報實際扣掉的道具', ir.consumedIds, ['mana_gem_s']);
eq('數量 -1', ir.inventory[0].qty, 1);

// ---- 重要事件 ----
let ev = T.updateKeyEvents_([], ['與遠坂凜約定聯手討伐Caster'], [], '風音');
eq('新增事件', ev, ['與遠坂凜約定聯手討伐Caster']);
ev = T.updateKeyEvents_(ev, ['與遠坂凜約定聯手討伐Caster'], [], '風音');
eq('去重', ev.length, 1);
ev = T.updateKeyEvents_(ev, [], ['與遠坂凜約定聯手討伐Caster'], '風音');
eq('了結後移除', ev, []);
ev = T.updateKeyEvents_(Array.from({ length: 15 }, (_, i) => `事件${i}號紀錄`), ['新事件紀錄'], [], 'x');
eq('上限 15 條，捨棄最舊', [ev.length, ev[0], ev[14]], [15, '事件1號紀錄', '新事件紀錄']);

eq('重要事件：Gemini 回傳物件也能讀', T.updateKeyEvents_([], [{ event: '與遠坂凜結盟對抗Caster' }], [], 'x'), ['與遠坂凜結盟對抗Caster']);
eq('重要事件：清掉舊的 [object Object]', T.updateKeyEvents_(['[object Object]', '正常事件'], [], [], 'x'), ['正常事件']);

// ---- NovelAI 提示詞 ----
eq('角色欄去掉人數標籤', T.normalizeCharCoreForNai_('1girl, solo, black hair, golden eyes', 'girl'), 'girl, black hair, golden eyes');
eq('男性角色', T.normalizeCharCoreForNai_('1boy, short hair', 'boy'), 'boy, short hair');
eq('場景去掉人數標籤', T.stripCountTags_('2girls, solo, night, bridge'), 'night, bridge');
eq('裸體服裝格式', T.formatCharacterOutfitPrompt_('nude, completely nude, no clothes'), '1.3::nude, completely nude, bare skin::');
eq('一般服裝格式', T.formatCharacterOutfitPrompt_('red coat'), '1.15::red coat::');
const longStory = '開頭'.repeat(200) + '結尾畫面';
eq('導演摘錄保留結尾', T.excerptForDirector_(longStory).endsWith('結尾畫面'), true);
eq('導演摘錄去掉時段推進', T.excerptForDirector_('劇情。\n\n【時段推進・大源回復】xx'), '劇情。');

// ---- 實測抓到的問題 ----
const nr = T.applyRumorUpdates_([], [{ id: 'bridge_clash', status: '擴散中', effect: '市民流傳大橋出現不明騷亂' }], {}, 3);
eq('AI 發起的新傳聞會被收錄', [nr.rumors.length, nr.rumors[0].channel, nr.rumors[0].status], [1, '市井傳聞', '擴散中']);
const nr2 = T.applyRumorUpdates_([], [{ id: 'x', status: '已被識破', text: '不存在的流言' }], {}, 3);
eq('未知 id 又是識破狀態 → 忽略', nr2.rumors.length, 0);
const told = T.formatNovelStoryText_('斯卡哈：「這座城市很吵。」\n\n她睜開雙眼。\n\n「大橋那邊有動靜。」', ['斯卡哈', '測試者'], '', '測試者');
eq('代名詞「她」後的台詞沿用上一位說話者', told.split('\n\n')[2], '斯卡哈：「大橋那邊有動靜。」');
eq('前後段各有不同角色時不亂標說話者', T.formatNovelStoryText_('斯卡哈站在身後。\n\n「大半夜的，是誰？」\n\n大門打開，遠坂凜一臉戒備。', ['斯卡哈', '遠坂凜'], '', 'x').split('\n\n')[1], '「大半夜的，是誰？」');
const lancerStory = '「真是警覺啊，陌生御主。」Lancer 舔了舔嘴唇，眼神掃過我身邊的斯卡哈時一滯。「等等，那個氣息……師匠？」\n\n感受著魔力流向手背，我對著身旁的斯卡哈發出絕對指令：「斯卡哈，以令咒命令妳——解放寶具！」\n\n斯卡哈微微一怔，隨即露出微笑。她那冷徹的聲音響徹夜空：「既然是御主的命令，那便如你所願。」';
const lancerLines = T.formatNovelStoryText_(lancerStory, ['斯卡哈', '測試者', 'Lancer', '庫夫林'], '', '測試者').split('\n\n').filter(x => x.includes('「'));
eq('實測台詞說話者：台詞後接主詞／主詞是我／她指回前句', lancerLines.map(x => x.split('：')[0]), ['Lancer', 'Lancer', '測試者', '斯卡哈']);
eq('句中引用「……」的 不拆段', T.formatNovelStoryText_('空氣中瀰漫著特有的「既然決定合作就別再耍花招」的警告意味。', ['遠坂凜'], '', 'x'), '空氣中瀰漫著特有的「既然決定合作就別再耍花招」的警告意味。');
eq('實測：綺禮的台詞（名字只寫「綺禮」）', T.formatNovelStoryText_('綺禮的手指如同鐵鉗般扣在測試者的頸側，眼神中只有愉悅感，「這就是妳的『邀請』嗎？測試者。」', ['斯卡哈', '測試者', '言峰綺禮'], '', '測試者').split('\n\n').pop(), '言峰綺禮：「這就是妳的『邀請』嗎？測試者。」');
eq('實測：簡訊「來自衛宮士郎」', T.formatNovelStoryText_('測試者的手機收到簡訊。是來自衛宮士郎的，內容是：「我在新都車站附近，希望能談談。」', ['測試者', '衛宮士郎'], '', '測試者').split('\n\n').pop(), '衛宮士郎：「我在新都車站附近，希望能談談。」');
eq('敘述中用「」強調名字不會被拆段', T.formatNovelStoryText_('那股屬於「庫・夫林」的魔力特徵很強烈。', [], '', 'x'), '那股屬於「庫・夫林」的魔力特徵很強烈。');
eq('對話後接敘述會拆段', T.formatNovelStoryText_('斯卡哈：「走吧。」她轉身離開。', ['斯卡哈'], '', 'x').split('\n\n').length, 2);
eq('互動語法：角色名# 前綴被去掉，source#/target#/mutual# 保留', T.stripBadInteractionPrefix_('rin#facing the player, source#hug, mutual#holding hands, standing'), 'facing the player, source#hug, mutual#holding hands, standing');
eq('第一人稱：只剩凜 → 1girl, solo, pov＋景深', T.buildCountTags_([{ gender: 'girl' }], true), ['1girl', 'solo', 'pov', 'first-person view', 'depth of field']);
eq('第一人稱：沒人在視野 → 風景', T.buildCountTags_([], true), ['no humans', 'scenery', 'pov', 'first-person view']);
eq('第三人稱：兩女一男', T.buildCountTags_([{ gender: 'girl' }, { gender: 'girl' }, { gender: 'boy' }], false), ['2girls', '1boy', 'multiple characters']);
eq('視野：寫了站在身後但標 true → 判為看不到', T.isOutOfPovView_({ action: 'standing behind viewer, arms crossed, in_view: true' }), true);
eq('視野：站在身後但看著你 → 仍看不到', T.isOutOfPovView_({ action: 'standing behind the viewer, arms crossed, looking at viewer' }), true);
eq('視野：從肩膀探頭 → 看得到', T.isOutOfPovView_({ action: 'leaning in from over your shoulder, whispering' }), false);
eq('視野：in_view 寫在文字裡為 false', T.isOutOfPovView_({ action: 'waiting outside, in_view: false' }), true);
eq('視野：一般在前方', T.isOutOfPovView_({ action: 'standing in the doorway directly in front of viewer', in_view: true }), false);
eq('場景描述移除視野外角色', T.removeCharacterMentions_("night, Rin Tohsaka at the gate, Scathach standing behind viewer's shoulder, moonlight", ['scathach'], []), 'night, Rin Tohsaka at the gate, moonlight');
eq('單人 → 直式', T.pickNaiSize_(1), { width: 832, height: 1216 });
eq('多人 → 橫式', T.pickNaiSize_(3), { width: 1216, height: 832 });
eq('風景 → 橫式', T.pickNaiSize_(0), { width: 1216, height: 832 });
eq('直式與橫式像素量相同且不超過 1024×1024', [832 * 1216 === 1216 * 832, 832 * 1216 <= 1024 * 1024], [true, true]);
eq('系統提示詞包含感知範圍限制（防上帝視角）', T.FATE_GM_SYSTEM_PROMPT_.includes('感知有極限'), true);

// ---- 預設第一人稱 ----
// （parseSaveRow_ 需要完整列資料，這裡只確認常數邏輯在模擬測試中驗證）

// ---- 其他 ----
eq('全裸後沒說穿衣 → 維持全裸', T.autoAdaptSmartOutfit_('player_master', 'nude, completely nude, no clothes', { defaultOutfit: 'dress' }, '去洗臉', '', false, '廢棄洋館'), 'nude, completely nude, no clothes');
eq('全裸後穿上衣服 → 還原預設', T.autoAdaptSmartOutfit_('player_master', 'nude, completely nude, no clothes', { defaultOutfit: 'dress' }, '穿上衣服', '', false, '廢棄洋館'), 'dress');
const sca = { defaultOutfit: 'purple bodysuit', casualOutfit: 'white sweater, black pantyhose' };
eq('便服：回到據點、沒開戰 → 換便服', T.autoAdaptSmartOutfit_('scathach', 'purple bodysuit', sca, '跟斯卡哈討論作戰', '', false, '廢棄洋館'), 'white sweater, black pantyhose');
eq('便服：在家討論「要不要出擊」仍換便服', T.autoAdaptSmartOutfit_('scathach', 'purple bodysuit', sca, '我們該主動出擊還是收集情報？', '', false, '廢棄洋館'), 'white sweater, black pantyhose');
eq('便服：出門 → 換回戰鬥裝', T.autoAdaptSmartOutfit_('scathach', 'white sweater, black pantyhose', sca, '前往新都', '', false, '新都商業區'), 'purple bodysuit');
eq('便服：在據點遭到突襲（開戰）→ 戰鬥裝', T.autoAdaptSmartOutfit_('scathach', 'white sweater, black pantyhose', sca, '迎戰', '', true, '廢棄洋館'), 'purple bodysuit');
eq('便服：劇情換過的特殊服裝不會被蓋掉', T.autoAdaptSmartOutfit_('scathach', 'yukata', sca, '休息', '', false, '廢棄洋館'), 'yukata');
eq('服裝相似度：導演改回戰鬥服可偵測', T.outfitSimilarity_('purple bodysuit, tight bodysuit, black veil, gold trim', 'purple bodysuit, tight bodysuit, black veil, gold trim, thighhighs') >= 0.5, true);
eq('服裝相似度：浴衣不算戰鬥服', T.outfitSimilarity_('yukata, obi', 'purple bodysuit, tight bodysuit') < 0.5, true);
eq('聯絡管道：遠坂＝使魔字條', T.getContactChannel_('遠坂組 (Archer陣營)').icon + T.getContactChannel_('遠坂組 (Archer陣營)').label, '🕊使魔字條（Archer 轉達）');
eq('聯絡管道：衛宮＝家用電話', T.getContactChannel_('衛宮組 (Saber陣營)').label, '衛宮邸的家用電話');
eq('聯絡管道：臟硯組不會被當成間桐', T.getContactChannel_('臟硯組 (真Assassin陣營)').marker, '臟硯');
eq('全裸從者開戰 → 自動具現戰鬥裝', T.autoAdaptSmartOutfit_('scathach', 'nude, completely nude, no clothes', sca, '迎戰', '', true, '廢棄洋館'), 'purple bodysuit');
eq('全裸從者出門 → 自動具現戰鬥裝', T.autoAdaptSmartOutfit_('scathach', 'nude, completely nude, no clothes', sca, '出發', '', false, '新都商業區'), 'purple bodysuit');
eq('全裸從者在據點休息 → 維持全裸', T.autoAdaptSmartOutfit_('scathach', 'nude, completely nude, no clothes', sca, '聊天', '', false, '廢棄洋館'), 'nude, completely nude, no clothes');
eq('全裸御主出門 → 仍由玩家決定（維持全裸）', T.autoAdaptSmartOutfit_('player_master', 'nude, completely nude, no clothes', { defaultOutfit: 'dress' }, '出發', '', false, '新都商業區'), 'nude, completely nude, no clothes');
eq('JSON 容錯解析', T.parseJsonLoose_('```json\n{"a":1}\n```'), { a: 1 });
eq('深夜 → 隔天清晨', T.advanceTimePeriod_(1, '深夜'), { day: 2, period: '清晨' });

// ---- 全裸流程 ----
const NUDE = 'nude, completely nude, no clothes';
const scaN = { defaultOutfit: 'scathach battle bodysuit', casualOutfit: 'white sweater' };
eq('全裸：在據點沒穿衣 → 維持全裸', T.autoAdaptSmartOutfit_('scathach', NUDE, scaN, '一起泡澡', '熱氣蒸騰', false, '廢棄洋館'), NUDE);
eq('全裸：從者開戰 → 自動具現戰鬥裝', T.autoAdaptSmartOutfit_('scathach', NUDE, scaN, '有人闖入', '', true, '廢棄洋館'), 'scathach battle bodysuit');
eq('全裸：從者離開據點 → 戰鬥裝', T.autoAdaptSmartOutfit_('scathach', NUDE, scaN, '出門', '', false, '新都'), 'scathach battle bodysuit');
eq('全裸：從者穿上衣服 → 還原', T.autoAdaptSmartOutfit_('scathach', NUDE, scaN, '幫她穿上衣服', '', false, '廢棄洋館'), 'scathach battle bodysuit');
eq('全裸：御主開戰也不會自動穿', T.autoAdaptSmartOutfit_('player_master', NUDE, { defaultOutfit: 'coat' }, '迎戰', '', true, '新都'), NUDE);
eq('全裸：御主劇情別人穿衣不算', T.autoAdaptSmartOutfit_('player_master', NUDE, { defaultOutfit: 'coat' }, '看著她', '斯卡哈穿上衣服', false, '廢棄洋館'), NUDE);
eq('全裸：御主自己穿上 → 還原', T.autoAdaptSmartOutfit_('player_master', NUDE, { defaultOutfit: 'coat' }, '我穿上衣服', '', false, '廢棄洋館'), 'coat');

// ---- 戰鬥分量：淘汰要兩步 ----
eq('滿狀態一回合被淘汰 → 降為重創敗退', T.gateFactionElimination_('存活 (敵對獵殺)', '已淘汰'), '存活 (重創敗退・靈基受損)');
eq('已負傷 → 可以淘汰', T.gateFactionElimination_('交戰負傷・休整中', '已淘汰'), '已淘汰');
eq('收服不受限制', T.gateFactionElimination_('存活', '已歸屬第8組'), '已歸屬第8組');
eq('一般狀態更新不受影響', T.gateFactionElimination_('存活', '存活 (同盟)'), '存活 (同盟)');
eq('戰局：列出未化解陣營', /尚未化解的陣營：衛宮組/.test(T.describeWarStateForPrompt_({ '衛宮組': '存活', '遠坂組': '同盟' }, 50, 140, 'WAR')), true);
eq('戰局：全部化解 → 終局提示', /終局/.test(T.describeWarStateForPrompt_({ '衛宮組': '已淘汰', '遠坂組': '同盟' }, 50, 140, 'WAR')), true);
eq('戰局：魔力枯竭提示', /魔力枯竭/.test(T.describeWarStateForPrompt_({}, 0, 140, 'WAR')), true);
eq('戰局：日常模式不提示', T.describeWarStateForPrompt_({}, 0, 140, 'SANDBOX'), '');

// ---- 情報檔案：知道與不知道分開 ----
eq('對外狀態去掉巢狀括號的幕後細節', T.publicIntelText_('交戰負傷・休整中 (曾於愛因茲貝倫森林與 衛宮組 (Saber陣營) 激戰)'), '交戰負傷・休整中');
eq('對外狀態去掉幕後細節', T.publicIntelText_('已淘汰 (於 Day 3 白天 在愛因茲貝倫森林遭 教會組 擊潰)'), '已淘汰');
const facsI = { '衛宮組 (Saber陣營)': '存活 (同盟)', '間桐組 (Rider陣營)': '存活 (隱蔽觀察)', '教會組 (Lancer陣營)': '存活 (敵對暗算)', '遠坂組 (Archer陣營)': '存活 (中立試探)' };
const intel0 = T.initFactionIntel_(facsI, false);
eq('開局：同盟知道、其他不明', [intel0['衛宮組 (Saber陣營)'].text, intel0['間桐組 (Rider陣營)'].text], ['存活 (同盟)', '不明']);
eq('開局：教會只知道表面', intel0['教會組 (Lancer陣營)'].text, '監督者據點（表面中立）');
const metaI = { factionIntel: intel0 };
const facs2 = Object.assign({}, facsI, { '間桐組 (Rider陣營)': '已淘汰 (於 Day 3 白天 在森林遭 教會組 擊潰)', '遠坂組 (Archer陣營)': '存活 (負傷休整)' });
let ch = T.updateFactionIntel_(metaI, facs2, { presentIds: ['rin'], when: 'Day 3・夜晚' });
eq('親眼見到凜 → 遠坂組更新', metaI.factionIntel['遠坂組 (Archer陣營)'].text, '存活 (負傷休整)');
eq('幕後淘汰沒見到 → 仍不明', metaI.factionIntel['間桐組 (Rider陣營)'].text, '不明');
ch = T.updateFactionIntel_(metaI, facs2, { aiIntel: { '間桐組': '聽說 Rider 陣營在森林被打敗了' }, when: 'Day 4・白天' });
eq('劇情中打聽到 → 記錄玩家得知的內容', [metaI.factionIntel['間桐組 (Rider陣營)'].text, metaI.factionIntel['間桐組 (Rider陣營)'].source], ['聽說 Rider 陣營在森林被打敗了', '情報']);

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
