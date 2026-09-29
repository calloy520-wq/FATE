// ==========================================
// 🔵 Seed_Rivals.gs — 新聖杯戰爭的正典資料：兩場戰爭的陣容（誰、御主、據點、登場），與早報裡的原作事件。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }


// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點｜可選 arriveDay：第N天才登場，預設1＝開局即登場；arriveHint：登場前1~2天的世界風聲自訂提示句，未填則退回依職階的泛用措辭；master 可為 …（全文見 CODE_NOTES.md）
var FATE_5TH_ROSTER = [
  { master: '衛宮士郎-5th', hero: '阿爾托莉雅-Saber', loc: '衛宮邸' },
  { master: '遠坂凜-5th', hero: 'EMIYA-Archer', loc: '遠坂宅' },
  { master: '間桐慎二-5th', hero: '美杜莎-Rider', loc: '間桐宅' },   // 表面上的御主是慎二（偽臣之書），真正的御主是櫻
  { master: '言峰綺禮-5th', hero: '庫丘林-Lancer', loc: '言峰教會' },
  { master: '葛木宗一郎-5th', hero: '美狄亞-Caster', loc: '柳洞寺' },
  { master: '伊莉雅絲菲爾-5th', hero: '赫拉克勒斯-Berserker', loc: '艾因茲貝倫城' },
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅' }, // 第五次真·Assassin：蟲爺臟硯召喚的咒腕哈桑
  { master: '言峰綺禮-5th', hero: '吉爾伽美什-Archer', loc: '冬木·新都',   // 綺禮同時握著兩位從者：上一次留下來的吉爾伽美什，與奪來的庫丘林
    arriveDay: 3, arriveHint: '有人在新都看見一位金髮紅瞳的青年，身上帶著從者的氣息——那道氣息似乎早就在冬木了' },
  { master: null, masterLabel: 'Caster', hero: '佐佐木小次郎-Assassin', loc: '柳洞寺' } // 美狄亞違規召喚、綁在山門的從者（卡上寫 Caster：寫真名會洩漏 Caster 是誰）
];

// 第四次聖杯戰爭正典陣容（Fate/Zero）
var FATE_4TH_ROSTER = [
  { master: '衛宮切嗣-4th', hero: '阿爾托莉雅-Saber', loc: '艾因茲貝倫城' },
  { master: '遠坂時臣-4th', hero: '吉爾伽美什-Archer', loc: '遠坂宅' },
  { master: '肯尼斯-4th', hero: '迪盧木多-Lancer', loc: '海特飯店' },
  { master: '韋伯·維爾維特-4th', hero: '伊斯坎達爾-Rider', loc: '麥肯基宅' },
  { master: '雨生龍之介-4th', hero: '吉爾德萊-Caster', loc: '下水道' },
  { master: '言峰綺禮-4th', hero: '百貌哈桑-Assassin', loc: '言峰教會',   // 原作開場：假死退場，其實分身還在替遠坂家刺探
    fakeDeath: '開戰當晚，一位 Assassin 闖進遠坂邸，被金色的從者當場擊殺；教會宣布這組主從退場' },
  { master: '間桐雁夜-4th', hero: '蘭斯洛特-Berserker', loc: '間桐宅' }
];

// 原作事件：到了那一天的早報就發生（涉及的從者都得還是活著的敵人，否則整條跳過）。
//   need＝要在場的從者；reveal＝看穿到哪一層（1 職階與據點／2 真名）；move＝據點搬家。
var WAR_CANON_EVENTS_ = [
  { war: '5th', day: 2, need: ['赫拉克勒斯-Berserker'], reveal: { '赫拉克勒斯-Berserker': 1 },
    txt: '昨夜的坡道上，有人看見一個白髮的少女提起裙襬行禮，身後跟著一道巨人般的影子' },
  { war: '5th', day: 4, need: ['美杜莎-Rider'], reveal: { '美杜莎-Rider': 1 },
    txt: '穗群原學園整棟被紅色的結界罩住，學生接連昏倒——有人在學校裡張了吸取生命的結界' },
  { war: '4th', day: 2, need: ['阿爾托莉雅-Saber', '迪盧木多-Lancer', '伊斯坎達爾-Rider'],
    reveal: { '阿爾托莉雅-Saber': 1, '迪盧木多-Lancer': 1, '伊斯坎達爾-Rider': 2 },
    txt: '昨夜港邊的倉庫街，Saber 與 Lancer 正面交鋒，一輛雷鳴的戰車闖進來，駕車的巨漢高聲報上了真名：征服王伊斯坎達爾' },
  { war: '4th', day: 5, need: ['迪盧木多-Lancer'], move: { '迪盧木多-Lancer': '廢棄工廠' },
    txt: '海特飯店的頂樓整層被炸掉了，新聞說是瓦斯氣爆；住在那裡的外國人搬進了郊外的廢棄工廠' },
  { war: '4th', day: 8, need: ['伊斯坎達爾-Rider', '阿爾托莉雅-Saber', '吉爾伽美什-Archer'],
    reveal: { '吉爾伽美什-Archer': 1, '阿爾托莉雅-Saber': 1 },
    txt: '征服王在艾因茲貝倫城的庭院擺酒，邀 Saber 與金色的英靈問答「王的器量」，三位王一直喝到天亮' }
];
