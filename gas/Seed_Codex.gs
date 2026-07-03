// ==========================================
// 🔵 Seed_Codex.gs — 英靈殿(從者範本) + 御主殿 名冊種子（逐字移植自 FATE）
// seedFateCodex_(ss)：英靈殿/御主殿 為空時自動灌入；ensureFateSheets_ 末尾呼叫。
// ==========================================

var SEED_SERVANTS = [
  // 第五次
  { id:'阿爾托莉雅-Saber', cls:'Saber', realName:'阿爾托莉雅·潘德拉貢', wars:['4th','5th'], gender:'女',
    // ⚠ 2026-07 修：筋力原B——其餘五圍對齊「凜當御主」的高階官方參數(A/A+/A++)，唯獨筋力停在「士郎當御主」
    //   的弱版官方參數，兩條參數表混用；補齊為A使整組數值對齊同一條參數線。
    six:{筋力:'A',耐久:'B',敏捷:'B',魔力:'A',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'B',fx:'morale'},
            {n:'風王鐵鎚',r:'A',fx:'wind_strike'},{n:'誓約勝利之劍',r:'A++',fx:'excalibur'}],
    traits:[{n:'王'},{n:'人類'},{n:'龍'}], np:'誓約勝利之劍 Excalibur（對城 A++·聚攏這片星球記憶中的光·凝於劍尖·解放為撕裂大地、直貫蒼穹的金色收束光炮）／全世界遙遠的理想鄉 Avalon（永世隔絕·無敵結界·守護持有者）',
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
    // ⚠ 2026-07 修：女神的神核 原漏填階級(空字串)——rankVal()保底吃E階，減傷只剩~6%形同虛設(全種子庫其餘4個
    //   divine_core 持有者皆填A/B/A/A明確階級)。補D階：對照 神性C的阿基里斯配B、神性A的伊絲塔/斯卡蒂配A，
    //   美杜莎神性E-(全種子庫最弱神格·被詛咒的墮落半神)理應是最弱一檔，D階給她一點真實但微弱的神核防護。
    //   魔眼(petrify)原A→A+：官方稱「寶石級」魔眼、凌駕金等死徒眼，多筆來源一致給A+。
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'女神的神核',r:'D',fx:'divine_core'},{n:'魔眼',r:'A+',fx:'petrify'}],
    traits:[{n:'神性',r:'E-'},{n:'女神'}], np:'他者封印·鮮血神殿 Blood Fort Andromeda（對軍·結界）／騎英之手綱 Bellerophon（對軍 A+·喚出神駿天馬珀伽索斯·踏虛凌空·振翅撕裂長空、化作一往無前的純白光矢突刺）',
    align:'混沌・善', persona:{firstP:'我',look:'紫長髮・深紫裹紗長裙・眼鏡封印魔眼的修長女子、寡言低斂的幽靜氣息、自稱「我」・語氣壓得很低',words:'忠誠・守護・自卑・深藏的溫柔',toMaster:'寡言而深情、極度護主',speech:'寡言低沉、必要才開口、護主時毫不猶豫',moe:'怪力女神卻極度自卑、靠眼鏡壓制魔眼的反差、對御主近乎獻身的忠誠、姊姊般的包容',tic:'推眼鏡、靜默佇立暗處、垂眸'} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A++',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'},{n:'金羊毛 Argon Coin',r:'EX',fx:'golden_fleece'}],
    traits:[{n:'人類'}], np:'萬符必應破戒 Rule Breaker（規則破壞者 C）',
    align:'中立・惡', persona:{firstP:'我',look:'紫袍兜帽・抱緣紅短劍的清麗魔女、溫婉中帶試探的疏離、自稱「我」・用敬語',words:'背叛的傷痕・渴望被信任・腹黑・少女心',toMaster:'防備卻渴望真心相待',speech:'溫婉中帶試探、用敬語、自嘲被背叛的過往、偶爾流露脆弱',moe:'魔女外表下渴望被愛、被真心對待會慌、為所愛之人不擇手段、反差的純情',tic:'抱著緣紅短劍、垂眸輕笑、欲言又止'} },
  // ⚠ 2026-07 修：幸運原E→A——幸運A卻仍死於決鬥，是他角色最出名的反差設定，寫成E完全反了。
  //   寶具原E→'-'：官方對燕返本就不給明確階級(是被硬拗成寶具級的凡人絕技，這正是他被Caster破格召喚的關鍵)，
  //   寫死E會矮化這個設定巧思；'-'比照本表tsubame技能已用的慣例(下方skills)，rankVal()仍會保底吃E階運算、
  //   數值行為不變，只是誠實標記「無明確階級」。
  { id:'佐佐木小次郎-Assassin', cls:'Assassin', realName:'佐佐木小次郎', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'E',敏捷:'A+',魔力:'E',幸運:'A',寶具:'-'},
    classSkills:[{n:'氣息遮斷',r:'D',fx:'stealth'}],
    skills:[{n:'心眼（偽）',r:'A',fx:'analyze'},{n:'透化',r:'B+',fx:'clear_mind'},
            {n:'宗和的心得',r:'B',fx:'unreadable'},{n:'秘劍・燕返',r:'-',fx:'tsubame'}],
    traits:[{n:'人類'}], np:'燕返 Tsubame Gaeshi（對人魔劍・次元摺疊・三段同時斬）',
    align:'中立・中庸', persona:{firstP:'拙者',look:'墨髮長刀・素樸和裝的清瘦劍客、淡泊洒脫的禪意閒適、自稱「拙者」・古風文雅',words:'劍士・閒適・無欲・宿命',toMaster:'隨遇而安、只求一戰',speech:'慢條斯理、偶帶禪意',moe:'無欲無求的洒脫、只為一場好決鬥而活、看守山門的隨遇而安、非英雄卻有英雄氣的平凡',tic:'凝望飛燕、按刀靜立、微微一笑'} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A+',耐久:'A',敏捷:'A',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'D',fx:'nullify_magic'}],
    // ⚠ 2026-07 修：拔戰鬥續行(survive)——fateStrike_ 判定順序 survive 先於 god_hand，
    //   只要致命傷前 hp>1 就先被 survive 免費接住(after 不再<=0)、十二試煉的燒命判定永遠輪不到，
    //   跟「十二條命、每次瀕死真的燒一命」的設計初衷矛盾(Avenger版拔十二試煉時才保留戰鬥續行，兩者本應互斥擇一)。
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    // ⚠ 2026-07 修：拔「王」trait——赫拉克勒斯終身未曾稱王(神話裡他是為贖罪替歐律斯透斯王打工的英雄，非君王)；
    //   十二試煉NP自身官方階級是B(六圍寶具欄仍是A沒錯，B是God Hand這把寶具本身的階級數字)。
    traits:[{n:'神性',r:'A'}], np:'十二試煉 God Hand（B·十二條命）',
    // ⚠ 原作設定：射殺百頭 Nine Lives 是狂化壓制下【無法使用】的寶具(福瓦基體系被Berserker職階鎖住，僅原典/FGO非狂化狀態可用)，
    //   已從這版拿掉、移給下方 赫拉克勒斯-Avenger(偽聖杯·阿爾喀德斯)。這版狂化下就只有 God Hand。
    align:'混沌・狂', persona:{firstP:'（狂化·僅咆哮）',look:'巨軀岩肌・黑霧纏身的半神戰士、無言低吼的壓迫氣場、狂化無自稱・僅以咆哮',words:'戰神・狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',speech:'狂化無法言語、只以低吼與行動表達；唯護主的本能殘留',moe:'狂暴外殼下對御主殘存的溫柔、偶爾理智回光的瞬間、十二試煉一次次自死亡歸來的悲壯',tic:'低沉咆哮、以巨軀擋在主人身前、緩緩起身'} },
  { id:'赫拉克勒斯-Avenger', cls:'Avenger', realName:'阿爾喀德斯（赫拉克勒斯）', wars:['fake'], gender:'男',
    six:{筋力:'A',耐久:'B',敏捷:'A',魔力:'A',幸運:'B',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'復仇者',r:'A',fx:'god_slay'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'勇猛',r:'E',fx:'morale'},{n:'戰鬥續行',r:'A+',fx:'survive'}],
    traits:[{n:'英雄'}], np:'射殺百頭 Nine Lives（對軍 A+·九連射·纏繞海德拉毒龍·乃至攻城之勢）／十二榮光 King\'s Order（A++·十二功業寶具群：神獸之裘否定人造兵器·怪鳥之箭·戰神軍帶）／天風的篡奪者 Reincarnation Pandora（EX·篡奪敵寶具）',
    // ⚠ 2026-07 修：align原「混沌・善」——原作明寫他被聖杯泥+令咒逼著從「中立・善」歪曲扭轉成「混沌・惡」，
    //   這是他淪為復仇者的關鍵設定，標善會抹掉這層悲劇轉折。
    align:'混沌・惡', persona:{firstP:'我',look:'膚色黝黑的高大戰士(逾兩公尺)、精悍健美而非虯結、古希臘裙袍配綁帶戰靴、頭覆獅皮長布、沉靜莊嚴的威儀、自稱「我」',words:'復仇・對神之恨・高潔・十二功業',toMaster:'待人沉穩有禮、絕不坐視無辜受難；然主若危及世界安定，不惜背弒主之名將其斬殺',speech:'談及神明時恨意森冷、對無辜者卻溫和有度',moe:'高潔英雄與噬神復仇者並存的矛盾、對幼子與無辜者的絕對守護、被令咒歪曲扭成復仇者的悲愴、捨神性不死性只為復仇的執念、獅皮下難掩的孤高',tic:'撫過肩頭的獅皮長布、搭箭前的一瞬靜默、提及諸神時眸色轉冷'} },
  // 第四次
  // ⚠ 2026-07 修：對魔力/單獨行動 原E/A+其實是「被聖杯泥養到第五次聖杯戰爭」後的數值——entry標wars含4th，
  //   第四次(冬木·凜之父當御主前)官方數值是對魔力C／單獨行動A，兩次戰爭的數值被錯放混用；領袖氣質A→A+對齊官方。
  { id:'吉爾伽美什-Archer', cls:'Archer', realName:'吉爾伽美什', wars:['4th','fake'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'領袖氣質',r:'A+',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'},{n:'全知全能之星 Sha Naqba Imuru',r:'EX',fx:'insight'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）／乖離劍 Ea（天地乖離·封藏的至高兵裝，傲慢時不出鞘）',
    align:'混沌・善', persona:{firstP:'吾',look:'金髮赤瞳・金鎧加身的俊美王者、睥睨眾生的慵懶威壓、自稱「吾」・睥睨自矜的王者腔',words:'傲慢・王・俯視眾生・收藏家',toMaster:'視為雜種、幾乎不從令，唯對少數有趣之人起興致',speech:'居高臨下、稱人「雜種」、慵懶而帶威壓、偶爾興味盎然',moe:'唯一承認的友人（恩奇都）、對「有趣」之物異常執著、品酒品人的講究、傲慢底下的孤獨',tic:'金色波紋中抽出寶具、嗤笑、紅瞳微眯'} },
  // ⚠ 2026-07 修：對魔力原C→B(官方「B階可擋三節詠唱以下」的常引細節)；愛之痣原B→C(官方「愛の黒子C」)；
  //   「戰鬥續行」查無此技能歸他所有，他真正的第二技能是心眼(真)B(危險預知/迴避判斷)，已替換。
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A+',魔力:'D',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'愛之痣',r:'C',fx:'lovespot'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'anti_magic_lance'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{firstP:'我',look:'墨綠髮・面有愛之痣的俊美騎士、謙恭正直的武人風骨、自稱「我」・謙恭有禮',words:'忠義・騎士・哀愁・宿命的女難',toMaster:'絕對忠誠，渴望堂堂正正之戰',speech:'謙恭有禮、武人正直、壓抑情感、自責時沉聲',moe:'臉上愛之痣令女性傾心的悲劇宿命、對主君的死忠、渴望光明磊落決鬥卻屢遭背叛、溫柔到自我犧牲',tic:'雙槍交握行禮、垂眸掩去面痣、沉聲立誓'} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾（征服王）', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'D',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // ⚠ 2026-07 補：官方參數表明列神性C(源於「宙斯之子」的傳說地位)，原漏收此技能。
    skills:[{n:'領袖氣質',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'神性',r:'C',fx:'divine'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX·固有結界召喚萬軍）／神威的車輪 Gordius Wheel（雷神戰車·衝鋒）',
    align:'中立・善', persona:{firstP:'余',look:'紅髮虬髯・魁梧壯碩、披風加身的征服王、豪邁爽朗的王者雅量、自稱「余」・氣口恢弘如雷',words:'豪邁・征服・雅量・王道',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',speech:'豪爽大笑、稱「小鬼」、王者氣度、好酒好戰、講大道理',moe:'征服世界的野心與孩子氣並存、愛酒愛地圖、把御主當孩子般栽培（不分男女）',tic:'仰天大笑、攤開世界地圖、灌下整桶酒'} },
  // ⚠ 2026-07 修：陣地作成原C→B(官方一致給B)。拔「道具作成」——他是少數沒有此技能的Caster，官方設定他
  //   放棄道具作成換取寶具的召喚能力，這是他很出名的角色特色，寫成有反而抹掉這個梗。拔「城牆防禦」——查無
  //   此技能歸他所有，標準Caster職階技能只有陣地作成+道具作成兩項，這個疑似捏造(此fx其餘無人使用，非刪功能)。
  //   外觀「青鬚」原是他自稱化名(藍鬍子)的形象，官方設計他其實沒有鬍子(甚至沒眉毛)——刻意的反差惡搞，已修正。
  //   螺湮城教本(summon_horror)/召喚海怪 為玩家既定設計、經查證符合原作「深淵召喚巨大海怪」的描述，維持不動。
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯（青鬍子）', wars:['4th'], gender:'男',
    six:{筋力:'D',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'A+'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本 Prelati\'s Spellbook（深淵召喚・召喚大海怪）',
    align:'混沌・惡', persona:{firstP:'我',look:'無鬚捧書・自稱「藍鬍子」的清瘦貴族(其實臉上無鬚無眉)、虔誠與癲狂交錯的氣息、自稱「我」・時文雅時癲狂咆哮',words:'瘋狂・虔誠扭曲・對「聖女」的執念',toMaster:'與同其瘋狂共鳴的御主引為純粹之惡的摯友、相互共鳴；否則貌合神離',speech:'時而文雅虔誠、時而癲狂咆哮、引經據典又褻瀆神明',moe:'曾為聖女信徒的純粹墮落成深淵的反差、對「神不在場」的悲憤、與志同道合的御主一搭一唱的瘋狂默契',tic:'翻動教本咆哮、淚流滿面的狂笑、自深淵召出觸手海怪'} },
  // ⚠ 2026-07 修：敏捷B→A、魔力D→C、寶具D→B，第四次聖杯戰爭材料一致給這三個階級。
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想幻像',r:'',fx:'zabaniya'}],
    traits:[{n:'人類'}], np:'妄想幻像 Zabaniya: Delusional Illusion（對人·分裂為百種人格·最多同時八十體）',
    align:'秩序・惡', persona:{firstP:'我們',look:'骷髏面具・黑袍裹身的詭譎刺客、肅殺低語的宗教氣息、自稱「我們」・多重聲線交疊低語',words:'群體・狂信・無數人格・山中老人',toMaster:'服從，視暗殺為信仰',speech:'多重聲線交疊、以「我們」自稱、低語、宗教式的肅殺',moe:'十八種人格共用一具身軀的詭異、對「初代之名」的執著、暗殺即信仰的純粹',tic:'骷髏面具下變換面孔、無聲現身、低誦經文'} },
  { id:'咒腕之哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（咒腕）', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'妄想心音',r:'',fx:'zabaniya'},{n:'投影魔術',r:'C',fx:'projection'},{n:'自我改造（詛咒之腕）',r:'C',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（對人·掏出心臟之影即死）',
    // ⚠ 2026-07 修：詛咒手臂原寫「左」臂，官方(撒旦之手嫁接)是「右」臂，已修正。
    align:'秩序・惡', persona:{firstP:'我',look:'骷髏面具・纏滿詛咒繃帶右臂的暗殺者、寡言肅殺的氣息、自稱「我」・低沉簡短肅穆',words:'暗殺・詛咒之腕・沉默・初代之名',toMaster:'冷淡服從、以暗殺為天職',speech:'低沉簡短、必要才開口、宗教式的肅穆',moe:'心臟掏取的致命一擊、沉默卻守諾',tic:'以右臂掏心之姿、無聲潛近、垂首誦念'} },
  // ⚠ 2026-07 修：官方參數是 筋A／耐A／敏A+／魔C／幸B／寶A——A+屬於敏捷，筋力數值原被錯放；
  //   狂化原B→C(官方一致給C)；np真名原「騎士不為孤軍」語意有誤，官方原名「騎士は徒手にて死せず」
  //   通行中譯是「騎士不死於徒手」，已修正。
  { id:'蘭斯洛特-Berserker', cls:'Berserker', realName:'蘭斯洛特（湖之騎士）', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無毀的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'},{n:'人類'}], np:'騎士不死於徒手 Knight of Owner（萬物化為兵裝）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅低吼）',look:'黑霧鎧甲・湖之騎士的悲愴身影、狂化無自稱，僅存壓抑的瘋狂低吼',words:'悔恨・無言的瘋狂・對主君的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',speech:'理智深處是對亞瑟王與王后之間罪的愧悔',moe:'湖之騎士的高潔被悔恨吞沒的悲劇、渴望被懲罰的扭曲忠誠、理智回光時的痛楚',tic:'黑霧纏身、抓起任何物件化為兵裝、無聲逼近'} },
  // FAKE 樣本
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['fake'], gender:'無',
    // ⬇️ 基線＝非理想御主下的恩奇都(供魔不足)。與銀狼(獵犬御主，原作真正的御主)結契才回全盛全A·寶A++(masterSynergySix_)。
    // ⚠ 2026-07 修：筋力原C——原作明講「變容」使他六圍浮動範圍恆在A~B之間、從不掉到C，即使供魔不足的基線亦同，
    //   已補至B(下限)。
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'B',幸運:'-',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'天之鎖',r:'A',fx:'chain'},{n:'氣息感知',r:'A+',fx:'sense'},{n:'變容',r:'A',fx:'shapeshift'},{n:'完全之形',r:'A',fx:'regen'}],
    traits:[{n:'神造兵器'},{n:'病死宿命'}], np:'世人啊，冀以鎖繫神明 Enuma Elish（對界 A++~EX·對肅正寶具·反星球/人類破壞行為增幅·可匹敵乖離劍）／民之睿智 Age of Babylon（大地召出萬千劍槍鎖齊射·抵銷王之財寶）',
    align:'中立・中庸', persona:{firstP:'我',look:'青綠長髮・中性無垢的神造之軀、平和無機卻溫柔的氣息、自稱「我」・平和中性而純真',words:'純真・神造・追尋摯友・無垢',toMaster:'溫和而疏離，心繫吉爾伽美什',speech:'平和中性、純真直接、無機質卻溫柔、談起摯友便柔軟',moe:'神造兵器卻最有人性、對吉爾伽美什的純粹羈絆、不解人類卻嚮往、變幻自如的天真',tic:'化身千刃、歪頭觀察、望向遠方'} },
  // 斯卡哈 三職階
  // ⚠ 2026-07 修：對魔力原C→A(官方「可無效A階以下魔術」)；神殺原A→B、魔境的智慧原A→A+，官方技能表一致。
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'C',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'神殺',r:'B',fx:'god_slay'},{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'魔境的智慧',r:'A+',fx:'mage_realm'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg',causality:true}],
    traits:[{n:'人類'}], np:'貫穿死翔之槍 Gáe Bolg Alternative（對人 B+·釘空必中＋投擲斷命）／死亡滿溢的魔境之門 Gate of Skye（對軍 A+·吸入影之國）',
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・緊身戰衣的妖豔女王、冷峻威嚴的嚴師氣場、自稱「我」',words:'影之國女王・冷峻嚴師・武人・求死而不得',toMaster:'嚴厲考校、唯認可強者，師者之威',speech:'偶露揶揄的嚴師語氣',moe:'千年女王的孤高、渴望一死卻不得的寂寞、對弟子又嚴又護、揶揄人時的促狹',tic:'魔槍杵地、睥睨、勾唇淺笑'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'E',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'人類'}], np:'蹴穿死翔之槍 Gáe Bolg Alternative（對人 B+·影縫穿刺）',
    // ⚠ 2026-07 修：外觀原「暗裝潛行」——這個Assassin版是夏季活動限定的泳裝造型，官方立繪是比基尼/沙灘裝，
    //   跟「暗殺潛行」的調性正好相反，已修正為海灘造型(仍保留她一貫的冷峻女王氣場)。
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・海灘造型的致命女王(泳裝配飾依舊難掩鋒芒)、冷冽無聲的審視氣息、自稱「我」・低冷簡短一針見血',words:'潛行的女王・冷冽・致命・影',toMaster:'冷眼試探、出手無情，認可方鬆動',speech:'低冷簡短、氣息全無、一針見血',moe:'影中女王的致命優雅、試探背後的審視、認可強者後難得的鬆動',tic:'融入暗影、刃尖輕轉、無聲逼近'} },
  { id:'斯卡蒂-Caster', cls:'Caster', realName:'斯卡哈·斯卡蒂（Skadi）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'C',魔力:'EX',幸運:'D',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'EX',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'女神的神核',r:'A',fx:'divine_core'},{n:'原初符文',r:'EX',fx:'rune'},{n:'大神的睿智',r:'B+',fx:'analyze'},{n:'冰凍暴風雪',r:'B',fx:'petrify'}],
    // ⚠ 2026-07 修：拔「女神」trait——FGO正式trait只有神性/巨人/人型三項，「女神」只是台詞稱呼非機制標籤；
    //   np移除「開戰寶具」標籤——Gate of Skye是任何時機都能發動的隊伍增益寶具，非開場限定，跟官方分類矛盾；
    //   髮色原「銀紫」→「深紫」，週邊/官方描述一致是深紫髮配紅瞳，銀色成分查無依據(順手補上紅瞳)。
    traits:[{n:'神性'},{n:'巨人'}], np:'通往死亡滿溢的魔境之門 Gate of Skye（對軍 A+·影之城的祝福）',
    align:'中立・善', persona:{firstP:'吾',look:'深紫長髮・紅瞳・符文環繞的冰雪女神、莊重慈悲並存的母性威儀、自稱「吾」・溫柔莊重如神祇',words:'北歐女神・溫柔而威嚴・守護者・嚴母',toMaster:'溫柔包容、暗藏神威，母性',speech:'溫柔而莊重、自稱吾、神祇的慈悲與威嚴並存',moe:'冰雪女神的溫柔母性、害羞時的可愛、守護生靈的執著、威嚴下的溫情',tic:'符文環繞、垂眸微笑、輕撫額前'} },
  // strange Fake
  // ⚠ 2026-07 修：敏捷C→EX(他是首位敏捷達EX的從者·越戰越快是招牌設定)、魔力C→B、幸運A→C(原本整個反了)、
  //   寶具B→A，多筆來源一致。np描述原把「圓桌之證」寫成召喚聖劍——實際效果是喚出生前的夥伴們助戰(最多7位)，
  //   召喚聖劍的是他另一把叫Excalibur的寶具，兩者被混在一起了，已修正描述。軍略/戰鬥續行查無此二技能歸他，
  //   真正的兩個個人技能是驥足百般(萬能百藝)與神速(越戰越快)，已替換。
  { id:'理查一世-Saber', cls:'Saber', realName:'獅心王・理查一世', wars:['fake'], gender:'男',
    six:{筋力:'B',耐久:'B',敏捷:'EX',魔力:'B',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    // ⚠ 2026-07 修：驥足百般(analyze) 與神速(first_strike) 引擎判定共用同一個 fsA/fsD 變數(||短路)，
    //   兩者效果完全疊不起來、必然有一個是純裝飾——神速(Divine Speed)是信心確立的正史技能予以保留，
    //   驥足百般改純演出(fx留空)，不再跟神速搶同一個判定變數。
    skills:[{n:'獅子心',r:'A',fx:'clear_mind'},{n:'領袖氣質',r:'B',fx:'morale'},{n:'驥足百般',r:'A',fx:''},{n:'神速',r:'A',fx:'first_strike'}],
    traits:[{n:'王'},{n:'人類'}], np:'圓桌之證 Rounds of Lionheart（對軍 A・喚出生前的夥伴們自暗影助戰，非召喚聖劍）',
    align:'中立・善', persona:{firstP:'余',look:'金髮碧眼・佩劍披風的獅心王、豪邁不羈孩子氣的昂揚王者、自稱「余」・熱情奔放滿口傳說',words:'浪漫・崇拜英雄・天真豪邁・獅心',toMaster:'坦率信賴，視為冒險夥伴',speech:'熱情奔放、滿口傳說英雄、孩子氣的興奮、王者豪氣',moe:'獅心王卻像個追星少年、對亞瑟王傳說的狂熱崇拜、天真到可愛的浪漫、豪邁不拘小節',tic:'眼睛發亮談英雄、揮劍大笑、勾肩搭背'} },
  // ⚠ 2026-07 修：wars維持標'fake'(玩家定案，不論正史出處)。「神威的車輪」查無此名歸他，機制(致命傷保留一命)
  //   對應的真正技能名是「戰鬥續行」，已正名；「貫穿戰場的流星」官方階級是B+非A，已修正；「守護領域的車輪」
  //   實為除踵無敵的個人被動、非車輪/領域類效果，描述已調整避免誤導成範圍技。
  { id:'阿基里斯-Rider', cls:'Rider', realName:'阿基里斯', wars:['fake'], gender:'男',
    six:{筋力:'B+',耐久:'A',敏捷:'A+',魔力:'C',幸運:'D',寶具:'A'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'C',fx:'divine'},{n:'女神的寵愛',r:'B',fx:'divine_core'},{n:'勇猛',r:'A+',fx:'morale'},{n:'戰鬥續行',r:'A',fx:'survive'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'貫穿戰場的流星（對人 B+）／除踵無敵（自身免疫致命傷·唯腳踵例外）',
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮健碩・駕戰車執長槍的半神戰士、自稱「我」',words:'戰士・自由奔放・驕傲重情・不敗',toMaster:'豪爽不羈，認可便傾力相助',speech:'張狂自信、戰意昂揚、重情義、不服輸',moe:'半神英雄的驕傲與孩子氣、唯一弱點腳踵的宿命、對戰友的重情、自由不受拘束',tic:'駕戰車衝鋒、咧嘴挑釁、拍胸脯打包票'} },
  // ⚠ 2026-07 大修：原內容整套(解體聖母/骷髏孩童/氣息遮斷/情報抹消)其實是《Apocrypha》黑方刺客版傑克的設定，
  //   跟這裡標的《strange Fake》Berserker版(福拉特的從者)完全是兩個不同角色——已改寫為 strange Fake 本尊：
  //   無固定實體、靠「千貌」變化成任何「被推測是開膛手真身」的人事物；狂化被自身瘋狂具現的本質悖論封印(負負得正)
  //   而理智清醒，故 classSkills 狂化 fx 刻意留空(不吃機制加成/懲罰)；六圍原作未給明確數值，取中庸值代表工程近似。
  { id:'開膛手傑克-Berserker', cls:'Berserker', realName:'開膛手傑克', wars:['fake'], gender:'異',
    six:{筋力:'C',耐久:'C',敏捷:'B',魔力:'B',幸運:'D',寶具:'B'},
    classSkills:[{n:'狂化(已封印)',r:'-',fx:''}],
    skills:[{n:'千貌',r:'A',fx:'shapeshift'}],
    traits:[{n:'瘋狂具現'}], np:'其乃不值悲劇之終末 Natural Born Killers（對軍 B・分裂百餘化身應戰）／悪霧は倫敦の暁と共に滅び逝きて From Hell（對人・可變E~A+・化作巨大幻想種、以周遭人類恐懼為力）',
    align:'混沌・中庸', persona:{firstP:'我',look:'無固定實體・平時僅以無性別無age感的平靜嗓音現身，戰時藉「千貌」瞬間化身成任何「被世間推測為開膛手真身」的人事物(醫師／貴族／警察／野獸／孩童皆可)、借其形借其技，自稱「我」・語調溫雅從容',words:'無名・千貌・尋根究底的自我・悖論中的清醒',toMaster:'耐心包容其笨拙的御主，語氣總帶幾分優雅的無奈',speech:'溫雅從容、措辭考究近乎詩意、偶爾被自己「不像瘋子」的言行逗笑',moe:'連自己真實身分都不知道的執著追尋、對御主笨手笨腳的縱容包容、不自覺化身成與另一個「開膛手傑克」相似的少女模樣卻不明所以',tic:'身形在霧氣中悄然變換、輕聲失笑、若有所思地凝望自己的手'} },
  { id:'蒼白騎兵-Rider', cls:'Rider', realName:'蒼白騎兵（Pale Rider）', wars:['fake'], gender:'異',
    six:{筋力:'E',耐久:'A',敏捷:'B',魔力:'A',幸運:'C',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'EX',fx:'ride'}],
    skills:[{n:'感染',r:'A',fx:'petrify'},{n:'無辜的世界',r:'EX',fx:'unreadable'},{n:'冥界的引導',r:'EX',fx:'territory'}],
    traits:[{n:'災厄'},{n:'疫病'}], np:'到來吧、冥途啊 Doomsday Come（對界 EX·以御主為起點的模擬冥界結界·可連肉體拉入）／劍、饑饉、死、獸 Kagome Kagome（對軍 A·結界內具現致死之物·天啟四騎士之力）',
    align:'中立・中庸', persona:{firstP:'…',look:'蒼白朦朧・若有似無的騎影、近乎無形的死亡氣息、自稱「…」・幾乎不言僅以瘟疫宣告存在',words:'瘟疫・死亡・無形・終末',toMaster:'無言依附御主之願、以其為冥界起點',speech:'幾乎不開口、存在感稀薄、偶以孩童般純真的破碎短語回應',moe:'人類對瘟疫與死亡之恐懼的具現、無辜與災厄並存的詭異、近乎無形卻無所不在、被當「夥伴」者得冥府祝福',tic:'蒼白騎影一閃即逝、無聲蔓延的寒疫、空洞的注視'} },
  { id:'狂信者哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（狂信者）', wars:['fake'], gender:'女',
    six:{筋力:'C',耐久:'B',敏捷:'A',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'A-',fx:'stealth'}],
    skills:[{n:'狂信',r:'A',fx:'clear_mind'},{n:'幻想血統',r:'',fx:'zabaniya'},{n:'自我改造',r:'A',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'幻想血統 Zabaniya（對人・對軍・再現十八位哈桑之奇蹟）',
    // ⚠ 2026-07 修：她從未真正繼承「哈桑」之名，白骨面具是正式繼承者的專屬標誌，她其實是用面紗遮臉非硬質面具；
    //   瞳色原「粉紅」多筆來源指向「紫瞳」，已修正；speech原多打一個「不」字變成「不宗教式」跟她狂熱信仰的
    //   人設核心完全矛盾，已刪去衍字。
    align:'秩序・善', persona:{firstP:'我',look:'黑長直・雙麻花辮・面紗半遮的纖細刺客、斗篷裹身赤足而行、自稱「我」',words:'信仰・初代之名・十八奇蹟・殉道',toMaster:'虔敬奉獻、視契約為聖戰',speech:'虔敬低語、宗教式的肅穆、提及信仰時激越',moe:'黑長直雙麻花辮、紫瞳、面紗半遮、赤足斗篷、為信仰殉道的純粹狂熱、再現十八哈桑的奇蹟',tic:'垂首誦念、撫過面紗、赤足無聲而至'} },
  { id:'伊絲塔-Archer', cls:'Archer', realName:'伊絲塔', wars:['fake'], gender:'女',
    six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'A',幸運:'B',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'女神的神核',r:'A',fx:'divine_core'},{n:'魔力放出',r:'A',fx:'burst'}],
    traits:[{n:'神性'},{n:'女神'}], np:'天之公牛・山海熔毀的天牛 An Gugalanna（對軍 A+·自天界召落神獸天之公牛·踏地則山崩海沸·所過之處盡化熔毀焦土）',
    // ⚠ 2026-07 修：附體對象原「借凜之身」——那是FGO(Babylonia)限定設定，strange Fake小說裡她附體的其實是
    //   人造人「菲莉雅」，髮色瞳色也一併改回菲莉雅的愛因茲貝倫外貌(白髮紅瞳)，不再沿用凜本人的黑髮。
    align:'混沌・善', persona:{firstP:'本小姐',look:'白髮紅瞳・借菲莉雅之身的金星女神、高傲任性傲嬌的氣燄、自稱「本小姐」',words:'女神・任性・傲嬌・愛美愛閃亮',toMaster:'頤指氣使，意外講義氣',speech:'高傲任性、傲嬌口吻、愛炫耀、得意洋洋',moe:'見閃亮寶物就走不動、嘴硬心軟的義氣、借了菲莉雅的身體卻依然嘴硬',tic:'叉腰仰頭、召喚天舟、哼一聲撇頭'} },
  // 客串英靈
  { id:'莫德雷德-Saber', cls:'Saber', realName:'莫德雷德', wars:['客串'], gender:'女',
    six:{筋力:'B+',耐久:'A',敏捷:'B',魔力:'B',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'C',fx:'morale'},{n:'戰鬥續行',r:'B',fx:'survive'}],
    traits:[{n:'龍'},{n:'騎士'}], np:'我的憤怒不會退去 Clarent Blood Arthur（對軍 A+·深紅雷光自劍身爆湧·裹挾弒父之恨轟成撕裂天地的血色奔雷）',
    // ⚠ 2026-07 補：原人設把她寫得偏溫和(不肯承認的少女心)，補上原作核心性格特徵——她堅持以陽性口吻自稱、
    //   對「被當女性看待」有強烈牴觸，這是Apocrypha原作最鮮明的性格核心之一，原描述把這點磨得太淡。
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮馬尾・銀甲纏紅雷的反逆騎士、粗豪叛逆爭強好勝、自稱「我」・不服輸的粗豪挑釁口吻',words:'叛逆・倔強・渴求認同・反逆之騎',toMaster:'桀驁不馴，認可便死忠，堅持以男性自居、忌諱被當女性看待',speech:'粗豪叛逆、不服輸、稱亞瑟王「父親」、爭強好勝',moe:'外表狂傲內心渴求父親認同、被稱作「女性」會激烈牴觸、死要面子、對「弒父叛逆」的執念與悔',tic:'掀面甲咆哮、紅雷纏劍、別過頭'} },
  // ⚠ 2026-07 修：魔力D→B、幸運E→D，多筆來源一致。np「Vasavi Shakti」原寫「梵天弒神之槍」——這把槍其實是
  //   因陀羅為騙走他鎧甲而授予的，跟梵天無關(梵天是另一把「梵天慈悲之槍」的神格，兩把寶具的神格被錯放互換)，
  //   已修正歸屬。look「太陽之鎧加身」語感像可穿脫裝備——那副鎧甲其實是他出生就長在身上的一部分，只能靠
  //   割下獻祭才能拿掉(因陀羅設局的關鍵)，已改用「與生俱來」強調不可拆卸。
  { id:'迦爾納-Lancer', cls:'Lancer', realName:'迦爾納', wars:['客串'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'B',幸運:'D',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'魔力放出（炎）',r:'A',fx:'burst'},{n:'太陽之鎧',r:'A',fx:'divine_core'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'日輪啊化作鎧甲吧 Kavacha and Kundala（與生俱來·不滅黃金鎧）／穿刺死亡之槍 Vasavi Shakti（對神 EX·因陀羅授予的弒神之槍）／梵天慈悲之槍 Brahmastra',
    align:'秩序・善', persona:{firstP:'我',look:'白髮・與生俱來融於血肉的太陽之鎧(唯獻祭可卸)、自稱「我」',words:'施與者・寡言・高潔・恩怨分明',toMaster:'沉默守諾、恩怨分明，有求必應',speech:'極簡寡言、不卑不亢、直言不諱、一諾千金',moe:'有求必應的施捨英雄、面冷心熱、被誤解也不辯解的高潔、認真到不近人情卻最溫柔',tic:'默然佇立、卸甲相贈、平靜直視'} },
  // ⚠ 2026-07 修：對魔力原C——他隨身攜帶的破魔書「破卻一切的萬能福音」常駐把對魔力拉到A階，這是角色機制的
  //   常駐效果非戰鬥觸發，已修正。np原漏收第四把寶具「阿爾加莉亞的陷阱」——Apocrypha原作他共有四把寶具，
  //   這把是小說裡摧毀黑方指揮權冠冕的關鍵寶具，已補上。
  { id:'阿斯托爾福-Rider', cls:'Rider', realName:'阿斯托爾福', wars:['客串'], gender:'男',
    six:{筋力:'D',耐久:'D',敏捷:'B',魔力:'C',幸運:'A+',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'單獨行動',r:'A',fx:'solo'},{n:'直感',r:'A',fx:'first_strike'},{n:'怪力',r:'C',fx:'str_up'},{n:'純真無垢',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'觸發傳說的魔笛 La Black Luna／阿爾加莉亞的陷阱 Trap of Argalia—Down with a Touch!（觸即倒·對人）／破卻一切的萬能福音 Casseur de Logistille（解除魔術·對人）／駿馬怪鳥 Hippogriff（神話之翼·飛翔）',
    align:'混沌・善', persona:{firstP:'我',look:'粉髮長辮・分不清性別的元氣騎士、蹦跳活潑毫無心機、自稱「我」・想到啥說啥的爛漫元氣',words:'天真爛漫・無憂・忠誠・元氣',toMaster:'活力滿滿，全心信賴',speech:'元氣滿滿、天真爛漫、想到啥說啥、毫無心機',moe:'十二勇士中最天真的開心果、記性差卻最忠誠、可愛到分不清性別、為朋友赴湯蹈火',tic:'蹦蹦跳跳、騎上駿鷹、燦爛大笑'} },
  // ⚠ 2026-07 修：氣息遮斷C→C+；二重召喚A→B(官方一致給B，這是她獨有的「同時持有刺客與魔術師雙職階技能」的
  //   稀有技能)；np規模原「對城」→「對界」——官方明確強調「這是對界寶具，不是對城寶具」，已修正。
  { id:'賽彌拉米斯-Assassin', cls:'Assassin', realName:'賽彌拉米斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'A',寶具:'A+'},
    classSkills:[{n:'氣息遮斷',r:'C+',fx:'stealth'}],
    skills:[{n:'二重召喚',r:'B',fx:'double_summon'},{n:'陣地作成（空中庭園）',r:'EX',fx:'territory'},{n:'道具作成（毒）',r:'A',fx:'crafting'}],
    traits:[{n:'神性'},{n:'人類'}], np:'虛榮的空中庭園 Hanging Gardens of Babylon（對界 EX·浮空要塞·毒殺結界）',
    align:'混沌・惡', persona:{firstP:'妾',look:'華貴盛裝・君臨空中庭園的毒后、高貴威嚴不容違逆的女王氣度、自稱「妾」',words:'毒后・傲慢・貞潔的執念・空中庭園',toMaster:'高高在上，唯認可強主',speech:'唯以絕對支配的語氣論斷是非，容不得半分質疑',moe:'史上首位毒殺者女王的傲然、對真愛的執念、被冒犯時的羞怒、君臨天下的孤高',tic:'俯瞰眾生、抬手降毒、空中庭園浮現'} },
  { id:'尼祿-Saber', cls:'Saber', realName:'尼祿·克勞狄烏斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'D',敏捷:'A',魔力:'B',幸運:'A',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    // ⚠ 2026-07 修：縱使三度迎來落日 原掛 survive(單次戰鬥續行)——查證這其實是「三度」各自獨立的復活(比照
  //   十二試煉god_hand機制)，非一次性戰鬥續行；改掛 god_hand，階級降為C(她的復活不如赫拉克勒斯十二試煉那樣強力)，
  //   lives:3 讓召喚時標記【試煉】3(而非god_hand預設的赫拉克勒斯專屬11)，此前 Router_Creation.gs 早已把「尼祿三度輝映」
  //   當AI原創god_hand從者的3命基準寫進註解，這裡才補上她自己本尊的標籤一致。
  skills:[{n:'頭痛宿疾',r:'B',fx:''},{n:'皇帝特權',r:'EX',fx:'mage_realm'},{n:'縱使三度迎來落日',r:'C',fx:'god_hand',lives:3},{n:'領袖氣質',r:'A',fx:'morale'}],
    // ⚠ 2026-07 修：np中譯原「燃燒吧、世界的盡頭」文不對題——官方原名直譯是「引人沉醉的黃金劇場」，取材自
    //   她真實存在的「黃金宮」劇場，已修正扣連黃金劇場意象。
    traits:[{n:'王'},{n:'人類'}], np:'招引沉醉的黃金劇場 Aestus Domus Aurea（對軍）',
    align:'混沌・善', persona:{firstP:'余',look:'金髮綠瞳・紅薔薇綻放的華美皇帝、張揚自信滿溢的熱情、自稱「余」・滿口藝術張揚自信',words:'暴君・自戀・藝術・天真爛漫',toMaster:'熱情張揚，渴望被讚美',speech:'張揚熱情、自稱余、滿口藝術、自信滿溢、愛唱歌',moe:'暴君之名下的純真自戀、對自身美貌與才藝的迷之自信、渴望被愛被讚美、其實非常努力',tic:'振臂高歌、紅薔薇綻放、得意揚眉'} },
  // ⚠ 2026-07 修：寶具A→B、陣地作成A→C(官方明講「她的個性不適合搞這套」，只有C階)。「道具作成」改造成她的
  //   專屬技能「狐之嫁入」EX階，非通用B階道具作成；「高速神言」查無出處，替換為她真正的第二技能「呪術」EX；
  //   「狐之治癒」查無出處，保留「變化」一項固有技能。髮色原「金髮」→「粉髮」，官方立繪一致是粉色雙馬尾狐耳。
  //   拔「八純之鎖」——查無此寶具歸屬她，疑似捏造。
  { id:'玉藻前-Caster', cls:'Caster', realName:'玉藻前', wars:['客串'], gender:'女',
    six:{筋力:'E',耐久:'E',敏捷:'B',魔力:'A',幸運:'D',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'C',fx:'territory'},{n:'狐之嫁入',r:'EX',fx:'crafting'}],
    skills:[{n:'呪術',r:'EX',fx:'fast_cast'},{n:'變化',r:'A',fx:'shapeshift'}],
    traits:[{n:'神性'},{n:'野獸'}], np:'水天日光天照八野鎮（治癒結界）',
    align:'混沌・中庸', persona:{firstP:'妾身',look:'粉髮狐耳・和服盛裝的九尾賢妻、甜膩撒嬌裹著腹黑的氣息、自稱「妾身」',words:'賢妻・腹黑・愛吐槽・狐狸',toMaster:'撒嬌又掌控，黏人',speech:'暗藏腹黑、毒舌吐槽裹著糖衣',moe:'賢妻外皮下的腹黑掌控慾、九尾狐的撒嬌黏人、吐槽精準狠辣、為愛奉獻的執著',tic:'狐耳輕顫、掩嘴輕笑、鏡前理妝'} },
  // ⚠ 2026-07 修：官方六圍為 D/C/A+/B/A/A+，耐久/敏捷/魔力/幸運/寶具原值幾乎整排偏低估，已對齊；
  //   天狗之兵法B→A。
  { id:'牛若丸-Rider', cls:'Rider', realName:'源義經（牛若丸）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'A+',魔力:'B',幸運:'A',寶具:'A+'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'領袖氣質',r:'C',fx:'morale'},{n:'天狗之兵法',r:'A',fx:'first_strike'},{n:'牛若之武略',r:'B',fx:'tactics'}],
    traits:[{n:'人類'}], np:'壇之浦・八艘飛（對人・神速跳躍）',
    align:'混沌・中庸', persona:{firstP:'牛若',look:'黑髮武裝・嬌小靈動的武家少女、純真赤誠的武者英氣、自稱「牛若」',words:'悲劇武者・純真・崇拜兄長・赤誠',toMaster:'純粹追隨，赤誠相待',speech:'談起兄長時滿眼崇拜',moe:'悲劇宿命下的純真、對兄長賴朝近乎信仰的崇拜（卻被其所害）、天真爛漫的武勇、赤子之心',tic:'八艘飛躍、雙眸發亮、抱膝談兄長'} },
  // ⚠ 2026-07 修：對魔力A→EX(官方明講「連神代魔術都傷不了她」)；真名看破A→B；領袖氣質B→C，官方一致。
  { id:'貞德-Ruler', cls:'Ruler', realName:'貞德', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'A',魔力:'A',幸運:'C',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'EX',fx:'nullify_magic'},{n:'真名看破',r:'B',fx:'analyze'}],
    skills:[{n:'啟示',r:'A',fx:'first_strike'},{n:'吾主在此 Luminosité Eternelle',r:'A',fx:'rho_aias'},{n:'領袖氣質',r:'C',fx:'morale'}],
    traits:[{n:'人類'}], np:'紅蓮聖女 La Pucelle（火焰聖劍·捨身的最後王牌）／吾主在此 Luminosité Eternelle（守護大旗·非攻擊寶具·豎旗則神明在此）',
    align:'秩序・善', persona:{firstP:'我',look:'金髮持旗・銀甲聖潔的奧爾良聖女、溫柔堅定的信仰氣度、自稱「我」・語氣溫柔循循善誘',words:'聖女・堅毅・溫柔的信念・無私',toMaster:'溫柔守護，循循善誘',speech:'溫柔堅定、信仰之言、循循善誘、無私包容',moe:'聖女的堅毅與少女的羞澀、不恨將自己處刑之人的寬容、認真到固執的信念、其實很平凡的願望',tic:'按旗祈禱、溫柔微笑、堅定直視'} },
  { id:'美遊-Saber', cls:'Saber', realName:'美遊·埃德費爾特（Saber install）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'B',fx:'burst'},{n:'沉著冷靜',r:'B',fx:'clear_mind'},{n:'誓約勝利之劍',r:'A',fx:'excalibur'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'誓約勝利之劍 Excalibur（對城 A·聖劍之光收束於劍尖·解放為撕裂大地、直貫蒼穹的金色巨炮）',
    align:'秩序・善', persona:{firstP:'我',look:'黑髮藍裙・Saber 之力的內斂少女、寡言守禮認真守護的沉靜、自稱「我」・寡言低語守禮認真',words:'寡言・認真・溫柔內斂・背負宿命',toMaster:'認真盡責，沉默守護',speech:'寡言內斂、認真守禮、溫柔低語、不擅表達',moe:'聖杯之子的孤獨宿命、被兄長守護的依賴、認真過頭的笨拙、內斂的溫柔',tic:'沉默佇立、握劍守護、垂眸淺應'} },
  { id:'小黑-Archer', cls:'Archer', realName:'克洛伊·馮·愛因茲貝倫（Archer install）', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'C',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'投影魔術',r:'B',fx:'projection'},{n:'千里眼',r:'C',fx:'aim'}],
    traits:[{n:'人類'}], np:'鶴翼三連 Triple-Linked Crane Wings（對人 B·投影干將・莫邪，雙劍交擊、三連必殺的劍技）',
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
  {id:'衛宮士郎-5th',  name:'衛宮士郎', gender:'男', appearance:'紅褐短髮的高中生，樸素襯衫',   war:'5th', magic:'投影／強化',          circuits:30, melee:'D', magic_rank:'D', home:'冬木·深山町', wish:'成為正義的伙伴',          persona:'樂於助人的好好先生・扭曲的自我犧牲・喜歡修繕器物與做家事・厭惡見死不救', back:'冬木大火唯一倖存的孤兒，被衛宮切嗣收養，繼承「成為正義夥伴」這份扭曲而炙熱的理想', moe:'自己滿身傷還先擔心別人、嘴硬的逞強、認真到笨拙'},
  // ⚠ 2026-07 修：back原「次女」→「長女」(凜是姊姊、櫻才是被送養的妹妹，原寫反了)；circuits45→50(原作她的魔術回路質量遠超同齡水準，公認罕見)。
  {id:'遠坂凜-5th',    name:'遠坂凜', gender:'女', appearance:'黑長雙馬尾、紅衣黑裙，傲然',     war:'5th', magic:'寶石魔術',            circuits:50, melee:'C', magic_rank:'A', home:'遠坂宅',     wish:'見證聖杯・不負遠坂之名',  persona:'人前完美的優等生・刀子嘴豆腐心・喜歡可愛小物與紅茶・厭惡示弱與失態', back:'冬木名門遠坂家長女，父親時臣死於上屆聖杯戰爭，背負遠坂的驕傲與正統魔術師之道', moe:'人後迷糊、傲嬌到極致、其實很怕寂寞、偷偷存錢買可愛小物還嘴硬'},
  // ⚠ 2026-07 修：back原「養子」寫反——慎二才是間桐家血親獨子，妹妹櫻才是被收養進來頂替魔術後嗣的那位。
  {id:'間桐慎二-5th',  name:'間桐慎二', gender:'男', appearance:'藍髮神經質青年，刻薄表情',   war:'5th', magic:'魔術迴路微弱・依賴從者', circuits:15, melee:'E', magic_rank:'E', home:'間桐宅',     wish:'被認可・奪取勝利',        persona:'自信張揚的表象・自卑虛榮・喜歡被吹捧與掌控感・厭惡比自己強的人', back:'間桐家血脈獨子，魔術迴路微弱不被家族認可，活在妹妹櫻與名門陰影下的扭曲少年', moe:'色厲內荏一戳就破、虛張聲勢的可悲、偶爾流露的脆弱、其實渴望被認可'},
  // ⚠ 2026-07 修：wish原「到達根源」是他早已放棄的舊日初衷——如今只剩逃脫死亡，且把奪杯戰爭當成餘生的消遣取樂。
  {id:'間桐臟硯-5th',  name:'間桐臟硯', gender:'男', appearance:'乾癟矮小的千年老人，蟲蝕枯槁之軀', war:'5th', magic:'間桐之蟲術・吸血蟲・延命', circuits:40, melee:'E', magic_rank:'A', home:'間桐宅',     wish:'逃脫死亡（不老不死）・視奪杯為餘生消遣', persona:'乾癟陰沉的老謀深算・對活下去的病態執著・喜歡操弄與蟲蝕・厭惡死亡與軟弱', back:'活了五百年的間桐家始祖（本名佐爾根），以蟲術苟延殘喘、視子孫為延命容器，為奪聖杯不擇手段', moe:'千年老者的執念與算計、視人命如棋子的冷酷、陰森的耐性'},
  {id:'葛木宗一郎-5th',name:'葛木宗一郎', gender:'男', appearance:'戴眼鏡的沉默教師，黑西裝', war:'5th', magic:'體術（蛇之拳）・無魔術', circuits:10, melee:'A', magic_rank:'E', home:'柳洞寺',     wish:'無所求・守護所重視之人',     persona:'沉默盡責的教師・別無所求的絕對忠誠・喜歡平靜的日常・厭惡虛偽的言辭', back:'本是無名殺手，隱姓埋名成為高中教師，因其從者而第一次有了「想守護之物」', moe:'面無表情卻絕對守諾、對並肩從者笨拙而深沉的情意、蛇之拳的致命反差、不懂浪漫卻最深情'},
  {id:'言峰綺禮-5th',  name:'言峰綺禮', gender:'男', appearance:'高大神父、黑色法衣，陰沉',   war:'5th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'尋得能讓自己喜悅之物',    persona:'虔誠神父的假面・以他人痛苦為樂的空虛・喜歡探究何為喜悅・厭惡平庸的善', back:'生來只能在他人不幸中感到喜悅的神父，壓抑天性數十年，終在某位高傲英靈的慫恿下坦然墮落', moe:'麻婆豆腐的意外執著、對自身惡的坦誠到近乎天真、扭曲卻誠實、與某位高傲英靈的孽緣損友默契'},
  {id:'伊莉雅絲菲爾-5th',name:'伊莉雅絲菲爾', gender:'女', appearance:'紅眼白髮的幼小少女，毛領大衣',war:'5th',magic:'愛因茲貝倫煉金術・聖杯依代',    circuits:80, melee:'D', magic_rank:'A', home:'冬木·新都', wish:'完成聖杯的使命',          persona:'天真爛漫的少女・哀傷的聖杯依代・喜歡士郎與雪・厭惡孤獨', back:'愛因茲貝倫煉金術製造的人造人、第三魔法的聖杯之器，被當作工具養大卻渴望親情', moe:'人造人的純真、強顏歡笑的寂寞'},
  // ⚠ 2026-07 修：circuits原90→50——她本人的回路質量與凜同級(人類頂尖水準)，那股無限魔力來自聖杯泥附體(已在magic欄體現)，不該混進她自己的天賦數字。
  {id:'間桐櫻(黑化)-5th',name:'間桐櫻（黑化）', gender:'女', appearance:'黑長髮、黑紅禮服，妖異而空洞的笑',war:'5th',magic:'聖杯之泥・無限魔力・蟲爪', circuits:50, melee:'E', magic_rank:'A', home:'間桐宅', wish:'獨佔所愛、將傷害自己的世界一同拖入黑暗', persona:'溫順乖巧的假面・被黑泥吞噬的佔有・渴望獨佔所愛・厭惡傷害過自己的一切', back:'遠坂家次女，自幼被送養給間桐家承受蟲蝕之苦十一年，長期壓抑終被聖杯黑泥侵蝕黑化', moe:'純愛扭曲成毀滅性佔有的反差、對姊姊與學長的複雜執念、可憐又可怖'},
  // 第四次
  // ⚠ 2026-07 修：circuits35→15、magic_rank B→C——他的魔術回路數量少質量也差(原作明寫、故Saber供魔得靠愛麗絲)，
  //   真正的殺傷力來自起源彈與戰術而非魔術本身，「天才殺手·蹩腳魔術師」的反差不該被回路數字掩蓋。
  {id:'衛宮切嗣-4th',  name:'衛宮切嗣', gender:'男', appearance:'黑髮疲憊的男人，風衣',   war:'4th', magic:'起源彈・固有時制御',    circuits:15, melee:'A', magic_rank:'C', home:'冬木·深山町', wish:'以聖杯拯救世界、終結戰爭',persona:'冷酷疲憊的魔術師殺手・為大義不擇手段・喜歡（曾經）平凡的幸福・厭惡無謂的犧牲', back:'信奉「拯救多數而犧牲少數」的魔術師殺手，為終結一切戰爭而尋求聖杯，背負「拯救多數犧牲少數」的沉重覺悟參戰', moe:'冷酷算計下對家人的溫柔、抽菸沉思的疲憊、其實最痛恨殺戮'},
  {id:'遠坂時臣-4th',  name:'遠坂時臣', gender:'男', appearance:'金棕髮的優雅紳士，名門做派',   war:'4th', magic:'寶石魔術',            circuits:50, melee:'D', magic_rank:'A', home:'遠坂宅',     wish:'抵達「根源之渦」',        persona:'優雅從容的名門紳士・抵達根源的執念・喜歡藝術與秩序・厭惡粗鄙與失格', back:'遠坂家當主，畢生追求「根源之渦」的正統魔術師，以名門的驕傲與正統之道召喚出最契合自身正統的英靈參戰', moe:'對美學與禮儀的執著、名門的迂腐可愛、教科書般的魔術師'},
  // ⚠ 2026-07 修：home補「海特飯店」(他實際據點、被切嗣炸毀之處，原寫太籠統)；circuits50→65(時鐘塔科主等級，原作與韋伯的回路量差距懸殊)。
  {id:'肯尼斯-4th',    name:'肯尼斯', gender:'男', appearance:'金髮高傲的年輕教授',     war:'4th', magic:'礦石科・流體操作',      circuits:65, melee:'C', magic_rank:'A', home:'海特飯店', wish:'榮譽與學術成就',          persona:'高傲的天才教授・極高的自尊・喜歡學術與名譽・厭惡被輕視', back:'時鐘塔礦石科年輕天才講師，攜未婚妻索菈參戰，自視甚高、絕不容許在這場戰爭裡蒙受任何屈辱', moe:'對未婚妻意外的深情、被打臉時的崩潰、學究的一板一眼'},
  // ⚠ 2026-07 修：home補「麥肯基宅」(他借住深山町山丘上的老夫婦家，非新都鬧區)；circuits25→15(原作明寫他是時鐘塔墊底的資質，跟肯尼斯拉開懸殊差距)。
  {id:'韋伯·維爾維特-4th',name:'韋伯·維爾維特', gender:'男', appearance:'黑髮瘦小的少年魔術師',war:'4th',magic:'自我暗示・基礎魔術', circuits:15, melee:'E', magic_rank:'C', home:'麥肯基宅', wish:'證明自己的價值',          persona:'故作老成的少年・自卑卻好強・喜歡證明自己・厭惡被當作無能', back:'出身平凡的時鐘塔末席學生，為證明「才能非血統決定」偷走觸媒召喚出與自己羈絆深厚的英靈，一路成長', moe:'被並肩的從者一路磨礪帶著成長、口嫌體正直、偷偷崇拜那位豪邁的英靈'},
  // ⚠ 2026-07 修：wish原「召喚惡魔」是誤植——他對聖杯毫無興趣，真正圖的是跟從者一起體驗新奇殺戮的快感；home補實際據點(澪標川下水道廢棄工房，非新都鬧區)。
  {id:'雨生龍之介-4th',name:'雨生龍之介', gender:'男', appearance:'輕浮的金髮青年，咧嘴而笑', war:'4th', magic:'無魔術・召喚術（外行）', circuits:10, melee:'C', magic_rank:'E', home:'碼頭倉庫', wish:'見識更新奇的殺戮・與從者共享獵奇的快感',persona:'輕浮開朗的青年・天生純粹之惡・喜歡有趣與新鮮的死亡・厭惡無聊', back:'毫無魔術素養卻天生純粹的殺人狂，誤打誤撞召喚出與自己瘋狂共鳴的英靈，把殺戮當成有趣的遊戲', moe:'與其從者的瘋狂默契、毫無惡意的惡'},
  {id:'言峰綺禮-4th',  name:'言峰綺禮', gender:'男', appearance:'尚未墮落的青年神父，壓抑',   war:'4th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'探求自身空虛的答案',      persona:'壓抑的青年神父・尚未墮落的空虛・執著探求自身的答案・厭惡虛假的自己', back:'尚未墮落的代行者神父，奉命輔佐家世顯赫的盟友魔術師，卻在追問「自身為何空虛」中逐步走向深淵', moe:'壓抑天性的痛苦掙扎、宿命般走向黑暗'},
  {id:'間桐雁夜-4th',  name:'間桐雁夜', gender:'男', appearance:'蟲蝕半白頭髮的憔悴男子',   war:'4th', magic:'間桐之蟲術',          circuits:15, melee:'D', magic_rank:'C', home:'間桐宅',     wish:'從間桐手中救出櫻',        persona:'憔悴的悲憤男子・自我犧牲的執念・只為救出櫻・厭惡間桐家', back:'捨棄魔術逃離間桐家的男人，為救受蟲蝕之苦的櫻，重回家門植入蟲術、賭上性命參戰', moe:'對櫻純粹的守護（叔父般的疼惜·非生父）、明知必死仍奮不顧身、被蟲蝕的痛苦、悲劇的溫柔'}
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
var CODEX_PERSONA_VER = 'v46'; // v46：英靈庫(SEED_SERVANTS)+御主庫(SEED_MASTERS) persona 減贅述——look/speech/moe(或
//   persona/moe)之間大量逐字重複同一特質(如「人前完美」「天真與哀傷」「壓抑的空虛」各講兩遍)，只留一處講清楚、拿掉
//   純複誦的另一份，濃度提高但骨肉不變(玩家2026-07要求"深度校對但別寫死，表演交給AI")。
// v45：肯尼斯/韋伯/雨生龍之介的 home 改成直接對應新增地圖節點名稱(海特飯店/麥肯基宅/碼頭倉庫)，
//   讓御主資料的居所欄跟地圖真正一致(此前 home 欄從未被任何程式碼讀取，純未使用的死資料；新增地圖節點+戰爭分流見下方 Setup_FateWorld.gs)。
// v44：御主庫(SEED_MASTERS)首次深度校對(玩家2026-07要求·3組研究agent逐條查證+親自複核)——
//   凜「次女」誤植改「長女」(她是姊姊)、慎二「養子」誤植改「血親獨子」(他才是間桐親生子)、臟硯願望改「逃脫死亡+視奪杯為消遣」
//   (原「到達根源」是他早已放棄的舊初衷)、黑化間桐櫻回路90→50(她本人天賦與凜同級，無限魔力來自聖杯泥附體、非本身回路)、
//   衛宮切嗣回路35→15+魔術階位B→C(原作明寫他回路質量差、真正殺傷力在起源彈與戰術)、肯尼斯回路50→65+補住處(海特飯店)、
//   韋伯回路25→15+補住處(麥肯基宅，原作明寫他是時鐘塔墊底資質)、雨生龍之介願望改「見識新奇殺戮」(原「召喚惡魔」誤植)+補住處
//   (澪標川廢棄工房)。同步修 upgradeMasterCodex_ 從「只刷 persona/back/moe 三欄」改整列重寫+孤兒清理(比照英靈殿寫法)——
//   原本 circuits/home/wish 等會影響玩法的欄位(如迴路→敵御主魔力池)完全沒有刷新機制，種子校正的數值進不了已部署試算表。
//   詳見 SOLO_REFERENCE.md。
// v43：理查一世「驥足百般」與「神速」共用同一判定變數(analyze/first_strike短路互吞)，前者改純演出去除機制重複。
// v42：全種子庫(36位英靈)深度校對批修(玩家2026-07要求·6組研究agent逐條查證+親自複核)——
//   六圍/技能/寶具階級與名稱錯位共約40處(阿爾托莉雅筋力/佐佐木幸運/赫拉克勒斯拔王trait/吉爾伽美什4th戰數值/
//   迪盧木多技能誤植/伊斯坎達爾補神性/吉爾德萊拔道具作成+城牆防禦+改無鬚/百貌哈桑六圍/咒腕哈桑手臂側/
//   蘭斯洛特六圍對調+np正名/斯卡哈-Lancer技能/斯卡哈-Assassin改泳裝版/斯卡蒂拔女神trait+改深紫髮/
//   理查一世六圍+np正名+技能替換/阿基里斯技能正名+np階級/迦爾納神格歸屬修正/阿斯托爾福補寶具/
//   賽彌拉米斯np規模/尼祿np正名/玉藻前技能大修+改粉髮/牛若丸六圍/貞德三技能階級/伊絲塔附體對象修正/
//   莫德雷德補性格核心)。開膛手傑克-Berserker 整組重寫(原內容誤植Apocrypha刺客版、實為strange Fake本尊，
//   維持wars:'fake'標籤但內容全面校正)。尼祿「縱使三度迎來落日」改掛god_hand(lives:3)取代誤用的survive，
//   Router_Creation.gs/Seed_Rivals.gs同步支援 skill.lives 屬性覆寫復活命數。詳見 SOLO_REFERENCE.md。
//   全種子庫其餘4個divine_core持有者皆有明確階級；比照神性C的阿基里斯配B、神性A的伊絲塔/斯卡蒂配A，
//   美杜莎神性E-(全種子庫最弱神格)配D階；look 補服飾描述「深紫裹紗長裙」(原只有髮色/眼鏡/體態、獨缺服飾，
//   對照阿爾托莉雅/EMIYA/美狄亞皆有嵌服飾描述)。玩家2026-07實機比對種子發現。v40：赫拉克勒斯(Berserker) 拔戰鬥續行(survive)——與十二試煉(god_hand)重疊，fateStrike_ 判定順序 survive 先攔下致命傷、god_hand 燒命永遠輪不到，跟「十二條命每次真燒一命」設計矛盾(玩家2026-07回報實機發現)；Avenger版拔god_hand時本就保留survive、兩者互斥擇一才對。v39：原作貼合批修——①貞德 寶具正典化：La Pucelle(對人·火焰聖劍)為攻擊主寶具、吾主在此 Luminosité Eternelle 為【防禦寶具】(skills 掛 rho_aias A＝旗之守護常駐減傷·取代非正典的戰鬥續行)，兩者入 servantNpOptions_ 多寶具表；沿引擎慣例防禦寶具不標對軍(否則敵AI拿旗當炮轟)。②小黑 寶具正典化：UBW(她沒展開過·EMIYA 專屬)→鶴翼三連 Triple-Linked Crane Wings(對人 B·投影干將莫邪三連殺)、skills 拔 ubw fx。③六圍對原作參數表：赫拉克勒斯 筋A→A+(FSN)、蘭斯洛特 筋A→A+(Zero)、美狄亞 魔A→A++(FSN)、吉爾德萊 筋E→D(Zero)。④DEF_FX_.rho_aias note 拿掉寫死的「羅·埃亞斯」字樣→顯示持有者自己的技能名(貞德旗/EMIYA盾 各自正名)。v38：全面體檢批修——①阿爾喀德斯 拔自相矛盾的 神性A trait(strange Fake 原作：神性已被「泥」剝奪·persona 也明寫「捨神性」；殘留會平白吃 神殺/天之鎖/對神 剋神放大)→換 英雄。②美杜莎 神性補階 E-(原無階·引擎 fallback C 偏強)。③蘭斯洛特 補 人類 trait。④阿爾托莉雅 Avalon 錯字「永世惑曲」→「永世隔絕」。⑤蒼白騎兵 入 servantNpOptions_ 多寶具表(Doomsday Come 對界 EX／Kagome Kagome 對軍 A——原單字串同含對界+對軍、引擎恆取對界)。⑥servantNpOptions_ 改【精確比對種子真名】(原 indexOf 子字串→自創從者名含「無名」等即整組繼承 Ea/Enuma 選單·繞過 fx 白名單)。v37：Excalibur 接回概念 5 階——阿爾托莉雅/美遊 skills 補掛 fx:'excalibur'(比照庫丘林 gae_bolg/EMIYA ubw 的單寶具簽名模式)。此前全專案零產生者：誓約勝利之劍只寫在 np 字串(規模對城吃得到)，但 firstSignatureFx_/offenseTier_/CLASH_OFF_FX 全靠 hasFx_ 讀 skills→解放時拿不到 CONCEPT_TIER 5、無法概念壓制 陣地/對魔力/神核，敵方寶具對轟判斷也漏她。順修美遊 np 字串「對城 A++」→「對城 A」(對齊其 six.寶具 A；A++ 是從阿爾托莉雅抄來的殘留)。v36：英靈殿孤兒自動收斂——upgradeCodexPersonas_ 改為「ID 不在 SEED_SERVANTS 且 來源≠ai_gen」即刪(取代手動 OBSOLETE 名單)，一次清掉 pre-v29 殘留的「赫拉克勒斯-Archer」等舊列(奇怪的阿恰b叔)；AI 原創不動。v35：瘦寶具補招式意象(AI 敘述由種子保證·不靠模型記性)——Excalibur(阿爾托莉雅/人類 Saber)金色收束光炮、美杜莎 Bellerophon 天馬白光突刺、伊絲塔 An Gugalanna 天牛踏地熔毀、莫德雷德 Clarent Blood Arthur 血色奔雷。show-don't-tell 不受影響(真名照喊·描述仍屬內化素材)。v34：吉爾伽美什 補招牌寶具「全知全能之星 Sha Naqba Imuru」(insight·看穿本質)——命中+4＋看破奇襲(比照氣息感知)·中等被動(他懶得認真開)。v33：恩奇都 Enuma Elish 入 CONCEPT_TIER 6 階(可匹敵乖離劍)——恩奇都改多寶具(Enuma Elish 對界·enuma／Age of Babylon 對軍·gob)；offenseTier_ 根源修(解放寶具自身概念也計入·順修吉爾 Ea 漏吃概念壓制)。v32：蒼白騎兵 對官方面板全面校正——魔EX→A·幸E→C(補上次漏改·官方表=筋E/耐A/敏B/魔A/幸C/寶EX)、騎乘D→EX(乘風水人概念級)＋補對魔力C、技能正名(感染/無辜的世界/冥界的引導)、寶具補第二 Kagome Kagome(對軍A)＋Doomsday Come正名、align 中立中庸。v31：氣息感知升真機制——恩奇都 氣息感知 fx aim→sense；引擎新增 sense：守方階級≥攻方stealth→抵銷敵奇襲的命中先機＋要害一擊(senseNegate 橫跨兩處)。v30：恩奇都補正典技＋寶具正名——寶具真名「天地乖離開闢之星(吉爾的Ea名·掛錯)」→「世人啊冀以鎖繫神明 Enuma Elish」＋民之睿智Age of Babylon；變生→變容(正名)；拔非正典神性A技/trait(他是神造兵器非神裔)→換完全之形A(regen·大地再生)；補氣息感知A+(aim)。變容真·重分配/氣息感知真·破隱形＝引擎級·暫用proxy。v29：赫拉克勒斯(fake)正名為 Avenger·阿爾喀德斯(令咒歪曲·非單純Archer)——捨神性不死性換十二榮光→拔十二試煉(god_hand)、六圍升官方 A/B/A/A/B/A++、職技 對魔力A/復仇者A(god_slay·天生噬神)/單獨行動B、保有 心眼(真)B/勇猛E/戰鬥續行A+、寶具 Nine Lives+十二榮光+天風的篡奪者、persona 改阿爾喀德斯。引擎 god_slay 改 fx 驅動。v28：續補招牌+去矛盾技——赫拉克勒斯Archer 拔矛盾狂化D→心眼(真)A·陣地作成C→對魔力A(弓兵正典職技)、斯卡哈Assassin(泳裝) 氣息遮斷B→E(原作梗)、阿斯托爾福+單獨行動A(solo)、莫德雷德 寶具A→A+(Clarent Blood Arthur 原作威力)。v27：補招牌技標籤(能活用的給真fx)——斯卡哈+神殺(god_slay·對神性放大·引擎讀名觸發)、理查+獅子心(clear_mind)、阿基里斯+女神的寵愛(divine_core常駐減傷·冥河淬體)、莫德雷德+戰鬥續行(survive)、賽彌拉米斯+二重召喚(double_summon·金羊毛式無數值標籤)。v26：續查六圍盛標——迦爾納 耐A→C/魔B→D/幸D→E(Apocrypha 赤Lancer 官方參數·金鎧防禦已由 divine_core fx 模型化·底耐非A)、玉藻前 耐D→E/敏C→B/幸A→D(FGO 官方·幸A屬大幅盛)。v25：查證原作三修——佐佐木 幸A→E(FSN 無名劍客宿命·引擎讀幸算命中暴擊)、咒腕之哈桑 六圍正回原作(筋B/耐C/魔C/幸E·True Assassin FSN 參數表)、牛若丸 拔掉捏造的神性D(源義經純人類·divine 旗標會誤觸神殺/對神/疫病減傷)→換領袖氣質C·騎乘A→A+。v24：蒼白騎兵 寶具 A→EX(原作 Doomsday Come 是 EX 對界寶具·先前被寫低威力·規模對界原本就對)。v23：修規模盛標(誤標=偷改平衡)——美遊 Excalibur 對界→對城(同阿爾托莉雅·Saber install 同一劍)、賽米拉米斯 空中庭園 對界→對城(TYPE-MOON 設定=對城寶具 EX)。威力(six.寶具)與規模關鍵字兩件事·分開校。

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
  // 🧹 淘汰孤兒（根源自動收斂·取代舊 hard-code OBSOLETE 名單）：種子改名/汰換後，英靈殿殘留的
  //    舊種子列（ID 已不在 SEED_SERVANTS）自動清除——【嚴格只刪來源=='seed' 者】。
  //    AI 原創(recordOriginalHero_ 恆寫 'ai_gen'·自初版即如此) 與任何非 'seed' 來源列一律不碰，
  //    杜絕誤刪玩家自創英靈。由下往上刪避免位移。（例：pre-v29 的「赫拉克勒斯-Archer」等舊種子列一次收乾淨。）
  for (var j = d.length - 1; j >= 1; j--) {
    if (!byId[String(d[j][COL.HERO.ID])] && String(d[j][COL.HERO.SOURCE]) === 'seed') { hero.deleteRow(j + 1); n++; }
  }
  if (n) try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  return n;
}

// 升級既有御主殿：依種子整列重寫（依 ID 對應；不動客製御主）。
//   ⚠ 2026-07 修：原本只刷 人格／身世／萌點 三欄，circuits/home/wish/melee/magic_rank/appearance/magic
//   等會實際影響玩法的欄位(如迴路→敵御主魔力池 masterPoolMax_)完全沒有刷新機制——種子校正的數值
//   永遠進不了已部署試算表的既有列，只有全新建表才吃得到。改成比照 upgradeCodexPersonas_(英靈殿)
//   的整列重寫+孤兒清理，不再只是narrative欄位的局部補丁。
function upgradeMasterCodex_(ss) {
  var msh = ss.getSheetByName('御主殿');
  if (!msh || msh.getLastRow() <= 1) return 0;
  var d = msh.getDataRange().getValues();
  var byId = {};
  SEED_MASTERS.forEach(function (m) { byId[m.id] = m; });
  var existing = {};
  var n = 0;
  for (var i = 1; i < d.length; i++) {
    existing[String(d[i][COL.MASTER.ID])] = true;
    var m = byId[String(d[i][COL.MASTER.ID])];
    if (!m) continue;
    var row = masterToCodexRow_(m);
    msh.getRange(i + 1, 1, 1, row.length).setValues([row]);
    n++;
  }
  // 🆕 補入「種子有、御主殿還沒有」的新御主(新增御主後不必清表即生效)
  var toAdd = SEED_MASTERS.filter(function (m) { return !existing[m.id]; });
  if (toAdd.length) {
    var addRows = toAdd.map(masterToCodexRow_);
    msh.getRange(msh.getLastRow() + 1, 1, addRows.length, addRows[0].length).setValues(addRows);
    n += addRows.length;
  }
  // 🧹 淘汰孤兒：種子改名/汰換後殘留的舊種子列(ID 已不在 SEED_MASTERS)自動清除，只刪來源=='seed' 者。
  for (var j = d.length - 1; j >= 1; j--) {
    if (!byId[String(d[j][COL.MASTER.ID])] && String(d[j][COL.MASTER.SOURCE]) === 'seed') { msh.deleteRow(j + 1); n++; }
  }
  if (n) try { CacheService.getScriptCache().remove("FATE_MASTER_CODEX"); } catch (e) { }
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
    try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  }
  var master = ss.getSheetByName('御主殿');
  if (master && master.getLastRow() <= 1) {
    var mrows = SEED_MASTERS.map(masterToCodexRow_);
    master.getRange(2, 1, mrows.length, mrows[0].length).setValues(mrows);
    try { CacheService.getScriptCache().remove("FATE_MASTER_CODEX"); } catch (e) { }
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
