/**
 * ============================================================
 * FATE 第五次聖杯戰爭 (第8組異常參戰者・NAI V5 視覺導演與全英譯升級版) - Code.gs【修正完整版】
 * 整合機能：
 * 1. NAI V5 專職視覺導演／翻譯層：劇情推演與繪圖翻譯分離，自動轉譯為「英文 Danbooru 標籤＋簡短自然語言」、鏡頭視角、AI's Choice 自動構圖（use_coords: false）、high complexity 品質尾綴與多人互動語法 (source# / target# / mutual#)
 * 2. 服裝「劇情絕對優先」：手動換裝僅作預設參考，洗澡自動脫衣、開打自動換戰鬥裝；全裸後主動穿衣會自動還原
 * 3. 零翻譯重骰 CG：重骰 CG (retrySceneImage) 直接換 Seed 叫 NAI 重畫，不重跑 Gemini 翻譯；導演翻譯後的 payload 會回寫 ChatLog，重新讀檔後重骰仍保留裸體／戰鬥裝
 * 4. 回歸試算表 Char_Appearance 唯一基準：支援 G 欄「可召喚(TRUE/FALSE)」控制開局召喚池，並禁止開局召喚黑 Saber (saber_alter)
 * 5. 完整 7 組敵對陣營（＋玩家第 8 組）與隱藏王牌／路線變異（金閃閃、黑櫻＋黑 Saber 反轉、真 Assassin 咒腕哈桑）
 * 6. 劇情、隊伍狀態與圖片提示三向連動（動態場地進圖、副從者寶具與靈基狀態、地圖危險度同步）
 * 7. 2004 復古手機系統：冬木論壇留言板＋結盟陣營簡訊求援與雙向支援連動
 * 統一純粹使用 OpenRouter 模型：model: "google/gemini-3.1-flash-lite"
 *
 * 【本版修正重點】
 * - 修正 servant2_condition 欄位打錯字（原本會寫入 "undefined"）
 * - 修正每回合誤把同職階敵對陣營判定為「歸屬第8組」（只在真正收服副從者時才變更）
 * - 修正全裸狀態主動穿衣後仍維持裸體
 * - 生圖改用獨立鎖（UserLock），不再卡住下一回合的 ScriptLock
 * - Gemini 回傳 JSON 容錯解析＋自動重試一次，主回合 max_tokens 提高
 * - 簡訊對話串上限 30 則、meta JSON 超長自動裁切，避免儲存格爆量
 * - 求救簡訊不再重複洗版（同一狀態只發一次）
 * - TRUE_VICTORY 伺服器端驗證（仍有敵對陣營時降回 CONTINUE；日常模式不會通關）
 * - 後台陣營廝殺節奏放緩，不再輕易把七組打光
 * - 道具自動推測只掃玩家輸入並去重，避免重複 +1
 * - 陣營初始狀態與試算表 Factions_Relations 欄位對齊（D 預設狀態／E 預設態度），補列也使用 6 欄結構
 * - 修正全裸 tag 被洗成 "no," 的問題（"no clothes" 會完整移除並補上標準裸體 tag）
 * - 回合數改存 meta.turnCount，不再每回合掃描整張 ChatLog
 * - 時段推進訊息在「保命禮裝」觸發時也會正確顯示
 * - 黑櫻／黑Saber 出現時，確實移除同場的櫻／Saber
 * - 對話說話者找不到時不再亂標成第一個角色
 * ============================================================
 */

const GEMINI_MODEL = "google/gemini-3.1-flash-lite";
const MAX_INVENTORY_SLOTS = 6;
const MAX_SMS_PER_THREAD = 30;
const MAX_FORUM_POSTS = 25;
const META_JSON_SOFT_LIMIT = 45000;

// 試算表結構版本：只有版本號變動時才會執行一次「試算表自動升級」，不再每回合檢查
const SCHEMA_VERSION_ = '2026-11-27-adult-on';
const MAX_RUMORS = 10;
const MAX_FORUM_POSTS_PER_TURN = 2;

// 路線傾向：玩家的行動方式會累積傾向，達門檻後進入對應路線，劇情走向隨之偏移
const ROUTE_DEFS_ = {
  'fate': { name: '⚔️ 騎士王・正義同盟線', hint: '與衛宮組並肩、保護普通人、以騎士道與正面對決為主', guide: '劇情重心放在衛宮組與 Saber 的騎士道、保護無辜與正面決戰；言峰教會與吉爾伽美什是最終威脅。' },
  'ubw': { name: '🗡️ 無限劍製・遠坂魔術線', hint: '與遠坂組合作、魔術研究與情報交換、Archer 的真相', guide: '劇情重心放在遠坂組、魔術師之間的交易與對抗，以及 Archer 真實身分與理想的衝突；Caster 的契約奪取是中盤大敵。' },
  'hf': { name: '🖤 天之杯・黑影深淵線', hint: '調查黑影與間桐家、接近間桐櫻、觸及大聖杯汙染', guide: '劇情重心放在間桐家、黑影事件與大聖杯汙染；黑櫻覺醒、黑 Saber 反轉、間桐臟硯與真 Assassin 的陰謀逐步浮現。' },
  'shadow': { name: '🎭 暗影謀略線', hint: '散布假消息、暗殺、挑撥離間、利用情報操弄各陣營', guide: '劇情重心放在情報戰：流言、背叛、各陣營互相猜忌；被識破的謊言會引來報復，成功的佈局能讓敵人自相殘殺。' },
  'conquest': { name: '👑 霸道征服線', hint: '主動襲擊、收服敵方從者、以力量壓制各陣營', guide: '劇情重心放在正面征服：各陣營聯手戒備或圍剿第8組，收服的從者帶來新的羈絆與內部矛盾。' }
};
const ROUTE_LOCK_SCORE = 40;
const ROUTE_LOCK_LEAD = 12;
const MAX_KEY_EVENTS = 15;
const CHATLOG_PAYLOAD_KEEP = 6;
// 設定類分頁（角色／世界書／陣營）快取秒數；CacheService 上限 6 小時
const CONFIG_CACHE_SECONDS_ = 21600;
const CONFIG_CACHE_KEYS_ = ['fate_cfg_char_v2', 'fate_cfg_lore_v2', 'fate_cfg_fac_v2'];
const CONFIG_SHEET_NAMES_ = ['Char_Appearance', 'Lorebook', 'Factions_Relations'];

// 柳洞寺組（Caster＋Assassin 同一陣營）與真 Assassin 路線專用的陣營名稱
const RYUUDOU_FACTION_KEY_ = '柳洞寺組 (Caster/Assassin陣營)';
const ZOUKEN_FACTION_KEY_ = '臟硯組 (真Assassin陣營)';

// 真Assassin（咒腕哈桑）角色資料：Char_Appearance 沒有時會自動補上（不可開局召喚）
const HASSAN_CHAR_ROW_ = [
  'hassan',
  '咒腕哈桑,真Assassin,哈桑,咒腕',
  'boy',
  '1.2::hassan of the cursed arm (fate)::, fate/stay night, white skull mask, dark skin, tall, thin, long right arm',
  'black cloak, tattered cloak, bandaged right arm, wrapped arm',
  'visible face, eyes, short arms',
  false
];

// 背包道具的固定效果由伺服器結算（AI 不需要、也不應該重複計入）
const ITEM_EFFECTS_ = {
  'mana_gem_s': { mp: 35 },
  'mana_gem_m': { mp: 65 },
  'smoke_bomb': { threat: -15 }
};

const ART_STYLE_PRESETS_ = {
  'official': 'official art, game cg, type-moon style, detailed shading',
  'anime': 'anime screencap, cinematic lighting, depth of field, soft glow',
  'painterly': 'painterly, impasto, rich colors, high contrast, dramatic lighting',
  'flat': 'anime coloring, clean lineart, vibrant colors, cel shading',
  'manga': 'monochrome, greyscale, manga style, screentones, high contrast'
};

const GAME_TONE_PRESETS_ = {
  'BALANCED': {
    label: '⚖️ 符合常理（預設）',
    desc: '尊重型月常理與在場人物反應，重劇情、輕卡關，不隨意把非致命小動作判死。'
  },
  'COMEDY_CHAOS': {
    label: '😄 搞笑鬧劇輕鬆向',
    desc: '輕鬆幽默、鬧劇吐槽與寬容推進合一；在場角色會對偷吃、香味干擾或荒唐怪招做出生動誇張又好笑的反應（不無視），且非極端作死不輕易重創或判死。'
  },
  'STORY_PLAYER_FIRST': {
    label: '📖 故事模式（玩家為主）',
    desc: '完全依照並順從玩家輸入的話語、意圖與劇情方向自然延伸發展，不刻意唱反調或刁難，順著玩家想要的戲劇張力推進。'
  },
  'HARDCORE_WAR': {
    label: '⚔️ 鐵血嚴重戰場風',
    desc: '戰場肅殺務實，敵人與隊友不會被無關玩笑或偷吃小動作輕易唬住，分心或鬧場會招來冷靜反制與真實戰場後果，勝負與傷勢結算更嚴峻。'
  }
};

// 陣營基準：欄位與試算表 Factions_Relations 完全一致
// A 陣營名稱 / B 御主ID / C 從者ID / D 預設狀態 / E 預設態度 / F 原作主從關係與人際內幕
// 七位從者分屬六個陣營（Caster 與 Assassin 同屬柳洞寺組），再加上玩家獨立的第 8 組
const CANONICAL_7_FACTIONS_ = [
  ['衛宮組 (Saber陣營)', 'shirou', 'saber', '存活', '中立警戒', '【主從關係】衛宮士郎與阿爾托莉雅。士郎魔術半吊子且過度保護Saber，Saber重視騎士榮譽與保護無辜。士郎與遠坂凜是同校同學、與間桐櫻是青梅竹馬。若玩家展現正義感或保護普通人，極易達成臨時結盟。'],
  ['遠坂組 (Archer陣營)', 'rin', 'archer', '存活', '中立試探', '【主從關係】遠坂凜與紅A。表面常鬥嘴實則默契極佳，紅A的真實身分是未來的衛宮士郎。凜其實是間桐櫻的親姐姐。重視利益交換，可透過情報或聯手討伐Caster結盟。'],
  ['教會組 (Lancer陣營)', 'kirei', 'lancer', '存活', '敵對暗算', '【主從關係】言峰綺禮殺害原御主後奪取了庫·夫林的控制權，Lancer極度厭惡綺禮的卑鄙作風，僅因令咒被迫服從。綺禮同時是英雄王吉爾伽美什的御主。若在戰鬥中堂堂正正認可Lancer的武勇，有機會觸發其倒戈。'],
  ['間桐組 (Rider陣營)', 'sakura', 'rider', '存活', '隱蔽觀察', '【主從關係】美杜莎的真正御主是間桐櫻，因櫻不願戰鬥而透過「偽臣之書」交給哥哥間桐慎二指揮。Rider對慎二毫無忠誠，一心只想保護櫻。只要解救櫻或奪取偽臣之書，Rider會毫不猶豫轉投玩家陣營。'],
  ['柳洞寺組 (Caster/Assassin陣營)', 'souichirou', 'caster', '存活', '敵對防備', '【主從關係】Caster美狄亞與葛木宗一郎聯手佔據柳洞寺，山門由守門人Assassin佐佐木小次郎（必殺劍技「燕返」）鎮守。Caster持有寶具「萬符必應破戒」，會試圖搶奪其他御主的從者契約。'],
  ['愛因茲貝倫組 (Berserker陣營)', 'illya', 'berserker', '存活', '敵對獵殺', '【主從關係】伊莉雅與狂戰士海克力士擁有極高魔力連結與深厚羈絆。伊莉雅初期對衛宮士郎抱有強烈恨意，性格殘酷卻內心孤獨。']
];

function normalizeGameToneKey_(rawTone) {
  const k = String(rawTone || '').trim();
  if (GAME_TONE_PRESETS_[k]) return k;
  if (k === 'EASY' || k === 'SLAPSTICK' || k === 'COMEDY') return 'COMEDY_CHAOS';
  if (k === 'UNRESTRICTED' || k === 'STORY' || k === 'PLAYER_FIRST') return 'STORY_PLAYER_FIRST';
  return 'BALANCED';
}

// 冬木市 8 大核心地標戰略資料庫 (座標、靈脈濃度、自動回魔量、戰略特性)
const FUYUKI_LOCATIONS_ = {
  '廢棄洋館': {
    id: 'mansion',
    fullName: '冬木市・廢棄洋館地下室',
    aliases: ['廢棄洋館', '洋館', '據點', '工房', '地下室'],
    leyline: '弱靈脈 (隱蔽工房)',
    manaRegen: 10,
    danger: '低 (秘密據點)',
    x: 24, y: 74,
    desc: '位於深山町邊緣的秘密據點，設有基礎隱匿結界，適合安全休整與煉成禮裝，但大源魔力稀薄。'
  },
  '冬木大橋': {
    id: 'bridge',
    fullName: '未遠川・冬木大橋',
    aliases: ['冬木大橋', '大橋', '未遠川'],
    leyline: '弱靈脈 (開闊戰場)',
    manaRegen: 10,
    danger: '高 (遭遇戰頻發)',
    x: 50, y: 48,
    desc: '連接深山町與新都的鋼鐵大橋，夜間視野開闊且容易暴露魔力波動，是各路英靈最常爆發正面衝突的決戰地。'
  },
  '柳洞寺': {
    id: 'ryuudou',
    fullName: '圓藏山・柳洞寺',
    aliases: ['柳洞寺', '圓藏山', '山門'],
    leyline: '🌟 大靈脈 (極高濃度大源)',
    manaRegen: 35,
    danger: '極高 (Caster/Assassin陣營盤踞)',
    x: 15, y: 24,
    desc: '冬木市靈脈源頭，大源魔力極度充沛（時段推進 +35 MP），最適合汲取魔力與高階儀式，但受山門結界與強敵守護。'
  },
  '聖堂教會': {
    id: 'church',
    fullName: '言峰教會・聖堂',
    aliases: ['聖堂教會', '教會', '聖堂', '言峰'],
    leyline: '✨ 中靈脈 (監督者中立區)',
    manaRegen: 20,
    danger: '中 (監督者監視)',
    x: 43, y: 66,
    desc: '聖杯戰爭監督者言峰綺禮所在的中立聖堂，禁止公開廝殺，可打探七組情報或取得教會黑鍵、聖骸布等概念禮裝。'
  },
  '衛宮邸': {
    id: 'emiya',
    fullName: '深山町・衛宮邸',
    aliases: ['衛宮邸', '衛宮家', '士郎家'],
    leyline: '✨ 中靈脈 (住宅區結界)',
    manaRegen: 20,
    danger: '高 (Saber陣營據點)',
    x: 28, y: 52,
    desc: '深山町傳統日式大宅，布有簡易警報結界，為 Saber 陣營的活動據點。'
  },
  '遠坂邸': {
    id: 'tohsaka',
    fullName: '深山町・遠坂邸',
    aliases: ['遠坂邸', '遠坂家', '凜家'],
    leyline: '🌟 大靈脈 (第二靈脈節點)',
    manaRegen: 35,
    danger: '極高 (Archer陣營據點)',
    x: 34, y: 34,
    desc: '坐落於冬木第二靈脈上的西洋大宅，內部設有頂級防禦魔術陷阱，地下工房藏有大量魔力寶石儲備。'
  },
  '新都商業區': {
    id: 'shinto',
    fullName: '冬木新都・高樓商業區',
    aliases: ['新都', '商業區', '高樓', '凱悅'],
    leyline: '弱靈脈 (現代都市)',
    manaRegen: 10,
    danger: '中高 (使魔與黑影出沒)',
    x: 76, y: 42,
    desc: '繁華的現代化高樓區，可購得現代工業媒介或古董材料製作禮裝，深夜常有使魔偵察與異常魔力波動。'
  },
  '愛因茲貝倫森林': {
    id: 'forest',
    fullName: '郊外・愛因茲貝倫森林古堡',
    aliases: ['愛因茲貝倫', '森林', '古堡', '郊外'],
    leyline: '✨ 中靈脈 (人造人結界)',
    manaRegen: 20,
    danger: '極高 (Berserker領地)',
    x: 82, y: 76,
    desc: '冬木市郊被濃霧與魔術結界籠罩的森林古堡，盤踞著極度危險的 Berserker 陣營，勝出者可奪得稀有高階戰利品。'
  }
};

// 四大出身：開局六維等階、最大魔力與初始背包道具
const ORIGIN_PRESETS_ = {
  '冬木市隱居古家族': {
    params: { circuit: 'B', combat: 'D', stealth: 'C', luck: 'C' },
    maxMp: 140,
    desc: '魔術迴路:B | 近戰體術:D | 隱藏氣息:C | 幸運:C (正統名門，魔力充裕且自帶預先灌注的魔力寶石)',
    starterItems: [
      { id: 'mana_gem_m', name: '高純度魔力寶石(中)', tier: 2, type: 'consumable', qty: 1, desc: '預先壓縮魔力的寶石，捏碎可瞬間回復 +65 MP' },
      { id: 'empty_gem', name: '未充能天然寶石媒介', tier: 1, type: 'material', qty: 2, desc: '可用於在工房灌注自身魔力製成魔力寶石' }
    ]
  },
  '時鐘塔叛逃魔術師': {
    params: { circuit: 'C', combat: 'C', stealth: 'B', luck: 'D' },
    maxMp: 110,
    desc: '魔術迴路:C | 近戰體術:C | 隱藏氣息:B | 幸運:D (擅長潛伏與暗算，自帶煙霧彈與魔力結晶)',
    starterItems: [
      { id: 'mana_gem_s', name: '魔力結晶(小)', tier: 1, type: 'consumable', qty: 2, desc: '吸收可回復 +35 MP' },
      { id: 'smoke_bomb', name: '煙霧魔術彈', tier: 1, type: 'consumable', qty: 1, desc: '掩護脫離非寶具遭遇戰並降低15%警戒度' }
    ]
  },
  '聖堂教會異端代行者': {
    params: { circuit: 'D', combat: 'A', stealth: 'C', luck: 'D' },
    maxMp: 90,
    desc: '魔術迴路:D | 近戰體術:A | 隱藏氣息:C | 幸運:D (肉身強化與黑鍵專家，自帶黑鍵與結晶)',
    starterItems: [
      { id: 'black_keys', name: '基礎黑鍵套組', tier: 1, type: 'equipment', qty: 1, desc: '對魔術師與使魔有效，可牽制從者但無法致死' },
      { id: 'mana_gem_s', name: '魔力結晶(小)', tier: 1, type: 'consumable', qty: 1, desc: '吸收可回復 +35 MP' }
    ]
  },
  '被大聖杯強行捲入的普通人': {
    params: { circuit: 'E', combat: 'E', stealth: 'D', luck: 'EX' },
    maxMp: 70,
    desc: '魔術迴路:E | 近戰體術:E | 隱藏氣息:D | 幸運:EX (開局兩手空空且極度脆弱，必須靠搜刮與戰術起家)',
    starterItems: []
  }
};

// 全角色招牌寶具與必殺技 NAI V5 英文視覺特效庫
const NP_VISUAL_EFFECTS_ = {
  'scathach': 'holding crimson spear, red lightning, multiple floating red spears, glowing rune circles, leaping thrust, piercing crimson energy beam',
  'prisma_illya': 'holding magical wand, wings of light, giant rainbow magic circle, pink and rainbow energy beam, glowing feathers, dazzling light',
  'chloe': 'dual wielding black and white swords, projection magic, pink mana aura, high-speed slash, magic sparks',
  'miyu': 'holding blue magical wand, blue magic circle, sapphire energy beam, water and light particles',
  'saber': 'holding golden holy sword, raising sword high, massive golden light beam, swirling wind, golden light particles',
  'saber_alter': 'holding black sword with red runes, dark purple and black energy beam, black lightning, ominous dark aura',
  'archer': 'dual wielding black and white swords, projection magic, glowing magic circuits, sharp intense gaze',
  'lancer': 'low crouched stance, throwing crimson spear, scarlet light trail, red lightning, fierce eyes, shockwave',
  'rider': 'glowing mystic eyes, black chains, riding white pegasus, rainbow magic circle, high-speed charge',
  'caster': 'levitating, holding golden staff, purple magic circles, barrage of purple energy beams, glowing magic runes',
  'assassin': 'holding long katana, three simultaneous slash afterimages, swallow silhouettes, cherry blossom petals, moonlit slash',
  'berserker': 'swinging giant stone axe-sword, shattering ground, glowing red eyes, berserk crimson aura',
  'gilgamesh': 'golden ripples behind back, countless golden weapons firing from portals, holding red-lined sword, radiant golden light',
  'jeanne': 'holding white banner flag, sacred golden light, luminous halo, fluttering flag, falling white feathers',
  'jalter': 'holding black banner flag, dark purple and black flames burning, blazing stakes, wicked smirk, floating embers',
  'mordred': 'holding red lightning sword, scarlet lightning explosion, crimson energy slash, fierce battle spirit',
  'okita': 'holding katana, high-speed dash, cyan wind trail, gleaming blade flash, intense focus',
  'tamamo': 'holding floating mirror, pink and blue spirit flames, cherry blossoms, golden magic circle',
  'ereshkigal': 'holding golden lance, ghostly blue flames, underworld cage, dark blue lightning',
  'karna': 'holding golden lance, blazing solar flames, glowing golden armor, blinding sun explosion',
  'hassan': 'unwrapped long cursed right arm extending, shadowy red glowing arm, grasping a phantom heart, crouching in darkness, zabaniya',
  'dark_sakura': 'dark miasma swirling, black shadow tentacles, glowing red markings on skin, dark purple mana vortex, corrupted grail energy'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('FATE・第五次聖杯戰爭 (第8組異常參戰)')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==================== 通用安全工具：JSON 容錯解析、meta 序列化裁切 ====================

function safeJsonParse_(str, fallback) {
  try {
    if (str === null || str === undefined || str === '') return fallback;
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// 容錯解析 LLM 回傳的 JSON（去除 ``` 圍欄、擷取最外層大括號）
function parseJsonLoose_(text) {
  const t = String(text || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const s = t.indexOf('{');
    const e2 = t.lastIndexOf('}');
    if (s >= 0 && e2 > s) {
      return JSON.parse(t.slice(s, e2 + 1));
    }
    throw e;
  }
}

// 單一儲存格上限約 50000 字元；超過時裁切論壇與簡訊以確保存檔不會失敗
function serializeMeta_(meta) {
  let s = JSON.stringify(meta);
  if (s.length <= META_JSON_SOFT_LIMIT) return s;

  const m = JSON.parse(s);
  if (m.phoneState) {
    if (Array.isArray(m.phoneState.forumPosts)) {
      m.phoneState.forumPosts = m.phoneState.forumPosts.slice(0, 10);
    }
    const threads = m.phoneState.smsThreads || {};
    Object.keys(threads).forEach(k => {
      if (threads[k] && Array.isArray(threads[k].messages)) {
        threads[k].messages = threads[k].messages.slice(-10);
      }
    });
  }
  s = JSON.stringify(m);

  if (s.length > 48000) {
    if (m.phoneState) {
      m.phoneState.forumPosts = (m.phoneState.forumPosts || []).slice(0, 3);
      Object.keys(m.phoneState.smsThreads || {}).forEach(k => {
        const t = m.phoneState.smsThreads[k];
        if (t && Array.isArray(t.messages)) t.messages = t.messages.slice(-3);
      });
    }
    s = JSON.stringify(m);
  }
  return s;
}

// ==================== 全裸／無衣物與智能情境服裝適配函式 ====================

function isNudeOutfitTags_(outfitStr) {
  const s = String(outfitStr || '').toLowerCase();
  return /\b(nude|naked|completely nude|no clothes|topless|bottomless|undressed)\b/.test(s) || /全裸|裸體|沒穿|赤裸|一絲不掛/.test(s);
}

function stripClothesFromCore_(coreStr) {
  let c = String(coreStr || '');
  const clothesNoise = [
    'chaldea mystic code uniform', 'black jacket', 'white shirt', 'black miniskirt',
    'black thighhighs', 'black pants', 'black boots', 'black turtleneck keyhole sweater',
    'black pantyhose', 'bare feet', 'thighhighs', 'pantyhose', 'bodysuit', 'dress',
    'armor', 'skirt', 'shirt', 'jacket', 'coat', 'uniform', 'stockings', 'undergarments',
    'bra', 'panties', 'swimsuit', 'bikini', 'red coat', 'black sleeveless bodysuit', 'black trousers',
    '紅大衣', '黑色無袖緊身衣', '黑褲', '藍裙', '銀甲', '鎧甲裙', '藍緞帶', '黑甲', '深色洋裝',
    '黑色護手', '黑色面罩', '藍色緊身衣', '銀色肩甲', '黑色眼罩', '黑色無袖洋裝', '黑過膝襪',
    '高跟鞋', '紫色連帽斗篷', '紫色羽織', '藍色袴', '白色內搭', '和服', '灰色纏腰布', '皮帶',
    '黃金鎧甲', '華麗金胸甲', '紅腰布', '紫色緊身衣', '黑色面紗', '過膝襪', '紅色高領毛衣',
    '黑色迷你裙', '十字架項鍊', '白襯衫', '藍插肩袖', '牛仔褲', '學校制服', '棕色西裝外套',
    '白色水手領', '紅領結', '棕色百褶裙', '黑褲襪', '紫色冬衣', '毛絨滾邊', '紫帽', '白過膝襪',
    '黑色神父袍', '白色祭司領'
  ];
  clothesNoise.forEach(kw => {
    const re = new RegExp('(?:^|,\\s*)' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s*,|$)', 'gi');
    c = c.replace(re, '');
  });
  return c.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim();
}

function formatCharacterOutfitPrompt_(rawOutfit) {
  const trimmed = String(rawOutfit || '').trim();
  if (!trimmed) return '';
  if (isNudeOutfitTags_(trimmed)) {
    // 先移除裸體關鍵詞（含完整的 "no clothes"），再移除殘留衣物字眼，最後統一補上標準裸體 tag
    const extras = trimmed
      .replace(/\b(nude|naked|completely nude|no clothes|topless|bottomless|undressed)\b/gi, '')
      .replace(/\b(clothes|clothing|outfit|uniform|dress|skirt|shirt|jacket|coat|pantyhose|thighhighs|stockings)\b/gi, '')
      .replace(/全裸|裸體|沒穿|赤裸|一絲不掛/g, '')
      .replace(/,(\s*,)+/g, ',')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
    const nudeCore = ['nude, completely nude', extras].filter(Boolean).join(', ');
    return `1.3::${nudeCore}, bare skin::`;
  }
  return `1.15::${trimmed}::`;
}

function autoAdaptSmartOutfit_(charId, currentOutfit, dbInfo, userAction, storyText, isCombat, locKey) {
  const cur = String(currentOutfit || '').trim();
  const combinedText = `${String(userAction || '')} ${String(storyText || '')}`;
  const defaultOutfit = String((dbInfo && dbInfo.defaultOutfit) || '').trim();

  if (isNudeOutfitTags_(cur)) {
    // 御主只看玩家本人輸入（避免他人穿衣服的劇情句子誤觸發）；其他角色看整段文字
    const dressCheckText = (charId === 'player_master') ? String(userAction || '') : combinedText;
    const wantsPutOnClothes = /穿上|穿好|換上|套上|披上|遮住|遮起來|穿衣服|穿回/.test(dressCheckText);
    if (!wantsPutOnClothes) {
      return 'nude, completely nude, no clothes';
    }
    // 主動穿衣：還原為預設服裝，若無預設則用一般便服
    return defaultOutfit || 'casual clothes, shirt, pants';
  }

  if (charId !== 'player_master') {
    const isCasualOrSleepwear = /睡衣|家居|浴袍|圍裙|便服|居家服|睡覺|洗澡|\b(pajamas|sleepwear|bathrobe|apron|casual clothes|loungewear)\b/i.test(cur);
    const isOutdoorCombatOrPatrol = Boolean(isCombat) || /交戰|戰鬥|迎戰|突襲|夜襲|巡邏|警戒|出擊|戰場|寶具|魔槍|聖劍/.test(combinedText) || (locKey && locKey !== '廢棄洋館');
    if (isOutdoorCombatOrPatrol && isCasualOrSleepwear) {
      return defaultOutfit || cur;
    }
  }

  return cur;
}

// ==================== 2004 復古手機：冬木論壇留言板＋結盟陣營簡訊連動 ====================

function buildInitialForumPosts_(day, period) {
  return [
    {
      id: 'fuyuki_bbs_1',
      board: '冬木都市怪談板',
      author: '匿名_深山町',
      time: `Day ${day}・${period}`,
      title: '剛才未遠川大橋附近是不是閃過奇怪的紅光？',
      body: '不是打雷也沒有煙火，空氣裡突然有一股像臭氧又像鐵鏽的味道，連路燈都閃了一下。警察好像又被什麼人擋在外面了……',
      isPlayer: false
    },
    {
      id: 'fuyuki_bbs_2',
      board: '深夜夜行情報串',
      author: '夜貓子_新都',
      time: `Day ${day}・${period}`,
      title: '最近圓藏山跟新都晚上最好少出門',
      body: '聽說有幾個穿得像古董一樣的人在盯梢，還有奇怪的黑色影子在巷子裡晃。大家回家鎖好門窗吧。',
      isPlayer: false
    }
  ];
}

function buildInitialSmsThreads_(factionsObj) {
  const f = factionsObj || {};
  const threads = {};
  Object.keys(f).forEach(facName => {
    const statusText = String(f[facName] || '');
    const allied = isAllianceStatusText_(statusText);
    threads[facName] = {
      factionName: facName,
      allied: allied,
      statusText: statusText,
      lastDistressStatus: '',
      messages: allied ? [
        {
          sender: facName,
          fromPlayer: false,
          time: '2004 加密短訊',
          text: `【同盟頻道已建立】我們與第8組暫時休戰互助。若遇強敵或靈基受損，隨時傳訊互通消息。`
        }
      ] : []
    };
  });
  return threads;
}

function syncPhoneStateWithFactions_(phoneState, factionsObj, day, period, warReport) {
  const p = Object.assign({
    forumPosts: buildInitialForumPosts_(day, period),
    smsThreads: buildInitialSmsThreads_(factionsObj),
    unreadCount: 1
  }, phoneState || {});

  const posts = Array.isArray(p.forumPosts) ? p.forumPosts.slice() : buildInitialForumPosts_(day, period);
  const threads = Object.assign({}, p.smsThreads || {});
  const f = factionsObj || {};
  const distressRe = /負傷|受損|受創|重創|苦戰|壓制|圍攻|撤退|求援/;

  Object.keys(f).forEach(facName => {
    const statusText = String(f[facName] || '');
    const allied = isAllianceStatusText_(statusText);
    if (!threads[facName]) {
      threads[facName] = {
        factionName: facName,
        allied: allied,
        statusText: statusText,
        lastDistressStatus: '',
        messages: []
      };
    } else {
      threads[facName].allied = allied;
      threads[facName].statusText = statusText;
      if (!Array.isArray(threads[facName].messages)) threads[facName].messages = [];
    }

    const th = threads[facName];
    const isDistress = distressRe.test(statusText);

    if (allied && isDistress) {
      // 同一個受困狀態只發送一次求救簡訊，避免玩家回覆後又重複洗版
      if (th.lastDistressStatus !== statusText) {
        th.messages.push({
          sender: facName,
          fromPlayer: false,
          time: `Day ${day}・${period}`,
          text: `【求救簡訊】我們目前處境不妙（${statusText}），急需支援或牽制！第8組能支援嗎？`
        });
        th.lastDistressStatus = statusText;
        p.unreadCount = (Number(p.unreadCount) || 0) + 1;
      }
    } else if (!isDistress) {
      th.lastDistressStatus = '';
    }

    if (th.messages.length > MAX_SMS_PER_THREAD) {
      th.messages = th.messages.slice(-MAX_SMS_PER_THREAD);
    }
  });

  if (warReport) {
    const postId = 'war_' + day + '_' + period + '_' + warReport.slice(0, 14);
    const alreadyExists = posts.some(item => item.id === postId || item.body === warReport);
    if (!alreadyExists) {
      posts.unshift({
        id: postId,
        board: '冬木風聲／目擊回報',
        author: '匿名_0402',
        time: `Day ${day}・${period}`,
        title: '【最新風聲】冬木市又有動靜了……',
        body: warReport,
        isPlayer: false
      });
      p.unreadCount = (Number(p.unreadCount) || 0) + 1;
    }
  }

  if (posts.length > MAX_FORUM_POSTS) posts.length = MAX_FORUM_POSTS;

  p.forumPosts = posts;
  p.smsThreads = threads;
  return p;
}

function postFuyukiForumMessage(playerName, titleText, bodyText, isFakeNews) {
  const cleanName = validatePlayerName_(playerName);
  const cleanBody = String(bodyText || '').trim().slice(0, 140);
  const cleanTitle = (String(titleText || '').trim() || '匿名目擊與風聲').slice(0, 36);
  if (!cleanBody) throw new Error('請輸入論壇留言內容！');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const meta = safeJsonParse_(row[31], {});
    const factionsObj = safeJsonParse_(row[29], {});
    const phone = syncPhoneStateWithFactions_(meta.phoneState, factionsObj, row[6], row[7], '');

    const newPost = {
      id: 'player_post_' + Date.now(),
      fake: Boolean(isFakeNews) || undefined,
      board: '冬木匿名留言板',
      author: `${cleanName} (2004端末)`,
      time: `Day ${row[6]}・${row[7]}`,
      title: cleanTitle,
      body: cleanBody,
      isPlayer: true
    };
    phone.forumPosts.unshift(newPost);
    if (phone.forumPosts.length > MAX_FORUM_POSTS) phone.forumPosts.length = MAX_FORUM_POSTS;

    meta.phoneState = phone;
    meta.pendingForumNote = `玩家在冬木論壇${isFakeNews ? '刻意散布假消息' : '發布了貼文'}【${cleanTitle}】：${cleanBody}`;
    meta.rumors = addRumor_(meta.rumors, {
      text: `${cleanTitle}：${cleanBody}`,
      channel: '冬木論壇',
      isFake: Boolean(isFakeNews),
      turn: Number(meta.turnCount) || 0
    });
    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();

    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

function sendAllySmsMessage(playerName, factionName, messageText, isDeception) {
  const cleanName = validatePlayerName_(playerName);
  const targetFac = String(factionName || '').trim();
  const msg = String(messageText || '').trim().slice(0, 140);
  const deceive = Boolean(isDeception);
  if (!targetFac || !msg) throw new Error('請選擇聯絡對象並輸入簡訊內容！');

  // 先在鎖外讀取存檔並請 AI 以該陣營口吻回覆（等待 AI 時不卡住其他玩家）
  let aiResult = null;
  try {
    const ssPre = SpreadsheetApp.getActiveSpreadsheet();
    const sheetPre = ssPre.getSheetByName('Players_Save');
    const idxPre = findPlayerRowIndex_(sheetPre, cleanName);
    if (idxPre !== -1) {
      const rowPre = sheetPre.getRange(idxPre, 1, 1, 32).getValues()[0];
      const facPre = safeJsonParse_(rowPre[29], {});
      const metaPre = safeJsonParse_(rowPre[31], {});
      const stPre = String(facPre[targetFac] || '');
      if (canSmsFaction_(metaPre, targetFac, stPre)) {
        const thread = (metaPre.phoneState && metaPre.phoneState.smsThreads && metaPre.phoneState.smsThreads[targetFac]) || {};
        aiResult = generateAllySmsReply_(cleanName, targetFac, stPre, Array.isArray(thread.messages) ? thread.messages : [], msg, rowPre, deceive);
      }
    }
  } catch (e) {
    aiResult = null;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const meta = safeJsonParse_(row[31], {});
    const factionsObj = safeJsonParse_(row[29], {});
    const statusText = String(factionsObj[targetFac] || '');
    const allied = isAllianceStatusText_(statusText);

    if (!canSmsFaction_(meta, targetFac, statusText)) {
      throw new Error(`還沒有「${targetFac}」的聯絡方式（目前狀態：${statusText || '未知'}）。結盟，或在劇情中交換手機號碼後才能傳訊。`);
    }

    const phone = syncPhoneStateWithFactions_(meta.phoneState, factionsObj, row[6], row[7], '');
    if (!phone.smsThreads[targetFac]) {
      phone.smsThreads[targetFac] = { factionName: targetFac, allied: allied, statusText: statusText, lastDistressStatus: '', messages: [] };
    }
    const th = phone.smsThreads[targetFac];

    th.messages.push({
      sender: cleanName,
      fromPlayer: true,
      time: `Day ${row[6]}・${row[7]}`,
      text: msg,
      deception: deceive || undefined
    });

    const isSupportCall = allied && /支援|趕來|幫忙|救|會合|牽制|協同|一起/.test(msg);
    const fallback = allied
      ? (isSupportCall
        ? `收到！我們會配合目前戰況調整動向與支援路線（${statusText}）。`
        : `收到簡訊了。目前我們的狀況是「${statusText}」，有最新動向會再通知你。`)
      : '……（對方已讀，沒有回覆）';
    const replyText = (aiResult && aiResult.reply) || fallback;

    th.messages.push({
      sender: targetFac,
      fromPlayer: false,
      time: `Day ${row[6]}・${row[7]}`,
      text: replyText
    });

    if (th.messages.length > MAX_SMS_PER_THREAD) {
      th.messages = th.messages.slice(-MAX_SMS_PER_THREAD);
    }

    if (isSupportCall && !isCapturedOrDefeatedStatusText_(statusText)) {
      factionsObj[targetFac] = `${statusText.replace(/・簡訊支援待命中/g, '')}・簡訊支援待命中`;
      row[29] = JSON.stringify(factionsObj);
    }

    // 簡訊內容與對方反應交給下一回合推演，讓結果真正落在劇情與陣營狀態上
    const reaction = aiResult && aiResult.reaction ? `；對方反應：${aiResult.reaction}` : '';
    const note = `玩家用簡訊${deceive ? '對' : '聯絡'}「${targetFac}」${deceive ? '放出假情報' : ''}：${msg}${reaction}`;
    meta.pendingSmsNote = [meta.pendingSmsNote, note].filter(Boolean).join('\n').slice(-600);

    if (deceive) {
      meta.rumors = addRumor_(meta.rumors, {
        text: msg,
        channel: `簡訊→${targetFac}`,
        isFake: true,
        turn: Number(meta.turnCount) || 0,
        believers: aiResult && aiResult.believed === 'yes' ? [targetFac] : [],
        doubters: aiResult && aiResult.believed === 'no' ? [targetFac] : []
      });
    }

    meta.phoneState = phone;
    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();

    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

// 同盟陣營簡訊：由 AI 以該陣營御主／從者的口吻回覆（2004 年手機簡訊風格），失敗時回傳空字串改用罐頭句
function generateAllySmsReply_(playerName, factionName, statusText, history, playerMsg, row, isDeception) {
  try {
    const canon = CANONICAL_7_FACTIONS_.find(r => r[0] === factionName);
    const relation = canon ? canon[5] : '';
    const allied = isAllianceStatusText_(statusText);
    const recent = (history || []).slice(-6).map(m => `${m.fromPlayer ? playerName : (m.sender || factionName)}：${m.text}`).join('\n');
    const systemPrompt = [
      '你正在扮演 Fate/stay night 第五次聖杯戰爭中的一個陣營，透過 2004 年的折疊手機回覆玩家（獨立第8組御主）的簡訊。',
      '用該陣營御主（必要時可帶到從者）的個性與口吻回覆，像真的手機短訊，不要旁白、不要署名。',
      allied
        ? '你們目前是同盟：被要求支援時，依陣營狀態明確表示能否支援、何時、怎麼配合。'
        : '你們不是同盟：依關係與性格回應，可能警戒、試探、挑釁、談條件或冷淡已讀；不要輕易透露自己的弱點。',
      isDeception
        ? '注意：玩家這則簡訊其實是想欺騙你，但你的角色並不知情。依角色的精明程度、手上情報與這則訊息的可信度，自然決定相信、半信半疑或識破。'
        : '',
      '輸出 JSON：{"reply":"80字內的簡訊回覆（繁體中文）","believed":"yes / unsure / no（玩家訊息內容你信不信；一般聯絡填 yes）","reaction":"20字內，描述你接下來打算怎麼做（給遊戲紀錄用）"}'
    ].filter(Boolean).join('\n');
    const userMsg = [
      `陣營：${factionName}`,
      `目前狀態：${statusText}`,
      relation ? `陣營背景：${relation}` : '',
      `現在時間：Day ${row[6]}・${row[7]}；玩家所在地：${row[10]}`,
      recent ? `最近簡訊：\n${recent}` : '',
      `玩家剛傳來：${playerMsg}`
    ].filter(Boolean).join('\n');
    const res = callGeminiLiteJson_(systemPrompt, userMsg, 0.8, 400);
    const reply = String((res && res.reply) || '').replace(/^["「『]|["」』]$/g, '').trim().slice(0, 140);
    if (!reply) return null;
    const believed = /^(yes|unsure|no)$/.test(String(res.believed || '')) ? String(res.believed) : 'unsure';
    return { reply: reply, believed: believed, reaction: String(res.reaction || '').trim().slice(0, 40) };
  } catch (e) {
    return null;
  }
}

// 能否傳簡訊：同盟陣營，或在劇情中取得了聯絡方式（meta.smsContacts）
function canSmsFaction_(meta, factionKey, statusText) {
  if (isAllianceStatusText_(statusText)) return true;
  const contacts = (meta && meta.smsContacts && typeof meta.smsContacts === 'object') ? meta.smsContacts : {};
  return Boolean(contacts[factionKey]);
}

// ==================== 流言系統：論壇貼文與假情報會被記錄、擴散、相信或識破 ====================

function addRumor_(rumors, r) {
  const list = Array.isArray(rumors) ? rumors.slice() : [];
  const id = 'R' + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36);
  list.push({
    id: id,
    text: String(r.text || '').slice(0, 140),
    channel: String(r.channel || '冬木論壇'),
    isFake: Boolean(r.isFake),
    turn: Number(r.turn) || 0,
    status: '擴散中',
    believers: Array.isArray(r.believers) ? r.believers : [],
    doubters: Array.isArray(r.doubters) ? r.doubters : [],
    effect: ''
  });
  // 優先保留擴散中的流言，其餘依新舊裁切
  const active = list.filter(x => x.status === '擴散中');
  const settled = list.filter(x => x.status !== '擴散中');
  const merged = settled.concat(active);
  return merged.slice(-MAX_RUMORS);
}

function applyRumorUpdates_(rumors, updates, factionsObj, turnNum) {
  const list = Array.isArray(rumors) ? rumors.map(x => Object.assign({}, x)) : [];
  const changes = [];
  (Array.isArray(updates) ? updates : []).forEach(u => {
    if (!u || !u.id) return;
    const r = list.find(x => x.id === String(u.id).trim());
    if (!r) return;
    const mapFac = arr => (Array.isArray(arr) ? arr : []).map(n => resolveFactionKey_(n, factionsObj) || '').filter(Boolean);
    mapFac(u.believers).forEach(k => {
      if (r.believers.indexOf(k) === -1) r.believers.push(k);
      r.doubters = r.doubters.filter(d => d !== k);
    });
    mapFac(u.doubters).forEach(k => {
      if (r.doubters.indexOf(k) === -1) r.doubters.push(k);
      r.believers = r.believers.filter(b => b !== k);
    });
    const st = String(u.status || '').trim();
    if (/識破|揭穿/.test(st)) r.status = '已被識破';
    else if (/平息|淡去|過時/.test(st)) r.status = '已平息';
    else if (/證實|成真/.test(st)) r.status = '已被證實';
    if (u.effect) r.effect = String(u.effect).trim().slice(0, 60);
    r.updatedTurn = turnNum;
    changes.push(`「${r.text.slice(0, 12)}…」${r.status}${r.effect ? '：' + r.effect : ''}`);
  });
  // 擴散超過 8 回合沒人理會的流言自然平息
  list.forEach(r => {
    if (r.status === '擴散中' && turnNum - (Number(r.turn) || 0) > 8 && !r.updatedTurn) r.status = '已平息';
  });
  return { rumors: list.slice(-MAX_RUMORS), changes: changes };
}

function describeRumorsForPrompt_(rumors) {
  const active = (Array.isArray(rumors) ? rumors : []).filter(r => r.status === '擴散中');
  if (active.length === 0) return '';
  return '【冬木流言追蹤（依各陣營情報能力與性格判斷誰會相信、誰會識破，並讓流言實際影響行動；有變化時填 rumor_updates）】\n' +
    active.map(r => `- [${r.id}] (${r.channel}${r.isFake ? '・玩家刻意放出的假消息' : ''}) ${r.text} ｜相信：${r.believers.join('、') || '無'} ｜懷疑：${r.doubters.join('、') || '無'}`).join('\n');
}

// ==================== 路線傾向 ====================

function applyRouteTendency_(meta, deltaObj) {
  const t = Object.assign({}, meta.routeTendency || {});
  Object.keys(ROUTE_DEFS_).forEach(k => { t[k] = Math.max(0, Math.min(100, Number(t[k]) || 0)); });
  if (deltaObj && typeof deltaObj === 'object') {
    Object.keys(deltaObj).forEach(k => {
      if (!ROUTE_DEFS_[k]) return;
      const d = Math.max(-3, Math.min(3, Math.round(Number(deltaObj[k]) || 0)));
      t[k] = Math.max(0, Math.min(100, t[k] + d));
    });
  }
  meta.routeTendency = t;

  const ranked = Object.keys(t).sort((a, b) => t[b] - t[a]);
  const top = ranked[0];
  const second = ranked[1];
  const prev = meta.activeRoute || '';
  let announce = '';
  if (t[top] >= ROUTE_LOCK_SCORE && t[top] - t[second] >= ROUTE_LOCK_LEAD) {
    // 已在某路線時，必須被新路線大幅超越才會轉線
    if (!prev || (prev !== top && t[top] - (t[prev] || 0) >= ROUTE_LOCK_LEAD * 2)) {
      meta.activeRoute = top;
      announce = prev
        ? `【路線轉折】命運的齒輪偏離了「${ROUTE_DEFS_[prev].name}」，你的抉擇將聖杯戰爭推向「${ROUTE_DEFS_[top].name}」。`
        : `【路線確立】你一路以來的抉擇，讓這場聖杯戰爭走上了「${ROUTE_DEFS_[top].name}」。`;
    }
  }
  return announce;
}

function describeRouteForPrompt_(meta) {
  const t = meta.routeTendency || {};
  const scores = Object.keys(ROUTE_DEFS_).map(k => `${k}=${Number(t[k]) || 0}`).join(', ');
  const defs = Object.keys(ROUTE_DEFS_).map(k => `${k}: ${ROUTE_DEFS_[k].hint}`).join('；');
  const active = meta.activeRoute && ROUTE_DEFS_[meta.activeRoute]
    ? `【目前路線：${ROUTE_DEFS_[meta.activeRoute].name}】${ROUTE_DEFS_[meta.activeRoute].guide}`
    : '【目前路線：尚未確立】依玩家行動自然發展。';
  return `${active}\n【路線傾向分數】${scores}（每回合依玩家本回合的行動方式填 route_tendency_delta，每項 -3～+3；${defs}）`;
}

function markPhoneMessagesRead(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) return null;

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const meta = safeJsonParse_(row[31], {});
    const factionsObj = safeJsonParse_(row[29], {});
    const phone = syncPhoneStateWithFactions_(meta.phoneState, factionsObj, row[6], row[7], '');
    phone.unreadCount = 0;
    meta.phoneState = phone;
    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

// ==================== 陣營歸屬、同盟、7組升級、黑Saber禁召與路線變異 ====================

function isAllianceStatusText_(statusStr) {
  const s = String(statusStr || '');
  return /同盟|結盟|停戰|互助|合作|友方/.test(s);
}

function isCapturedOrDefeatedStatusText_(statusStr) {
  const s = String(statusStr || '');
  return /淘汰|消滅|陣亡|擊潰|覆滅|收服|戰敗|已死|已歸屬第8組|原御主已退場/.test(s);
}

function isDefeatedOrCapturedFaction_(factionsObj, keyword) {
  const f = factionsObj || {};
  const entryKey = Object.keys(f).find(k => k.includes(keyword));
  if (!entryKey) return false;
  return isCapturedOrDefeatedStatusText_(String(f[entryKey] || ''));
}

// 所有陣營都已「淘汰／收服／結盟」才算全部化解（供 TRUE_VICTORY 伺服器端驗證）
function areAllRivalFactionsResolved_(factionsObj) {
  const keys = Object.keys(factionsObj || {});
  if (keys.length === 0) return false;
  return keys.every(k => {
    const st = String(factionsObj[k] || '');
    return isCapturedOrDefeatedStatusText_(st) || isAllianceStatusText_(st);
  });
}

// AI 回傳的 faction_updates 陣營名稱常常不完全一致（例如只寫「Saber陣營」「遠坂凜」），
// 這裡統一對應回存檔裡既有的陣營名稱；完全對不上的就丟棄，避免憑空多出重複陣營
const FACTION_ALIAS_GROUPS_ = [
  { marker: '臟硯', aliases: ['臟硯', '真assassin', '哈桑', '咒腕'] },
  { marker: '柳洞寺', aliases: ['柳洞寺', '葛木', 'caster', '美狄亞', 'assassin', '小次郎', '佐佐木'] },
  { marker: '衛宮', aliases: ['衛宮', '士郎', 'saber', '阿爾托莉雅'] },
  { marker: '遠坂', aliases: ['遠坂', '凜', 'archer', '紅a'] },
  { marker: '教會', aliases: ['教會', '言峰', '綺禮', 'lancer', '庫夫林', '庫·夫林', '吉爾伽美什', '金閃閃'] },
  { marker: '間桐', aliases: ['間桐', '櫻', '慎二', 'rider', '美杜莎'] },
  { marker: '愛因茲貝倫', aliases: ['愛因茲貝倫', '伊莉雅', 'berserker', '海克力士'] }
];

function resolveFactionKey_(rawKey, factionsObj) {
  const f = factionsObj || {};
  const k = String(rawKey || '').trim();
  if (!k) return '';
  if (Object.prototype.hasOwnProperty.call(f, k)) return k;
  const keys = Object.keys(f);
  const direct = keys.find(x => x.includes(k) || k.includes(x));
  if (direct) return direct;
  const lower = k.toLowerCase();
  for (let i = 0; i < FACTION_ALIAS_GROUPS_.length; i++) {
    const g = FACTION_ALIAS_GROUPS_[i];
    if (g.aliases.some(a => lower.includes(a))) {
      const hit = keys.find(x => x.includes(g.marker));
      if (hit) return hit;
    }
  }
  return '';
}

function findMatouFactionKey_(factionsObj) {
  return Object.keys(factionsObj || {}).find(k => (k.includes('間桐') || k.includes('黑櫻')) && k !== ZOUKEN_FACTION_KEY_) || '';
}

function findRyuudouFactionKey_(factionsObj) {
  const f = factionsObj || {};
  if (Object.prototype.hasOwnProperty.call(f, RYUUDOU_FACTION_KEY_)) return RYUUDOU_FACTION_KEY_;
  return Object.keys(f).find(k => k.includes('柳洞寺')) || '';
}

// 柳洞寺兩位從者的個別退場追蹤＋真Assassin（咒腕哈桑）觸發
// 觸發條件：美狄亞或小次郎任一退場，且間桐陣營仍未覆滅 → 新增獨立的「臟硯組 (真Assassin陣營)」
function updateRyuudouRoute_(meta, factionsObj, servantsOut, capturedId, presentIds) {
  const f = Object.assign({}, factionsObj || {});
  const flags = Object.assign({ medeaOut: false, kojirouOut: false, trueAssassin: 'NONE' }, meta.routeFlags || {});
  const outSet = new Set((Array.isArray(servantsOut) ? servantsOut : []).map(x => String(x || '').trim().toLowerCase()));
  const cap = String(capturedId || '').trim().toLowerCase();
  if (cap) outSet.add(cap);
  const present = presentIds instanceof Set ? presentIds : new Set();
  const reports = [];

  const ryuKey = findRyuudouFactionKey_(f);
  const ryuText = ryuKey ? String(f[ryuKey] || '') : '';

  if (outSet.has('caster')) flags.medeaOut = true;
  if (outSet.has('assassin')) flags.kojirouOut = true;
  if (ryuKey && isCapturedOrDefeatedStatusText_(ryuText)) {
    flags.medeaOut = true;
    flags.kojirouOut = true;
  }
  if (/(美狄亞|Caster|C媽)[^，。；;]{0,10}(退場|陣亡|消滅|消散|擊敗|敗退|戰敗|收服|脫落)/i.test(ryuText)) flags.medeaOut = true;
  if (/(小次郎|佐佐木|(?<!真)Assassin)[^，。；;]{0,10}(退場|陣亡|消滅|消散|擊敗|敗退|戰敗|收服|脫落|取代)/i.test(ryuText)) flags.kojirouOut = true;

  // 收服其中一位時，柳洞寺組不整組改為「歸屬第8組」；兩位都離開才算整組結束
  if (ryuKey && !isCapturedOrDefeatedStatusText_(ryuText) && !isAllianceStatusText_(ryuText)) {
    if (cap === 'caster' && !flags.kojirouOut) {
      f[ryuKey] = '存活・Caster美狄亞已轉投第8組 (山門僅剩Assassin小次郎鎮守)';
    } else if (cap === 'assassin' && !flags.medeaOut) {
      f[ryuKey] = '存活・Assassin小次郎已轉投第8組 (Caster美狄亞孤守柳洞寺)';
    } else if (flags.medeaOut && flags.kojirouOut) {
      f[ryuKey] = (cap === 'caster' || cap === 'assassin')
        ? '已歸屬第8組・原御主已退場 (柳洞寺兩騎皆已離開)'
        : '已淘汰 (美狄亞與小次郎皆已退場)';
    }
  }

  const matouKey = findMatouFactionKey_(f);
  const matouActive = Boolean(matouKey) && !isCapturedOrDefeatedStatusText_(String(f[matouKey] || ''));
  const zoukenExists = Object.prototype.hasOwnProperty.call(f, ZOUKEN_FACTION_KEY_);
  const forcedByStory = present.has('hassan');

  if (flags.trueAssassin === 'NONE' && !zoukenExists && ((matouActive && (flags.medeaOut || flags.kojirouOut)) || forcedByStory)) {
    flags.trueAssassin = 'ACTIVE';
    flags.kojirouOut = true;
    f[ZOUKEN_FACTION_KEY_] = '存活 (潛伏暗殺)・間桐臟硯以小次郎殘骸為媒介召喚的真Assassin・咒腕的哈桑';
    const curRyu = ryuKey ? String(f[ryuKey] || '') : '';
    if (ryuKey && !isCapturedOrDefeatedStatusText_(curRyu) && !isAllianceStatusText_(curRyu)) {
      f[ryuKey] = flags.medeaOut
        ? '已淘汰 (美狄亞與小次郎皆已退場，山門遭真Assassin佔據)'
        : '存活・Caster美狄亞孤守柳洞寺 (山門小次郎已被真Assassin從內側撕裂取代)';
    }
    reports.push('【異變】圓藏山山門傳出骨骼碎裂般的怪聲，有人目擊戴著白骨面具、手臂異常細長的黑影在石階間一閃而逝……');
  }

  if (zoukenExists || flags.trueAssassin === 'ACTIVE') {
    const zText = String(f[ZOUKEN_FACTION_KEY_] || '');
    if (cap === 'hassan' && !isCapturedOrDefeatedStatusText_(zText)) {
      f[ZOUKEN_FACTION_KEY_] = '已歸屬第8組・原御主已退場 (咒腕哈桑由玩家接手指揮)';
    }
    if (outSet.has('hassan') && !isCapturedOrDefeatedStatusText_(String(f[ZOUKEN_FACTION_KEY_] || ''))) {
      f[ZOUKEN_FACTION_KEY_] = '已淘汰 (咒腕哈桑已退場)';
    }
    if (isCapturedOrDefeatedStatusText_(String(f[ZOUKEN_FACTION_KEY_] || ''))) {
      flags.trueAssassin = 'DEFEATED';
    }
  }

  meta.routeFlags = flags;
  return { factions: f, report: reports.join(' ') };
}

// 重要事件清單：移除已了結的、加入新的、去重，最多保留 MAX_KEY_EVENTS 條（超過時捨棄最舊的）
function updateKeyEvents_(current, addList, resolveList, playerName) {
  let list = Array.isArray(current) ? current.map(x => String(x || '').trim()).filter(Boolean) : [];
  const resolves = (Array.isArray(resolveList) ? resolveList : []).map(x => String(x || '').trim()).filter(Boolean);
  if (resolves.length > 0) {
    list = list.filter(e => !resolves.some(r => e === r || (r.length >= 6 && (e.includes(r) || r.includes(e)))));
  }
  (Array.isArray(addList) ? addList : []).forEach(x => {
    const t = cleanAwkwardMasterTitle_(String(x || '').trim(), playerName).slice(0, 60);
    if (t && !list.some(e => e === t || e.includes(t) || t.includes(e))) list.push(t);
  });
  if (list.length > MAX_KEY_EVENTS) list = list.slice(list.length - MAX_KEY_EVENTS);
  return list;
}

function describeRyuudouRoute_(meta) {
  const fl = Object.assign({ medeaOut: false, kojirouOut: false, trueAssassin: 'NONE' }, (meta && meta.routeFlags) || {});
  const ta = fl.trueAssassin === 'ACTIVE' ? '已現身並潛伏（臟硯組，`hassan`）' : (fl.trueAssassin === 'DEFEATED' ? '已退場' : '尚未出現');
  return `【柳洞寺路線】Caster美狄亞：${fl.medeaOut ? '已退場' : '仍在'} ｜ Assassin小次郎：${fl.kojirouOut ? '已退場' : '仍在'} ｜ 真Assassin咒腕哈桑：${ta}`;
}

// 僅在「真正收服」某英靈時呼叫：把對應原陣營改為歸屬第8組
function syncCapturedServantFaction_(factionsObj, servantId, servantClass) {
  const updated = Object.assign({}, factionsObj || {});
  const cls = String(servantClass || '').trim().toLowerCase();
  const sid = String(servantId || '').trim().toLowerCase();

  if (!cls && !sid) return updated;
  if (sid === 'lancer' || cls === 'lancer') {
    return updated;
  }
  // 柳洞寺兩騎與哈桑由 updateRyuudouRoute_ 個別處理
  if (sid === 'caster' || sid === 'assassin' || sid === 'hassan') {
    return updated;
  }

  Object.keys(updated).forEach(facName => {
    const fn = String(facName || '').toLowerCase();
    const matchClass = Boolean(cls) && fn.includes(cls);
    const matchId = Boolean(sid) && fn.includes(sid);
    if (matchClass || matchId) {
      const cur = String(updated[facName] || '');
      if (!isCapturedOrDefeatedStatusText_(cur) && !isAllianceStatusText_(cur)) {
        updated[facName] = '已歸屬第8組・原御主已退場 (由玩家接手指揮，非獨立敵對陣營)';
      }
    }
  });

  return updated;
}

// 自動把試算表 Factions_Relations 升級為完整 7 組（＋玩家第 8 組＝共 8 組），並將 saber_alter 可召喚設為 FALSE
function ensureFactionsAndPoolUpgraded_(ss) {
  const facSheet = ss.getSheetByName('Factions_Relations');
  if (facSheet) {
    const fData = facSheet.getDataRange().getValues();
    const existingNames = new Set();
    for (let i = 1; i < fData.length; i++) {
      if (fData[i][0]) existingNames.add(String(fData[i][0]).trim());
    }
    const missingRows = CANONICAL_7_FACTIONS_.filter(r => !existingNames.has(r[0]));
    if (missingRows.length > 0) {
      facSheet.getRange(facSheet.getLastRow() + 1, 1, missingRows.length, 6).setValues(missingRows);
    }
  }

  const saveSheetH = ss.getSheetByName('Players_Save');
  if (saveSheetH && saveSheetH.getLastColumn() >= 32) {
    const headerFixes = {
      6: '成人模式 (TRUE=允許裸露/NSFW圖)',
      15: '御主HP (未使用・保留)',
      21: '主從者HP (未使用・保留)',
      22: '主從者好感度 (0-100)',
      27: '副從者HP (未使用・保留)',
      28: '副從者NP (未使用・保留)',
      32: '遊戲狀態meta JSON (勝敗/背包/手機/回合數/路線/重要事件)'
    };
    Object.keys(headerFixes).forEach(col => saveSheetH.getRange(1, Number(col)).setValue(headerFixes[col]));
    const lastSaveRow = saveSheetH.getLastRow();
    if (lastSaveRow >= 2 && PropertiesService.getScriptProperties().getProperty('FATE_ADULT_DEFAULT_APPLIED') !== 'TRUE') {
      const fCol = saveSheetH.getRange(2, 6, lastSaveRow - 1, 1);
      fCol.setValues(fCol.getValues().map(() => ['TRUE']));
      PropertiesService.getScriptProperties().setProperty('FATE_ADULT_DEFAULT_APPLIED', 'TRUE');
    }
  }

  const charSheet = ss.getSheetByName('Char_Appearance');
  if (charSheet) {
    const cLast = charSheet.getLastRow();
    if (cLast >= 2) {
      const cData = charSheet.getRange(2, 1, cLast - 1, 7).getValues();
      let dirty = false;
      for (let i = 0; i < cData.length; i++) {
        if (String(cData[i][0]).trim() === 'saber_alter' && cData[i][6] !== false && String(cData[i][6]).toUpperCase() !== 'FALSE') {
          cData[i][6] = false;
          dirty = true;
        }
      }
      if (dirty) {
        charSheet.getRange(2, 1, cLast - 1, 7).setValues(cData);
      }
      if (!cData.some(r => String(r[0]).trim() === HASSAN_CHAR_ROW_[0])) {
        charSheet.getRange(charSheet.getLastRow() + 1, 1, 1, 7).setValues([HASSAN_CHAR_ROW_]);
      }
    }
  }
  SpreadsheetApp.flush();
}

// 只有 SCHEMA_VERSION_ 變動時才執行試算表升級（補陣營、補角色、補世界書），平常只讀一個指令碼屬性
function ensureSchemaUpgraded_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FATE_SCHEMA_VERSION') === SCHEMA_VERSION_) return;
  // 呼叫端多半已持有 ScriptLock；升級內容只會「補缺少的列」，重複執行也安全
  ensureFateLorebookUpgraded_(ss);
  ensureFactionsAndPoolUpgraded_(ss);
  props.setProperty('FATE_SCHEMA_VERSION', SCHEMA_VERSION_);
  clearFateConfigCache();
}

// ==================== 設定類分頁快取（角色／世界書／陣營） ====================

let CHAR_DB_MEMO_ = null;
let LORE_ROWS_MEMO_ = null;
let DEFAULT_FACTIONS_MEMO_ = null;

function readConfigCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeConfigCache_(key, value) {
  try {
    const s = JSON.stringify(value);
    if (s.length < 95000) CacheService.getScriptCache().put(key, s, CONFIG_CACHE_SECONDS_);
  } catch (e) {
    // 快取失敗不影響遊戲，下次會直接讀試算表
  }
}

// 手動修改角色／世界書／陣營分頁後，可在 GAS 編輯器執行這個函式立刻套用（onEdit 也會自動呼叫）
function clearFateConfigCache() {
  CHAR_DB_MEMO_ = null;
  LORE_ROWS_MEMO_ = null;
  DEFAULT_FACTIONS_MEMO_ = null;
  try {
    CacheService.getScriptCache().removeAll(CONFIG_CACHE_KEYS_);
  } catch (e) {}
}

// 簡易觸發器：在試算表中手動編輯設定類分頁時，自動清除快取
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    if (CONFIG_SHEET_NAMES_.indexOf(name) !== -1) clearFateConfigCache();
  } catch (err) {}
}

function ensureFateLorebookUpgraded_(ss) {
  const sheet = ss.getSheetByName('Lorebook');
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const existingKeys = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) existingKeys.add(String(data[i][0]).trim());
  }

  const canonicalEntries = [
    ['靈脈,大源,柳洞寺,遠坂邸,魔力回復,吸取', '世界規則', 8, '冬木市的主要靈脈節點為「柳洞寺（圓藏山）」與「遠坂邸」。靈脈不會產出礦石，而是蘊含高濃度的自然魔力「大源（Mana）」。處於大靈脈據點時，隨時間推進可大幅吸收大源回復 MP（+35 MP），並適合進行高消耗儀式；都市區（廢棄洋館、冬木大橋、新都）大源稀薄，僅能微量回復（+10 MP）。'],
    ['寶石,結晶,灌注,儲存魔力,遠坂,媒介', '禮裝煉成', 7, '正統寶石魔術（如遠坂家秘傳）是將魔術師平日溢出的魔力壓縮灌注進天然寶石媒介中，製成「魔力寶石」。製作需在工房消耗自身 MP 與時間（AP）把魔力存進石頭裡（一階結晶(小)耗 1 AP + 40 MP，使用回復 +35 MP；二階寶石(中)耗 2 AP + 70 MP，使用回復 +65 MP）。野生環境不會掉落已充魔的寶石，僅能從遠坂邸工房奪取或自行灌注。'],
    ['黑鍵,聖骸布,教會,洗禮,代行者', '教會禮裝', 7, '「黑鍵」與「聖骸布」為聖堂教會代行者專用禮裝，僅能於聖堂教會取得或由代行者出身自帶。黑鍵為投擲用概念武裝，可有效殺傷敵方魔術師與使魔，但對正規英靈本體無法造成致死傷害；聖骸布可用於壓制魔力暴走或遮蔽氣息。'],
    ['起源彈,新都,現代,禮裝,干擾,古董', '現代禮裝', 7, '模仿衛宮切嗣「起源彈」概念製作的二階禮裝（需於新都商業區購得現代媒介，並在工房耗 2 AP + 40 MP 煉成，要求魔術迴路 ≥ C）。命中敵方魔術師可打亂其迴路、封鎖施法 1 回合（消耗品），但對已受肉的英靈完全無效。'],
    ['偽臣之書,副契約,收服,卷軸,間桐,慎二', '契約禮裝', 8, '「偽臣之書」為間桐家仿造令咒術式製作的三階契約禮裝（可從間桐慎二處奪取，或由魔術迴路 ≥ B 者耗 2 AP + 60 MP 煉成）。僅能在「敵方從者失去原御主」或「敵方從者重傷瀕死、失去抵抗能力」時使用，藉此建立副從者契約；對滿狀態敵方從者或人類（間桐櫻、遠坂凜）使用一律無效。'],
    ['防禦禮裝,保命,結界,護符,抵銷,愛因茲貝倫', '防禦禮裝', 8, '「對魔術防禦禮裝（保命符）」為三階工房大禮裝（需魔術迴路 ≥ B，耗稀有戰利品素材 + 2 AP + 60 MP 煉成，全背包限持 1 件）。屬於一次性被動保命結界，當御主遭遇原本會導致當場死亡（FATAL_DEATH）的致命攻擊時，禮裝會自動碎裂代受過，改寫為重傷逃生。'],
    ['狂戰士,Berserker,海克力斯,使魔,氣息遮斷,魔力放出', '型月生態', 8, '在第五次聖杯戰爭中，Berserker 陣營是單一狂化英靈（非群體獵犬），其狂化會剝奪理性換取基礎能力值提升，且缺乏靈體化或精細魔術戰術；使魔（Familiar）多由魔術師或 Caster 驅使，真名看破與氣息遮斷、魔力放出、結界魔術等皆須嚴格符合型月設定。'],
    ['英靈位階,從者,御主,神秘,羈絆,信賴,契約', '從者與御主', 8, '英靈是凝聚傳說與神秘的靈體／怪異，與人類御主存在明顯的位階與規格落差，但互動以自然演進為主。從者與御主的羈絆會隨並肩作戰或坦誠而加深，揮霍令咒或作死則會降溫，並體現各自性格。'],
    ['好感,羈絆,補魔,魔力交換,色色,親密,騷擾', '羈絆與分寸', 8, '「補魔」與「色色」分開處理：好感未滿 80 時單純補魔可走一般接觸或魔力交換，不會因此被打死；好感未滿 80 硬要色色會先被拒絕或警告並扣好感，持續騷擾才加重扣好感或反制，極端失控才致死；80 以上解鎖色色，敘事與畫面自然演進。'],
    ['控制權,自主意志,玩家主體,不能代控,令咒', '角色控制邊界', 8, '玩家控制御主自身的行動與發言，不替玩家寫出未輸入的後續行動，也不替從者、NPC 或敵對陣營預設行動，讓各方依性格與情境自然互動。'],
    ['戰鬥勝負,交戰,靈基傷勢,撤退,淘汰', '戰鬥結算', 8, '御主的肉身傷勢與從者的靈基狀態各自獨立結算。交戰必須根據戰術、陣營特性與實際行動分出實質勝負或明確結果（如一方負傷／靈基受損／靈核重創／被迫撤退／陣營淘汰），不可只打嘴砲或互砍卻沒人受傷、沒人退場、只推進時間。'],
    ['能力值鎖定,鍛鍊,六維等階,禁止提升', '能力規則', 9, '御主的六維能力值（魔術迴路、近戰體術、隱藏氣息、幸運）與從者參數一經創角設定即完全固定鎖定，玩家與 AI 皆禁止透過鍛鍊或任何方式變動能力值；鍛鍊或日常切磋僅作為劇情與互動描寫，不改動任何能力等階。'],
    ['七組狀態,交戰連貫,陣營機制,延伸後果,洗澡', '陣營與戰局', 9, '推演前必須先檢視七組陣營狀態與當前是否處於交戰：已淘汰或重傷休整的陣營不得無故滿血突襲；若正與敵對陣營交戰，敵人就在眼前，不可突然跑去洗澡或鍛鍊，不合時宜的行動會有相應後果，交戰也需帶出該陣營的特殊機制與後續連鎖後果。'],
    ['在場反應,難度基調,搞笑鬧劇,無限制,鐵血', '互動與基調', 9, '所有在場人物（從者、對手、在場角色）對玩家的任何動作都必須有真實反應，不能無視或神隱；同時依所選基調（搞笑鬧劇輕鬆向／符合常理／無限制／鐵血嚴重戰場風）調整反應味道與後果輕重。'],
    ['第8組獨立,同盟陣營,不頂替,陣營歸屬', '陣營與同盟', 10, '玩家是正規七組之外獨立參戰的第8組，不頂替其他陣營或英靈（即便職階相同也只是不同英靈）；若與某陣營結為同盟，雙方彼此照應、不內鬥，也不會在後台莫名被視為敵對陣營；只有實際擊敗並收服該陣營從者時，原陣營才改為歸屬第8組。'],
    ['固定御主,我方在場,不神隱', '固定角色', 10, '「我（御主 `player_master`）」是固定核心人物，只要不是純粹兩位從者正面交鋒，每次出圖與劇情都必須確保御主本人（`player_master`）在場，不得擅自把御主弄不見。'],
    ['真Assassin,咒腕,哈桑,臟硯,山門,小次郎,美狄亞', '隱藏路線', 8, '柳洞寺組由 Caster 美狄亞與山門守衛 Assassin 佐佐木小次郎組成。只要兩人其中一位退場、且間桐陣營仍在，間桐臟硯就會以小次郎的殘骸為媒介召喚「真Assassin・咒腕的哈桑（`hassan`）」，成為獨立的「臟硯組 (真Assassin陣營)」。真Assassin 擅長氣息遮斷與暗殺，寶具「妄想心音（Zabaniya）」以咒腕複製並捏碎目標心臟，對御主極度致命。']
  ];

  const toAppend = [];
  canonicalEntries.forEach(entry => {
    if (!existingKeys.has(entry[0])) {
      toAppend.push(entry);
    }
  });

  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 4).setValues(toAppend);
    SpreadsheetApp.flush();
  }
}

// ==================== API 金鑰讀取 ====================

function getOpenRouterKey_() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('OAPIKEY') || props.getProperty('OPENROUTER_API_KEY');
  if (!key) throw new Error('找不到 OAPIKEY，請至 GAS「專案設定 -> 指令碼屬性」新增 OAPIKEY。');
  return key.trim();
}

function getNovelAIKey_() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('NAI_API_KEY') || props.getProperty('NAIKEY') || props.getProperty('NOVELAI_API_KEY') || props.getProperty('NAPIKEY');
  if (!key) throw new Error('找不到 NovelAI API Key，請確認指令碼屬性中有設定 NAI_API_KEY 或 NAIKEY。');
  return key.trim();
}

function callGeminiLite_(systemPrompt, userMessage, temperature, maxTokens, jsonMode) {
  const apiKey = getOpenRouterKey_();
  return callOpenRouterChat_(apiKey, GEMINI_MODEL, systemPrompt, userMessage, temperature, maxTokens, jsonMode);
}

// JSON 模式專用：容錯解析，失敗時自動以更低溫度與更大 token 上限重試一次
function callGeminiLiteJson_(systemPrompt, userMessage, temperature, maxTokens) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const temp = attempt === 0 ? temperature : Math.max(0.2, temperature - 0.25);
      const tokens = attempt === 0 ? maxTokens : Math.round(maxTokens * 1.4);
      const res = callGeminiLite_(systemPrompt, userMessage, temp, tokens, true);
      return parseJsonLoose_(res.text);
    } catch (e) {
      lastErr = e;
      if (attempt === 0) Utilities.sleep(800);
    }
  }
  throw new Error('AI 回傳內容無法解析或暫時無回應，請再試一次。（' + (lastErr && lastErr.message ? lastErr.message : String(lastErr)) + '）');
}

// ==================== 地點識別、動態戰況與靈脈大源計算 ====================

// 只在文字中確實出現已知地標時才回傳結果，否則回傳 null（供「維持原地」判斷）
function matchFuyukiLocation_(rawLocationText) {
  const text = String(rawLocationText || '').trim();
  if (!text) return null;
  const keys = Object.keys(FUYUKI_LOCATIONS_);
  for (let i = 0; i < keys.length; i++) {
    const locObj = FUYUKI_LOCATIONS_[keys[i]];
    if (text.includes(locObj.fullName) || locObj.aliases.some(alias => text.includes(alias))) {
      return { key: keys[i], info: locObj };
    }
  }
  return null;
}

function resolveFuyukiLocation_(rawLocationText) {
  const text = String(rawLocationText || '').trim();
  const keys = Object.keys(FUYUKI_LOCATIONS_);
  for (let i = 0; i < keys.length; i++) {
    const locObj = FUYUKI_LOCATIONS_[keys[i]];
    if (locObj.aliases.some(alias => text.includes(alias))) {
      return { key: keys[i], info: locObj };
    }
  }
  return { key: '廢棄洋館', info: FUYUKI_LOCATIONS_['廢棄洋館'] };
}

function computeDynamicLocationInfo_(locKey, baseInfo, factionsObj, mapHotspot, gameMode, customNotesObj) {
  const info = Object.assign({}, baseInfo);
  if (gameMode !== 'WAR') {
    info.danger = '安全 (無戰爭日常結界)';
    if (customNotesObj && customNotesObj[locKey]) {
      info.desc = String(customNotesObj[locKey]).trim();
    }
    return info;
  }

  const f = factionsObj || {};
  if (locKey === '衛宮邸' && isDefeatedOrCapturedFaction_(f, 'Saber')) {
    info.danger = '🟢 低 (Saber陣營已覆滅或歸屬第8組・無敵對駐守)';
    info.desc = '原本由衛宮組駐守的日式大宅，隨著原陣營覆滅或歸屬第8組，已不再有敵對陣營盤踞。';
  } else if (locKey === '遠坂邸' && isDefeatedOrCapturedFaction_(f, 'Archer')) {
    info.danger = '🟢 低 (Archer陣營已覆滅或歸屬第8組・可搜刮寶石工房)';
    info.desc = '失去原敵對陣營守護的遠坂魔術工房，地下室仍殘留著部分未使用的魔力寶石與魔術典籍。';
  } else if (locKey === '柳洞寺' && isDefeatedOrCapturedFaction_(f, '柳洞寺')) {
    info.danger = '🟢 低 (柳洞寺陣營已覆滅或歸屬第8組・可安全汲取大源)';
    info.desc = '原本阻擋外敵的結界已經消散或由我方掌控，整座圓藏山大靈脈現在可以汲取龐大魔力。';
  } else if (locKey === '愛因茲貝倫森林' && isDefeatedOrCapturedFaction_(f, 'Berserker')) {
    info.danger = '🟢 低 (Berserker陣營已覆滅或歸屬第8組・無敵對領地)';
    info.desc = '森林古堡內已無原本敵對陣營威脅，遺留著愛因茲貝倫家的高階煉金術與禮裝戰利品。';
  }

  const churchKey = Object.keys(f).find(k => k.includes('教會') || k.includes('言峰'));
  if (locKey === '聖堂教會' && churchKey && /吉爾伽美什|金閃閃|Gilgamesh/i.test(String(f[churchKey] || '')) && !isDefeatedOrCapturedFaction_(f, '教會')) {
    info.danger = '🔥 極高 (英雄王吉爾伽美什鎮守教會・極度危險)';
  }
  const matouKey = Object.keys(f).find(k => k.includes('間桐') || k.includes('黑櫻'));
  if ((locKey === '新都商業區' || locKey === '廢棄洋館') && matouKey && /黑櫻|黑影/.test(String(f[matouKey] || '')) && !isDefeatedOrCapturedFaction_(f, '間桐')) {
    info.danger = '🖤 極高 (黑櫻與聖杯黑影出沒・謹防吞噬)';
  }
  const zoukenText = Object.prototype.hasOwnProperty.call(f, ZOUKEN_FACTION_KEY_) ? String(f[ZOUKEN_FACTION_KEY_] || '') : '';
  if (zoukenText && !isCapturedOrDefeatedStatusText_(zoukenText) && !isAllianceStatusText_(zoukenText)) {
    if (locKey === '柳洞寺') {
      info.danger = '🗡️ 極高 (間桐臟硯與真Assassin・咒腕哈桑潛伏山門)';
    } else if (locKey === '新都商業區') {
      info.danger = '🗡️ 極高 (真Assassin・咒腕哈桑在暗巷狩獵魔術師)';
    }
  }

  if (customNotesObj && customNotesObj[locKey]) {
    info.desc = String(customNotesObj[locKey]).trim();
  }

  if (mapHotspot === locKey) {
    info.danger = '🔥 極高 (偵測到陣營交鋒波動！)';
  }

  return info;
}

// ==================== 敵對陣營後台自動廝殺演算法 (Off-screen War Sim) ====================

function simulateOffscreenFactionWar_(factionsObj, day, period, ownedServantIds) {
  const ownedSet = new Set((Array.isArray(ownedServantIds) ? ownedServantIds : []).map(x => String(x).toLowerCase()));
  const aliveFactions = Object.keys(factionsObj).filter(name => {
    const fn = String(name || '').toLowerCase();
    const st = String(factionsObj[name] || '');
    if (isCapturedOrDefeatedStatusText_(st) || isAllianceStatusText_(st)) return false;
    for (const oid of ownedSet) {
      if (oid && oid !== 'lancer' && fn.includes(oid)) return false;
    }
    return true;
  });

  if (aliveFactions.length <= 1) {
    return { report: '', hotspotKey: '', updatedFactions: factionsObj };
  }

  // 約 45% 只有風聲（魔力動向），其餘才會真的交手
  if (Math.random() > 0.55) {
    const randomHotspot = ['冬木大橋', '柳洞寺', '新都商業區', '愛因茲貝倫森林'][Math.floor(Math.random() * 4)];
    return {
      report: `【遠方魔力動向】${randomHotspot}一帶偵測到魔術使魔與魔力波動。`,
      hotspotKey: randomHotspot,
      updatedFactions: factionsObj
    };
  }

  const idxA = Math.floor(Math.random() * aliveFactions.length);
  let idxB = Math.floor(Math.random() * aliveFactions.length);
  if (idxB === idxA) idxB = (idxA + 1) % aliveFactions.length;

  const facA = aliveFactions[idxA];
  const facB = aliveFactions[idxB];
  const battleSite = ['冬木大橋', '柳洞寺', '新都商業區', '衛宮邸', '遠坂邸', '愛因茲貝倫森林'][Math.floor(Math.random() * 6)];

  // 淘汰機率下調，且至少要剩 4 組以上才可能被後台淘汰，避免七組被後台打光
  const isElimination = (Math.random() < 0.12 && aliveFactions.length > 3);
  const updated = Object.assign({}, factionsObj);
  let report = '';

  if (isElimination) {
    updated[facB] = `已淘汰 (於 Day ${day} ${period} 在${battleSite}遭 ${facA} 擊潰)`;
    updated[facA] = `交戰勝出・戒備中 (於${battleSite}擊敗 ${facB})`;
    report = `【戰況速報】在${battleSite}爆發激烈寶具衝突！${facA} 徹底擊潰並淘汰了 ${facB}！`;
  } else {
    updated[facA] = `交戰負傷・休整中 (曾於${battleSite}與 ${facB} 激戰)`;
    updated[facB] = `交戰負傷・休整中 (曾於${battleSite}與 ${facA} 激戰)`;
    report = `【戰況速報】${facA} 與 ${facB} 在${battleSite}深夜交鋒，雙方各自負傷後撤退！`;
  }

  return {
    report: report,
    hotspotKey: battleSite,
    updatedFactions: updated
  };
}

// ==================== 小說級自動分段、說話者標註與稱呼整理 ====================

function cleanAwkwardMasterTitle_(text, playerName) {
  let s = String(text || '');
  const pName = String(playerName || '').trim() || '御主';
  s = s.replace(/第\s*8\s*組\s*(?:異常|異端)?\s*御主/g, pName);
  s = s.replace(/異常(?:的)?御主/g, pName);
  s = s.replace(/異端(?:的)?御主/g, '御主');
  return s;
}

function stripRepeatedPreviousEnding_(storyText, prevStoryText) {
  let clean = String(storyText || '').trim();
  const prev = String(prevStoryText || '').trim();
  if (!clean || !prev) return clean;

  const prevParas = prev.split(/\n\n+/).map(x => x.trim()).filter(Boolean);
  const lastPrevPara = prevParas.length > 0 ? prevParas[prevParas.length - 1] : '';
  const prevSentences = prev.split(/(?<=[。！？…])/).map(x => x.trim()).filter(Boolean);
  const lastTwoPrevSentences = prevSentences.slice(-2).join('');

  const curParas = clean.split(/\n\n+/);
  if (curParas.length > 1) {
    const firstPara = curParas[0].trim();
    if (
      (lastPrevPara && firstPara === lastPrevPara) ||
      (lastTwoPrevSentences && lastTwoPrevSentences.length >= 12 && firstPara.includes(lastTwoPrevSentences))
    ) {
      curParas.shift();
      clean = curParas.join('\n\n').trim();
    }
  }

  return clean;
}

function formatNovelStoryText_(rawStory, contextNames, prevStoryText, playerName) {
  let text = String(rawStory || '').trim();
  if (!text) return '';

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  text = text.replace(/([。！？…])\s*「/g, '$1\n\n「');
  text = text.replace(/」\s*([^，。！？、\n」])/g, '」\n\n$1');

  if (!text.includes('\n\n')) {
    const sentences = text.split(/(?<=[。！？])/);
    const chunks = [];
    let buf = '';
    let count = 0;
    sentences.forEach(s => {
      if (!s.trim()) return;
      buf += s;
      count++;
      if (count >= 2 && buf.length >= 65) {
        chunks.push(buf.trim());
        buf = '';
        count = 0;
      }
    });
    if (buf.trim()) chunks.push(buf.trim());
    text = chunks.join('\n\n');
  }

  text = stripRepeatedPreviousEnding_(text, prevStoryText);
  text = cleanAwkwardMasterTitle_(text, playerName);

  const candidateNames = Array.isArray(contextNames) ? contextNames.filter(Boolean) : [];
  const paragraphs = text.split('\n\n');

  const findNameIn = (str) => {
    for (let i = 0; i < candidateNames.length; i++) {
      if (str && str.includes(candidateNames[i])) return candidateNames[i];
    }
    return '';
  };

  const labeledParagraphs = paragraphs.map((p, idx) => {
    const trimmed = p.trim();
    if (!trimmed) return '';

    if (/^[^「『\n]{1,12}[:：]\s*[「『]/.test(trimmed)) {
      return trimmed;
    }

    if (/^「[^」]+」/.test(trimmed)) {
      const prevText = idx > 0 ? paragraphs[idx - 1] : '';
      const nextText = idx + 1 < paragraphs.length ? paragraphs[idx + 1] : '';

      // 優先看前一段敘述（通常會先交代是誰開口），其次看後一段；找不到就不亂標
      const speaker = findNameIn(prevText) || findNameIn(nextText);
      if (speaker) {
        return `${speaker}：${trimmed}`;
      }
    }

    return trimmed;
  });

  return labeledParagraphs.filter(Boolean).join('\n\n');
}

// ==================== 1. 登入系統 & 生涯戰績讀取 & 清空本輪重啟 ====================

function validatePlayerName_(name) {
  const clean = String(name || '').trim();
  if (!/^[一-龥]{1,5}$/.test(clean)) {
    throw new Error('御主名號必須為「1 到 5 個繁體中文字」（不可含英文、數字或符號）！');
  }
  return clean;
}

function clearPlayerChatLogsByName_(ss, playerName) {
  const chatSheet = ss.getSheetByName('ChatLog');
  if (!chatSheet) return;
  const lastRow = chatSheet.getLastRow();
  if (lastRow < 2) return;
  const vals = chatSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() === playerName) {
      chatSheet.deleteRow(i + 2);
    }
  }
}

function resetCurrentRunKeepCareer(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSchemaUpgraded_(ss);

    const saveSheet = ss.getSheetByName('Players_Save');
    if (!saveSheet) throw new Error('找不到 Players_Save 分頁！');

    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) {
      throw new Error(`找不到御主「${cleanName}」的存檔紀錄，無法清空本輪資料！`);
    }

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const oldMeta = safeJsonParse_(row[31], {});
    const charDb = getCharAppearanceMap_(ss);

    const defaultOutfits = {};
    Object.keys(charDb).forEach(id => {
      defaultOutfits[id] = charDb[id].defaultOutfit;
    });

    const defaultFactions = getDefaultFactionsState_(ss);
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

    const wins = Number(oldMeta.wins) || 0;
    const losses = Number(oldMeta.losses) || 0;

    const resetMeta = {
      status: 'ACTIVE',
      wins: wins,
      losses: losses,
      artStyle: oldMeta.artStyle || 'official',
      gameTone: normalizeGameToneKey_(oldMeta.gameTone),
      wish: '抵達根源，改寫這場扭曲的聖杯儀式',
      masterCondition: '完好無損',
      servantCondition: '靈基穩定',
      servant2Condition: '靈基穩定',
      masterParams: { circuit: 'C', combat: 'C', stealth: 'B', luck: 'D' },
      maxMp: 110,
      inventory: [],
      mapHotspot: '冬木大橋',
      warTicker: '本輪進度已清空，等待重新展開聖杯戰爭。',
      bondLevel: 25,
      turnCount: 0,
      customLocationNotes: {},
      phoneState: {
        forumPosts: buildInitialForumPosts_(1, '深夜'),
        smsThreads: buildInitialSmsThreads_(defaultFactions),
        unreadCount: 1
      }
    };

    row[1] = nowStr;
    row[2] = 'CHAR_CREATION';
    row[3] = 'WAR';
    row[6] = 1;
    row[7] = '深夜';
    row[8] = 3;
    row[9] = 10;
    row[10] = '冬木市・廢棄洋館地下室';
    row[11] = 'girl';
    row[12] = '時鐘塔叛逃魔術師';
    row[13] = '1girl, fujimaru ritsuka (female), orange hair, side ponytail, blue eyes';
    row[14] = 100;
    row[15] = 110;
    row[16] = 3;
    row[17] = '';
    row[18] = '未召喚';
    row[19] = '尚未締結契約';
    row[20] = 1200;
    row[21] = 0;
    row[22] = '筋力:- 耐久:- 敏捷:- 魔力:- 幸運:- 寶具:-';
    row[23] = '';
    row[24] = '';
    row[25] = '';
    row[26] = 0;
    row[27] = 0;
    row[28] = JSON.stringify(defaultOutfits);
    row[29] = JSON.stringify(defaultFactions);
    row[30] = `【本輪已清空・保留生涯戰績：🏆${wins}勝 / 💀${losses}敗】大聖杯的異常波動將你捲入了第五次聖杯戰爭，成為正規七組之外獨立參戰的第 8 組。`;
    row[31] = serializeMeta_(resetMeta);

    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    clearPlayerChatLogsByName_(ss, cleanName);
    SpreadsheetApp.flush();

    const parsedReset = parseSaveRow_(row);
    return {
      status: parsedReset,
      logs: [],
      summonPool: getSummonableServantsList_(charDb),
      mapLocations: parsedReset.dynamicLocations
    };
  } finally {
    lock.releaseLock();
  }
}

function startNewGame(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSchemaUpgraded_(ss);

    const saveSheet = ss.getSheetByName('Players_Save');
    if (!saveSheet) throw new Error('找不到 Players_Save 分頁，請先執行 SetupDB.gs 的 initFateDatabase！');

    if (findPlayerRowIndex_(saveSheet, cleanName) !== -1) {
      throw new Error(`御主名號「${cleanName}」已經存在於聖杯戰爭紀錄中！請直接點擊【讀取世界線】，或換一個新名號。`);
    }

    const charDb = getCharAppearanceMap_(ss);
    const defaultOutfits = {};
    Object.keys(charDb).forEach(id => {
      defaultOutfits[id] = charDb[id].defaultOutfit;
    });

    const defaultFactions = getDefaultFactionsState_(ss);
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

    const initMeta = {
      status: 'ACTIVE',
      wins: 0,
      losses: 0,
      artStyle: 'official',
      gameTone: 'BALANCED',
      wish: '抵達根源，改寫這場扭曲的聖杯儀式',
      masterCondition: '完好無損',
      servantCondition: '靈基穩定',
      servant2Condition: '靈基穩定',
      masterParams: { circuit: 'C', combat: 'C', stealth: 'B', luck: 'D' },
      maxMp: 110,
      inventory: [],
      mapHotspot: '冬木大橋',
      warTicker: '第五次聖杯戰爭剛剛拉開序幕，七組陣營與獨立第 8 組正暗中偵察冬木市靈脈。',
      bondLevel: 25,
      turnCount: 0,
      customLocationNotes: {},
      phoneState: {
        forumPosts: buildInitialForumPosts_(1, '深夜'),
        smsThreads: buildInitialSmsThreads_(defaultFactions),
        unreadCount: 1
      }
    };

    const newRow = [
      cleanName,
      nowStr,
      'CHAR_CREATION',
      'WAR',
      'TRUE',
      'TRUE',
      1,
      '深夜',
      3,
      10,
      '冬木市・廢棄洋館地下室',
      'girl',
      '時鐘塔叛逃魔術師',
      '1girl, fujimaru ritsuka (female), orange hair, side ponytail, blue eyes',
      100,
      110,
      3,
      '',
      '未召喚',
      '尚未締結契約',
      1200,
      0,
      '筋力:- 耐久:- 敏捷:- 魔力:- 幸運:- 寶具:-',
      '',
      '',
      '',
      0,
      0,
      JSON.stringify(defaultOutfits),
      JSON.stringify(defaultFactions),
      '大聖杯的異常波動將你捲入了第五次聖杯戰爭，成為正規七組之外獨立參戰的第 8 組。',
      serializeMeta_(initMeta)
    ];

    saveSheet.appendRow(newRow);
    SpreadsheetApp.flush();

    const parsedNew = parseSaveRow_(newRow);
    return {
      status: parsedNew,
      logs: [],
      summonPool: getSummonableServantsList_(charDb),
      mapLocations: parsedNew.dynamicLocations
    };
  } finally {
    lock.releaseLock();
  }
}

function loadExistingGame(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSchemaUpgraded_(ss);

  const saveSheet = ss.getSheetByName('Players_Save');
  if (!saveSheet) throw new Error('找不到 Players_Save 分頁！');

  const foundIndex = findPlayerRowIndex_(saveSheet, cleanName);
  const foundRow = foundIndex === -1 ? null : saveSheet.getRange(foundIndex, 1, 1, 32).getValues()[0];

  if (!foundRow) {
    throw new Error(`找不到御主「${cleanName}」的存檔紀錄！請確認名稱是否正確，或點擊【開始新紀元】建立新角色。`);
  }

  const charDb = getCharAppearanceMap_(ss);
  const statusObj = parseSaveRow_(foundRow);

  Object.keys(charDb).forEach(id => {
    if (!statusObj.outfits[id]) {
      statusObj.outfits[id] = charDb[id].defaultOutfit;
    }
  });

  const logs = getPlayerChatLogs_(ss, cleanName, 12);

  return {
    status: statusObj,
    logs: logs,
    summonPool: getSummonableServantsList_(charDb),
    mapLocations: statusObj.dynamicLocations
  };
}

function startNextLoopReincarnation(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSchemaUpgraded_(ss);
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const oldMeta = safeJsonParse_(row[31], {});
    const charDb = getCharAppearanceMap_(ss);

    const defaultOutfits = {};
    Object.keys(charDb).forEach(id => {
      defaultOutfits[id] = charDb[id].defaultOutfit;
    });
    const prevOutfits = safeJsonParse_(row[28], {});
    if (prevOutfits['player_master']) defaultOutfits['player_master'] = prevOutfits['player_master'];

    const defaultFactions = getDefaultFactionsState_(ss);
    const nowStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

    const nextMeta = {
      status: 'ACTIVE',
      wins: Number(oldMeta.wins) || 0,
      losses: Number(oldMeta.losses) || 0,
      artStyle: oldMeta.artStyle || 'official',
      gameTone: normalizeGameToneKey_(oldMeta.gameTone),
      wish: oldMeta.wish || '奪得聖杯實現夙願',
      masterCondition: '完好無損',
      servantCondition: '靈基穩定',
      servant2Condition: '靈基穩定',
      masterParams: oldMeta.masterParams || { circuit: 'C', combat: 'C', stealth: 'B', luck: 'D' },
      maxMp: oldMeta.maxMp || 110,
      inventory: [],
      mapHotspot: '冬木大橋',
      warTicker: '新輪迴開啟，冬木市七組陣營重新降臨。',
      bondLevel: 25,
      turnCount: 0,
      routeFlags: { medeaOut: false, kojirouOut: false, trueAssassin: 'NONE' },
      keyEvents: [],
      rumors: [],
      smsContacts: {},
      routeTendency: {},
      activeRoute: '',
      customLocationNotes: {},
      phoneState: {
        forumPosts: buildInitialForumPosts_(1, '深夜'),
        smsThreads: buildInitialSmsThreads_(defaultFactions),
        unreadCount: 1
      }
    };

    row[1] = nowStr;
    row[2] = 'CHAR_CREATION';
    row[6] = 1;
    row[7] = '深夜';
    row[8] = 3;
    row[9] = 10;
    row[10] = '冬木市・廢棄洋館地下室';
    row[14] = 100;
    row[15] = nextMeta.maxMp;
    row[16] = 3;
    row[17] = '';
    row[18] = '未召喚';
    row[19] = '尚未締結契約';
    row[20] = 1200;
    row[21] = 0;
    row[22] = '筋力:- 耐久:- 敏捷:- 魔力:- 幸運:- 寶具:-';
    row[23] = '';
    row[24] = '';
    row[25] = '';
    row[26] = 0;
    row[27] = 0;
    row[28] = JSON.stringify(defaultOutfits);
    row[29] = JSON.stringify(defaultFactions);
    row[30] = `【輪迴重啟（生涯戰績：${nextMeta.wins}勝 ${nextMeta.losses}敗）】大聖杯的時光倒流，你再次站在冬木市廢棄洋館的召喚陣前。`;
    row[31] = serializeMeta_(nextMeta);

    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();

    const parsedNext = parseSaveRow_(row);
    return {
      status: parsedNext,
      logs: [],
      summonPool: getSummonableServantsList_(charDb),
      mapLocations: parsedNext.dynamicLocations
    };
  } finally {
    lock.releaseLock();
  }
}

function savePlayerSettingsOnly(playerName, patch) {
  const cleanName = validatePlayerName_(playerName);
  if (!patch || typeof patch !== 'object') return null;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) return null;

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    if (patch.gameMode) row[3] = (String(patch.gameMode) === 'SANDBOX') ? 'SANDBOX' : 'WAR';
    if (typeof patch.autoImage === 'boolean') row[4] = patch.autoImage ? 'TRUE' : 'FALSE';
    if (typeof patch.adultMode === 'boolean') row[5] = patch.adultMode ? 'TRUE' : 'FALSE';

    const meta = safeJsonParse_(row[31], {});
    if (patch.artStyle && ART_STYLE_PRESETS_[String(patch.artStyle)]) meta.artStyle = String(patch.artStyle);
    if (patch.gameTone) meta.gameTone = normalizeGameToneKey_(patch.gameTone);
    row[31] = serializeMeta_(meta);

    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

function updateCustomLocationDesc(playerName, locKey, customDesc) {
  const cleanName = validatePlayerName_(playerName);
  const key = String(locKey || '').trim();
  if (!FUYUKI_LOCATIONS_[key]) throw new Error('無效的冬木市地標！');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const meta = safeJsonParse_(row[31], {});
    const notes = (meta.customLocationNotes && typeof meta.customLocationNotes === 'object')
      ? Object.assign({}, meta.customLocationNotes)
      : {};

    const cleanDesc = String(customDesc || '').trim().slice(0, 140);
    if (cleanDesc) {
      notes[key] = cleanDesc;
    } else {
      delete notes[key];
    }

    meta.customLocationNotes = notes;
    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

// ==================== 2. 三段式創角、聖杯願望與初始禮裝發放 ====================

function enhanceMasterAppearance(zhDesc, gender, isAdult) {
  const genderTag = gender === 'boy' ? '1boy' : '1girl';
  const systemPrompt = [
    'You are an expert NovelAI Diffusion V5 & Danbooru prompt translator.',
    'Convert the user\'s Traditional Chinese character description into precise English Danbooru tags, separated into core_tags and outfit_tags.',
    'Expand vague Chinese terms into rich, accurate visual tags (e.g., fabric, cut, hair length/style, eye details).',
    'Output strictly valid JSON with keys: "core_tags", "outfit_tags", "advice_zh".',
    `- core_tags: English Danbooru tags starting with "${genderTag}", permanent physical traits ONLY (hair, eyes, body, age; NO clothes, NO style, NO background).`,
    '- outfit_tags: English Danbooru tags for clothing, legwear, footwear, and accessories ONLY. If nude/unclothed is requested, output "nude, completely nude, no clothes".',
    '- advice_zh: 1-2 short, practical Traditional Chinese tips on how to further refine the look.'
  ].join('\n');

  const userMsg = `Gender: ${genderTag}\nAdult Mode: ${isAdult}\nChinese Description: ${zhDesc}`;
  return callGeminiLiteJson_(systemPrompt, userMsg, 0.2, 900);
}

function extractMasterFromImage(base64DataUrl) {
  const apiKey = getOpenRouterKey_();
  const systemPrompt = [
    'You are a NovelAI Diffusion V5 & Danbooru image tagger.',
    'Analyze the character image and output strictly valid JSON with keys:',
    '- "gender": "girl" or "boy"',
    '- "core_tags": English Danbooru tags starting with "1girl" or "1boy" (hair, eyes, body traits ONLY; NO clothes)',
    '- "outfit_tags": English Danbooru tags for clothes, legwear, and accessories ONLY',
    '- "advice_zh": Short Traditional Chinese tip.',
    'NO quality tags, NO art style, NO background tags.'
  ].join('\n');

  const payload = {
    model: GEMINI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract character core traits and outfit tags into JSON.' },
          { type: 'image_url', image_url: { url: base64DataUrl } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 900
  };

  const resp = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey, 'HTTP-Referer': 'https://script.google.com', 'X-Title': 'FATE GAS RPG' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) throw new Error(`圖片視覺提取失敗 (${resp.getResponseCode()})`);
  const json = JSON.parse(resp.getContentText());
  const content = json && json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : '';
  return parseJsonLoose_(content);
}

function previewMasterOutfit(gender, coreTags, outfitTags) {
  const nudeMode = isNudeOutfitTags_(outfitTags);
  const normCore = normalizeCharCoreForNai_(coreTags, gender === 'boy' ? 'boy' : 'girl');
  const safeCore = nudeMode ? stripClothesFromCore_(normCore) : normCore;
  const outfitPart = formatCharacterOutfitPrompt_(outfitTags);
  const charPrompt = [safeCore, outfitPart, nudeMode ? 'bare skin' : 'standing, confident expression'].filter(Boolean).join(', ');
  const scenePrompt = `${gender === 'boy' ? '1boy' : '1girl'}, solo, magic circle background, dimly lit gothic workshop, dramatic rim lighting`;
  return generateNovelAIImageSafe_({
    prompt: scenePrompt,
    artStyle: 'official',
    characters: [{
      prompt: charPrompt,
      uc: nudeMode ? 'multiple views' : 'weapon, armor, multiple views',
      gender: gender === 'boy' ? 'boy' : 'girl',
      x: 0.5,
      y: 0.5
    }],
    width: 832,
    height: 1216,
    autoQuality: true
  });
}

function completeCreationTextOnly(params) {
  const cleanName = validatePlayerName_(params.playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let lockHeld = true;

  let statusObj = null;
  let summonData = null;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSchemaUpgraded_(ss);
    const saveSheet = ss.getSheetByName('Players_Save');
    let rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const charDb = getCharAppearanceMap_(ss);
    const pool = getSummonableServantsList_(charDb);

    let targetServantId = params.servantId;
    if (targetServantId === 'saber_alter') {
      throw new Error('黑 Saber（saber_alter）無法於開局直接召喚，僅能透過櫻線黑泥吞噬原版 Saber 的劇情事件覺醒！');
    }
    if (!targetServantId || targetServantId === 'RANDOM') {
      if (pool.length === 0) throw new Error('目前沒有可召喚的英靈！請檢查 Char_Appearance 的 G 欄「可召喚」設定。');
      targetServantId = pool[Math.floor(Math.random() * pool.length)].id;
    } else if (!pool.some(p => p.id === targetServantId)) {
      throw new Error('指定的英靈不在可召喚名單中！');
    }
    const servantInfo = charDb[targetServantId];
    if (!servantInfo) throw new Error('指定的英靈不存在於資料庫中！');

    const originName = ORIGIN_PRESETS_[params.masterOrigin] ? params.masterOrigin : '時鐘塔叛逃魔術師';
    const originPreset = ORIGIN_PRESETS_[originName];
    const wishText = String(params.masterWish || '').trim() || '奪得大聖杯，改寫一切遺憾';
    const gameMode = (String(params.gameMode) === 'SANDBOX') ? 'SANDBOX' : 'WAR';

    const outfits = safeJsonParse_(row[28], {});
    outfits['player_master'] = params.masterOutfitTags || outfits['player_master'];

    const oldMeta = safeJsonParse_(row[31], {});
    const defaultFactions = getDefaultFactionsState_(ss);
    const starterInv = (gameMode === 'WAR') ? JSON.parse(JSON.stringify(originPreset.starterItems || [])) : [];

    const newMeta = {
      status: 'ACTIVE',
      wins: Number(oldMeta.wins) || 0,
      losses: Number(oldMeta.losses) || 0,
      artStyle: oldMeta.artStyle || 'official',
      gameTone: normalizeGameToneKey_(oldMeta.gameTone),
      wish: wishText,
      masterCondition: '完好無損',
      servantCondition: '靈基穩定',
      servant2Condition: '靈基穩定',
      masterParams: Object.assign({}, originPreset.params),
      maxMp: originPreset.maxMp,
      inventory: starterInv,
      mapHotspot: '冬木大橋',
      warTicker: '第一夜深夜，冬木大橋方向隱約傳來各陣營試探的魔力火花。',
      bondLevel: 25,
      customLocationNotes: {},
      phoneState: {
        forumPosts: buildInitialForumPosts_(1, '深夜'),
        smsThreads: buildInitialSmsThreads_(defaultFactions),
        unreadCount: 1
      }
    };

    row[1] = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
    row[2] = 'WAR_ACTIVE';
    row[3] = gameMode;
    row[11] = params.masterGender === 'boy' ? 'boy' : 'girl';
    row[12] = originName;
    row[13] = params.masterCoreTags || row[13];
    row[15] = originPreset.maxMp;
    row[17] = targetServantId;
    row[28] = JSON.stringify(outfits);

    const systemPrompt = [
      'You are the Game Master of Fate/stay night (5th Holy Grail War - Independent 8th Faction).',
      'The player is an independent 8th faction arriving outside the original 7 factions—do NOT replace or overwrite existing factions or servants.',
      'FORMATTING RULE: Separate `story` into 3-4 distinct paragraphs using `\\n\\n`, and prefix every dialogue line (`「...」`) with who is speaking (e.g. `角色名：「...」` or `' + cleanName + '：「...」`) on its own separate line!',
      'Output strictly valid JSON with keys:',
      '- "story": Immersive Traditional Chinese narrative (250-350 words) describing the summoning circle glowing, the Servant appearing, and reacting to the Master\'s Grail Wish, with speaker names before dialogue.',
      '- "servant_class": Official Fate class (e.g. Lancer, Saber, Archer, Caster, Ruler, Avenger).',
      '- "servant_name": Full Traditional Chinese name of the Servant.',
      '- "servant_params": String formatted like "筋力:B 耐久:C 敏捷:A 魔力:B 幸運:D 寶具:A+".',
      '- "servant_action_en": Concise English visual pose & expression tags for the Servant during summoning (NO text/speech bubbles, NO hair/eyes/clothes).',
      '- "master_action_en": Concise English visual pose & expression tags for the Master reacting to the summoning (NO text/speech bubbles, NO hair/eyes/clothes).',
      '- "scene_env_en": Concise English background/lighting tags ONLY (NO text/speech bubbles, NO character appearance).'
    ].join('\n');

    const userMsg = `Master Name: ${cleanName}\nOrigin: ${originName} (${originPreset.desc})\nHoly Grail Wish: ${wishText}\nMode: ${row[3]}\nSummoned Servant ID: ${targetServantId} (${servantInfo.triggers})\nRelic/Catalyst used: ${params.relicNote || '大聖杯共鳴'}`;

    lock.releaseLock();
    lockHeld = false;

    summonData = callGeminiLiteJson_(systemPrompt, userMsg, 0.7, 2000);

    lock.waitLock(20000);
    lockHeld = true;
    rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    const phaseNow = String(saveSheet.getRange(rowIndex, 3).getValue());
    if (phaseNow !== 'CHAR_CREATION') {
      throw new Error('這個御主剛剛已在另一個視窗完成召喚，請重新【讀取世界線】。');
    }
    const sName = summonData.servant_name || servantInfo.triggers.split(',')[0];
    const formattedStory = formatNovelStoryText_(summonData.story, [sName, cleanName], '', cleanName);

    row[18] = summonData.servant_class || 'Lancer';
    row[19] = sName;
    row[20] = 1200;
    row[21] = 25;
    row[22] = summonData.servant_params || '筋力:A 耐久:B 敏捷:A 魔力:B 幸運:C 寶具:A+';
    row[30] = `第1夜，出身「${originName}」的御主「${cleanName}」懷抱願望【${wishText}】，以獨立第8組身分召喚了【${row[18]}・${row[19]}】參戰。`;

    newMeta.turnCount = 1;
    row[31] = serializeMeta_(newMeta);

    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    statusObj = parseSaveRow_(row);

    const imgPayload = buildNaiPayloadFromScene_(
      statusObj,
      [
        { id: 'player_master', action_en: summonData.master_action_en || 'raising hand, surprised expression', use_np: false },
        { id: statusObj.servant1.id, action_en: summonData.servant_action_en || 'standing confidently, slight smirk', use_np: false }
      ],
      summonData.scene_env_en || 'glowing magic circle, dimly lit underground workshop, mana particles, dramatic lighting',
      false,
      '【啟動英靈召喚儀式】',
      formattedStory,
      1
    );

    appendPlayerChatLog_(ss, cleanName, 1, `Day 1・深夜 (${statusObj.location})`, '【啟動英靈召喚儀式】', formattedStory, `player_master, ${statusObj.servant1.id}`, JSON.stringify(imgPayload), '');

    return {
      status: statusObj,
      story: formattedStory,
      imagePayload: imgPayload,
      needImage: statusObj.autoImage
    };
  } finally {
    if (lockHeld) lock.releaseLock();
  }
}

function completeCreationAndSummon(params) {
  return completeCreationTextOnly(params);
}

// ==================== 3. 機率雙軌世界事件 + 隱藏王牌/路線變異 + 2004手機連動 ====================

function drawWorldDirectorEvent_(statusObj) {
  if (statusObj.gameMode !== 'WAR') return '';

  if (statusObj.timePeriod === '深夜' && statusObj.threatLevel >= 100) {
    return '【夜襲危機】警戒度已滿，深夜可能遭遇敵對陣營或使魔試探，依玩家防禦與應對自然推演並結算交戰勝負。';
  }

  if (Math.random() > 0.35) return '';

  const eventDeck = [
    '【世界事件：冬木大橋的深夜激戰】遠方冬木大橋傳來強烈魔力與兵器交鋒波動。玩家可選擇趕往、觀望或留在原地，事件會隨局勢自然演進並結算交戰結果。',
    '【世界事件：柳洞寺的靈脈波動】圓藏山方向出現濃郁魔力氣息。玩家可自由決定前往探查、防備或按兵不動。',
    '【世界事件：遠坂陣營的試探訊號】偵測到魔術使魔在附近徘徊。玩家可選擇接觸、警戒或避開。',
    '【世界事件：新都暗巷的異常氣息】新都一帶傳出不祥的魔力騷動。玩家可自行決定是否前往查看。',
    '【世界事件：教會方面的動態】言峰綺禮與監督者立場在暗中觀察局勢，玩家可依行動自由應對。'
  ];
  return eventDeck[Math.floor(Math.random() * eventDeck.length)];
}

// 只掃描「玩家本回合輸入」推測撿取道具，且背包已有同名道具時不再重複 +1
function inferGainedItemsFromNarrative_(userAction, storyText, currentInv) {
  const combined = String(userAction || '').trim();
  if (!combined) return [];

  const pickupPatterns = [
    /(?:妥善收納|收入懷中|收進背包|收進道具欄|拾起|撿起|拿取|奪取|獲得|收下)(?:了|著)?(?:那枚|那塊|這枚|這塊|一把|一件|一份)?(?:散發著[^，。！？\n]{0,18})?([一二三四五六七八九十一-龥A-Za-z0-9・（）()]{2,18}(?:碎片|殘片|寶石|結晶|媒介|禮裝|卷軸|護符|黑鍵|聖骸布|彈|藥水|殘骸))/g
  ];

  const existingList = Array.isArray(currentInv) ? currentInv : [];
  const foundNames = [];
  pickupPatterns.forEach(re => {
    let m;
    while ((m = re.exec(combined)) !== null) {
      const candidate = String(m[1] || '').trim();
      if (candidate && !foundNames.includes(candidate) && !existingList.some(it => it.name === candidate)) {
        foundNames.push(candidate);
      }
    }
  });

  if (foundNames.length === 0) return [];

  return foundNames.slice(0, 2).map((name, idx) => {
    const slug = 'loot_' + name.replace(/[^a-zA-Z0-9一-龥]/g, '').slice(0, 12) + '_' + idx;
    return {
      id: slug,
      name: name,
      tier: 1,
      type: /碎片|殘片|媒介|殘骸/.test(name) ? 'material' : 'consumable',
      qty: 1,
      desc: '從劇情探索或戰場中收納的物件'
    };
  });
}

function applyInventoryChanges_(currentInv, consumedIds, gainedItems, isSandboxMode) {
  let inv = Array.isArray(currentInv) ? JSON.parse(JSON.stringify(currentInv)) : [];
  let addedCount = 0;
  let skippedFull = false;

  const consumedActual = [];
  if (Array.isArray(consumedIds)) {
    consumedIds.forEach(cid => {
      const targetId = String(cid || '').trim();
      if (!targetId) return;
      const idx = inv.findIndex(item => item.id === targetId);
      if (idx !== -1) {
        consumedActual.push(targetId);
        inv[idx].qty = Math.max(0, (Number(inv[idx].qty) || 1) - 1);
        if (inv[idx].qty <= 0) {
          inv.splice(idx, 1);
        }
      }
    });
  }

  if (isSandboxMode) {
    return { inventory: inv, addedCount: 0, skippedFull: false, consumedIds: consumedActual };
  }

  if (Array.isArray(gainedItems)) {
    gainedItems.forEach(g => {
      if (!g || !g.id || !g.name) return;
      const itemId = String(g.id).trim();
      const itemType = String(g.type || 'consumable').trim();
      const tier = Math.max(1, Math.min(3, Number(g.tier) || 1));
      const addQty = Math.max(1, Math.min(3, Number(g.qty) || 1));

      if (itemId === 'aegis_charm' && inv.some(x => x.id === 'aegis_charm')) {
        return;
      }

      const existing = inv.find(x => x.id === itemId || x.name === String(g.name).trim());
      if (existing) {
        existing.qty = Math.min(5, (Number(existing.qty) || 1) + addQty);
        addedCount += addQty;
      } else if (inv.length < MAX_INVENTORY_SLOTS) {
        inv.push({
          id: itemId,
          name: String(g.name).trim(),
          tier: tier,
          type: itemType,
          qty: itemId === 'aegis_charm' ? 1 : addQty,
          desc: String(g.desc || '').trim()
        });
        addedCount += addQty;
      } else {
        skippedFull = true;
      }
    });
  }

  return { inventory: inv, addedCount: addedCount, skippedFull: skippedFull, consumedIds: consumedActual };
}

function ensureMasterPresentInList_(presentList, isCombatTurn) {
  const list = Array.isArray(presentList) ? presentList.slice(0, 4) : [];
  const hasMaster = list.some(c => c && c.id === 'player_master');
  if (hasMaster) return list;

  if (isCombatTurn && list.length >= 2) {
    return list.slice(0, 4);
  }

  return [
    { id: 'player_master', use_np: false, action_en: 'standing, focused expression' },
    ...list.slice(0, 3)
  ].slice(0, 4);
}

// 路線變異與隱藏強敵（金閃閃、黑櫻＋黑Saber反轉、真Assassin咒腕哈桑）自動同步
function applyRouteAndHiddenServantEvolution_(factionsObj, turnJson, charDb, isCombatTurn) {
  const nextF = Object.assign({}, factionsObj || {});
  const present = Array.isArray(turnJson.present_chars) ? turnJson.present_chars.slice(0, 4) : [];
  const presentIds = new Set(present.map(c => String((c && c.id) || '').trim()));

  const findFacKey = (pred) => Object.keys(nextF).find(k => pred(String(k || ''), String(nextF[k] || '')));

  const churchKey = findFacKey(k => k.includes('教會') || k.includes('言峰'));
  if (presentIds.has('gilgamesh') && churchKey && !isCapturedOrDefeatedStatusText_(nextF[churchKey])) {
    nextF[churchKey] = '言峰組・英雄王吉爾伽美什已現身 (受肉第八騎・極度危險)';
  }

  const matouKey = findMatouFactionKey_(nextF);
  const saberKey = findFacKey(k => k.includes('衛宮') || k.includes('Saber'));

  if (presentIds.has('dark_sakura')) {
    if (matouKey && !isCapturedOrDefeatedStatusText_(nextF[matouKey])) {
      nextF[matouKey] = '黑櫻・聖杯黑影異變 (間桐櫻覺醒・黑泥擴散中)';
    }
  }

  if (presentIds.has('saber_alter')) {
    if (saberKey && !isCapturedOrDefeatedStatusText_(nextF[saberKey])) {
      nextF[saberKey] = '已遭黑影吞噬・黑化反轉為黑Saber (隸屬黑櫻陣營)';
    }
  }

  // 真Assassin（咒腕哈桑）路線改由 updateRyuudouRoute_ 個別追蹤美狄亞／小次郎退場後觸發

  // 同場絕不出現雙櫻或雙Saber：黑化版本出現時，直接移除原版
  const filteredPresent = [];
  const seenGroup = new Set();
  present.forEach(c => {
    if (!c || !c.id) return;
    if (c.id === 'sakura' && presentIds.has('dark_sakura')) return;
    if (c.id === 'saber' && presentIds.has('saber_alter')) return;

    let groupKey = c.id;
    if (c.id === 'sakura' || c.id === 'dark_sakura') groupKey = 'grp_sakura';
    if (c.id === 'saber' || c.id === 'saber_alter') groupKey = 'grp_saber';
    if (seenGroup.has(groupKey)) return;
    seenGroup.add(groupKey);
    filteredPresent.push(c);
  });

  turnJson.present_chars = filteredPresent;
  return nextF;
}

function applyPendingSettingsToRow_(row, ps) {
  if (!ps || typeof ps !== 'object') return;
  if (ps.gameMode) row[3] = (String(ps.gameMode) === 'SANDBOX') ? 'SANDBOX' : 'WAR';
  if (typeof ps.autoImage === 'boolean') row[4] = ps.autoImage ? 'TRUE' : 'FALSE';
  if (typeof ps.adultMode === 'boolean') row[5] = ps.adultMode ? 'TRUE' : 'FALSE';
  const metaSync = safeJsonParse_(row[31], {});
  if (ps.artStyle && ART_STYLE_PRESETS_[String(ps.artStyle)]) metaSync.artStyle = ps.artStyle;
  if (ps.gameTone) metaSync.gameTone = normalizeGameToneKey_(ps.gameTone);
  row[31] = serializeMeta_(metaSync);
}

// ==================== 回合推演用的固定系統提示詞（型月世界觀＋自由但合乎邏輯的裁定原則） ====================
const FATE_GM_SYSTEM_PROMPT_ = [
  '你是 TYPE-MOON《Fate/stay night》第五次聖杯戰爭的遊戲主持人（GM），以繁體中文寫出小說級劇情，並輸出 JSON。',
  '',
  '## 一、裁定原則：自由，但合乎邏輯',
  '1. 先接受再演出：玩家可以嘗試任何行動或說任何話，不要直接拒絕或說「做不到」。依型月世界邏輯、御主固定能力等階、從者性格與當下局勢，決定結果是「漂亮成功／成功但付出代價／失敗並承受後果」。',
  '2. 獎勵創意：合理的奇招、話術、情報運用、利用地形與時機，都應該得到實質回報；明顯不合理或作死的行為，則讓世界給出真實後果。',
  '3. 每個行動都要有確實的結果並留下紀錄：數值、陣營狀態、流言、道具、關係變化都要反映在對應的 JSON 欄位，不能只寫在劇情裡。',
  '4. 只控制玩家輸入的部分：不替玩家寫出沒輸入的行動或台詞，也不替玩家做決定；從者、NPC、敵對陣營依各自性格與目的主動行動。',
  '5. 世界是活的：各陣營有自己的計畫，會依情報、流言與局勢變化而行動；在場人物一定會對玩家的言行有所反應，不會無視或憑空消失。',
  '6. 只寫本回合的新發展：前幾回合是已確定的歷史，開頭不要重複或改寫上一回合的結尾。',
  '',
  '## 二、型月世界邏輯（判斷結果時的常識，不是禁止清單）',
  '- 神秘法則：神秘只能被更強的神秘壓制。現代武器與普通魔術幾乎傷不了英靈本體，但可以牽制、干擾、爭取時間，或對付御主與使魔。',
  '- 魔力即代價：寶具、高階魔術、維持從者現界都消耗御主魔力；魔力枯竭時從者會衰弱甚至消失。魔力可從靈脈、魔力寶石、魔力供給（補魔）取得。',
  '- 令咒：三劃絕對命令，可強制行動、瞬間轉移、短時間強化或硬開寶具；用完即失去約束從者的手段。令咒可以被奪取或轉讓。',
  '- 從者是有自我意志的英雄：依傳說與性格行事，會評價御主，可以拒絕不合理的命令（除非動用令咒），也會因御主的作為而信任或失望。',
  '- 真名即弱點：真名曝光代表傳說中的弱點與寶具被看穿；寶具解放常伴隨真名宣告。',
  '- 御主是最大破綻：攻擊御主是正當戰術。失去御主的從者靠單獨行動技能撐一段時間，會尋找新御主或消失。',
  '- 魔術必須隱匿：在人多的地方或白天公開交戰，會引來聖堂教會善後、警方與其他陣營的注意（論壇也會出現目擊）。聖杯戰爭主要在夜間進行，白天是日常、調查與佈局。',
  '- 陣地優勢：在敵方工房、結界或陣地內作戰極為不利；Caster 的陣地與山門結界尤其危險。',
  '- 隱藏真相（大聖杯的汙染、此世之惡、言峰綺禮的真面目等）只在玩家深入調查時逐步揭露，不要一次說破。',
  '- 御主六維與從者參數創角後固定，不會因鍛鍊改變；成長體現在情報、羈絆、道具與戰術上。',
  '',
  '## 三、本作固定設定',
  '- 玩家是正規七組之外獨立參戰的「第8組」，不頂替任何陣營或英靈（同職階也只是不同英靈）；只有實際擊敗並收服時，原陣營才歸屬第8組。',
  '- 同盟陣營（同盟／結盟／合作／互助）彼此照應、不內鬥；已淘汰或重傷休整的陣營不會無故滿血出現。正在交戰時敵人就在眼前，不合時宜的行動要承受後果。',
  '- 御主 `player_master` 是固定核心人物：除了純粹從者對從者的交鋒，`present_chars` 一定要包含 `player_master`。',
  '- 隱藏王牌：言峰教會可在深入調查、Lancer 退場或終局時亮出受肉的吉爾伽美什（`gilgamesh`）；間桐的黑影事件可讓間桐櫻覺醒為黑櫻（`dark_sakura`），敗給黑影的 Saber 會反轉為黑 Saber（`saber_alter`），同場不可同時出現原版與黑化版；「臟硯組 (真Assassin陣營)」由系統在柳洞寺有人退場後自動建立，成立後咒腕哈桑（`hassan`）會潛伏暗殺。敵方英靈確實退場時填入 `servants_out`。',
  '- 服裝以劇情為準：英靈出戰或巡邏時自然換上戰裝；御主刻意選擇的穿著（包括全裸）要尊重並維持，直到玩家主動換裝。換裝時在 `outfit_updates` 填英文 Danbooru 服裝 tags。',
  '- 補魔與親密：好感未滿 80 時，單純補魔可以用一般接觸或魔力交換；硬要親密會先被拒絕或警告並扣好感，持續騷擾才加重反制，極端失控才可能致命；好感 80 以上可自然發展親密關係。',
  '- 傷勢分開判定：御主肉身（`master_condition`）與從者靈基（`servant_condition`、`servant2_condition`）各自結算。交戰要分出明確結果（負傷、靈基受損、撤退、淘汰），不能互砍半天卻什麼都沒發生。',
  '',
  '## 四、活的冬木市與反饋機制',
  '- 論壇：玩家做了引人注目的事（公開交戰、怪事、流言擴散），用 `forum_posts` 寫 0～2 則冬木市民的 2004 年留言板貼文；路人只知道自己看得到的部分。',
  '- 流言：依各陣營的情報能力與性格，判斷誰相信、誰識破狀態資料中的流言，用 `rumor_updates` 記錄；被相信的流言會實際改變該陣營行動（寫進 `faction_updates`），被識破的假消息可能引來報復。',
  '- 通訊錄：劇情中玩家與某陣營交換手機號碼或取得聯絡方式時，把陣營名稱填入 `new_contacts`。',
  '- 路線傾向：依玩家本回合的行動方式，在 `route_tendency_delta` 為各路線加減分（-3～+3）；已確立路線時，劇情重心照狀態資料中的路線說明發展。',
  '- 記憶：`memory_update` 寫 200 字內前情提要；之後必須記住的約定、恩怨、伏筆用 `key_events_add` 新增，了結的用 `key_events_resolve` 移除。',
  '- 道具：消耗時填 `consumed_item_ids`，取得時填 `gained_items`；固定道具的 id 與效果見狀態資料，系統自動結算的部分不要重複計入數值。',
  '- 陣營更新：`faction_updates` 的鍵必須用狀態資料中既有的陣營完整名稱。',
  '',
  '## 五、死亡與勝利',
  '- `FATAL_DEATH`：只在真正致命時使用（例如人類肉身硬吃寶具、魔力枯竭又沒令咒卻強開寶具、極端自殺式挑釁、對低好感從者持續騷擾導致致命反擊）。嘴砲、虛張聲勢、非致命的失誤都不算。死亡時描寫悲劇結局與大聖杯黑泥圍繞玩家願望編織的虛假美夢，並填寫 `tiger_dojo_tip`（老虎道場的吐槽點評）。',
  '- `TRUE_VICTORY`：只在所有敵對陣營都已擊敗或化解、聖杯願望實現時使用（系統會再驗證）。',
  '- 其他情況一律 `CONTINUE`。',
  '',
  '## 六、寫作格式',
  '- `story` 分 3～5 段，用 `\\n\\n` 分段；角色說話一律寫成「角色名：「……」」並獨立成段，讓讀者知道是誰在說話。',
  '- `is_combat` 只在從者之間實際兵刃交鋒時為 true。`present_chars` 最多 4 人，`action_en` 與 `scene_env_en` 只寫簡短英文關鍵字（另有視覺導演負責翻譯繪圖）。',
  '',
  '## 輸出：只輸出符合以下格式的 JSON',
  '{',
  '  "judge_reason": "50字內的判定理由（行動合理性、局勢、代價）",',
  '  "outcome_type": "CONTINUE / FATAL_DEATH / TRUE_VICTORY",',
  '  "tiger_dojo_tip": "FATAL_DEATH 時填寫，否則空字串",',
  '  "story": "繁體中文小說劇情",',
  '  "is_combat": false,',
  '  "ap_cost": 1,',
  '  "threat_delta": 0,',
  '  "bond_delta": 0,',
  '  "location": "本回合結束時所在的冬木市地標名稱",',
  '  "master_mp_delta": 0,',
  '  "command_spells_used": 0,',
  '  "master_condition": "完好無損 / 輕傷 / 重傷 / 瀕死 / 已死亡",',
  '  "servant_condition": "靈基穩定 / 輕微受損 / 靈基受創 / 靈核重創 / 消滅",',
  '  "servant2_condition": "有副從者才填，否則空字串",',
  '  "consumed_item_ids": [],',
  '  "gained_items": [{ "id": "英文代碼", "name": "繁中名稱", "tier": 1, "type": "material/consumable/equipment", "qty": 1, "desc": "說明" }],',
  '  "servant_form_morph": "",',
  '  "outfit_updates": {},',
  '  "faction_updates": {},',
  '  "forum_posts": [],',
  '  "rumor_updates": [{ "id": "流言ID", "status": "擴散中 / 已被識破 / 已被證實 / 已平息", "believers": [], "doubters": [], "effect": "30字內影響" }],',
  '  "new_contacts": [],',
  '  "route_tendency_delta": { "fate": 0, "ubw": 0, "hf": 0, "shadow": 0, "conquest": 0 },',
  '  "servants_out": [],',
  '  "new_servant2_id": "",',
  '  "memory_update": "200字內前情提要",',
  '  "key_events_add": [],',
  '  "key_events_resolve": [],',
  '  "present_chars": [{ "id": "角色ID", "use_np": false, "action_en": "brief English pose/expression" }],',
  '  "scene_env_en": "brief English environment/lighting"',
  '}'
].join('\n');

function processFateTurnTextOnly(params) {
  const cleanName = validatePlayerName_(params.playerName);
  const userAction = String(params.userAction || '').trim();
  if (!userAction) throw new Error('請輸入行動或對話內容！');

  // 鎖只在「讀存檔」與「寫回存檔」時持有；等待 AI 回應期間放開，其他玩家不必排隊
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let lockHeld = true;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSchemaUpgraded_(ss);
    const saveSheet = ss.getSheetByName('Players_Save');
    let rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');

    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    applyPendingSettingsToRow_(row, params.pendingSettings);

    const statusObj = parseSaveRow_(row);
    if (statusObj.runStatus === 'DEAD' || statusObj.runStatus === 'CLEARED') {
      throw new Error('此輪迴已經終結並封存！請點擊「開啟下一輪迴」繼續挑戰。');
    }

    const isSandboxMode = (statusObj.gameMode !== 'WAR');
    const toneKey = normalizeGameToneKey_(statusObj.gameTone);
    const tonePreset = GAME_TONE_PRESETS_[toneKey] || GAME_TONE_PRESETS_['BALANCED'];

    const allRecentLogs = getPlayerChatLogs_(ss, cleanName, 4);
    const lastLog = allRecentLogs.length > 0 ? allRecentLogs[allRecentLogs.length - 1] : null;
    const prevStoryText = lastLog ? String(lastLog.ai || '') : '';

    const metaBefore = safeJsonParse_(row[31], {});

    // 回合數：優先使用 meta.turnCount（O(1)），舊存檔才退回掃描 ChatLog 第 A 欄
    let turnNum;
    if (metaBefore.turnCount !== undefined && metaBefore.turnCount !== null && !isNaN(Number(metaBefore.turnCount))) {
      turnNum = Number(metaBefore.turnCount) + 1;
    } else {
      const chatSheet = ss.getSheetByName('ChatLog');
      const chatLast = chatSheet.getLastRow();
      let totalUserTurns = 0;
      if (chatLast >= 2) {
        const names = chatSheet.getRange(2, 1, chatLast - 1, 1).getValues();
        for (let i = 0; i < names.length; i++) {
          if (String(names[i][0]).trim() === cleanName) totalUserTurns++;
        }
      }
      turnNum = totalUserTurns + 1;
    }

    const stripSystemLines = t => String(t || '').split('\n').filter(line => !/^【(本回合結算|時段推進|道具欄已滿)/.test(line.trim())).join('\n').trim();
    const recentContextText = allRecentLogs.map(l => `玩家: ${l.user}\n劇情: ${stripSystemLines(l.ai)}`).join('\n---\n');
    const loreSnippets = searchLorebook_(ss, userAction + ' ' + statusObj.location + ' ' + recentContextText);
    const charDb = getCharAppearanceMap_(ss);

    const p = statusObj.master.params;
    const invSummary = statusObj.inventory.length > 0
      ? statusObj.inventory.map(it => `[id:${it.id}] ${it.name} x${it.qty} (${it.type}, 階級${it.tier}: ${it.desc})`).join('\n')
      : '（目前背包空空如也，無任何道具或媒介）';

    const locCatalogText = Object.keys(FUYUKI_LOCATIONS_).map(k => {
      const l = statusObj.dynamicLocations[k] || FUYUKI_LOCATIONS_[k];
      const descPart = (k === statusObj.locationKey) ? ` | ${l.desc}` : '';
      return `- ${k}: 靈脈+${l.manaRegen}MP | 危險度=${l.danger}${descPart}`;
    }).join('\n');

    // 只把「可能出場」的角色服裝送給 AI：御主、契約從者、上一回合出場者、以及服裝已偏離預設的角色
    const relevantIds = new Set(['player_master', statusObj.servant1.id, statusObj.servant2.id].filter(Boolean));
    allRecentLogs.slice(-2).forEach(l => String(l.chars || '').split(',').forEach(x => { if (x.trim()) relevantIds.add(x.trim()); }));
    Object.keys(statusObj.outfits || {}).forEach(id => {
      if (charDb[id] && String(statusObj.outfits[id] || '') !== String(charDb[id].defaultOutfit || '')) relevantIds.add(id);
    });
    const relevantOutfits = {};
    relevantIds.forEach(id => {
      const o = (statusObj.outfits && statusObj.outfits[id]) || (charDb[id] && charDb[id].defaultOutfit) || '';
      if (o) relevantOutfits[id] = o;
    });
    const keyEventsText = (Array.isArray(metaBefore.keyEvents) && metaBefore.keyEvents.length > 0)
      ? metaBefore.keyEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')
      : '（尚無）';

    const smsContactKeys = Object.keys((metaBefore.smsContacts && typeof metaBefore.smsContacts === 'object') ? metaBefore.smsContacts : {});
    const phoneBridgeHints = [
      metaBefore.pendingSmsNote ? `【簡訊通訊連動】${metaBefore.pendingSmsNote}（請讓簡訊的內容與對方反應實際體現在本回合劇情與陣營狀態中：同盟會配合支援；被騙的陣營會依假情報行動，識破的陣營會提高戒心甚至報復）` : '',
      describeRumorsForPrompt_(metaBefore.rumors),
      `【玩家手機通訊錄】可傳簡訊的非同盟陣營：${smsContactKeys.join('、') || '無'}（劇情中玩家與某陣營交換手機號碼或取得聯絡方式時，把該陣營名稱填入 new_contacts）`,
      describeRouteForPrompt_(metaBefore),
      metaBefore.pendingForumNote ? `【冬木論壇風聲連動】${metaBefore.pendingForumNote}（可讓各方對論壇流言做出自然反應或引出對應動靜）` : ''
    ].filter(Boolean).join('\n');

    const rankCheckHint = `【御主出身與固定六維等階（不可變動）】出身：${statusObj.master.origin} ｜ 魔術迴路:${p.circuit} ｜ 近戰體術:${p.combat} ｜ 隱藏氣息:${p.stealth} ｜ 幸運:${p.luck} ｜ 當前魔力:${statusObj.master.mp}/${statusObj.master.maxMp}`;

    const inventoryRuleHint = [
      `【物品欄 (上限 ${MAX_INVENTORY_SLOTS} 格)】\n${invSummary}`,
      isSandboxMode
        ? '日常模式：不發放戰鬥道具（`gained_items` 為 `[]`）。'
        : '消耗背包道具請填入 `consumed_item_ids`（填背包裡的 id）；只要拾取、收納或取得物品，務必填入 `gained_items`（階級 1～3）。\n固定道具 id：魔力結晶(小)=`mana_gem_s`、高純度魔力寶石(中)=`mana_gem_m`、煙霧魔術彈=`smoke_bomb`、對魔術防禦禮裝(保命符)=`aegis_charm`、未充能天然寶石媒介=`empty_gem`、基礎黑鍵套組=`black_keys`；煉成或取得這些道具時務必沿用同一個 id。\n魔力寶石／結晶的 MP 回復與煙霧彈降低警戒度由系統自動結算，`master_mp_delta` 與 `threat_delta` 不要重複計入。'
    ].join('\n');

    const worldEventHint = drawWorldDirectorEvent_(statusObj);
    const canFormSecondContract = (statusObj.master.commandSpells >= 1 && statusObj.master.mp >= 80 && !statusObj.servant2.id);

    // 系統提示詞：固定不變的規則與型月世界觀（每回合相同，模型端可快取）；每回合變動的資料一律放在 statePrompt
    const systemPrompt = FATE_GM_SYSTEM_PROMPT_;

    const turnSettingsBlock = [
      `【玩家】名號「${cleanName}」（劇情中稱呼玩家用這個名字、「御主」或角色習慣的叫法）｜聖杯願望：「${statusObj.master.wish}」`,
      `【寫作基調：${tonePreset.label}】${tonePreset.desc}`,
      rankCheckHint,
      `【主從者好感】${statusObj.bondLevel}/100`,
      inventoryRuleHint,
      canFormSecondContract ? '【副契約】條件已滿足：若劇情中合理收服敵方英靈，可填 `new_servant2_id`。' : '【副契約】目前條件不足，不可新增副從者。',
      worldEventHint,
      phoneBridgeHints,
      `【冬木市地標】\n${locCatalogText}`,
      `【角色 ID】${Object.keys(charDb).map(id => `${id}=${charDb[id].triggers.split(',').slice(0, 2).join('/')}`).join('; ')}`
    ].filter(Boolean).join('\n\n');

    const statePrompt = [
      turnSettingsBlock,
      `【當前狀態】模式: ${statusObj.gameMode} | 基調: ${tonePreset.label} | Day ${statusObj.day} ${statusObj.timePeriod} | AP: ${statusObj.ap}/${statusObj.maxAp} | 警戒度: ${statusObj.threatLevel}% | 當前地標: ${statusObj.location} (${statusObj.locationInfo.leyline} | ${statusObj.locationInfo.danger})`,
      `【當前場地現況】${statusObj.locationInfo.desc}`,
      `【近期戰況速報】${statusObj.warTicker}`,
      `【御主(${cleanName})】ID:player_master | 身分:獨立第8組參戰者 | 出身:${statusObj.master.origin} | 願望:「${statusObj.master.wish}」 | 魔力:${statusObj.master.mp}/${statusObj.master.maxMp} | 令咒:${statusObj.master.commandSpells} | 肉身狀態:${statusObj.master.condition}`,
      `【御主固定六維等階】魔術迴路:${p.circuit} | 近戰體術:${p.combat} | 隱藏氣息:${p.stealth} | 幸運:${p.luck}`,
      `【主從者】ID:${statusObj.servant1.id} (${statusObj.servant1.class}・${statusObj.servant1.name}) | 羈絆好感:${statusObj.bondLevel}/100 | 靈基狀態:${statusObj.servant1.condition}`,
      statusObj.servant2.id ? `【副從者】ID:${statusObj.servant2.id} (${statusObj.servant2.class}・${statusObj.servant2.name}) | 靈基狀態:${statusObj.servant2.condition || '靈基穩定'}` : '【副從者】無',
      `【相關角色目前穿著（未列出者為預設服裝）】${JSON.stringify(relevantOutfits)}`,
      `【七組陣營狀態（推演前必先對照，同盟陣營須彼此照應）】${JSON.stringify(statusObj.factions)}`,
      describeRyuudouRoute_(metaBefore),
      `【長期記憶前情提要】${statusObj.memorySummary}`,
      `【重要事件與伏筆清單（約定、結盟原因、恩怨、未解之謎；請保持連貫）】\n${keyEventsText}`,
      loreSnippets ? `【相關世界書設定】\n${loreSnippets}` : '',
      recentContextText ? `【過往歷史脈絡（僅供背景參照，切勿在本次開頭重複上回合尾巴）】\n${recentContextText}` : '',
      `【玩家本回合最新行動】${userAction}`
    ].filter(Boolean).join('\n\n');

    // 主回合 token 上限提高到 3000，並具備 JSON 容錯解析與自動重試
    lock.releaseLock();
    lockHeld = false;

    const turnJson = callGeminiLiteJson_(systemPrompt, statePrompt, 0.75, 3000);

    lock.waitLock(20000);
    lockHeld = true;

    // 重新讀取最新存檔：若等待 AI 期間這個存檔已被別的視窗推進，放棄本次結果避免互相覆蓋
    rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    const freshRow = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const freshMeta = safeJsonParse_(freshRow[31], {});
    if (Number(freshMeta.turnCount || 0) !== Number(metaBefore.turnCount || 0) || String(freshRow[2]) !== String(row[2])) {
      throw new Error('這個存檔剛剛在另一個視窗推進了一回合，本次行動未寫入。請重新【讀取世界線】後再行動。');
    }
    applyPendingSettingsToRow_(freshRow, params.pendingSettings);
    for (let ci = 0; ci < 32; ci++) row[ci] = freshRow[ci];
    const speakerHints = [statusObj.servant1.name, statusObj.servant2.name, cleanName, '遠坂凜', '衛宮士郎', '間桐櫻', '言峰綺禮', '伊莉雅', '葛木宗一郎', '吉爾伽美什', '黑櫻', '黑Saber', '咒腕哈桑'].filter(Boolean);
    let formattedStory = formatNovelStoryText_(turnJson.story, speakerHints, prevStoryText, cleanName);

    const meta = safeJsonParse_(row[31], {});
    const maxMp = Number(meta.maxMp) || 120;

    row[1] = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

    const resolvedLoc = matchFuyukiLocation_(turnJson.location) || resolveFuyukiLocation_(row[10]);
    row[10] = resolvedLoc.info.fullName;

    let currentFactions = safeJsonParse_(row[29], {});
    if (turnJson.faction_updates && typeof turnJson.faction_updates === 'object') {
      Object.keys(turnJson.faction_updates).forEach(fname => {
        const val = String(turnJson.faction_updates[fname] || '').trim();
        const realKey = resolveFactionKey_(fname, currentFactions);
        if (val && realKey) {
          currentFactions[realKey] = val.slice(0, 120);
        }
      });
    }

    if (turnJson.servant_form_morph && charDb[turnJson.servant_form_morph]) {
      const morphInfo = charDb[turnJson.servant_form_morph];
      row[17] = turnJson.servant_form_morph;
      row[19] = morphInfo.triggers.split(',')[0];
    }

    const nonServants = new Set(['player_master', 'shirou', 'rin', 'sakura', 'dark_sakura', 'illya', 'kirei', 'souichirou']);
    let capturedServantId = '';
    if (
      turnJson.new_servant2_id &&
      charDb[turnJson.new_servant2_id] &&
      !nonServants.has(turnJson.new_servant2_id) &&
      String(turnJson.new_servant2_id) !== String(row[17]) &&
      canFormSecondContract
    ) {
      const s2Info = charDb[turnJson.new_servant2_id];
      row[15] = Math.max(0, Number(row[15]) - 80);
      row[23] = turnJson.new_servant2_id;
      row[24] = '契約從者';
      row[25] = s2Info.triggers.split(',')[0];
      row[26] = 1000;
      row[27] = 0;
      meta.servant2Condition = '靈基穩定';
      capturedServantId = String(row[23]);
      // 只有「真正收服敵方英靈」時，才把原陣營改為歸屬第8組
      currentFactions = syncCapturedServantFaction_(currentFactions, row[23], '');
    }

    const isCombatTurn = Boolean(turnJson.is_combat);
    currentFactions = applyRouteAndHiddenServantEvolution_(currentFactions, turnJson, charDb, isCombatTurn);
    const presentIdSet = new Set((turnJson.present_chars || []).map(c => String((c && c.id) || '').trim()));
    const servantsOutList = Array.isArray(turnJson.servants_out) ? turnJson.servants_out : [];
    let routeRes = updateRyuudouRoute_(meta, currentFactions, servantsOutList, capturedServantId, presentIdSet);
    currentFactions = routeRes.factions;
    const routeReports = routeRes.report ? [routeRes.report] : [];

    let mpDelta = Number(turnJson.master_mp_delta) || 0;
    let periodAdvancedNotice = '';
    let latestWarReport = '';

    if (statusObj.gameMode === 'WAR') {
      const apCost = Math.max(0, Math.min(3, Number(turnJson.ap_cost) || 0));
      let newAp = Number(row[8]) - apCost;
      if (newAp <= 0) {
        const nextTime = advanceTimePeriod_(Number(row[6]), String(row[7]));
        row[6] = nextTime.day;
        row[7] = nextTime.period;
        newAp = Number(statusObj.maxAp);

        const customNotes = (meta.customLocationNotes && typeof meta.customLocationNotes === 'object') ? meta.customLocationNotes : {};
        const activeLocInfo = computeDynamicLocationInfo_(resolvedLoc.key, resolvedLoc.info, currentFactions, meta.mapHotspot || '冬木大橋', statusObj.gameMode, customNotes);
        const leylineRegen = activeLocInfo.manaRegen;
        mpDelta += leylineRegen;
        periodAdvancedNotice += `\n\n【時段推進・大源回復】時間進入 Day ${nextTime.day}・${nextTime.period}。受「${activeLocInfo.leyline}」滋養，魔術迴路自然汲取大源回復了 +${leylineRegen} MP。`;

        // 玩家的第8組是獨立陣營，不再以「持有英靈ID」排除原敵對陣營；已收服者已由狀態文字排除
        const warSim = simulateOffscreenFactionWar_(currentFactions, nextTime.day, nextTime.period, []);
        currentFactions = warSim.updatedFactions;
        routeRes = updateRyuudouRoute_(meta, currentFactions, [], '', new Set());
        currentFactions = routeRes.factions;
        if (routeRes.report) routeReports.push(routeRes.report);
        if (warSim.hotspotKey) meta.mapHotspot = warSim.hotspotKey;
        if (warSim.report) {
          latestWarReport = warSim.report;
          meta.warTicker = warSim.report;
          periodAdvancedNotice += `\n${warSim.report}`;
        }
      }
      row[8] = newAp;

      let newThreat = Number(row[9]) + (Number(turnJson.threat_delta) || 0);
      if (statusObj.timePeriod === '深夜' && statusObj.threatLevel >= 100) newThreat = 20;
      row[9] = Math.max(0, Math.min(100, newThreat));
    }

    const spellsUsed = Math.max(0, Math.min(3, Number(turnJson.command_spells_used) || 0));
    if (spellsUsed > 0 && Number(row[16]) > 0) {
      row[16] = Math.max(0, Number(row[16]) - spellsUsed);
    }

    const anyNpUsed = Array.isArray(turnJson.present_chars) && turnJson.present_chars.some(c =>
      c && c.use_np && (c.id === statusObj.servant1.id || (statusObj.servant2.id && c.id === statusObj.servant2.id))
    );
    if (anyNpUsed && spellsUsed === 0 && (Number(turnJson.master_mp_delta) || 0) > -65) {
      mpDelta -= 65;
    }
    row[15] = Math.max(0, Math.min(maxMp, Number(row[15]) + mpDelta));

    const curBond = Number(meta.bondLevel != null ? meta.bondLevel : (row[21] || 25));
    const bondDelta = Number(turnJson.bond_delta) || 0;
    const nextBond = Math.max(0, Math.min(100, curBond + bondDelta));
    meta.bondLevel = nextBond;
    row[21] = nextBond;

    meta.masterParams = Object.assign({}, statusObj.master.params);

    let mergedGainedItems = Array.isArray(turnJson.gained_items) ? turnJson.gained_items.slice() : [];
    if (!isSandboxMode && mergedGainedItems.length === 0) {
      mergedGainedItems = inferGainedItemsFromNarrative_(userAction, formattedStory, meta.inventory || []);
    }

    const invResult = applyInventoryChanges_(
      meta.inventory || [],
      turnJson.consumed_item_ids || [],
      mergedGainedItems,
      isSandboxMode
    );
    let updatedInventory = invResult.inventory;

    // 魔力寶石回魔、煙霧彈降警戒：依實際扣掉的道具由伺服器結算
    let itemMpGain = 0;
    let itemThreatDelta = 0;
    (invResult.consumedIds || []).forEach(cid => {
      const eff = ITEM_EFFECTS_[cid];
      if (!eff) return;
      itemMpGain += Number(eff.mp) || 0;
      itemThreatDelta += Number(eff.threat) || 0;
    });
    if (itemMpGain > 0) {
      row[15] = Math.max(0, Math.min(maxMp, Number(row[15]) + itemMpGain));
    }
    if (itemThreatDelta !== 0 && statusObj.gameMode === 'WAR') {
      row[9] = Math.max(0, Math.min(100, Number(row[9]) + itemThreatDelta));
    }

    if (invResult.skippedFull) {
      formattedStory += '\n\n【道具欄已滿】隨身道具欄已達上限（6/6），無法再自動收進更多新物品。';
    }

    if (turnJson.master_condition) meta.masterCondition = String(turnJson.master_condition);
    if (turnJson.servant_condition) meta.servantCondition = String(turnJson.servant_condition);
    if (turnJson.servant2_condition) meta.servant2Condition = String(turnJson.servant2_condition);
    if (row[23] && /消滅/.test(String(meta.servant2Condition || ''))) {
      formattedStory += `\n\n【副契約解除】副從者「${row[25]}」的靈基已經消滅，契約之線就此斷絕。`;
      row[23] = '';
      row[24] = '';
      row[25] = '';
      row[26] = 0;
      row[27] = 0;
      meta.servant2Condition = '靈基穩定';
    }

    const currentOutfits = safeJsonParse_(row[28], {});
    Object.keys(charDb).forEach(id => {
      if (!currentOutfits[id]) currentOutfits[id] = charDb[id].defaultOutfit;
    });
    if (turnJson.outfit_updates && typeof turnJson.outfit_updates === 'object') {
      Object.keys(turnJson.outfit_updates).forEach(cid => {
        const val = String(turnJson.outfit_updates[cid] || '').trim();
        if (val.length >= 2 && charDb[cid]) {
          currentOutfits[cid] = isNudeOutfitTags_(val)
            ? 'nude, completely nude, no clothes'
            : val;
        }
      });
    }

    Object.keys(currentOutfits).forEach(cid => {
      currentOutfits[cid] = autoAdaptSmartOutfit_(
        cid,
        currentOutfits[cid],
        charDb[cid] || {},
        userAction,
        formattedStory,
        isCombatTurn,
        resolvedLoc.key
      );
    });

    row[28] = JSON.stringify(currentOutfits);
    row[29] = JSON.stringify(currentFactions);

    if (turnJson.memory_update) {
      row[30] = cleanAwkwardMasterTitle_(String(turnJson.memory_update).trim(), cleanName).slice(0, 400);
    }
    meta.keyEvents = updateKeyEvents_(meta.keyEvents, turnJson.key_events_add, turnJson.key_events_resolve, cleanName);

    const rumorRes = applyRumorUpdates_(meta.rumors, turnJson.rumor_updates, currentFactions, turnNum);
    meta.rumors = rumorRes.rumors;

    const newContactNames = [];
    (Array.isArray(turnJson.new_contacts) ? turnJson.new_contacts : []).forEach(n => {
      const k = resolveFactionKey_(n, currentFactions);
      if (!k) return;
      meta.smsContacts = Object.assign({}, meta.smsContacts || {});
      if (!meta.smsContacts[k]) {
        meta.smsContacts[k] = { addedTurn: turnNum };
        newContactNames.push(k);
      }
    });

    const routeAnnounce = applyRouteTendency_(meta, turnJson.route_tendency_delta);
    if (routeAnnounce) {
      meta.keyEvents = updateKeyEvents_(meta.keyEvents, [routeAnnounce.replace(/^【[^】]+】/, '').slice(0, 60)], [], cleanName);
    }

    let outcome = String(turnJson.outcome_type || 'CONTINUE').toUpperCase();
    if (outcome === 'CONTINUE' && /^已死亡/.test(String(meta.masterCondition || ''))) {
      outcome = 'FATAL_DEATH';
    }

    // 伺服器端驗證：日常模式不會通關；仍有未化解的敵對陣營時，不接受 TRUE_VICTORY
    if (outcome === 'TRUE_VICTORY' && (isSandboxMode || !areAllRivalFactionsResolved_(currentFactions))) {
      outcome = 'CONTINUE';
    }

    if (outcome === 'FATAL_DEATH') {
      const shieldIdx = updatedInventory.findIndex(it => it.id === 'aegis_charm');
      if (shieldIdx !== -1) {
        updatedInventory.splice(shieldIdx, 1);
        outcome = 'CONTINUE';
        meta.masterCondition = '瀕死 (保命禮裝已碎裂)';
        row[15] = Math.max(5, Math.floor(Number(row[15]) * 0.2));
        formattedStory += '\n\n【禮裝碎裂・死裡逃生】千鈞一髮之際，你懷中的《對魔術防禦禮裝》發出刺耳的悲鳴並化作齏粉，替你擋下了這記必殺的致命一擊！你吐出一口鮮血勉強保住性命，但保命禮裝已徹底毀損！';
      } else {
        meta.status = 'DEAD';
        meta.losses = (Number(meta.losses) || 0) + 1;
        meta.masterCondition = '已死亡 (靈魂遭聖杯吞噬)';
        row[2] = 'ENDED_DEAD';
        row[14] = 0;
        row[15] = 0;
      }
    } else if (outcome === 'TRUE_VICTORY') {
      meta.status = 'CLEARED';
      meta.wins = (Number(meta.wins) || 0) + 1;
      row[2] = 'ENDED_CLEARED';
    }

    // 只要本回合最終仍是 CONTINUE（含保命禮裝逃生），就顯示時段推進與戰況速報
    if (outcome === 'CONTINUE' && periodAdvancedNotice) {
      formattedStory += periodAdvancedNotice;
    }
    if (routeAnnounce && outcome === 'CONTINUE') {
      formattedStory += `\n\n${routeAnnounce}`;
    }
    if (routeReports.length > 0) {
      const routeText = routeReports.join(' ');
      if (outcome === 'CONTINUE') formattedStory += `\n\n${routeText}`;
      latestWarReport = [latestWarReport, routeText].filter(Boolean).join(' ');
      meta.warTicker = latestWarReport;
    }

    // 只清掉本回合已經交給 AI 的通知；等待期間新送出的簡訊／貼文留到下一回合
    if (meta.pendingSmsNote === metaBefore.pendingSmsNote) delete meta.pendingSmsNote;
    if (meta.pendingForumNote === metaBefore.pendingForumNote) delete meta.pendingForumNote;
    meta.phoneState = syncPhoneStateWithFactions_(meta.phoneState, currentFactions, row[6], row[7], latestWarReport);
    const aiPosts = (Array.isArray(turnJson.forum_posts) ? turnJson.forum_posts : []).slice(0, MAX_FORUM_POSTS_PER_TURN);
    aiPosts.forEach((fp, i) => {
      const body = String((fp && fp.body) || '').trim().slice(0, 160);
      if (!body) return;
      meta.phoneState.forumPosts.unshift({
        id: `ai_${turnNum}_${i}`,
        board: String(fp.board || '冬木匿名留言板').slice(0, 16),
        author: String(fp.author || '匿名').slice(0, 16),
        time: `Day ${row[6]}・${row[7]}`,
        title: String(fp.title || '目擊情報').slice(0, 36),
        body: body,
        isPlayer: false
      });
      meta.phoneState.unreadCount = (Number(meta.phoneState.unreadCount) || 0) + 1;
    });
    if (meta.phoneState.forumPosts.length > MAX_FORUM_POSTS) meta.phoneState.forumPosts.length = MAX_FORUM_POSTS;
    meta.turnCount = turnNum;

    meta.inventory = updatedInventory;

    // 每回合結算：把本回合造成的確實變化列出來，讓玩家看到行動的反饋（也存進紀錄）
    const summaryParts = [];
    const mpAfter = Number(row[15]);
    if (mpAfter !== statusObj.master.mp) summaryParts.push(`MP ${statusObj.master.mp}→${mpAfter}`);
    if (statusObj.gameMode === 'WAR' && Number(row[9]) !== statusObj.threatLevel) summaryParts.push(`警戒 ${statusObj.threatLevel}%→${row[9]}%`);
    if (nextBond !== statusObj.bondLevel) summaryParts.push(`好感 ${statusObj.bondLevel}→${nextBond}`);
    if (Number(row[16]) !== statusObj.master.commandSpells) summaryParts.push(`令咒 ${statusObj.master.commandSpells}→${row[16]}`);
    if (String(row[10]) !== String(statusObj.location)) summaryParts.push(`移動至 ${resolvedLoc.key}`);
    if (String(meta.masterCondition) !== String(statusObj.master.condition)) summaryParts.push(`御主：${meta.masterCondition}`);
    if (String(meta.servantCondition) !== String(statusObj.servant1.condition)) summaryParts.push(`${statusObj.servant1.name}：${meta.servantCondition}`);
    if (capturedServantId) summaryParts.push(`締結副契約：${row[25]}`);
    (invResult.consumedIds || []).forEach(cid => {
      const it = (statusObj.inventory || []).find(x => x.id === cid);
      summaryParts.push(`使用 ${it ? it.name : cid}`);
    });
    if (invResult.addedCount > 0) {
      mergedGainedItems.forEach(g => { if (g && g.name) summaryParts.push(`獲得 ${g.name}`); });
    }
    Object.keys(currentFactions).forEach(k => {
      const before = statusObj.factions ? statusObj.factions[k] : undefined;
      if (before !== currentFactions[k]) {
        summaryParts.push(before === undefined ? `新勢力：${k}` : `${k.replace(/\s*\(.*\)$/, '')}→${String(currentFactions[k]).slice(0, 24)}`);
      }
    });
    newContactNames.forEach(k => summaryParts.push(`📇 取得聯絡方式：${k.replace(/\s*\(.*\)$/, '')}`));
    rumorRes.changes.forEach(c => summaryParts.push(`📢 流言${c}`));
    if (aiPosts.length > 0) summaryParts.push(`📱 論壇新增 ${aiPosts.length} 則目擊`);
    if (summaryParts.length > 0 && outcome !== 'FATAL_DEATH') {
      formattedStory += `\n\n【本回合結算】${summaryParts.join('｜')}`;
    }

    row[31] = serializeMeta_(meta);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();

    const updatedStatus = parseSaveRow_(row);
    let presentList = Array.isArray(turnJson.present_chars) && turnJson.present_chars.length > 0
      ? turnJson.present_chars.slice(0, 4)
      : [{ id: updatedStatus.servant1.id, use_np: false, action_en: 'standing, focused expression' }];

    if (outcome === 'FATAL_DEATH') {
      presentList = [
        { id: 'player_master', use_np: false, action_en: 'crying, reaching out hand, bittersweet smile' },
        { id: updatedStatus.servant1.id, use_np: false, action_en: 'reaching out hand, solemn expression' }
      ];
      turnJson.scene_env_en = 'corrupted grail black mud, dark shadow tentacles, ethereal golden light, surreal dreamscape, tragic atmosphere, dramatic lighting';
    } else if (outcome === 'TRUE_VICTORY') {
      turnJson.scene_env_en = 'golden greater grail in night sky, dawn sunlight piercing clouds, triumphant atmosphere, floating light particles, wide shot';
    }

    presentList = ensureMasterPresentInList_(presentList, isCombatTurn);

    const imgPayload = buildNaiPayloadFromScene_(
      updatedStatus,
      presentList,
      turnJson.scene_env_en || 'fuyuki city, night, dramatic lighting',
      isCombatTurn,
      userAction,
      formattedStory,
      turnNum
    );
    const timeLocHeader = `Day ${updatedStatus.day}・${updatedStatus.timePeriod} (${updatedStatus.location})`;

    appendPlayerChatLog_(
      ss,
      cleanName,
      turnNum,
      timeLocHeader,
      userAction,
      formattedStory,
      presentList.map(c => c.id).join(', '),
      JSON.stringify(imgPayload),
      ''
    );
    pruneOldChatLogPayloads_(ss, cleanName);

    return {
      status: updatedStatus,
      story: formattedStory,
      outcomeType: outcome,
      tigerDojoTip: turnJson.tiger_dojo_tip || '',
      imagePayload: imgPayload,
      needImage: updatedStatus.autoImage
    };
  } finally {
    if (lockHeld) lock.releaseLock();
  }
}

// ==================== 4. 快捷操作：一鍵換裝、消耗令咒急充、重骰CG ====================

function changeCharacterOutfit(playerName, targetCharId, newOutfitZhOrReset) {
  const cleanName = validatePlayerName_(playerName);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const charDb = getCharAppearanceMap_(ss);
  if (!charDb[targetCharId]) throw new Error('無效的角色 ID');

  let finalOutfitTags = '';
  if (newOutfitZhOrReset === 'RESET_DEFAULT') {
    finalOutfitTags = charDb[targetCharId].defaultOutfit;
  } else if (isNudeOutfitTags_(newOutfitZhOrReset)) {
    finalOutfitTags = 'nude, completely nude, no clothes';
  } else {
    const res = callGeminiLite_(
      'Translate this Traditional Chinese outfit description into precise English Danbooru clothing/accessory tags for NovelAI V5 ONLY (NO hair, NO eyes, NO body type, NO art style, NO background). Expand colloquial Chinese into clear garment, color, and material tags. If nude/unclothed, output "nude, completely nude, no clothes". Output ONLY comma-separated English tags.',
      newOutfitZhOrReset,
      0.15,
      300,
      false
    );
    finalOutfitTags = res.text.trim();
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];
    const outfits = safeJsonParse_(row[28], {});
    outfits[targetCharId] = finalOutfitTags;
    row[28] = JSON.stringify(outfits);
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return { status: parseSaveRow_(row), appliedTags: finalOutfitTags };
  } finally {
    lock.releaseLock();
  }
}

function useCommandSpell(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    const row = saveSheet.getRange(rowIndex, 1, 1, 32).getValues()[0];

    const spells = Number(row[16]);
    if (spells <= 0) throw new Error('你的三劃令咒已經全部耗盡了！');

    const meta = safeJsonParse_(row[31], {});
    const maxMp = Number(meta.maxMp) || 120;

    row[16] = spells - 1;
    row[15] = maxMp;
    meta.masterCondition = '完好無損';
    meta.servantCondition = '靈基穩定 (魔力充盈)';
    row[31] = serializeMeta_(meta);

    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([row]);
    SpreadsheetApp.flush();
    return parseSaveRow_(row);
  } finally {
    lock.releaseLock();
  }
}

function retrySceneImage(imgPayload, artStyleOverride) {
  if (!imgPayload) throw new Error('沒有可重骰的畫面資料！');
  const cloned = JSON.parse(JSON.stringify(imgPayload));
  delete cloned._directorContext;
  cloned.seed = Math.floor(Math.random() * 4294967295);
  if (artStyleOverride && ART_STYLE_PRESETS_[artStyleOverride]) cloned.artStyle = artStyleOverride;
  const result = generateNovelAIImageSafe_(cloned);
  result.resolvedPayload = cloned;
  return result;
}

// 把「導演翻譯後」的 payload 回寫到 ChatLog 對應回合，讓重新讀檔後重骰仍保留裸體／戰鬥裝等覆寫
function updateChatLogImagePayload_(ss, playerName, turn, payload) {
  try {
    if (!playerName || turn === undefined || turn === null) return;
    const sheet = ss.getSheetByName('ChatLog');
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 2) return;

    const str = JSON.stringify(payload);
    if (str.length > 48000) return;

    const keys = sheet.getRange(2, 1, last - 1, 2).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (String(keys[i][0]).trim() === playerName && Number(keys[i][1]) === Number(turn)) {
        sheet.getRange(i + 2, 8).setValue(str);
        return;
      }
    }
  } catch (e) {
    // 回寫失敗不影響遊戲進行
  }
}

// ==================== 5. NAI V5 專職視覺導演 & 純畫面繪圖 ====================

// NAI V4 以後的多角色規則：「1girl / 2girls / solo」這類人數標籤只放在主提示詞，
// 每個角色欄位改以 girl / boy 開頭，避免人數判斷錯亂與特徵互相污染
function normalizeCharCoreForNai_(coreStr, gender) {
  const parts = String(coreStr || '').split(',').map(x => x.trim()).filter(Boolean)
    .filter(t => !/^\d+\s*(girl|boy)s?$/i.test(t) && !/^(solo|multiple (girls|boys|characters))$/i.test(t) && !/^(girl|boy)$/i.test(t));
  return [gender === 'boy' ? 'boy' : 'girl'].concat(parts).join(', ');
}

function stripCountTags_(str) {
  return String(str || '').split(',').map(x => x.trim()).filter(Boolean)
    .filter(t => !/^\d+\s*(girl|boy)s?$/i.test(t) && !/^(solo|multiple (girls|boys|characters))$/i.test(t))
    .join(', ');
}

function resolveCharacterVisualProfile_(charId, dbInfo, statusObj, userAction, storyText, isCombat) {
  const gender = (charId === 'player_master')
    ? (statusObj.master.gender === 'boy' ? 'boy' : 'girl')
    : ((dbInfo && dbInfo.gender === 'boy') ? 'boy' : 'girl');

  const rawCore = (charId === 'player_master')
    ? String(statusObj.master.coreTags || '').trim()
    : String((dbInfo && dbInfo.coreTraits) || '').trim();

  let rawOutfit = String((statusObj.outfits && statusObj.outfits[charId]) || '').trim();
  if (!rawOutfit) {
    rawOutfit = String((dbInfo && dbInfo.defaultOutfit) || '').trim();
  }

  rawOutfit = autoAdaptSmartOutfit_(
    charId,
    rawOutfit,
    dbInfo || {},
    userAction,
    storyText,
    isCombat,
    statusObj.locationKey
  );

  const combinedUc = String((dbInfo && dbInfo.uc) || '').trim();

  return {
    gender: gender,
    core: rawCore,
    outfit: rawOutfit,
    uc: combinedUc
  };
}

// 專職 NAI V5 視覺導演／翻譯官：劇情優先換裝 + 動態場地背景 + 鏡頭語言 + 多人互動語法（不鎖定座標，交由 AI's Choice 構圖）
// 劇情摘錄：保留開頭交代與結尾（最新畫面），中間省略，避免最關鍵的結尾被截掉
function excerptForDirector_(storyText) {
  const t = String(storyText || '').replace(/【時段推進[\s\S]*$/, '').trim();
  if (t.length <= 1600) return t;
  return t.slice(0, 300) + '\n……\n' + t.slice(-1300);
}

function translateSceneToNaiV5_(directorCtx) {
  const charSummary = (directorCtx.chars || []).map(c =>
    `- id: "${c.id}", name: "${c.name}", gender: "${c.gender}", use_np: ${Boolean(c.use_np)}, reference_outfit: "${c.referenceOutfit || ''}", battle_outfit: "${c.battleOutfit || ''}", hint: "${c.hint || ''}"`
  ).join('\n');

  const systemPrompt = [
    'You are an elite Visual Director & NovelAI Diffusion V5 Prompt Translator.',
    'Read the Traditional Chinese RPG story excerpt and translate the single most cinematic moment into a NovelAI V5 hybrid English prompt.',
    'RULES FOR NOVELAI V5:',
    '1. Language: 100% ENGLISH ONLY. Combine crisp Danbooru tags with 1 short vivid English natural-language clause for mood, spatial relation, or lighting.',
    '2. OUTFIT FOLLOWS STORY FIRST (CRITICAL): "reference_outfit" is ONLY a fallback default. Always override it based on the actual scene:',
    '   - Bathing / showering / hot spring / undressing / nude scene: MUST set "is_nude": true and "outfit": "nude, completely nude, no clothes" (add "wet skin, steam" if bathing).',
    '   - Combat / fighting / ambush / night raid: MUST wear combat-ready attire (use "battle_outfit" or appropriate battle gear/armor).',
    '   - Sleeping / bed / changing clothes: Wear appropriate pajamas/nightwear or whatever the story explicitly describes.',
    '   - Normal scene with no outfit change: Use "reference_outfit" (translate it into clean English Danbooru tags if it is in Chinese).',
    '   - Never put hair color, eye color, body type or character names inside "outfit"; those come from a fixed character sheet.',
    '3. Depict the moment described at the END of the excerpt (the current state), not an earlier event.',
    '4. Scene (scene_prompt): Do NOT include count tags (1girl, 2girls, solo, multiple characters) — they are added automatically. Camera framing ("close-up", "medium shot", "wide shot", "over-the-shoulder shot", "low angle", "dutch angle") + setting + current site modifications/atmosphere + lighting. NO hair/eyes/clothes, NO text/speech bubbles.',
    '5. Characters (char_directions): For each present character output (keep every character\'s tags strictly in its own entry so features do not bleed between characters):',
    '   - "id": exact character id.',
    '   - "is_nude": boolean (true if unclothed/bathing/nude in this scene).',
    '   - "outfit": final English Danbooru clothing tags for THIS EXACT SCENE.',
    '   - "action": pose, expression, gaze, weapon/prop action in English (NO hair/eyes color).',
    '   - "interaction": ONLY if 2+ characters directly interact, use NAI V5 syntax ("source#<action>" + "target#<action>", or "mutual#<action>"). Empty string "" otherwise.',
    'Output strictly valid JSON: { "scene_prompt": "...", "char_directions": [{ "id": "...", "is_nude": false, "outfit": "...", "action": "...", "interaction": "" }] }'
  ].join('\n');

  const userMsg = [
    `Location & Time: ${directorCtx.location} (${directorCtx.timePeriod})`,
    directorCtx.locationDesc ? `Current Site Appearance/Modifications: ${directorCtx.locationDesc}` : '',
    `Is Combat: ${Boolean(directorCtx.isCombat)}`,
    `Adult Mode: ${Boolean(directorCtx.adultMode)}`,
    `Player Action: ${directorCtx.userAction || ''}`,
    `Present Characters:\n${charSummary}`,
    `Story Excerpt (the END is the current moment):\n${excerptForDirector_(directorCtx.storyText)}`
  ].filter(Boolean).join('\n\n');

  try {
    return callGeminiLiteJson_(systemPrompt, userMsg, 0.35, 1000);
  } catch (e) {
    return null;
  }
}

function buildNaiPayloadFromScene_(statusObj, presentChars, sceneEnvEn, isCombat, userAction, storyText, turnNum) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const charDb = getCharAppearanceMap_(ss);

  const validChars = presentChars.filter(c => c && charDb[c.id]).slice(0, 4);
  let girls = 0;
  let boys = 0;
  let anyNpActive = false;
  let anyNude = false;

  const charSlots = validChars.map((c, idx) => {
    const dbInfo = charDb[c.id] || {};
    const profile = resolveCharacterVisualProfile_(c.id, dbInfo, statusObj, userAction, storyText, isCombat);

    const nudeMode = isNudeOutfitTags_(profile.outfit) || /全裸|裸體|沒穿|赤裸|一絲不掛|\b(nude|naked|no clothes|topless)\b/i.test(String(c.action_en || ''));
    const normCore = normalizeCharCoreForNai_(profile.core, profile.gender);
    const core = nudeMode ? stripClothesFromCore_(normCore) : normCore;
    if (nudeMode) anyNude = true;
    const weightedOutfit = formatCharacterOutfitPrompt_(nudeMode && !isNudeOutfitTags_(profile.outfit) ? 'nude, completely nude, no clothes' : profile.outfit);
    const directAction = String(c.action_en || '').trim();

    if (profile.gender === 'boy') boys++;
    else girls++;

    let npBoost = '';
    if (c.use_np && NP_VISUAL_EFFECTS_[c.id]) {
      npBoost = NP_VISUAL_EFFECTS_[c.id];
      anyNpActive = true;
    }

    return {
      id: c.id,
      baseCore: normCore,
      weightedOutfit: weightedOutfit,
      npBoost: npBoost,
      prompt: [core, weightedOutfit, directAction, npBoost].filter(Boolean).join(', '),
      uc: profile.uc,
      gender: profile.gender,
      x: 0.5,
      y: 0.5
    };
  });

  const countTags = [];
  if (girls === 1) countTags.push('1girl');
  else if (girls > 1) countTags.push(`${girls}girls`);
  if (boys === 1) countTags.push('1boy');
  else if (boys > 1) countTags.push(`${boys}boys`);
  if (girls + boys === 1) countTags.push('solo');
  else if (girls + boys > 1) countTags.push('multiple characters');

  const combatEnvTags = (isCombat || anyNpActive)
    ? 'dynamic action, magic energy sparks, motion blur, dramatic rim lighting'
    : '';

  // 成人模式開啟且畫面有裸露時，主提示詞補上 nsfw（V4 以後的模型沒有這個標籤時常會自動補衣服或遮擋）
  const adultMode = Boolean(statusObj.adultMode);
  const ratingTag = (adultMode && anyNude) ? 'nsfw' : '';
  const finalScenePrompt = [...countTags, ratingTag, stripCountTags_(sceneEnvEn), combatEnvTags].filter(Boolean).join(', ');

  return {
    prompt: finalScenePrompt,
    countPrefix: countTags.join(', '),
    adultMode: adultMode,
    combatEnvTags: combatEnvTags,
    artStyle: statusObj.artStyle || 'official',
    characters: charSlots,
    width: 1216,
    height: 832,
    steps: 28,
    scale: 5.0,
    cfgRescale: 0.25,
    sampler: 'k_euler_ancestral',
    noiseSchedule: 'karras',
    model: 'nai-diffusion-5-full',
    autoQuality: true,
    _player: statusObj.playerName || '',
    _turn: (turnNum !== undefined && turnNum !== null) ? Number(turnNum) : null,
    _directorContext: {
      location: statusObj.location || '',
      locationDesc: (statusObj.locationInfo && statusObj.locationInfo.desc) ? String(statusObj.locationInfo.desc) : '',
      timePeriod: statusObj.timePeriod || '',
      isCombat: Boolean(isCombat || anyNpActive),
      adultMode: adultMode,
      userAction: String(userAction || ''),
      storyText: String(storyText || ''),
      chars: validChars.map((c, idx) => {
        const dbInfo = charDb[c.id] || {};
        const refOutfit = String((statusObj.outfits && statusObj.outfits[c.id]) || dbInfo.defaultOutfit || '').trim();
        return {
          id: c.id,
          name: dbInfo.triggers ? dbInfo.triggers.split(',')[0] : c.id,
          gender: charSlots[idx].gender,
          use_np: Boolean(c.use_np),
          referenceOutfit: refOutfit,
          battleOutfit: String(dbInfo.defaultOutfit || refOutfit).trim(),
          hint: String(c.action_en || '')
        };
      })
    }
  };
}

function generateTurnCgAsync(imgPayload) {
  if (!imgPayload) throw new Error('無場景資料');
  const working = JSON.parse(JSON.stringify(imgPayload));
  let directedApplied = false;

  if (working._directorContext) {
    const directed = translateSceneToNaiV5_(working._directorContext);
    if (directed) {
      directedApplied = true;
      const directedNude = Array.isArray(directed.char_directions) && directed.char_directions.some(d => d && (Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit)));
      const alreadyNude = /(^|,\s*)nsfw(\s*,|$)/.test(String(working.prompt || ''));
      const ratingTag = (working.adultMode && (directedNude || alreadyNude)) ? 'nsfw' : '';
      if (directed.scene_prompt) {
        working.prompt = [working.countPrefix, ratingTag, stripCountTags_(directed.scene_prompt), working.combatEnvTags].filter(Boolean).join(', ');
      } else if (ratingTag && !alreadyNude) {
        working.prompt = [working.countPrefix, ratingTag, stripCountTags_(working.prompt)].filter(Boolean).join(', ');
      }
      if (Array.isArray(directed.char_directions) && Array.isArray(working.characters)) {
        const dirMap = {};
        directed.char_directions.forEach(d => { if (d && d.id) dirMap[d.id] = d; });

        working.characters = working.characters.map(ch => {
          const d = dirMap[ch.id];
          if (!d) return ch;

          const isNude = Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit);
          const finalCore = isNude ? stripClothesFromCore_(ch.baseCore) : ch.baseCore;
          const finalOutfit = d.outfit
            ? formatCharacterOutfitPrompt_(isNude ? 'nude, completely nude, no clothes' : d.outfit)
            : ch.weightedOutfit;

          const actionParts = [d.interaction, d.action].filter(Boolean).join(', ');

          return Object.assign({}, ch, {
            prompt: [finalCore, finalOutfit, actionParts, ch.npBoost].filter(Boolean).join(', ')
          });
        });
      }
    }
    delete working._directorContext;
  }

  const result = generateNovelAIImageSafe_(working);
  result.resolvedPayload = working;

  // 生圖成功後，把翻譯後的 payload 回寫 ChatLog（僅限本次有執行導演翻譯者）
  if (directedApplied && working._player && working._turn !== null && working._turn !== undefined) {
    updateChatLogImagePayload_(SpreadsheetApp.getActiveSpreadsheet(), working._player, working._turn, working);
  }

  return result;
}

function generateNovelAIImageSafe_(params) {
  const naiKey = getNovelAIKey_();

  // 生圖使用獨立的 UserLock，不與回合推演的 ScriptLock 互相卡住
  const naiLock = LockService.getUserLock();
  naiLock.waitLock(25000);

  try {
    const defaultUc = 'lowres, bad, error, fewer, extra, missing, worst quality, bad quality, jpeg artifacts, film grain, scan artifacts, watermark, signature, username, scan, extra digits, bad anatomy, bad hands, multiple arms, extra hands, artistic error, displeasing, censored, mosaic censoring, bar censor, text, speech bubble, caption';
    const cleanedChars = (Array.isArray(params.characters) ? params.characters : []).filter(c => String(c.prompt || '').trim().length > 0);

    const styleKey = params.artStyle || 'official';
    const styleTags = ART_STYLE_PRESETS_[styleKey] || ART_STYLE_PRESETS_['official'];

    let finalPrompt = String(params.prompt || '').trim();
    if (styleTags) {
      finalPrompt = finalPrompt ? `${finalPrompt}, ${styleTags}` : styleTags;
    }
    if (params.autoQuality !== false) {
      finalPrompt = finalPrompt ? `${finalPrompt}, very aesthetic, masterpiece, high complexity, no text` : 'very aesthetic, masterpiece, high complexity, no text';
    }
    const finalUc = params.uc ? `${defaultUc}, ${params.uc}` : defaultUc;

    const seed = params.seed && Number(params.seed) > 0 ? Number(params.seed) : Math.floor(Math.random() * 4294967295);
    const useCoords = false;

    const charCaptions = cleanedChars.map(c => ({
      char_caption: c.prompt,
      centers: [{ x: 0.5, y: 0.5 }]
    }));

    const ucCharCaptions = cleanedChars.map(c => ({
      char_caption: c.uc || '',
      centers: [{ x: 0.5, y: 0.5 }]
    }));

    const payload = {
      input: finalPrompt,
      model: params.model || 'nai-diffusion-5-full',
      action: 'generate',
      parameters: {
        params_version: 4,
        width: Number(params.width) || 1216,
        height: Number(params.height) || 832,
        scale: Number(params.scale) || 5.0,
        sampler: params.sampler || 'k_euler_ancestral',
        steps: Math.min(Number(params.steps) || 28, 28),
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: false,
        autoSmea: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: true,
        cfg_rescale: typeof params.cfgRescale === 'number' ? params.cfgRescale : 0.25,
        noise_schedule: params.noiseSchedule || 'karras',
        legacy_v3_extend: false,
        skip_cfg_above_sigma: null,
        use_coords: useCoords,
        seed: seed,
        characterPrompts: cleanedChars.map(c => ({
          prompt: c.prompt,
          uc: c.uc || '',
          center: { x: 0.5, y: 0.5 },
          enabled: true
        })),
        v4_prompt: {
          caption: { base_caption: finalPrompt, char_captions: charCaptions },
          use_coords: useCoords,
          use_order: true
        },
        v4_negative_prompt: {
          caption: { base_caption: finalUc, char_captions: ucCharCaptions },
          legacy_uc: false
        },
        negative_prompt: finalUc
      }
    };

    let lastError = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = UrlFetchApp.fetch('https://image.novelai.net/ai/generate-image', {
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + naiKey, Accept: '*/*' },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const code = response.getResponseCode();
        if (code === 200) {
          const zipBlob = response.getBlob().setContentType('application/zip');
          const unzipped = Utilities.unzip(zipBlob);
          if (!unzipped || unzipped.length === 0) {
            lastError = '(200): 回傳壓縮檔為空';
            continue;
          }
          const imgBase64 = Utilities.base64Encode(unzipped[0].getBytes());
          return {
            base64: 'data:image/png;base64,' + imgBase64,
            seed: seed,
            promptDebug: finalPrompt
          };
        } else if ((code === 429 || code >= 500) && attempt < 3) {
          lastError = `(${code}): ${response.getContentText()}`;
          Utilities.sleep(2500 * attempt);
        } else {
          lastError = `(${code}): ${response.getContentText()}`;
          break;
        }
      } catch (reqErr) {
        lastError = `(例外): ${reqErr && reqErr.message ? reqErr.message : String(reqErr)}`;
        if (attempt < 3) {
          Utilities.sleep(2500 * attempt);
        }
      }
    }
    throw new Error(`NovelAI 生圖失敗 ${lastError}`);
  } finally {
    naiLock.releaseLock();
  }
}

// ==================== 6. 內部資料庫讀取與輔助函式 ====================

function callOpenRouterChat_(apiKey, model, systemPrompt, userMessage, temperature, maxTokens, jsonMode) {
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: temperature,
    max_tokens: maxTokens
  };
  if (jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://script.google.com',
      'X-Title': 'FATE GAS RPG'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code !== 200) throw new Error(`OpenRouter (${code}): ${body}`);

  const json = JSON.parse(body);
  const rawContent = json && json.choices && json.choices[0] && json.choices[0].message
    ? json.choices[0].message.content
    : '';
  if (!rawContent) throw new Error('OpenRouter 回傳內容為空');

  let text = String(rawContent).trim();
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return { text: text };
}

function getCharAppearanceMap_(ss) {
  if (CHAR_DB_MEMO_) return CHAR_DB_MEMO_;
  const cached = readConfigCache_(CONFIG_CACHE_KEYS_[0]);
  if (cached) {
    CHAR_DB_MEMO_ = cached;
    return cached;
  }
  const map = readCharAppearanceSheet_(ss || SpreadsheetApp.getActiveSpreadsheet());
  CHAR_DB_MEMO_ = map;
  writeConfigCache_(CONFIG_CACHE_KEYS_[0], map);
  return map;
}

function readCharAppearanceSheet_(ss) {
  const sheet = ss.getSheetByName('Char_Appearance');
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]).trim();
    if (!id) continue;
    const rawSummon = data[i].length > 6 ? data[i][6] : '';
    const hasSummonFlag = rawSummon !== '' && rawSummon !== null && rawSummon !== undefined;
    let summonFlag = hasSummonFlag ? (rawSummon === true || String(rawSummon).trim().toUpperCase() === 'TRUE') : null;
    if (id === 'saber_alter') {
      summonFlag = false;
    }
    map[id] = {
      id: id,
      triggers: String(data[i][1] || ''),
      gender: String(data[i][2] || 'girl').trim(),
      coreTraits: String(data[i][3] || '').trim(),
      defaultOutfit: String(data[i][4] || '').trim(),
      uc: String(data[i][5] || '').trim(),
      summonable: summonFlag
    };
  }
  return map;
}

function getSummonableServantsList_(charDb) {
  const nonServants = new Set(['player_master', 'shirou', 'rin', 'sakura', 'dark_sakura', 'saber_alter', 'illya', 'kirei', 'souichirou']);
  return Object.keys(charDb)
    .filter(id => {
      if (id === 'saber_alter') return false;
      const ch = charDb[id];
      if (!ch) return false;
      if (ch.summonable !== null && ch.summonable !== undefined) {
        return ch.summonable === true;
      }
      return !nonServants.has(id) && ch.gender === 'girl';
    })
    .map(id => ({
      id: id,
      name: charDb[id].triggers.split(',')[0].trim(),
      gender: charDb[id].gender
    }));
}

// 陣營初始狀態：讀取試算表 D 欄「預設狀態」與 E 欄「預設態度」，格式例如「存活 (中立警戒)」
function getDefaultFactionsState_(ss) {
  if (!DEFAULT_FACTIONS_MEMO_) {
    DEFAULT_FACTIONS_MEMO_ = readConfigCache_(CONFIG_CACHE_KEYS_[2]);
  }
  if (!DEFAULT_FACTIONS_MEMO_) {
    DEFAULT_FACTIONS_MEMO_ = readDefaultFactionsSheet_(ss);
    writeConfigCache_(CONFIG_CACHE_KEYS_[2], DEFAULT_FACTIONS_MEMO_);
  }
  return Object.assign({}, DEFAULT_FACTIONS_MEMO_);
}

function readDefaultFactionsSheet_(ss) {
  const sheet = ss.getSheetByName('Factions_Relations');
  const res = {};
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        const st = String(data[i][3] || '').trim() || '存活';
        const att = String(data[i][4] || '').trim();
        res[String(data[i][0]).trim()] = att ? `${st} (${att})` : st;
      }
    }
  }
  CANONICAL_7_FACTIONS_.forEach(r => {
    if (!res[r[0]]) {
      res[r[0]] = `${r[3]} (${r[4]})`;
    }
  });
  return res;
}

function getLorebookRows_(ss) {
  if (LORE_ROWS_MEMO_) return LORE_ROWS_MEMO_;
  let rows = readConfigCache_(CONFIG_CACHE_KEYS_[1]);
  if (!rows) {
    const sheet = ss.getSheetByName('Lorebook');
    const data = sheet ? sheet.getDataRange().getValues() : [];
    rows = [];
    for (let i = 1; i < data.length; i++) {
      const content = String(data[i][3] || '').trim();
      if (!content) continue;
      rows.push({
        keywords: String(data[i][0] || '').split(',').map(k => k.trim()).filter(Boolean),
        priority: Number(data[i][2]) || 5,
        content: content
      });
    }
    writeConfigCache_(CONFIG_CACHE_KEYS_[1], rows);
  }
  LORE_ROWS_MEMO_ = rows;
  return rows;
}

function searchLorebook_(ss, contextText) {
  const hits = [];
  getLorebookRows_(ss).forEach(r => {
    if (r.priority >= 10 || r.keywords.some(kw => contextText.includes(kw))) {
      hits.push(`- ${r.content}`);
    }
  });
  return hits.join('\n');
}

function findPlayerRowIndex_(saveSheet, playerName) {
  const last = saveSheet.getLastRow();
  if (last < 2) return -1;
  const names = saveSheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === playerName) return i + 2;
  }
  return -1;
}

function parseSaveRow_(row) {
  const originName = String(row[12] || '時鐘塔叛逃魔術師');
  const originPreset = ORIGIN_PRESETS_[originName] || ORIGIN_PRESETS_['時鐘塔叛逃魔術師'];
  const resolvedLoc = resolveFuyukiLocation_(row[10]);
  const gameMode = String(row[3] || 'WAR');

  let meta = {
    status: 'ACTIVE',
    wins: 0,
    losses: 0,
    artStyle: 'official',
    gameTone: 'BALANCED',
    wish: '奪得大聖杯，實現心中夙願',
    masterCondition: '完好無損',
    servantCondition: '靈基穩定',
    servant2Condition: '靈基穩定',
    masterParams: Object.assign({}, originPreset.params),
    maxMp: originPreset.maxMp,
    inventory: [],
    mapHotspot: '冬木大橋',
    warTicker: '冬木市七組陣營與獨立第 8 組正暗中偵察靈脈動向。',
    bondLevel: Number(row[21]) || 25,
    customLocationNotes: {},
    phoneState: null
  };
  try {
    if (row[31]) meta = Object.assign(meta, JSON.parse(row[31]));
  } catch (e) {}

  const parsedFactions = safeJsonParse_(row[29], {});
  const parsedOutfits = safeJsonParse_(row[28], {});
  const mapHotspot = String(meta.mapHotspot || '冬木大橋');
  const customNotes = (meta.customLocationNotes && typeof meta.customLocationNotes === 'object') ? meta.customLocationNotes : {};

  const dynamicLocations = {};
  Object.keys(FUYUKI_LOCATIONS_).forEach(k => {
    dynamicLocations[k] = computeDynamicLocationInfo_(k, FUYUKI_LOCATIONS_[k], parsedFactions, mapHotspot, gameMode, customNotes);
  });

  const currentDynamicLoc = dynamicLocations[resolvedLoc.key] || resolvedLoc.info;
  const bondVal = Math.max(0, Math.min(100, Number(meta.bondLevel != null ? meta.bondLevel : (row[21] || 25))));
  const toneVal = normalizeGameToneKey_(meta.gameTone);
  const syncedPhone = syncPhoneStateWithFactions_(meta.phoneState, parsedFactions, Number(row[6]) || 1, String(row[7] || '深夜'), '');

  return {
    playerName: String(row[0]),
    lastLogin: String(row[1]),
    gamePhase: String(row[2]),
    runStatus: meta.status || 'ACTIVE',
    wins: Number(meta.wins) || 0,
    losses: Number(meta.losses) || 0,
    gameMode: gameMode,
    gameTone: toneVal,
    autoImage: String(row[4]).toUpperCase() === 'TRUE',
    adultMode: String(row[5]).toUpperCase() === 'TRUE',
    keyEvents: Array.isArray(meta.keyEvents) ? meta.keyEvents : [],
    rumors: Array.isArray(meta.rumors) ? meta.rumors : [],
    smsContacts: (meta.smsContacts && typeof meta.smsContacts === 'object') ? meta.smsContacts : {},
    routeTendency: meta.routeTendency || {},
    activeRoute: meta.activeRoute || '',
    routeDefs: Object.keys(ROUTE_DEFS_).map(k => ({ key: k, name: ROUTE_DEFS_[k].name, hint: ROUTE_DEFS_[k].hint })),
    artStyle: meta.artStyle || 'official',
    day: Number(row[6]),
    timePeriod: String(row[7]),
    ap: Number(row[8]),
    maxAp: 3,
    threatLevel: Number(row[9]),
    bondLevel: bondVal,
    location: currentDynamicLoc.fullName,
    locationKey: resolvedLoc.key,
    locationInfo: currentDynamicLoc,
    dynamicLocations: dynamicLocations,
    mapHotspot: mapHotspot,
    warTicker: String(meta.warTicker || ''),
    inventory: Array.isArray(meta.inventory) ? meta.inventory : [],
    phoneState: syncedPhone,
    master: {
      gender: String(row[11]),
      origin: originName,
      wish: String(meta.wish || ''),
      coreTags: String(row[13]),
      mp: Number(row[15]),
      maxMp: Number(meta.maxMp) || originPreset.maxMp,
      commandSpells: Number(row[16]),
      condition: String(meta.masterCondition || '完好無損'),
      params: meta.masterParams || originPreset.params
    },
    servant1: {
      id: String(row[17]),
      class: String(row[18]),
      name: String(row[19]),
      condition: String(meta.servantCondition || '靈基穩定'),
      params: String(row[22])
    },
    servant2: {
      id: String(row[23]),
      class: String(row[24]),
      name: String(row[25]),
      condition: String(meta.servant2Condition || '靈基穩定')
    },
    outfits: parsedOutfits,
    factions: parsedFactions,
    memorySummary: String(row[30])
  };
}

// 由最新往回掃描，湊滿 limit 筆即停止（不再完整走訪整張表）
function getPlayerChatLogs_(ss, playerName, limit) {
  const sheet = ss.getSheetByName('ChatLog');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const names = sheet.getRange(2, 1, last - 1, 1).getValues();
  const rowNums = [];
  for (let i = names.length - 1; i >= 0 && rowNums.length < limit; i--) {
    if (String(names[i][0]).trim() === playerName) rowNums.unshift(i + 2);
  }
  if (rowNums.length === 0) return [];

  // 讀取涵蓋這些列的最小區塊（5 人內的小圈子，區塊很小），再挑出本人的列
  const first = rowNums[0];
  const block = sheet.getRange(first, 1, rowNums[rowNums.length - 1] - first + 1, 9).getValues();
  return rowNums.map(r => {
    const d = block[r - first];
    return {
      turn: d[1],
      timeLoc: d[3],
      user: d[4],
      ai: d[5],
      chars: d[6],
      imgPayload: d[7]
    };
  });
}

// 清掉同一玩家較舊回合的繪圖 payload（H 欄），只保留最近 CHATLOG_PAYLOAD_KEEP 回合；劇情文字不動
function pruneOldChatLogPayloads_(ss, playerName) {
  try {
    const sheet = ss.getSheetByName('ChatLog');
    const last = sheet.getLastRow();
    if (last < 2) return;
    const names = sheet.getRange(2, 1, last - 1, 1).getValues();
    const mine = [];
    for (let i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim() === playerName) mine.push(i + 2);
    }
    if (mine.length <= CHATLOG_PAYLOAD_KEEP) return;
    const targets = mine.slice(0, mine.length - CHATLOG_PAYLOAD_KEEP);
    // 只檢查最近的一段（舊的早就清過了），每次最多處理 40 列
    const recentTargets = targets.slice(-40);
    const firstRow = recentTargets[0];
    const span = recentTargets[recentTargets.length - 1] - firstRow + 1;
    const hVals = sheet.getRange(firstRow, 8, span, 1).getValues();
    recentTargets.forEach(r => {
      if (String(hVals[r - firstRow][0] || '') !== '') sheet.getRange(r, 8).setValue('');
    });
  } catch (e) {
    // 清理失敗不影響遊戲
  }
}

function appendPlayerChatLog_(ss, playerName, turn, timeLoc, userAction, aiStory, chars, imgPayloadStr, seed) {
  const sheet = ss.getSheetByName('ChatLog');
  const nowStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
  // 單一儲存格上限約 50000 字元，超長內容安全截斷
  const safeStory = String(aiStory || '').slice(0, 45000);
  const safePayload = String(imgPayloadStr || '').slice(0, 48000);
  sheet.appendRow([playerName, turn, nowStr, timeLoc, userAction, safeStory, chars, safePayload, seed]);
}

function advanceTimePeriod_(day, currentPeriod) {
  const order = ['清晨', '白天', '黃昏', '深夜'];
  const idx = order.indexOf(currentPeriod);
  if (idx === -1 || idx === order.length - 1) {
    return { day: day + 1, period: '清晨' };
  }
  return { day: day, period: order[idx + 1] };
}

function forceAuthorizeAll() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
  UrlFetchApp.fetch('https://openrouter.ai', { muteHttpExceptions: true });
}
