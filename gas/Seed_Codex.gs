// ==========================================
// 🔵 Seed_Codex.gs — 英靈殿(從者範本) + 御主殿 名冊種子（逐字移植自 FATE）
// seedFateCodex_(ss)：英靈殿/御主殿 為空時自動灌入；ensureFateSheets_ 末尾呼叫。
// ==========================================

var SEED_SERVANTS = [
  // 第五次
  { id:'阿爾托莉雅-Saber', cls:'Saber', realName:'阿爾托莉雅·潘德拉貢', wars:['4th','5th'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'A',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'卡里斯瑪',r:'B',fx:'morale'},
            {n:'風王鐵鎚',r:'A',fx:'wind_strike'}],
    traits:[{n:'王'},{n:'人類'}], np:'誓約勝利之劍（對城 A++）',
    align:'秩序・善', persona:{firstP:'我',words:'騎士道・榮譽・自我犧牲・壓抑的少女心',toMaster:'盡忠職守、初期保持距離，逐漸動搖',speech:'正式鄭重、武人般簡潔、不擅言情、認真到一絲不苟',moe:'食量驚人卻吃相優雅、對現代食物純真驚嘆、王者外殼下沒當過少女的寂寞、笨拙的溫柔',tic:'用餐時無比專注滿足、握劍時氣場驟冷'} },
  { id:'EMIYA-Archer', cls:'Archer', realName:'無名（EMIYA）', wars:['5th'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'千里眼',r:'C',fx:'aim'},{n:'投影魔術',r:'',fx:'projection'},{n:'無限劍製',r:'',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製（固有結界）',
    align:'中立・中庸', persona:{firstP:'我',words:'現實・諷刺・自我厭惡・藏起來的理想',toMaster:'嘴上不饒人、暗中守護',speech:'老氣橫秋的比喻、毒舌吐槽、看似冷淡的關心、偶爾說教',moe:'毒舌卻替人下廚、家事異常熟練、對年輕時理想的糾結、嘴硬心軟',tic:'做菜時格外認真、雙劍交叉的架式、無奈嘆氣'} },
  { id:'庫丘林-Lancer', cls:'Lancer', realName:'庫·丘林', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'避矢加護',r:'B',fx:'evade_ranged'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'刺穿死亡之棘',r:'B',fx:'gae_bolg'}],
    traits:[{n:'神性',r:'低'}], np:'刺穿死棘之槍（對人 B・因果逆轉必中）',
    align:'秩序・中庸', persona:{firstP:'俺',words:'戰士・痛快・重義・運氣爛到極點',toMaster:'爽快直率、討厭被當棋子',speech:'豪爽粗獷、戰鬥狂熱、抱怨自己倒楣、義氣掛嘴邊',moe:'A級幸運卻衰事連連的反差、遇強敵純粹興奮、意外會照顧後輩、被迫做討厭任務時的牢騷',tic:'扛槍咧嘴笑、戰前舔嘴唇、抓頭抱怨'} },
  { id:'美杜莎-Rider', cls:'Rider', realName:'美杜莎', wars:['5th'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'B',幸運:'E',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'女神的神核',r:'',fx:'divine_core'},{n:'魔眼',r:'A',fx:'petrify'}],
    traits:[{n:'神性'},{n:'女神'}], np:'他人的神殿／駿馬天翔（A+）',
    align:'混沌・善', persona:{firstP:'我',words:'忠誠・守護・自卑・深藏的溫柔',toMaster:'寡言而深情、極度護主',speech:'寡言低沉、必要才開口、護主時毫不猶豫、語氣壓得很低',moe:'怪力女神卻極度自卑、靠眼鏡壓制魔眼的反差、對御主近乎獻身的忠誠、姊姊般的包容',tic:'推眼鏡、靜默佇立暗處、垂眸'} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'}],
    traits:[{n:'人類'}], np:'破戒全咒（規則破壞者 C）',
    align:'中立・惡', persona:{firstP:'我',words:'背叛的傷痕・渴望被信任・腹黑・少女心',toMaster:'防備卻渴望真心相待',speech:'溫婉中帶試探、用敬語、自嘲被背叛的過往、偶爾流露脆弱',moe:'魔女外表下渴望被愛、被真心對待會慌、為所愛之人不擇手段、反差的純情',tic:'抱著緣紅短劍、垂眸輕笑、欲言又止'} },
  { id:'佐佐木小次郎-Assassin', cls:'Assassin', realName:'佐佐木小次郎', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A+',魔力:'E',幸運:'E',寶具:'E'},
    classSkills:[{n:'氣息遮斷',r:'D',fx:'stealth'}],
    skills:[{n:'心眼（偽）',r:'A',fx:'analyze'},{n:'透化',r:'B+',fx:'clear_mind'},
            {n:'宗和的心得',r:'B',fx:'unreadable'},{n:'秘劍・燕返',r:'-',fx:'tsubame'}],
    traits:[{n:'人類'}], np:'燕返（對人魔劍・次元摺疊・三段同時斬）',
    align:'中立・中庸', persona:{firstP:'拙者',words:'劍士・閒適・無欲・宿命',toMaster:'隨遇而安、只求一戰',speech:'古風文雅、淡泊洒脫、帶禪意、慢條斯理',moe:'無欲無求的洒脫、只為一場好決鬥而活、看守山門的隨遇而安、非英雄卻有英雄氣的平凡',tic:'凝望飛燕、按刀靜立、微微一笑'} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A',魔力:'B',幸運:'A',寶具:'B'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'?',fx:'nullify_magic'}],
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    traits:[{n:'神性',r:'A'},{n:'王'}], np:'十二試煉（God Hand A）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅咆哮）',words:'戰神・狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',speech:'狂化無法言語、只以低吼與行動表達；唯護主的本能殘留',moe:'狂暴外殼下對主人(伊莉雅)殘存的溫柔、偶爾理智回光的瞬間、十二試煉一次次自死亡歸來的悲壯',tic:'低沉咆哮、以巨軀擋在主人身前、緩緩起身'} },
  // 第四次
  { id:'吉爾伽美什-Archer', cls:'Archer', realName:'吉爾伽美什', wars:['4th','fake'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'E',fx:'nullify_magic'},{n:'單獨行動',r:'A+',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'卡里斯瑪',r:'A',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）',
    align:'混沌・善', persona:{firstP:'吾',words:'傲慢・王・俯視眾生・收藏家',toMaster:'視為雜種、幾乎不從令，唯對少數有趣之人起興致',speech:'居高臨下、稱人「雜種」、慵懶而帶威壓、偶爾興味盎然',moe:'唯一承認的友人（恩奇都）、對「有趣」之物異常執著、品酒品人的講究、傲慢底下的孤獨',tic:'金色波紋中抽出寶具、嗤笑、紅瞳微眯'} },
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'戰鬥續行',r:'A',fx:'survive'},{n:'愛之痣',r:'-',fx:'morale'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'anti_magic_lance'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{firstP:'我',words:'忠義・騎士・哀愁・宿命的女難',toMaster:'絕對忠誠，渴望堂堂正正之戰',speech:'謙恭有禮、武人正直、壓抑情感、自責時沉聲',moe:'臉上愛之痣令女性傾心的悲劇宿命、對主君的死忠、渴望光明磊落決鬥卻屢遭背叛、溫柔到自我犧牲',tic:'雙槍交握行禮、垂眸掩去面痣、沉聲立誓'} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾（征服王）', wars:['4th'], gender:'男',
    six:{筋力:'A+',耐久:'A',敏捷:'B',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    skills:[{n:'卡里斯瑪',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX）',
    align:'中立・善', persona:{firstP:'余',words:'豪邁・征服・雅量・王道',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',speech:'豪爽大笑、稱「小子」、王者氣度、好酒好戰、講大道理',moe:'征服世界的野心與孩子氣並存、愛酒愛地圖、收伏人心的雅量、把御主當兒子般栽培',tic:'仰天大笑、攤開世界地圖、灌下整桶酒'} },
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯（青鬍子）', wars:['4th'], gender:'男',
    six:{筋力:'E',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'C',fx:'territory'},{n:'道具作成',r:'C',fx:'crafting'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本（深淵召喚・召喚大海怪）',
    align:'混沌・惡', persona:{firstP:'我',words:'瘋狂・虔誠扭曲・對「聖女」的執念',toMaster:'視龍之介為純粹之惡的摯友、相互共鳴',speech:'時而文雅虔誠、時而癲狂咆哮、引經據典又褻瀆神明',moe:'曾為聖女信徒的純粹墮落成深淵的反差、對「神不在場」的悲憤、與龍之介一搭一唱的瘋狂默契',tic:'翻動教本咆哮、淚流滿面的狂笑、自深淵召出觸手海怪'} },
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'B',魔力:'D',幸運:'E',寶具:'D'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想心音',r:'',fx:'zabaniya'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（心臟摘取）',
    align:'秩序・惡', persona:{firstP:'我們',words:'群體・狂信・無數人格・山中老人',toMaster:'服從，視暗殺為信仰',speech:'多重聲線交疊、以「我們」自稱、低語、宗教式的肅殺',moe:'十八種人格共用一具身軀的詭異、對「初代之名」的執著、暗殺即信仰的純粹',tic:'骷髏面具下變換面孔、無聲現身、低誦經文'} },
  { id:'蘭斯洛特-Berserker', cls:'Berserker', realName:'蘭斯洛特（湖之騎士）', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'B',幸運:'C',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無此花的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'}], np:'騎士不為孤軍 Knight of Owner（萬物化為兵裝）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅低吼）',words:'悔恨・無言的瘋狂・對主君的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',speech:'狂化奪去言語，只餘悲鳴般的低吼；理智深處是對亞瑟王與王后之間罪的愧悔',moe:'湖之騎士的高潔被悔恨吞沒的悲劇、渴望被懲罰的扭曲忠誠、理智回光時的痛楚',tic:'黑霧纏身、抓起任何物件化為兵裝、無聲逼近'} },
  // FAKE 樣本
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['fake'], gender:'無',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'A',幸運:'-',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'?',fx:'nullify_magic'}],
    skills:[{n:'變生',r:'',fx:'shapeshift'},{n:'神性',r:'?',fx:'divine'}],
    traits:[{n:'神性'},{n:'神造兵器'}], np:'天地乖離開闢之星（變化）',
    align:'中立・中庸', persona:{firstP:'我',words:'純真・神造・追尋摯友・無垢',toMaster:'溫和而疏離，心繫吉爾伽美什',speech:'平和中性、純真直接、無機質卻溫柔、談起摯友便柔軟',moe:'神造兵器卻最有人性、對吉爾伽美什的純粹羈絆、不解人類卻嚮往、變幻自如的天真',tic:'化身千刃、歪頭觀察、望向遠方'} },
  { id:'漢斯-Watcher', cls:'Watcher', realName:'漢斯·克里斯汀·安徒生', wars:['fake'], gender:'男',
    six:{筋力:'E',耐久:'E',敏捷:'D',魔力:'C',幸運:'B',寶具:'C'},
    classSkills:[{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼（真）',r:'B',fx:'analyze'},{n:'故事創作',r:'A',fx:'narrative'},{n:'透化',r:'C',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'無謬之書／人魚靈藥（輔助）',
    align:'中立・善', persona:{firstP:'我',words:'毒舌・觀察者・童話・早慧',toMaster:'冷眼旁觀卻心軟，毒舌鞭策',speech:'尖酸刻薄、文人吐槽、嘴上嫌棄、童話般的洞察',moe:'童顏毒舌的反差、看透人心卻偷偷溫柔、用故事治癒他人自己卻孤獨、嫌麻煩還是會幫忙',tic:'振筆疾書、翻白眼吐槽、扶額嘆氣'} },
  // 斯卡哈 三職階
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'B',幸運:'E',寶具:'A'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg'}],
    traits:[{n:'神性'},{n:'人類'}], np:'刺穿死亡之棘景 Gáe Bolg Alternative（對界 A）',
    align:'中立・中庸', persona:{firstP:'我',words:'影之國女王・冷峻嚴師・武人・求死而不得',toMaster:'嚴厲考校、唯認可強者，師者之威',speech:'冷峻威嚴、師長口吻、簡潔如刃、偶露揶揄',moe:'千年女王的孤高、渴望一死卻不得的寂寞、對弟子又嚴又護、揶揄人時的促狹',tic:'魔槍杵地、睥睨、勾唇淺笑'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'B',幸運:'D',寶具:'B'},
    classSkills:[{n:'氣息遮斷',r:'B',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'神性'},{n:'人類'}], np:'豺狼的胃袋（影縫穿刺 B）',
    align:'中立・中庸', persona:{firstP:'我',words:'潛行的女王・冷冽・致命・影',toMaster:'冷眼試探、出手無情，認可方鬆動',speech:'低冷簡短、氣息全無、一針見血',moe:'影中女王的致命優雅、試探背後的審視、認可強者後難得的鬆動',tic:'融入暗影、刃尖輕轉、無聲逼近'} },
  { id:'斯卡哈-Caster', cls:'Caster', realName:'斯卡哈·斯卡薩哈（Skadi）', wars:['客串'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'高速神言',r:'A',fx:'fast_cast'}],
    skills:[{n:'原初符文',r:'EX',fx:'rune'},{n:'女神的神核',r:'',fx:'divine_core'},{n:'神代魔術',r:'A',fx:'divine_age'}],
    traits:[{n:'神性'},{n:'女神'}], np:'彼岸薔薇之園・原初的符紋（對界 A）',
    align:'中立・善', persona:{firstP:'吾',words:'北歐女神・溫柔而威嚴・守護者・嚴母',toMaster:'溫柔包容、暗藏神威，母性',speech:'溫柔而莊重、自稱吾、神祇的慈悲與威嚴並存',moe:'冰雪女神的溫柔母性、害羞時的可愛、守護生靈的執著、威嚴下的溫情',tic:'符文環繞、垂眸微笑、輕撫額前'} },
  // strange Fake
  { id:'理查一世-Saber', cls:'Saber', realName:'獅心王・理查一世', wars:['fake'], gender:'男',
    six:{筋力:'B',耐久:'B',敏捷:'C',魔力:'C',幸運:'A',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'卡里斯瑪',r:'B',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'戰鬥續行',r:'A',fx:'survive'}],
    traits:[{n:'王'},{n:'人類'}], np:'無數騎士之證・呼喚英雄之劍（對軍 B）',
    align:'中立・善', persona:{firstP:'余',words:'浪漫・崇拜英雄・天真豪邁・獅心',toMaster:'坦率信賴，視為冒險夥伴',speech:'熱情奔放、滿口傳說英雄、孩子氣的興奮、王者豪氣',moe:'獅心王卻像個追星少年、對亞瑟王傳說的狂熱崇拜、天真到可愛的浪漫、豪邁不拘小節',tic:'眼睛發亮談英雄、揮劍大笑、勾肩搭背'} },
  { id:'阿基里斯-Rider', cls:'Rider', realName:'阿基里斯', wars:['fake'], gender:'男',
    six:{筋力:'A',耐久:'B',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'C',fx:'divine'},{n:'勇猛',r:'A+',fx:'morale'},{n:'神威的車輪',r:'A',fx:'survive'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'貫穿戰場的流星（對人 A）／守護領域的車輪（除踵無敵）',
    align:'混沌・中庸', persona:{firstP:'我',words:'戰士・自由奔放・驕傲重情・不敗',toMaster:'豪爽不羈，認可便傾力相助',speech:'張狂自信、戰意昂揚、重情義、不服輸',moe:'半神英雄的驕傲與孩子氣、唯一弱點腳踵的宿命、對戰友的重情、自由不受拘束',tic:'駕戰車衝鋒、咧嘴挑釁、拍胸脯打包票'} },
  { id:'大仲馬-Caster', cls:'Caster', realName:'亞歷山大·仲馬', wars:['fake'], gender:'男',
    six:{筋力:'E',耐久:'E',敏捷:'D',魔力:'D',幸運:'C',寶具:'C'},
    classSkills:[{n:'道具作成',r:'EX',fx:'crafting'},{n:'陣地作成',r:'C',fx:'territory'}],
    skills:[{n:'故事創作',r:'A',fx:'narrative'},{n:'心眼(真)',r:'B',fx:'analyze'},{n:'怪力（妙筆生兵）',r:'C',fx:'str_up'}],
    traits:[{n:'人類'}], np:'文豪的妙筆・鍛造英靈的兵裝（道具作成 EX）',
    align:'混沌・善', persona:{firstP:'我',words:'文豪・健談・市儈卻浪漫・愛酒愛美人',toMaster:'毒舌愛吐槽，實則悉心照拂',speech:'滔滔不絕、市井俏皮、吐槽不留情、誇張的戲劇腔',moe:'大文豪的市儈與浪漫並存、愛錢愛美人愛美食、毒舌底下的熱心、把人生當小說來寫',tic:'揮筆鍛器、舉杯高談、擠眉弄眼'} },
  { id:'開膛手傑克-Berserker', cls:'Berserker', realName:'開膛手傑克', wars:['fake'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'D',寶具:'B'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'氣息遮斷',r:'B',fx:'stealth'}],
    skills:[{n:'霧夜的殺戮',r:'B',fx:'zabaniya'},{n:'變化（散為霧）',r:'C',fx:'shapeshift'},{n:'情報抹消',r:'A',fx:'unreadable'}],
    traits:[{n:'人類'}], np:'霧夜的殺戮 The Mist（對人・心臟摘除）',
    align:'混沌・惡', persona:{firstP:'我們',words:'孩童・空虛・渴求母愛・霧',toMaster:'試探地索求溫柔，將溫柔之人視作「母親」',speech:'稚嫩天真與冷酷殺意交錯、以「我們」複數自稱、童言童語問著殘忍的話',moe:'渴求母愛而不得的悲傷孩子、天真與殘酷的巨大反差、被溫柔對待會怔住、霧中現身的詭譎',tic:'霧氣繚繞中現身、歪頭天真發問、扯住衣角'} },
  { id:'靜謐的哈桑-Assassin', cls:'Assassin', realName:'靜謐的哈桑', wars:['fake'], gender:'女',
    six:{筋力:'D',耐久:'D',敏捷:'A',魔力:'C',幸運:'C',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造（毒身）',r:'B',fx:'self_mod'},{n:'妄想心音',r:'B',fx:'zabaniya'},{n:'透化',r:'C',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'妄想心音・幻影瞬心 Zabaniya（心臟一擊）',
    align:'秩序・惡', persona:{firstP:'我',words:'孤獨・自我毒身・溫柔的殺意・面紗',toMaster:'寡言順從，珍視「被需要」',speech:'氣若游絲、寡言溫柔、毒與慈悲並存、低聲細語',moe:'毒身不能觸碰他人的孤獨、溫柔殺意的反差、被需要時微小的喜悅、面紗下的羞怯',tic:'面紗低垂、無聲送毒、欲觸又收回手'} },
  { id:'伊絲塔-Archer', cls:'Archer', realName:'伊絲塔', wars:['fake'], gender:'女',
    six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'A',幸運:'B',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'女神的神核',r:'A',fx:'divine_core'},{n:'魔力放出',r:'A',fx:'burst'}],
    traits:[{n:'神性'},{n:'女神'}], np:'天之公牛・山海熔毀的天牛（對界 A+）',
    align:'混沌・善', persona:{firstP:'本小姐',words:'女神・任性・傲嬌・愛美愛閃亮',toMaster:'頤指氣使，意外講義氣',speech:'高傲任性、傲嬌口吻、愛炫耀、得意洋洋',moe:'金星女神的任性傲嬌、見閃亮寶物就走不動、嘴硬心軟的義氣、借了凜的身體卻嘴硬',tic:'叉腰仰頭、召喚天舟、哼一聲撇頭'} },
  // 客串英靈
  { id:'莫德雷德-Saber', cls:'Saber', realName:'莫德雷德', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'卡里斯瑪',r:'C',fx:'morale'}],
    traits:[{n:'龍'},{n:'騎士'}], np:'我的憤怒不會退去 Clarent Blood Arthur（對軍 A）',
    align:'混沌・中庸', persona:{firstP:'我',words:'叛逆・倔強・渴求認同・反逆之騎',toMaster:'桀驁不馴，認可便死忠',speech:'粗豪叛逆、不服輸、稱亞瑟王「父親」、爭強好勝',moe:'外表狂傲內心渴求父親認同、不肯承認的少女心、死要面子、對「弒父叛逆」的執念與悔',tic:'掀面甲咆哮、紅雷纏劍、別過頭'} },
  { id:'卡爾納-Lancer', cls:'Lancer', realName:'卡爾納', wars:['客串'], gender:'男',
    six:{筋力:'A',耐久:'B',敏捷:'A',魔力:'B',幸運:'C',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'神性',r:'B',fx:'divine'},{n:'魔力放出（炎）',r:'A',fx:'burst'},{n:'太陽之鎧',r:'A',fx:'divine_core'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'日輪啊化作鎧甲吧／梵天慈悲之槍（對神 EX）',
    align:'秩序・善', persona:{firstP:'我',words:'施與者・寡言・高潔・恩怨分明',toMaster:'沉默守諾、恩怨分明，有求必應',speech:'極簡寡言、不卑不亢、直言不諱、一諾千金',moe:'有求必應的施捨英雄、面冷心熱、被誤解也不辯解的高潔、認真到不近人情卻最溫柔',tic:'默然佇立、卸甲相贈、平靜直視'} },
  { id:'阿斯托爾福-Rider', cls:'Rider', realName:'阿斯托爾福', wars:['客串'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'B',魔力:'C',幸運:'A',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'怪力',r:'C',fx:'str_up'},{n:'純真無垢',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'觸發傳說的魔笛 La Black Luna／破卻 Casta Diva',
    align:'混沌・善', persona:{firstP:'我',words:'天真爛漫・無憂・忠誠・元氣',toMaster:'活力滿滿，全心信賴',speech:'元氣滿滿、天真爛漫、想到啥說啥、毫無心機',moe:'十二勇士中最天真的開心果、記性差卻最忠誠、可愛到分不清性別、為朋友赴湯蹈火',tic:'蹦蹦跳跳、騎上駿鷹、燦爛大笑'} },
  { id:'賽彌拉米斯-Assassin', cls:'Assassin', realName:'賽彌拉米斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'B',寶具:'A+'},
    classSkills:[{n:'氣息遮斷',r:'C',fx:'stealth'}],
    skills:[{n:'陣地作成（空中庭園）',r:'EX',fx:'territory'},{n:'道具作成（毒）',r:'A',fx:'crafting'},{n:'女神的神核',r:'',fx:'divine_core'}],
    traits:[{n:'神性'},{n:'人類'}], np:'虛榮的空中庭園（對軍・對界）',
    align:'混沌・惡', persona:{firstP:'妾',words:'毒后・傲慢・貞潔的執念・空中庭園',toMaster:'高高在上，唯認可強主',speech:'高貴威嚴、女王口吻、自稱妾、不容違逆',moe:'史上首位毒殺者女王的傲然、對貞潔與真愛的執念、被冒犯時的羞怒、君臨天下的孤高',tic:'俯瞰眾生、抬手降毒、空中庭園浮現'} },
  { id:'尼祿-Saber', cls:'Saber', realName:'尼祿·克勞狄烏斯', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'B',魔力:'C',幸運:'B',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'C',fx:'ride'}],
    skills:[{n:'卡里斯瑪',r:'C',fx:'morale'},{n:'皇帝特權',r:'A',fx:'survive'},{n:'三度全否定',r:'-',fx:'clear_mind'}],
    traits:[{n:'王'},{n:'人類'}], np:'燃燒吧、世界的盡頭 Aestus Domus Aurea（對人・黃金劇場）',
    align:'混沌・善', persona:{firstP:'朕',words:'暴君・自戀・藝術・天真爛漫',toMaster:'熱情張揚，渴望被讚美',speech:'張揚熱情、自稱朕、滿口藝術、自信滿溢、愛唱歌',moe:'暴君之名下的純真自戀、對自身美貌與才藝的迷之自信、渴望被愛被讚美、其實非常努力',tic:'振臂高歌、紅薔薇綻放、得意揚眉'} },
  { id:'玉藻前-Caster', cls:'Caster', realName:'玉藻前', wars:['客串'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A',幸運:'A',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'B',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'變化',r:'A',fx:'shapeshift'},{n:'狐之治癒',r:'A',fx:'rune'}],
    traits:[{n:'神性'},{n:'野獸'}], np:'水天日光天照八野鎮（治癒結界）／八純之鎖',
    align:'混沌・中庸', persona:{firstP:'妾身',words:'賢妻・腹黑・愛吐槽・狐狸',toMaster:'撒嬌又掌控，黏人',speech:'甜膩撒嬌、賢妻口吻、暗藏腹黑、毒舌吐槽裹著糖衣',moe:'賢妻外皮下的腹黑掌控慾、九尾狐的撒嬌黏人、吐槽精準狠辣、為愛奉獻的執著',tic:'狐耳輕顫、掩嘴輕笑、鏡前理妝'} },
  { id:'牛若丸-Rider', cls:'Rider', realName:'源義經（牛若丸）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'D',敏捷:'A',魔力:'D',幸運:'C',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'D',fx:'divine'},{n:'天狗之兵法',r:'B',fx:'first_strike'},{n:'牛若之武略',r:'B',fx:'tactics'}],
    traits:[{n:'神性'},{n:'人類'}], np:'壇之浦・八艘飛（對人・神速跳躍）',
    align:'混沌・善', persona:{firstP:'牛若',words:'悲劇武者・純真・崇拜兄長・赤誠',toMaster:'純粹追隨，赤誠相待',speech:'純真赤誠、武家少女、自稱牛若、崇拜地談起兄長',moe:'悲劇宿命下的純真、對兄長賴朝近乎信仰的崇拜（卻被其所害）、天真爛漫的武勇、赤子之心',tic:'八艘飛躍、雙眸發亮、抱膝談兄長'} },
  { id:'貞德-Ruler', cls:'Ruler', realName:'貞德', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'B',敏捷:'B',魔力:'B',幸運:'A',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'真名看破',r:'A',fx:'analyze'}],
    skills:[{n:'啟示',r:'A',fx:'first_strike'},{n:'守護的旗幟',r:'B',fx:'survive'},{n:'領袖魅力',r:'B',fx:'morale'}],
    traits:[{n:'人類'}], np:'吾主在此 Luminosité Eternelle（守護結界）／紅蓮聖女 La Pucelle',
    align:'秩序・善', persona:{firstP:'我',words:'聖女・堅毅・溫柔的信念・無私',toMaster:'溫柔守護，循循善誘',speech:'溫柔堅定、信仰之言、循循善誘、無私包容',moe:'聖女的堅毅與少女的羞澀、不恨將自己處刑之人的寬容、認真到固執的信念、其實很平凡的願望',tic:'按旗祈禱、溫柔微笑、堅定直視'} },
  { id:'美遊-Saber', cls:'Saber', realName:'美遊·埃德費爾特（Saber install）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'B',fx:'burst'},{n:'沉著冷靜',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'約定勝利之劍 Excalibur（對城 A+）',
    align:'秩序・善', persona:{firstP:'我',words:'寡言・認真・溫柔內斂・背負宿命',toMaster:'認真盡責，沉默守護',speech:'寡言內斂、認真守禮、溫柔低語、不擅表達',moe:'聖杯之子的孤獨宿命、被兄長守護的依賴、認真過頭的笨拙、內斂的溫柔',tic:'沉默佇立、握劍守護、垂眸淺應'} },
  { id:'小黑-Archer', cls:'Archer', realName:'克洛伊·馮·愛因茲貝倫（Archer install）', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'C',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'投影魔術',r:'B',fx:'projection'},{n:'千里眼',r:'C',fx:'aim'},{n:'無限劍製',r:'C',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works／干將・莫邪（雙劍亂舞）',
    align:'混沌・中庸', persona:{firstP:'本小姐',words:'腹黑・愛捉弄・直率好戰・撒嬌',toMaster:'又黏又愛逗弄，戰意旺盛',speech:'促狹捉弄、直率好戰、撒嬌耍賴、得意挑釁',moe:'愛捉弄人的腹黑、黏人又傲嬌、戰鬥狂的興奮、其實很重感情',tic:'勾肩貼近、雙劍交叉、吐舌挑釁'} },
  { id:'伊莉雅-Caster', cls:'Caster', realName:'伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'B',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'},{n:'道具作成（魔杖・露比）',r:'C',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'魔力放出',r:'B',fx:'burst'},{n:'純真無垢',r:'A',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'全彈發射・魔力炮 Quintett Feuer（多重魔力炮擊）',
    align:'中立・善', persona:{firstP:'我',words:'天真活潑・善良・愛哭卻勇敢・魔法少女',toMaster:'純真信賴，朝氣蓬勃',speech:'活潑天真、元氣滿滿、善良直率、偶爾愛哭',moe:'魔法少女的天真爛漫、愛哭卻在關鍵時刻勇敢、對家人朋友的善良、變身咒語的中二',tic:'魔杖一揮、燦笑、眼眶泛淚還硬撐'} }
];

// 御主 persona 為 4 段頓號（日常表象・真實內裡・喜歡・厭惡）供 TRAIT/PREF 解析；
// back＝身世生平（show-don't-tell 的演出依據）、moe＝反差萌點。
var SEED_MASTERS = [
  // 第五次
  {id:'衛宮士郎-5th',  name:'衛宮士郎', gender:'男', appearance:'紅褐短髮的高中生，樸素襯衫',   war:'5th', magic:'投影／強化',          circuits:30, melee:'D', magic_rank:'D', home:'冬木·深山町', wish:'成為正義的伙伴',          persona:'樂於助人的好好先生・扭曲的自我犧牲・喜歡修繕器物與做家事・厭惡見死不救', back:'冬木大火唯一倖存的孤兒，被衛宮切嗣收養，繼承「成為正義夥伴」這份扭曲而炙熱的理想', moe:'自己滿身傷還先擔心別人、家事與修機械異常拿手、嘴硬的逞強、認真到笨拙'},
  {id:'遠坂凜-5th',    name:'遠坂凜', gender:'女', appearance:'黑長雙馬尾、紅衣黑裙，傲然',     war:'5th', magic:'寶石魔術',            circuits:45, melee:'C', magic_rank:'A', home:'遠坂宅',     wish:'見證聖杯・不負遠坂之名',  persona:'人前完美的優等生・刀子嘴豆腐心・喜歡可愛小物與紅茶・厭惡示弱與失態', back:'冬木名門遠坂家次女，父親時臣死於上屆聖杯戰爭，背負遠坂的驕傲與正統魔術師之道', moe:'人前完美人後迷糊、傲嬌到極致、其實很怕寂寞、偷偷存錢買可愛小物還嘴硬'},
  {id:'間桐慎二-5th',  name:'間桐慎二', gender:'男', appearance:'藍髮神經質青年，刻薄表情',   war:'5th', magic:'魔術迴路微弱・依賴從者', circuits:15, melee:'E', magic_rank:'E', home:'間桐宅',     wish:'被認可・奪取勝利',        persona:'自信張揚的表象・自卑虛榮・喜歡被吹捧與掌控感・厭惡比自己強的人', back:'間桐家養子，魔術迴路微弱不被家族認可，活在妹妹櫻與名門陰影下的扭曲少年', moe:'色厲內荏一戳就破、虛張聲勢的可悲、偶爾流露的脆弱、其實渴望被認可'},
  {id:'葛木宗一郎-5th',name:'葛木宗一郎', gender:'男', appearance:'戴眼鏡的沉默教師，黑西裝', war:'5th', magic:'體術（蛇之拳）・無魔術', circuits:10, melee:'A', magic_rank:'E', home:'柳洞寺',     wish:'無所求・守護 Caster',     persona:'沉默盡責的教師・別無所求的絕對忠誠・喜歡平靜的日常・厭惡虛偽的言辭', back:'本是無名殺手，隱姓埋名成為高中教師，因美狄亞而第一次有了「想守護之物」', moe:'面無表情卻絕對守諾、對 Caster 笨拙而深沉的情意、蛇之拳的致命反差、不懂浪漫卻最深情'},
  {id:'言峰綺禮-5th',  name:'言峰綺禮', gender:'男', appearance:'高大神父、黑色法衣，陰沉',   war:'5th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'尋得能讓自己喜悅之物',    persona:'虔誠神父的假面・以他人痛苦為樂的空虛・喜歡探究何為喜悅・厭惡平庸的善', back:'生來只能在他人不幸中感到喜悅的神父，壓抑天性數十年，終在吉爾伽美什慫恿下坦然墮落', moe:'麻婆豆腐的意外執著、對自身惡的坦誠到近乎天真、扭曲卻誠實、與 Archer 的損友默契'},
  {id:'伊莉雅絲菲爾-5th',name:'伊莉雅絲菲爾', gender:'女', appearance:'紅眼白髮的幼小少女，毛領大衣',war:'5th',magic:'愛因茲貝倫煉金術・聖杯依代',    circuits:80, melee:'D', magic_rank:'A', home:'冬木·新都', wish:'完成聖杯的使命',          persona:'天真爛漫的少女・哀傷的聖杯依代・喜歡士郎與雪・厭惡孤獨', back:'愛因茲貝倫煉金術製造的人造人、第三魔法的聖杯之器，被當作工具養大卻渴望親情', moe:'天真與哀傷並存、把士郎當哥哥的執著、人造人的純真、強顏歡笑的寂寞'},
  {id:'間桐櫻(黑化)-5th',name:'間桐櫻（黑化）', gender:'女', appearance:'黑長髮、黑紅禮服，妖異而空洞的笑',war:'5th',magic:'聖杯之泥・無限魔力・蟲爪', circuits:90, melee:'E', magic_rank:'A', home:'間桐宅', wish:'獨佔所愛、將傷害自己的世界一同拖入黑暗', persona:'溫順乖巧的假面・被黑泥吞噬的佔有・渴望獨佔所愛・厭惡傷害過自己的一切', back:'遠坂家次女，自幼被送養給間桐家承受蟲蝕之苦十一年，長期壓抑終被聖杯黑泥侵蝕黑化', moe:'純愛扭曲成毀滅性佔有的反差、乖巧外表下的瘋狂、對姊姊與學長的複雜執念、可憐又可怖'},
  // 第四次
  {id:'衛宮切嗣-4th',  name:'衛宮切嗣', gender:'男', appearance:'黑髮疲憊的男人，風衣',   war:'4th', magic:'起源彈・固有時制御',    circuits:35, melee:'A', magic_rank:'B', home:'冬木·深山町', wish:'以聖杯拯救世界、終結戰爭',persona:'冷酷疲憊的魔術師殺手・為大義不擇手段・喜歡（曾經）平凡的幸福・厭惡無謂的犧牲', back:'信奉「拯救多數而犧牲少數」的魔術師殺手，為終結戰爭尋求聖杯，最終卻親手毀掉它', moe:'冷酷算計下對家人的溫柔、理想與手段的痛苦矛盾、抽菸沉思的疲憊、其實最痛恨殺戮'},
  {id:'遠坂時臣-4th',  name:'遠坂時臣', gender:'男', appearance:'金棕髮的優雅紳士，名門做派',   war:'4th', magic:'寶石魔術',            circuits:50, melee:'D', magic_rank:'A', home:'遠坂宅',     wish:'抵達「根源之渦」',        persona:'優雅從容的名門紳士・抵達根源的執念・喜歡藝術與秩序・厭惡粗鄙與失格', back:'遠坂家當主，畢生追求「根源之渦」的正統魔術師，召喚最強英靈，卻死於弟子綺禮之手', moe:'過度講究的優雅做派、對美學與禮儀的執著、名門的迂腐可愛、教科書般的魔術師'},
  {id:'肯尼斯-4th',    name:'肯尼斯', gender:'男', appearance:'金髮高傲的年輕教授',     war:'4th', magic:'礦石科・流體操作',      circuits:50, melee:'C', magic_rank:'A', home:'冬木·新都', wish:'榮譽與學術成就',          persona:'高傲的天才教授・極高的自尊・喜歡學術與名譽・厭惡被輕視', back:'時鐘塔礦石科年輕天才講師，攜未婚妻索菈參戰，卻因觸媒被韋伯偷走而步步潰敗', moe:'天才的傲慢與脆弱自尊、對未婚妻意外的深情、被打臉時的崩潰、學究的一板一眼'},
  {id:'韋伯·維爾維特-4th',name:'韋伯·維爾維特', gender:'男', appearance:'黑髮瘦小的少年魔術師',war:'4th',magic:'自我暗示・基礎魔術', circuits:25, melee:'E', magic_rank:'C', home:'冬木·新都', wish:'證明自己的價值',          persona:'故作老成的少年・自卑卻好強・喜歡證明自己・厭惡被當作無能', back:'出身平凡的時鐘塔末席學生，為證明「才能非血統決定」偷走觸媒召喚征服王，一路成長', moe:'嘴硬的自卑少年、被 Rider 一路調教成長、口嫌體正直、偷偷崇拜征服王'},
  {id:'雨生龍之介-4th',name:'雨生龍之介', gender:'男', appearance:'輕浮的金髮青年，咧嘴而笑', war:'4th', magic:'無魔術・召喚術（外行）', circuits:10, melee:'C', magic_rank:'E', home:'冬木·新都', wish:'見識更有趣的事物・召喚惡魔',persona:'輕浮開朗的青年・天生純粹之惡・喜歡有趣與新鮮的死亡・厭惡無聊', back:'毫無魔術素養卻天生純粹的殺人狂，誤打誤撞召喚出青鬍子，把殺戮當成有趣的遊戲', moe:'開朗笑容下的純粹瘋狂、對「有趣」孩子般的好奇、與 Caster 的瘋狂默契、毫無惡意的惡'},
  {id:'言峰綺禮-4th',  name:'言峰綺禮', gender:'男', appearance:'尚未墮落的青年神父，壓抑',   war:'4th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'探求自身空虛的答案',      persona:'壓抑的青年神父・尚未墮落的空虛・執著探求自身的答案・厭惡虛假的自己', back:'尚未墮落的代行者神父，奉命輔佐時臣，卻在追問「自身為何空虛」中逐步走向深淵', moe:'壓抑天性的痛苦掙扎、對自身空虛的執著探求、未墮落前的克制、宿命般走向黑暗'},
  {id:'間桐雁夜-4th',  name:'間桐雁夜', gender:'男', appearance:'蟲蝕半白頭髮的憔悴男子',   war:'4th', magic:'間桐之蟲術',          circuits:15, melee:'D', magic_rank:'C', home:'間桐宅',     wish:'從間桐手中救出櫻',        persona:'憔悴的悲憤男子・自我犧牲的執念・只為救出櫻・厭惡間桐家', back:'捨棄魔術逃離間桐家的男人，為救受蟲蝕之苦的櫻，重回家門植入蟲術、賭上性命參戰', moe:'憔悴外表下的純粹父愛、明知必死仍奮不顧身、被蟲蝕的痛苦、悲劇的溫柔'}
];

// 從者物件 → 英靈殿列（順序＝COL.HERO）
function servantToHeroRow_(s) {
  return [s.id, s.cls, s.realName, s.gender, JSON.stringify(s.six),
    JSON.stringify(s.classSkills), JSON.stringify(s.skills), JSON.stringify(s.traits),
    s.np, JSON.stringify(s.persona), s.align, JSON.stringify(s.wars), 'seed'];
}
// 御主物件 → 御主殿列（順序＝COL.MASTER；末兩欄 身世、萌點 為本版新增）
function masterToCodexRow_(m) {
  return [m.id, m.name, m.gender, m.appearance, m.magic, m.circuits, m.melee,
    m.magic_rank, m.home, m.wish, m.persona, m.war, 'seed', m.back || '', m.moe || ''];
}

// 種子人設版本：每次精緻化 persona(萌點/口吻) 就升一版，觸發既有英靈殿/御主殿升級
var CODEX_PERSONA_VER = 'v5';

// 升級既有英靈殿的 persona 欄（不刪客製英靈，只覆寫種子英靈的 PERSONA 為最新細緻設定）
function upgradeCodexPersonas_(ss) {
  var hero = ss.getSheetByName('英靈殿');
  if (!hero || hero.getLastRow() <= 1) return 0;
  var d = hero.getDataRange().getValues();
  var byId = {};
  SEED_SERVANTS.forEach(function (s) { byId[s.id] = s; });
  var n = 0;
  for (var i = 1; i < d.length; i++) {
    var s = byId[String(d[i][COL.HERO.ID])];
    // 整列依種子重寫(六圍/職階技能/固有技能/特性/寶具/人設/陣營)，只刷種子英靈(ID 對應)、不動客製英靈
    if (s) { var row = servantToHeroRow_(s); hero.getRange(i + 1, 1, 1, row.length).setValues([row]); n++; }
  }
  return n;
}

// 升級既有御主殿：覆寫種子御主的 人格／身世／萌點（依 ID 對應；不動客製御主）。
//   並補上「身世」「萌點」兩欄表頭（本版新增欄位）。
function upgradeMasterCodex_(ss) {
  var msh = ss.getSheetByName('御主殿');
  if (!msh || msh.getLastRow() <= 1) return 0;
  // 補表頭（冪等）
  try {
    msh.getRange(1, COL.MASTER.BACK + 1).setValue('身世');
    msh.getRange(1, COL.MASTER.MOE + 1).setValue('萌點');
  } catch (e) { }
  var d = msh.getDataRange().getValues();
  var byId = {};
  SEED_MASTERS.forEach(function (m) { byId[m.id] = m; });
  var n = 0;
  for (var i = 1; i < d.length; i++) {
    var m = byId[String(d[i][COL.MASTER.ID])];
    if (!m) continue;
    msh.getRange(i + 1, COL.MASTER.PERSONA + 1).setValue(m.persona);
    msh.getRange(i + 1, COL.MASTER.BACK + 1).setValue(m.back || '');
    msh.getRange(i + 1, COL.MASTER.MOE + 1).setValue(m.moe || '');
    n++;
  }
  return n;
}

// 🔵 英靈殿/御主殿 為空(只有表頭)時，自動灌入名冊。冪等：有資料就不動。
//   另：版本升級時自動把既有種子英靈的 persona 刷成最新（萌點/口吻），不動客製英靈。
function seedFateCodex_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var hero = ss.getSheetByName('英靈殿');
  if (hero && hero.getLastRow() <= 1) {
    var hrows = SEED_SERVANTS.map(servantToHeroRow_);
    hero.getRange(2, 1, hrows.length, hrows[0].length).setValues(hrows);
  }
  var master = ss.getSheetByName('御主殿');
  if (master && master.getLastRow() <= 1) {
    var mrows = SEED_MASTERS.map(masterToCodexRow_);
    master.getRange(2, 1, mrows.length, mrows[0].length).setValues(mrows);
  }
  // 人設版本升級（只跑一次）
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('codex_persona_ver') !== CODEX_PERSONA_VER) {
      upgradeCodexPersonas_(ss);
      upgradeMasterCodex_(ss);
      props.setProperty('codex_persona_ver', CODEX_PERSONA_VER);
    }
  } catch (e) { }
}

// 可從編輯器手動執行
function seedFateCodex() {
  seedFateCodex_();
  return '英靈殿 ' + SEED_SERVANTS.length + ' 騎、御主殿 ' + SEED_MASTERS.length + ' 名（若原本為空才寫入）。';
}
