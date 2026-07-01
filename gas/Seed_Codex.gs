// ==========================================
// 🔵 Seed_Codex.gs — 英靈殿(從者範本) + 御主殿 名冊種子（逐字移植自 FATE）
// seedFateCodex_(ss)：英靈殿/御主殿 為空時自動灌入；ensureFateSheets_ 末尾呼叫。
// ==========================================

var SEED_SERVANTS = [
  // 第五次
  { id:'阿爾托莉雅-Saber', cls:'Saber', realName:'阿爾托莉雅·潘德拉貢', wars:['4th','5th'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'A',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'B',fx:'morale'},
            {n:'風王鐵鎚',r:'A',fx:'wind_strike'}],
    traits:[{n:'王'},{n:'人類'},{n:'龍'}], np:'誓約勝利之劍 Excalibur（對城 A++）／全世界遙遠的理想鄉 Avalon（永世惑曲·無敵結界·守護持有者）',
    align:'秩序・善', persona:{firstP:'我',look:'金髮碧眼・甲冑藍裙的嬌小騎士、端正挺拔的王者威儀、自稱「我」・武人般簡潔',words:'騎士道・榮譽・自我犧牲・壓抑的少女心',toMaster:'盡忠職守、初期保持距離，逐漸動搖',speech:'正式鄭重、武人般簡潔、不擅言情、認真到一絲不苟',moe:'食量驚人卻吃相優雅、對現代食物純真驚嘆、王者外殼下沒當過少女的寂寞、笨拙的溫柔',tic:'用餐時無比專注滿足、握劍時氣場驟冷'} },
  { id:'EMIYA-Archer', cls:'Archer', realName:'無名（EMIYA）', wars:['5th'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'千里眼',r:'C',fx:'aim'},{n:'投影魔術',r:'',fx:'projection'},{n:'七天盾·羅·埃亞斯',r:'',fx:'rho_aias'},{n:'無限劍製',r:'',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works（固有結界）／偽·螺旋劍 Caladbolg II（破斷重塑的流星劍·連射）',
    align:'中立・中庸', persona:{firstP:'我',look:'褐膚白髮・紅黑外衣的厭世弓兵、玩世不恭的疲憊冷峻、自稱「我」・毒舌語氣',words:'現實・諷刺・自我厭惡・藏起來的理想',toMaster:'嘴上不饒人、暗中守護',speech:'老氣橫秋的比喻、毒舌吐槽、看似冷淡的關心、偶爾說教',moe:'毒舌卻替人下廚、家事異常熟練、對年輕時理想的糾結、嘴硬心軟',tic:'做菜時格外認真、雙劍交叉的架式、無奈嘆氣'} },
  { id:'庫丘林-Lancer', cls:'Lancer', realName:'庫·丘林', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'避矢加護',r:'B',fx:'evade_ranged'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'刺穿死亡之棘',r:'B',fx:'gae_bolg',causality:true}],
    traits:[{n:'神性',r:'B'}], np:'刺穿死棘之槍 Gáe Bolg（對人 B・因果逆轉必中）',
    align:'秩序・中庸', persona:{firstP:'俺',look:'藍髮赤瞳・精悍結實的青年戰士、豪爽不羈的野性氣場、自稱「俺」・豪爽粗獷',words:'戰士・痛快・重義・運氣爛到極點',toMaster:'爽快直率、討厭被當棋子',speech:'豪爽粗獷、戰鬥狂熱、抱怨自己倒楣、義氣掛嘴邊',moe:'一身本事卻衰運纏身(幸運E)的倒楣宿命、遇強敵純粹興奮、意外會照顧後輩、被迫做討厭任務時的牢騷',tic:'扛槍咧嘴笑、戰前舔嘴唇、抓頭抱怨'} },
  { id:'美杜莎-Rider', cls:'Rider', realName:'美杜莎', wars:['5th'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'A',魔力:'B',幸運:'E',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'女神的神核',r:'',fx:'divine_core'},{n:'魔眼',r:'A',fx:'petrify'}],
    traits:[{n:'神性'},{n:'女神'}], np:'他者封印·鮮血神殿 Blood Fort Andromeda（對軍·結界）／騎英之手綱 Bellerophon（對軍 A+）',
    align:'混沌・善', persona:{firstP:'我',look:'紫長髮・眼鏡封印魔眼的修長女子、寡言低斂的幽靜氣息、自稱「我」・語氣壓得很低',words:'忠誠・守護・自卑・深藏的溫柔',toMaster:'寡言而深情、極度護主',speech:'寡言低沉、必要才開口、護主時毫不猶豫、語氣壓得很低',moe:'怪力女神卻極度自卑、靠眼鏡壓制魔眼的反差、對御主近乎獻身的忠誠、姊姊般的包容',tic:'推眼鏡、靜默佇立暗處、垂眸'} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'}],
    traits:[{n:'人類'}], np:'萬符必應破戒 Rule Breaker（規則破壞者 C）',
    align:'中立・惡', persona:{firstP:'我',look:'紫袍兜帽・抱緣紅短劍的清麗魔女、溫婉中帶試探的疏離、自稱「我」・用敬語',words:'背叛的傷痕・渴望被信任・腹黑・少女心',toMaster:'防備卻渴望真心相待',speech:'溫婉中帶試探、用敬語、自嘲被背叛的過往、偶爾流露脆弱',moe:'魔女外表下渴望被愛、被真心對待會慌、為所愛之人不擇手段、反差的純情',tic:'抱著緣紅短劍、垂眸輕笑、欲言又止'} },
  { id:'佐佐木小次郎-Assassin', cls:'Assassin', realName:'佐佐木小次郎', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'E',敏捷:'A+',魔力:'E',幸運:'A',寶具:'E'},
    classSkills:[{n:'氣息遮斷',r:'D',fx:'stealth'}],
    skills:[{n:'心眼（偽）',r:'A',fx:'analyze'},{n:'透化',r:'B+',fx:'clear_mind'},
            {n:'宗和的心得',r:'B',fx:'unreadable'},{n:'秘劍・燕返',r:'-',fx:'tsubame'}],
    traits:[{n:'人類'}], np:'燕返 Tsubame Gaeshi（對人魔劍・次元摺疊・三段同時斬）',
    align:'中立・中庸', persona:{firstP:'拙者',look:'墨髮長刀・素樸和裝的清瘦劍客、淡泊洒脫的禪意閒適、自稱「拙者」・古風文雅',words:'劍士・閒適・無欲・宿命',toMaster:'隨遇而安、只求一戰',speech:'古風文雅、淡泊洒脫、帶禪意、慢條斯理',moe:'無欲無求的洒脫、只為一場好決鬥而活、看守山門的隨遇而安、非英雄卻有英雄氣的平凡',tic:'凝望飛燕、按刀靜立、微微一笑'} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'D',fx:'nullify_magic'}],
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    traits:[{n:'神性',r:'A'},{n:'王'}], np:'十二試煉 God Hand（A·十二條命）',
    // ⚠ 原作設定：射殺百頭 Nine Lives 是狂化壓制下【無法使用】的寶具(福瓦基體系被Berserker職階鎖住，僅原典/FGO非狂化狀態可用)，
    //   已從這版拿掉、移給下方 赫拉克勒斯-Archer(偽聖杯·未狂化版)。這版狂化下就只有 God Hand。
    align:'混沌・狂', persona:{firstP:'（狂化·僅咆哮）',look:'巨軀岩肌・黑霧纏身的半神戰士、無言低吼的壓迫氣場、狂化無自稱・僅以咆哮',words:'戰神・狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',speech:'狂化無法言語、只以低吼與行動表達；唯護主的本能殘留',moe:'狂暴外殼下對御主殘存的溫柔、偶爾理智回光的瞬間、十二試煉一次次自死亡歸來的悲壯',tic:'低沉咆哮、以巨軀擋在主人身前、緩緩起身'} },
  { id:'赫拉克勒斯-Archer', cls:'Archer', realName:'赫拉克勒斯', wars:['fake'], gender:'男',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'B',幸運:'B',寶具:'A'},
    classSkills:[{n:'單獨行動',r:'A',fx:'solo'},{n:'陣地作成',r:'C',fx:'territory'}],
    skills:[{n:'狂化',r:'D',fx:'mad'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    traits:[{n:'神性',r:'A'}], np:'十二試煉 God Hand（A·十二條命）／射殺百頭 Nine Lives（九頭蛇射穿·九連速射）',
    align:'混沌・善', persona:{firstP:'我',look:'獸皮纏身、掛弓負箭的巨軀戰士、褪去大半狂化後難得清明的眼神、自稱「我」・偶有粗獷笑意',words:'解放・清明殘存・箭矢與試煉',toMaster:'狂化枷鎖鬆開後少見的忠誠與眷戀，視御主為稀有的珍寶',speech:'話少但清晰(狂化壓下大半理智但未全失)、偶爾粗獷豪笑、對戰鬥本身仍有純粹的渴望',moe:'狂化鬆綁後罕見流露的溫和眼神、對「能好好說話」這件小事的珍惜、獸皮下藏不住的巨大孤獨、十二試煉不滅的悲壯依舊',tic:'摸過肩上的獸皮、搭箭前的短暫沉默、戰鬥後罕見的安穩喘息'} },
  // 第四次
  { id:'吉爾伽美什-Archer', cls:'Archer', realName:'吉爾伽美什', wars:['4th','fake'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'E',fx:'nullify_magic'},{n:'單獨行動',r:'A+',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'領袖氣質',r:'A',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）／乖離劍 Ea（天地乖離·封藏的至高兵裝，傲慢時不出鞘）',
    align:'混沌・善', persona:{firstP:'吾',look:'金髮赤瞳・金鎧加身的俊美王者、睥睨眾生的慵懶威壓、自稱「吾」・睥睨自矜的王者腔',words:'傲慢・王・俯視眾生・收藏家',toMaster:'視為雜種、幾乎不從令，唯對少數有趣之人起興致',speech:'居高臨下、稱人「雜種」、慵懶而帶威壓、偶爾興味盎然',moe:'唯一承認的友人（恩奇都）、對「有趣」之物異常執著、品酒品人的講究、傲慢底下的孤獨',tic:'金色波紋中抽出寶具、嗤笑、紅瞳微眯'} },
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A+',魔力:'D',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'戰鬥續行',r:'A',fx:'survive'},{n:'愛之痣',r:'B',fx:'lovespot'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'anti_magic_lance'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{firstP:'我',look:'墨綠髮・面有愛之痣的俊美騎士、謙恭正直的武人風骨、自稱「我」・謙恭有禮',words:'忠義・騎士・哀愁・宿命的女難',toMaster:'絕對忠誠，渴望堂堂正正之戰',speech:'謙恭有禮、武人正直、壓抑情感、自責時沉聲',moe:'臉上愛之痣令女性傾心的悲劇宿命、對主君的死忠、渴望光明磊落決鬥卻屢遭背叛、溫柔到自我犧牲',tic:'雙槍交握行禮、垂眸掩去面痣、沉聲立誓'} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾（征服王）', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'D',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    skills:[{n:'領袖氣質',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX·固有結界召喚萬軍）／神威的車輪 Gordius Wheel（雷神戰車·衝鋒）',
    align:'中立・善', persona:{firstP:'余',look:'紅髮虬髯・魁梧壯碩、披風加身的征服王、豪邁爽朗的王者雅量、自稱「余」・氣口恢弘如雷',words:'豪邁・征服・雅量・王道',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',speech:'豪爽大笑、稱「小鬼」、王者氣度、好酒好戰、講大道理',moe:'征服世界的野心與孩子氣並存、愛酒愛地圖、收伏人心的雅量、把御主當孩子般栽培（不分男女）',tic:'仰天大笑、攤開世界地圖、灌下整桶酒'} },
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯（青鬍子）', wars:['4th'], gender:'男',
    six:{筋力:'E',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'A+'},
    classSkills:[{n:'陣地作成',r:'C',fx:'territory'},{n:'道具作成',r:'C',fx:'crafting'},{n:'城牆防禦',r:'C',fx:'wall_def'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本 Prelati\'s Spellbook（深淵召喚・召喚大海怪）',
    align:'混沌・惡', persona:{firstP:'我',look:'青鬚華服・捧著厚重教本的貴族、虔誠與癲狂交錯的氣息、自稱「我」・時文雅時癲狂咆哮',words:'瘋狂・虔誠扭曲・對「聖女」的執念',toMaster:'與同其瘋狂共鳴的御主引為純粹之惡的摯友、相互共鳴；否則貌合神離',speech:'時而文雅虔誠、時而癲狂咆哮、引經據典又褻瀆神明',moe:'曾為聖女信徒的純粹墮落成深淵的反差、對「神不在場」的悲憤、與志同道合的御主一搭一唱的瘋狂默契',tic:'翻動教本咆哮、淚流滿面的狂笑、自深淵召出觸手海怪'} },
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'B',魔力:'D',幸運:'E',寶具:'D'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想幻像',r:'',fx:'zabaniya'}],
    traits:[{n:'人類'}], np:'妄想幻像 Zabaniya: Delusional Illusion（對人·分裂為百種人格·最多同時八十體）',
    align:'秩序・惡', persona:{firstP:'我們',look:'骷髏面具・黑袍裹身的詭譎刺客、肅殺低語的宗教氣息、自稱「我們」・多重聲線交疊低語',words:'群體・狂信・無數人格・山中老人',toMaster:'服從，視暗殺為信仰',speech:'多重聲線交疊、以「我們」自稱、低語、宗教式的肅殺',moe:'十八種人格共用一具身軀的詭異、對「初代之名」的執著、暗殺即信仰的純粹',tic:'骷髏面具下變換面孔、無聲現身、低誦經文'} },
  { id:'咒腕之哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（咒腕）', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A',魔力:'E',幸運:'B',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'妄想心音',r:'',fx:'zabaniya'},{n:'投影魔術',r:'C',fx:'projection'},{n:'自我改造（詛咒之腕）',r:'C',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（對人·掏出心臟之影即死）',
    align:'秩序・惡', persona:{firstP:'我',look:'骷髏面具・纏滿詛咒繃帶左臂的暗殺者、寡言肅殺的氣息、自稱「我」・低沉簡短肅穆',words:'暗殺・詛咒之腕・沉默・初代之名',toMaster:'冷淡服從、以暗殺為天職',speech:'低沉簡短、必要才開口、宗教式的肅穆',moe:'纏繃帶的詛咒左臂、心臟掏取的致命一擊、沉默卻守諾、暗殺信條的純粹',tic:'以左臂掏心之姿、無聲潛近、垂首誦念'} },
  { id:'蘭斯洛特-Berserker', cls:'Berserker', realName:'蘭斯洛特（湖之騎士）', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無毀的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'}], np:'騎士不為孤軍 Knight of Owner（萬物化為兵裝）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅低吼）',look:'黑霧鎧甲・湖之騎士的悲愴身影、悲鳴般低吼的壓抑瘋狂、狂化無自稱・僅餘悲鳴般低吼',words:'悔恨・無言的瘋狂・對主君的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',speech:'狂化奪去言語，只餘悲鳴般的低吼；理智深處是對亞瑟王與王后之間罪的愧悔',moe:'湖之騎士的高潔被悔恨吞沒的悲劇、渴望被懲罰的扭曲忠誠、理智回光時的痛楚',tic:'黑霧纏身、抓起任何物件化為兵裝、無聲逼近'} },
  // FAKE 樣本
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['fake'], gender:'無',
    // ⬇️ 基線＝非理想御主下的恩奇都(供魔不足)。與銀狼(獵犬御主，原作真正的御主)結契才回全盛全A·寶A++(masterSynergySix_)。
    six:{筋力:'C',耐久:'B',敏捷:'B',魔力:'B',幸運:'-',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'天之鎖',r:'A',fx:'chain'},{n:'變生',r:'A',fx:'shapeshift'},{n:'神性',r:'A',fx:'divine'}],
    traits:[{n:'神性'},{n:'神造兵器'},{n:'病死宿命'}], np:'天地乖離開闢之星 Enuma Elish（變化・對界）',
    align:'中立・中庸', persona:{firstP:'我',look:'青綠長髮・中性無垢的神造之軀、平和無機卻溫柔的氣息、自稱「我」・平和中性而純真',words:'純真・神造・追尋摯友・無垢',toMaster:'溫和而疏離，心繫吉爾伽美什',speech:'平和中性、純真直接、無機質卻溫柔、談起摯友便柔軟',moe:'神造兵器卻最有人性、對吉爾伽美什的純粹羈絆、不解人類卻嚮往、變幻自如的天真',tic:'化身千刃、歪頭觀察、望向遠方'} },
  // 斯卡哈 三職階
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'C',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'魔境的智慧',r:'A',fx:'mage_realm'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg',causality:true}],
    traits:[{n:'人類'}], np:'貫穿死翔之槍 Gáe Bolg Alternative（對人 B+·釘空必中＋投擲斷命）／死亡滿溢的魔境之門 Gate of Skye（對軍 A+·吸入影之國）',
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・緊身戰衣的妖豔女王、冷峻威嚴的嚴師氣場、自稱「我」・師長口吻簡潔如刃',words:'影之國女王・冷峻嚴師・武人・求死而不得',toMaster:'嚴厲考校、唯認可強者，師者之威',speech:'冷峻威嚴、師長口吻、簡潔如刃、偶露揶揄',moe:'千年女王的孤高、渴望一死卻不得的寂寞、對弟子又嚴又護、揶揄人時的促狹',tic:'魔槍杵地、睥睨、勾唇淺笑'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'B',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'人類'}], np:'蹴穿死翔之槍 Gáe Bolg Alternative（對人 B+·影縫穿刺）',
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮暗裝・融入影中的致命女王、冷冽無聲的審視氣息、自稱「我」・低冷簡短一針見血',words:'潛行的女王・冷冽・致命・影',toMaster:'冷眼試探、出手無情，認可方鬆動',speech:'低冷簡短、氣息全無、一針見血',moe:'影中女王的致命優雅、試探背後的審視、認可強者後難得的鬆動',tic:'融入暗影、刃尖輕轉、無聲逼近'} },
  { id:'斯卡蒂-Caster', cls:'Caster', realName:'斯卡哈·斯卡蒂（Skadi）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'C',魔力:'EX',幸運:'D',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'EX',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'女神的神核',r:'A',fx:'divine_core'},{n:'原初符文',r:'EX',fx:'rune'},{n:'大神的睿智',r:'B+',fx:'analyze'},{n:'冰凍暴風雪',r:'B',fx:'petrify'}],
    traits:[{n:'神性'},{n:'女神'},{n:'巨人'}], np:'通往死亡滿溢的魔境之門 Gate of Skye（對軍 A+·影之城的祝福·開戰寶具）',
    align:'中立・善', persona:{firstP:'吾',look:'銀紫長髮・符文環繞的冰雪女神、莊重慈悲並存的母性威儀、自稱「吾」・溫柔莊重如神祇',words:'北歐女神・溫柔而威嚴・守護者・嚴母',toMaster:'溫柔包容、暗藏神威，母性',speech:'溫柔而莊重、自稱吾、神祇的慈悲與威嚴並存',moe:'冰雪女神的溫柔母性、害羞時的可愛、守護生靈的執著、威嚴下的溫情',tic:'符文環繞、垂眸微笑、輕撫額前'} },
  // strange Fake
  { id:'理查一世-Saber', cls:'Saber', realName:'獅心王・理查一世', wars:['fake'], gender:'男',
    six:{筋力:'B',耐久:'B',敏捷:'C',魔力:'C',幸運:'A',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'領袖氣質',r:'B',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'戰鬥續行',r:'A',fx:'survive'}],
    traits:[{n:'王'},{n:'人類'}], np:'圓桌之證・呼喚英雄之劍 Rounds of Lionheart（對軍 A）',
    align:'中立・善', persona:{firstP:'余',look:'金髮碧眼・佩劍披風的獅心王、豪邁不羈孩子氣的昂揚王者、自稱「余」・熱情奔放滿口傳說',words:'浪漫・崇拜英雄・天真豪邁・獅心',toMaster:'坦率信賴，視為冒險夥伴',speech:'熱情奔放、滿口傳說英雄、孩子氣的興奮、王者豪氣',moe:'獅心王卻像個追星少年、對亞瑟王傳說的狂熱崇拜、天真到可愛的浪漫、豪邁不拘小節',tic:'眼睛發亮談英雄、揮劍大笑、勾肩搭背'} },
  { id:'阿基里斯-Rider', cls:'Rider', realName:'阿基里斯', wars:['fake'], gender:'男',
    six:{筋力:'B+',耐久:'A',敏捷:'A+',魔力:'C',幸運:'D',寶具:'A'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'C',fx:'divine'},{n:'勇猛',r:'A+',fx:'morale'},{n:'神威的車輪',r:'A',fx:'survive'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'貫穿戰場的流星（對人 A）／守護領域的車輪（除踵無敵）',
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮健碩・駕戰車執長槍的半神戰士、張狂自信戰意昂揚、自稱「我」・不服輸的挑釁口吻',words:'戰士・自由奔放・驕傲重情・不敗',toMaster:'豪爽不羈，認可便傾力相助',speech:'張狂自信、戰意昂揚、重情義、不服輸',moe:'半神英雄的驕傲與孩子氣、唯一弱點腳踵的宿命、對戰友的重情、自由不受拘束',tic:'駕戰車衝鋒、咧嘴挑釁、拍胸脯打包票'} },
  { id:'開膛手傑克-Berserker', cls:'Berserker', realName:'開膛手傑克', wars:['fake'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'氣息遮斷',r:'B',fx:'stealth'}],
    skills:[{n:'霧夜的殺戮',r:'B',fx:'zabaniya'},{n:'變化（散為霧）',r:'C',fx:'shapeshift'},{n:'情報抹消',r:'A',fx:'unreadable'}],
    traits:[{n:'人類'}], np:'解體聖母 Maria the Ripper（對人・心臟摘除）',
    align:'混沌・惡', persona:{firstP:'我們',look:'幼小赤裸・霧氣繚繞的詭譎孩童、天真與殺意交錯的空洞、自稱「我們」・童言複數問著殘忍',words:'孩童・空虛・渴求親情・霧',toMaster:'試探地索求溫柔，將溫柔待己之人視作至親般的依戀',speech:'稚嫩天真與冷酷殺意交錯、以「我們」複數自稱、童言童語問著殘忍的話',moe:'渴求親情而不得的悲傷孩子、天真與殘酷的巨大反差、被溫柔對待會怔住、霧中現身的詭譎',tic:'霧氣繚繞中現身、歪頭天真發問、扯住衣角'} },
  { id:'蒼白騎兵-Rider', cls:'Rider', realName:'蒼白騎兵（Pale Rider）', wars:['fake'], gender:'異',
    six:{筋力:'E',耐久:'A',敏捷:'B',魔力:'EX',幸運:'E',寶具:'A'},
    classSkills:[{n:'騎乘',r:'D',fx:'ride'}],
    skills:[{n:'感染（疫病擴散）',r:'A',fx:'petrify'},{n:'純真的世界（難以感知）',r:'EX',fx:'unreadable'},{n:'冥府的引導',r:'EX',fx:'territory'}],
    traits:[{n:'災厄'},{n:'疫病'}], np:'終末降臨 Doomsday Come（對界·以御主為起點的死之冥界結界）',
    align:'混沌・中庸', persona:{firstP:'…',look:'蒼白朦朧・若有似無的騎影、近乎無形的死亡氣息、自稱「…」・幾乎不言僅以瘟疫宣告存在',words:'瘟疫・死亡・無形・終末',toMaster:'無言依附御主之願、以其為冥界起點',speech:'幾乎不開口、存在感稀薄、偶以孩童般純真的破碎短語回應',moe:'人類對瘟疫與死亡之恐懼的具現、無辜與災厄並存的詭異、近乎無形卻無所不在、被當「夥伴」者得冥府祝福',tic:'蒼白騎影一閃即逝、無聲蔓延的寒疫、空洞的注視'} },
  { id:'狂信者哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（狂信者）', wars:['fake'], gender:'女',
    six:{筋力:'C',耐久:'B',敏捷:'A',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'A-',fx:'stealth'}],
    skills:[{n:'狂信',r:'A',fx:'clear_mind'},{n:'幻想血統',r:'',fx:'zabaniya'},{n:'自我改造',r:'A',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'幻想血統 Zabaniya（對人・對軍・再現十八位哈桑之奇蹟）',
    align:'秩序・善', persona:{firstP:'我',look:'黑長直・雙麻花辮・面具半遮的纖細刺客、斗篷裹身赤足而行、自稱「我」・宗教式肅穆的虔敬低語',words:'信仰・初代之名・十八奇蹟・殉道',toMaster:'虔敬奉獻、視契約為聖戰',speech:'虔敬低語、宗教式的肅穆、提及信仰時激越',moe:'黑長直雙麻花辮、粉紅瞳、面具半遮、赤足斗篷、為信仰殉道的純粹狂熱、再現十八哈桑的奇蹟',tic:'垂首誦念、撫過面具、赤足無聲而至'} },
  { id:'伊絲塔-Archer', cls:'Archer', realName:'伊絲塔', wars:['fake'], gender:'女',
    six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'A',幸運:'B',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'女神的神核',r:'A',fx:'divine_core'},{n:'魔力放出',r:'A',fx:'burst'}],
    traits:[{n:'神性'},{n:'女神'}], np:'天之公牛・山海熔毀的天牛 An Gugalanna（對軍 A+）',
    align:'混沌・善', persona:{firstP:'本小姐',look:'黑髮閃亮・借凜之身的金星女神、高傲任性傲嬌的氣燄、自稱「本小姐」・得意洋洋愛炫耀',words:'女神・任性・傲嬌・愛美愛閃亮',toMaster:'頤指氣使，意外講義氣',speech:'高傲任性、傲嬌口吻、愛炫耀、得意洋洋',moe:'金星女神的任性傲嬌、見閃亮寶物就走不動、嘴硬心軟的義氣、借了凜的身體卻嘴硬',tic:'叉腰仰頭、召喚天舟、哼一聲撇頭'} },
  // 客串英靈
  { id:'莫德雷德-Saber', cls:'Saber', realName:'莫德雷德', wars:['客串'], gender:'女',
    six:{筋力:'B+',耐久:'A',敏捷:'B',魔力:'B',幸運:'D',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'C',fx:'morale'}],
    traits:[{n:'龍'},{n:'騎士'}], np:'我的憤怒不會退去 Clarent Blood Arthur（對軍 A）',
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮馬尾・銀甲纏紅雷的反逆騎士、粗豪叛逆爭強好勝、自稱「我」・不服輸的粗豪挑釁口吻',words:'叛逆・倔強・渴求認同・反逆之騎',toMaster:'桀驁不馴，認可便死忠',speech:'粗豪叛逆、不服輸、稱亞瑟王「父親」、爭強好勝',moe:'外表狂傲內心渴求父親認同、不肯承認的少女心、死要面子、對「弒父叛逆」的執念與悔',tic:'掀面甲咆哮、紅雷纏劍、別過頭'} },
  { id:'迦爾納-Lancer', cls:'Lancer', realName:'迦爾納', wars:['客串'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'B',幸運:'D',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'魔力放出（炎）',r:'A',fx:'burst'},{n:'太陽之鎧',r:'A',fx:'divine_core'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'日輪啊化作鎧甲吧 Kavacha and Kundala（不滅黃金鎧）／穿刺死亡之槍 Vasavi Shakti（對神 EX·梵天弒神之槍）／梵天慈悲之槍 Brahmastra',
    align:'秩序・善', persona:{firstP:'我',look:'白髮金鎧・太陽之鎧加身的高潔英雄、極簡寡言不卑不亢的肅然、自稱「我」・直言不諱一諾千金',words:'施與者・寡言・高潔・恩怨分明',toMaster:'沉默守諾、恩怨分明，有求必應',speech:'極簡寡言、不卑不亢、直言不諱、一諾千金',moe:'有求必應的施捨英雄、面冷心熱、被誤解也不辯解的高潔、認真到不近人情卻最溫柔',tic:'默然佇立、卸甲相贈、平靜直視'} },
  { id:'阿斯托爾福-Rider', cls:'Rider', realName:'阿斯托爾福', wars:['客串'], gender:'男',
    six:{筋力:'D',耐久:'D',敏捷:'B',魔力:'C',幸運:'A+',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'怪力',r:'C',fx:'str_up'},{n:'純真無垢',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'觸發傳說的魔笛 La Black Luna／破卻一切的萬能福音 Casseur de Logistille（解除魔術·對人）／駿馬怪鳥 Hippogriff（神話之翼·飛翔）',
    align:'混沌・善', persona:{firstP:'我',look:'粉髮長辮・分不清性別的元氣騎士、蹦跳活潑毫無心機、自稱「我」・想到啥說啥的爛漫元氣',words:'天真爛漫・無憂・忠誠・元氣',toMaster:'活力滿滿，全心信賴',speech:'元氣滿滿、天真爛漫、想到啥說啥、毫無心機',moe:'十二勇士中最天真的開心果、記性差卻最忠誠、可愛到分不清性別、為朋友赴湯蹈火',tic:'蹦蹦跳跳、騎上駿鷹、燦爛大笑'} },
  { id:'賽彌拉米斯-Assassin', cls:'Assassin', realName:'賽彌拉米斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'A',寶具:'A+'},
    classSkills:[{n:'氣息遮斷',r:'C',fx:'stealth'}],
    skills:[{n:'陣地作成（空中庭園）',r:'EX',fx:'territory'},{n:'道具作成（毒）',r:'A',fx:'crafting'}],
    traits:[{n:'神性'},{n:'人類'}], np:'虛榮的空中庭園 Hanging Gardens of Babylon（對界 EX·浮空要塞·毒殺結界）',
    align:'混沌・惡', persona:{firstP:'妾',look:'華貴盛裝・君臨空中庭園的毒后、高貴威嚴不容違逆的女王氣度、自稱「妾」・女王口吻不容忤逆',words:'毒后・傲慢・貞潔的執念・空中庭園',toMaster:'高高在上，唯認可強主',speech:'高貴威嚴、女王口吻、自稱妾、不容違逆',moe:'史上首位毒殺者女王的傲然、對貞潔與真愛的執念、被冒犯時的羞怒、君臨天下的孤高',tic:'俯瞰眾生、抬手降毒、空中庭園浮現'} },
  { id:'尼祿-Saber', cls:'Saber', realName:'尼祿·克勞狄烏斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'D',敏捷:'A',魔力:'B',幸運:'A',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'頭痛宿疾',r:'B',fx:''},{n:'皇帝特權',r:'EX',fx:'survive'},{n:'縱使三度迎來落日',r:'A',fx:'survive'},{n:'領袖氣質（皇帝特權借得）',r:'A',fx:'morale'}],
    traits:[{n:'王'},{n:'人類'}], np:'燃燒吧、世界的盡頭 Aestus Domus Aurea（對軍・黃金劇場）',
    align:'混沌・善', persona:{firstP:'余',look:'金髮綠瞳・紅薔薇綻放的華美皇帝、張揚自信滿溢的熱情、自稱「余」・滿口藝術張揚自信',words:'暴君・自戀・藝術・天真爛漫',toMaster:'熱情張揚，渴望被讚美',speech:'張揚熱情、自稱余、滿口藝術、自信滿溢、愛唱歌',moe:'暴君之名下的純真自戀、對自身美貌與才藝的迷之自信、渴望被愛被讚美、其實非常努力',tic:'振臂高歌、紅薔薇綻放、得意揚眉'} },
  { id:'玉藻前-Caster', cls:'Caster', realName:'玉藻前', wars:['客串'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A',幸運:'A',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'B',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'變化',r:'A',fx:'shapeshift'},{n:'狐之治癒',r:'A',fx:'rune'}],
    traits:[{n:'神性'},{n:'野獸'}], np:'水天日光天照八野鎮（治癒結界）／八純之鎖',
    align:'混沌・中庸', persona:{firstP:'妾身',look:'金髮狐耳・和服盛裝的九尾賢妻、甜膩撒嬌裹著腹黑的氣息、自稱「妾身」・賢妻口吻甜膩撒嬌',words:'賢妻・腹黑・愛吐槽・狐狸',toMaster:'撒嬌又掌控，黏人',speech:'甜膩撒嬌、賢妻口吻、暗藏腹黑、毒舌吐槽裹著糖衣',moe:'賢妻外皮下的腹黑掌控慾、九尾狐的撒嬌黏人、吐槽精準狠辣、為愛奉獻的執著',tic:'狐耳輕顫、掩嘴輕笑、鏡前理妝'} },
  { id:'牛若丸-Rider', cls:'Rider', realName:'源義經（牛若丸）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'D',敏捷:'A',魔力:'D',幸運:'C',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'D',fx:'divine'},{n:'天狗之兵法',r:'B',fx:'first_strike'},{n:'牛若之武略',r:'B',fx:'tactics'}],
    traits:[{n:'人類'}], np:'壇之浦・八艘飛（對人・神速跳躍）',
    align:'混沌・中庸', persona:{firstP:'牛若',look:'黑髮武裝・嬌小靈動的武家少女、純真赤誠的武者英氣、自稱「牛若」・赤誠語氣純真直率',words:'悲劇武者・純真・崇拜兄長・赤誠',toMaster:'純粹追隨，赤誠相待',speech:'純真赤誠、武家少女、自稱牛若、崇拜地談起兄長',moe:'悲劇宿命下的純真、對兄長賴朝近乎信仰的崇拜（卻被其所害）、天真爛漫的武勇、赤子之心',tic:'八艘飛躍、雙眸發亮、抱膝談兄長'} },
  { id:'貞德-Ruler', cls:'Ruler', realName:'貞德', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'A',魔力:'A',幸運:'C',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'真名看破',r:'A',fx:'analyze'}],
    skills:[{n:'啟示',r:'A',fx:'first_strike'},{n:'守護的旗幟',r:'B',fx:'survive'},{n:'領袖氣質',r:'B',fx:'morale'}],
    traits:[{n:'人類'}], np:'吾主在此 Luminosité Eternelle（守護結界）／紅蓮聖女 La Pucelle',
    align:'秩序・善', persona:{firstP:'我',look:'金髮持旗・銀甲聖潔的奧爾良聖女、溫柔堅定的信仰氣度、自稱「我」・語氣溫柔循循善誘',words:'聖女・堅毅・溫柔的信念・無私',toMaster:'溫柔守護，循循善誘',speech:'溫柔堅定、信仰之言、循循善誘、無私包容',moe:'聖女的堅毅與少女的羞澀、不恨將自己處刑之人的寬容、認真到固執的信念、其實很平凡的願望',tic:'按旗祈禱、溫柔微笑、堅定直視'} },
  { id:'美遊-Saber', cls:'Saber', realName:'美遊·埃德費爾特（Saber install）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'B',fx:'burst'},{n:'沉著冷靜',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'誓約勝利之劍 Excalibur（對界 A++）',
    align:'秩序・善', persona:{firstP:'我',look:'黑髮藍裙・Saber 之力的內斂少女、寡言守禮認真守護的沉靜、自稱「我」・寡言低語守禮認真',words:'寡言・認真・溫柔內斂・背負宿命',toMaster:'認真盡責，沉默守護',speech:'寡言內斂、認真守禮、溫柔低語、不擅表達',moe:'聖杯之子的孤獨宿命、被兄長守護的依賴、認真過頭的笨拙、內斂的溫柔',tic:'沉默佇立、握劍守護、垂眸淺應'} },
  { id:'小黑-Archer', cls:'Archer', realName:'克洛伊·馮·愛因茲貝倫（Archer install）', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'C',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'投影魔術',r:'B',fx:'projection'},{n:'千里眼',r:'C',fx:'aim'},{n:'無限劍製',r:'C',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works／干將・莫邪（雙劍亂舞）',
    align:'混沌・中庸', persona:{firstP:'本小姐',look:'褐膚白髮・Archer 之力的活潑少女、促狹好戰的腹黑氣燄、自稱「本小姐」・促狹挑釁愛逗弄',words:'腹黑・愛捉弄・直率好戰・撒嬌',toMaster:'又黏又愛逗弄，戰意旺盛',speech:'促狹捉弄、直率好戰、撒嬌耍賴、得意挑釁',moe:'愛捉弄人的腹黑、黏人又傲嬌、戰鬥狂的興奮、其實很重感情',tic:'勾肩貼近、雙劍交叉、吐舌挑釁'} },
  { id:'伊莉雅-Caster', cls:'Caster', realName:'伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'B',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'},{n:'道具作成（魔杖・露比）',r:'C',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'魔力放出',r:'B',fx:'burst'},{n:'純真無垢',r:'A',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'全彈發射・魔力炮 Quintett Feuer（多重魔力炮擊）',
    align:'中立・善', persona:{firstP:'我',look:'白髮紅瞳・魔杖在手的魔法少女、活潑元氣善良直率的朝氣、自稱「我」・語氣天真元氣滿滿',words:'天真活潑・善良・愛哭卻勇敢・魔法少女',toMaster:'純真信賴，朝氣蓬勃',speech:'活潑天真、元氣滿滿、善良直率、偶爾愛哭',moe:'魔法少女的天真爛漫、愛哭卻在關鍵時刻勇敢、對家人朋友的善良、變身咒語的中二',tic:'魔杖一揮、燦笑、眼眶泛淚還硬撐'} }
];

// 御主 persona 為 4 段頓號（日常表象・真實內裡・喜歡・厭惡）供 TRAIT/PREF 解析；
// back＝身世生平（show-don't-tell 的演出依據）、moe＝反差萌點。
var SEED_MASTERS = [
  // 第五次
  {id:'衛宮士郎-5th',  name:'衛宮士郎', gender:'男', appearance:'紅褐短髮的高中生，樸素襯衫',   war:'5th', magic:'投影／強化',          circuits:30, melee:'D', magic_rank:'D', home:'冬木·深山町', wish:'成為正義的伙伴',          persona:'樂於助人的好好先生・扭曲的自我犧牲・喜歡修繕器物與做家事・厭惡見死不救', back:'冬木大火唯一倖存的孤兒，被衛宮切嗣收養，繼承「成為正義夥伴」這份扭曲而炙熱的理想', moe:'自己滿身傷還先擔心別人、家事與修機械異常拿手、嘴硬的逞強、認真到笨拙'},
  {id:'遠坂凜-5th',    name:'遠坂凜', gender:'女', appearance:'黑長雙馬尾、紅衣黑裙，傲然',     war:'5th', magic:'寶石魔術',            circuits:45, melee:'C', magic_rank:'A', home:'遠坂宅',     wish:'見證聖杯・不負遠坂之名',  persona:'人前完美的優等生・刀子嘴豆腐心・喜歡可愛小物與紅茶・厭惡示弱與失態', back:'冬木名門遠坂家次女，父親時臣死於上屆聖杯戰爭，背負遠坂的驕傲與正統魔術師之道', moe:'人前完美人後迷糊、傲嬌到極致、其實很怕寂寞、偷偷存錢買可愛小物還嘴硬'},
  {id:'間桐慎二-5th',  name:'間桐慎二', gender:'男', appearance:'藍髮神經質青年，刻薄表情',   war:'5th', magic:'魔術迴路微弱・依賴從者', circuits:15, melee:'E', magic_rank:'E', home:'間桐宅',     wish:'被認可・奪取勝利',        persona:'自信張揚的表象・自卑虛榮・喜歡被吹捧與掌控感・厭惡比自己強的人', back:'間桐家養子，魔術迴路微弱不被家族認可，活在妹妹櫻與名門陰影下的扭曲少年', moe:'色厲內荏一戳就破、虛張聲勢的可悲、偶爾流露的脆弱、其實渴望被認可'},
  {id:'間桐臟硯-5th',  name:'間桐臟硯', gender:'男', appearance:'乾癟矮小的千年老人，蟲蝕枯槁之軀', war:'5th', magic:'間桐之蟲術・吸血蟲・延命', circuits:40, melee:'E', magic_rank:'A', home:'間桐宅',     wish:'到達根源・逃脫死亡（不老不死）', persona:'乾癟陰沉的老謀深算・對活下去的病態執著・喜歡操弄與蟲蝕・厭惡死亡與軟弱', back:'活了五百年的間桐家始祖（本名佐爾根），以蟲術苟延殘喘、視子孫為延命容器，為奪聖杯不擇手段', moe:'千年老者的執念與算計、視人命如棋子的冷酷、對「活下去」的病態渴求、陰森的耐性'},
  {id:'葛木宗一郎-5th',name:'葛木宗一郎', gender:'男', appearance:'戴眼鏡的沉默教師，黑西裝', war:'5th', magic:'體術（蛇之拳）・無魔術', circuits:10, melee:'A', magic_rank:'E', home:'柳洞寺',     wish:'無所求・守護所重視之人',     persona:'沉默盡責的教師・別無所求的絕對忠誠・喜歡平靜的日常・厭惡虛偽的言辭', back:'本是無名殺手，隱姓埋名成為高中教師，因其從者而第一次有了「想守護之物」', moe:'面無表情卻絕對守諾、對並肩從者笨拙而深沉的情意、蛇之拳的致命反差、不懂浪漫卻最深情'},
  {id:'言峰綺禮-5th',  name:'言峰綺禮', gender:'男', appearance:'高大神父、黑色法衣，陰沉',   war:'5th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'尋得能讓自己喜悅之物',    persona:'虔誠神父的假面・以他人痛苦為樂的空虛・喜歡探究何為喜悅・厭惡平庸的善', back:'生來只能在他人不幸中感到喜悅的神父，壓抑天性數十年，終在某位高傲英靈的慫恿下坦然墮落', moe:'麻婆豆腐的意外執著、對自身惡的坦誠到近乎天真、扭曲卻誠實、與某位高傲英靈的孽緣損友默契'},
  {id:'伊莉雅絲菲爾-5th',name:'伊莉雅絲菲爾', gender:'女', appearance:'紅眼白髮的幼小少女，毛領大衣',war:'5th',magic:'愛因茲貝倫煉金術・聖杯依代',    circuits:80, melee:'D', magic_rank:'A', home:'冬木·新都', wish:'完成聖杯的使命',          persona:'天真爛漫的少女・哀傷的聖杯依代・喜歡士郎與雪・厭惡孤獨', back:'愛因茲貝倫煉金術製造的人造人、第三魔法的聖杯之器，被當作工具養大卻渴望親情', moe:'天真與哀傷並存、把士郎當哥哥的執著、人造人的純真、強顏歡笑的寂寞'},
  {id:'間桐櫻(黑化)-5th',name:'間桐櫻（黑化）', gender:'女', appearance:'黑長髮、黑紅禮服，妖異而空洞的笑',war:'5th',magic:'聖杯之泥・無限魔力・蟲爪', circuits:90, melee:'E', magic_rank:'A', home:'間桐宅', wish:'獨佔所愛、將傷害自己的世界一同拖入黑暗', persona:'溫順乖巧的假面・被黑泥吞噬的佔有・渴望獨佔所愛・厭惡傷害過自己的一切', back:'遠坂家次女，自幼被送養給間桐家承受蟲蝕之苦十一年，長期壓抑終被聖杯黑泥侵蝕黑化', moe:'純愛扭曲成毀滅性佔有的反差、乖巧外表下的瘋狂、對姊姊與學長的複雜執念、可憐又可怖'},
  // 第四次
  {id:'衛宮切嗣-4th',  name:'衛宮切嗣', gender:'男', appearance:'黑髮疲憊的男人，風衣',   war:'4th', magic:'起源彈・固有時制御',    circuits:35, melee:'A', magic_rank:'B', home:'冬木·深山町', wish:'以聖杯拯救世界、終結戰爭',persona:'冷酷疲憊的魔術師殺手・為大義不擇手段・喜歡（曾經）平凡的幸福・厭惡無謂的犧牲', back:'信奉「拯救多數而犧牲少數」的魔術師殺手，為終結一切戰爭而尋求聖杯，背負「拯救多數犧牲少數」的沉重覺悟參戰', moe:'冷酷算計下對家人的溫柔、理想與手段的痛苦矛盾、抽菸沉思的疲憊、其實最痛恨殺戮'},
  {id:'遠坂時臣-4th',  name:'遠坂時臣', gender:'男', appearance:'金棕髮的優雅紳士，名門做派',   war:'4th', magic:'寶石魔術',            circuits:50, melee:'D', magic_rank:'A', home:'遠坂宅',     wish:'抵達「根源之渦」',        persona:'優雅從容的名門紳士・抵達根源的執念・喜歡藝術與秩序・厭惡粗鄙與失格', back:'遠坂家當主，畢生追求「根源之渦」的正統魔術師，以名門的驕傲與正統之道召喚出最契合自身正統的英靈參戰', moe:'過度講究的優雅做派、對美學與禮儀的執著、名門的迂腐可愛、教科書般的魔術師'},
  {id:'肯尼斯-4th',    name:'肯尼斯', gender:'男', appearance:'金髮高傲的年輕教授',     war:'4th', magic:'礦石科・流體操作',      circuits:50, melee:'C', magic_rank:'A', home:'冬木·新都', wish:'榮譽與學術成就',          persona:'高傲的天才教授・極高的自尊・喜歡學術與名譽・厭惡被輕視', back:'時鐘塔礦石科年輕天才講師，攜未婚妻索菈參戰，自視甚高、絕不容許在這場戰爭裡蒙受任何屈辱', moe:'天才的傲慢與脆弱自尊、對未婚妻意外的深情、被打臉時的崩潰、學究的一板一眼'},
  {id:'韋伯·維爾維特-4th',name:'韋伯·維爾維特', gender:'男', appearance:'黑髮瘦小的少年魔術師',war:'4th',magic:'自我暗示・基礎魔術', circuits:25, melee:'E', magic_rank:'C', home:'冬木·新都', wish:'證明自己的價值',          persona:'故作老成的少年・自卑卻好強・喜歡證明自己・厭惡被當作無能', back:'出身平凡的時鐘塔末席學生，為證明「才能非血統決定」偷走觸媒召喚出與自己羈絆深厚的英靈，一路成長', moe:'嘴硬的自卑少年、被並肩的從者一路磨礪帶著成長、口嫌體正直、偷偷崇拜那位豪邁的英靈'},
  {id:'雨生龍之介-4th',name:'雨生龍之介', gender:'男', appearance:'輕浮的金髮青年，咧嘴而笑', war:'4th', magic:'無魔術・召喚術（外行）', circuits:10, melee:'C', magic_rank:'E', home:'冬木·新都', wish:'見識更有趣的事物・召喚惡魔',persona:'輕浮開朗的青年・天生純粹之惡・喜歡有趣與新鮮的死亡・厭惡無聊', back:'毫無魔術素養卻天生純粹的殺人狂，誤打誤撞召喚出與自己瘋狂共鳴的英靈，把殺戮當成有趣的遊戲', moe:'開朗笑容下的純粹瘋狂、對「有趣」孩子般的好奇、與其從者的瘋狂默契、毫無惡意的惡'},
  {id:'言峰綺禮-4th',  name:'言峰綺禮', gender:'男', appearance:'尚未墮落的青年神父，壓抑',   war:'4th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'探求自身空虛的答案',      persona:'壓抑的青年神父・尚未墮落的空虛・執著探求自身的答案・厭惡虛假的自己', back:'尚未墮落的代行者神父，奉命輔佐家世顯赫的盟友魔術師，卻在追問「自身為何空虛」中逐步走向深淵', moe:'壓抑天性的痛苦掙扎、對自身空虛的執著探求、未墮落前的克制、宿命般走向黑暗'},
  {id:'間桐雁夜-4th',  name:'間桐雁夜', gender:'男', appearance:'蟲蝕半白頭髮的憔悴男子',   war:'4th', magic:'間桐之蟲術',          circuits:15, melee:'D', magic_rank:'C', home:'間桐宅',     wish:'從間桐手中救出櫻',        persona:'憔悴的悲憤男子・自我犧牲的執念・只為救出櫻・厭惡間桐家', back:'捨棄魔術逃離間桐家的男人，為救受蟲蝕之苦的櫻，重回家門植入蟲術、賭上性命參戰', moe:'憔悴外表下對櫻純粹的守護（叔父般的疼惜·非生父）、明知必死仍奮不顧身、被蟲蝕的痛苦、悲劇的溫柔'}
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
var CODEX_PERSONA_VER = 'v20'; // v20：新增 赫拉克勒斯-Archer(偽聖杯正確版本)＋修正 Berserker np(拿掉狂化下用不到的射殺百頭)

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
    if (s) { var row = servantToHeroRow_(s); hero.getRange(i + 1, 1, 1, row.length).setValues([row]); n++; }
  }
  // 🆕 補入「種子有、英靈殿還沒有」的新英靈(新增從者後不必清表即生效；冪等：下次已存在就不重加)
  var toAdd = SEED_SERVANTS.filter(function (s) { return !existing[s.id]; });
  if (toAdd.length) {
    var addRows = toAdd.map(servantToHeroRow_);
    hero.getRange(hero.getLastRow() + 1, 1, addRows.length, addRows[0].length).setValues(addRows);
    n += addRows.length;
  }
  // 🧹 淘汰名單：種子改名/汰換後，精準刪掉指定的舊種子列(只刪 hard-code 的已知舊 ID，
  //    絕不碰 AI 原創從者——英靈殿也存 recordOriginalHero_ 寫回的原創)。由下往上刪避免位移。
  var OBSOLETE_HERO_IDS = { '把臂之哈桑-Assassin': 1, '靜謐的哈桑-Assassin': 1 };
  for (var j = d.length - 1; j >= 1; j--) {
    if (OBSOLETE_HERO_IDS[String(d[j][COL.HERO.ID])]) { hero.deleteRow(j + 1); n++; }
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
  var existing = {};
  var n = 0;
  for (var i = 1; i < d.length; i++) {
    existing[String(d[i][COL.MASTER.ID])] = true;
    var m = byId[String(d[i][COL.MASTER.ID])];
    if (!m) continue;
    msh.getRange(i + 1, COL.MASTER.PERSONA + 1).setValue(m.persona);
    msh.getRange(i + 1, COL.MASTER.BACK + 1).setValue(m.back || '');
    msh.getRange(i + 1, COL.MASTER.MOE + 1).setValue(m.moe || '');
    n++;
  }
  // 🆕 補入「種子有、御主殿還沒有」的新御主(新增御主後不必清表即生效)
  var toAdd = SEED_MASTERS.filter(function (m) { return !existing[m.id]; });
  if (toAdd.length) {
    var addRows = toAdd.map(masterToCodexRow_);
    msh.getRange(msh.getLastRow() + 1, 1, addRows.length, addRows[0].length).setValues(addRows);
    n += addRows.length;
  }
  return n;
}

// 🔄 重刷「已召喚實體化」從者的【戰鬥數據】(寶具/六圍/標籤 fx)為最新種子值——種子改了，已在場的從者也跟上。
//   依 (真名, 職階) 對應種子(斯卡哈 Lancer/Assassin 同名靠職階區分)。只刷 GAS 掌的數值欄；
//   ⚠ 不動 HP/MP/MEMORY(出力·魔境選擇·令咒…)/敘事欄(特徵/個性/身世)/狀態/位置/羈絆，保住玩家實例狀態與逆天改命。
//   查無種子(AI 原創從者)→ 跳過不動。冪等可重跑。
function resyncSummonedServants_(ss) {
  var pc = ss.getSheetByName('眾生');
  if (!pc || pc.getLastRow() <= 1) return 0;
  var data = pc.getDataRange().getValues();
  var key = function (name, cls) { return String(name) + '｜' + String(cls); };
  var byKey = {};
  SEED_SERVANTS.forEach(function (s) { byKey[key(s.realName, s.cls)] = s; });
  var n = 0;
  for (var i = 1; i < data.length; i++) {
    var fac = String(data[i][COL.PC.FACTION]);
    if (fac !== '從者' && fac !== '敵從者') continue;   // 玩家從者＋敵從者都刷(都讀種子戰鬥數據)
    if (String(data[i][COL.PC.ID]).indexOf('DEAD_') === 0) continue;
    var s = byKey[key(data[i][COL.PC.NAME], data[i][COL.PC.RANK])];
    if (!s) continue; // AI 原創從者無種子 → 不動
    data[i][COL.PC.MARTIAL] = s.np || data[i][COL.PC.MARTIAL];
    data[i][COL.PC.SIX] = JSON.stringify(s.six);
    data[i][COL.PC.TAGS] = JSON.stringify({ skills: (s.classSkills || []).concat(s.skills || []), traits: s.traits || [] });
    n++;
  }
  if (n) pc.getRange(1, 1, data.length, data[0].length).setValues(data);
  return n;
}

// 🔄【手動·強制】無視版本旗標，立刻把英靈殿＋在場從者重刷成最新種子(套用最新寶具/六圍/標籤/平衡)。
//   給前端 DEV 按鈕用——不靠自動版本閘(怕部署時序/旗標卡住)，按一下立即生效並回報筆數。
function actionDevResyncCodex(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var codexN = 0, svN = 0, errs = [];
  try { codexN = upgradeCodexPersonas_(ss); } catch (e) { errs.push('英靈殿:' + e.message); }
  try { svN = resyncSummonedServants_(ss); } catch (e) { errs.push('從者:' + e.message); }
  try { PropertiesService.getScriptProperties().setProperty('codex_persona_ver', CODEX_PERSONA_VER); } catch (e) { }
  return JSON.stringify({
    success: true,
    message: '🔄 已強制套用最新種子：英靈殿 ' + codexN + ' 筆、在場從者 ' + svN + ' 筆更新。'
      + (errs.length ? '　⚠ ' + errs.join('；') : '　請重整頁面看最新寶具/標籤。')
  });
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
      upgradeCodexPersonas_(ss);   // 刷英靈殿(召喚來源)
      upgradeMasterCodex_(ss);
      resyncSummonedServants_(ss); // 刷已在場從者的戰鬥數據(寶具/六圍/標籤)
      props.setProperty('codex_persona_ver', CODEX_PERSONA_VER);
    }
  } catch (e) { }
}

// 可從編輯器手動執行
function seedFateCodex() {
  seedFateCodex_();
  return '英靈殿 ' + SEED_SERVANTS.length + ' 騎、御主殿 ' + SEED_MASTERS.length + ' 名（若原本為空才寫入）。';
}
