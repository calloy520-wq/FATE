// ==========================================
// 🔵 Seed_Codex.gs — 英靈殿(從者範本)名冊種子；SEED_MASTERS 只給新聖杯戰爭的御主名字用
// seedFateCodex_(ss)：英靈殿為空時自動灌入；ensureFateSheets_ 末尾呼叫。
// ==========================================


// 🌹 daily* 欄位撰寫鐵則(鑑賞專用；2026-07 玩家「不要告訴 AI 該怎麼說話，要讓她自己演出這個角色」)① 零引號零台詞：寫死一句「笨蛋」，AI 就整場笨蛋笨蛋、連 NSFW 也笨蛋——寫進去的字面它一定照抄。
var SEED_SERVANTS = [
  // 第五次
  { id:'阿爾托莉雅-Saber', cls:'Saber', realName:'阿爾托莉雅·潘德拉貢', wars:['4th','5th'], gender:'女',
    // 筋力對齊「凜當御主」的高階官方參數線(其餘五圍已是該線)，避免與「士郎當御主」的弱版參數混用。
    six:{筋力:'A',耐久:'B',敏捷:'B',魔力:'A',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'B',fx:'morale'},
            {n:'風王鐵鎚',r:'A',fx:'wind_strike'},{n:'誓約勝利之劍',r:'A++'}],
    traits:[{n:'王'},{n:'人類'},{n:'龍'}], np:'誓約勝利之劍 Excalibur（對城 A++·聚攏這片星球記憶中的光·凝於劍尖·解放為撕裂大地、直貫蒼穹的金色收束光炮）／全世界遙遠的理想鄉 Avalon（永世隔絕·無敵結界·守護持有者）',
    align:'秩序・善', persona:{look:'金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀',words:'騎士道・自我犧牲・壓抑的少女心',toMaster:'以騎士之禮盡忠，公私分明地隔著一步距離',quirks:'吃到好東西時會安靜下來、對著獅子玩偶移不開眼',logic:'責任和自己想要的擺在一起，放下的是後者',
    dailyLook:'金髮碧眼・嬌小、雨後百合的清冽',
    dailyOutfit:'藏青連身洋裝',
    dailyWords:'一絲不苟、對平凡日常滿是好奇、獅子布偶與細緻的手工、過度的裝飾與馬虎的飯菜',
    book:[{'keys': ['布偶', '玩偶', '娃娃', '獅子', '手工', '針線', '縫紉'], 'content': '喜歡布偶（尤其獅子）和細緻的手工活'}, {'keys': ['裝飾', '裝潢', '擺設', '飯菜', '做飯', '晚餐', '午餐', '早餐', '便當', '料理'], 'content': '受不了過度的裝飾和馬虎的飯菜'}]} },
  { id:'EMIYA-Archer', cls:'Archer', realName:'無銘', wars:['5th'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'千里眼',r:'C',fx:'aim'},{n:'投影魔術',r:'',fx:'projection'},{n:'七天盾·羅·埃亞斯',r:'',fx:'rho_aias'},{n:'無限劍製',r:'',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works（固有結界）／偽·螺旋劍 Caladbolg II（破斷重塑的流星劍·連射）',
    align:'中立・中庸', persona:{look:'褐膚白髮・紅黑外衣的弓兵、厭世冷峻',words:'自我厭惡・藏起來的理想',toMaster:'嘴上不饒人、暗中守護',quirks:'無奈嘆氣、看到別人握刀的手勢不對就想糾正',logic:'嘴上說別多管閒事，手卻已經先伸出去',
    dailyLook:'褐膚白髮・冷峻、曬過的舊木頭味，帶點鐵鏽',
    dailyOutfit:'深色休閒便服',
    dailyWords:'愛抱怨毒舌、見不得人有難、一切家事、正義的夥伴',
    book:[{'keys': ['家事', '打掃', '洗衣', '做飯', '下廚', '料理', '晚餐', '便當', '修理', '修東西', '壞了'], 'content': '家事全包，嘴上從來不承認喜歡'}, {'keys': ['正義', '英雄', '救人', '夥伴'], 'content': '討厭「正義的夥伴」這種說法'}]} },
  { id:'庫丘林-Lancer', cls:'Lancer', realName:'庫·丘林', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'避矢加護',r:'B',fx:'evade_ranged'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'刺穿死亡之棘',r:'B',fx:'gae_bolg',causality:true}],
    traits:[{n:'神性',r:'B'}], np:'刺穿死棘之槍 Gáe Bolg（對人 B・因果逆轉必中）',
    align:'秩序・中庸', persona:{look:'藍髮赤瞳・精悍結實的青年槍兵、野性不羈',words:'痛快・重義',toMaster:'爽快直率、討厭被當棋子',quirks:'扛著東西咧嘴笑、講到一半就開始抱怨自己運氣爛',logic:'痛快比贏重要，選的偏偏是難走的那條',
    dailyLook:'藍髮赤瞳・精壯、雨前的風，帶著草腥',
    dailyOutfit:'花襯衫配輕便褲',
    dailyWords:'隨性自來熟、重情義、氣性強的女人與小孩、拐彎抹角的做法與背叛',
    book:[{'keys': ['小孩', '孩子', '女人', '女生', '約定', '挑戰', '騎士', '打賭'], 'content': '喜歡氣性強的女人、小孩，還有難辦的約定與挑戰'}, {'keys': ['背叛', '拐彎', '繞圈', '計謀', '算計', '陰謀'], 'content': '討厭拐彎抹角的做法與背叛'}]} },
  { id:'美杜莎-Rider', cls:'Rider', realName:'美杜莎', wars:['5th'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'A',魔力:'B',幸運:'E',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // 官方保有技能無「女神的神核」，改補原文確有的單獨行動C。
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'單獨行動',r:'C',fx:'solo'},{n:'魔眼',r:'A+',fx:'petrify'}],
    traits:[{n:'神性',r:'E-'},{n:'女神'}], np:'他者封印·鮮血神殿 Blood Fort Andromeda（對軍·結界）／騎英之手綱 Bellerophon（對軍 A+·喚出神駿天馬珀伽索斯·踏虛凌空·振翅撕裂長空、化作一往無前的純白光矢突刺）',
    // 聖杯戰爭期間封印魔眼的是眼罩(眼鏡是戰後日常配件)；服裝為貼身希臘風戰甲，非裹紗長裙。
    align:'混沌・善', persona:{look:'紫長髮・貼身黑色戰甲勁裝(緋色飾邊)・眼罩封印魔眼的矯健女子、幽靜',words:'忠誠・深藏的溫柔',toMaster:'寡言而深情、極度護主',quirks:'輕觸眼罩、開口前會先停半拍',logic:'自己的安危和要護的人擺在一起，先擋在前面',
    dailyLook:'紫長髮戴眼鏡・高挑豐盈矯健、翻舊的書頁與夜色',
    dailyOutfit:'高領毛衣配長裙',
    dailyWords:'安靜內向、默默守著親近的人、讀書與酒、鏡子與量身高',
    book:[{'keys': ['書', '小說', '喝酒', '啤酒', '紅酒', '清酒', '酒', '蛇', '騎馬', '馬'], 'content': '喜歡讀書、酒、蛇和馬'}, {'keys': ['鏡', '量身高', '身高', '馬肉'], 'content': '討厭鏡子和量身高'}]} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A++',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'},{n:'金羊毛 Argon Coin',r:'EX',fx:'golden_fleece'}],
    traits:[{n:'人類'}], np:'萬符必應破戒 Rule Breaker（規則破壞者 C·【非攻擊寶具】破除契約與術式，非攻擊手段）',
    // Rule Breaker 官方描述為妖異七彩短劍，非紅色——全專案命名已同步正名。
    align:'中立・惡', persona:{look:'紫袍兜帽・持妖異七彩短劍的清麗魔女、疏離',words:'背叛的傷痕・渴望被信任',toMaster:'防備卻渴望真心相待',quirks:'摩挲手邊的小刀、被道謝時會愣一下',logic:'想靠近的時候反而先退一步',
    dailyLook:'紫長髮・纖細清麗、乾燥花草的微苦',
    dailyOutfit:'溫柔色系洋裝',
    dailyWords:'對外人禮貌保持距離、貪戀平穩的日子、可愛的衣服與寡言誠實的人、肌肉笨蛋',
    book:[{'keys': ['衣服', '洋裝', '裙', '可愛', '誠實', '寡言', '沉默'], 'content': '喜歡可愛的衣服，還有寡言誠實的人'}, {'keys': ['肌肉', '壯漢', '健身', '猛男'], 'content': '受不了肌肉笨蛋'}]} },
  { id:'佐佐木小次郎-Assassin', cls:'Assassin', realName:'佐佐木小次郎', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'E',敏捷:'A+',魔力:'E',幸運:'A',寶具:'-'},
    classSkills:[{n:'氣息遮斷',r:'D',fx:'stealth'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'心眼（偽）',r:'A',fx:'analyze'},{n:'透化',r:'B+',fx:'clear_mind'},
            {n:'宗和的心得',r:'B'},{n:'秘劍・燕返',r:'-',fx:'tsubame'}],
    traits:[{n:'人類'}], np:'燕返 Tsubame Gaeshi（對人魔劍・次元摺疊・三段同時斬）',
    align:'中立・中庸', persona:{look:'紺髮長刀・素樸和裝的清瘦劍客、淡泊洒脫',words:'閒適・無欲',toMaster:'隨遇而安、只求一戰',quirks:'凝望飛燕、說到一半就岔題去講風景',logic:'有用的事擱著，先做有意思的',
    dailyLook:'紺髮長刀・清瘦劍客、初秋溪水，涼而清',
    dailyOutfit:'簡樸和風浴衣',
    dailyWords:'悠然風雅、隨遇而安、花鳥風月、無',
    book:[{'keys': ['賞花', '賞月', '燕子', '小鳥', '月亮', '花朵', '風景', '櫻花'], 'content': '喜歡花鳥風月'}]} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', npPassive:true, realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A+',耐久:'A',敏捷:'A',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'D',fx:'nullify_magic'}],
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    // 不掛「王」trait：他終身未曾稱王。God Hand 是常駐復活寶具而非攻擊技，前後端據此擋下攻擊解放
    traits:[{n:'神性',r:'A'}], np:'十二試煉 God Hand（B·十二條命·【常駐寶具】自動生效·狂化下無可解放的攻擊寶具）',
    // Nine Lives 原作設定為狂化壓制下無法使用的寶具，故這版狂化下只有 God Hand。
    align:'混沌・狂', persona:{look:'巨軀岩肌・黑霧纏身的半神戰士、壓迫氣場',words:'狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',quirks:'以巨軀擋在人身前、接東西時手會放得特別輕',logic:'講道理和擋在前面，先擋了再說',
    dailyLook:'岩肌巨軀・高大健壯、曬透的泥土與陽光',
    dailyOutfit:'特大號寬鬆休閒服',
    dailyWords:'沉默寡言、把人護在身後、無、無'} },
  // 第四次
  // 對魔力/單獨行動 為第四次戰爭當時的官方數值(C/A)，非「被聖杯泥養到第五次」後的強化版(E/A+)，两次戰爭不可混用。
  { id:'吉爾伽美什-Archer', cls:'Archer', npRank:'A+', realName:'吉爾伽美什', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'領袖氣質',r:'A+',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'},{n:'全知全能之星 Sha Naqba Imuru',r:'EX',fx:'insight'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）／乖離劍 Ea（天地乖離·封藏的至高兵裝，傲慢時不出鞘）',
    align:'混沌・善', persona:{look:'金髮赤瞳・金鎧加身的俊美王者、睥睨的威壓',words:'傲慢・收藏家',toMaster:'視為雜種，命令聽不聽全看自己高不高興',quirks:'看到沒見過的東西會多停三秒、對著鏡子調整衣領',logic:'嘴上說凡人不值一提，卻會親自去看一眼',
    dailyLook:'金髮赤瞳・俊美、金屬與薰香，冷而貴',
    dailyOutfit:'奢華名牌休閒服',
    dailyWords:'傲慢自負、對新奇事物好奇、自己與權力、蛇',
    book:[{'keys': ['權力', '國王', '王者', '財寶', '寶物', '寶庫', '收藏'], 'content': '喜歡自己與權力'}, {'keys': ['蛇'], 'content': '討厭蛇'}]} },
  // 對魔力B、愛之痣C為官方階級；心眼(真)B取代查無出處的「戰鬥續行」。
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A+',魔力:'D',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'愛之痣',r:'C',fx:'lovespot'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'gae_dearg'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{look:'墨綠髮・面有愛之痣的俊美騎士、謙恭',words:'忠義・哀愁',toMaster:'絕對忠誠，渴望堂堂正正之戰',quirks:'行禮時右手先貼上胸口、被女性道謝會退半步',logic:'心裡那份情擺到忠義前面時，讓開的是前者',
    dailyLook:'黑髮・俊美(右眼下一顆淚痣)、雨後青草與皂香',
    dailyOutfit:'整潔的紳士便裝',
    dailyWords:'謙恭有禮、忠義與哀愁都藏著、友情與仁義、戀愛中的少女與善妒的男人',
    book:[{'keys': ['友情', '朋友', '仁義', '義氣', '夥伴'], 'content': '重視友情與仁義'}, {'keys': ['戀愛', '愛上', '嫉妒', '吃醋', '善妒', '告白'], 'content': '應付不來戀愛中的少女與善妒的男人'}]} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'D',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // 神性C：源於「宙斯之子」的傳說地位，官方參數表明列此技能。
    skills:[{n:'領袖氣質',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'神性',r:'C',fx:'divine'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX·固有結界召喚萬軍）／神威的車輪 Gordius Wheel（雷神戰車·衝鋒）',
    align:'中立・善', persona:{look:'紅髮虬髯・披風加身的魁梧征服王、豪邁',words:'征服・雅量',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',quirks:'攤開地圖就講個沒完、笑起來整條街都聽得到',logic:'穩妥的路和沒人走過的路，挑後面那條',
    dailyLook:'紅髮虬髯・魁梧、烈日下的沙塵與酒氣',
    dailyOutfit:'寬鬆披風外衣',
    dailyWords:'豪爽大氣、雅量裡藏孩子氣的野心、征服世界、母親',
    book:[{'keys': ['征服', '世界', '稱霸', '天下'], 'content': '喜歡征服世界'}, {'keys': ['母親', '媽媽', '母后'], 'content': '討厭母親'}]} },
  // 陣地作成B(官方階級)；他是少數沒有「道具作成」的Caster(官方設定他放棄道具作成換寶具召喚能力，是知名反差設定)，
  // 也無查無出處的「城牆防禦」；官方設計他其實無鬚無眉，「青鬚」只是他自稱化名(藍鬍子)的形象，非實際外觀。
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯', wars:['4th'], gender:'男',
    six:{筋力:'D',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'A+'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本 Prelati\'s Spellbook（深淵召喚・召喚大海怪·【留存】海怪常駐戰場）',
    align:'混沌・惡', persona:{look:'捧巨書的清瘦貴族(無鬚無眉)、癲狂',words:'虔誠扭曲・對「聖女」的執念',toMaster:'當成唯一聽得懂自己的知音，狂熱地傾訴',quirks:'講到入迷會抓著人的手、把書頁角折成三角形',logic:'說得通的話擺一邊，信的只有想相信的那個',
    dailyLook:'清瘦貴族・無鬚無眉的蒼白臉孔、皮革書封與蠟燭餘燼',
    dailyOutfit:'書卷氣的樸素便服',
    dailyWords:'溫文儒雅、虔誠到近乎執迷、男孩子氣的少女與陰柔的少年、政治與理財',
    book:[{'keys': ['少女', '少年', '假小子', '男孩子氣'], 'content': '喜歡男孩子氣的少女和陰柔的少年'}, {'keys': ['政治', '理財', '財政', '算帳', '記帳', '預算'], 'content': '討厭政治與理財'}]} },
  // 敏捷A/魔力C/寶具B：第四次聖杯戰爭材料一致給這三個階級。
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想幻像',r:'',fx:'zabaniya_many'}],
    traits:[{n:'人類'}], np:'妄想幻像 Zabaniya: Delusional Illusion（對人·分裂為百種人格·最多同時八十體·【留存】分身持續在場）',
    align:'秩序・惡', persona:{look:'骷髏面具・黑袍裹身的刺客、詭譎',words:'群體・無數人格',toMaster:'服從，視暗殺為信仰',quirks:'換一個人說話就換一種語速、挑燈照不到的那一側站',logic:'真話和對方想聽的話，先給後者',
    dailyLook:'骷髏面具・身形偏窄而骨架勻稱、陰影裡的乾燥香料',
    dailyOutfit:'剪裁俐落的深色裝扮',
    dailyWords:'低調神秘、對每個人露出不同的一面、無、無'} },
  { id:'咒腕之哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（咒腕）', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'妄想心音',r:'',fx:'zabaniya_heart'},{n:'投影魔術',r:'C',fx:'projection'},{n:'自我改造（詛咒之腕）',r:'C',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（對人·掏出心臟之影即死）',
    // 詛咒之腕為右臂(撒旦之手嫁接，官方設定)。
    align:'秩序・惡', persona:{look:'骷髏面具・詛咒繃帶纏滿右臂的暗殺者、肅殺',words:'詛咒之腕・初代之名',toMaster:'冷淡服從、以暗殺為天職',quirks:'走路沒有聲音、右手用布纏著',logic:'該解釋的留著，事做完先走',
    dailyLook:'骷髏面具・右臂纏繃帶、涼掉的鐵器與線香',
    dailyOutfit:'深色簡樸裝扮',
    dailyWords:'沉靜肅穆、重諾、忠義與正月睡到飽、自己以外的一切',
    book:[{'keys': ['忠義', '忠誠', '正月', '新年', '過年', '睡到飽', '賴床'], 'content': '重忠義，正月只想睡到飽'}]} },
  // 官方六圍為 筋A／耐A／敏A+／魔C／幸B／寶A(A+屬於敏捷)；狂化C(官方階級)；
  // np真名「騎士は徒手にて死せず」通行中譯為「騎士不死於徒手」。
  { id:'蘭斯洛特-Berserker', cls:'Berserker', npPassive:true, realName:'蘭斯洛特', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無毀的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'},{n:'人類'}], np:'騎士不死於徒手 Knight of Owner（萬物化為兵裝·【留存】變身態持續生效）',
    align:'混沌・狂', persona:{look:'黑霧纏繞漆黑鎧甲的騎士、悲愴',words:'悔恨・對亞瑟王的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',quirks:'隨手就把壞掉的東西修好、被道謝時會低下頭',logic:'該說的話留在心裡，只把事默默扛走',
    dailyLook:'黑髮・身形寬闊挺直、雨夜的石階，濕冷',
    dailyOutfit:'整潔的深色便服',
    dailyWords:'沉默寡言、待在背景照顧大家、熾烈的戀愛與劍術、自己',
    book:[{'keys': ['戀愛', '愛情', '劍術', '比劍', '練劍', '劍'], 'content': '喜歡熾烈的戀愛與劍術'}]} },
  // 客串保留：慾海鑑賞用的少數客串——斯卡哈/恩奇都，其餘客串／偽聖杯陣容已清空。
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['客串'], gender:'無',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'B',幸運:'-',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'天之鎖',r:'A',fx:'chain'},{n:'氣息感知',r:'A+',fx:'sense'},{n:'變容',r:'A',fx:'shapeshift'},{n:'完全之形',r:'A',fx:'regen'}],
    traits:[{n:'神造兵器'},{n:'病死宿命'}], np:'世人啊，冀以鎖繫神明 Enuma Elish（對界 A++~EX·對肅正寶具·反星球/人類破壞行為增幅·可匹敵乖離劍）／民之睿智 Age of Babylon（大地召出萬千劍槍鎖齊射·抵銷王之財寶）',
    align:'中立・中庸', persona:{look:'青綠長髮・中性無垢的神造之軀、平和',words:'純真・追尋摯友',toMaster:'溫和而疏離，心繫吉爾伽美什',quirks:'歪頭觀察、看到新東西會伸手摸一下',logic:'合不合理擺一邊，先看對方開不開心',
    dailyLook:'青綠長髮・中性無垢、清晨草葉上的露水',
    dailyOutfit:'自然色調的簡樸休閒服',
    dailyWords:'平和無垢、掛念著摯友、無、無'} },
  // 斯卡哈 三職階
  // 對魔力A(官方「可無效A階以下魔術」)；神殺B、魔境的智慧A+，均為官方技能表階級。
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'C',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'神殺',r:'B',fx:'godslayer'},{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'魔境的智慧',r:'A+'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg',causality:true}],
    traits:[{n:'人類'}], np:'貫穿死翔之槍 Gáe Bolg Alternative（對人 B+·釘空必中＋投擲斷命）／死亡滿溢的魔境之門 Gate of Skye（對軍 A+·吸入影之國）',
    align:'中立・中庸', persona:{look:'紫髮紅瞳・緊身戰衣的妖豔女王、冷峻',words:'影之國女王・武人',toMaster:'嚴厲考校、唯認可強者，師者之威',quirks:'用手邊的東西點地催人、誇獎人時會轉開視線',logic:'話說得比誰都重，事後卻私下把人撿回來',
    dailyLook:'紫髮紅瞳・豐盈妖豔冷峻、霧裡的松針，凜冽',
    dailyOutfit:'貼身紫紅色系穿搭',
    dailyWords:'居高臨下、其實願意照顧人、無、無'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'E',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'人類'}], np:'蹴穿死翔之槍 Gáe Bolg Alternative（對人 B+·影縫穿刺）',
    // 這個Assassin版是夏季活動限定泳裝造型(官方立繪為比基尼/沙灘裝)，外觀走海灘風而非暗殺潛行調性。
    align:'中立・中庸', persona:{look:'紫髮紅瞳・泳裝海灘造型的致命女王(夏日Assassin版)、冷冽',words:'影・潛行的女王',toMaster:'當成值得逗弄的獵物，冷眼試探、從不把話說滿',quirks:'融進陰影裡、被搭話會先沉默三秒',logic:'話只說一半，剩下讓對方自己猜',
    dailyLook:'紫髮紅瞳・豐盈冷冽優雅、海風日曬與一點鹽',
    dailyOutfit:'海灘度假風輕便穿搭',
    dailyWords:'深居簡出、不動聲色地看著每個人、無、無'} },
  { id:'遠坂凜-Master', cls:'御主', realName:'遠坂凜', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{look:'黑長雙馬尾・紅衣黑裙、傲然',words:'人前完美的優等生・刀子嘴豆腐心・厭惡示弱與失態',toMaster:'口是心非、嘴上嫌棄卻很上心',quirks:'甩馬尾別過臉、對電子產品完全沒轍',logic:'嘴上算的是利益，做的時候還是選重情義那邊',back:'遠坂家長女（櫻是被送養的妹妹）、父親死於上屆聖杯戰爭',
    // 🎯 2026-07 玩家「凜好死板、要傲嬌感覺」：舊資料把「傲嬌」這個標籤寫了三遍(私下一面「越在意越說反話」＋內裡「刀子嘴豆腐心」＋speech「毒舌卻關心」)，卻一個具體行為都沒給——AI 只能複述那個標籤，於是每回合都在嘴硬說反話。
    dailyLook:'黑長雙馬尾・勻稱俐落、紅茶的熱氣與寶石的冷光',
    dailyOutfit:'紅衣黑裙過膝黑襪',
    dailyWords:'完美的優等生、刀子嘴豆腐心、寶石、電子產品',
    book:[{'keys': ['寶石', '珠寶', '首飾', '紅寶石', '藍寶石', '項鍊', '戒指'], 'content': '喜歡寶石'}, {'keys': ['手機', '電腦', '電視', '遙控器', '電器', '錄影機', '電子', '機器', '平板', '相機', '鬧鐘'], 'content': '對電子產品完全沒轍，連手機都搞不定'}]} },
  { id:'伊莉雅絲菲爾-Master', cls:'御主', realName:'伊莉雅絲菲爾', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{look:'紅眼白髮的幼小少女・毛領大衣、渴望親近',words:'天真爛漫・哀傷的聖杯依代・厭惡孤獨',toMaster:'依賴而黏人，渴望被珍惜',quirks:'踮腳搆人的袖子、講話會從第三人稱跳回第一人稱',logic:'想被留下的時候，選的是鬧脾氣',back:'人造人、被當作工具養大卻渴望親情',
    dailyLook:'紅眼白髮的幼小少女、初雪落在羊毛上',
    dailyOutfit:'毛領大衣的可愛裝扮',
    dailyWords:'天真黏人、渴望被放在心上、雪、寒冷的地方、貓與納豆',
    book:[{'keys': ['雪', '下雪', '雪人'], 'content': '喜歡雪'}, {'keys': ['好冷', '寒冷', '冷天', '貓', '納豆'], 'content': '討厭寒冷的地方、貓和納豆'}]} },
  { id:'間桐櫻黑化-Master', cls:'御主', realName:'間桐櫻', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    // 官方設定間桐櫻髮色為深紫色(與遠坂凜同系但更深)，黑化不因此變色。
    align:'混沌・惡', persona:{look:'深紫長髮・黑紅禮服、泛著陰冷寒意',words:'溫順乖巧的假面・被黑泥吞噬的佔有慾・厭惡傷害過自己的一切',toMaster:'表面溫順順從，內裡佔有慾強烈',quirks:'低垂眼眸淺笑、被碰到時會慢半拍才反應',logic:'想要的東西用等的，等到對方自己讓出來',back:'遠坂次女、送養間桐受蟲蝕十一年後黑化',
    dailyLook:'深紫長髮・玲瓏有致、開過頭的花，甜得發沉',
    dailyOutfit:'帶酒紅點綴的精緻洋裝',
    dailyWords:'溫柔乖巧、把佔有慾裹在撒嬌裡、香甜點心與怪談、體育課與量體重',
    book:[{'keys': ['點心', '甜點', '蛋糕', '餅乾', '甜食', '怪談', '鬼故事', '靈異'], 'content': '喜歡甜點和怪談'}, {'keys': ['體育', '運動', '體重', '量體重', '體重計', '減肥'], 'content': '討厭體育課和量體重'}]} },
  // 🌹 正典人物、非從者：cls刻意標'御主'(非七大職階)，只供鑑賞召喚同行，不進solo。士郎這裡改寫成
  //   鑑賞版，拿掉「大火孤兒/繼承理想」的悲劇成因，只留單純的家人事實。
  { id:'衛宮士郎-Master', cls:'御主', realName:'衛宮士郎', wars:['客串'], gender:'男',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{look:'紅褐短髮的高中生身影・樸素制服，認真踏實',words:'樂於助人的好好先生・過度的自我犧牲傾向・厭惡見死不救',toMaster:'總是先為對方著想，讓人捏一把冷汗',quirks:'習慣性收拾善後、聽人求助會先答應再想辦法',logic:'自己的事和別人的事，先做別人的',back:'受衛宮家收養長大，如今自己打理老宅與工房',
    dailyLook:'紅褐短髮的高中生、米飯與肥皂的家常氣味',
    dailyOutfit:'制服或挽起袖子的家居服',
    dailyWords:'樂於助人、放不下別人的事、家常菜、梅昆布茶',
    book:[{'keys': ['家常菜', '做飯', '下廚', '晚餐', '午餐', '早餐', '便當', '料理'], 'content': '喜歡家常菜，自己下廚'}, {'keys': ['梅昆布茶', '昆布茶', '梅子'], 'content': '討厭梅昆布茶'}]} },
  { id:'藤村大河-Master', cls:'御主', realName:'藤村大河', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{look:'亞麻色及肩短髮的身影・雖已是成熟大人卻仍帶著爽朗元氣，自封「大河大人」',words:'大姊頭般罩著大家的女王大人・其實怕寂寞想要人陪・厭惡被當小孩子看待',toMaster:'嘴上兇巴巴地念，其實把人當自己家人疼',quirks:'得意地插腰大笑、飯點一到就自己出現在別人家',logic:'念歸念，最後整件事還是自己攬過去',back:'地方上的老師，也是這一帶地主家的大小姐',
    dailyLook:'亞麻色及肩短髮・嬌小、夏日午後的操場與汗水',
    dailyOutfit:'成套運動服或教師套裝',
    dailyWords:'大姊頭般罩著大家、其實怕寂寞、萬物一切、獅子',
    book:[{'keys': ['獅子', '老虎', '虎'], 'content': '討厭獅子；被叫「虎」會炸'}]} }
];

// 原作的御主：名字（對手卡、說書、工房撞名）＋看得見的樣子（look：只寫外貌衣著；看穿對手真名後隨【對手】送給說書）。
var SEED_MASTERS = [
  // 第五次
  { id: '衛宮士郎-5th', name: '衛宮士郎', look: '紅褐短髮的高中生，樸素的襯衫，手上有修東西留下的繭' },
  { id: '遠坂凜-5th', name: '遠坂凜', look: '黑色長髮綁成雙馬尾，紅色上衣配黑裙' },
  { id: '間桐慎二-5th', name: '間桐慎二', look: '藍色捲髮的高中生，嘴角帶著冷笑' },
  { id: '間桐臟硯-5th', name: '間桐臟硯', look: '乾癟矮小的老人，拄著拐杖，皮膚像枯木' },
  { id: '葛木宗一郎-5th', name: '葛木宗一郎', look: '戴眼鏡的高大教師，一身黑西裝' },
  { id: '言峰綺禮-5th', name: '言峰綺禮', look: '高大的神父，黑色法衣，胸前掛著十字架' },
  { id: '伊莉雅絲菲爾-5th', name: '伊莉雅絲菲爾', look: '紅眼白髮的嬌小少女，披著毛領大衣' },
  { id: '間桐櫻(黑化)-5th', name: '間桐櫻', look: '深紫長髮，黑底紅紋的衣裳，腳下的影子在蠕動' },
  // 第四次
  { id: '衛宮切嗣-4th', name: '衛宮切嗣', look: '黑髮、鬍渣，舊風衣底下藏著槍' },
  { id: '遠坂時臣-4th', name: '遠坂時臣', look: '蓄短鬍的紳士，紅色西裝，拿著鑲寶石的手杖' },
  { id: '肯尼斯-4th', name: '肯尼斯', look: '金髮往後梳的年輕學者，藍色長外套' },
  { id: '韋伯·維爾維特-4th', name: '韋伯·維爾維特', look: '黑髮瘦小的少年，套著大了一號的外套' },
  { id: '雨生龍之介-4th', name: '雨生龍之介', look: '橘紅短髮的青年，花襯衫，咧著嘴笑' },
  { id: '言峰綺禮-4th', name: '言峰綺禮', look: '年輕的神父，黑色法衣，面無表情' },
  { id: '間桐雁夜-4th', name: '間桐雁夜', look: '頭髮半白、半邊臉僵硬的男人，連帽外套' }
];

// 從者物件 → 英靈殿列（順序＝COL.HERO）
// daily 專欄(13~16)各自獨立，PERSONA JSON 不再重複收一份——同一個值只存一處。
// ⚠ DAILY_MOE(15) 2026-09 起棄用（萌點整組退休），種子一律寫空字串；COL 是位置索引，欄位留著不刪。

var HERO_PERSONA_OWN_COL_ = ['dailyLook', 'dailyWords', 'dailyOutfit'];
function servantToHeroRow_(s) {
  var p = s.persona || {};
  var slim = {};
  Object.keys(p).forEach(function (k) { if (HERO_PERSONA_OWN_COL_.indexOf(k) < 0) slim[k] = p[k]; });
  return [s.id, s.cls, s.realName, s.gender, JSON.stringify(s.six),
    JSON.stringify(s.classSkills), JSON.stringify(s.skills), JSON.stringify(s.traits),
    s.np, JSON.stringify(slim), s.align, JSON.stringify(s.wars), 'seed',
    p.dailyLook || '', p.dailyWords || '', '', p.dailyOutfit || ''];
}
var CODEX_PERSONA_VER = 'v89';   // 精緻化 persona 就升一版，觸發既有英靈殿升級（upgradeCodexPersonas_）；每一版改了什麼見 CODE_NOTES『CODEX_PERSONA_VER』

// 升級既有英靈殿的 persona 欄（不刪客製英靈，只覆寫種子英靈的 PERSONA 為最新細緻設定）
function upgradeCodexPersonas_(ss) {
  var hero = ss.getSheetByName('英靈殿');
  if (!hero || hero.getLastRow() <= 1) return 0;
  var d = hero.getDataRange().getValues();
  var byId = {};
  SEED_SERVANTS.forEach(function (s) { byId[s.id] = s; });
  var n = 0;
  var existing = {};
  for (var i = 1; i < d.length; i++) {
    existing[String(d[i][COL.HERO.ID])] = true;
    var s = byId[String(d[i][COL.HERO.ID])];
    // 整列依種子重寫(六圍/職階技能/固有技能/特性/寶具/人設/陣營)，只刷種子英靈(ID 對應)、不動客製英靈
    if (s) {
      var row = servantToHeroRow_(s); hero.getRange(i + 1, 1, 1, row.length).setValues([row]); n++;
    }
  }
  // 🆕 補入「種子有、英靈殿還沒有」的新英靈(新增從者後不必清表即生效；冪等：下次已存在就不重加)
  var toAdd = SEED_SERVANTS.filter(function (s) { return !existing[s.id]; });
  if (toAdd.length) {
    var addRows = toAdd.map(servantToHeroRow_);
    hero.getRange(hero.getLastRow() + 1, 1, addRows.length, addRows[0].length).setValues(addRows);
    n += addRows.length;
  }
  for (var j = d.length - 1; j >= 1; j--) {
    if (!byId[String(d[j][COL.HERO.ID])] && String(d[j][COL.HERO.SOURCE]) === 'seed') { hero.deleteRow(j + 1); n++; }
  }
  if (n) try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  return n;
}




// 🔵 英靈殿為空(只有表頭)時，自動灌入名冊。冪等：有資料就不動。
function seedFateCodex_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var hero = ss.getSheetByName('英靈殿');
  if (hero && hero.getLastRow() <= 1) {
    var hrows = SEED_SERVANTS.map(servantToHeroRow_);
    hero.getRange(2, 1, hrows.length, hrows[0].length).setValues(hrows);
    try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  }
  // 人設版本升級（只跑一次）
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('codex_persona_ver') !== CODEX_PERSONA_VER) {
      upgradeCodexPersonas_(ss);   // 刷英靈殿(召喚來源)
      props.setProperty('codex_persona_ver', CODEX_PERSONA_VER);
    }
  } catch (e) { }
}

