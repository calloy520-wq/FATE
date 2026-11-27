/**
 * ============================================================
 * FATE 第五次聖杯戰爭 (第8組異常參戰者・NAI V5 視覺導演與全英譯升級版) - Code.gs【修正完整版】
 * 整合機能：
 * 1. NAI V5 專職視覺導演／翻譯層：劇情推演與繪圖翻譯分離，自動轉譯為「英文 Danbooru 標籤＋簡短自然語言」、鏡頭視角、AI's Choice 自動構圖（use_coords: false）、high complexity 品質尾綴與多人互動語法 (source# / target# / mutual#)
 * 2. 服裝「劇情絕對優先」：手動換裝僅作預設參考，洗澡自動脫衣、開打自動換戰鬥裝；全裸後主動穿衣會自動還原
 * 3. 零翻譯重骰 CG：重骰 CG (retrySceneImage) 直接換 Seed 叫 NAI 重畫，不重跑 Gemini 翻譯；導演翻譯後的 payload 會回寫 ChatLog，重新讀檔後重骰仍保留裸體／戰鬥裝
 * 4. 角色資料內建於 GameData.js（summonable 控制開局召喚池），並禁止開局召喚黑 Saber (saber_alter)；試算表只保留 Players_Save 與 ChatLog
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
 * - 陣營初始狀態內建於 CANONICAL_7_FACTIONS_（D 預設狀態／E 預設態度）
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
const SCHEMA_VERSION_ = '2026-11-27-gas-data';
const LORE_MAX_MATCHED = 8;
const LORE_MAX_CHARS = 3200;
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

// 柳洞寺組（Caster＋Assassin 同一陣營）與真 Assassin 路線專用的陣營名稱
const RYUUDOU_FACTION_KEY_ = '柳洞寺組 (Caster/Assassin陣營)';
const ZOUKEN_FACTION_KEY_ = '臟硯組 (真Assassin陣營)';


// 背包道具的固定效果由伺服器結算（AI 不需要、也不應該重複計入）
const ITEM_EFFECTS_ = {
  'mana_gem_s': { mp: 35 },
  'mana_gem_m': { mp: 65 },
  'smoke_bomb': { threat: -15 }
};

const ART_STYLE_PRESETS_ = {
  'official': 'official art, game cg, type-moon, detailed shading',
  'takeuchi': 'takeuchi takashi, type-moon, official art, game cg',
  'ufotable': 'ufotable, anime screencap, cinematic lighting, detailed background',
  'anime': 'anime screencap, cinematic lighting, depth of field, soft glow',
  'painterly': 'painterly, impasto, rich colors, high contrast, dramatic lighting',
  'flat': 'anime coloring, clean lineart, vibrant colors, cel shading',
  'manga': 'monochrome, greyscale, manga style, screentones, high contrast'
};

const GAME_TONE_PRESETS_ = {
  'BALANCED': {
    label: '⚖️ 符合常理（預設）',
    desc: '尊重型月常理與在場人物反應，重劇情、輕卡關，不隨意把非致命小動作判死。',
    directive: '依型月邏輯公平裁定成功與失敗，代價合理。'
  },
  'COMEDY_CHAOS': {
    label: '😄 搞笑鬧劇輕鬆向',
    desc: '輕鬆幽默、鬧劇吐槽與寬容推進合一；在場角色會對偷吃、香味干擾或荒唐怪招做出生動誇張又好笑的反應（不無視），且非極端作死不輕易重創或判死。',
    directive: '寫成搞笑鬧劇：用誇張的動作、漫畫式的反應、角色之間的吐槽製造笑點；荒唐的計畫可以歪打正著或以好笑的方式失敗；玩家幾乎不會受重傷，事後大家多半一臉無奈或爆笑。'
  },
  'STORY_PLAYER_FIRST': {
    label: '🐉 龍傲天模式（玩家無敵）',
    desc: '玩家就是主角：不管想做什麼都能實現，計畫一定成功、敵人被碾壓、眾人震驚折服，爽快至上。',
    directive: '龍傲天爽文：玩家想做的事一定成功，而且成功得漂亮——強敵被碾壓或折服、旁人震驚讚嘆、美人傾心、局勢一面倒；就算再荒唐，也找出型月風格的理由讓它實現（隱藏血統、覺醒、奇蹟、對手輕敵）。玩家與從者幾乎不受傷，結盟一談就成。'
  },
  'HARDCORE_WAR': {
    label: '⚔️ 鐵血嚴重戰場風',
    desc: '戰場肅殺務實，敵人與隊友不會被無關玩笑或偷吃小動作輕易唬住，分心或鬧場會招來冷靜反制與真實戰場後果，勝負與傷勢結算更嚴峻。',
    directive: '嚴峻寫實：強敵會冷靜反制，失誤與莽撞要付出真實的傷勢、魔力或陣營代價（master_condition／servant_condition 確實惡化），不留情面。傷勢會累積：輕傷沒休養又上戰場就惡化成重傷；正面硬碰 Berserker、吉爾伽美什這類強敵幾乎必敗；御主暴露在從者戰場上隨時可能喪命。'
  }
};

// 陣營基準（內建資料，不再讀試算表）
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
    if (s < 0) throw e;
    // 找出第一個完整的 JSON 物件（AI 有時在後面多吐一段文字或第二個物件）
    let depth = 0, inStr = false, esc = false;
    for (let i = s; i < t.length; i++) {
      const ch = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(s, i + 1)); } catch (e3) { break; } } }
    }
    const e2 = t.lastIndexOf('}');
    if (e2 > s) return JSON.parse(t.slice(s, e2 + 1));
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
    const wantsPutOnClothes = /穿上|穿好|換上|套上|披上|遮住|遮起來|穿衣服|穿回|具現|靈衣/.test(dressCheckText);
    // 從者可以瞬間具現靈衣：全裸時一旦開戰或離開據點，自動換回戰鬥裝（御主仍由玩家決定）
    const servantMustArmor = charId !== 'player_master' && (Boolean(isCombat) || (locKey && locKey !== '廢棄洋館'));
    if (!wantsPutOnClothes && !servantMustArmor) {
      return 'nude, completely nude, no clothes';
    }
    if (servantMustArmor && !wantsPutOnClothes) return defaultOutfit || 'casual clothes, shirt, pants';
    // 主動穿衣：還原為預設服裝，若無預設則用一般便服
    return defaultOutfit || 'casual clothes, shirt, pants';
  }

  if (charId !== 'player_master') {
    const casualOutfit = String((dbInfo && dbInfo.casualOutfit) || '').trim();
    const isCasualOrSleepwear = (casualOutfit && cur === casualOutfit) || /睡衣|家居|浴袍|圍裙|便服|居家服|睡覺|洗澡|\b(pajamas|sleepwear|bathrobe|apron|casual clothes|loungewear)\b/i.test(cur);
    const isOutdoorCombatOrPatrol = Boolean(isCombat) || /交戰|戰鬥|迎戰|突襲|夜襲|巡邏|警戒|出擊|戰場|寶具|魔槍|聖劍/.test(combinedText) || (locKey && locKey !== '廢棄洋館');
    if (isOutdoorCombatOrPatrol && isCasualOrSleepwear) {
      return defaultOutfit || cur;
    }
    // 回到據點（本回合結束時人在廢棄洋館）且沒有開戰：還穿著戰鬥靈衣的從者自動換上便服
    // 只看「人在哪、有沒有開戰」，不看對話字眼（玩家在家裡討論「要不要出擊」不代表已經出門）
    if (casualOutfit && locKey === '廢棄洋館' && !isCombat && (cur === defaultOutfit || outfitSimilarity_(cur, defaultOutfit) >= 0.5)) {
      return casualOutfit;
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
          text: `${getContactChannel_(facName).prefix}【同盟聯絡建立】我們與第8組暫時休戰互助。若遇強敵或靈基受損，隨時互通消息。`
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
          text: `${getContactChannel_(facName).prefix}【求援】我們目前處境不妙（${statusText}），急需支援或牽制！第8組能支援嗎？`
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
      if (metaPre.companions && metaPre.companions[targetFac]) {
        throw new Error(`${companionDisplayName_(targetFac)} 就在你身邊，直接在行動欄跟對方說話吧！`);
      }
      if (canSmsFaction_(metaPre, targetFac, stPre)) {
        const thread = (metaPre.phoneState && metaPre.phoneState.smsThreads && metaPre.phoneState.smsThreads[targetFac]) || {};
        aiResult = generateAllySmsReply_(cleanName, targetFac, stPre, Array.isArray(thread.messages) ? thread.messages : [], msg, rowPre, deceive);
      }
    }
  } catch (e) {
    if (/就在你身邊/.test(String(e && e.message))) throw e;
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

    const answeredCall = !(aiResult && aiResult.answered === false);
    const isSupportCall = answeredCall && allied && /支援|趕來|幫忙|救|會合|牽制|協同|一起/.test(msg);
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
    const reaction = !answeredCall ? '；對方沒有回應，訊息沒有送達' : (aiResult && aiResult.reaction ? `；對方反應：${aiResult.reaction}` : '');
    const ch = getContactChannel_(targetFac);
    const note = `玩家用手機${deceive ? '對' : '聯絡'}「${targetFac}」（對方管道：${ch.label}）${deceive ? '放出假情報' : ''}：${msg}${reaction}`;
    meta.pendingSmsNote = [meta.pendingSmsNote, note].filter(Boolean).join('\n').slice(-600);

    if (answeredCall) {
      updateFactionIntel_(meta, factionsObj, { contactFacs: [targetFac], when: `Day ${row[6]}・${row[7]}` });
    }
    if (deceive && answeredCall) {
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
    const channel = getContactChannel_(factionName);
    const recent = (history || []).slice(-6).map(m => `${m.fromPlayer ? playerName : (m.sender || factionName)}：${m.text}`).join('\n');
    const systemPrompt = [
      '你正在扮演 Fate/stay night 第五次聖杯戰爭（2004 年）中的一個陣營，回覆玩家（獨立第8組御主）用手機傳來的聯絡。',
      `這個陣營的聯絡管道：${channel.label}。回覆的人：${channel.who}。寫法：${channel.style}。`,
      channel.prefix ? `回覆一律以「${channel.prefix}」開頭。` : '',
      '照回覆者本人的個性寫，不要旁白、不要署名。',
      '先判斷這次聯絡有沒有接通：依時間（深夜、上學時間）、陣營狀態（交戰中、重傷休整、正在移動）與管道特性（家用電話要有人在家、使魔要找得到人）合理決定。沒接通時 answered 為 false，reply 用一兩句寫出沒有回應的情形，要合乎常理、不要有互相矛盾的細節（例如電話響到自動斷線都沒人接、使魔繞了一圈找不到人飛了回來）。',
      isCapturedOrDefeatedStatusText_(statusText) ? '這個陣營已經淘汰：御主可能已死亡、重傷或躲進教會，多半沒有回應；除非情況顯示御主還活著，才可能回覆，而且是退出戰爭後的口吻。' : '',
      allied
        ? '你們目前是同盟：被要求支援時，依陣營狀態明確表示能否支援、何時、怎麼配合。'
        : '你們不是同盟：依關係與性格回應，可能警戒、試探、挑釁、談條件或冷淡已讀；不要輕易透露自己的弱點。',
      isDeception
        ? '注意：玩家這則簡訊其實是想欺騙你，但你的角色並不知情。依角色的精明程度、手上情報與這則訊息的可信度，自然決定相信、半信半疑或識破。'
        : '',
      '輸出 JSON：{"answered":true,"reply":"80字內的回覆（繁體中文）","believed":"yes / unsure / no（玩家訊息內容你信不信；一般聯絡填 yes）","reaction":"20字內，描述你接下來打算怎麼做（給遊戲紀錄用）"}'
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
    let reply = String((res && res.reply) || '').replace(/^["「『]|["」』]$/g, '').trim().slice(0, 160);
    if (!reply) return null;
    // 統一管道標頭（Gemini 有時用半形括號或漏寫）
    if (channel.prefix) {
      reply = reply.replace(/^[（(][^）)]{1,16}[）)]\s*/, '');
      reply = `${channel.prefix}${reply}`;
    }
    const answered = !(res.answered === false || String(res.answered).toLowerCase() === 'false');
    const believed = /^(yes|unsure|no)$/.test(String(res.believed || '')) ? String(res.believed) : 'unsure';
    return { reply: reply, answered: answered, believed: answered ? believed : 'none', reaction: answered ? String(res.reaction || '').trim().slice(0, 40) : '' };
  } catch (e) {
    return null;
  }
}

// ==================== 各陣營的聯絡管道（玩家用手機送出，但對方依原作設定用不同方式回覆） ====================
const CONTACT_CHANNELS_ = [
  { marker: '臟硯', icon: '🐛', label: '蟲使魔的口信', who: '間桐臟硯', prefix: '（蟲使魔帶來的口信）', style: '一隻蟲使魔爬到玩家身邊，用沙啞的聲音轉述臟硯的話' },
  { marker: '衛宮', icon: '☎', label: '衛宮邸的家用電話', who: '衛宮士郎接聽（有時 Saber 在旁邊插話）', prefix: '（☎ 衛宮邸電話）', style: '寫成電話通話內容（士郎沒有手機，只能打衛宮家的室內電話）' },
  { marker: '遠坂', icon: '🕊', label: '使魔字條（Archer 轉達）', who: '遠坂凜親筆（她沒有手機，訊息由 Archer 轉達）', prefix: '（使魔捎來的字條）', style: '寫成凜親筆的手寫字條，不要寫成她在操作手機' },
  { marker: '間桐', icon: '📱', label: '慎二的手機簡訊', who: '間桐慎二', prefix: '', style: '寫成手機簡訊' },
  { marker: '教會', icon: '✉', label: '教會的回信', who: '言峰綺禮', prefix: '（教會的回信）', style: '寫成簡短的書信體' },
  { marker: '柳洞寺', icon: '☎', label: '柳洞寺的寺廟電話', who: '葛木宗一郎或寺裡的僧人接聽（有時是 Caster 搶過電話）', prefix: '（☎ 柳洞寺電話）', style: '寫成電話通話內容' },
  { marker: '愛因茲貝倫', icon: '🕊', label: '白色小鳥使魔', who: '伊莉雅（有時是女僕瑟拉代筆）', prefix: '（白色小鳥銜來的字條）', style: '寫成字條，伊莉雅的字跡' }
];
const DEFAULT_CONTACT_CHANNEL_ = { icon: '📱', label: '手機簡訊', who: '該陣營的御主', prefix: '', style: '寫成手機簡訊' };

function getContactChannel_(factionName) {
  const f = String(factionName || '');
  return CONTACT_CHANNELS_.find(c => f.includes(c.marker)) || DEFAULT_CONTACT_CHANNEL_;
}

// 能否傳簡訊：同盟陣營，或在劇情中取得了聯絡方式（meta.smsContacts）
function canSmsFaction_(meta, factionKey, statusText) {
  if (isAllianceStatusText_(statusText)) return true;
  if (String(factionKey || '').includes('教會')) return true; // 監督者的教會是公開據點，電話與地址人人皆知
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
    if (!u) return;
    let r = u.id ? list.find(x => x.id === String(u.id).trim()) : null;
    if (!r) {
      // 劇情中自然產生的新傳聞：沒有對應 id、但有內容的，新增為「市井傳聞」
      const newText = String(u.text || u.effect || '').trim();
      if (!newText || /識破|揭穿|平息/.test(String(u.status || ''))) return;
      if (list.some(x => x.text === newText.slice(0, 140))) return;
      list.push({
        id: 'N' + turnNum + '_' + list.length,
        text: newText.slice(0, 140),
        channel: '市井傳聞',
        isFake: false,
        turn: turnNum,
        status: '擴散中',
        believers: [],
        doubters: [],
        effect: '',
        updatedTurn: turnNum
      });
      changes.push(`新傳聞「${newText.slice(0, 12)}…」開始擴散`);
      r = list[list.length - 1];
    }
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
  // 「結盟談判中」「初步結盟意向」「同盟解除」這類還沒成立或已破裂的不算
  return /同盟|結盟|盟友|停戰|互助|合作|友方/.test(s) && !/談判|意向|考慮|提議|拒絕|破裂|解除|背叛|假意|觀望|中止|撕毀|試探|尚未|嘗試|軟化/.test(s);
}

// 結盟要分階段：敵對陣營不會一回合就變同盟，先軟化成談判中（符合常理與鐵血；搞笑、故事模式不限）
function gateFactionAlliance_(prevStatus, newStatus, toneKey, favor) {
  const prev = String(prevStatus || ''), next = String(newStatus || '');
  if (toneKey !== 'BALANCED' && toneKey !== 'HARDCORE_WAR') return next;
  if (!isAllianceStatusText_(next) || isAllianceStatusText_(prev)) return next;
  if (/敵對|獵殺|暗算|防備|追殺|報復|敵意/.test(prev)) return '存活 (態度軟化・談判中)';
  if (favor != null && Number(favor) < 40) return '存活 (態度軟化・談判中)';
  return next;
}

function isCapturedOrDefeatedStatusText_(statusStr) {
  const s = String(statusStr || '');
  return /淘汰|消滅|陣亡|擊潰|覆滅|收服|戰敗|已死|已歸屬第8組|原御主已退場|投降|降伏|被俘/.test(s);
}

// 已被削弱（負傷、重創、劣勢…）的陣營才可能在下一步被淘汰
function isWeakenedStatusText_(statusStr) {
  return /負傷|重傷|重創|瀕|劣勢|休整|受創|受損|敗退|撤退|虛弱|殘存|苟延|潰散|窮途|殘破|崩解/.test(String(statusStr || ''));
}

// 淘汰要分兩步：滿狀態的陣營一回合內最多被打成「重創敗退」，之後的回合才能淘汰（收服、歸屬第8組不受影響）
function gateFactionElimination_(prevStatus, newStatus) {
  const next = String(newStatus || '');
  const isKill = /淘汰|消滅|陣亡|擊潰|覆滅|戰敗|已死/.test(next) && !/收服|已歸屬第8組|原御主已退場/.test(next);
  if (!isKill) return next;
  if (isCapturedOrDefeatedStatusText_(prevStatus) || isWeakenedStatusText_(prevStatus)) return next;
  return '存活 (重創敗退・靈基受損)';
}

// ==================== 情報檔案：玩家「知道的」陣營狀態，與真相分開記錄 ====================
// 角色 ID 對應到陣營名稱中的關鍵字（看到這些人就等於親眼得知該陣營現況）
const CHAR_FACTION_MARKERS_ = {
  shirou: '衛宮', saber: '衛宮', saber_alter: '衛宮',
  rin: '遠坂', archer: '遠坂',
  kirei: '教會', lancer: '教會', gilgamesh: '教會',
  sakura: '間桐', rider: '間桐', dark_sakura: '間桐', shinji: '間桐',
  souichirou: '柳洞寺', caster: '柳洞寺', assassin: '柳洞寺',
  illya: '愛因茲貝倫', berserker: '愛因茲貝倫',
  hassan: '臟硯'
};

// 對外看得到的狀態：去掉幕後細節（例如「曾於某地與某組激戰」「遭某組擊潰」）
function publicIntelText_(statusStr) {
  // 幕後細節括號裡常有巢狀括號（例如「(曾於森林與 衛宮組 (Saber陣營) 激戰)」），從開頭一路刪到結尾
  return String(statusStr || '').replace(/\s*\((曾於|於\s*Day|於|遭)[\s\S]*$/, '').trim() || '不明';
}

function initFactionIntel_(factionsObj, fromTruth) {
  const intel = {};
  Object.keys(factionsObj || {}).forEach(k => {
    const st = String(factionsObj[k] || '');
    let text = '不明';
    if (fromTruth || isAllianceStatusText_(st)) text = publicIntelText_(st);
    else if (k.includes('教會')) text = '監督者據點（表面中立）';
    intel[k] = { text: text, when: '開局', source: fromTruth ? '舊存檔' : '初始' };
  });
  return intel;
}

// 依本回合實際接觸更新情報；回傳有變動的陣營清單
function updateFactionIntel_(meta, factionsObj, opts) {
  const o = opts || {};
  if (!meta.factionIntel || typeof meta.factionIntel !== 'object') meta.factionIntel = initFactionIntel_(factionsObj, true);
  const intel = meta.factionIntel;
  const presentMarkers = new Set((o.presentIds || []).map(id => CHAR_FACTION_MARKERS_[id]).filter(Boolean));
  const contactSet = new Set(o.contactFacs || []);
  const changes = [];
  const setIntel = (fk, text, source) => {
    const t = String(text || '').trim().slice(0, 60);
    if (!t) return;
    const prev = intel[fk];
    if (prev && prev.text === t) return;
    intel[fk] = { text: t, when: o.when || '', source: source };
    changes.push({ fk: fk, text: t, source: source, isNew: !prev });
  };
  // AI 回報的情報比自動判斷詳細，同一陣營有 AI 情報時以它為準
  const aiKeys = new Set(Object.keys(o.aiIntel || {}).map(n => resolveFactionKey_(n, factionsObj)).filter(Boolean));
  Object.keys(factionsObj || {}).forEach(fk => {
    if (aiKeys.has(fk) && !isAllianceStatusText_(factionsObj[fk])) return;
    const st = String(factionsObj[fk] || '');
    const marker = Object.values(CHAR_FACTION_MARKERS_).find(m => fk.includes(m)) || '';
    if (isAllianceStatusText_(st)) setIntel(fk, publicIntelText_(st), '同盟');
    else if (marker && presentMarkers.has(marker)) setIntel(fk, publicIntelText_(st), '親眼所見');
    else if (contactSet.has(fk)) setIntel(fk, publicIntelText_(st), '聯絡');
  });
  Object.keys(o.aiIntel || {}).forEach(name => {
    const fk = resolveFactionKey_(name, factionsObj);
    if (fk) setIntel(fk, o.aiIntel[name], '情報');
  });
  return changes;
}

function describeIntelForPrompt_(meta) {
  const intel = (meta && meta.factionIntel) || {};
  const keys = Object.keys(intel);
  if (keys.length === 0) return '';
  return '【玩家目前掌握的情報（角色對話只能引用這些；其餘真相要等玩家查到）】\n' +
    keys.map(k => `- ${k}：${intel[k].text}（${intel[k].source}${intel[k].when ? '・' + intel[k].when : ''}）`).join('\n');
}

// ==================== Berserker 十二試煉：命數與已無效的手段 ====================
const GOD_HAND_LIVES_ = 12;

// 依 AI 回報結算本回合擊破的命數：一般最多 1 條、寶具最多 2 條；殺過他的同一種手段不再有效
function applyGodHandHits_(godHand, report, opts) {
  const gh = { lost: Number((godHand && godHand.lost) || 0), methods: Array.isArray(godHand && godHand.methods) ? godHand.methods.slice() : [] };
  const o = opts || {};
  const res = { godHand: gh, killed: 0, method: '', blocked: '' };
  if (!report || !o.berserkerPresent || !o.isCombat) return res;
  let count = Math.max(0, Math.floor(Number(report.count) || 0));
  const method = String(report.method || '').trim().slice(0, 20);
  if (count <= 0) return res;
  const norm = t => String(t || '').replace(/[\s「」『』（）()・，,。]/g, '');
  if (method && gh.methods.some(m => norm(m) && (norm(m).includes(norm(method)) || norm(method).includes(norm(m))))) {
    res.blocked = method;
    return res;
  }
  count = Math.min(count, o.npUsed || /寶具/.test(method) ? 2 : 1, GOD_HAND_LIVES_ - gh.lost);
  if (count <= 0) return res;
  gh.lost += count;
  if (method) gh.methods.push(method);
  if (gh.methods.length > 12) gh.methods = gh.methods.slice(-12);
  res.killed = count;
  res.method = method;
  return res;
}

// 命數還沒歸零時，愛因茲貝倫組不會因戰鬥淘汰（御主伊莉雅被打倒、投降、收服或結盟除外）
function gateGodHandElimination_(factionKey, prevStatus, nextStatus, godHand) {
  const next = String(nextStatus || '');
  if (!String(factionKey || '').includes('愛因茲貝倫')) return next;
  const lost = Number((godHand && godHand.lost) || 0);
  if (lost >= GOD_HAND_LIVES_) return next;
  const isKill = /淘汰|消滅|陣亡|擊潰|覆滅|戰敗|已死/.test(next) && !/收服|已歸屬第8組|原御主已退場/.test(next);
  if (!isKill) return next;
  if (/伊莉雅.*(死|俘|投降|退場|放棄|昏迷|失去)|御主.*(死|俘|投降|退場)/.test(next)) return next;
  return `存活 (重創・十二試煉尚存 ${GOD_HAND_LIVES_ - lost} 條)`;
}

function describeGodHandForPrompt_(godHand, factionsObj) {
  const fk = Object.keys(factionsObj || {}).find(k => k.includes('愛因茲貝倫'));
  if (!fk || isCapturedOrDefeatedStatusText_(factionsObj[fk])) return '';
  const lost = Number((godHand && godHand.lost) || 0);
  const methods = (godHand && Array.isArray(godHand.methods)) ? godHand.methods : [];
  return `【十二試煉】Berserker 目前還剩 ${GOD_HAND_LIVES_ - lost}/${GOD_HAND_LIVES_} 條命（以這個數字為準）。${methods.length ? `以下手段已經殺過他，對他**完全無效**（要寫成攻擊被肉體彈開、毫髮無傷，不算擊破）：${methods.join('、')}。` : ''}每回合最多擊破 1 條（A 級以上寶具最多 2 條），同一種手段不能殺他兩次；命數歸零前不會退場，除非御主伊莉雅被打倒、投降或放棄。玩家這邊確實殺死他一次時，填 berserker_lives_lost。`;
}

// ==================== 英靈名冊：副從者位置滿了，收服的英靈在據點待命，可以換上場 ====================
const MAX_SERVANT_ROSTER_ = 3;

// 玩家這回合想讓名冊裡的哪一騎上場（只能在據點換）；回傳該英靈 id 或 ''
function findRosterSwapTarget_(userAction, roster, charDb, locationKey) {
  if (locationKey !== '廢棄洋館') return '';
  const text = String(userAction || '');
  if (!/上場|出門|跟我|跟著我|同行|出戰|換成|換.{0,6}(來|上)|帶.{0,4}(去|走|出)/.test(text)) return '';
  const hit = (Array.isArray(roster) ? roster : []).find(r => {
    const names = String((charDb[r.id] && charDb[r.id].triggers) || r.name || '').split(',').map(x => x.trim()).filter(x => x.length >= 1);
    return names.some(n => text.includes(n));
  });
  return hit ? hit.id : '';
}

function describeRosterForPrompt_(roster) {
  const list = Array.isArray(roster) ? roster : [];
  if (list.length === 0) return '';
  return `【英靈名冊（已締約、在廢棄洋館待命，這回合不在玩家身邊）】${list.map(r => `${r.name}（${r.id}・${r.condition || '靈基穩定'}）`).join('、')}。玩家回到洋館時他們在那裡；不要寫他們跟著出門。`;
}

// ==================== 陣營好感（−100～100）與約定集合 ====================
const FACTION_FAVOR_START_ = { '衛宮': 20, '遠坂': 10, '間桐': 0, '教會': -10, '柳洞寺': -20, '愛因茲貝倫': -30, '臟硯': -50 };
const ALLIANCE_FAVOR_MIN_ = 40; // 好感到 40 才可能正式結盟（常理與鐵血）

function getFactionFavor_(meta, factionKey) {
  const fav = (meta && meta.factionFavor) || {};
  if (fav[factionKey] != null) return Number(fav[factionKey]) || 0;
  const m = Object.keys(FACTION_FAVOR_START_).find(k => String(factionKey || '').includes(k));
  return m ? FACTION_FAVOR_START_[m] : 0;
}

function favorLabel_(v) {
  return v >= 60 ? '信任' : v >= 20 ? '友善' : v > -20 ? '中立' : v > -60 ? '戒備' : '敵意';
}

// 套用 AI 回報的好感變化（每個陣營每回合最多 ±15）；回傳變動清單
function applyFactionFavor_(meta, factionsObj, deltas) {
  meta.factionFavor = Object.assign({}, meta.factionFavor || {});
  const changes = [];
  Object.keys(deltas || {}).forEach(name => {
    const fk = resolveFactionKey_(name, factionsObj);
    if (!fk) return;
    const d = Math.max(-15, Math.min(15, Math.round(Number(deltas[name]) || 0)));
    if (!d) return;
    const before = getFactionFavor_(meta, fk);
    const after = Math.max(-100, Math.min(100, before + d));
    meta.factionFavor[fk] = after;
    changes.push({ fk, before, after });
  });
  return changes;
}

function describeFavorForPrompt_(meta, factionsObj) {
  const keys = Object.keys(factionsObj || {}).filter(k => !isCapturedOrDefeatedStatusText_(factionsObj[k]));
  if (keys.length === 0) return '';
  return `【各陣營對玩家的好感（−100～100）】${keys.map(k => `${k.replace(/\\s*\\(.*\\)$/, '')} ${getFactionFavor_(meta, k)}（${favorLabel_(getFactionFavor_(meta, k))}）`).join('、')}。只有本回合和該陣營真的有互動時，才用 faction_favor_delta 加減（幫忙、守約、分享情報加分；欺騙被識破、放鴿子、攻擊扣分，每次 ±15 內）；沒互動就不要填；好感 ${ALLIANCE_FAVOR_MIN_} 以上才可能正式結盟。`;
}

// 約定：只和同盟約；到了約定時段人在約定地點 → 對方依約加入同行；錯過 → 好感 −10
function addAppointments_(meta, factionsObj, list, nowIdx) {
  meta.appointments = Array.isArray(meta.appointments) ? meta.appointments.slice() : [];
  const added = [];
  (Array.isArray(list) ? list : []).slice(0, 2).forEach(a => {
    const fk = resolveFactionKey_(a && a.faction, factionsObj);
    if (!fk || !isAllianceStatusText_(factionsObj[fk])) return;
    const loc = matchFuyukiLocation_(a.place);
    const day = Math.round(Number(a.day) || 0);
    const period = TIME_PERIODS_.includes(a.period) ? a.period : '深夜';
    if (!loc || !day || timeIndex_(day, period) <= nowIdx) return;
    meta.appointments = meta.appointments.filter(x => x.fk !== fk);
    const ap = { fk, day, period, place: loc.key };
    meta.appointments.push(ap);
    added.push(ap);
  });
  if (meta.appointments.length > 3) meta.appointments = meta.appointments.slice(-3);
  return added;
}

function resolveAppointments_(meta, factionsObj, nowIdx, locationKey) {
  const due = [], missed = [], cancelled = [];
  meta.appointments = (Array.isArray(meta.appointments) ? meta.appointments : []).filter(a => {
    const idx = timeIndex_(a.day, a.period);
    const st = String((factionsObj || {})[a.fk] || '');
    if (!isAllianceStatusText_(st) || /重傷|重創|瀕/.test(st)) { if (idx <= nowIdx) { cancelled.push(a); return false; } return true; }
    if (idx === nowIdx && locationKey === a.place) { due.push(a); return false; }
    if (idx < nowIdx) { missed.push(a); return false; }
    return true;
  });
  missed.forEach(a => {
    meta.factionFavor = Object.assign({}, meta.factionFavor || {});
    meta.factionFavor[a.fk] = Math.max(-100, getFactionFavor_(meta, a.fk) - 10);
  });
  return { due, missed, cancelled };
}

function describeAppointmentsForPrompt_(meta, nowIdx) {
  const list = Array.isArray(meta && meta.appointments) ? meta.appointments : [];
  if (list.length === 0) return '';
  return '【約定】' + list.map(a => `${companionDisplayName_(a.fk)} 約在 Day ${a.day}・${a.period} 於${a.place}集合${timeIndex_(a.day, a.period) === nowIdx ? '（就是現在！玩家在那裡的話對方準時出現）' : ''}`).join('；') + '。玩家和同盟約新的集合時，填 appointments_add。';
}

// ==================== 同行盟友：邀請同盟一起行動，之後每回合都跟在身邊 ====================
const COMPANION_NAMES_ = { '衛宮': '士郎＋Saber', '遠坂': '凜＋Archer', '教會': '綺禮', '間桐': '慎二＋Rider', '柳洞寺': '葛木＋Caster', '愛因茲貝倫': '伊莉雅＋Berserker', '臟硯': '哈桑' };
const MAX_COMPANIONS_ = 2;

function companionDisplayName_(factionKey) {
  const m = Object.keys(COMPANION_NAMES_).find(k => String(factionKey || '').includes(k));
  return m ? COMPANION_NAMES_[m] : String(factionKey || '').replace(/\s*\(.*\)$/, '');
}

function factionMentioned_(factionKey, text) {
  const t = String(text || '');
  const entry = COMBAT_TARGET_ALIASES_.find(([mk]) => String(factionKey || '').includes(mk));
  return Boolean(entry && entry[1].some(a => t.includes(a)));
}

const TIME_PERIODS_ = ['清晨', '白天', '黃昏', '深夜'];
// 把「第幾天＋時段」換成連續的時段編號，方便算經過幾個時段
function timeIndex_(day, period) {
  return (Number(day) || 0) * 4 + Math.max(0, TIME_PERIODS_.indexOf(String(period || '')));
}
const COMPANION_PERIODS_ = 4; // 同行固定維持 4 個時段（一整天）

// 依本回合行動與局勢更新同行名單；回傳加入與離開的陣營（nowIdx 為 timeIndex_）
function updateCompanions_(meta, factionsObj, userAction, nowIdx, presentIds, forceJoin, ownedServantIds) {
  // 英靈已經是玩家的從者（主、副、名冊），該陣營就不再當「同行盟友」
  const ownedMarkers = new Set((ownedServantIds || []).map(id => CHAR_FACTION_MARKERS_[id]).filter(Boolean));
  const f = factionsObj || {};
  const text = String(userAction || '');
  const comp = Object.assign({}, (meta.companions && typeof meta.companions === 'object') ? meta.companions : {});
  const joined = [], left = [];
  const leaveAll = /解散|各自行動|分頭行動|大家先回去|你們先回去|你們回去/.test(text);
  Object.keys(comp).forEach(fk => {
    const st = String(f[fk] || '');
    let reason = '';
    if (!st || isCapturedOrDefeatedStatusText_(st)) reason = '已退出戰局';
    else if (!isAllianceStatusText_(st)) reason = '不再是同盟';
    else if (/重傷|重創|瀕/.test(st)) reason = '傷勢太重，先回去休養';
    else if (Number(nowIdx) - Number(comp[fk].t != null ? comp[fk].t : (Number(comp[fk].day) || 0) * 4) >= COMPANION_PERIODS_) reason = '同行了一整天，先回去了';
    else if (leaveAll || (/分頭|先回去|回去吧|不用跟|分開|留在|各自/.test(text) && factionMentioned_(fk, text))) reason = '依你的安排分開行動';
    if (reason) { left.push({ fk, reason }); delete comp[fk]; }
  });
  const present = new Set((presentIds || []).map(id => CHAR_FACTION_MARKERS_[id]).filter(Boolean));
  const wantsJoin = /帶著|帶上|一起|跟我|同行|隨行|陪我|跟著我|一同|會合|聯手/.test(text);
  Object.keys(comp).forEach(fk => {
    const mk = Object.values(CHAR_FACTION_MARKERS_).find(m => fk.includes(m));
    if (mk && ownedMarkers.has(mk)) { delete comp[fk]; }
  });
  Object.keys(f).forEach(fk => {
    if (comp[fk] || Object.keys(comp).length >= MAX_COMPANIONS_) return;
    const ownMk = Object.values(CHAR_FACTION_MARKERS_).find(m => fk.includes(m));
    if (ownMk && ownedMarkers.has(ownMk)) return;
    const st = String(f[fk] || '');
    if (!isAllianceStatusText_(st) || /重傷|重創|瀕/.test(st)) return;
    const marker = Object.values(CHAR_FACTION_MARKERS_).find(m => fk.includes(m));
    const invited = wantsJoin && factionMentioned_(fk, text);
    const arrived = /支援待命/.test(st) && marker && present.has(marker);
    const appointed = Array.isArray(forceJoin) && forceJoin.includes(fk);
    if (invited || arrived || appointed) { comp[fk] = { t: Number(nowIdx) || 0 }; joined.push(fk); }
  });
  meta.companions = comp;
  return { joined, left };
}

function describeCompanionsForPrompt_(meta) {
  const keys = Object.keys((meta && meta.companions) || {});
  if (keys.length === 0) return '';
  return `【同行盟友】${keys.map(k => `${companionDisplayName_(k)}（${k}）`).join('、')} 正跟在玩家身邊：本回合一定在場（填進 present_chars），會對話、會依性格行動、開戰時一起出手；不要寫他們出現在別處或從遠方傳訊。`;
}

// ==================== 戰力判定：依準備、情報、地利、盟友、魔力、令咒算出優劣勢 ====================
// 從者強度等級（依原作大致排序）
const SERVANT_TIER_ = {
  gilgamesh: 5, berserker: 5, saber_alter: 5, dark_sakura: 5, karna: 5,
  saber: 4, scathach: 4, jeanne: 4, jalter: 4, mordred: 4, ereshkigal: 4,
  lancer: 3, archer: 3, rider: 3, caster: 3, assassin: 3, okita: 3, tamamo: 3,
  hassan: 2
};
// 玩家行動中提到誰 → 對手陣營（臟硯放最前面，避免 Assassin 被當成柳洞寺）
const COMBAT_TARGET_ALIASES_ = [
  ['臟硯', ['臟硯', '哈桑', '真Assassin', '咒腕']],
  ['教會', ['綺禮', '言峰', 'Lancer', 'lancer', '庫丘林', '庫夫林', '吉爾伽美什', '金閃閃', '英雄王', 'Gilgamesh', '教會']],
  ['愛因茲貝倫', ['伊莉雅', 'Berserker', 'berserker', '海克力士', '愛因茲貝倫']],
  ['柳洞寺', ['葛木', '美狄亞', 'Caster', 'caster', '小次郎', 'Assassin', 'assassin', '柳洞寺']],
  ['間桐', ['間桐', '慎二', 'Rider', 'rider', '美杜莎', '櫻']],
  ['遠坂', ['遠坂', '凜', 'Archer', 'archer']],
  ['衛宮', ['衛宮', '士郎', 'Saber', 'saber', '阿爾托莉雅']]
];
const FACTION_HOME_ = { '柳洞寺': '柳洞寺', '遠坂邸': '遠坂', '衛宮邸': '衛宮', '聖堂教會': '教會', '愛因茲貝倫森林': '愛因茲貝倫' };

function findCombatTarget_(userAction, factionsObj, locationKey) {
  const f = factionsObj || {};
  const text = String(userAction || '');
  const isOpen = k => k && !isCapturedOrDefeatedStatusText_(f[k]) && !isAllianceStatusText_(f[k]);
  for (const [marker, aliases] of COMBAT_TARGET_ALIASES_) {
    if (!aliases.some(a => text.includes(a))) continue;
    const fk = Object.keys(f).find(k => k.includes(marker));
    if (isOpen(fk)) return fk;
  }
  const homeMarker = FACTION_HOME_[locationKey];
  const homeKey = homeMarker ? Object.keys(f).find(k => k.includes(homeMarker)) : '';
  return isOpen(homeKey) ? homeKey : '';
}

function assessCombat_(statusObj, meta, userAction) {
  const f = statusObj.factions || {};
  const text = String(userAction || '');
  // 行動裡提到要去的地點也算戰場
  const dest = matchFuyukiLocation_(text);
  const battleLoc = dest ? dest.key : statusObj.locationKey;
  const target = findCombatTarget_(text, f, battleLoc);
  if (!target) return null;
  const reasons = [];
  let score = 0;
  // 從者相剋
  const canon = CANONICAL_7_FACTIONS_.find(r => target.includes(r[0].replace(/組.*$/, '')));
  let enemyServant = canon ? canon[2] : (target.includes('臟硯') ? 'hassan' : '');
  if (target.includes('教會') && (meta.churchRevived || meta.gilFinal || /吉爾伽美什|金閃閃|英雄王/.test(text + f[target]))) enemyServant = 'gilgamesh';
  const mine = statusObj.servant1.id ? (SERVANT_TIER_[statusObj.servant1.id] || 3) : 0;
  const theirs = SERVANT_TIER_[enemyServant] || 3;
  const tierDiff = mine + (statusObj.servant2.id ? 1 : 0) - theirs;
  score += tierDiff;
  if (!statusObj.servant1.id) reasons.push('沒有從者');
  else if (tierDiff > 0) reasons.push('從者戰力佔優');
  else if (tierDiff < 0) reasons.push(`對手從者更強（${enemyServant}）`);
  // 情報
  const intel = ((meta.factionIntel || {})[target] || {}).text || '';
  if (/真名|弱點|寶具|底牌|破綻|傲慢|試煉/.test(intel)) { score += 1; reasons.push('掌握對方情報'); }
  // 事前準備與奇襲
  if (/埋伏|陷阱|伏擊|偷襲|奇襲|設下|佈置|佈下|預先|事先|誘餌|引誘/.test(text)) { score += 1; reasons.push('事前準備／奇襲'); }
  // 地利：在對方陣地作戰吃虧
  const homeMarker = FACTION_HOME_[battleLoc];
  if (homeMarker && target.includes(homeMarker)) {
    const penalty = target.includes('柳洞寺') ? 2 : 1;
    score -= penalty; reasons.push('在對方陣地作戰');
  }
  // 盟友參戰
  const allies = Object.keys(f).filter(k => isAllianceStatusText_(f[k]));
  const allyHelp = allies.some(k => {
    const m = COMBAT_TARGET_ALIASES_.find(([mk]) => k.includes(mk));
    return m && m[1].some(a => text.includes(a));
  });
  const hasCompanion = Object.keys(meta.companions || {}).some(k => isAllianceStatusText_(f[k]));
  if (allyHelp || hasCompanion) { score += 1; reasons.push(hasCompanion ? '同行盟友參戰' : '盟友參戰'); }
  // 令咒
  if (/令咒/.test(text) && Number(statusObj.master.commandSpells) > 0) { score += 2; reasons.push('動用令咒'); }
  // 魔力
  const mp = Number(statusObj.master.mp) || 0, mx = Math.max(1, Number(statusObj.master.maxMp) || 1);
  if (mp <= 0) { score -= 2; reasons.push('魔力枯竭'); }
  else if (mp / mx < 0.25) { score -= 1; reasons.push('魔力不足'); }
  // 雙方狀態
  if (/受創|重傷|瀕|受損/.test(String(statusObj.servant1.condition || ''))) { score -= 1; reasons.push('我方從者帶傷'); }
  // 為愛無敵：主從羈絆越深，從者越願意為御主拚命
  const bondLv = Number(statusObj.bondLevel) || 0;
  if (statusObj.servant1.id && bondLv >= 100) { score += 2; reasons.push('羈絆・生死與共'); }
  else if (statusObj.servant1.id && bondLv >= 80) { score += 1; reasons.push('羈絆深厚'); }
  if (isWeakenedStatusText_(f[target])) { score += 1; reasons.push('對方帶傷'); }
  const level = score >= 3 ? '大優勢' : score >= 1 ? '小優勢' : score === 0 ? '均勢' : score >= -2 ? '劣勢' : '絕望';
  const guide = {
    '大優勢': '計畫大致成功，對方重創或被逼退，玩家代價輕微。',
    '小優勢': '玩家佔上風、能削弱對方，但要付出一些代價。',
    '均勢': '互有損傷、勝負未分，關鍵在玩家臨場的判斷。',
    '劣勢': '玩家吃虧，多半要撤退或付出明顯代價；除非行動中有真正的奇策。',
    '絕望': '正面打不贏，硬打會重傷甚至死亡；只有撤退、令咒或真正的奇策能扭轉。'
  }[level];
  return { target, level, score, reasons, guide };
}

function describeCombatAssessForPrompt_(a) {
  if (!a) return '';
  return `【戰力判定（若本回合與 ${a.target} 交戰）】${a.level}（${a.reasons.join('、') || '條件相當'}）：${a.guide}結果的輕重再依本局基調調整。`;
}

// 終局：其他陣營都化解後，教會的英雄王若還沒亮相，就在大聖杯前現身擋路
function maybeSummonFinalBoss_(factionsObj, meta, outcome) {
  if (meta.churchRevived || meta.gilFinal || meta.gilDefeated) return null;
  if (!areAllRivalFactionsResolved_(factionsObj)) return null;
  const ck = Object.keys(factionsObj).find(k => k.includes('教會'));
  if (!ck || /收服|已歸屬第8組/.test(String(factionsObj[ck] || ''))) return null;
  meta.gilFinal = true;
  meta.churchRevived = true;
  const updated = Object.assign({}, factionsObj, { [ck]: '存活 (敵對・英雄王吉爾伽美什現身・大聖杯守門者)' });
  return {
    factions: updated,
    text: '【終局異變】就在大聖杯即將顯現之際，圓藏山上空亮起無數金色的漣漪。言峰教會藏了十年的王牌——英雄王吉爾伽美什，正站在通往大聖杯的石階上俯視著你。要贏得聖杯，必須先跨過這位最古老的王。'
  };
}

function describeFinalBossForPrompt_(meta, factionsObj) {
  if (!meta.gilFinal) return '';
  const ck = Object.keys(factionsObj || {}).find(k => k.includes('教會'));
  if (!ck || isCapturedOrDefeatedStatusText_(factionsObj[ck])) return '';
  return '【最終決戰】英雄王吉爾伽美什守在大聖杯前，是最後的敵人。他的王之財寶近乎無窮、乖離劍是對界寶具，正面硬拚幾乎必敗；但他極度傲慢、輕視對手、一開始不會認真，這就是破綻。情報、盟友（Saber、Archer 等）、令咒與奇策都能提高勝算。打倒或化解他之後，玩家抵達大聖杯許願即可 TRUE_VICTORY。';
}

// 背景音樂情境：依本回合結果挑一種（前端依此切換曲目）
function pickBgmMood_(turnJson, st, story, outcome, assess) {
  if (outcome === 'FATAL_DEATH' || /失去從者|解約離去/.test(String(story || ''))) return 'sad';
  if (outcome === 'TRUE_VICTORY') return 'ending';
  const body = String(story || '').replace(/【本回合結算】[\s\S]*/, '');
  if (turnJson && turnJson.is_combat) {
    const strong = /吉爾伽美什|英雄王|Berserker|海克力士|黑Saber|黑櫻/.test(body) || (assess && /劣勢|絕望/.test(assess.level));
    return strong ? 'boss' : 'battle';
  }
  if (/親吻|吻了|吻上|擁抱|相擁|告白|臉紅|心跳|依偎/.test(body)) return 'romance';
  if (Number(st && st.threatLevel) >= 70 || /潛入|跟蹤|埋伏|殺氣|窺視/.test(body)) return 'tension';
  if (st && st.locationKey === '廢棄洋館' && /休息|睡|泡澡|吃飯|晚餐|聊天/.test(body)) return 'home';
  if (st && st.timePeriod === '黃昏') return 'dusk';
  return (st && st.timePeriod === '深夜') ? 'night' : 'day';
}

// 非戰鬥畫面把動作描述裡的武器字眼拿掉（例如 holding spear、pointing with spear），避免日常也畫出武器
function stripWeaponTags_(str) {
  return String(str || '').split(',').map(t => t.trim())
    .filter(t => t && !/\b(spear|lance|polearm|sword|blade|weapon|gae bolg|katana|bow|dagger|axe)\b/i.test(t))
    .join(', ');
}

// 玩家本回合是不是在休息（睡覺、冥想、調息…）
function isRestAction_(text) {
  return /休息|睡覺|睡一覺|補眠|小睡|就寢|冥想|調息|靜養|休養|養傷|打坐|恢復魔力|回復魔力|回魔/.test(String(text || ''));
}

// 戰局提示：還有哪些陣營未化解、魔力是否見底（每回合放進 statePrompt）
function describeWarStateForPrompt_(factionsObj, mp, maxMp, gameMode) {
  if (gameMode !== 'WAR') return '';
  const f = factionsObj || {};
  const open = Object.keys(f).filter(k => !isCapturedOrDefeatedStatusText_(f[k]) && !isAllianceStatusText_(f[k]));
  const lines = [];
  lines.push(open.length > 0
    ? `【戰局】尚未化解的陣營：${open.join('、')}（全部擊敗、收服或結盟後才能迎來終局）。擊敗滿狀態的從者需要多回合：先削弱（負傷、重創、劣勢），之後的回合才能淘汰；系統只接受已被削弱的陣營改為淘汰。`
    : '【終局】所有陣營都已擊敗、收服或結盟，戰爭的勝負已定。不要再製造新的敵對勢力或背叛；讓大聖杯在圓藏山（柳洞寺地下）顯現，劇情引導玩家前往（若英雄王還沒現身，系統會讓他在大聖杯前擋路）。玩家抵達大聖杯、許下願望（或選擇破壞聖杯）時，判定 `TRUE_VICTORY`。');
  const m = Number(mp) || 0, mx = Math.max(1, Number(maxMp) || 1);
  if (m <= 0) lines.push('【魔力枯竭】御主魔力見底：從者無法解放寶具、戰力大幅下降，御主頭暈虛弱；強行作戰或施展魔術必須付出實際代價（靈基受損、昏倒、被迫撤退），並反映在 master_condition／servant_condition。');
  else if (m / mx < 0.25) lines.push(`【魔力不足】御主魔力只剩 ${m}/${mx}：寶具最多勉強發動一次且代價沉重，大型魔術難以施展。`);
  return lines.join('\n');
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
  let list = Array.isArray(current) ? current.map(x => String(x || '').trim()).filter(x => x && x !== '[object Object]') : [];
  const resolves = (Array.isArray(resolveList) ? resolveList : []).map(x => String((x && typeof x === 'object') ? (x.text || x.event || x.content || '') : (x || '')).trim()).filter(Boolean);
  if (resolves.length > 0) {
    list = list.filter(e => !resolves.some(r => e === r || (r.length >= 6 && (e.includes(r) || r.includes(e)))));
  }
  const asText = x => (x && typeof x === 'object')
    ? String(x.text || x.event || x.content || x.description || x.summary || Object.values(x).filter(v => typeof v === 'string').join('：') || '')
    : String(x || '');
  (Array.isArray(addList) ? addList : []).forEach(x => {
    const t = cleanAwkwardMasterTitle_(asText(x).trim(), playerName).slice(0, 60);
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

// 試算表只保留 Players_Save 與 ChatLog；角色、陣營、世界書都內建在 GAS（GameData.js、Lore.js、CANONICAL_7_FACTIONS_）
// 只有 SCHEMA_VERSION_ 變動時才執行一次：修正 Players_Save 標題、既有存檔成人模式預設開啟
function ensureSchemaUpgraded_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FATE_SCHEMA_VERSION') === SCHEMA_VERSION_) return;
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
    if (lastSaveRow >= 2 && props.getProperty('FATE_ADULT_DEFAULT_APPLIED') !== 'TRUE') {
      const fCol = saveSheetH.getRange(2, 6, lastSaveRow - 1, 1);
      fCol.setValues(fCol.getValues().map(() => ['TRUE']));
      props.setProperty('FATE_ADULT_DEFAULT_APPLIED', 'TRUE');
    }
  }
  props.setProperty('FATE_SCHEMA_VERSION', SCHEMA_VERSION_);
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
  const facBWeakened = isWeakenedStatusText_(factionsObj[facB]);
  const battleSite = ['冬木大橋', '柳洞寺', '新都商業區', '衛宮邸', '遠坂邸', '愛因茲貝倫森林'][Math.floor(Math.random() * 6)];

  // 淘汰機率下調，且至少要剩 4 組以上才可能被後台淘汰，避免七組被後台打光
  const isElimination = (Number(day) >= 3 && facBWeakened && Math.random() < 0.12 && aliveFactions.length > 3);
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

  // 玩家看到的只有市民也看得到的異象（不寫陣營名稱與勝負）；完整戰況只給 GM 當幕後真相
  const publicSigns = {
    '冬木大橋': ['大橋上傳出爆炸般的巨響', '有人說看到兩道光在大橋鋼梁上高速交錯，隔天橋面多了好幾道裂痕'],
    '柳洞寺': ['圓藏山半夜一直有閃光', '山門那邊傳出像打雷一樣的聲音，寺裡的人說什麼都沒發生'],
    '新都商業區': ['新都大樓之間有怪光', '凌晨有好幾棟大樓的玻璃同時碎掉，新聞說是瓦斯氣爆'],
    '衛宮邸': ['深山町那棟日式老宅好吵', '半夜聽到金屬撞擊的聲音，圍牆好像塌了一角'],
    '遠坂邸': ['坡上的洋館附近有怪聲', '半夜有紅光跟爆炸聲，早上去看庭院樹倒了好幾棵'],
    '愛因茲貝倫森林': ['郊外森林半夜在震動', '開車經過郊外的時候看到森林裡一整片樹倒下，還有像巨人吼叫的聲音']
  }[battleSite] || ['半夜的怪聲', '昨晚好像有什麼東西爆炸了'];
  return {
    report: report,
    publicReport: `【遠方異象】${battleSite}一帶昨夜傳出巨響與閃光${isElimination ? '，之後魔力反應突然消失了一股' : ''}（冬木論壇已有目擊）。`,
    forumPost: { board: '冬木都市怪談板', author: '匿名目擊者', title: publicSigns[0], body: publicSigns[1] },
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

// 台詞斷段與說話者判斷：
// - 「台詞」後面緊接「某某…」→ 說話者是某某
// - 「某某…。」或「某某…：」後面接「台詞」→ 說話者是那句敘述的主詞（主詞是「我」就是玩家）
// - 只有短名詞、沒有標點的「」（例如「庫・夫林」）視為強調，不拆段
function segmentDialogue_(par, names, playerName) {
  const p = String(par || '').trim();
  if (!p || /^[^「『\n]{1,12}[:：]\s*「[^」]*」$/.test(p)) return p;
  const baseNames = (Array.isArray(names) ? names : []).filter(Boolean);
  const expanded = [];
  baseNames.forEach(n => { expanded.push(n); if (/^[\u4e00-\u9fff]{4}$/.test(n) && n !== playerName) expanded.push(n.slice(2)); });
  const cands = Array.from(new Set(expanded)).sort((a, b) => b.length - a.length);
  // 「綺禮」要對回「言峰綺禮」這類完整名稱來標示
  const fullNameOf = n => baseNames.find(b => b === n) || baseNames.find(b => b.length === 4 && b.slice(2) === n) || n;
  const startsWithName = str => {
    const t = String(str || '').replace(/^[\s，、]+/, '');
    if (/^我/.test(t) && playerName) return playerName;
    return cands.find(n => t.startsWith(n)) || '';
  };
  // 名字前面若是「對著／向／看著／身旁的」這類受詞標記，代表他不是主詞
  const objectMarker = /(對著|對|向|朝|看著|望著|盯著|把|和|跟|與|替|給|身旁的|身邊的|身後的|扣在|按在|壓在|抵在|落在|架在|來自|是|將)\s*$/;
  const asSubjectCandidates = t => cands.filter(n => {
    let idx = t.indexOf(n);
    while (idx !== -1) {
      if (!objectMarker.test(t.slice(0, idx))) return true;
      idx = t.indexOf(n, idx + 1);
    }
    return false;
  });
  // 段落中最近一個以名字（或「我」）開頭的句子 → 用來解析「她／他」
  const lastNamedSubject = text => {
    const sentences = String(text || '').split(/(?<=[。！？…])/).map(x => x.trim()).filter(Boolean);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const h = startsWithName(sentences[i]);
      if (h) return h;
    }
    return '';
  };
  const subjectOf = (sentence, narrationSoFar) => {
    const t = String(sentence || '').trim();
    const clauses = t.replace(/[，、；\s]+$/, '').split(/[，、；]/);
    const clause = (clauses.pop() || '').trim();
    const head = startsWithName(clause) || startsWithName(t);
    if (head) return head;
    // 「（訊息／簡訊／電話）來自某某」→ 說話者是寄件人
    const from = cands.find(n => t.includes('來自' + n));
    if (from) return from;
    if (/^(她|他)/.test(clause) || /^(她|他)/.test(t)) {
      const prevSentences = String(narrationSoFar || '').slice(0, String(narrationSoFar || '').length - t.length);
      return lastNamedSubject(prevSentences);
    }
    const found = asSubjectCandidates(clause.length >= 2 ? clause : t);
    return found.length === 1 ? found[0] : '';
  };
  const isSpeech = (q, prevChar, nextChar) => {
    if (/^[的之般似]$/.test(nextChar || '')) return false; // 「……」的警告意味 → 句中引用
    // 夾在句子中間的短詞引用（前後都是一般文字、裡面沒有句末標點），例如「這種「將自身當作消耗品」行為」
    if (q.length <= 12 && !/[。！？…]/.test(q) && /[\u4e00-\u9fff]/.test(prevChar || '') && /[\u4e00-\u9fff]/.test(nextChar || '')) return false;
    return /[，。！？…、～—]/.test(q) || q.length >= 8 || prevChar === '：' || prevChar === ':';
  };

  const out = [];
  let narration = '';
  let lastIdx = 0;
  const re = /「([^」]*)」/g;
  let m;
  while ((m = re.exec(p)) !== null) {
    const before = p.slice(lastIdx, m.index);
    const prevChar = before.trim().slice(-1);
    if (!isSpeech(m[1], prevChar, p.charAt(m.index + m[0].length))) {
      narration += before + m[0];
      lastIdx = m.index + m[0].length;
      continue;
    }
    narration += before;
    // 已經寫成「名字：「台詞」」的保留原樣
    const labelMatch = narration.match(/([^「『\n。！？，：:]{1,12})[:：]\s*$/);
    let speaker = '';
    if (labelMatch && cands.some(n => labelMatch[1].trim() === n || labelMatch[1].trim() === playerName)) {
      speaker = labelMatch[1].trim();
      narration = narration.slice(0, narration.length - labelMatch[0].length);
    } else {
      const lastSentence = narration.split(/(?<=[。！？…])/).pop();
      if (lastSentence.trim()) {
        speaker = subjectOf(lastSentence, (out.join('。') + '。' + narration));
      } else {
        const afterText = p.slice(m.index + m[0].length);
        speaker = startsWithName(afterText);
      }
    }
    if (narration.trim()) out.push(narration.trim());
    narration = '';
    out.push(speaker ? `${fullNameOf(speaker)}：「${m[1]}」` : `「${m[1]}」`);
    lastIdx = m.index + m[0].length;
  }
  narration += p.slice(lastIdx);
  if (narration.trim()) out.push(narration.trim().replace(/^[，、]/, ''));
  return out.join('\n\n');
}

function formatNovelStoryText_(rawStory, contextNames, prevStoryText, playerName) {
  let text = String(rawStory || '').trim();
  if (!text) return '';

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  // 把段落中夾帶的台詞拆成獨立段落，並依中文敘事習慣判斷說話者（判斷不出就不標）
  text = text.split(/\n{2,}/).map(par => segmentDialogue_(par, contextNames, playerName)).join('\n\n');

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

  let lastSpeaker = '';
  const labeledParagraphs = paragraphs.map((p, idx) => {
    const trimmed = p.trim();
    if (!trimmed) return '';

    const labeled = trimmed.match(/^([^「『\n]{1,12})[:：]\s*[「『]/);
    if (labeled) {
      lastSpeaker = labeled[1].trim();
      return trimmed;
    }

    if (/^「[^」]+」/.test(trimmed)) {
      const prevText = idx > 0 ? paragraphs[idx - 1] : '';
      const nextText = idx + 1 < paragraphs.length ? paragraphs[idx + 1] : '';

      // 優先看前一段敘述（通常會先交代是誰開口），其次看後一段；
      // 前一段只用「她／他」指稱時，沿用最近一位說話者；都找不到就不亂標
      // 前後段各提到不同角色時無法判斷是誰說的，寧可不標也不要標錯
      const lastSentenceOf = t => String(t || '').split(/(?<=[。！？…])/).map(x => x.trim()).filter(Boolean).pop() || '';
      const startName = t => { const s2 = String(t || '').trim(); return candidateNames.find(n => s2.startsWith(n)) || ''; };
      const prevName = startName(lastSentenceOf(prevText));
      const nextName = startName(nextText);
      const nextMention = findNameIn(nextText);
      const ambiguous = (prevName && nextName && prevName !== nextName) || (prevName && nextMention && nextMention !== prevName);
      let speaker = ambiguous ? '' : (prevName || nextName);
      if (!speaker && !prevName && !nextName && lastSpeaker && /^(她|他)/.test(String(prevText).trim())) speaker = lastSpeaker;
      if (speaker) {
        lastSpeaker = speaker;
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
      factionIntel: initFactionIntel_(defaultFactions, false),
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
      factionIntel: initFactionIntel_(defaultFactions, false),
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

  // 轉成純 JSON 再回傳：試算表讀出的日期物件、NaN 等無法傳給網頁，會讓前端收到 null 而卡在登入畫面
  return JSON.parse(JSON.stringify({
    status: statusObj,
    logs: logs,
    summonPool: getSummonableServantsList_(charDb),
    mapLocations: statusObj.dynamicLocations
  }));
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
      factionIntel: initFactionIntel_(defaultFactions, false),
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
    if (patch.cameraMode) meta.cameraMode = (patch.cameraMode === 'pov') ? 'pov' : 'third';
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
      if (pool.length === 0) throw new Error('目前沒有可召喚的英靈！請檢查 GameData.js 的 summonable 設定。');
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
      factionIntel: initFactionIntel_(defaultFactions, false),
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

    const userMsg = `Master Name: ${cleanName}\nMaster Gender: ${params.masterGender === 'boy' ? 'male（用「他」）' : 'female（用「她」）'}\nOrigin: ${originName} (${originPreset.desc})\nHoly Grail Wish: ${wishText}\nMode: ${row[3]}\nSummoned Servant ID: ${targetServantId} (${servantInfo.triggers})\nRelic/Catalyst used: ${params.relicNote || '大聖杯共鳴'}`;

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

// ==================== 陣營主動行動：讓冬木的其他陣營主動找上玩家 ====================
// 機率：基本 25%＋警戒度加成＋距離上次主動事件越久越高（上限 75%）；剛發生過的下一回合不會再來
const PROACTIVE_DECK_ = {
  hostile: [
    '派出使魔在玩家所在地附近窺探，被玩家或從者察覺',
    '主從趁玩家落單或鬆懈時發動突襲',
    '送來挑戰書或嗆聲的口信，指定時間地點決鬥',
    '在玩家常去的地方設下結界陷阱或埋伏'
  ],
  neutral: [
    '親自登門拜訪，試探玩家的底細與意圖',
    '派使魔在玩家附近現身，當面提出情報交換或交易',
    '在路上與玩家「偶遇」，藉機觀察或搭話'
  ],
  allied: [
    '主動傳來消息，分享剛查到的敵方情報',
    '遭遇麻煩，傳訊向玩家求援',
    '登門拜訪，想商量下一步的聯合作戰',
    '邀玩家今晚一起行動'
  ],
  church: [
    '言峰綺禮以監督者身分親自來訪，表面關心、實則試探',
    '在路上遇到教會的人，被提醒神秘隱匿、或聽到某陣營的動向'
  ]
};

function drawProactiveEvent_(statusObj, meta, turnNum) {
  if (statusObj.gameMode !== 'WAR') return null;
  const f = statusObj.factions || {};
  const last = Number(meta.lastProactiveTurn) || 0;
  const gap = turnNum - last;
  if (last && gap < 3) return null;
  const chance = Math.min(0.45, 0.15 + (Number(statusObj.threatLevel) || 0) / 400 + Math.min(0.15, gap * 0.03));
  if (Math.random() > chance) return null;

  const candidates = [];
  Object.keys(f).forEach(name => {
    const st = String(f[name] || '');
    if (isCapturedOrDefeatedStatusText_(st)) return;
    const resting = /負傷|休整|重傷|重創/.test(st);
    let kind = isAllianceStatusText_(st) ? 'allied' : (/敵對|獵殺|暗算|報復|追殺/.test(st) ? 'hostile' : 'neutral');
    if (name.includes('教會') && kind !== 'hostile') kind = Math.random() < 0.5 ? 'church' : kind;
    let deck = PROACTIVE_DECK_[kind].slice();
    if (resting) deck = deck.filter(e => !/突襲|設下|決鬥/.test(e));
    if (deck.length === 0) return;
    const weight = kind === 'hostile' ? 1 + (Number(statusObj.threatLevel) || 0) / 50 : 1;
    if (meta && meta.companions && meta.companions[name]) return; // 同行中的盟友就在身邊，不會從遠方主動找上門
    candidates.push({ name, kind, deck, weight });
  });
  if (candidates.length === 0) return null;
  const total = candidates.reduce((a, c) => a + c.weight, 0);
  let r = Math.random() * total;
  const pick = candidates.find(c => (r -= c.weight) <= 0) || candidates[0];
  const action = pick.deck[Math.floor(Math.random() * pick.deck.length)];
  return { faction: pick.name, kind: pick.kind, action: action };
}

function drawWorldDirectorEvent_(statusObj, meta, turnNum) {
  if (statusObj.gameMode !== 'WAR') return { text: '', proactive: null };
  if (statusObj.timePeriod === '深夜' && statusObj.threatLevel >= 100) {
    return { text: '【夜襲危機】警戒度已滿，今晚敵對陣營會找上門，依玩家防禦與應對推演並結算交戰勝負。', proactive: null };
  }
  const p = drawProactiveEvent_(statusObj, meta || {}, turnNum || 0);
  if (!p) return { text: '', proactive: null };
  const ch = getContactChannel_(p.faction);
  return {
    text: `【陣營主動行動（本回合一定要發生，融入玩家的行動之中）】${p.faction}：${p.action}。依該陣營目前狀態與性格演出，留給玩家回應的空間。${p.kind === 'allied' ? `若是傳訊，透過「${ch.label}」送達，並填入 incoming_messages。` : '非同盟陣營不會傳訊到玩家手機，要在劇情中當面發生。'}`,
    proactive: p
  };
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
  if (ps.cameraMode) metaSync.cameraMode = (ps.cameraMode === 'pov') ? 'pov' : 'third';
  row[31] = serializeMeta_(metaSync);
}

// ==================== 回合推演用的固定系統提示詞（型月世界觀＋自由但合乎邏輯的裁定原則） ====================
const FATE_GM_SYSTEM_PROMPT_ = [
  '你是 TYPE-MOON《Fate/stay night》第五次聖杯戰爭的遊戲主持人（GM），以繁體中文寫出小說級劇情，並輸出 JSON。',
  '',
  '## 一、裁定原則：自由，但合乎邏輯',
  '1. 先接受再演出：玩家可以嘗試任何行動或說任何話，不要直接拒絕或說「做不到」。依型月世界邏輯、御主固定能力等階、從者性格與當下局勢，決定結果是「漂亮成功／成功但付出代價／失敗並承受後果」。',
  '8. 東西要有來源：玩家拿出背包（物品欄）裡沒有的東西時，符合常理與鐵血模式下，只能是身邊隨手可得的普通物品或簡陋的臨時替代品，特別的道具要先去買、做或偷；搞笑與龍傲天模式可以順著演。',
  '2. 獎勵創意：合理的奇招、話術、情報運用、利用地形與時機，都應該得到實質回報；明顯不合理或作死的行為，則讓世界給出真實後果。',
  '3. 每個行動都要有確實的結果並留下紀錄：數值、陣營狀態、流言、道具、關係變化都要反映在對應的 JSON 欄位，不能只寫在劇情裡。',
  '4. 只控制玩家輸入的部分：不替玩家寫出沒輸入的行動或台詞，也不替玩家做決定；從者、NPC、敵對陣營依各自性格與目的主動行動。',
  '5. 世界是活的：各陣營有自己的計畫，會依情報、流言與局勢變化而行動；在場人物一定會對玩家的言行有所反應，不會無視或憑空消失。',
  '7. 寫作基調（在狀態資料的【寫作基調】）決定結果的輕重與筆調，必須照做：符合常理＝依型月邏輯公平裁定；搞笑鬧劇＝誇張好笑、在場角色吐槽反應，非極端作死不重創不致死；龍傲天＝玩家想做的事一定成功而且碾壓、旁人震驚折服，不受伺服器的戰鬥與結盟門檻限制；鐵血戰場＝嚴峻寫實，敵人冷靜反制，失誤會付出真實的傷勢與代價。',
  '6. 只寫本回合的新發展：前幾回合是已確定的歷史，開頭不要重複或改寫上一回合的結尾。劇情停在玩家這次行動自然結束的那一刻，不要自己替玩家移動到別的地方、跳過時間或安排下一步（例如玩家只說去遠坂邸談判，就停在遠坂邸，不要寫「之後回到洋館」）。',
  '',
  '## 二、型月世界邏輯（判斷結果時的常識，不是禁止清單）',
  '- 神秘法則：神秘只能被更強的神秘壓制。現代武器與普通魔術幾乎傷不了英靈本體，但可以牽制、干擾、爭取時間，或對付御主與使魔。',
  '- 魔力即代價：寶具、高階魔術、維持從者現界都消耗御主魔力；魔力枯竭時從者會衰弱甚至消失。魔力可從靈脈、魔力寶石、魔力供給（補魔）取得。',
  '- 令咒：三劃絕對命令，可強制行動、瞬間轉移、短時間強化或硬開寶具；用完即失去約束從者的手段。令咒可以被奪取或轉讓。',
  '- 武器靈體化：從者在非戰鬥時會把武器收起（靈體化），日常、談判、休息時不要寫她們手持或倚著武器；只有開戰或刻意威嚇時才具現。',
  '- 從者是有自我意志的英雄：依傳說與性格行事，會評價御主，可以拒絕不合理的命令（除非動用令咒），也會因御主的作為而信任或失望。',
  '- 真名即弱點：真名曝光代表傳說中的弱點與寶具被看穿；寶具解放常伴隨真名宣告。',
  '- 御主是最大破綻：攻擊御主是正當戰術。失去御主的從者靠單獨行動技能撐一段時間，會尋找新御主或消失。',
  '- 魔術必須隱匿：在人多的地方或白天公開交戰，會引來聖堂教會善後、警方與其他陣營的注意（論壇也會出現目擊）。聖杯戰爭主要在夜間進行，白天是日常、調查與佈局。',
  '- 陣地優勢：在敵方工房、結界或陣地內作戰極為不利；Caster 的陣地與山門結界尤其危險。',
  '- 陣營好感與約定：狀態資料有各陣營對玩家的好感，玩家的行為要用 `faction_favor_delta` 反映；玩家和同盟約定之後的集合時間地點時，填 `appointments_add`（day 用數字，period 用清晨／白天／黃昏／深夜）。',
  '- 結盟看立場與利益：對方要有理由才會合作（共同的敵人、情報、救命之恩、交換條件），敵對陣營要經過多次互動才可能從敵意轉為談判、停戰、結盟；言峰綺禮表面合作、暗中利用，伊莉雅的態度取決於能否打動她、她與士郎的關係，Caster 只信任葛木。一次談話通常只能讓態度軟化，不會直接結盟。',
  '- 從者戰力依原作：每騎都是傳說級英雄，打倒一騎要靠情報、弱點、地利、寶具與犧牲累積，通常要好幾回合（偵查→削弱→決戰）；Berserker 的十二試煉要多次致命傷或高階寶具才能突破，吉爾伽美什的王之財寶近乎無窮。一次漂亮的行動可以重創對手、逼退對手，但不會讓滿狀態的從者當場退場。',
  '- 不硬塞情報：吃飯、休息、閒聊等日常場景就好好寫日常，不要讓從者主動報告戰況；角色只會提到確實得知的事（親眼所見、使魔回報、論壇、聯絡），而且只知道得到的那部分。玩家主動問起或去打聽時，才依情報來源回答。',
  '- 感知有極限：從者的氣息感知大約只到數百公尺，只能察覺「附近有從者、魔力大概多強、是否有敵意」，無法隔著整座城市辨認其他陣營在哪、是誰、什麼職階。遠方的事只能透過使魔、目擊、情報、論壇風聲得知；Assassin 的氣息遮斷甚至能完全避開感知。',
  '- 隱藏真相（大聖杯的汙染、此世之惡、言峰綺禮的真面目等）只在玩家深入調查時逐步揭露，不要一次說破。',
  '- 時代是 2004 年的日本冬木市：手機是翻蓋手機（只能通話、簡訊、手機郵件、低畫質相機），沒有智慧型手機、LINE、社群網站或觸控螢幕；網路論壇用電腦或手機網頁瀏覽。',
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
  '- 論壇：玩家做了引人注目的事（公開交戰、怪事、流言擴散），用 `forum_posts` 寫 0～2 則冬木市民的 2004 年留言板貼文（每則是含 board／author／title／body 的物件）；路人只知道自己看得到的部分。',
  '- 流言：依各陣營的情報能力與性格，判斷誰相信、誰識破狀態資料中的流言，用 `rumor_updates` 記錄；被相信的流言會實際改變該陣營行動（寫進 `faction_updates`），被識破的假消息可能引來報復。',
  '- 只有**同盟陣營**會主動傳訊到玩家手機（求援、情報、邀約），填入 `incoming_messages`；非同盟陣營的接觸（挑戰書、交易、試探）要在劇情中當面發生，不要填 `incoming_messages`。',
  '- 情報：玩家這回合透過偵查、使魔、他人告知、論壇推敲等方式**確實得知**某陣營的狀況時，用 `intel_updates` 寫下玩家得知的內容（30 字內，只寫玩家知道的部分）；親眼見到的陣營與同盟由系統自動記錄。',
  '- 通訊錄：只有劇情中**明確寫出**玩家與某陣營交換手機號碼、拿到名片或聯絡方式時，才把陣營名稱填入 `new_contacts`；只是見面、交談、談判都不算。',
  '- 路線傾向：依玩家本回合的行動方式，在 `route_tendency_delta` 為各路線加減分（-3～+3）；已確立路線時，劇情重心照狀態資料中的路線說明發展。',
  '- 記憶：`memory_update` 寫 200 字內前情提要；之後必須記住的約定、恩怨、伏筆用 `key_events_add` 新增，了結的用 `key_events_resolve` 移除。',
  '- 道具：消耗時填 `consumed_item_ids`，取得時填 `gained_items`；固定道具的 id 與效果見狀態資料，系統自動結算的部分不要重複計入數值。',
  '- 陣營更新：`faction_updates` 的鍵必須用狀態資料中既有的陣營完整名稱；值寫該陣營的存亡與對玩家的態度（例如「存活 (同盟)」「存活 (敵對・負傷休整)」），不要寫一時的動作（例如「發送訊息中」）。',
  '- 場地會留下痕跡：劇情確實改變了某個地標的樣子（戰鬥破壞、佈置房間、設下結界、教會修復等），在 `location_changes` 用地標名稱寫下戰鬥或事件結束後**留下來的樣子**（60 字內，例如「石階佈滿劍痕、山門一側崩塌」，不要寫「兩人正在交戰」這種進行中的事）。這個狀態會一直保留，之後回到那裡要照現況描寫，直到劇情再次改變它；只是路過、沒有改變就不要填。',
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
  '  "rumor_updates": [{ "id": "既有流言ID（新傳聞留空）", "text": "新傳聞才填：傳聞內容", "status": "擴散中 / 已被識破 / 已被證實 / 已平息", "believers": [], "doubters": [], "effect": "30字內影響" }],',
  '  "new_contacts": [],',
  '  "intel_updates": {},',
  '  "berserker_lives_lost": { "count": 0, "method": "殺死他的手段（10字內）" },',
  '  "faction_favor_delta": {},',
  '  "appointments_add": [{ "faction": "陣營名稱", "day": 3, "period": "清晨／白天／黃昏／深夜", "place": "地標名稱" }],',
  '  "route_tendency_delta": { "fate": 0, "ubw": 0, "hf": 0, "shadow": 0, "conquest": 0 },',
  '  "location_changes": {},',
  '  "incoming_messages": [{ "faction": "陣營名稱", "text": "其他陣營主動傳給玩家的訊息（80字內）" }],',
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
    const loreSnippets = searchLorebook_(ss, {
      action: userAction,
      state: [
        statusObj.location,
        statusObj.servant1.name, statusObj.servant1.class,
        statusObj.servant2.name, statusObj.servant2.class,
        (Array.isArray(metaBefore.keyEvents) ? metaBefore.keyEvents.join(' ') : ''),
        (Array.isArray(metaBefore.rumors) ? metaBefore.rumors.filter(r => r.status === '擴散中').map(r => r.text).join(' ') : ''),
        statusObj.inventory.map(it => it.name).join(' ')
      ].filter(Boolean).join(' '),
      recent: allRecentLogs.slice(-2).map(l => `${l.user} ${stripSystemLines(l.ai)}`).join(' ')
    });
    const charDb = getCharAppearanceMap_(ss);

    const p = statusObj.master.params;
    const invSummary = statusObj.inventory.length > 0
      ? statusObj.inventory.map(it => `[id:${it.id}] ${it.name} x${it.qty} (${it.type}, 階級${it.tier}: ${it.desc})`).join('\n')
      : '（目前背包空空如也，無任何道具或媒介）';

    const locCatalogText = Object.keys(FUYUKI_LOCATIONS_).map(k => {
      const l = statusObj.dynamicLocations[k] || FUYUKI_LOCATIONS_[k];
      const changedNote = (metaBefore.customLocationNotes && metaBefore.customLocationNotes[k]) ? String(metaBefore.customLocationNotes[k]) : '';
      const descPart = (k === statusObj.locationKey) ? ` | ${l.desc}` : (changedNote ? ` | 現況已改變：${changedNote}` : '');
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
        : '消耗背包道具請填入 `consumed_item_ids`（填背包裡的 id）；只要拾取、收納或取得物品，務必填入 `gained_items`（階級 1～3）。\n固定道具 id：魔力結晶(小)=`mana_gem_s`、高純度魔力寶石(中)=`mana_gem_m`、煙霧魔術彈=`smoke_bomb`、對魔術防禦禮裝(保命符)=`aegis_charm`、未充能天然寶石媒介=`empty_gem`、基礎黑鍵套組=`black_keys`；煉成或取得這些道具時務必沿用同一個 id。\n魔力寶石／結晶的 MP 回復、休息回魔與煙霧彈降低警戒度由系統自動結算，`master_mp_delta` 與 `threat_delta` 不要重複計入。'
    ].join('\n');

    const worldEvent = drawWorldDirectorEvent_(statusObj, metaBefore, turnNum);
    const combatAssess = (statusObj.gameMode === 'WAR' && normalizeGameToneKey_(statusObj.gameTone) !== 'STORY_PLAYER_FIRST') ? assessCombat_(statusObj, metaBefore, userAction) : null;
    const worldEventHint = worldEvent.text;
    // 英靈名冊：在據點打字「讓某某上場」→ 本回合起換成副從者（先讓提示詞知道新陣容，寫回時才真正換）
    const rosterBefore = Array.isArray(metaBefore.servantRoster) ? metaBefore.servantRoster : [];
    // 人在洋館、或這回合行動是回洋館，都可以換人
    const swapLoc = (matchFuyukiLocation_(userAction) || {}).key === '廢棄洋館' ? '廢棄洋館' : statusObj.locationKey;
    const swapId = findRosterSwapTarget_(userAction, rosterBefore, charDb, swapLoc);
    if (swapId) {
      const inc = rosterBefore.find(r => r.id === swapId);
      statusObj.servant2 = { id: swapId, class: '契約從者', name: inc.name, condition: inc.condition || '靈基穩定' };
    }
    const rosterFull = rosterBefore.length >= MAX_SERVANT_ROSTER_;
    const isDragonTone = normalizeGameToneKey_(statusObj.gameTone) === 'STORY_PLAYER_FIRST';
    const canFormSecondContract = (!statusObj.servant1.id) || ((isDragonTone || (statusObj.master.commandSpells >= 1 && statusObj.master.mp >= 80)) && (!statusObj.servant2.id || !rosterFull));

    // 系統提示詞：固定不變的規則與型月世界觀（每回合相同，模型端可快取）；每回合變動的資料一律放在 statePrompt
    const systemPrompt = FATE_GM_SYSTEM_PROMPT_;

    const turnSettingsBlock = [
      `【玩家】名號「${cleanName}」（劇情中稱呼玩家用這個名字、「御主」或角色習慣的叫法）｜聖杯願望：「${statusObj.master.wish}」`,
      `【寫作基調：${tonePreset.label}】${tonePreset.desc}`,
      rankCheckHint,
      `【主從者好感】${statusObj.bondLevel}/100${statusObj.bondLevel <= 10 && toneKey !== 'COMEDY_CHAOS' && toneKey !== 'STORY_PLAYER_FIRST' ? '（主從關係緊張：從者可能拒絕危險或荒唐的命令，令咒可以強制但會再扣好感；好感歸零還一直惹她會解約離去）' : ''}。bond_delta 每回合 ±10 內，依從者在意的事判斷：平常的相處與對話 0～+3，真正打動她的事（真誠道歉、並肩死戰、說中她的心事、重要承諾）才 +5～+10；惹她不快就扣分`,
      inventoryRuleHint,
      !statusObj.servant1.id
        ? '【失去從者】御主目前沒有從者，非常危險。若劇情中與失去御主的從者達成協議，可填 `new_servant2_id` 締結新契約（成為主從者）。'
        : (canFormSecondContract ? `【副契約】條件已滿足：若劇情中合理收服敵方英靈，可填 \`new_servant2_id\`${statusObj.servant2.id ? '（副從者位置已滿，新收服的會進英靈名冊、回洋館待命）' : ''}。` : '【副契約】目前條件不足，不可新增副從者。'),
      describeRosterForPrompt_(swapId ? rosterBefore.filter(r => r.id !== swapId).concat(row[23] ? [{ id: String(row[23]), name: String(row[25]), condition: String(metaBefore.servant2Condition || '靈基穩定') }] : []) : rosterBefore),
      worldEventHint,
      phoneBridgeHints,
      `【冬木市地標】\n${locCatalogText}`,
      `【角色 ID】${Object.keys(charDb).map(id => `${id}=${charDb[id].triggers.split(',').slice(0, 2).join('/')}`).join('; ')}`
    ].filter(Boolean).join('\n\n');

    const statePrompt = [
      `【本局基調（優先遵守，決定結果的輕重與筆調）】${tonePreset.label}：${tonePreset.directive || tonePreset.desc}`,
      turnSettingsBlock,
      `【當前狀態】模式: ${statusObj.gameMode} | 基調: ${tonePreset.label} | Day ${statusObj.day} ${statusObj.timePeriod} | AP: ${statusObj.ap}/${statusObj.maxAp} | 警戒度: ${statusObj.threatLevel}% | 當前地標: ${statusObj.location} (${statusObj.locationInfo.leyline} | ${statusObj.locationInfo.danger})`,
      `【當前場地現況】${statusObj.locationInfo.desc}`,
      `【幕後戰況（只有 GM 知道；玩家與從者不知道哪些陣營交手、誰勝誰負，只能透過論壇目擊、使魔、聯絡或親自調查慢慢得知）】${statusObj.warTicker}`,
      `【御主(${cleanName})】ID:player_master | 性別:${statusObj.master.gender === 'boy' ? '男（劇情中用「他」）' : '女（劇情中用「她」）'} | 身分:獨立第8組參戰者 | 出身:${statusObj.master.origin} | 願望:「${statusObj.master.wish}」 | 魔力:${statusObj.master.mp}/${statusObj.master.maxMp} | 令咒:${statusObj.master.commandSpells} | 肉身狀態:${statusObj.master.condition}`,
      `【御主固定六維等階】魔術迴路:${p.circuit} | 近戰體術:${p.combat} | 隱藏氣息:${p.stealth} | 幸運:${p.luck}`,
      `【主從者】ID:${statusObj.servant1.id} (${statusObj.servant1.class}・${statusObj.servant1.name}) | 羈絆好感:${statusObj.bondLevel}/100 | 靈基狀態:${statusObj.servant1.condition}`,
      statusObj.servant2.id ? `【副從者】ID:${statusObj.servant2.id} (${statusObj.servant2.class}・${statusObj.servant2.name}) | 靈基狀態:${statusObj.servant2.condition || '靈基穩定'}` : '【副從者】無',
      `【相關角色目前穿著（未列出者為預設服裝）】${JSON.stringify(relevantOutfits)}`,
      `【七組陣營狀態（幕後真相，推演前必先對照，同盟陣營須彼此照應；角色只知道自己見過或打聽到的部分）】${JSON.stringify(statusObj.factions)}`,
      describeWarStateForPrompt_(statusObj.factions, statusObj.master.mp, statusObj.master.maxMp, statusObj.gameMode),
      describeIntelForPrompt_({ factionIntel: metaBefore.factionIntel || initFactionIntel_(statusObj.factions, true) }),
      describeGodHandForPrompt_(metaBefore.godHand, statusObj.factions),
      describeCompanionsForPrompt_(metaBefore),
      statusObj.gameMode === 'WAR' ? describeFavorForPrompt_(metaBefore, statusObj.factions) : '',
      statusObj.gameMode === 'WAR' ? describeAppointmentsForPrompt_(metaBefore, timeIndex_(statusObj.day, statusObj.timePeriod)) : '',
      describeCombatAssessForPrompt_(combatAssess),
      describeFinalBossForPrompt_(metaBefore, statusObj.factions),
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
    const undoSnapshot = freshRow.slice();
    const freshMeta = safeJsonParse_(freshRow[31], {});
    if (Number(freshMeta.turnCount || 0) !== Number(metaBefore.turnCount || 0) || String(freshRow[2]) !== String(row[2])) {
      throw new Error('這個存檔剛剛在另一個視窗推進了一回合，本次行動未寫入。請重新【讀取世界線】後再行動。');
    }
    applyPendingSettingsToRow_(freshRow, params.pendingSettings);
    for (let ci = 0; ci < 32; ci++) row[ci] = freshRow[ci];
    const presentAliases = [];
    (Array.isArray(turnJson.present_chars) ? turnJson.present_chars : []).forEach(c => {
      if (c && c.id && charDb[c.id] && c.id !== 'player_master') charDb[c.id].triggers.split(',').forEach(n => { if (n.trim().length >= 1) presentAliases.push(n.trim()); });
    });
    const speakerHints = Array.from(new Set([statusObj.servant1.name, statusObj.servant2.name, cleanName, '遠坂凜', '衛宮士郎', '間桐櫻', '言峰綺禮', '伊莉雅', '葛木宗一郎', '吉爾伽美什', '黑櫻', '黑Saber', '咒腕哈桑'].concat(presentAliases).filter(Boolean)));
    let formattedStory = formatNovelStoryText_(turnJson.story, speakerHints, prevStoryText, cleanName);

    const meta = safeJsonParse_(row[31], {});
    const maxMp = Number(meta.maxMp) || 120;

    row[1] = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');

    const resolvedLoc = matchFuyukiLocation_(turnJson.location) || resolveFuyukiLocation_(row[10]);
    row[10] = resolvedLoc.info.fullName;

    // 場地狀態：AI 回報的地點改變永久保存（與地圖上手動編輯的「場地現況」是同一份資料）
    const changedLocations = [];
    if (turnJson.location_changes && typeof turnJson.location_changes === 'object') {
      Object.keys(turnJson.location_changes).forEach(name => {
        const val = String(turnJson.location_changes[name] || '').trim().slice(0, 140);
        const hit = matchFuyukiLocation_(name);
        if (!val || !hit) return;
        meta.customLocationNotes = Object.assign({}, meta.customLocationNotes || {});
        if (meta.customLocationNotes[hit.key] !== val) {
          meta.customLocationNotes[hit.key] = val;
          changedLocations.push(hit.key);
        }
      });
    }

    let currentFactions = safeJsonParse_(row[29], {});
    // 十二試煉：先結算本回合擊破的命數，再讓陣營更新經過命數把關
    const ghRes = applyGodHandHits_(meta.godHand, turnJson.berserker_lives_lost, {
      berserkerPresent: (Array.isArray(turnJson.present_chars) ? turnJson.present_chars : []).some(c => c && c.id === 'berserker'),
      isCombat: Boolean(turnJson.is_combat),
      npUsed: (Array.isArray(turnJson.present_chars) ? turnJson.present_chars : []).some(c => c && c.use_np && c.id !== 'berserker')
    });
    meta.godHand = ghRes.godHand;
    // 陣營好感先結算（結盟門檻要用本回合的新好感）
    const favorChanges = applyFactionFavor_(meta, currentFactions, (turnJson.faction_favor_delta && typeof turnJson.faction_favor_delta === 'object') ? turnJson.faction_favor_delta : {});
    if (turnJson.faction_updates && typeof turnJson.faction_updates === 'object') {
      Object.keys(turnJson.faction_updates).forEach(fname => {
        const val = String(turnJson.faction_updates[fname] || '').trim();
        const realKey = resolveFactionKey_(fname, currentFactions);
        if (val && realKey) {
          const prevSt = String(currentFactions[realKey] || '');
          // 龍傲天模式：不套用淘汰兩步、十二試煉與結盟門檻，想做的都能實現
          const isDragon = toneKey === 'STORY_PLAYER_FIRST';
          const nextSt = isDragon ? val.slice(0, 120) : gateGodHandElimination_(realKey, prevSt, gateFactionAlliance_(prevSt, gateFactionElimination_(prevSt, val.slice(0, 120)), toneKey, getFactionFavor_(meta, realKey)), meta.godHand);
          // 已淘汰的陣營不會復活；唯一例外是教會亮出隱藏王牌吉爾伽美什（只有一次）
          const wasOut = isCapturedOrDefeatedStatusText_(prevSt) && !/收服|已歸屬第8組/.test(prevSt);
          if (wasOut && !isCapturedOrDefeatedStatusText_(nextSt)) {
            if (realKey.includes('教會') && !meta.churchRevived) {
              meta.churchRevived = true;
              currentFactions[realKey] = nextSt;
            }
          } else {
            currentFactions[realKey] = nextSt;
          }
        }
      });
    }

    if (turnJson.servant_form_morph && charDb[turnJson.servant_form_morph]) {
      const morphInfo = charDb[turnJson.servant_form_morph];
      row[17] = turnJson.servant_form_morph;
      row[19] = morphInfo.triggers.split(',')[0];
    }

    const nonServants = new Set(['player_master', 'shirou', 'rin', 'sakura', 'dark_sakura', 'illya', 'kirei', 'souichirou', 'shinji']);
    // 套用英靈名冊的換人（以寫回時的最新存檔為準）
    let rosterSwap = null;
    meta.servantRoster = Array.isArray(meta.servantRoster) ? meta.servantRoster.slice() : [];
    if (swapId) {
      const incIdx = meta.servantRoster.findIndex(r => r.id === swapId);
      if (incIdx !== -1) {
        const inc = meta.servantRoster.splice(incIdx, 1)[0];
        const outgoing = row[23] ? { id: String(row[23]), name: String(row[25]), condition: String(meta.servant2Condition || '靈基穩定') } : null;
        if (outgoing) meta.servantRoster.push(outgoing);
        row[23] = inc.id; row[24] = '契約從者'; row[25] = inc.name; row[26] = 1000; row[27] = 0;
        meta.servant2Condition = inc.condition || '靈基穩定';
        rosterSwap = { inName: inc.name, outName: outgoing ? outgoing.name : '' };
      }
    }
    let rosterAdded = '';
    let capturedServantId = '';
    if (
      turnJson.new_servant2_id &&
      charDb[turnJson.new_servant2_id] &&
      !nonServants.has(turnJson.new_servant2_id) &&
      String(turnJson.new_servant2_id) !== String(row[17]) &&
      String(turnJson.new_servant2_id) !== String(row[23]) &&
      !meta.servantRoster.some(r => r.id === turnJson.new_servant2_id) &&
      canFormSecondContract &&
      row[23] && row[17] && meta.servantRoster.length < MAX_SERVANT_ROSTER_
    ) {
      // 副從者位置已滿 → 收進英靈名冊，回洋館待命
      const sInfo = charDb[turnJson.new_servant2_id];
      row[15] = Math.max(0, Number(row[15]) - 80);
      meta.servantRoster.push({ id: turnJson.new_servant2_id, name: sInfo.triggers.split(',')[0], condition: '靈基穩定' });
      rosterAdded = sInfo.triggers.split(',')[0];
      capturedServantId = String(turnJson.new_servant2_id);
      currentFactions = syncCapturedServantFaction_(currentFactions, turnJson.new_servant2_id, '');
    } else if (
      turnJson.new_servant2_id &&
      charDb[turnJson.new_servant2_id] &&
      !nonServants.has(turnJson.new_servant2_id) &&
      String(turnJson.new_servant2_id) !== String(row[17]) &&
      !row[23] &&
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
    // 英靈退場也要先被削弱：所屬陣營在本回合開始前還是滿狀態時，不接受退場
    const servantFactionMarker_ = sid => ({ caster: '柳洞寺', assassin: '柳洞寺', hassan: '臟硯', gilgamesh: '教會' })[sid]
      || ((CANONICAL_7_FACTIONS_.find(r => r[2] === sid) || [])[0] || '').replace(/組.*$/, '');
    const servantsOutList = (Array.isArray(turnJson.servants_out) ? turnJson.servants_out : []).filter(sid => {
      const marker = servantFactionMarker_(String(sid || ''));
      const fk = marker ? Object.keys(statusObj.factions || {}).find(k => k.includes(marker)) : '';
      if (!fk) return true;
      const prev = String(statusObj.factions[fk] || '');
      return toneKey === 'STORY_PLAYER_FIRST' || isCapturedOrDefeatedStatusText_(prev) || isWeakenedStatusText_(prev) || String(sid) === capturedServantId;
    });
    let routeRes = updateRyuudouRoute_(meta, currentFactions, servantsOutList, capturedServantId, presentIdSet);
    currentFactions = routeRes.factions;
    const routeReports = routeRes.report ? [routeRes.report] : [];

    let mpDelta = Number(turnJson.master_mp_delta) || 0;
    // 休息回魔由系統結算：玩家本回合要休息／睡覺／冥想且沒有開戰 → 回復 20 + 所在地靈脈量
    let restRecovered = 0;
    if (statusObj.gameMode === 'WAR' && !turnJson.is_combat && isRestAction_(userAction)) {
      restRecovered = 20 + (Number(resolvedLoc && resolvedLoc.info && resolvedLoc.info.manaRegen) || 10);
      mpDelta = Math.min(mpDelta, 0) + restRecovered; // AI 自己加的回魔不重複計入
    }
    let periodAdvancedNotice = '';
    let latestWarReport = '';
    const offscreenForumPosts = [];

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
        // （offscreenForumPosts 在下方論壇段落寫入手機）
        currentFactions = warSim.updatedFactions;
        routeRes = updateRyuudouRoute_(meta, currentFactions, [], '', new Set());
        currentFactions = routeRes.factions;
        if (routeRes.report) routeReports.push(routeRes.report);
        if (warSim.hotspotKey) meta.mapHotspot = warSim.hotspotKey;
        if (warSim.report) {
          latestWarReport = warSim.report;
          meta.warTicker = warSim.report;
          meta.warTickerPublic = warSim.publicReport || warSim.report;
          periodAdvancedNotice += `\n${warSim.publicReport || warSim.report}`;
          if (warSim.forumPost) offscreenForumPosts.push(warSim.forumPost);
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
    const bondDelta = Math.max(-10, Math.min(10, Math.round(Number(turnJson.bond_delta) || 0))); // 每回合最多 ±10
    let nextBond = Math.max(0, Math.min(100, curBond + bondDelta));
    // 好感歸零還一直惹她：連續 3 回合就解約離去（常理、鐵血；有回升就重新計算）
    if (nextBond === 0 && bondDelta < 0) meta.bondZeroStreak = (Number(meta.bondZeroStreak) || 0) + 1;
    else if (bondDelta > 0 || nextBond > 0) meta.bondZeroStreak = 0;
    const bondLeave = Boolean(row[17]) && (toneKey === 'BALANCED' || toneKey === 'HARDCORE_WAR') && Number(meta.bondZeroStreak) >= 3;
    const bondLeaverName = String(row[19] || '');
    meta.bondLevel = nextBond;
    row[21] = nextBond;

    meta.masterParams = Object.assign({}, statusObj.master.params);

    // 道具只在玩家本回合有「取得／製作」意圖時才入袋，有「使用」意圖時才扣除（AI 常在玩家沒要求時自己煉成或消耗道具）
    const wantsGain = /撿|拾|拿|取|收|奪|搶|買|購|煉成|製作|做|灌注|搜|接過|收下|領|偷|摸走|帶走|裝進|放進|借|討|要|換|交易|請求|拜託|給我|送我|分我/.test(userAction);
    const wantsUse = /使用|用掉|捏碎|消耗|吃|喝|丟|投擲|擲|煉成|灌注|製作|做|發動|啟動|點燃|拔出|揮|射|施放|喝下|服用/.test(userAction);
    if (!wantsUse) {
      turnJson.consumed_item_ids = (Array.isArray(turnJson.consumed_item_ids) ? turnJson.consumed_item_ids : [])
        .filter(cid => { const it = (meta.inventory || []).find(x => x.id === cid); return it && userAction.includes(it.name); });
    }
    let mergedGainedItems = (wantsGain || !Array.isArray(turnJson.gained_items)) ? (Array.isArray(turnJson.gained_items) ? turnJson.gained_items.slice() : []) : [];

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
    // 魔力枯竭還開戰：從者至少靈基受創（符合常理與鐵血；搞笑與故事模式不強制）
    if (statusObj.gameMode === 'WAR' && Number(statusObj.master.mp) <= 0 && Boolean(turnJson.is_combat)
        && (tonePreset === GAME_TONE_PRESETS_.BALANCED || tonePreset === GAME_TONE_PRESETS_.HARDCORE_WAR)
        && /^(靈基穩定|完好|穩定|)$/.test(String(meta.servantCondition || '靈基穩定').trim())) {
      meta.servantCondition = '靈基受創 (魔力枯竭下強行作戰)';
    }
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

    if (bondLeave) meta.servantCondition = '契約斷絕 (好感歸零，解約離去)';
    if (row[17] && /消滅|解約離去/.test(String(meta.servantCondition || ''))) {
      const lostName = row[19];
      const lostWord = /解約離去/.test(String(meta.servantCondition || '')) ? '對你徹底失望，解約離去' : '消滅';
      if (bondLeave) { meta.bondLevel = 25; row[21] = 25; meta.bondZeroStreak = 0; }
      if (row[23]) {
        row[17] = row[23];
        row[18] = row[24] === '契約從者' ? '從者' : row[24];
        row[19] = row[25];
        row[22] = '筋力:- 耐久:- 敏捷:- 魔力:- 幸運:- 寶具:-';
        meta.servantCondition = meta.servant2Condition || '靈基穩定';
        row[23] = ''; row[24] = ''; row[25] = ''; row[26] = 0; row[27] = 0;
        meta.servant2Condition = '靈基穩定';
        formattedStory += `\n\n【契約遞補】主從者「${lostName}」${lostWord}了。副從者「${row[19]}」成為你的主從者。`;
      } else {
        row[17] = ''; row[18] = '無'; row[19] = '（失去從者）';
        meta.servantCondition = '契約斷絕';
        meta.servantLost = true;
        formattedStory += `\n\n【失去從者】「${lostName}」${lostWord}了，契約之線斷絕。你可以尋找失去御主的從者重新締約，或前往教會尋求監督者的保護。`;
      }
    }
    // 失去從者後重新締約：新契約的從者直接成為主從者
    if (!row[17] && row[23]) {
      row[17] = row[23]; row[18] = row[24] === '契約從者' ? '從者' : row[24]; row[19] = row[25];
      row[22] = '筋力:- 耐久:- 敏捷:- 魔力:- 幸運:- 寶具:-';
      meta.servantCondition = meta.servant2Condition || '靈基穩定';
      row[23] = ''; row[24] = ''; row[25] = ''; row[26] = 0; row[27] = 0;
      meta.servant2Condition = '靈基穩定';
      meta.servantLost = false;
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
    // 伺服器端把關：劇情或玩家輸入裡真的出現交換聯絡方式的字眼才承認（AI 常在剛見面時就給）
    const contactEvidence = /手機|號碼|電話|名片|聯絡方式|聯繫方式|簡訊|郵件|mail|line|使魔|傳話|傳信/i.test(`${userAction} ${turnJson.story || ''}`);
    (contactEvidence && Array.isArray(turnJson.new_contacts) ? turnJson.new_contacts : []).forEach(n => {
      const k = resolveFactionKey_(n, currentFactions);
      if (!k) return;
      meta.smsContacts = Object.assign({}, meta.smsContacts || {});
      if (!meta.smsContacts[k]) {
        meta.smsContacts[k] = { addedTurn: turnNum };
        newContactNames.push(k);
      }
    });

    if (worldEvent.proactive) meta.lastProactiveTurn = turnNum;

    const routeAnnounce = applyRouteTendency_(meta, turnJson.route_tendency_delta);
    if (routeAnnounce) {
      meta.keyEvents = updateKeyEvents_(meta.keyEvents, [routeAnnounce.replace(/^【[^】]+】/, '').slice(0, 60)], [], cleanName);
    }

    let outcome = String(turnJson.outcome_type || 'CONTINUE').toUpperCase();
    if (outcome === 'CONTINUE' && /^已死亡/.test(String(meta.masterCondition || ''))) {
      outcome = 'FATAL_DEATH';
    }

    // 終局：其他陣營都化解後，英雄王若還沒亮相就在大聖杯前現身（本回合不能直接通關）
    let finalBossText = '';
    if (!isSandboxMode && outcome !== 'FATAL_DEATH') {
      const boss = maybeSummonFinalBoss_(currentFactions, meta, outcome);
      if (boss) {
        currentFactions = boss.factions;
        finalBossText = boss.text;
        row[29] = JSON.stringify(currentFactions);
        // 英雄王是當面現身，玩家當然知道
        const ck = Object.keys(currentFactions).find(k => k.includes('教會'));
        if (ck) {
          meta.factionIntel = meta.factionIntel || {};
          meta.factionIntel[ck] = { text: '英雄王吉爾伽美什現身，擋在大聖杯前', when: `Day ${row[6]}・${row[7]}`, source: '親眼所見' };
        }
      }
    }
    // 打倒最終 Boss 後記錄，避免再出現
    if (meta.gilFinal) {
      const ck = Object.keys(currentFactions).find(k => k.includes('教會'));
      if (ck && isCapturedOrDefeatedStatusText_(currentFactions[ck])) meta.gilDefeated = true;
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
    if (finalBossText) formattedStory += `\n\n${finalBossText}`;
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
    // Gemini 有時回傳純文字字串而不是物件，兩種都接受
    const aiPosts = (Array.isArray(turnJson.forum_posts) ? turnJson.forum_posts : [])
      .map(fp => (typeof fp === 'string') ? { body: fp } : (fp || {}))
      .map(fp => Object.assign({}, fp, { body: String(fp.body || fp.content || fp.text || '').trim().slice(0, 160) }))
      .filter(fp => fp.body)
      .slice(0, MAX_FORUM_POSTS_PER_TURN);
    offscreenForumPosts.forEach((fp, i) => {
      meta.phoneState.forumPosts.unshift({ id: `war_${turnNum}_${i}`, board: fp.board, author: fp.author, time: `Day ${row[6]}・${row[7]}`, title: fp.title, body: fp.body, isPlayer: false });
      meta.phoneState.unreadCount = (Number(meta.phoneState.unreadCount) || 0) + 1;
    });
    aiPosts.forEach((fp, i) => {
      const body = fp.body;
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

    // 其他陣營主動傳來的訊息（透過各自的聯絡管道）
    const incomingFrom = [];
    (Array.isArray(turnJson.incoming_messages) ? turnJson.incoming_messages : []).slice(0, 2).forEach(im => {
      const fk = resolveFactionKey_(im && im.faction, currentFactions);
      const text = String((im && im.text) || '').trim().slice(0, 160);
      if (!fk || !text) return;
      // 只有同盟陣營會主動傳訊到手機
      if (!isAllianceStatusText_(currentFactions[fk])) return;
      const ch = getContactChannel_(fk);
      meta.phoneState.smsThreads = meta.phoneState.smsThreads || {};
      const th = meta.phoneState.smsThreads[fk] || (meta.phoneState.smsThreads[fk] = { factionName: fk, allied: isAllianceStatusText_(currentFactions[fk]), statusText: currentFactions[fk], lastDistressStatus: '', messages: [] });
      th.messages.push({ sender: fk, fromPlayer: false, time: `Day ${row[6]}・${row[7]}`, text: ch.prefix && !text.startsWith('（') ? `${ch.prefix}${text}` : text });
      if (th.messages.length > MAX_SMS_PER_THREAD) th.messages = th.messages.slice(-MAX_SMS_PER_THREAD);
      meta.phoneState.unreadCount = (Number(meta.phoneState.unreadCount) || 0) + 1;
      // 主動傳訊等於給了聯絡管道，之後可以回覆
      meta.smsContacts = Object.assign({}, meta.smsContacts || {});
      if (!meta.smsContacts[fk]) meta.smsContacts[fk] = { addedTurn: turnNum };
      incomingFrom.push({ fk, text, label: ch.label });
    });
    meta.turnCount = turnNum;

    meta.inventory = updatedInventory;

    const nowIdx = timeIndex_(row[6], row[7]);
    const apptAdded = addAppointments_(meta, currentFactions, turnJson.appointments_add, nowIdx);
    const apptRes = resolveAppointments_(meta, currentFactions, nowIdx, resolvedLoc.key);
    const compRes = updateCompanions_(meta, currentFactions, apptAdded.length ? userAction.replace(/一起|跟我|同行|聯手|會合/g, '') : userAction, nowIdx,
      (Array.isArray(turnJson.present_chars) ? turnJson.present_chars : []).map(c => String((c && c.id) || '')),
      apptRes.due.map(a => a.fk),
      // 只看收服來的（副從者與名冊）；開局召喚的主從者可能和其他陣營同一個英靈 ID，不能算
      [String(row[23] || '')].concat((meta.servantRoster || []).map(r => r.id)).filter(Boolean));

    // AI 寫的情報裡若提到十二試煉的命數，一律改成伺服器的正確數字
    if (turnJson.intel_updates && typeof turnJson.intel_updates === 'object' && meta.godHand) {
      Object.keys(turnJson.intel_updates).forEach(k => {
        if (!resolveFactionKey_(k, currentFactions) || !resolveFactionKey_(k, currentFactions).includes('愛因茲貝倫')) return;
        turnJson.intel_updates[k] = String(turnJson.intel_updates[k] || '')
          .replace(/(剩餘?|還剩|尚存)\s*\d+\s*條/g, `$1 ${GOD_HAND_LIVES_ - meta.godHand.lost} 條`)
          .replace(/(失去|擊破|死了)\s*\d+\s*條/g, `$1 ${meta.godHand.lost} 條`);
      });
    }
    const intelChanges = updateFactionIntel_(meta, currentFactions, {
      presentIds: (Array.isArray(turnJson.present_chars) ? turnJson.present_chars : []).map(c => String((c && c.id) || '')),
      contactFacs: incomingFrom.map(m => m.fk),
      aiIntel: (turnJson.intel_updates && typeof turnJson.intel_updates === 'object') ? turnJson.intel_updates : {},
      when: `Day ${row[6]}・${row[7]}`
    });

    // 每回合結算：把本回合造成的確實變化列出來，讓玩家看到行動的反饋（也存進紀錄）
    const summaryParts = [];
    const mpAfter = Number(row[15]);
    if (mpAfter !== statusObj.master.mp) summaryParts.push(`MP ${statusObj.master.mp}→${mpAfter}`);
    favorChanges.forEach(c => summaryParts.push(`💗 ${c.fk.replace(/\s*\(.*\)$/, '')} 好感 ${c.before}→${c.after}（${favorLabel_(c.after)}）`));
    apptAdded.forEach(a => summaryParts.push(`📅 約定：${companionDisplayName_(a.fk)} Day ${a.day}・${a.period} 在${a.place}集合`));
    apptRes.missed.forEach(a => summaryParts.push(`😠 你沒有赴約，${a.fk.replace(/\s*\(.*\)$/, '')} 好感 −10`));
    apptRes.cancelled.forEach(a => summaryParts.push(`📅 ${companionDisplayName_(a.fk)} 無法赴約（不再同盟或傷勢太重）`));
    compRes.joined.forEach(k => summaryParts.push(apptRes.due.some(a => a.fk === k) ? `🤝 ${companionDisplayName_(k)} 依約前來，加入同行` : `🤝 ${companionDisplayName_(k)} 加入同行`));
    compRes.left.forEach(c => summaryParts.push(`👋 ${companionDisplayName_(c.fk)} 離開隊伍（${c.reason}）`));
    if (combatAssess && turnJson.is_combat) summaryParts.push(`⚔ 戰力判定：${combatAssess.level}（${combatAssess.reasons.join('、') || '條件相當'}）`);
    if (ghRes.killed > 0) summaryParts.push(`⚔ 十二試煉：擊破 ${ghRes.killed} 條（${ghRes.method || '戰鬥'}），還剩 ${GOD_HAND_LIVES_ - meta.godHand.lost} 條`);
    if (ghRes.blocked) summaryParts.push(`🛡 「${ghRes.blocked}」已經殺過 Berserker 一次，十二試煉讓他對這招免疫`);
    if (restRecovered > 0) summaryParts.push(`💤 休息回復 +${restRecovered} MP（${resolvedLoc.key}）`);
    if (statusObj.gameMode === 'WAR' && Number(row[9]) !== statusObj.threatLevel) summaryParts.push(`警戒 ${statusObj.threatLevel}%→${row[9]}%`);
    if (nextBond !== statusObj.bondLevel) summaryParts.push(`好感 ${statusObj.bondLevel}→${nextBond}`);
    if (bondLeave) summaryParts.push(`💔 ${bondLeaverName} 對你徹底失望，解約離去`);
    else if (nextBond === 0 && row[17] && (toneKey === 'BALANCED' || toneKey === 'HARDCORE_WAR')) summaryParts.push(`⚠ ${row[19]} 的忍耐快到極限了（好感 0，再惹她 ${Math.max(1, 3 - (Number(meta.bondZeroStreak) || 0))} 回合就會解約；道歉、認真修行、好好相處可以挽回）`);
    if (Number(row[16]) !== statusObj.master.commandSpells) summaryParts.push(`令咒 ${statusObj.master.commandSpells}→${row[16]}`);
    if (String(row[10]) !== String(statusObj.location)) summaryParts.push(`移動至 ${resolvedLoc.key}`);
    if (String(meta.masterCondition) !== String(statusObj.master.condition)) summaryParts.push(`御主：${meta.masterCondition}`);
    if (String(meta.servantCondition) !== String(statusObj.servant1.condition)) summaryParts.push(`${statusObj.servant1.name}：${meta.servantCondition}`);
    if (rosterSwap) summaryParts.push(rosterSwap.outName ? `🔄 ${rosterSwap.inName} 上場，${rosterSwap.outName} 回洋館待命` : `🔄 ${rosterSwap.inName} 上場`);
    if (rosterAdded) summaryParts.push(`📜 ${rosterAdded} 收入英靈名冊（回洋館待命，在洋館說「讓${rosterAdded}上場」就能換）`);
    else if (capturedServantId) summaryParts.push(`締結副契約：${row[25]}`);
    (invResult.consumedIds || []).forEach(cid => {
      const it = (statusObj.inventory || []).find(x => x.id === cid);
      summaryParts.push(`使用 ${it ? it.name : cid}`);
    });
    if (invResult.addedCount > 0) {
      mergedGainedItems.forEach(g => { if (g && g.name) summaryParts.push(`獲得 ${g.name}`); });
    }
    // 結算只列玩家「得知」的陣營變化（親眼所見、同盟、聯絡、劇情中打聽到），幕後變化不顯示
    intelChanges.forEach(c => {
      const nm = c.fk.replace(/\s*\(.*\)$/, '');
      summaryParts.push(c.isNew ? `新勢力：${c.fk}（${c.text}）` : `${nm}→${c.text.slice(0, 24)}（${c.source}）`);
    });
    newContactNames.forEach(k => summaryParts.push(`📇 取得聯絡方式：${k.replace(/\s*\(.*\)$/, '')}`));
    changedLocations.forEach(k => summaryParts.push(`🏚 ${k} 現況改變：${String(meta.customLocationNotes[k]).slice(0, 30)}`));
    rumorRes.changes.forEach(c => summaryParts.push(`📢 流言${c}`));
    if (aiPosts.length > 0) summaryParts.push(`📱 論壇新增 ${aiPosts.length} 則目擊`);
    const shortFac = k => k.replace(/\s*\(.*\)$/, '');
    incomingFrom.forEach(m => summaryParts.push(`✉ ${shortFac(m.fk)}（${m.label}）：「${m.text.slice(0, 60)}${m.text.length > 60 ? '…' : ''}」→ 可在行動欄輸入「傳簡訊給${shortFac(m.fk).replace(/組$/, '')}：…」回覆`));
    if (worldEvent.proactive && !incomingFrom.some(m => m.fk === worldEvent.proactive.faction)) {
      summaryParts.push(`⚡ ${shortFac(worldEvent.proactive.faction)} 主動找上你（${worldEvent.proactive.action}），詳見上方劇情`);
    }
    if (statusObj.gameMode === 'WAR' && outcome === 'CONTINUE' && areAllRivalFactionsResolved_(currentFactions)) {
      summaryParts.push('🏆 所有陣營都已擊敗、收服或結盟！前往圓藏山（柳洞寺）的大聖杯許下願望，就能迎來結局');
    }
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
    // 保存撤回用的快照（只保留最近一回合，6 小時內有效）
    try {
      CacheService.getScriptCache().put('fate_undo_' + cleanName, JSON.stringify({ row: undoSnapshot, turn: turnNum, action: userAction }), 21600);
    } catch (e) {}

    return {
      status: updatedStatus,
      story: formattedStory,
      outcomeType: outcome,
      tigerDojoTip: turnJson.tiger_dojo_tip || '',
      imagePayload: imgPayload,
      needImage: updatedStatus.autoImage,
      bgmMood: pickBgmMood_(turnJson, updatedStatus, formattedStory, outcome, combatAssess)
    };
  } finally {
    if (lockHeld) lock.releaseLock();
  }
}

// ==================== 4. 快捷操作：一鍵換裝、消耗令咒急充、重骰CG ====================

// ↩ 撤回上一回合：存檔還原到上一回合開始前，刪掉那一回合的對話紀錄，並回傳當時的行動讓玩家修改或重新推演
function undoLastTurn(playerName) {
  const cleanName = validatePlayerName_(playerName);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cache = CacheService.getScriptCache();
    const snap = safeJsonParse_(cache.get('fate_undo_' + cleanName), null);
    if (!snap || !Array.isArray(snap.row)) throw new Error('沒有可以撤回的回合（只能撤回最近一回合，且需在 6 小時內）。');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const saveSheet = ss.getSheetByName('Players_Save');
    const rowIndex = findPlayerRowIndex_(saveSheet, cleanName);
    if (rowIndex === -1) throw new Error('找不到玩家存檔！');
    saveSheet.getRange(rowIndex, 1, 1, 32).setValues([snap.row.slice(0, 32)]);

    const chat = ss.getSheetByName('ChatLog');
    const last = chat.getLastRow();
    if (last >= 2) {
      const keys = chat.getRange(2, 1, last - 1, 2).getValues();
      for (let i = keys.length - 1; i >= 0; i--) {
        if (String(keys[i][0]).trim() === cleanName && Number(keys[i][1]) === Number(snap.turn)) {
          chat.deleteRow(i + 2);
          break;
        }
      }
    }
    cache.remove('fate_undo_' + cleanName);
    SpreadsheetApp.flush();
    return { status: parseSaveRow_(snap.row), logs: getPlayerChatLogs_(ss, cleanName, 12), lastAction: String(snap.action || '') };
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
    `- id: "${c.id}", name: "${c.name}", gender: "${c.gender}", use_np: ${Boolean(c.use_np)}, reference_outfit: "${c.referenceOutfit || ''}", battle_outfit: "${c.battleOutfit || ''}", casual_outfit: "${c.casualOutfit || ''}", hint: "${c.hint || ''}"`
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
    '   - casual_outfit may be used ONLY when "At Home Base" is yes and Is Combat is false. Anywhere else (streets, patrol, enemy territory) Servants wear reference_outfit / battle_outfit, never casual_outfit.',
    '   - Normal scene with no outfit change: Use "reference_outfit" (translate it into clean English Danbooru tags if it is in Chinese).',
    '   - Never put hair color, eye color, body type or character names inside "outfit"; those come from a fixed character sheet.',
    '   - Reflect "Current Site Appearance/Modifications" in scene_prompt (battle damage, decorations, barriers persist between turns and must be visible).',
    '   - Servants keep their weapons dematerialized outside battle: draw a weapon ONLY when Is Combat is true or the excerpt explicitly shows the weapon being drawn or swung in that very moment. Casual talk, planning, resting, negotiating = no weapon in hand.',
    '   - The setting is Japan in 2004: any mobile phone must be a "flip phone" (clamshell feature phone with antenna and physical keypad). Never draw smartphones, touchscreens or other post-2004 technology.',
    '   - PEOPLE FIRST: the characters (faces, expressions, poses, outfits) are the subject. Props, phones, weapons and effects are minor atmosphere — never let an object dominate or fill the frame.',
    '   - NATURAL, ALIVE POSES: never a stiff, symmetrical, straight-on standing pose. Give each character specific body language that fits the moment and their personality — weight on one leg (contrapposto), head tilt, hand on hip or chin, arms behind back, leaning on something, looking over shoulder, mid-step, sitting casually; add motion (hair blowing, sway). Prefer three-quarter view or from the side, and a camera angle that adds life (slightly from below, from above, dutch angle for tension). Show a clear facial expression (smirk, gentle smile, raised eyebrow, pout, determined glare) rather than a blank stare.',
    '   - ROMANTIC MOMENTS (kiss, embrace, confession, tender touch): make it beautiful and intimate — close-up or upper body framing, the kiss must actually be visible (lips touching or about to touch), closed or half-closed eyes, blush, gentle expressions; soft lighting, warm color tone, bokeh, floating light particles, background softly blurred. Third-person kisses use "kiss" with mutual#kiss; POV uses "incoming kiss". Only make it comedic or shocked if the story clearly says so.',
    '3. Depict the moment described at the END of the excerpt (the current state), not an earlier event. Only include props, weapons and magic effects that the excerpt explicitly shows in that moment (do not add a character\'s signature item unless it is being used).',
    '4. Scene (scene_prompt): Do NOT include count tags (1girl, 2girls, solo, multiple characters) — they are added automatically. Describe the overall composition in one short natural-language clause (who is where relative to whom, depth and distance). Camera framing ("close-up", "medium shot", "wide shot", "over-the-shoulder shot", "low angle", "dutch angle") + setting + current site modifications/atmosphere + lighting. NO hair/eyes/clothes, NO text/speech bubbles.',
    '5. Characters (char_directions): For each present character output (keep every character\'s tags strictly in its own entry so features do not bleed between characters):',
    '   - "id": exact character id.',
    '   - "is_nude": boolean (true if unclothed/bathing/nude in this scene).',
    '   - "outfit": final English Danbooru clothing tags for THIS EXACT SCENE.',
    '   - "action": the character\'s placement and spatial relation FIRST (foreground / background / center, beside / behind / in front of / facing another character, near or far, above or below), then pose, expression, gaze, weapon/prop action, in English (NO hair/eyes color). Do NOT give coordinates or left/right grid positions — NovelAI decides the exact layout from these relations.',
    '   - "interaction": ONLY if 2+ characters directly interact, use NAI V5 syntax ("source#<action>" + "target#<action>", or "mutual#<action>"). Empty string "" otherwise.',
    directorCtx.cameraMode === 'pov'
      ? 'FIRST-PERSON POV MODE: The camera IS the player\'s eyes. Never draw the player\'s face or body; the player is not in char_directions. Only add "pov hands" when the player\'s hand directly interacts with a character (holding hands, being handed something by them, touching them); keep the hands small at the edge of the frame. Objects the player holds (phones, papers, weapons) are never the focus — mention them briefly or not at all. Describe every character\'s placement relative to the viewer (very close to viewer, at arm\'s length, across the room, far away) and use "looking at viewer" when they address or face the player; interactions with the player use phrases like "reaching towards viewer". Frame shots as what the player sees. CHARACTER FOCUS: in POV the visible characters are the subject of the picture — frame them close (use "close-up" or "upper body" or "cowboy shot" for one character, "medium shot" for two or three) so they fill most of the frame with clear faces and expressions; keep the background simple and secondary ("depth of field", "blurry background"), showing only enough to identify the place. Use a wide shot only when no character is visible. If a character kisses the player, use "incoming kiss" with a close-up of her face (eyes closed or half-closed, blush). Never mention out-of-view characters in scene_prompt. For EVERY character also output "in_view": true/false — false when the character is outside the player\'s field of view (behind the player, beside and out of frame, behind a wall, hidden in darkness); true only if the player would actually see them right now (e.g. "leaning in from over your shoulder" counts as visible).'
      : '',
    'ORIENTATION: also output "orientation": "portrait" for one character or two characters in close interaction (kiss, embrace, face-to-face, leaning on each other); "landscape" for battles, wide scenery, three or more characters, or two characters apart.',
    'Output strictly valid JSON: { "orientation": "portrait or landscape", "scene_prompt": "...", "char_directions": [{ "id": "...", "is_nude": false, "outfit": "...", "action": "...", "interaction": "" }] }'
  ].join('\n');

  const userMsg = [
    `Location & Time: ${directorCtx.location} (${directorCtx.timePeriod})`,
    directorCtx.locationDesc ? `Current Site Appearance/Modifications: ${directorCtx.locationDesc}` : '',
    `Is Combat: ${Boolean(directorCtx.isCombat)}`,
    `Adult Mode: ${Boolean(directorCtx.adultMode)}`,
    `Camera: ${directorCtx.cameraMode === 'pov' ? 'FIRST-PERSON POV (player is the camera)' : 'third-person'}`,
    `At Home Base: ${directorCtx.atHomeBase ? 'yes' : 'no'}`,
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

  // 第一人稱：鏡頭就是御主的眼睛，畫面中不畫御主本人
  const povMode = statusObj.cameraMode === 'pov';
  const validChars = presentChars.filter(c => c && charDb[c.id] && !(povMode && c.id === 'player_master')).slice(0, 4);
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
    let directAction = String(c.action_en || '').trim();

    if (profile.gender === 'boy') boys++;
    else girls++;

    let npBoost = '';
    if (c.use_np && NP_VISUAL_EFFECTS_[c.id]) {
      npBoost = NP_VISUAL_EFFECTS_[c.id];
      anyNpActive = true;
    }

    // 非戰鬥、沒有解放寶具時，武器不出現在畫面上（劇情就算寫了也不畫）
    const noWeaponUc = (!isCombat && !c.use_np && c.id !== 'player_master') ? 'holding weapon, weapon, spear, polearm, sword' : '';
    if (noWeaponUc) directAction = stripWeaponTags_(directAction);
    return {
      id: c.id,
      baseCore: normCore,
      weightedOutfit: weightedOutfit,
      npBoost: npBoost,
      prompt: [core, weightedOutfit, directAction, npBoost].filter(Boolean).join(', '),
      uc: [profile.uc, noWeaponUc].filter(Boolean).join(', '),
      gender: profile.gender,
      x: 0.5,
      y: 0.5
    };
  });

  // 多人同場時，把「其他角色的髮色」加進每個角色的負面提示詞，降低特徵互相污染（例如御主被染成斯卡哈的紫髮）
  const HAIR_COLOR_RE = /\b(black|white|silver|blonde|purple|red|blue|pink|orange|brown|grey|gray|green|aqua)\s+hair\b/gi;
  const hairOf = slot => (String(slot.baseCore || '').match(HAIR_COLOR_RE) || []).map(x => x.toLowerCase());
  if (charSlots.length > 1) {
    charSlots.forEach(slot => {
      const own = new Set(hairOf(slot));
      const others = [];
      charSlots.forEach(o => { if (o !== slot) hairOf(o).forEach(h => { if (!own.has(h) && others.indexOf(h) === -1) others.push(h); }); });
      if (others.length > 0) slot.uc = [slot.uc, others.join(', ')].filter(Boolean).join(', ');
    });
    // 同時把每個角色自己的髮色加權，貼身互動（親吻、擁抱）時也不容易被染色
    charSlots.forEach(slot => {
      const boost = str => String(str || '').replace(/(^|,\s*)((?:[a-z]+ )*(?:black|white|silver|blonde|purple|red|blue|pink|orange|brown|grey|gray|green|aqua) hair)(?=\s*,|$)/gi, (m0, sep, tag) => `${sep}1.25::${tag}::`);
      slot.baseCore = boost(slot.baseCore);
      slot.prompt = boost(slot.prompt);
    });
  }

  const countTags = [];
  if (girls === 1) countTags.push('1girl');
  else if (girls > 1) countTags.push(`${girls}girls`);
  if (boys === 1) countTags.push('1boy');
  else if (boys > 1) countTags.push(`${boys}boys`);
  if (girls + boys === 1) countTags.push('solo');
  else if (girls + boys > 1) countTags.push('multiple characters');
  if (povMode) {
    if (girls + boys === 0) countTags.push('no humans', 'scenery');
    countTags.push('pov', 'first-person view');
    if (girls + boys > 0) countTags.push('depth of field');
  }

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
    cameraMode: povMode ? 'pov' : 'third',
    combatEnvTags: combatEnvTags,
    artStyle: statusObj.artStyle || 'official',
    characters: charSlots,
    width: pickNaiSize_(charSlots.length).width,
    height: pickNaiSize_(charSlots.length).height,
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
      cameraMode: povMode ? 'pov' : 'third',
      atHomeBase: statusObj.locationKey === '廢棄洋館',
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
          casualOutfit: String(dbInfo.casualOutfit || '').trim(),
          hint: String(c.action_en || '')
        };
      })
    }
  };
}

// NovelAI 的互動語法只認 source# / target# / mutual# 三種前綴；其他「xxx#」前綴（例如角色名#）會被當成雜訊，直接去掉前綴保留動作
function stripBadInteractionPrefix_(str) {
  return String(str || '').split(',').map(t => t.trim()).filter(Boolean)
    .map(t => (/^(source|target|mutual)#/i.test(t) ? t : t.replace(/^[^\s#,]{1,24}#/, '')))
    .join(', ');
}

function sanitizeNaiInteraction_(str) {
  return stripBadInteractionPrefix_(str);
}

// 第一人稱視野判斷：Gemini 有時把 in_view 寫進文字、或寫了「站在身後」卻標成看得到，所以程式端再判斷一次
function isOutOfPovView_(d) {
  const text = `${d.action || ''} ${d.interaction || ''}`.toLowerCase();
  if (d.in_view === false || String(d.in_view).toLowerCase() === 'false' || /in_view\s*[:=]\s*false/.test(text)) return true;
  // 站在身後的人就算「看著你」也看不到；只有從肩膀探頭、湊過來、出現在面前才算看得到
  const visibleHint = /over (the |your |viewer'?s )?shoulder|leaning (in|over|towards)|peeking|in front of (the )?viewer/.test(text);
  const hiddenHint = /behind (the )?viewer|behind the player|behind you|out of (frame|view|sight)|off-?screen|unseen|hidden from view/.test(text);
  return hiddenHint && !visibleHint;
}

// 從場景描述中移除提到指定角色的片段（以逗號分段；比對角色 ID 與英文名常見寫法）
function removeCharacterMentions_(scenePrompt, ids, ctxChars) {
  const needles = [];
  (ids || []).forEach(id => {
    needles.push(String(id).toLowerCase().replace(/_/g, ' '));
    const c = (ctxChars || []).find(x => x.id === id);
    if (c && c.name) needles.push(String(c.name).toLowerCase());
  });
  const extra = { lancer: ['cu chulainn', 'cú chulainn'], saber: ['artoria'], archer: ['emiya'], rider: ['medusa'], caster: ['medea'], assassin: ['kojirou', 'kojiro'], berserker: ['heracles'], rin: ['tohsaka'], hassan: ['hassan'] };
  (ids || []).forEach(id => (extra[id] || []).forEach(n => needles.push(n)));
  return String(scenePrompt || '').split(',').map(t => t.trim())
    .filter(t => t && !needles.some(n => n && t.toLowerCase().includes(n)))
    .join(', ');
}

// 自動選擇畫面方向：只有 1 個角色時用直式（角色更大、細節更多），2 人以上或純風景用橫式
// 兩種尺寸像素量相同（約 101 萬），都在 Opus 免費範圍內
function pickNaiSize_(charCount) {
  return Number(charCount) === 1 ? { width: 832, height: 1216 } : { width: 1216, height: 832 };
}

// 依實際畫進畫面的角色重算人數標籤（第一人稱會濾掉視野外的角色）
function buildCountTags_(chars, povMode) {
  let girls = 0;
  let boys = 0;
  (chars || []).forEach(c => { if (c.gender === 'boy') boys++; else girls++; });
  const tags = [];
  if (girls === 1) tags.push('1girl');
  else if (girls > 1) tags.push(`${girls}girls`);
  if (boys === 1) tags.push('1boy');
  else if (boys > 1) tags.push(`${boys}boys`);
  if (girls + boys === 1) tags.push('solo');
  else if (girls + boys > 1) tags.push('multiple characters');
  if (povMode) {
    if (girls + boys === 0) tags.push('no humans', 'scenery');
    tags.push('pov', 'first-person view');
    if (girls + boys > 0) tags.push('depth of field');
  }
  return tags;
}

// 兩組服裝 tags 的相似度（重疊 tag 比例），用來判斷導演是不是把服裝改回了戰鬥裝
function outfitSimilarity_(a, b) {
  const ta = String(a || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
  const tb = new Set(String(b || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean));
  if (ta.length === 0 || tb.size === 0) return 0;
  return ta.filter(t => tb.has(t)).length / Math.min(ta.length, tb.size);
}

function generateTurnCgAsync(imgPayload) {
  if (!imgPayload) throw new Error('無場景資料');
  const working = JSON.parse(JSON.stringify(imgPayload));
  let directedApplied = false;

  if (working._directorContext) {
    const directed = translateSceneToNaiV5_(working._directorContext);
    if (directed) {
      directedApplied = true;
      if (working.cameraMode === 'pov' && Array.isArray(directed.char_directions) && Array.isArray(working.characters)) {
        const outOfView = new Set(directed.char_directions.filter(d => d && d.id && isOutOfPovView_(d)).map(d => d.id));
        if (outOfView.size > 0) {
          working.characters = working.characters.filter(ch => !outOfView.has(ch.id));
          working.countPrefix = buildCountTags_(working.characters, true).join(', ');
          const newSize = pickNaiSize_(working.characters.length);
          working.width = newSize.width;
          working.height = newSize.height;
          if (directed.scene_prompt) {
            directed.scene_prompt = removeCharacterMentions_(directed.scene_prompt, Array.from(outOfView), (working._directorContext || {}).chars || []);
          }
          if (!directed.scene_prompt) {
            const restTags = stripCountTags_(working.prompt).split(',').map(t => t.trim())
              .filter(t => t && !/^(pov|first-person view|no humans|scenery)$/i.test(t)).join(', ');
            working.prompt = [working.countPrefix, restTags].filter(Boolean).join(', ');
          }
        }
      }
      // 導演決定畫面方向（兩種尺寸像素量相同，都在免費範圍）
      if (directed.orientation === 'portrait' && Array.isArray(working.characters) && working.characters.length <= 2) {
        working.width = 832; working.height = 1216;
      } else if (directed.orientation === 'landscape') {
        working.width = 1216; working.height = 832;
      }
      const directedNude = Array.isArray(directed.char_directions) && directed.char_directions.some(d => d && (Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit)));
      const alreadyNude = /(^|,\s*)nsfw(\s*,|$)/.test(String(working.prompt || ''));
      const ratingTag = (working.adultMode && (directedNude || alreadyNude)) ? 'nsfw' : '';
      // 第一人稱：玩家這回合沒有用手碰角色或接東西時，不畫 pov hands（避免畫面兩側出現一雙大手）
      const handAction = /握|牽|摸|撫|遞|接過|拿|抓|抱|拍|推|拉|觸|摟|伸手|手/.test(String((working._directorContext || {}).userAction || ''));
      if (directed.scene_prompt && !handAction) {
        directed.scene_prompt = String(directed.scene_prompt).split(',').map(t => t.trim()).filter(t => t && !/^pov hands?$/i.test(t)).join(', ');
      }
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

          const ctxChar = ((working._directorContext || {}).chars || []).find(x => x.id === ch.id) || {};
          const ctxInfo = working._directorContext || {};
          const atHomeCalm = ctxInfo.atHomeBase && !ctxInfo.isCombat;
          if (atHomeCalm && ctxChar.casualOutfit && ctxChar.referenceOutfit === ctxChar.casualOutfit && d.outfit && outfitSimilarity_(d.outfit, ctxChar.battleOutfit) >= 0.5) {
            d.outfit = ctxChar.casualOutfit;
          }
          const isNude = Boolean(d.is_nude) || isNudeOutfitTags_(d.outfit);
          const finalCore = isNude ? stripClothesFromCore_(ch.baseCore) : ch.baseCore;
          const finalOutfit = d.outfit
            ? formatCharacterOutfitPrompt_(isNude ? 'nude, completely nude, no clothes' : d.outfit)
            : ch.weightedOutfit;

          const calmScene = !((working._directorContext || {}).isCombat) && !d.use_np && ch.id !== 'player_master';
          const actionParts = [sanitizeNaiInteraction_(d.interaction), calmScene ? stripWeaponTags_(stripBadInteractionPrefix_(d.action)) : stripBadInteractionPrefix_(d.action)].filter(Boolean).join(', ')
            .split(',').map(t => t.trim()).filter(t => t && !/^in_view\s*[:=]/i.test(t)).join(', ');

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
    // V5 品質已經很穩，負面提示詞保持精簡：舊時代那一長串（bad, error, extra, bad hands...）會讓畫面變灰、變保守
    // 只排除品質底線、文字浮水印、馬賽克；角色專屬的負面（GameData.js 的 uc）另外照常套用
    const defaultUc = 'worst quality, bad quality, lowres, jpeg artifacts, watermark, signature, text, speech bubble, censored, mosaic censoring, bar censor, smartphone';
    const cleanedChars = (Array.isArray(params.characters) ? params.characters : []).filter(c => String(c.prompt || '').trim().length > 0);

    const styleKey = params.artStyle || 'official';
    const styleTags = ART_STYLE_PRESETS_[styleKey] || ART_STYLE_PRESETS_['official'];

    let finalPrompt = String(params.prompt || '').trim();
    if (styleTags) {
      finalPrompt = finalPrompt ? `${finalPrompt}, ${styleTags}` : styleTags;
    }
    if (params.autoQuality !== false) {
      const qualityTags = (typeof params.qualityTags === 'string') ? params.qualityTags : 'very aesthetic, masterpiece, high complexity, no text';
      if (qualityTags) finalPrompt = finalPrompt ? `${finalPrompt}, ${qualityTags}` : qualityTags;
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

// 角色資料內建在 GameData.js（FATE_CHARACTERS_），保留原本的資料格式給其他函式使用
let CHAR_DB_MEMO_ = null;
function getCharAppearanceMap_(ss) {
  if (CHAR_DB_MEMO_) return CHAR_DB_MEMO_;
  const map = {};
  FATE_CHARACTERS_.forEach(c => {
    map[c.id] = {
      id: c.id,
      triggers: c.names,
      gender: c.gender === 'boy' ? 'boy' : 'girl',
      coreTraits: c.core,
      defaultOutfit: c.outfit,
      casualOutfit: c.casual || '',
      uc: c.uc || '',
      summonable: c.id === 'saber_alter' ? false : Boolean(c.summonable)
    };
  });
  CHAR_DB_MEMO_ = map;
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

// 陣營初始狀態：內建在 CANONICAL_7_FACTIONS_（D 預設狀態／E 預設態度），格式例如「存活 (中立警戒)」
function getDefaultFactionsState_(ss) {
  const res = {};
  CANONICAL_7_FACTIONS_.forEach(r => {
    res[r[0]] = r[4] ? `${r[3]} (${r[4]})` : r[3];
  });
  return res;
}

// 世界書內建在 Lore.js（FATE_LORE_BUILTIN_）
let LORE_ROWS_MEMO_ = null;
function getLorebookRows_(ss) {
  if (LORE_ROWS_MEMO_) return LORE_ROWS_MEMO_;
  LORE_ROWS_MEMO_ = FATE_LORE_BUILTIN_.map(e => ({
    keywords: (e.keys || []).map(k => String(k).trim()).filter(Boolean),
    category: String(e.cat || '').trim(),
    priority: Number(e.pri) || 5,
    content: String(e.text || '').trim()
  })).filter(r => r.content);
  return LORE_ROWS_MEMO_;
}

// 世界書檢索：
// - 優先度 ≥ 10：每回合必載入（核心規則）
// - 其餘依關鍵字命中來源加權：玩家本回合行動 ×3、目前狀態（地點／從者／重要事件／流言）×2、最近劇情 ×1；不分大小寫
// - 依「分數 → 優先度」排序，最多 LORE_MAX_MATCHED 條、總長 LORE_MAX_CHARS 字，避免每回合塞滿無關設定
function searchLorebook_(ss, ctx) {
  const c = (typeof ctx === 'string') ? { action: ctx, state: '', recent: '' } : (ctx || {});
  const action = String(c.action || '').toLowerCase();
  const state = String(c.state || '').toLowerCase();
  const recent = String(c.recent || '').toLowerCase();

  const always = [];
  const matched = [];
  getLorebookRows_(ss).forEach(r => {
    if (r.priority >= 10) {
      always.push(r);
      return;
    }
    let score = 0;
    r.keywords.forEach(kw => {
      const k = kw.toLowerCase();
      if (!k) return;
      if (action.includes(k)) score += 3;
      else if (state.includes(k)) score += 2;
      else if (recent.includes(k)) score += 1;
    });
    if (score > 0) matched.push({ r: r, score: score });
  });
  matched.sort((a, b) => (b.score - a.score) || (b.r.priority - a.r.priority));

  const lines = [];
  let total = 0;
  const push = r => {
    const line = `- ${r.category ? '[' + r.category + '] ' : ''}${r.content}`;
    if (total + line.length > LORE_MAX_CHARS && lines.length > 0) return false;
    lines.push(line);
    total += line.length;
    return true;
  };
  always.forEach(push);
  matched.slice(0, LORE_MAX_MATCHED).forEach(m => push(m.r));
  return lines.join('\n');
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
    cameraMode: meta.cameraMode === 'third' ? 'third' : 'pov',
    keyEvents: Array.isArray(meta.keyEvents) ? meta.keyEvents : [],
    rumors: Array.isArray(meta.rumors) ? meta.rumors : [],
    smsContacts: (meta.smsContacts && typeof meta.smsContacts === 'object') ? meta.smsContacts : {},
    routeTendency: meta.routeTendency || {},
    contactChannels: Object.fromEntries(Object.keys(parsedFactions).map(k => { const c = getContactChannel_(k); return [k, { icon: c.icon, label: c.label, who: c.who }]; })),
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
    warTickerPublic: String(meta.warTickerPublic || ''),
    factionFavor: Object.fromEntries(Object.keys(safeJsonParse_(row[29], {})).map(k => [k, getFactionFavor_(meta, k)])),
    appointments: Array.isArray(meta.appointments) ? meta.appointments.map(a => ({ name: companionDisplayName_(a.fk), day: a.day, period: a.period, place: a.place })) : [],
    companions: Object.keys((meta.companions && typeof meta.companions === 'object') ? meta.companions : {}).map(k => ({ faction: k, name: companionDisplayName_(k) })),
    godHand: (meta.godHand && typeof meta.godHand === 'object') ? meta.godHand : { lost: 0, methods: [] },
    factionIntel: (meta.factionIntel && typeof meta.factionIntel === 'object') ? meta.factionIntel : initFactionIntel_(safeJsonParse_(row[29], {}), true),
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
    servantRoster: Array.isArray(meta.servantRoster) ? meta.servantRoster : [],
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
