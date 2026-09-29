// ==========================================
// 🔵 Seed_Rivals.gs — 開局把六組敵方御主×從者鋪進玩家自己的 game_id 世界
//   敵御主 FACTION='敵御主'、敵從者 FACTION='敵從者'（與玩家自己的「從者」區分，
//   才不會被 get_tags / fate_battle 誤認成玩家的從者）。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }


// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點｜可選 arriveDay：第N天才登場，預設1＝開局即登場；arriveHint：登場前1~2天的世界風聲自訂提示句，未填則退回依職階的泛用措辭；master 可為 …（全文見 CODE_NOTES.md）
var FATE_5TH_ROSTER = [
  { master: '衛宮士郎-5th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂凜-5th', hero: 'EMIYA-Archer', loc: '遠坂宅' },
  { master: '間桐櫻(黑化)-5th', hero: '美杜莎-Rider', loc: '間桐宅' },
  { master: '言峰綺禮-5th', hero: '庫丘林-Lancer', loc: '言峰教會' },
  { master: '葛木宗一郎-5th', hero: '美狄亞-Caster', loc: '柳洞寺' },
  { master: '伊莉雅絲菲爾-5th', hero: '赫拉克勒斯-Berserker', loc: '冬木·新都' },
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅' }, // 第五次真·Assassin：蟲爺臟硯召喚的咒腕哈桑
  { master: '間桐慎二-5th', hero: '吉爾伽美什-Archer', loc: '冬木·新都',
    arriveDay: 3, arriveHint: '遠方隱約可見一道金色的、睥睨般的威壓氣息，正緩步朝冬木漫遊而來——彷彿全然不將這場戰爭放在眼裡。' },
  { master: null, hero: '佐佐木小次郎-Assassin', loc: '柳洞寺' } // 真正無御主：孤身蟄伏於柳洞寺暗處
];

// 第四次聖杯戰爭正典陣容（Fate/Zero）
var FATE_4TH_ROSTER = [
  { master: '衛宮切嗣-4th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂時臣-4th', hero: '吉爾伽美什-Archer', loc: '遠坂宅' },
  { master: '肯尼斯-4th', hero: '迪盧木多-Lancer', loc: '海特飯店' },
  { master: '韋伯·維爾維特-4th', hero: '伊斯坎達爾-Rider', loc: '麥肯基宅' },
  { master: '雨生龍之介-4th', hero: '吉爾德萊-Caster', loc: '碼頭倉庫' },
  { master: '言峰綺禮-4th', hero: '百貌哈桑-Assassin', loc: '言峰教會' },
  { master: '間桐雁夜-4th', hero: '蘭斯洛特-Berserker', loc: '間桐宅' }
];


