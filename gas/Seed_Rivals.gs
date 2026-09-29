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
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅', reserve: true },   // 第五次真·Assassin：臟硯借小次郎的身體召出。預備役，小次郎倒下才叫醒（WAR_FALL_、HF 線）
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
    fakeDeath: '昨夜，一位 Assassin 闖進遠坂邸，被金色的從者當場擊殺；教會宣布這組主從退場' },
  { master: '間桐雁夜-4th', hero: '蘭斯洛特-Berserker', loc: '間桐宅' }
];

// 第五次的三條路線：開局暗中抽一條（warNewGame_），靠早報的原作事件看出是哪一條，結局才揭曉。
//   final＝這條線的決戰地（沒寫照 WAR_FINAL_）；pace＝這條線的節奏（沒寫照 WAR_PACE_；HF 的從者多半被黑影吃掉，彼此廝殺得少）。
var WAR_ROUTES_ = {
  '5th': {
    fate: { label: 'Fate 線' },
    ubw: { label: 'Unlimited Blade Works 線', pace: { brawl: 0.92 } },
    hf: { label: "Heaven's Feel 線", pace: { brawl: 0.88 }, final: { place: '大空洞', arrive: '剩下的從者一個個走進柳洞寺地底的黑暗', next: '黑暗裡又走出一位從者' } }
  }
};
// 被黑影吞下、或換到魔力深不見底的御主之後的樣子（事件的 alter）：mul＝能力倍率；name／npName／look 有寫才換。
var WAR_ALTER_ = {
  '赫拉克勒斯-Berserker': { mul: 1.2, look: '巨大的身軀被黑泥浸透，全身爬滿脈動的紅色紋路，只剩下破壞的本能' },
  '美杜莎-Rider': { mul: 1.25, look: '眼罩下的氣息比以前沉重得多，長髮末端在地上拖出黑色的痕跡' },
  '阿爾托莉雅-Saber': { name: '阿爾托莉雅〔Alter〕', npName: '誓約勝利之劍（Morgan）', mul: 1.6,
    look: '漆黑的鎧甲爬滿紅色紋路，臉上戴著半截面甲，金色的眼睛冷得沒有溫度' }
};

// 原作事件：到了那一天的早報就發生（涉及的從者都得還是活著的敵人，否則整條跳過）。
//   need＝要在場的從者；reveal＝看穿到哪一層（1 職階與據點／2 真名）；move＝據點搬家。
//   route＝只在這條線發生；kill＝照原作倒下；awaken＝叫醒預備役（值是登場那天的早報）；master＝換御主；alter＝黑化（WAR_ALTER_）。
//   fallen＋id＝不看日子，倒下的從者累積到幾位的隔天早報發生（只發一次）；unmask＝need 裡假死的那位在這一幕現身。
//   short＝這一幕的名字：涉及的從者已經先倒下而演不成時，記進「改寫了原作」（結局揭曉）。
var WAR_CANON_EVENTS_ = [
  { war: '5th', day: 2, need: ['赫拉克勒斯-Berserker'], reveal: { '赫拉克勒斯-Berserker': 1 },
    txt: '昨夜的坡道上，有人看見一個白髮的少女提起裙襬行禮，身後跟著一道巨人般的影子' },
  { war: '5th', day: 3, need: ['EMIYA-Archer', '庫丘林-Lancer'], reveal: { 'EMIYA-Archer': 1, '庫丘林-Lancer': 1 },
    txt: '前幾天夜裡，穗群原學園的操場上有紅衣的弓兵與青衣的槍兵交手，聽說有個學生目擊了，差點被滅口' },
  { war: '5th', day: 4, need: ['美杜莎-Rider'], reveal: { '美杜莎-Rider': 1 },
    txt: '穗群原學園整棟被紅色的結界罩住，學生接連昏倒——有人在學校裡張了吸取生命的結界' },
  { war: '5th', day: 5, need: ['美狄亞-Caster'], reveal: { '美狄亞-Caster': 1 },
    txt: '新都接連發生集體昏睡，新聞說是瓦斯外洩；循著被抽走的魔力往回找，線頭都通往深山町的柳洞寺' },
  { war: '5th', day: 6, need: ['佐佐木小次郎-Assassin'], reveal: { '佐佐木小次郎-Assassin': 1 },
    txt: '有人上柳洞寺參拜，回來說山門前的石階上站著一個背長刀的武士，說什麼都不讓人過去' },
  // ── Fate 線 ──
  { war: '5th', route: 'fate', day: 7, need: ['阿爾托莉雅-Saber', '美杜莎-Rider'], kill: ['美杜莎-Rider'], reveal: { '阿爾托莉雅-Saber': 2 }, short: '天馬與誓約勝利之劍',
    txt: '新都的高樓頂上，一道光之劍劈開了夜空——白色的天馬與騎在上面的從者一起墜落，劍之從者報出了那把劍的名字' },
  { war: '5th', route: 'fate', day: 9, need: ['吉爾伽美什-Archer', '美狄亞-Caster'], kill: ['美狄亞-Caster'], reveal: { '吉爾伽美什-Archer': 1 }, short: '教會前的魔女',
    txt: '言峰教會前，金色的英靈只抬了一下手，柳洞寺的魔女與那位教師就倒在石階上' },
  // ── Unlimited Blade Works 線 ──
  { war: '5th', route: 'ubw', day: 5, need: ['美狄亞-Caster', '美杜莎-Rider'], kill: ['美杜莎-Rider'], reveal: { '美狄亞-Caster': 1 }, short: '山門後的教師',
    txt: '間桐家的少年逃上柳洞寺求援，出來的時候只剩一個人——眼罩的騎兵被一位赤手空拳的教師打倒在正殿' },
  { war: '5th', route: 'ubw', day: 6, need: ['美狄亞-Caster', '阿爾托莉雅-Saber'], move: { '阿爾托莉雅-Saber': '柳洞寺' }, master: { '阿爾托莉雅-Saber': 'Caster' }, reveal: { '阿爾托莉雅-Saber': 1 }, short: '破戒之符奪走 Saber',
    txt: '衛宮邸的少年被魔女的絲線綁走，一把歪扭的短劍斬斷了契約——劍之從者如今站在柳洞寺的正殿' },
  { war: '5th', route: 'ubw', day: 8, need: ['吉爾伽美什-Archer', '赫拉克勒斯-Berserker'], kill: ['赫拉克勒斯-Berserker'], reveal: { '吉爾伽美什-Archer': 1 }, short: '森林裡的十二試煉',
    txt: '艾因茲貝倫城的森林裡，金色的英靈射下成千上萬的刀劍——巨人死了十一次，最後一次再也站不起來' },
  { war: '5th', route: 'ubw', day: 9, need: ['EMIYA-Archer', '美狄亞-Caster'], kill: ['美狄亞-Caster'], move: { 'EMIYA-Archer': '衛宮邸' }, master: { '阿爾托莉雅-Saber': '遠坂凜', 'EMIYA-Archer': '無主' }, short: '紅衣弓兵的背叛',
    txt: '紅衣的弓兵離開了遠坂家的少女，走進柳洞寺的正殿反手一刀——魔女與那位教師倒在一起，被綁住的劍之從者轉而與那位少女結下契約' },
  { war: '5th', route: 'ubw', day: 11, need: ['庫丘林-Lancer', '吉爾伽美什-Archer'], kill: ['庫丘林-Lancer'], master: { '吉爾伽美什-Archer': '間桐慎二' }, short: '火場裡的槍兵',
    txt: '郊外的古城燒了一整夜；青衣的槍兵把神父釘在牆上、把被綁住的少女送出火場，自己留在了火裡。金色的英靈換了一位新御主——間桐家的少年' },
  // ── Heaven's Feel 線 ──
  { war: '5th', route: 'hf', day: 3, need: ['佐佐木小次郎-Assassin'], kill: ['佐佐木小次郎-Assassin'], short: '山門的武士',
    awaken: { '咒腕之哈桑-Assassin': '新都的暗巷接連出事，目擊的人只記得一張白骨面具' },
    txt: '柳洞寺山門的武士被人從體內撕開——一隻纏滿繃帶的手臂，從武士的胸口伸了出來' },
  { war: '5th', route: 'hf', day: 4, need: ['庫丘林-Lancer'], kill: ['庫丘林-Lancer'], short: '墓地的槍兵',
    txt: '教會後方的墓地，青衣的槍兵擋下了戴白骨面具的暗殺者，卻被地面湧出的黑影整個吞了下去' },
  { war: '5th', route: 'hf', day: 6, need: ['美狄亞-Caster'], kill: ['美狄亞-Caster'], short: '沉進影子的魔女',
    txt: '柳洞寺的正殿被黑色的泥淹沒，魔女的身影一點一點沉進了影子裡' },
  { war: '5th', route: 'hf', day: 7, need: ['美杜莎-Rider'], master: { '美杜莎-Rider': '間桐櫻' }, alter: ['美杜莎-Rider'],
    txt: '間桐家那本書燒成了灰——眼罩的騎兵如今只聽一位紫髮少女的話，流進它身上的魔力多得不像一個人給得起' },
  { war: '5th', route: 'hf', day: 8, need: ['阿爾托莉雅-Saber'], alter: ['阿爾托莉雅-Saber'], master: { '阿爾托莉雅-Saber': '間桐櫻' }, move: { '阿爾托莉雅-Saber': '柳洞寺' }, reveal: { '阿爾托莉雅-Saber': 1 }, short: '被黑影吞下的騎士王',
    txt: '衛宮家的 Saber 在柳洞寺的池邊被黑影吞沒；再出現時，那身藍色的鎧甲已經染成漆黑' },
  { war: '5th', route: 'hf', day: 10, need: ['阿爾托莉雅-Saber', '赫拉克勒斯-Berserker'], alter: ['赫拉克勒斯-Berserker'], master: { '赫拉克勒斯-Berserker': '間桐櫻' }, reveal: { '赫拉克勒斯-Berserker': 1 }, short: '黑色的劍光與巨人',
    txt: '艾因茲貝倫城外的森林被黑色的劍光削平，巨人倒下之後又站了起來——身上爬滿紅色的紋路，再也聽不見白髮少女的呼喚' },
  { war: '5th', route: 'hf', day: 11, need: ['吉爾伽美什-Archer'], kill: ['吉爾伽美什-Archer'], short: '被黑泥吞下的王',
    txt: '深山町的路口，金色的英靈對著那道影子開口，話還沒說完，就被湧上來的黑泥吞了下去' },
  { war: '4th', day: 2, need: ['阿爾托莉雅-Saber', '迪盧木多-Lancer', '伊斯坎達爾-Rider'],
    reveal: { '阿爾托莉雅-Saber': 1, '迪盧木多-Lancer': 1, '伊斯坎達爾-Rider': 2 },
    txt: '昨夜港邊的倉庫街，Saber 與 Lancer 正面交鋒，一輛雷鳴的戰車闖進來，駕車的巨漢高聲報上了真名：征服王伊斯坎達爾' },
  { war: '4th', day: 3, need: ['蘭斯洛特-Berserker', '吉爾伽美什-Archer'], reveal: { '蘭斯洛特-Berserker': 1, '吉爾伽美什-Archer': 1 },
    txt: '倉庫街那一夜還沒完：路燈上的金色英靈擲下滿天寶具，一道黑霧般的騎士接住刀劍、反手擲了回去' },
  { war: '4th', day: 5, need: ['迪盧木多-Lancer'], move: { '迪盧木多-Lancer': '廢棄工廠' },
    txt: '海特飯店的頂樓整層被炸掉了，新聞說是瓦斯氣爆；住在那裡的外國人搬進了郊外的廢棄工廠' },
  { war: '4th', day: 8, need: ['伊斯坎達爾-Rider', '阿爾托莉雅-Saber', '吉爾伽美什-Archer'],
    reveal: { '吉爾伽美什-Archer': 1, '阿爾托莉雅-Saber': 1 },
    txt: '征服王在艾因茲貝倫城的庭院擺酒，邀 Saber 與金色的英靈問答「王的器量」，三位王一直喝到天亮' },
  { war: '4th', day: 8, need: ['伊斯坎達爾-Rider', '百貌哈桑-Assassin'], unmask: true, kill: ['百貌哈桑-Assassin'], short: '王之軍勢踏平暗殺者',
    txt: '聖杯問答的酒席上，數十個戴白骨面具的暗殺者同時現身；下一刻，月光下展開一整片沙漠，征服王的軍勢把他們全數踏平' },
  { war: '4th', day: 9, need: ['迪盧木多-Lancer'], kill: ['迪盧木多-Lancer'], short: '被令咒逼死的騎士',
    txt: '廢棄工廠裡，槍兵的御主被黑衣的男人逼著用盡了令咒——兩把槍貫穿了槍兵自己的胸口，詛咒聖杯的吼聲響了一整夜' },
  { war: '4th', day: 10, need: ['吉爾德萊-Caster'], reveal: { '吉爾德萊-Caster': 2 }, move: { '吉爾德萊-Caster': '未遠川' },
    txt: '未遠川上浮出一團山一樣大的海魔，站在頂上的 Caster 高喊著「貞德」——教會連夜封鎖河岸，這位元帥的真名再也藏不住' },
  { war: '4th', day: 11, need: ['阿爾托莉雅-Saber', '吉爾德萊-Caster'], kill: ['吉爾德萊-Caster'], reveal: { '阿爾托莉雅-Saber': 2 }, short: '未遠川的光之劍',
    txt: '未遠川上，一道光之劍把海魔整個蒸發，站在頂上的元帥跟著沉進了河底——河岸上的人都聽見了那把劍的名字' },
  { war: '4th', day: 12, need: ['阿爾托莉雅-Saber', '蘭斯洛特-Berserker'], kill: ['蘭斯洛特-Berserker'], reveal: { '蘭斯洛特-Berserker': 2 }, short: '湖之騎士',
    txt: '地下停車場裡，黑色的騎士被一劍貫穿，頭盔落地——Saber 抱著那位騎士，叫出了那個名字：蘭斯洛特' },
  { war: '4th', day: 13, need: ['吉爾伽美什-Archer', '伊斯坎達爾-Rider'], kill: ['伊斯坎達爾-Rider'], reveal: { '吉爾伽美什-Archer': 2 }, short: '冬木大橋上的征服王',
    txt: '冬木大橋上，征服王率領王之軍勢衝向金色的英靈，自己最後一個倒下——被留在橋上的少年，活了下來' },
  // 聖杯的容器：從者倒得越多，愛麗絲菲爾越撐不住（原作第四次的小聖杯）
  { war: '4th', fallen: 2, id: 'iri1', txt: '艾因茲貝倫城的白髮女性在庭院裡站不穩，扶著牆笑說只是有點累' },
  { war: '4th', fallen: 4, id: 'iri2', txt: '艾因茲貝倫城的白髮女性已經下不了床，一位黑髮的女性寸步不離地守在旁邊' },
  { war: '4th', fallen: 5, id: 'iri3', txt: '艾因茲貝倫城遭到夜襲，下不了床的白髮女性被人擄走——擄走的方向，是新都剛落成的市民會館' }
];

// 原作從者在自己那場戰爭倒下後的餘波（原作味的彩蛋）：接在擊敗那句後面，說書照這句去演，其餘即興。
//   只寫看得見的動作、不寫名字與心情；summon＝這一位倒下會提早引出誰（還沒登場才生效），hint＝那一位登場時的早報。
var WAR_FALL_ = [
  { war: '5th', hero: '阿爾托莉雅-Saber', txt: '衛宮邸的少年失去了劍之從者，隔天夜裡仍握著一根強化過的鐵管走上夜路' },
  { war: '5th', hero: 'EMIYA-Archer', txt: '遠坂宅的少女把剩下的寶石一顆顆收進口袋，在地圖上圈出了幾個可以結盟的名字' },
  { war: '5th', hero: '美杜莎-Rider', txt: '間桐宅裡，一本書在少年手中燒成灰；站在走廊盡頭的紫髮少女靜靜看著那團火' },
  { war: '5th', hero: '庫丘林-Lancer', txt: '言峰教會的神父聽完消息，低聲念完一段悼詞，嘴角卻是揚起的' },
  { war: '5th', hero: '美狄亞-Caster', txt: '柳洞寺的那位教師隔天照常站上講台，把點名簿一頁一頁翻完' },
  { war: '5th', hero: '佐佐木小次郎-Assassin', txt: '柳洞寺山門的武士消散的地方，石階上的影子多留了一會兒，像是有什麼從裡面爬了出去',
    summon: '咒腕之哈桑-Assassin', hint: '柳洞寺山門的石階上留著一道不屬於任何人的影子——有人說，那晚之後冬木多了一位戴白骨面具的暗殺者' },
  { war: '5th', hero: '赫拉克勒斯-Berserker', txt: '艾因茲貝倫城的雪地上，白髮的少女抱著膝蓋坐了一整夜，兩位女僕一左一右撐著傘守在旁邊' },
  { war: '5th', hero: '咒腕之哈桑-Assassin', txt: '間桐宅的地下室傳出蟲群騷動的聲音，持續了一整夜' },
  { war: '5th', hero: '吉爾伽美什-Archer', txt: '言峰教會的神父把一只還剩半杯紅酒的杯子放回架上，就這樣擱著' },
  { war: '4th', hero: '阿爾托莉雅-Saber', txt: '艾因茲貝倫城裡，黑衣的男人一言不發地替槍裝上子彈，白髮的女性按著胸口坐在窗邊' },
  { war: '4th', hero: '吉爾伽美什-Archer', txt: '遠坂宅的當主整好衣領，把一封寫給女兒的信與一柄短劍交給了教會的神父' },
  { war: '4th', hero: '迪盧木多-Lancer', txt: '那位外國魔術師鐵青著臉收拾行李，身旁的未婚妻一直望著從者消失的方向' },
  { war: '4th', hero: '伊斯坎達爾-Rider', txt: '麥肯基宅的少年在二樓哭了一整夜，隔天早上還是下樓陪老夫婦吃了早餐' },
  { war: '4th', hero: '吉爾德萊-Caster', txt: '下水道的工房裡，年輕人對著空蕩蕩的石台哼著歌，一邊整理那些畫到一半的「作品」' },
  { war: '4th', hero: '百貌哈桑-Assassin', txt: '言峰教會少了一整群耳目，那位神父第一次在夜裡親自走出門' },
  { war: '4th', hero: '蘭斯洛特-Berserker', txt: '間桐宅的男人拖著半邊不聽使喚的身體，一步一步爬進了地下室' }
];
