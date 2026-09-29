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
    fate: { label: 'Fate 線', pace: { brawl: 0.9 } },
    ubw: { label: 'Unlimited Blade Works 線', pace: { brawl: 0.89 }, final: { place: '柳洞寺', arrive: '寺院的池子上方懸著一團不斷膨脹的黑色輪廓——聖杯正在成形；剩下的從者陸續踏上石階', next: '石階上又來了一位從者' } },
    hf: { label: "Heaven's Feel 線", pace: { brawl: 0.85 }, final: { place: '大空洞', arrive: '剩下的從者一個個走進柳洞寺地底的黑暗', next: '黑暗裡又走出一位從者' } }
  }
};
// 被黑影吞下、或換到魔力深不見底的御主之後的樣子（事件的 alter）：mul＝能力倍率；name／npName／look 有寫才換；dropFx＝失去的技能；meet＝黑化後第一次撞見的那一句（換掉 WAR_TEMPER_ 的）。
var WAR_ALTER_ = {
  '赫拉克勒斯-Berserker': { mul: 1.2, look: '巨大的身軀被黑泥浸透，全身爬滿脈動的紅色紋路，只剩下破壞的本能',
    meet: '黑色的巨人從樹影裡站起來，身旁沒有那位白髮的少女——只有腳下蔓延開來的影子。' },
  '美杜莎-Rider': { mul: 1.25, look: '眼罩下的氣息沉重得多，動作卻比以前從容，像終於放開了手腳',
    meet: '眼罩的騎兵擋在路中央，身後沒有那個話多的少年，只有一句很輕的「請回吧」。' },   // HF 的 Rider 沒被黑泥污染，只是有了櫻源源不絕的魔力
  '阿爾托莉雅-Saber': { name: '阿爾托莉雅〔Alter〕', npName: '誓約勝利之劍（Morgan）', mul: 1.6, dropFx: ['wind_strike'],   // 黑化後不再藏劍：漆黑的劍身直接亮出來
    look: '漆黑的鎧甲爬滿紅色紋路，臉上戴著半截面甲，金色的眼睛冷得沒有溫度',
    meet: '漆黑的騎士王站在月光下，那把劍不再藏著——黑紅的光順著劍身流下來。' }
};

// 原作事件：到了那一天的早報就發生（涉及的從者都得還是活著的敵人，否則整條跳過）。
//   need＝要在場的從者；reveal＝看穿到哪一層（1 職階與據點／2 真名）；move＝據點搬家。
//   route＝只在這條線發生；kill＝照原作倒下；awaken＝叫醒預備役（值是登場那天的早報）；master＝換御主；alter＝黑化（WAR_ALTER_）；
//   lives＝死而復生的命增減；hurt＝血量壓到最大血量的幾成（帶傷退場）。
//   fallen＋id＝不看日子，倒下的從者累積到幾位的隔天早報發生（只發一次）；unmask＝need 裡假死的那位在這一幕現身。
//   sv＝你召喚的從者是這一位才演（別場戰爭來的英靈，在這個冬木另有原作的牽絆）。
//   after＝這幾幕（short）真的發生過才接得上（文字提到它們）。劇本不收最後一位——那一位留給玩家。
//   short＝這一幕的名字：涉及的從者已經先倒下而演不成時，記進「改寫了原作」（結局揭曉）。
var WAR_CANON_EVENTS_ = [
  { war: '5th', day: 2, need: ['EMIYA-Archer', '庫丘林-Lancer'], reveal: { 'EMIYA-Archer': 1, '庫丘林-Lancer': 1 },
    txt: '昨夜，穗群原學園的操場上有紅衣的弓兵與青衣的槍兵交手，聽說有個學生目擊了，差點被滅口' },
  { war: '5th', day: 2, need: ['庫丘林-Lancer', '阿爾托莉雅-Saber'], reveal: { '庫丘林-Lancer': 2, '阿爾托莉雅-Saber': 1 }, short: '衛宮邸的紅槍',
    txt: '衛宮邸的院子裡，青衣的槍兵擲出的紅槍繞過了劍刃、直取心臟——劍之從者按著胸口的傷退開，那把槍的名字傳遍了冬木：刺穿死棘之槍' },
  { war: '5th', day: 2, need: ['赫拉克勒斯-Berserker'], reveal: { '赫拉克勒斯-Berserker': 1 },
    txt: '昨夜的坡道上，有人看見一個白髮的少女提起裙襬行禮，身後跟著一道巨人般的影子' },
  { war: '5th', day: 4, need: ['美杜莎-Rider'], reveal: { '美杜莎-Rider': 1 },
    txt: '穗群原學園整棟被紅色的結界罩住，學生接連昏倒——有人在學校裡張了吸取生命的結界' },
  { war: '5th', day: 6, need: ['佐佐木小次郎-Assassin'], reveal: { '佐佐木小次郎-Assassin': 1 },
    txt: '有人上柳洞寺參拜，回來說山門前的石階上站著一個背長刀的武士，說什麼都不讓人過去' },
  // ── 你的從者的原作彩蛋（sv） ──
  { war: '4th', day: 5, sv: 'EMIYA-Archer', need: [],
    txt: '新都的路上，一個紅褐頭髮的小男孩從你們身邊跑過去——紅衣的弓兵停下腳步，望著那個背影，很久都沒有說話' },
  { war: '4th', day: 6, sv: '美杜莎-Rider', need: [],
    txt: '經過間桐宅的時候，二樓的窗邊坐著一個紫髮的小女孩，眼神空空的——眼罩的騎兵在窗下站了一會兒' },
  { war: '5th', day: 5, sv: '伊斯坎達爾-Rider', need: [],
    txt: '新都的咖啡店裡，一位長髮、叼著雪茄的外國講師隔著玻璃盯著你們看了很久，最後把帳單壓在杯子底下，什麼都沒說就走了' },
  // ── 路線的伏筆：各一句（Fate／UBW 第 4 天、HF 第 2 天——HF 第 3 天起本來就很明顯），猜得出自己在哪條線（主角：Fate＝Saber、UBW＝凜與弓兵、HF＝櫻） ──
  { war: '5th', route: 'fate', day: 4, need: ['阿爾托莉雅-Saber'],
    txt: '深夜，衛宮邸的屋頂上，一位金髮的劍士獨自望著月亮，站了很久才回到屋裡' },
  { war: '5th', route: 'ubw', day: 4, need: ['EMIYA-Archer'],
    txt: '遠坂宅的屋頂上，黑髮的少女跟紅衣的弓兵吵了一架——弓兵冷冷地回了一句，少女一跺腳，轉身就走' },
  { war: '5th', route: 'hf', day: 2, need: [],
    txt: '新都的街上接連有人失蹤，現場什麼都沒留下，只有地上一攤怎麼也洗不掉的黑色污漬' },
  // ── Fate 線 ──
  { war: '5th', route: 'fate', day: 7, need: ['阿爾托莉雅-Saber', '美杜莎-Rider'], kill: ['美杜莎-Rider'], reveal: { '阿爾托莉雅-Saber': 2 }, short: '天馬與誓約勝利之劍',
    txt: '新都的高樓頂上，一道光之劍劈開了夜空——白色的天馬與騎在上面的從者一起墜落，劍之從者報出了那把劍的名字' },
  { war: '5th', route: 'fate', day: 10, need: ['阿爾托莉雅-Saber', '赫拉克勒斯-Berserker'], kill: ['赫拉克勒斯-Berserker'], short: '勝利誓約之劍斬巨人',
    txt: '艾因茲貝倫城的森林裡，少年手中浮現一把黃金的劍——勝利誓約之劍，巨人被那一劍連殺了七次，終於沒有再站起來' },
  { war: '5th', route: 'fate', day: 12, need: ['阿爾托莉雅-Saber', '佐佐木小次郎-Assassin'], kill: ['佐佐木小次郎-Assassin'], short: '山門的最後一戰',
    txt: '柳洞寺的山門前，燕返的三道刀光同時落下，劍之從者迎著刀光踏進一步——背長刀的武士笑著倒在了石階上' },
  { war: '5th', route: 'fate', day: 9, need: ['吉爾伽美什-Archer', '美狄亞-Caster'], kill: ['美狄亞-Caster'], reveal: { '吉爾伽美什-Archer': 1 }, short: '教會前的魔女',
    txt: '言峰教會前，金色的英靈只抬了一下手，柳洞寺的魔女與那位教師就倒在石階上' },
  // ── Unlimited Blade Works 線 ──
  { war: '5th', route: 'ubw', day: 5, need: ['美狄亞-Caster', '美杜莎-Rider'], kill: ['美杜莎-Rider'], reveal: { '美狄亞-Caster': 1 }, short: '樹林裡的教師',
    txt: '穗群原學園的樹林裡，眼罩的騎兵撲向一位教師，反被那雙空手扭斷了頸子——教師身後浮現一道披斗篷的影子' },
  { war: '5th', route: 'ubw', day: 6, need: ['美狄亞-Caster', '阿爾托莉雅-Saber'], move: { '阿爾托莉雅-Saber': '言峰教會', '美狄亞-Caster': '言峰教會' }, master: { '阿爾托莉雅-Saber': 'Caster' }, reveal: { '阿爾托莉雅-Saber': 1 }, short: '萬符必應破戒奪走 Saber',
    txt: '被魔女佔據的教會裡，魔女拿一位女教師當人質，一把歪扭的短劍刺進劍之從者——契約斷了，劍之從者如今跟在魔女身後' },
  { war: '5th', route: 'ubw', day: 7, need: ['EMIYA-Archer', '赫拉克勒斯-Berserker'], lives: { '赫拉克勒斯-Berserker': -6 }, hurt: { 'EMIYA-Archer': 0.2 }, reveal: { 'EMIYA-Archer': 1, '赫拉克勒斯-Berserker': 1 }, short: '一個人守住的森林',
    txt: '艾因茲貝倫城外的森林裡，紅衣的弓兵一個人擋下了巨人，讓其他人先走——巨人被射殺了六次；弓兵帶著一身傷，很晚才回到遠坂宅' },
  { war: '5th', route: 'ubw', day: 8, need: ['吉爾伽美什-Archer', '赫拉克勒斯-Berserker'], kill: ['赫拉克勒斯-Berserker'], reveal: { '吉爾伽美什-Archer': 1 }, master: { '吉爾伽美什-Archer': '間桐慎二' }, short: '森林裡的十二試煉',
    txt: '艾因茲貝倫城的森林裡，金色的英靈射下成千上萬的刀劍——巨人一次又一次站起來，最後一次再也站不起來；站在金色英靈身後的，是間桐家的少年' },
  { war: '5th', route: 'ubw', day: 9, need: ['EMIYA-Archer', '美狄亞-Caster'], kill: ['美狄亞-Caster'], move: { 'EMIYA-Archer': '衛宮邸' }, master: { 'EMIYA-Archer': '無主' }, short: '紅衣弓兵的背叛',
    txt: '紅衣的弓兵離開了遠坂家的少女，走進魔女的據點反手一刀——魔女與那位教師倒在一起' },
  { war: '5th', route: 'ubw', day: 9, need: ['阿爾托莉雅-Saber'], after: ['萬符必應破戒奪走 Saber', '紅衣弓兵的背叛'], master: { '阿爾托莉雅-Saber': '遠坂凜' },
    txt: '被魔女綁住的劍之從者抬起頭，轉而與遠坂家的少女結下了契約' },
  { war: '5th', route: 'ubw', day: 10, need: ['EMIYA-Archer'], after: ['紅衣弓兵的背叛'], hurt: { 'EMIYA-Archer': 0.3 }, short: '兩個無限劍製',
    txt: '郊外古城的大廳裡，兩個念著同一句咒文的人對砍了一整夜——少年一步也沒退，紅衣的弓兵最後放下了劍，笑了' },
  { war: '5th', route: 'ubw', day: 11, need: ['庫丘林-Lancer', '吉爾伽美什-Archer'], kill: ['庫丘林-Lancer'], short: '火場裡的槍兵',
    txt: '郊外的古城燒了一整夜；青衣的槍兵把神父釘在牆上、把被綁住的少女送出火場，自己留在了火裡' },
  // ── Heaven's Feel 線 ──
  { war: '5th', route: 'hf', day: 3, need: ['佐佐木小次郎-Assassin'], kill: ['佐佐木小次郎-Assassin'], short: '山門的武士',
    awaken: { '咒腕之哈桑-Assassin': '新都的暗巷接連出事，目擊的人只記得一張白骨面具' },
    txt: '柳洞寺山門的武士被人從體內撕開——一隻纏滿繃帶的手臂，從武士的胸口伸了出來' },
  { war: '5th', route: 'hf', day: 4, need: ['庫丘林-Lancer', '咒腕之哈桑-Assassin'], kill: ['庫丘林-Lancer'], reveal: { '咒腕之哈桑-Assassin': 1 }, short: '柳洞寺的槍兵',
    txt: '柳洞寺境內，青衣的槍兵把白骨面具的暗殺者逼到牆角，腳下的影子卻湧了上來，連人帶槍吞了下去' },
  { war: '5th', route: 'hf', day: 6, need: ['美狄亞-Caster'], kill: ['美狄亞-Caster'], short: '沉進影子的魔女',
    txt: '柳洞寺的正殿被黑色的泥淹沒，魔女的身影一點一點沉進了影子裡' },
  { war: '5th', route: 'hf', day: 6, need: [],
    txt: '間桐家的少年再也沒有回家——那一夜之後，紫髮少女腳下的影子一天比一天長' },
  { war: '5th', route: 'hf', day: 7, need: ['美杜莎-Rider'], master: { '美杜莎-Rider': '間桐櫻' }, alter: ['美杜莎-Rider'],
    txt: '間桐家那本書燒成了灰——眼罩的騎兵如今只聽一位紫髮少女的話，流進它身上的魔力多得不像一個人給得起' },
  { war: '5th', route: 'hf', day: 8, need: ['阿爾托莉雅-Saber'], alter: ['阿爾托莉雅-Saber'], master: { '阿爾托莉雅-Saber': '間桐櫻' }, move: { '阿爾托莉雅-Saber': '柳洞寺' }, reveal: { '阿爾托莉雅-Saber': 1 }, short: '被黑影吞下的騎士王',
    txt: '衛宮家的 Saber 在柳洞寺的池邊被黑影吞沒；再出現時，那身藍色的鎧甲已經染成漆黑' },
  { war: '5th', route: 'hf', day: 9, need: ['EMIYA-Archer', '阿爾托莉雅-Saber'], after: ['被黑影吞下的騎士王'], kill: ['EMIYA-Archer'], short: '熾天覆七重圓環與黑色的聖劍',
    txt: '柳洞寺的山道上，紅衣的弓兵展開七片花瓣般的盾，擋下了漆黑的聖劍——盾碎了，弓兵失去了一條手臂，那條手臂後來接在了衛宮家的少年身上' },
  { war: '5th', route: 'hf', day: 10, need: ['阿爾托莉雅-Saber', '赫拉克勒斯-Berserker'], alter: ['赫拉克勒斯-Berserker'], master: { '赫拉克勒斯-Berserker': '間桐櫻' }, reveal: { '赫拉克勒斯-Berserker': 1 }, short: '黑色的劍光與巨人',
    txt: '艾因茲貝倫城外的森林被黑色的劍光削平，巨人倒下之後又站了起來——身上爬滿紅色的紋路，再也聽不見白髮少女的呼喚' },
  { war: '5th', route: 'hf', day: 12, need: ['赫拉克勒斯-Berserker'], after: ['熾天覆七重圓環與黑色的聖劍', '黑色的劍光與巨人'], kill: ['赫拉克勒斯-Berserker'], short: '射殺百頭',
    txt: '艾因茲貝倫的森林裡，衛宮家的少年解開了那條紅布纏著的手臂，投影出巨人自己的劍與技——射殺百頭，九道斬擊同時落下，黑色的巨人終於倒了' },
  { war: '5th', route: 'hf', day: 13, need: ['美杜莎-Rider', '阿爾托莉雅-Saber'], after: ['被黑影吞下的騎士王'], kill: ['阿爾托莉雅-Saber'], short: '洞窟裡的黑色騎士王',
    txt: '大空洞入口的洞窟裡，眼罩的騎兵駕著天馬撞向漆黑的聖劍——騎士王被撞倒在地，衛宮家的少年握著一柄短劍走了過去' },
  { war: '5th', route: 'hf', day: 11, need: ['吉爾伽美什-Archer'], kill: ['吉爾伽美什-Archer'], short: '被黑泥吞下的王',
    txt: '深山町的路口，金色的英靈對著那道影子開口，話還沒說完，就被湧上來的黑泥吞了下去' },
  { war: '4th', day: 2, need: ['阿爾托莉雅-Saber', '迪盧木多-Lancer', '伊斯坎達爾-Rider'],
    reveal: { '阿爾托莉雅-Saber': 1, '迪盧木多-Lancer': 1, '伊斯坎達爾-Rider': 2 },
    txt: '昨夜港邊的倉庫街，Saber 與 Lancer 正面交鋒，一輛雷鳴的戰車闖進來，駕車的巨漢高聲報上了真名：征服王伊斯坎達爾' },
  { war: '4th', day: 3, need: ['蘭斯洛特-Berserker', '吉爾伽美什-Archer'], reveal: { '蘭斯洛特-Berserker': 1, '吉爾伽美什-Archer': 1 },
    txt: '倉庫街那一夜還沒完：路燈上的金色英靈擲下滿天寶具，一道黑霧般的騎士接住刀劍、反手擲了回去' },
  { war: '4th', day: 4, need: ['吉爾德萊-Caster', '阿爾托莉雅-Saber'], reveal: { '吉爾德萊-Caster': 1 },
    txt: '艾因茲貝倫城外的森林裡，一位穿長袍的從者牽著一群孩子現身，對著城裡的劍之從者高聲喊話；同一夜，一位金髮的魔術師闖進城裡，被一發子彈打斷了全身的魔術迴路' },
  { war: '4th', day: 5, need: ['伊斯坎達爾-Rider', '吉爾德萊-Caster'], reveal: { '伊斯坎達爾-Rider': 1, '吉爾德萊-Caster': 1 },
    txt: '征服王的戰車轟進下水道深處的工房，一路碾碎了裡面的東西——跟著來的少年在出口吐了好一陣子' },
  { war: '4th', day: 5, need: ['迪盧木多-Lancer'], move: { '迪盧木多-Lancer': '廢棄工廠' },
    txt: '海特飯店的頂樓整層被炸掉了，新聞說是瓦斯氣爆；住在那裡的外國人搬進了郊外的廢棄工廠' },
  { war: '4th', day: 8, need: ['伊斯坎達爾-Rider', '阿爾托莉雅-Saber', '吉爾伽美什-Archer'],
    reveal: { '吉爾伽美什-Archer': 1, '阿爾托莉雅-Saber': 2 }, short: '聖杯問答',   // 問答之後，騎士王的身分人人皆知
    txt: '征服王在艾因茲貝倫城的庭院擺酒，邀 Saber 與金色的英靈問答「王的器量」，三位王舉杯論道，直到月色下的庭院闖進了不速之客' },
  { war: '4th', day: 8, need: ['伊斯坎達爾-Rider', '百貌哈桑-Assassin'], after: ['聖杯問答'], unmask: true, kill: ['百貌哈桑-Assassin'], short: '王之軍勢踏平暗殺者',
    txt: '聖杯問答的酒席上，數十個戴白骨面具的暗殺者同時現身；下一刻，月光下展開一整片沙漠，征服王的軍勢把他們全數踏平' },
  { war: '4th', day: 12, need: ['迪盧木多-Lancer'], kill: ['迪盧木多-Lancer'], short: '被令咒逼死的騎士',   // 切嗣逼令咒不看 Caster 怎麼死；未遠川那夜的折斷黃槍才綁 after
    txt: '廢棄工廠裡，槍兵的御主被黑衣的男人逼著用盡了令咒——兩把槍貫穿了槍兵自己的胸口，詛咒聖杯的吼聲響了一整夜' },
  { war: '4th', day: 9, need: ['吉爾伽美什-Archer'], master: { '吉爾伽美什-Archer': '言峰綺禮' }, short: '背後的短劍',
    txt: '遠坂宅的書房裡，當主轉身的那一刻，背後刺進了一柄自己送出去的短劍——金色的英靈換了一位御主，是那位年輕的神父' },
  { war: '4th', day: 10, need: ['吉爾德萊-Caster'], reveal: { '吉爾德萊-Caster': 2 }, move: { '吉爾德萊-Caster': '未遠川' },
    txt: '未遠川上浮出一團山一樣大的海魔，站在頂上的 Caster 高喊著「貞德」——教會連夜封鎖河岸，這位元帥的真名再也藏不住' },
  { war: '4th', day: 11, need: ['阿爾托莉雅-Saber', '吉爾德萊-Caster'], kill: ['吉爾德萊-Caster'], reveal: { '阿爾托莉雅-Saber': 2 }, short: '未遠川的光之劍',
    txt: '未遠川上，一道光之劍把海魔整個蒸發，站在頂上的元帥跟著沉進了河底——河岸上的人都聽見了那把劍的名字' },
  { war: '4th', day: 11, need: ['迪盧木多-Lancer'], after: ['未遠川的光之劍'],
    txt: '那一夜的河岸上，槍兵親手折斷了自己的黃槍，只為了讓劍之從者左手的傷好起來' },
  { war: '4th', day: 12, need: ['阿爾托莉雅-Saber', '蘭斯洛特-Berserker'], kill: ['蘭斯洛特-Berserker'], reveal: { '蘭斯洛特-Berserker': 2 }, short: '湖之騎士',
    txt: '地下停車場裡，黑色的騎士被一劍貫穿，頭盔落地——Saber 抱著那位騎士，叫出了那個名字：蘭斯洛特' },
  { war: '4th', day: 13, need: ['吉爾伽美什-Archer', '伊斯坎達爾-Rider'], kill: ['伊斯坎達爾-Rider'], reveal: { '吉爾伽美什-Archer': 2 }, short: '冬木大橋上的征服王',
    txt: '冬木大橋上，征服王率領王之軍勢衝向金色的英靈，自己最後一個倒下——被留在橋上的少年，活了下來' },
  // ── 混亂隨機：跨作品的宿緣（兩位都在場才演，只揭職階與據點） ──
  { war: 'chaos', day: 3, need: ['蘭斯洛特-Berserker', '阿爾托莉雅-Saber'], reveal: { '蘭斯洛特-Berserker': 1, '阿爾托莉雅-Saber': 1 },
    txt: '昨夜有人聽見一聲不像人類的嘶吼：黑霧般的騎士一路追著一位藍衣的劍士，穿過了半座城' },
  { war: 'chaos', day: 4, need: ['吉爾伽美什-Archer', '恩奇都-Lancer'], reveal: { '吉爾伽美什-Archer': 1, '恩奇都-Lancer': 1 },
    txt: '冬木大橋上，金色的英靈停下了腳步——對面站著一位綠髮的從者，兩人對望了很久，誰也沒有先出手' },
  { war: 'chaos', day: 5, need: ['庫丘林-Lancer', '斯卡哈-Lancer'], reveal: { '庫丘林-Lancer': 1, '斯卡哈-Lancer': 1 },
    txt: '港邊有人看見一位青衣的槍兵被紫髮的女槍兵追著打，槍兵嘴上抱怨個不停，腳下卻一步也不敢慢' },
  { war: 'chaos', day: 5, need: ['庫丘林-Lancer', '斯卡哈-Assassin'], reveal: { '庫丘林-Lancer': 1, '斯卡哈-Assassin': 1 },
    txt: '海邊有人看見一位青衣的槍兵，被一位穿泳裝的紫髮女人從浪裡一腳踢了出來' },
  { war: 'chaos', day: 6, need: ['伊斯坎達爾-Rider', '吉爾伽美什-Archer'], reveal: { '伊斯坎達爾-Rider': 1, '吉爾伽美什-Archer': 1 },
    txt: '雷鳴的戰車停在未遠川邊，駕車的巨漢扛著酒桶，邀金色的英靈共飲——兩位王喝到天亮，誰也沒有讓步' },
  { war: 'chaos', day: 7, need: ['EMIYA-Archer', '阿爾托莉雅-Saber'], reveal: { 'EMIYA-Archer': 1, '阿爾托莉雅-Saber': 1 },
    txt: '深山町的屋頂上，紅衣的弓兵遠遠望著一位金髮的劍士，站了很久，最後轉身走開' },
  // 聖杯的容器：從者倒得越多，愛麗絲菲爾越撐不住（原作第四次的小聖杯）
  { war: '4th', fallen: 2, id: 'iri1', txt: '艾因茲貝倫城的白髮女性在庭院裡站不穩，扶著牆笑說只是有點累' },
  { war: '4th', fallen: 4, id: 'iri2', txt: '深山町一棟日式老宅裡，白髮的女性已經下不了床，一位黑髮的女性寸步不離地守在旁邊' },
  { war: '4th', fallen: 5, id: 'iri3', txt: '深山町那棟日式老宅遭到夜襲，守在旁邊的黑髮女性倒在院子裡，下不了床的白髮女性被人擄走——擄走的方向，是新都剛落成的市民會館' }
];

// 原作從者在自己那場戰爭倒下後的餘波（原作味的彩蛋）：接在擊敗那句後面，說書照這句去演，其餘即興。
//   只寫看得見的動作、不寫名字與心情；altTxt＝黑化之後（已是櫻的從者）倒下用這句；summon＝這一位倒下會提早引出誰（還沒登場才生效），hint＝那一位登場時的早報。
var WAR_FALL_ = [
  { war: '5th', hero: '阿爾托莉雅-Saber', txt: '衛宮邸的少年失去了劍之從者，隔天夜裡仍握著一根強化過的鐵管走上夜路',
    altTxt: '柳洞寺的池邊，紫髮的少女抱著膝蓋坐在黑暗裡，對著空無一人的水面輕聲說了一句對不起' },
  { war: '5th', hero: 'EMIYA-Archer', txt: '遠坂宅的少女把剩下的寶石一顆顆收進口袋，在地圖上圈出了幾個可以結盟的名字' },
  { war: '5th', hero: '美杜莎-Rider', txt: '間桐宅裡，一本書在少年手中燒成灰；站在走廊盡頭的紫髮少女靜靜看著那團火',
    altTxt: '間桐宅的走廊盡頭，紫髮的少女一個人站了很久，手背上的令咒淡得幾乎看不見' },
  { war: '5th', hero: '庫丘林-Lancer', txt: '言峰教會的神父聽完消息，低聲念完一段悼詞，嘴角卻是揚起的' },
  { war: '5th', hero: '美狄亞-Caster', txt: '柳洞寺的那位教師隔天照常站上講台，把點名簿一頁一頁翻完' },
  { war: '5th', hero: '佐佐木小次郎-Assassin', txt: '柳洞寺山門的武士消散的地方，石階上的影子多留了一會兒，像是有什麼從裡面爬了出去',
    summon: '咒腕之哈桑-Assassin', hint: '柳洞寺山門的石階上留著一道不屬於任何人的影子——有人說，那晚之後冬木多了一位戴白骨面具的暗殺者' },
  { war: '5th', hero: '赫拉克勒斯-Berserker', txt: '艾因茲貝倫城的雪地上，白髮的少女抱著膝蓋坐了一整夜，兩位女僕一左一右撐著傘守在旁邊',
    altTxt: '黑色的巨人倒下的地方，白髮的少女踩著雪走過來，把手放在那片焦黑的地面上很久' },
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
