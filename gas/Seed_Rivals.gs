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
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅',   // 第五次真·Assassin：臟硯借小次郎的身體召出（HF 中段才現身；小次郎提早倒下就提早，見 WAR_FALL_）
    arriveDay: 7, arriveHint: '新都的暗巷接連出事，目擊的人只記得一張白骨面具' },
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

// 原作事件：到了那一天的早報就發生（涉及的從者都得還是活著的敵人，否則整條跳過）。
//   need＝要在場的從者；reveal＝看穿到哪一層（1 職階與據點／2 真名）；move＝據點搬家。
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
  { war: '4th', day: 10, need: ['吉爾德萊-Caster'], reveal: { '吉爾德萊-Caster': 2 }, move: { '吉爾德萊-Caster': '未遠川' },
    txt: '未遠川上浮出一團山一樣大的海魔，站在頂上的 Caster 高喊著「貞德」——教會連夜封鎖河岸，這位元帥的真名再也藏不住' }
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
