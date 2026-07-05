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
    align:'秩序・善', persona:{firstP:'我',look:'金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀',words:'騎士道・自我犧牲・壓抑的少女心',toMaster:'盡忠職守、初期保持距離，逐漸動搖',speech:'武人般簡潔鄭重、不擅言情',moe:'食量驚人卻吃相優雅',tic:'握劍時氣場驟冷'} },
  { id:'EMIYA-Archer', cls:'Archer', realName:'無名（EMIYA）', wars:['5th'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'千里眼',r:'C',fx:'aim'},{n:'投影魔術',r:'',fx:'projection'},{n:'七天盾·羅·埃亞斯',r:'',fx:'rho_aias'},{n:'無限劍製',r:'',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works（固有結界）／偽·螺旋劍 Caladbolg II（破斷重塑的流星劍·連射）',
    align:'中立・中庸', persona:{firstP:'我',look:'褐膚白髮・紅黑外衣的弓兵、厭世冷峻',words:'自我厭惡・藏起來的理想',toMaster:'嘴上不饒人、暗中守護',speech:'毒舌吐槽、嘴硬心軟',moe:'毒舌卻替人下廚',tic:'無奈嘆氣'} },
  { id:'庫丘林-Lancer', cls:'Lancer', realName:'庫·丘林', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'避矢加護',r:'B',fx:'evade_ranged'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'刺穿死亡之棘',r:'B',fx:'gae_bolg',causality:true}],
    traits:[{n:'神性',r:'B'}], np:'刺穿死棘之槍 Gáe Bolg（對人 B・因果逆轉必中）',
    align:'秩序・中庸', persona:{firstP:'俺',look:'藍髮赤瞳・精悍結實的青年槍兵、野性不羈',words:'痛快・重義',toMaster:'爽快直率、討厭被當棋子',speech:'豪爽粗獷、愛抱怨倒楣',moe:'一身本事卻衰運纏身的倒楣宿命',tic:'扛槍咧嘴笑'} },
  { id:'美杜莎-Rider', cls:'Rider', realName:'美杜莎', wars:['5th'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'A',魔力:'B',幸運:'E',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // ⚠ 2026-07 玩家貼萌娘百科原文覆核：官方「保有技能」清單＝魔眼A+/單獨行動C/怪力B/神性E-/天然呆，
    //   【沒有】女神的神核——之前補的 divine_core(D，舊session憑「神性弱→神核也弱」推論填的，未查證)拔除；
    //   改補原文確有列出、之前缺漏的單獨行動C(solo)。怪力維持B(原文亦寫B，另一次搜尋摘要誤植E、不採信)。
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'單獨行動',r:'C',fx:'solo'},{n:'魔眼',r:'A+',fx:'petrify'}],
    traits:[{n:'神性',r:'E-'},{n:'女神'}], np:'他者封印·鮮血神殿 Blood Fort Andromeda（對軍·結界）／騎英之手綱 Bellerophon（對軍 A+·喚出神駿天馬珀伽索斯·踏虛凌空·振翅撕裂長空、化作一往無前的純白光矢突刺）',
    // ⚠ 2026-07 修(玩家點名「衣裝跟眼罩呢」)：查證 TYPE-MOON Wiki，聖杯戰爭期間封印魔眼的是「眼罩」(緋色飾帶
    //   眼罩)，「眼鏡」其實是戰後日常生活才換戴的便服配件(配隱形眼鏡)，兩者搞混了；服裝也不是寬鬆裹紗長裙，
    //   是貼身的希臘風短式戰甲勁裝(黑色短裙+緋色飾邊)。已修正 look/tic。
    align:'混沌・善', persona:{firstP:'我',look:'紫長髮・貼身黑色戰甲勁裝(緋色飾邊)・眼罩封印魔眼的矯健女子、幽靜',words:'忠誠・深藏的溫柔',toMaster:'寡言而深情、極度護主',speech:'寡言低沉、必要才開口',moe:'怪力女神卻極度自卑',tic:'輕觸眼罩'} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A++',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'},{n:'金羊毛 Argon Coin',r:'EX',fx:'golden_fleece'}],
    traits:[{n:'人類'}], np:'萬符必應破戒 Rule Breaker（規則破壞者 C）',
    align:'中立・惡', persona:{firstP:'我',look:'紫袍兜帽・抱緣紅短劍的清麗魔女、疏離',words:'背叛的傷痕・渴望被信任',toMaster:'防備卻渴望真心相待',speech:'溫婉敬語、藏著試探',moe:'被真心對待會慌',tic:'抱著緣紅短劍'} },
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
    align:'中立・中庸', persona:{firstP:'拙者',look:'墨髮長刀・素樸和裝的清瘦劍客、淡泊洒脫',words:'閒適・無欲',toMaster:'隨遇而安、只求一戰',speech:'慢條斯理、偶帶禪意',moe:'非英雄卻有英雄氣的平凡',tic:'凝望飛燕'} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A+',耐久:'A',敏捷:'A',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'D',fx:'nullify_magic'}],
    // ⚠ 2026-07 修：拔戰鬥續行(survive)——fateStrike_ 判定順序 survive 先於 god_hand，
    //   只要致命傷前 hp>1 就先被 survive 免費接住(after 不再<=0)、十二試煉的燒命判定永遠輪不到，
    //   跟「十二條命、每次瀕死真的燒一命」的設計初衷矛盾(Avenger版拔十二試煉時才保留戰鬥續行，兩者本應互斥擇一)。
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    // ⚠ 2026-07 修：拔「王」trait——赫拉克勒斯終身未曾稱王(神話裡他是為贖罪替歐律斯透斯王打工的英雄，非君王)；
    //   十二試煉NP自身官方階級是B(六圍寶具欄仍是A沒錯，B是God Hand這把寶具本身的階級數字)。
    // ⚠ 2026-07 修(玩家點名「B叔的寶具不是攻擊」)：God Hand＝常駐復活寶具(god_hand fx 已模型化生效)，
    //   按💥卻把它當砲打＝出戲；狂化下 Nine Lives 又鎖死(見下註·已移給Avenger版)——故標記【常駐寶具】，
    //   前後端據此擋下攻擊解放(💥鈕灰化＋actionFateBattle 阻擋)，他的戰力＝普攻蠻力＋十二條命。
    traits:[{n:'神性',r:'A'}], np:'十二試煉 God Hand（B·十二條命·【常駐寶具】自動生效·狂化下無可解放的攻擊寶具）',
    // ⚠ 原作設定：射殺百頭 Nine Lives 是狂化壓制下【無法使用】的寶具(福瓦基體系被Berserker職階鎖住，僅原典/FGO非狂化狀態可用)，
    //   已從這版拿掉、移給下方 赫拉克勒斯-Avenger(偽聖杯·阿爾喀德斯)。這版狂化下就只有 God Hand。
    align:'混沌・狂', persona:{firstP:'（狂化·僅咆哮）',look:'巨軀岩肌・黑霧纏身的半神戰士、壓迫氣場',words:'狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',speech:'狂化無法言語、僅以低吼表達',moe:'偶爾理智回光的瞬間',tic:'以巨軀擋在主人身前'} },
  { id:'赫拉克勒斯-Avenger', cls:'Avenger', realName:'阿爾喀德斯（赫拉克勒斯）', wars:['fake'], gender:'男',
    six:{筋力:'A',耐久:'B',敏捷:'A',魔力:'A',幸運:'B',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'復仇者',r:'A',fx:'god_slay'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'勇猛',r:'E',fx:'morale'},{n:'戰鬥續行',r:'A+',fx:'survive'}],
    traits:[{n:'英雄'}], np:'射殺百頭 Nine Lives（對軍 A+·九連射·纏繞海德拉毒龍·乃至攻城之勢）／十二榮光 King\'s Order（A++·十二功業寶具群：神獸之裘否定人造兵器·怪鳥之箭·戰神軍帶）／天風的篡奪者 Reincarnation Pandora（EX·篡奪敵寶具）',
    // ⚠ 2026-07 修：align原「混沌・善」——原作明寫他被聖杯泥+令咒逼著從「中立・善」歪曲扭轉成「混沌・惡」，
    //   這是他淪為復仇者的關鍵設定，標善會抹掉這層悲劇轉折。
    align:'混沌・惡', persona:{firstP:'我',look:'膚色黝黑・頭覆獅皮長布的高大戰士(精悍而非狂化版的巨軀)、沉靜莊嚴',words:'對神之恨・高潔',toMaster:'沉穩有禮、不坐視無辜受難；然主若危及世界，不惜背弒主之名斬殺',speech:'溫和有度、談及神明恨意森冷',moe:'高潔英雄與噬神復仇者並存的矛盾',tic:'撫過肩頭的獅皮長布'} },
  // 第四次
  // ⚠ 2026-07 修：對魔力/單獨行動 原E/A+其實是「被聖杯泥養到第五次聖杯戰爭」後的數值——entry標wars含4th，
  //   第四次(冬木·凜之父當御主前)官方數值是對魔力C／單獨行動A，兩次戰爭的數值被錯放混用；領袖氣質A→A+對齊官方。
  { id:'吉爾伽美什-Archer', cls:'Archer', realName:'吉爾伽美什', wars:['4th','fake'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'領袖氣質',r:'A+',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'},{n:'全知全能之星 Sha Naqba Imuru',r:'EX',fx:'insight'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）／乖離劍 Ea（天地乖離·封藏的至高兵裝，傲慢時不出鞘）',
    align:'混沌・善', persona:{firstP:'吾',look:'金髮赤瞳・金鎧加身的俊美王者、睥睨的威壓',words:'傲慢・收藏家',toMaster:'視為雜種、幾乎不從令，唯對少數有趣之人起興致',speech:'居高臨下、稱人「雜種」',moe:'傲慢底下的孤獨',tic:'金色波紋中抽出寶具'} },
  // ⚠ 2026-07 修：對魔力原C→B(官方「B階可擋三節詠唱以下」的常引細節)；愛之痣原B→C(官方「愛の黒子C」)；
  //   「戰鬥續行」查無此技能歸他所有，他真正的第二技能是心眼(真)B(危險預知/迴避判斷)，已替換。
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A+',魔力:'D',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'愛之痣',r:'C',fx:'lovespot'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'anti_magic_lance'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{firstP:'我',look:'墨綠髮・面有愛之痣的俊美騎士、謙恭',words:'忠義・哀愁',toMaster:'絕對忠誠，渴望堂堂正正之戰',speech:'謙恭有禮、壓抑情感',moe:'愛之痣令女性傾心的悲劇宿命',tic:'雙槍交握行禮'} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾（征服王）', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'D',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // ⚠ 2026-07 補：官方參數表明列神性C(源於「宙斯之子」的傳說地位)，原漏收此技能。
    skills:[{n:'領袖氣質',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'神性',r:'C',fx:'divine'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX·固有結界召喚萬軍）／神威的車輪 Gordius Wheel（雷神戰車·衝鋒）',
    align:'中立・善', persona:{firstP:'余',look:'紅髮虬髯・披風加身的魁梧征服王、豪邁',words:'征服・雅量',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',speech:'豪爽大笑、稱人「小鬼」',moe:'征服野心與孩子氣並存',tic:'攤開世界地圖'} },
  // ⚠ 2026-07 修：陣地作成原C→B(官方一致給B)。拔「道具作成」——他是少數沒有此技能的Caster，官方設定他
  //   放棄道具作成換取寶具的召喚能力，這是他很出名的角色特色，寫成有反而抹掉這個梗。拔「城牆防禦」——查無
  //   此技能歸他所有，標準Caster職階技能只有陣地作成+道具作成兩項，這個疑似捏造(此fx其餘無人使用，非刪功能)。
  //   外觀「青鬚」原是他自稱化名(藍鬍子)的形象，官方設計他其實沒有鬍子(甚至沒眉毛)——刻意的反差惡搞，已修正。
  //   螺湮城教本(summon_horror)/召喚海怪 為玩家既定設計、經查證符合原作「深淵召喚巨大海怪」的描述，維持不動。
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯', wars:['4th'], gender:'男',
    six:{筋力:'D',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'A+'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本 Prelati\'s Spellbook（深淵召喚・召喚大海怪）',
    align:'混沌・惡', persona:{firstP:'我',look:'捧巨書的清瘦貴族(無鬚無眉)、癲狂',words:'虔誠扭曲・對「聖女」的執念',toMaster:'與共鳴其瘋狂的御主引為摯友；否則貌合神離',speech:'時而文雅、時而癲狂咆哮',moe:'對「神不在場」的悲憤',tic:'淚流滿面的狂笑'} },
  // ⚠ 2026-07 修：敏捷B→A、魔力D→C、寶具D→B，第四次聖杯戰爭材料一致給這三個階級。
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想幻像',r:'',fx:'zabaniya'}],
    traits:[{n:'人類'}], np:'妄想幻像 Zabaniya: Delusional Illusion（對人·分裂為百種人格·最多同時八十體）',
    align:'秩序・惡', persona:{firstP:'我們',look:'骷髏面具・黑袍裹身的刺客、詭譎',words:'群體・無數人格',toMaster:'服從，視暗殺為信仰',speech:'多重聲線交疊低語',moe:'眾多人格共用一具身軀的詭異',tic:'骷髏面具下變換面孔'} },
  { id:'咒腕之哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（咒腕）', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'妄想心音',r:'',fx:'zabaniya'},{n:'投影魔術',r:'C',fx:'projection'},{n:'自我改造（詛咒之腕）',r:'C',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（對人·掏出心臟之影即死）',
    // ⚠ 2026-07 修：詛咒手臂原寫「左」臂，官方(撒旦之手嫁接)是「右」臂，已修正。
    align:'秩序・惡', persona:{firstP:'我',look:'骷髏面具・詛咒繃帶纏滿右臂的暗殺者、肅殺',words:'詛咒之腕・初代之名',toMaster:'冷淡服從、以暗殺為天職',speech:'低沉簡短、必要才開口',moe:'沉默卻守諾',tic:'無聲潛近'} },
  // ⚠ 2026-07 修：官方參數是 筋A／耐A／敏A+／魔C／幸B／寶A——A+屬於敏捷，筋力數值原被錯放；
  //   狂化原B→C(官方一致給C)；np真名原「騎士不為孤軍」語意有誤，官方原名「騎士は徒手にて死せず」
  //   通行中譯是「騎士不死於徒手」，已修正。
  { id:'蘭斯洛特-Berserker', cls:'Berserker', realName:'蘭斯洛特（湖之騎士）', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無毀的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'},{n:'人類'}], np:'騎士不死於徒手 Knight of Owner（萬物化為兵裝）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅低吼）',look:'黑霧纏繞漆黑鎧甲的騎士、悲愴',words:'悔恨・對亞瑟王的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',speech:'狂化無法言語、僅餘低吼',moe:'渴望被懲罰的扭曲忠誠',tic:'抓起任何物件化為兵裝'} },
  // FAKE 樣本
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['fake'], gender:'無',
    // ⬇️ 基線＝非理想御主下的恩奇都(供魔不足)。與銀狼(獵犬御主，原作真正的御主)結契才回全盛全A·寶A++(masterSynergySix_)。
    // ⚠ 2026-07 修：筋力原C——原作明講「變容」使他六圍浮動範圍恆在A~B之間、從不掉到C，即使供魔不足的基線亦同，
    //   已補至B(下限)。
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'B',幸運:'-',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'天之鎖',r:'A',fx:'chain'},{n:'氣息感知',r:'A+',fx:'sense'},{n:'變容',r:'A',fx:'shapeshift'},{n:'完全之形',r:'A',fx:'regen'}],
    traits:[{n:'神造兵器'},{n:'病死宿命'}], np:'世人啊，冀以鎖繫神明 Enuma Elish（對界 A++~EX·對肅正寶具·反星球/人類破壞行為增幅·可匹敵乖離劍）／民之睿智 Age of Babylon（大地召出萬千劍槍鎖齊射·抵銷王之財寶）',
    align:'中立・中庸', persona:{firstP:'我',look:'青綠長髮・中性無垢的神造之軀、平和',words:'純真・追尋摯友',toMaster:'溫和而疏離，心繫吉爾伽美什',speech:'平和中性、無機質卻溫柔',moe:'神造兵器卻最有人性',tic:'歪頭觀察'} },
  // 斯卡哈 三職階
  // ⚠ 2026-07 修：對魔力原C→A(官方「可無效A階以下魔術」)；神殺原A→B、魔境的智慧原A→A+，官方技能表一致。
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'C',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'神殺',r:'B',fx:'god_slay'},{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'魔境的智慧',r:'A+',fx:'mage_realm'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg',causality:true}],
    traits:[{n:'人類'}], np:'貫穿死翔之槍 Gáe Bolg Alternative（對人 B+·釘空必中＋投擲斷命）／死亡滿溢的魔境之門 Gate of Skye（對軍 A+·吸入影之國）',
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・緊身戰衣的妖豔女王、冷峻',words:'影之國女王・武人',toMaster:'嚴厲考校、唯認可強者，師者之威',speech:'偶露揶揄的嚴師語氣',moe:'渴望一死卻不得的寂寞',tic:'魔槍杵地'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'E',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'人類'}], np:'蹴穿死翔之槍 Gáe Bolg Alternative（對人 B+·影縫穿刺）',
    // ⚠ 2026-07 修：外觀原「暗裝潛行」——這個Assassin版是夏季活動限定的泳裝造型，官方立繪是比基尼/沙灘裝，
    //   跟「暗殺潛行」的調性正好相反，已修正為海灘造型(仍保留她一貫的冷峻女王氣場)。
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・泳裝海灘造型的致命女王(夏日Assassin版)、冷冽',words:'影・潛行的女王',toMaster:'冷眼試探、出手無情，認可方鬆動',speech:'低冷簡短、一針見血',moe:'影中女王的致命優雅',tic:'融入暗影'} },
  { id:'斯卡蒂-Caster', cls:'Caster', realName:'斯卡哈·斯卡蒂（Skadi）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'C',魔力:'EX',幸運:'D',寶具:'A'},
    classSkills:[{n:'陣地作成',r:'EX',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'女神的神核',r:'A',fx:'divine_core'},{n:'原初符文',r:'EX',fx:'rune'},{n:'大神的睿智',r:'B+',fx:'analyze'},{n:'冰凍暴風雪',r:'B',fx:'petrify'}],
    // ⚠ 2026-07 修：拔「女神」trait——FGO正式trait只有神性/巨人/人型三項，「女神」只是台詞稱呼非機制標籤；
    //   np移除「開戰寶具」標籤——Gate of Skye是任何時機都能發動的隊伍增益寶具，非開場限定，跟官方分類矛盾；
    //   髮色原「銀紫」→「深紫」，週邊/官方描述一致是深紫髮配紅瞳，銀色成分查無依據(順手補上紅瞳)。
    traits:[{n:'神性'},{n:'巨人'}], np:'通往死亡滿溢的魔境之門 Gate of Skye（對軍 A+·影之城的祝福）',
    align:'中立・善', persona:{firstP:'吾',look:'深紫長髮紅瞳・符文環繞的冰雪女神、母性威儀',words:'北歐女神・嚴母',toMaster:'溫柔包容、暗藏神威',speech:'溫柔莊重如神祇',moe:'害羞時的可愛',tic:'垂眸微笑'} },
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
    align:'中立・善', persona:{firstP:'余',look:'金髮碧眼・佩劍披風的青年王者、昂揚',words:'浪漫・獅心',toMaster:'坦率信賴，視為冒險夥伴',speech:'熱情奔放、孩子氣的興奮',moe:'對亞瑟王傳說狂熱崇拜、活像追星少年',tic:'眼睛發亮談英雄'} },
  // ⚠ 2026-07 修：wars維持標'fake'(玩家定案，不論正史出處)。「神威的車輪」查無此名歸他，機制(致命傷保留一命)
  //   對應的真正技能名是「戰鬥續行」，已正名；「貫穿戰場的流星」官方階級是B+非A，已修正；「守護領域的車輪」
  //   實為除踵無敵的個人被動、非車輪/領域類效果，描述已調整避免誤導成範圍技。
  { id:'阿基里斯-Rider', cls:'Rider', realName:'阿基里斯', wars:['fake'], gender:'男',
    six:{筋力:'B+',耐久:'A',敏捷:'A+',魔力:'C',幸運:'D',寶具:'A'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'神性',r:'C',fx:'divine'},{n:'女神的寵愛',r:'B',fx:'divine_core'},{n:'勇猛',r:'A+',fx:'morale'},{n:'戰鬥續行',r:'A',fx:'survive'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'貫穿戰場的流星（對人 B+）／除踵無敵（自身免疫致命傷·唯腳踵例外）',
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮健碩・駕戰車執長槍的半神戰士、張狂',words:'自由奔放・重情',toMaster:'豪爽不羈，認可便傾力相助',speech:'張狂自信、不服輸',moe:'驕傲底下的孩子氣',tic:'咧嘴挑釁'} },
  // ⚠ 2026-07 大修：原內容整套(解體聖母/骷髏孩童/氣息遮斷/情報抹消)其實是《Apocrypha》黑方刺客版傑克的設定，
  //   跟這裡標的《strange Fake》Berserker版(福拉特的從者)完全是兩個不同角色——已改寫為 strange Fake 本尊：
  //   無固定實體、靠「千貌」變化成任何「被推測是開膛手真身」的人事物；狂化被自身瘋狂具現的本質悖論封印(負負得正)
  //   而理智清醒，故 classSkills 狂化 fx 刻意留空(不吃機制加成/懲罰)；六圍原作未給明確數值，取中庸值代表工程近似。
  { id:'開膛手傑克-Berserker', cls:'Berserker', realName:'開膛手傑克', wars:['fake'], gender:'異',
    six:{筋力:'C',耐久:'C',敏捷:'B',魔力:'B',幸運:'D',寶具:'B'},
    classSkills:[{n:'狂化(已封印)',r:'-',fx:''}],
    skills:[{n:'千貌',r:'A',fx:'shapeshift'}],
    traits:[{n:'瘋狂具現'}], np:'其乃不值悲劇之終末 Natural Born Killers（對軍 B・分裂百餘化身應戰）／悪霧は倫敦の暁と共に滅び逝きて From Hell（對人・可變E~A+・化作巨大幻想種、以周遭人類恐懼為力）',
    align:'混沌・中庸', persona:{firstP:'我',look:'無固定實體・以中性平靜嗓音現身，戰時藉「千貌」化身任何「被推測為開膛手真身」的人事物、借其形借其技',words:'無名・千貌・悖論中的清醒',toMaster:'耐心包容其笨拙的御主，帶幾分優雅的無奈',speech:'溫雅從容、近乎詩意',moe:'連自己真實身分都不知道的執著追尋',tic:'身形在霧氣中悄然變換'} },
  { id:'蒼白騎兵-Rider', cls:'Rider', realName:'蒼白騎兵（Pale Rider）', wars:['fake'], gender:'異',
    six:{筋力:'E',耐久:'A',敏捷:'B',魔力:'A',幸運:'C',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'EX',fx:'ride'}],
    skills:[{n:'感染',r:'A',fx:'petrify'},{n:'無辜的世界',r:'EX',fx:'unreadable'},{n:'冥界的引導',r:'EX',fx:'territory'}],
    traits:[{n:'災厄'},{n:'疫病'}], np:'到來吧、冥途啊 Doomsday Come（對界 EX·以御主為起點的模擬冥界結界·可連肉體拉入）／劍、饑饉、死、獸 Kagome Kagome（對軍 A·結界內具現致死之物·天啟四騎士之力）',
    align:'中立・中庸', persona:{firstP:'…',look:'蒼白朦朧・若有似無的騎影、無形死氣',words:'瘟疫・無形',toMaster:'無言依附御主之願、以其為冥界起點',speech:'幾乎不開口、偶以孩童般破碎短語回應',moe:'無辜與災厄並存的詭異',tic:'無聲蔓延的寒疫'} },
  { id:'狂信者哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（狂信者）', wars:['fake'], gender:'女',
    six:{筋力:'C',耐久:'B',敏捷:'A',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'A-',fx:'stealth'}],
    skills:[{n:'狂信',r:'A',fx:'clear_mind'},{n:'幻想血統',r:'',fx:'zabaniya'},{n:'自我改造',r:'A',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'幻想血統 Zabaniya（對人・對軍・再現十八位哈桑之奇蹟）',
    // ⚠ 2026-07 修：她從未真正繼承「哈桑」之名，白骨面具是正式繼承者的專屬標誌，她其實是用面紗遮臉非硬質面具；
    //   瞳色原「粉紅」多筆來源指向「紫瞳」，已修正；speech原多打一個「不」字變成「不宗教式」跟她狂熱信仰的
    //   人設核心完全矛盾，已刪去衍字。
    align:'秩序・善', persona:{firstP:'我',look:'黑長直雙麻花辮・紫瞳・面紗半遮(未繼哈桑名·非骷髏面具)的纖細刺客、狂熱',words:'信仰・初代之名',toMaster:'虔敬奉獻、視契約為聖戰',speech:'虔敬低語、談信仰激越',moe:'為信仰殉道的純粹狂熱',tic:'赤足無聲而至'} },
  { id:'伊絲塔-Archer', cls:'Archer', realName:'伊絲塔', wars:['fake'], gender:'女',
    six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'A',幸運:'B',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    // ⚠ 2026-07 修：女神的神核(divine_core A)拔除——查證時發現原本引用的「B階」出自
    //   《FGO Material IV》，是【附身凜】版本(FGO/Babylonia)的專屬資料，我們這位明確是【附身菲莉雅】
    //   的 strange Fake 版本(見下方附體修正註解)，查無該版本專屬來源確認她持有此技能，比照美杜莎同一
    //   標準(查不到該版本確實有就不給)拔除，只留神性(divine)本體。
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'魔力放出',r:'A',fx:'burst'}],
    traits:[{n:'神性'},{n:'女神'}], np:'天之公牛・山海熔毀的天牛 An Gugalanna（對軍 A+·自天界召落神獸天之公牛·踏地則山崩海沸·所過之處盡化熔毀焦土）',
    // ⚠ 2026-07 修：附體對象原「借凜之身」——那是FGO(Babylonia)限定設定，strange Fake小說裡她附體的其實是
    //   人造人「菲莉雅」，髮色瞳色也一併改回菲莉雅的愛因茲貝倫外貌(白髮紅瞳)，不再沿用凜本人的黑髮。
    align:'混沌・善', persona:{firstP:'本小姐',look:'白髮紅瞳・借人造人菲莉雅之身(非凜)的金星女神、高傲',words:'任性・傲嬌',toMaster:'頤指氣使，意外講義氣',speech:'傲嬌口吻、愛炫耀',moe:'見閃亮寶物就走不動',tic:'哼一聲撇頭'} },
  // 客串英靈
  { id:'莫德雷德-Saber', cls:'Saber', realName:'莫德雷德', wars:['客串'], gender:'女',
    six:{筋力:'B+',耐久:'A',敏捷:'B',魔力:'B',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'C',fx:'morale'},{n:'戰鬥續行',r:'B',fx:'survive'}],
    traits:[{n:'龍'},{n:'騎士'}], np:'我的憤怒不會退去 Clarent Blood Arthur（對軍 A+·深紅雷光自劍身爆湧·裹挾弒父之恨轟成撕裂天地的血色奔雷）',
    // ⚠ 2026-07 補：原人設把她寫得偏溫和(不肯承認的少女心)，補上原作核心性格特徵——她堅持以陽性口吻自稱、
    //   對「被當女性看待」有強烈牴觸，這是Apocrypha原作最鮮明的性格核心之一，原描述把這點磨得太淡。
    align:'混沌・中庸', persona:{firstP:'我',look:'金髮馬尾・銀甲纏紅雷的反逆騎士、粗豪',words:'叛逆・倔強',toMaster:'桀驁不馴，認可便死忠，堅持以男性自居、忌諱被當女性看待',speech:'粗豪挑釁、稱亞瑟王「父親」',moe:'狂傲下渴求父親認同',tic:'掀面甲咆哮'} },
  // ⚠ 2026-07 修：魔力D→B、幸運E→D，多筆來源一致。np「Vasavi Shakti」原寫「梵天弒神之槍」——這把槍其實是
  //   因陀羅為騙走他鎧甲而授予的，跟梵天無關(梵天是另一把「梵天慈悲之槍」的神格，兩把寶具的神格被錯放互換)，
  //   已修正歸屬。look「太陽之鎧加身」語感像可穿脫裝備——那副鎧甲其實是他出生就長在身上的一部分，只能靠
  //   割下獻祭才能拿掉(因陀羅設局的關鍵)，已改用「與生俱來」強調不可拆卸。
  { id:'迦爾納-Lancer', cls:'Lancer', realName:'迦爾納', wars:['客串'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'B',幸運:'D',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'騎乘',r:'A',fx:'ride'}],
    skills:[{n:'神性',r:'A',fx:'divine'},{n:'魔力放出（炎）',r:'A',fx:'burst'},{n:'太陽之鎧',r:'A',fx:'divine_core'}],
    traits:[{n:'神性'},{n:'英雄'}], np:'日輪啊化作鎧甲吧 Kavacha and Kundala（與生俱來·不滅黃金鎧）／穿刺死亡之槍 Vasavi Shakti（對神 EX·因陀羅授予的弒神之槍）／梵天慈悲之槍 Brahmastra',
    align:'秩序・善', persona:{firstP:'我',look:'白髮・與生俱來融於血肉的太陽之鎧(唯獻祭可卸)、高潔',words:'施與者・恩怨分明',toMaster:'沉默守諾、有求必應',speech:'極簡寡言、直言不諱',moe:'面冷心熱、被誤解也不辯解',tic:'平靜直視'} },
  // ⚠ 2026-07 修：對魔力原C——他隨身攜帶的破魔書「破卻一切的萬能福音」常駐把對魔力拉到A階，這是角色機制的
  //   常駐效果非戰鬥觸發，已修正。np原漏收第四把寶具「阿爾加莉亞的陷阱」——Apocrypha原作他共有四把寶具，
  //   這把是小說裡摧毀黑方指揮權冠冕的關鍵寶具，已補上。
  { id:'阿斯托爾福-Rider', cls:'Rider', realName:'阿斯托爾福', wars:['客串'], gender:'男',
    six:{筋力:'D',耐久:'D',敏捷:'B',魔力:'C',幸運:'A+',寶具:'C'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'單獨行動',r:'A',fx:'solo'},{n:'直感',r:'A',fx:'first_strike'},{n:'怪力',r:'C',fx:'str_up'},{n:'純真無垢',r:'B',fx:'clear_mind'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'觸發傳說的魔笛 La Black Luna／阿爾加莉亞的陷阱 Trap of Argalia—Down with a Touch!（觸即倒·對人）／破卻一切的萬能福音 Casseur de Logistille（解除魔術·對人）／駿馬怪鳥 Hippogriff（神話之翼·飛翔）',
    align:'混沌・善', persona:{firstP:'我',look:'粉髮長辮・分不清性別的元氣騎士、爛漫',words:'天真爛漫・無憂',toMaster:'活力滿滿，全心信賴',speech:'想到啥說啥、元氣滿滿',moe:'記性差卻最忠誠',tic:'蹦蹦跳跳'} },
  // ⚠ 2026-07 修：氣息遮斷C→C+；二重召喚A→B(官方一致給B，這是她獨有的「同時持有刺客與魔術師雙職階技能」的
  //   稀有技能)；np規模原「對城」→「對界」——官方明確強調「這是對界寶具，不是對城寶具」，已修正。
  { id:'賽彌拉米斯-Assassin', cls:'Assassin', realName:'賽彌拉米斯', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'A',寶具:'A+'},
    classSkills:[{n:'氣息遮斷',r:'C+',fx:'stealth'}],
    skills:[{n:'二重召喚',r:'B',fx:'double_summon'},{n:'陣地作成（空中庭園）',r:'EX',fx:'territory'},{n:'道具作成（毒）',r:'A',fx:'crafting'}],
    traits:[{n:'神性'},{n:'人類'}], np:'虛榮的空中庭園 Hanging Gardens of Babylon（對界 EX·浮空要塞·毒殺結界）',
    align:'混沌・惡', persona:{firstP:'妾',look:'華貴盛裝・君臨空中庭園的毒后、威嚴',words:'毒后・貞潔的執念',toMaster:'高高在上，唯認可強主',speech:'絕對支配的語氣、不容質疑',moe:'被冒犯時的羞怒',tic:'抬手降毒'} },
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
    align:'混沌・善', persona:{firstP:'余',look:'金髮綠瞳・紅衣華美的少女皇帝、張揚',words:'自戀・藝術',toMaster:'熱情張揚，渴望被讚美',speech:'張揚熱情、滿口藝術',moe:'迷之自信、其實非常努力',tic:'振臂高歌'} },
  // ⚠ 2026-07 修：寶具A→B、陣地作成A→C(官方明講「她的個性不適合搞這套」，只有C階)。「道具作成」改造成她的
  //   專屬技能「狐之嫁入」EX階，非通用B階道具作成；「高速神言」查無出處，替換為她真正的第二技能「呪術」EX；
  //   「狐之治癒」查無出處，保留「變化」一項固有技能。髮色原「金髮」→「粉髮」，官方立繪一致是粉色雙馬尾狐耳。
  //   拔「八純之鎖」——查無此寶具歸屬她，疑似捏造。
  { id:'玉藻前-Caster', cls:'Caster', realName:'玉藻前', wars:['客串'], gender:'女',
    six:{筋力:'E',耐久:'E',敏捷:'B',魔力:'A',幸運:'D',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'C',fx:'territory'},{n:'狐之嫁入',r:'EX',fx:'crafting'}],
    // ⚠ 2026-07 修(同 B叔常駐寶具案)：水天日光＝治癒結界、非攻擊——標記【常駐寶具】擋攻擊解放，
    //   並補 regen fx 讓治癒結界真的常駐生效(每回合涓流回血·引擎既有機制)。
    // ⚠ 2026-07 官方材料校正(玩家貼原文)：①咒術EX＝荼吉尼天法·「以自己肉體為素材編排的物理現象，故能無視
    //   對魔力」——fx 由 fast_cast 改 divine_age(引擎既有「凌駕對魔力·殘三成」機制·傷害加成同量12×階)，
    //   FGO 強化後名「咒層・廣日照」，本作保留原典咒術EX；②變化A(借體成形)✓；③狐之嫁入EX＝道具製作自行
    //   改造(crafting)✓ 原本就對。
    skills:[{n:'呪術',r:'EX',fx:'divine_age'},{n:'變化',r:'A',fx:'shapeshift'},{n:'水天日光天照八野鎮',r:'B',fx:'regen'}],
    // ⚠ 神性補階 A(官方「日本神話中最高級別的神明」·天照分靈)——原無階、divineRankOf_ fallback 成 C，
    //   神殺/天之鎖/對神寶具對她的剋制被低估(高神性＝高威能亦高弱點，本就是統一縮放的設計)。
    traits:[{n:'神性',r:'A'},{n:'野獸'}], np:'水天日光天照八野鎮（B·治癒結界·【常駐寶具】戰鬥中徐徐治癒·非攻擊解放）',
    align:'混沌・中庸', persona:{firstP:'妾身',look:'粉髮狐耳・和服盛裝的九尾狐、甜膩',words:'賢妻・腹黑',toMaster:'撒嬌又掌控，黏人',speech:'毒舌吐槽裹著糖衣',moe:'賢妻外皮下的掌控慾',tic:'狐耳輕顫'} },
  // ⚠ 2026-07 修：官方六圍為 D/C/A+/B/A/A+，耐久/敏捷/魔力/幸運/寶具原值幾乎整排偏低估，已對齊；
  //   天狗之兵法B→A。
  { id:'牛若丸-Rider', cls:'Rider', realName:'源義經（牛若丸）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'A+',魔力:'B',幸運:'A',寶具:'A+'},
    classSkills:[{n:'騎乘',r:'A+',fx:'ride'},{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'領袖氣質',r:'C',fx:'morale'},{n:'天狗之兵法',r:'A',fx:'first_strike'},{n:'牛若之武略',r:'B',fx:'tactics'}],
    traits:[{n:'人類'}], np:'壇之浦・八艘飛（對人・神速跳躍）',
    align:'混沌・中庸', persona:{firstP:'牛若',look:'黑髮武裝・嬌小靈動的武家少女、赤誠',words:'悲劇武者・純真',toMaster:'純粹追隨，赤誠相待',speech:'談起兄長時滿眼崇拜',moe:'對兄長近乎信仰的崇拜（卻被其所害）',tic:'八艘飛躍'} },
  // ⚠ 2026-07 換版：Ruler版(對魔力EX+rho_aias A+啟示/真名看破三重疊加)全循環賽模擬測出全種子庫最強
  //   (36位互毆99%+勝率、僅2人技能位階能繞過其對魔力)，玩家要求換成官方泳裝Archer版——完全不同的
  //   輕量支援型kit(對魔力僅B、無rho_aias、無first_strike/analyze)，數值不再失控。
  { id:'貞德-Archer', cls:'Archer', realName:'貞德', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'A',敏捷:'B+',魔力:'C',幸運:'A',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'單獨行動（名流）',r:'EX',fx:'solo'}],
    skills:[{n:'享受無盡夏日！',r:'A',fx:''},{n:'水邊聖女（海豚）',r:'A+',fx:''},{n:'從者鼓舞！',r:'B',fx:'morale'}],
    traits:[{n:'人類'}], np:'豐收之海啊，伴隨著喜悅 Des Oceans d\'Allegresse（對軍·祈禱獻海·召喚幻獸(藍鯨/巨齒鯊等)齊聚助陣）',
    align:'秩序・善', persona:{firstP:'我',look:'金髮碧眼・清爽泳裝的聖女(夏日版·非鎧甲Ruler)、陽光',words:'夏日・海豚',toMaster:'拉著手鼓舞打氣，卻讓對方會錯意',speech:'爽朗熱情、偶爾促狹',moe:'聖女褪下鎧甲後的天真爛漫',tic:'喚來海豚嬉戲'} },
  { id:'美遊-Saber', cls:'Saber', realName:'美遊·埃德費爾特（Saber install）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'B',fx:'burst'},{n:'沉著冷靜',r:'B',fx:'clear_mind'},{n:'誓約勝利之劍',r:'A',fx:'excalibur'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'誓約勝利之劍 Excalibur（對城 A·聖劍之光收束於劍尖·解放為撕裂大地、直貫蒼穹的金色巨炮）',
    align:'秩序・善', persona:{firstP:'我',look:'黑髮藍裙・Saber install 的內斂少女、沉靜',words:'認真・背負宿命',toMaster:'認真盡責，沉默守護',speech:'寡言低語、不擅表達',moe:'認真過頭的笨拙',tic:'垂眸淺應'} },
  { id:'小黑-Archer', cls:'Archer', realName:'克洛伊·馮·愛因茲貝倫（Archer install）', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'C',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'投影魔術',r:'B',fx:'projection'},{n:'千里眼',r:'C',fx:'aim'}],
    traits:[{n:'人類'}], np:'鶴翼三連 Triple-Linked Crane Wings（對人 B·投影干將・莫邪，雙劍交擊、三連必殺的劍技）',
    align:'混沌・中庸', persona:{firstP:'本小姐',look:'褐膚白髮・Archer install 的活潑少女、促狹',words:'腹黑・好戰',toMaster:'又黏又愛逗弄，戰意旺盛',speech:'促狹挑釁、撒嬌耍賴',moe:'嘴上捉弄其實很重感情',tic:'吐舌挑釁'} },
  { id:'伊莉雅-Caster', cls:'Caster', realName:'伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'B',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'},{n:'道具作成（魔杖・露比）',r:'C',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'魔力放出',r:'B',fx:'burst'},{n:'純真無垢',r:'A',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'全彈發射・魔力炮 Quintett Feuer（多重魔力炮擊）',
    align:'中立・善', persona:{firstP:'我',look:'白髮紅瞳・魔杖在手的魔法少女、元氣',words:'天真・善良',toMaster:'純真信賴，朝氣蓬勃',speech:'活潑直率、元氣滿滿',moe:'愛哭卻在關鍵時刻勇敢',tic:'眼眶泛淚還硬撐'} }
];

// 御主 persona 為 4 段頓號（日常表象・真實內裡・喜歡・厭惡）供 TRAIT/PREF 解析；
// back＝身世生平（show-don't-tell 的演出依據）、moe＝反差萌點。
var SEED_MASTERS = [
  // 第五次
  {id:'衛宮士郎-5th',  name:'衛宮士郎', gender:'男', appearance:'紅褐短髮的高中生，樸素襯衫',   war:'5th', magic:'投影／強化',          circuits:30, melee:'D', magic_rank:'D', home:'冬木·深山町', wish:'成為正義的伙伴',          persona:'樂於助人的好好先生・扭曲的自我犧牲・厭惡見死不救', back:'冬木大火倖存的孤兒、繼承切嗣的理想', moe:'自己滿身傷還先擔心別人'},
  // ⚠ 2026-07 修：back原「次女」→「長女」(凜是姊姊、櫻才是被送養的妹妹，原寫反了)；circuits45→50(原作她的魔術回路質量遠超同齡水準，公認罕見)。
  {id:'遠坂凜-5th',    name:'遠坂凜', gender:'女', appearance:'黑長雙馬尾、紅衣黑裙，傲然',     war:'5th', magic:'寶石魔術',            circuits:50, melee:'C', magic_rank:'A', home:'遠坂宅',     wish:'見證聖杯・不負遠坂之名',  persona:'人前完美的優等生・刀子嘴豆腐心・厭惡示弱與失態', back:'遠坂家長女（櫻是被送養的妹妹）、父親死於上屆聖杯戰爭', moe:'人後迷糊'},
  // ⚠ 2026-07 修：back原「養子」寫反——慎二才是間桐家血親獨子，妹妹櫻才是被收養進來頂替魔術後嗣的那位。
  {id:'間桐慎二-5th',  name:'間桐慎二', gender:'男', appearance:'藍髮神經質青年，刻薄表情',   war:'5th', magic:'魔術迴路微弱・依賴從者', circuits:15, melee:'E', magic_rank:'E', home:'間桐宅',     wish:'被認可・奪取勝利',        persona:'自信張揚的表象・自卑虛榮・厭惡比自己強的人', back:'間桐血親獨子（櫻才是養女）、迴路微弱不被家族認可', moe:'色厲內荏一戳就破'},
  // ⚠ 2026-07 修：wish原「到達根源」是他早已放棄的舊日初衷——如今只剩逃脫死亡，且把奪杯戰爭當成餘生的消遣取樂。
  {id:'間桐臟硯-5th',  name:'間桐臟硯', gender:'男', appearance:'乾癟矮小的千年老人，蟲蝕枯槁之軀', war:'5th', magic:'間桐之蟲術・吸血蟲・延命', circuits:40, melee:'E', magic_rank:'A', home:'間桐宅',     wish:'逃脫死亡（不老不死）・視奪杯為餘生消遣', persona:'老謀深算・對活下去的病態執著・厭惡死亡與軟弱', back:'活了五百年的間桐始祖、視子孫為延命容器', moe:'陰森的耐性'},
  {id:'葛木宗一郎-5th',name:'葛木宗一郎', gender:'男', appearance:'戴眼鏡的沉默教師，黑西裝', war:'5th', magic:'體術（蛇之拳）・無魔術', circuits:10, melee:'A', magic_rank:'E', home:'柳洞寺',     wish:'無所求・守護所重視之人',     persona:'沉默盡責的教師・別無所求的絕對忠誠・厭惡虛偽的言辭', back:'本是無名殺手，因其從者第一次有了「想守護之物」', moe:'不懂浪漫卻最深情'},
  {id:'言峰綺禮-5th',  name:'言峰綺禮', gender:'男', appearance:'高大神父、黑色法衣，陰沉',   war:'5th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'尋得能讓自己喜悅之物',    persona:'虔誠神父的假面・以他人痛苦為樂的空虛・厭惡平庸的善', back:'壓抑天性數十年，已在某位高傲英靈慫恿下坦然墮落', moe:'麻婆豆腐的意外執著'},
  {id:'伊莉雅絲菲爾-5th',name:'伊莉雅絲菲爾', gender:'女', appearance:'紅眼白髮的幼小少女，毛領大衣',war:'5th',magic:'愛因茲貝倫煉金術・聖杯依代',    circuits:80, melee:'D', magic_rank:'A', home:'冬木·新都', wish:'完成聖杯的使命',          persona:'天真爛漫・哀傷的聖杯依代・厭惡孤獨', back:'人造人、被當作工具養大卻渴望親情', moe:'強顏歡笑的寂寞'},
  // ⚠ 2026-07 修：circuits原90→50——她本人的回路質量與凜同級(人類頂尖水準)，那股無限魔力來自聖杯泥附體(已在magic欄體現)，不該混進她自己的天賦數字。
  {id:'間桐櫻(黑化)-5th',name:'間桐櫻（黑化）', gender:'女', appearance:'黑長髮、黑紅禮服，妖異而空洞的笑',war:'5th',magic:'聖杯之泥・無限魔力・蟲爪', circuits:50, melee:'E', magic_rank:'A', home:'間桐宅', wish:'獨佔所愛、將世界一同拖入黑暗', persona:'溫順乖巧的假面・被黑泥吞噬的佔有慾・厭惡傷害過自己的一切', back:'遠坂次女、送養間桐受蟲蝕十一年後黑化', moe:'可憐又可怖'},
  // 第四次
  // ⚠ 2026-07 修：circuits35→15、magic_rank B→C——他的魔術回路數量少質量也差(原作明寫、故Saber供魔得靠愛麗絲)，
  //   真正的殺傷力來自起源彈與戰術而非魔術本身，「天才殺手·蹩腳魔術師」的反差不該被回路數字掩蓋。
  {id:'衛宮切嗣-4th',  name:'衛宮切嗣', gender:'男', appearance:'黑髮疲憊的男人，風衣',   war:'4th', magic:'起源彈・固有時制御',    circuits:15, melee:'A', magic_rank:'C', home:'冬木·深山町', wish:'以聖杯拯救世界、終結戰爭',persona:'冷酷疲憊的魔術師殺手・為大義不擇手段・厭惡無謂的犧牲', back:'背負「拯救多數而犧牲少數」的覺悟參戰', moe:'冷酷算計下其實最痛恨殺戮'},
  {id:'遠坂時臣-4th',  name:'遠坂時臣', gender:'男', appearance:'金棕髮的優雅紳士，名門做派',   war:'4th', magic:'寶石魔術',            circuits:50, melee:'D', magic_rank:'A', home:'遠坂宅',     wish:'抵達「根源之渦」',        persona:'優雅從容的名門紳士・抵達根源的執念・厭惡粗鄙與失格', back:'遠坂當主、以正統之道召喚出契合自身的英靈', moe:'名門的迂腐可愛'},
  // ⚠ 2026-07 修：home補「海特飯店」(他實際據點、被切嗣炸毀之處，原寫太籠統)；circuits50→65(時鐘塔科主等級，原作與韋伯的回路量差距懸殊)。
  {id:'肯尼斯-4th',    name:'肯尼斯', gender:'男', appearance:'金髮高傲的年輕教授',     war:'4th', magic:'礦石科・流體操作',      circuits:65, melee:'C', magic_rank:'A', home:'海特飯店', wish:'榮譽與學術成就',          persona:'高傲的天才教授・極高的自尊・厭惡被輕視', back:'時鐘塔天才講師、攜未婚妻索菈參戰', moe:'被打臉時的崩潰'},
  // ⚠ 2026-07 修：home補「麥肯基宅」(他借住深山町山丘上的老夫婦家，非新都鬧區)；circuits25→15(原作明寫他是時鐘塔墊底的資質，跟肯尼斯拉開懸殊差距)。
  {id:'韋伯·維爾維特-4th',name:'韋伯·維爾維特', gender:'男', appearance:'黑髮瘦小的少年魔術師',war:'4th',magic:'自我暗示・基礎魔術', circuits:15, melee:'E', magic_rank:'C', home:'麥肯基宅', wish:'證明自己的價值',          persona:'故作老成的少年・自卑卻好強・厭惡被當作無能', back:'時鐘塔末席學生、偷走觸媒召喚出羈絆深厚的英靈', moe:'口嫌體正直'},
  // ⚠ 2026-07 修：wish原「召喚惡魔」是誤植——他對聖杯毫無興趣，真正圖的是跟從者一起體驗新奇殺戮的快感；home補實際據點(澪標川下水道廢棄工房，非新都鬧區)。
  {id:'雨生龍之介-4th',name:'雨生龍之介', gender:'男', appearance:'輕浮的金髮青年，咧嘴而笑', war:'4th', magic:'無魔術・召喚術（外行）', circuits:10, melee:'C', magic_rank:'E', home:'碼頭倉庫', wish:'見識更新奇的殺戮・與從者共享獵奇的快感',persona:'輕浮開朗・天生純粹之惡・厭惡無聊', back:'毫無魔術素養、誤打誤撞召喚出與自己瘋狂共鳴的英靈', moe:'毫無惡意的惡'},
  {id:'言峰綺禮-4th',  name:'言峰綺禮', gender:'男', appearance:'尚未墮落的青年神父，壓抑',   war:'4th', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'探求自身空虛的答案',      persona:'壓抑的青年神父・尚未墮落的空虛・厭惡虛假的自己', back:'奉命輔佐盟友魔術師、正逐步走向深淵', moe:'壓抑天性的痛苦掙扎'},
  {id:'間桐雁夜-4th',  name:'間桐雁夜', gender:'男', appearance:'蟲蝕半白頭髮的憔悴男子',   war:'4th', magic:'間桐之蟲術',          circuits:15, melee:'D', magic_rank:'C', home:'間桐宅',     wish:'從間桐手中救出櫻',        persona:'憔悴悲憤・自我犧牲的執念・厭惡間桐家', back:'曾逃離間桐的男人、為救櫻重回家門植入蟲術', moe:'對櫻叔父般的疼惜（非生父）'}
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
var CODEX_PERSONA_VER = 'v51'; // v51：①全庫 persona 修剪(玩家定案「正典角色AI認得80%·卡太滿反而照稿演」)——36騎+15御主
//   依三留原則(本作特調/辨識錨/演出方向鎖)砍百科常識與同義重複，該批行 -37%；狂化偵測關鍵詞(狂化/僅咆哮/無法言語)
//   強制保留、多版本辨識錨(泳裝/install/Avenger等)全留。②吉爾·德·萊斯 realName 去掉原型綽號「（青鬍子）」
//   (玩家定案「角色原型垃圾不進AI資料」)＋SEED_RECLASSED_ 補名字遷移(舊列kit照刷)＋戰報素材行/錯誤訊息同步。
// v50：玉藻前官方材料校正(玩家貼原文)——咒術EX fx fast_cast→divine_age(荼吉尼天法＝
//   以肉體為素材的物理現象·無視對魔力→引擎「凌駕對魔力」機制)；神性補階A(日本神話最高神格·原無階fallback C，
//   神殺/天之鎖/對神的剋制被低估)。變化A/狐之嫁入EX(crafting＝道具製作自行改造)經原文核對無誤。
// v49：常駐寶具標記(玩家點名「B叔的寶具不是攻擊」)——赫拉克勒斯 God Hand／玉藻前 水天日光
//   np 字串加【常駐寶具】標記(前端💥灰化＋後端 actionFateBattle 擋攻擊解放·God Hand 的 god_hand fx 本就常駐生效)；
//   玉藻前補 regen B(治癒結界真的每回合回血)。狂化從者解放寶具的「高呼真名」prompt 同批改為咆哮本能解放(Router_Battle)。
// v48：戰鬥系統體檢修正——①resyncSummonedServants_ 補 SEED_RECLASSED_ 換職階遷移表
//   (v47換版前已召喚的貞德-Ruler因(名,職階)key對不上新種子而逃過削弱、保留OP kit——升版重跑讓她們吃到Archer新kit)；
//   ②寶具對轟敵方火力取樣補 skill(單層歸屬後漏帶·開場對轟系統性偏向玩家)；③因果律截斷不吃「敵滅回震腰斬」；
//   ④DEF_FX_ mul 下限clamp＋校準基準註解修正(實為C階非B階)。
// v47：貞德-Ruler → 貞德-Archer(泳裝版)換版——原Ruler版(對魔力EX+rho_aias A+
//   啟示/真名看破三重疊加)經 tools/battle_sim/roundrobin.js 全循環賽模擬證實是全種子庫最強(36位互毆
//   99%+勝率、僅2人技能位階能繞過其對魔力)，玩家要求整組換成官方泳裝Archer版：對魔力降回B、拔掉
//   rho_aias/first_strike/analyze，改配單一對軍寶具(豐收之海啊)，數值不再失控。id 隨之改為
//   '貞德-Archer'；servantNpOptions_ 同步拔除她原本掛的Ruler雙寶具選單(見 Engine_Fate.gs)。
// v46：英靈庫(SEED_SERVANTS)+御主庫(SEED_MASTERS) persona 減贅述——look/speech/moe(或
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
// ⚠ 換職階遷移表：種子改版連職階都換掉時(舊 key→新 key)，已召喚實體的 RANK 欄還存舊職階、
//   單靠 (真名,職階) 對不上新種子——沒有這張表，換版削弱對既有存檔的實體【永遠不生效】
//   (2026-07 稽核發現：貞德 Ruler→Archer 換版後，換版前召喚的她保留舊 OP kit 逃過削弱)。
var SEED_RECLASSED_ = { '貞德｜Ruler': '貞德｜Archer', '吉爾·德·萊斯（青鬍子）｜Caster': '吉爾·德·萊斯｜Caster' }; // 後者＝realName 去掉原型綽號(2026-07 玩家定案「角色原型垃圾不進AI資料」)，舊列名字不改、kit 照刷
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
    var k = key(data[i][COL.PC.NAME], data[i][COL.PC.RANK]);
    if (!byKey[k] && SEED_RECLASSED_[k]) {
      k = SEED_RECLASSED_[k];
      data[i][COL.PC.RANK] = k.split('｜')[1]; // 職階欄跟著換新(戰鬥 profile/演出都吃這欄)
    }
    var s = byKey[k];
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
