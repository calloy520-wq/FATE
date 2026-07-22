// ==========================================
// 🔵 Seed_Codex.gs — 英靈殿(從者範本) + 御主殿 名冊種子
// seedFateCodex_(ss)：英靈殿/御主殿 為空時自動灌入；ensureFateSheets_ 末尾呼叫。
// ==========================================

var SEED_SERVANTS = [
  // 第五次
  { id:'阿爾托莉雅-Saber', cls:'Saber', realName:'阿爾托莉雅·潘德拉貢', wars:['4th','5th'], gender:'女',
    // 筋力對齊「凜當御主」的高階官方參數線(其餘五圍已是該線)，避免與「士郎當御主」的弱版參數混用。
    six:{筋力:'A',耐久:'B',敏捷:'B',魔力:'A',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'A',fx:'first_strike'},{n:'魔力放出',r:'A',fx:'burst'},{n:'領袖氣質',r:'B',fx:'morale'},
            {n:'風王鐵鎚',r:'A',fx:'wind_strike'},{n:'誓約勝利之劍',r:'A++',fx:'excalibur'}],
    traits:[{n:'王'},{n:'人類'},{n:'龍'}], np:'誓約勝利之劍 Excalibur（對城 A++·聚攏這片星球記憶中的光·凝於劍尖·解放為撕裂大地、直貫蒼穹的金色收束光炮）／全世界遙遠的理想鄉 Avalon（永世隔絕·無敵結界·守護持有者）',
    align:'秩序・善', persona:{firstP:'我',look:'金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀',words:'騎士道・自我犧牲・壓抑的少女心',toMaster:'盡忠職守、初期保持距離，逐漸動搖',speech:'武人般簡潔鄭重、不擅言情',moe:'食量驚人卻吃相優雅',tic:'握劍時氣場驟冷',
    dailyLook:'金髮碧眼・身形嬌小玲瓏的少女身影、端莊凜然中帶著鄰家女孩的親和感、自稱「我」・說話依然簡潔認真但偶爾透出少女心的靦腆、私下看到可愛的小東西會忍不住多看兩眼，卻又故作矜持地移開視線',
    dailyOutfit:'藏青色連身洋裝，剪裁俐落端莊',
    dailyWords:'認真一絲不苟、對平穩的現代生活抱有滿滿好奇心、大快朵頤的美味佳餚與新鮮有趣的小事、看不慣恃強凌弱的舉動',dailyBack:'正直守序、在小鎮過著規律自持的日子，格外貪吃',dailyMoe:'食量驚人卻吃相優雅'} },
  { id:'EMIYA-Archer', cls:'Archer', realName:'無名（EMIYA）', wars:['5th'], gender:'男',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'B',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'千里眼',r:'C',fx:'aim'},{n:'投影魔術',r:'',fx:'projection'},{n:'七天盾·羅·埃亞斯',r:'',fx:'rho_aias'},{n:'無限劍製',r:'',fx:'ubw'}],
    traits:[{n:'人類'}], np:'無限劍製 Unlimited Blade Works（固有結界）／偽·螺旋劍 Caladbolg II（破斷重塑的流星劍·連射）',
    align:'中立・中庸', persona:{firstP:'我',look:'褐膚白髮・紅黑外衣的弓兵、厭世冷峻',words:'自我厭惡・藏起來的理想',toMaster:'嘴上不饒人、暗中守護',speech:'毒舌吐槽、嘴硬心軟',moe:'毒舌卻替人下廚',tic:'無奈嘆氣',
    dailyLook:'褐膚白髮・面容冷峻的青年、給人可靠又愛操心的兄長感、自稱「我」・嘴上嫌麻煩卻藏不住認真叮嚀的語氣、私下捨得為別人花時間添麻煩，卻捨不得為自己添一件像樣的新衣',
    dailyOutfit:'休閒俐落的深色便服',
    dailyWords:'嘴上愛抱怨又毒舌、其實見不得別人有困難不管、下廚做菜與修理各種家電雜物、矯情做作的場面話',dailyBack:'愛操心的萬能生活家，嘴上嫌麻煩卻總替人下廚修繕',dailyMoe:'嘴上嫌麻煩卻樂意下廚'} },
  { id:'庫丘林-Lancer', cls:'Lancer', realName:'庫·丘林', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
    skills:[{n:'避矢加護',r:'B',fx:'evade_ranged'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'刺穿死亡之棘',r:'B',fx:'gae_bolg',causality:true}],
    traits:[{n:'神性',r:'B'}], np:'刺穿死棘之槍 Gáe Bolg（對人 B・因果逆轉必中）',
    align:'秩序・中庸', persona:{firstP:'俺',look:'藍髮赤瞳・精悍結實的青年槍兵、野性不羈',words:'痛快・重義',toMaster:'爽快直率、討厭被當棋子',speech:'豪爽粗獷、愛抱怨倒楣',moe:'一身本事卻衰運纏身的倒楣宿命',tic:'扛槍咧嘴笑',
    dailyLook:'藍髮赤瞳・精壯的青年身影、總是帶著爽朗笑容閒晃在街頭、自稱「俺」・說話依然豪爽粗獷、私下其實很在意朋友的小事，會偷偷記在心上',
    dailyOutfit:'花襯衫或輕便休閒服',
    dailyWords:'隨性不羈又自來熟、重情重義把朋友的事放心上、釣魚與跟朋友四處湊熱鬧、拐彎抹角的算計',dailyBack:'隨性自來熟的青年，愛釣魚、跟朋友四處湊熱鬧，重情義',dailyMoe:'身手了得，卻常在小事上倒楣'} },
  { id:'美杜莎-Rider', cls:'Rider', realName:'美杜莎', wars:['5th'], gender:'女',
    six:{筋力:'B',耐久:'D',敏捷:'A',魔力:'B',幸運:'E',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // 官方保有技能無「女神的神核」，改補原文確有的單獨行動C。
    skills:[{n:'怪力',r:'B',fx:'str_up'},{n:'單獨行動',r:'C',fx:'solo'},{n:'魔眼',r:'A+',fx:'petrify'}],
    traits:[{n:'神性',r:'E-'},{n:'女神'}], np:'他者封印·鮮血神殿 Blood Fort Andromeda（對軍·結界）／騎英之手綱 Bellerophon（對軍 A+·喚出神駿天馬珀伽索斯·踏虛凌空·振翅撕裂長空、化作一往無前的純白光矢突刺）',
    // 聖杯戰爭期間封印魔眼的是眼罩(眼鏡是戰後日常配件)；服裝為貼身希臘風戰甲，非裹紗長裙。
    align:'混沌・善', persona:{firstP:'我',look:'紫長髮・貼身黑色戰甲勁裝(緋色飾邊)・眼罩封印魔眼的矯健女子、幽靜',words:'忠誠・深藏的溫柔',toMaster:'寡言而深情、極度護主',speech:'寡言低沉、必要才開口',moe:'怪力女神卻極度自卑',tic:'輕觸眼罩',
    dailyLook:'紫長髮・高挑巨乳、身形矯健的女子身影、氣質溫婉恬靜、自稱「我」・寡言低沉但語氣裡藏著溫柔、私下看到別人小小的善意會偷偷紅了眼眶，卻總是很快若無其事地眨眼帶過',
    dailyOutfit:'高領毛衣配長裙，戴著眼鏡',
    dailyWords:'安靜內向、默默守護著親近之人的溫柔大姊姊、閱讀與騎腳踏車兜風、被過度注視的目光',dailyBack:'寡言溫柔的大姊姊，愛看書、騎車兜風，家事意外拿手',dailyMoe:'寡言沉靜，家事身手意外地好'} },
  { id:'美狄亞-Caster', cls:'Caster', realName:'美狄亞', wars:['5th'], gender:'女',
    six:{筋力:'E',耐久:'D',敏捷:'C',魔力:'A++',幸運:'B',寶具:'C'},
    classSkills:[{n:'陣地作成',r:'A',fx:'territory'},{n:'道具作成',r:'A',fx:'crafting'}],
    skills:[{n:'高速詠唱',r:'A',fx:'fast_cast'},{n:'神代魔術',r:'A',fx:'divine_age'},{n:'破戒全咒',r:'C',fx:'rule_breaker'},{n:'金羊毛 Argon Coin',r:'EX',fx:'golden_fleece'}],
    traits:[{n:'人類'}], np:'萬符必應破戒 Rule Breaker（規則破壞者 C）',
    // Rule Breaker 官方描述為妖異七彩短劍，非紅色——全專案命名已同步正名。
    align:'中立・惡', persona:{firstP:'我',look:'紫袍兜帽・持妖異七彩短劍的清麗魔女、疏離',words:'背叛的傷痕・渴望被信任',toMaster:'防備卻渴望真心相待',speech:'溫婉敬語、藏著試探',moe:'被真心對待會慌',tic:'摩挲手中的七彩短劍',
    dailyLook:'紫色長髮・身形纖細優雅的清麗女子身影、散發優雅疏離的氣息、自稱「我」・溫婉敬語中藏著一絲小心翼翼、私下對著親手完成的小手作會露出藏不住的得意笑容',
    dailyOutfit:'溫柔色系的洋裝',
    dailyWords:'對外人保持禮貌的距離、沉浸在平穩生活裡的溫柔女性、洋裁與製作各種精緻模型、輕率的承諾',dailyBack:'對外人客氣有距離的女子，沉浸在洋裁與精緻手作裡',dailyMoe:'被真心對待時會意外慌張'} },
  // 幸運A卻仍死於決鬥是他最出名的反差設定；寶具階級官方未給定，'-' 誠實標記無明確階級(rankVal()仍保底吃E運算)。
  { id:'佐佐木小次郎-Assassin', cls:'Assassin', realName:'佐佐木小次郎', wars:['5th'], gender:'男',
    six:{筋力:'C',耐久:'E',敏捷:'A+',魔力:'E',幸運:'A',寶具:'-'},
    // 此版5th戰爭裡他是無御主孤身從者(獨自蟄伏柳洞寺)，補單獨行動讓他吃 enemyCanAffordNp_ 的殘存靈基儲備。
    classSkills:[{n:'氣息遮斷',r:'D',fx:'stealth'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'心眼（偽）',r:'A',fx:'analyze'},{n:'透化',r:'B+',fx:'clear_mind'},
            {n:'宗和的心得',r:'B',fx:'unreadable'},{n:'秘劍・燕返',r:'-',fx:'tsubame'}],
    traits:[{n:'人類'}], np:'燕返 Tsubame Gaeshi（對人魔劍・次元摺疊・三段同時斬）',
    align:'中立・中庸', persona:{firstP:'拙者',look:'紺髮長刀・素樸和裝的清瘦劍客、淡泊洒脫',words:'閒適・無欲',toMaster:'隨遇而安、只求一戰',speech:'慢條斯理、偶帶禪意',moe:'非英雄卻有英雄氣的平凡',tic:'凝望飛燕',
    dailyLook:'紺髮長刀・清瘦的劍客身影、氣質風雅灑脫、自稱「拙者」・慢條斯理偶帶禪意、私下會把路邊撿到的落花仔細收進懷裡，捨不得就這麼錯過',
    dailyOutfit:'簡樸和風浴衣',
    dailyWords:'悠然自得的風雅之士、隨遇而安享受清靜日子、觀察花鳥風月與跟路人閒聊哲理、喧鬧紛擾',dailyBack:'悠然風雅的浪人，愛觀花鳥風月、隨遇而安享清靜',dailyMoe:'隨遇而安，偶爾也有較真的一面'} },
  { id:'赫拉克勒斯-Berserker', cls:'Berserker', realName:'赫拉克勒斯', wars:['5th'], gender:'男',
    six:{筋力:'A+',耐久:'A',敏捷:'A',魔力:'A',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'B',fx:'mad'},{n:'對魔力',r:'D',fx:'nullify_magic'}],
    // 不掛戰鬥續行(survive)：fateStrike_ 判定順序 survive 先於 god_hand，會讓十二試煉的燒命判定永遠輪不到，
    // 跟「每次瀕死真的燒一命」的設計矛盾——兩者互斥擇一。
    skills:[{n:'勇猛',r:'A',fx:'morale'},{n:'十二試煉',r:'A',fx:'god_hand'}],
    // 不掛「王」trait：他終身未曾稱王。God Hand 是常駐復活寶具而非攻擊技，前後端據此擋下攻擊解放
    // (💥鈕灰化＋actionFateBattle 阻擋)，他的戰力＝普攻蠻力＋十二條命。
    traits:[{n:'神性',r:'A'}], np:'十二試煉 God Hand（B·十二條命·【常駐寶具】自動生效·狂化下無可解放的攻擊寶具）',
    // Nine Lives 原作設定為狂化壓制下無法使用的寶具，故這版狂化下只有 God Hand。
    align:'混沌・狂', persona:{firstP:'（狂化·僅咆哮）',look:'巨軀岩肌・黑霧纏身的半神戰士、壓迫氣場',words:'狂化・守護的殘響',toMaster:'理智被黑霧吞沒、僅存護主本能',speech:'狂化無法言語、僅以低吼表達',moe:'偶爾理智回光的瞬間',tic:'以巨軀擋在主人身前',
    dailyLook:'岩肌巨軀・高大健壯的男子身影、像座溫柔的大山總讓人感到安心、話極少・多以點頭或簡短音節回應偶爾露出憨厚笑容、私下總會偷偷留意誰的東西提不動，默默出手幫忙',
    dailyOutfit:'特大號寬鬆休閒服',
    dailyWords:'沉默寡言、溫和地守護著伊莉雅與身邊重要的人、幫忙搬運重物與被小孩子圍著玩、看到重要的人受委屈',dailyBack:'沉默溫和的大個子，總默默幫人搬重物、被小孩圍著玩',dailyMoe:'巨軀憨直，偶爾害羞般的靦腆瞬間'} },
  // 第四次
  // 對魔力/單獨行動 為第四次戰爭當時的官方數值(C/A)，非「被聖杯泥養到第五次」後的強化版(E/A+)，两次戰爭不可混用。
  { id:'吉爾伽美什-Archer', cls:'Archer', realName:'吉爾伽美什', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'C',魔力:'B',幸運:'A',寶具:'EX'},
    classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'},{n:'單獨行動',r:'A',fx:'solo'}],
    skills:[{n:'黃金律',r:'A',fx:'wealth'},{n:'領袖氣質',r:'A+',fx:'morale'},{n:'神性',r:'B',fx:'divine'},
            {n:'王之財寶',r:'A',fx:'gob'},{n:'天之鎖',r:'B',fx:'chain'},{n:'全知全能之星 Sha Naqba Imuru',r:'EX',fx:'insight'}],
    traits:[{n:'神性'},{n:'王'}], np:'王之財寶 Gate of Babylon（對人 E~A++）／乖離劍 Ea（天地乖離·封藏的至高兵裝，傲慢時不出鞘）',
    align:'混沌・善', persona:{firstP:'吾',look:'金髮赤瞳・金鎧加身的俊美王者、睥睨的威壓',words:'傲慢・收藏家',toMaster:'視為雜種、幾乎不從令，唯對少數有趣之人起興致',speech:'居高臨下、稱人「雜種」',moe:'傲慢底下的孤獨',tic:'金色波紋中抽出寶具',
    dailyLook:'金髮赤瞳・俊美的男子身影、即使走在街上也帶著視察領地般的王者餘裕、自稱「吾」・居高臨下卻藏不住偶爾的興致勃勃、私下嘴上瞧不上凡俗之物，卻會悄悄記住誰真正喜歡什麼',
    dailyOutfit:'奢華名牌休閒服',
    dailyWords:'傲慢自負、骨子裡對新奇事物充滿好奇心、騎重機兜風與收集現代的稀奇玩具、平庸無趣之物',dailyBack:'傲氣十足的富家公子，愛騎重機、收集現代稀奇玩意',dailyMoe:'傲慢自負，其實默默在意他人喜好'} },
  // 對魔力B、愛之痣C為官方階級；心眼(真)B取代查無出處的「戰鬥續行」。
  { id:'迪盧木多-Lancer', cls:'Lancer', realName:'迪盧木多·奧迪那', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A+',魔力:'D',幸運:'E',寶具:'B'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'愛之痣',r:'C',fx:'lovespot'},
            {n:'破魔紅薔薇／必滅黃薔薇',r:'B',fx:'anti_magic_lance'}],
    traits:[{n:'人類'}], np:'破魔紅薔薇 Gáe Dearg・必滅黃薔薇 Gáe Buidhe（雙槍・破魔／不癒之傷）',
    align:'秩序・善', persona:{firstP:'我',look:'墨綠髮・面有愛之痣的俊美騎士、謙恭',words:'忠義・哀愁',toMaster:'絕對忠誠，渴望堂堂正正之戰',speech:'謙恭有禮、壓抑情感',moe:'愛之痣令女性傾心的悲劇宿命',tic:'雙槍交握行禮',
    dailyLook:'墨綠髮・俊美的騎士身影(面上淡淡的愛之痣)、氣質溫雅內斂、自稱「我」・言談謙恭有禮，情感總壓在心底、私下偶爾對著鏡子盯著臉上的痣，猜想它究竟惹來多少麻煩',
    dailyOutfit:'整潔的紳士便裝',
    dailyWords:'謙恭有禮、把忠義與哀愁的騎士心都放在心底、堂堂正正的較量與切磋、趁人之危的手段',dailyBack:'謙恭有禮的青年，行事堂堂正正，把心事都藏在心底',dailyMoe:'天生惹人喜愛，自己卻渾然不覺'} },
  { id:'伊斯坎達爾-Rider', cls:'Rider', realName:'伊斯坎達爾（征服王）', wars:['4th'], gender:'男',
    six:{筋力:'B',耐久:'A',敏捷:'D',魔力:'C',幸運:'A+',寶具:'A++'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'騎乘',r:'A+',fx:'ride'}],
    // 神性C：源於「宙斯之子」的傳說地位，官方參數表明列此技能。
    skills:[{n:'領袖氣質',r:'A',fx:'morale'},{n:'軍略',r:'B',fx:'tactics'},{n:'神性',r:'C',fx:'divine'}],
    traits:[{n:'王'}], np:'王之軍勢 Ionioi Hetairoi（對軍 EX·固有結界召喚萬軍）／神威的車輪 Gordius Wheel（雷神戰車·衝鋒）',
    align:'中立・善', persona:{firstP:'余',look:'紅髮虬髯・披風加身的魁梧征服王、豪邁',words:'征服・雅量',toMaster:'視為臣下亦為摯友，要對方先成為夠格的王',speech:'豪爽大笑、稱人「小鬼」',moe:'征服野心與孩子氣並存',tic:'攤開世界地圖',
    dailyLook:'紅髮虬髯・魁梧的男子身影、豪邁爽朗中帶著王者的氣度、自稱「余」・豪爽大笑，愛稱人一聲「小鬼」、私下偷偷藏著一疊蒐集來的地圖，像個捨不得放手的孩子',
    dailyOutfit:'寬鬆的披風外衣，帶點粗獷的旅行風格',
    dailyWords:'豪爽大氣、藏著雅量與孩子氣的征服野心、熱鬧的酒宴與跟朋友高談闊論、小家子氣的計較',dailyBack:'豪爽大氣的男子，愛熱鬧酒宴與高談闊論，愛蒐集地圖',dailyMoe:'談天下野心勃勃，私下卻孩子氣'} },
  // 陣地作成B(官方階級)；他是少數沒有「道具作成」的Caster(官方設定他放棄道具作成換寶具召喚能力，是知名反差設定)，
  // 也無查無出處的「城牆防禦」；官方設計他其實無鬚無眉，「青鬚」只是他自稱化名(藍鬍子)的形象，非實際外觀。
  { id:'吉爾德萊-Caster', cls:'Caster', realName:'吉爾·德·萊斯', wars:['4th'], gender:'男',
    six:{筋力:'D',耐久:'E',敏捷:'D',魔力:'C',幸運:'E',寶具:'A+'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'}],
    skills:[{n:'精神汙染',r:'A',fx:'mad'},{n:'螺湮城教本',r:'',fx:'summon_horror'}],
    traits:[{n:'人類'}], np:'螺湮城教本 Prelati\'s Spellbook（深淵召喚・召喚大海怪）',
    align:'混沌・惡', persona:{firstP:'我',look:'捧巨書的清瘦貴族(無鬚無眉)、癲狂',words:'虔誠扭曲・對「聖女」的執念',toMaster:'與共鳴其瘋狂的御主引為摯友；否則貌合神離',speech:'時而文雅、時而癲狂咆哮',moe:'對「神不在場」的悲憤',tic:'淚流滿面的狂笑',
    dailyLook:'清瘦的貴族身影(無鬚無眉)・總是懷抱著厚重書本、氣質溫文卻帶著一絲神經質的執著、自稱「我」・說話時而文雅，聊到入迷處會激動起來、私下聊到那位他敬重的人時，語氣會不自覺地放軟',
    dailyOutfit:'樸素但整潔的書卷氣便服，袖口總沾著書頁的痕跡',
    dailyWords:'溫文儒雅卻帶點神經質、虔誠又執著地眷戀著某個特別的人、找得到談得來話題的人、話不投機的敷衍',dailyBack:'溫文儒雅的貴族書癡，一讀起書就入迷得忘我',dailyMoe:'讀書入迷起來，喊他都聽不見'} },
  // 敏捷A/魔力C/寶具B：第四次聖杯戰爭材料一致給這三個階級。
  { id:'百貌哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（百貌）', wars:['4th'], gender:'男',
    six:{筋力:'C',耐久:'D',敏捷:'A',魔力:'C',幸運:'E',寶具:'B'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'自我改造',r:'B',fx:'self_mod'},{n:'妄想幻像',r:'',fx:'zabaniya'}],
    traits:[{n:'人類'}], np:'妄想幻像 Zabaniya: Delusional Illusion（對人·分裂為百種人格·最多同時八十體）',
    align:'秩序・惡', persona:{firstP:'我們',look:'骷髏面具・黑袍裹身的刺客、詭譎',words:'群體・無數人格',toMaster:'服從，視暗殺為信仰',speech:'多重聲線交疊低語',moe:'眾多人格共用一具身軀的詭異',tic:'骷髏面具下變換面孔',
    dailyLook:'戴著骷髏造型面具・裹著深色系裝扮的神秘身影、氣質內斂帶點神祕感、自稱「我們」・低語般的說話方式，偶爾會用不同聲線輪流開口、私下其實很喜歡安靜地窩在角落看人來人往',
    dailyOutfit:'深色系但剪裁俐落的日常裝扮',
    dailyWords:'低調神秘、多重人格共用一具身軀卻相處得意外和睦、安靜潛伏地觀察周遭、喧嘩張揚的場合',dailyBack:'低調神秘的人，多重人格和睦共處，愛靜靜看人來人往',dailyMoe:'偶爾換個語氣說話，像換了個人'} },
  { id:'咒腕之哈桑-Assassin', cls:'Assassin', realName:'哈桑·薩巴赫（咒腕）', wars:['5th'], gender:'男',
    six:{筋力:'B',耐久:'C',敏捷:'A',魔力:'C',幸運:'E',寶具:'C'},
    classSkills:[{n:'氣息遮斷',r:'A+',fx:'stealth'}],
    skills:[{n:'妄想心音',r:'',fx:'zabaniya'},{n:'投影魔術',r:'C',fx:'projection'},{n:'自我改造（詛咒之腕）',r:'C',fx:'self_mod'}],
    traits:[{n:'人類'}], np:'妄想心音 Zabaniya（對人·掏出心臟之影即死）',
    // 詛咒之腕為右臂(撒旦之手嫁接，官方設定)。
    align:'秩序・惡', persona:{firstP:'我',look:'骷髏面具・詛咒繃帶纏滿右臂的暗殺者、肅殺',words:'詛咒之腕・初代之名',toMaster:'冷淡服從、以暗殺為天職',speech:'低沉簡短、必要才開口',moe:'沉默卻守諾',tic:'無聲潛近',
    dailyLook:'戴著骷髏面具・右臂纏著繃帶的沉靜身影、氣質肅穆而低調、自稱「我」・話極少，必要時才低沉簡短地開口、面具下的眼神，只在最信任的人面前才透出一絲罕見的柔和',
    dailyOutfit:'低調簡樸的深色裝扮，右臂仍纏著繃帶',
    dailyWords:'沉靜肅穆、把答應過的事看得比什麼都重、安靜獨處的時光、多餘的閒談',dailyBack:'沉靜肅穆、寡言守諾的人，格外珍惜安靜獨處的時光',dailyMoe:'沉默寡言，但答應過的事一定做到'} },
  // 官方六圍為 筋A／耐A／敏A+／魔C／幸B／寶A(A+屬於敏捷)；狂化C(官方階級)；
  // np真名「騎士は徒手にて死せず」通行中譯為「騎士不死於徒手」。
  { id:'蘭斯洛特-Berserker', cls:'Berserker', realName:'蘭斯洛特（湖之騎士）', wars:['4th'], gender:'男',
    six:{筋力:'A',耐久:'A',敏捷:'A+',魔力:'C',幸運:'B',寶具:'A'},
    classSkills:[{n:'狂化',r:'C',fx:'mad'},{n:'騎乘',r:'A',fx:'ride'},{n:'對魔力',r:'E',fx:'nullify_magic'}],
    skills:[{n:'無窮的鍛鍊',r:'A+',fx:'clear_mind'},{n:'無毀的湖光',r:'A',fx:'weapon_steal'}],
    traits:[{n:'騎士'},{n:'人類'}], np:'騎士不死於徒手 Knight of Owner（萬物化為兵裝）',
    align:'混沌・狂', persona:{firstP:'（狂化·僅低吼）',look:'黑霧纏繞漆黑鎧甲的騎士、悲愴',words:'悔恨・對亞瑟王的愧疚',toMaster:'狂化無言，僅以戰鬥宣洩悔恨',speech:'狂化無法言語、僅餘低吼',moe:'渴望被懲罰的扭曲忠誠',tic:'抓起任何物件化為兵裝',
    dailyLook:'黑髮・沉穩的男子身影、氣質略帶一絲憂鬱、話不多・語氣溫和有禮、私下偶爾對著遠方出神，回神後又若無其事地繼續手邊的活',
    dailyOutfit:'簡單整潔的深色便服',
    dailyWords:'沉默寡言、默默守護把雜務都攬在自己身上、安靜待在背景裡照顧大家、被過度張揚地感謝或關注',dailyBack:'沉默溫和的男子，總默默攬下雜務、待在背景照顧大家',dailyMoe:'沉默寡言，卻總攬下最累的活'} },
  // 客串保留：慾海鑑賞用的少數客串——斯卡哈/恩奇都/美遊/小黑/伊莉雅，其餘客串／偽聖杯陣容已清空。
  { id:'恩奇都-Lancer', cls:'Lancer', realName:'恩奇都', wars:['客串'], gender:'無',
    // 基線＝非理想御主下的恩奇都(供魔不足)；與銀狼結契才回全盛全A·寶A++(masterSynergySix_)，
    // 此 synergy 僅供手動 MEMORY 標記【御主】銀狼 觸發(銀狼已無自動配對戰場)。
    // 筋力下限為B：原作「變容」使他六圍浮動恆在A~B之間、從不掉到C。
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'B',幸運:'-',寶具:'A'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'天之鎖',r:'A',fx:'chain'},{n:'氣息感知',r:'A+',fx:'sense'},{n:'變容',r:'A',fx:'shapeshift'},{n:'完全之形',r:'A',fx:'regen'}],
    traits:[{n:'神造兵器'},{n:'病死宿命'}], np:'世人啊，冀以鎖繫神明 Enuma Elish（對界 A++~EX·對肅正寶具·反星球/人類破壞行為增幅·可匹敵乖離劍）／民之睿智 Age of Babylon（大地召出萬千劍槍鎖齊射·抵銷王之財寶）',
    align:'中立・中庸', persona:{firstP:'我',look:'青綠長髮・中性無垢的神造之軀、平和',words:'純真・追尋摯友',toMaster:'溫和而疏離，心繫吉爾伽美什',speech:'平和中性、無機質卻溫柔',moe:'神造兵器卻最有人性',tic:'歪頭觀察',
    dailyLook:'青綠長髮・中性無垢的身影、氣質平和帶著一絲疏離感、自稱「我」・語氣平和中性卻藏著溫柔、私下總惦記著吉爾伽美什，偶爾會對著他送的小東西發愣好一會兒',
    dailyOutfit:'簡樸自然色調的休閒服裝',
    dailyWords:'平和無垢、純真地掛念著摯友吉爾伽美什、新奇的事物、傷害他人之舉',dailyBack:'神造的中性存在，看似無機質，卻始終惦記著一位重要的摯友',dailyMoe:'看似無機質，其實對世界充滿好奇'} },
  // 斯卡哈 三職階
  // 對魔力A(官方「可無效A階以下魔術」)；神殺B、魔境的智慧A+，均為官方技能表階級。
  { id:'斯卡哈-Lancer', cls:'Lancer', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'C',幸運:'D',寶具:'A+'},
    classSkills:[{n:'對魔力',r:'A',fx:'nullify_magic'}],
    skills:[{n:'神殺',r:'B',fx:'god_slay'},{n:'神速',r:'A',fx:'first_strike'},{n:'戰鬥續行',r:'A',fx:'survive'},
            {n:'原初符文',r:'A',fx:'rune'},{n:'魔境的智慧',r:'A+',fx:'mage_realm'},{n:'刺穿死亡之棘',r:'A',fx:'gae_bolg',causality:true}],
    traits:[{n:'人類'}], np:'貫穿死翔之槍 Gáe Bolg Alternative（對人 B+·釘空必中＋投擲斷命）／死亡滿溢的魔境之門 Gate of Skye（對軍 A+·吸入影之國）',
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・緊身戰衣的妖豔女王、冷峻',words:'影之國女王・武人',toMaster:'嚴厲考校、唯認可強者，師者之威',speech:'偶露揶揄的嚴師語氣',moe:'渴望一死卻不得的寂寞',tic:'魔槍杵地',
    dailyLook:'紫髮紅瞳・巨乳妖嬈、妖豔冷峻的女子身影、氣質居高臨下卻自持有度、自稱「我」・偶爾露出揶揄語氣，帶著嚴師的威嚴、被人由衷稱讚時會有一瞬間的怔住，隨即若無其事地別開臉',
    dailyOutfit:'貼身的紫紅色系穿搭，帶點時尚的野性魅力',
    dailyWords:'居高臨下、骨子裡藏著願意照顧人的溫柔、真材實料的較量、虛有其表的花拳繡腿',dailyBack:'高冷自持的嚴師，骨子裡願意照顧人，廚藝意外地好',dailyMoe:'高冷女王范兒，私下廚藝出乎意料'} },
  { id:'斯卡哈-Assassin', cls:'Assassin', realName:'斯卡哈', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A+',魔力:'C',幸運:'D',寶具:'B+'},
    classSkills:[{n:'氣息遮斷',r:'E',fx:'stealth'}],
    skills:[{n:'心眼(真)',r:'B',fx:'analyze'},{n:'戰鬥續行',r:'A',fx:'survive'},{n:'原初符文',r:'B',fx:'rune'}],
    traits:[{n:'人類'}], np:'蹴穿死翔之槍 Gáe Bolg Alternative（對人 B+·影縫穿刺）',
    // 這個Assassin版是夏季活動限定泳裝造型(官方立繪為比基尼/沙灘裝)，外觀走海灘風而非暗殺潛行調性。
    align:'中立・中庸', persona:{firstP:'我',look:'紫髮紅瞳・泳裝海灘造型的致命女王(夏日Assassin版)、冷冽',words:'影・潛行的女王',toMaster:'冷眼試探、出手無情，認可方鬆動',speech:'低冷簡短、一針見血',moe:'影中女王的致命優雅',tic:'融入暗影',
    dailyLook:'紫髮紅瞳・巨乳、冷冽優雅的女子身影、氣質慵懶自在中帶著一絲警覺、自稱「我」・說話低冷簡短・一針見血、私下其實很享受被人依賴的感覺，即使嘴上總是一副事不關己的樣子',
    dailyOutfit:'海灘度假風的輕便穿搭',
    dailyWords:'深居簡出、骨子裡仍保有潛行者般的冷靜、安靜的獨處時光、無謂的張揚',dailyBack:'冷冽自持的女王，拒人於千里之外，其實很享受被人依賴的感覺',dailyMoe:'慵懶自在，偶爾流露女王般的小得意'} },
  { id:'美遊-Saber', cls:'Saber', realName:'美遊·埃德費爾特（Saber install）', wars:['客串'], gender:'女',
    six:{筋力:'B',耐久:'B',敏捷:'B',魔力:'C',幸運:'C',寶具:'A'},
    classSkills:[{n:'對魔力',r:'B',fx:'nullify_magic'},{n:'騎乘',r:'B',fx:'ride'}],
    skills:[{n:'直感',r:'B',fx:'first_strike'},{n:'魔力放出',r:'B',fx:'burst'},{n:'沉著冷靜',r:'B',fx:'clear_mind'},{n:'誓約勝利之劍',r:'A',fx:'excalibur'}],
    traits:[{n:'人類'},{n:'騎士'}], np:'誓約勝利之劍 Excalibur（對城 A·聖劍之光收束於劍尖·解放為撕裂大地、直貫蒼穹的金色巨炮）',
    align:'秩序・善', persona:{firstP:'我',look:'黑髮藍裙・Saber install 的內斂少女、沉靜',words:'認真・背負宿命',toMaster:'認真盡責，沉默守護',speech:'寡言低語、不擅表達',moe:'認真過頭的笨拙',tic:'垂眸淺應',
    dailyLook:'黑髮・內斂的少女身影、氣質沉靜寡言、自稱「我」・寡言低語，不擅表達卻認真傾聽、對「失敗」這件事其實很在意，會偷偷練習到深夜也要做到最好',
    dailyOutfit:'藍色系的簡約洋裝',
    dailyWords:'寡言認真卻手忙腳亂的笨拙、背負宿命般的責任感、安穩平靜的日子、辜負他人的期待',dailyBack:'寡言認真卻有點笨拙的少女，責任感重、怕辜負期待',dailyMoe:'認真過頭，常鬧出笨拙的小失誤'} },
  { id:'小黑-Archer', cls:'Archer', realName:'克洛伊·馮·愛因茲貝倫（Archer install）', wars:['客串'], gender:'女',
    six:{筋力:'C',耐久:'C',敏捷:'A',魔力:'B',幸運:'C',寶具:'B'},
    classSkills:[{n:'對魔力',r:'D',fx:'nullify_magic'},{n:'單獨行動',r:'B',fx:'solo'}],
    skills:[{n:'投影魔術',r:'B',fx:'projection'},{n:'千里眼',r:'C',fx:'aim'}],
    traits:[{n:'人類'}], np:'鶴翼三連 Triple-Linked Crane Wings（對人 B·投影干將・莫邪，雙劍交擊、三連必殺的劍技）',
    align:'混沌・中庸', persona:{firstP:'本小姐',look:'褐膚白髮・Archer install 的活潑少女、促狹',words:'腹黑・好戰',toMaster:'又黏又愛逗弄，戰意旺盛',speech:'促狹挑釁、撒嬌耍賴',moe:'嘴上捉弄其實很重感情',tic:'吐舌挑釁',
    dailyLook:'褐膚白髮・活潑亮眼的少女身影、氣質促狹調皮、自稱「本小姐」・說話促狹挑釁，偶爾會撒嬌耍賴、私下鬥嘴鬥贏了會偷偷開心一整天，其實很在乎對方的反應',
    dailyOutfit:'打扮活潑亮眼的休閒穿搭',
    dailyWords:'促狹愛捉弄人、好勝心強卻很重感情、捉弄人的樂趣、被人小看',dailyBack:'促狹愛捉弄人的少女，好勝卻重感情，嘴硬又黏人',dailyMoe:'嘴上愛捉弄人，其實黏人重感情'} },
  { id:'伊莉雅-Caster', cls:'Caster', realName:'伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）', wars:['客串'], gender:'女',
    six:{筋力:'D',耐久:'C',敏捷:'C',魔力:'A',幸運:'B',寶具:'B'},
    classSkills:[{n:'陣地作成',r:'B',fx:'territory'},{n:'道具作成（魔杖・露比）',r:'C',fx:'crafting'}],
    skills:[{n:'高速神言',r:'A',fx:'fast_cast'},{n:'魔力放出',r:'B',fx:'burst'},{n:'純真無垢',r:'A',fx:'clear_mind'}],
    traits:[{n:'人類'}], np:'全彈發射・魔力炮 Quintett Feuer（多重魔力炮擊）',
    align:'中立・善', persona:{firstP:'我',look:'白髮紅瞳・魔杖在手的魔法少女、元氣',words:'天真・善良',toMaster:'純真信賴，朝氣蓬勃',speech:'活潑直率、元氣滿滿',moe:'愛哭卻在關鍵時刻勇敢',tic:'眼眶泛淚還硬撐',
    dailyLook:'白髮紅瞳・元氣滿滿的少女身影、氣質天真爛漫、自稱「我」・說話活潑直率・元氣滿滿、看到可愛的東西會挪不開腳步，非要抱一下摸一下才甘心',
    dailyOutfit:'可愛的日常打扮，隨身帶著別緻的手杖裝飾',
    dailyWords:'天真爛漫、淚眼汪汪卻在緊要關頭豁得出去的勇敢、熱鬧開心的事、看到有人受欺負',dailyBack:'天真爛漫的魔法少女，愛哭卻在重要時刻意外地豁得出去',dailyMoe:'愛哭鬼，卻在重要時刻意外勇敢'} },
  // 🌹 這3位是聖杯戰爭正典御主(非從者)，直接進英靈殿供鑑賞「直接召喚」。cls 刻意標'御主'
  //   (非七大從者職階)：solo召喚頁職階清單與 actionSummonServant 白名單皆會擋下，只有鑑賞召喚得到；
  //   wars 標'客串'排除於混亂模式敵從者池外。six/技能/寶具留空——這幾位在鑑賞只演出、不涉戰鬥。
  { id:'遠坂凜-Master', cls:'御主', realName:'遠坂凜', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{firstP:'我',look:'黑長雙馬尾・紅衣黑裙、傲然',words:'人前完美的優等生・刀子嘴豆腐心・厭惡示弱與失態',toMaster:'口是心非、嘴上嫌棄卻很上心',speech:'毒舌卻藏著關心',moe:'人後迷糊',tic:'甩馬尾別過臉',back:'遠坂家長女（櫻是被送養的妹妹）、父親死於上屆聖杯戰爭',
    dailyLook:'黑長雙馬尾、身形勻稱、俐落幹練的少女身影、氣質傲然自信、自稱「我」・說話毒舌卻藏著關心、對在意的人特別嘴硬，明明擔心得要命卻只會冷冷丟一句「笨蛋」',
    dailyOutfit:'紅衣黑裙的俐落打扮',
    dailyWords:'人前完美的優等生做派、刀子嘴豆腐心、把玩收藏的寶石與碎唸糾正士郎的生活習慣、任何電器故障或猝不及防的意外',dailyMoe:'操作家電永遠一竅不通，出糗次數多到數不清',
    // dailyBack：鑑賞世界沒有聖杯戰爭，改寫掉 back 的戰時悲劇成因，只留跟妹妹的家人關係。
    dailyBack:'遠坂家大小姐，妹妹是間桐櫻，感情比表面看起來更好'} },
  { id:'伊莉雅絲菲爾-Master', cls:'御主', realName:'伊莉雅絲菲爾', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{firstP:'我',look:'紅眼白髮的幼小少女・毛領大衣、渴望親近',words:'天真爛漫・哀傷的聖杯依代・厭惡孤獨',toMaster:'依賴而黏人，渴望被珍惜',speech:'孩子氣的直率，偶爾早熟的敏銳',moe:'強顏歡笑的寂寞',tic:'踮腳撒嬌',back:'人造人、被當作工具養大卻渴望親情',
    dailyLook:'紅眼白髮的幼小少女身影、幾分警戒幾分親近的氣質、自稱「我」・說話孩子氣直率，偶爾透出早熟的敏銳、睡著時會不自覺地往溫暖的懷抱裡靠，怎麼挪都挪不走',
    dailyOutfit:'紅眼白髮配毛領大衣的可愛裝扮',
    dailyWords:'天真爛漫黏人、渴望被更多人放在心上疼惜、被珍惜疼愛的感覺、獨自一人',dailyMoe:'黏人小跟班，撒嬌功力一流',
    // dailyBack：拿掉「人造人、被當工具養大」的沉重意涵，改寫成單純的家庭背景描述。
    dailyBack:'愛因茲貝倫家的小女兒，從小被家人捧在手心上疼愛'} },
  { id:'間桐櫻黑化-Master', cls:'御主', realName:'間桐櫻', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    // 官方設定間桐櫻髮色為深紫色(與遠坂凜同系但更深)，黑化不因此變色。
    align:'混沌・惡', persona:{firstP:'我',look:'深紫長髮・黑紅禮服、泛著陰冷寒意',words:'溫順乖巧的假面・被黑泥吞噬的佔有慾・厭惡傷害過自己的一切',toMaster:'表面溫順順從，內裡佔有慾強烈',speech:'輕柔溫順，偶爾滲出陰冷',moe:'可憐又可怖',tic:'低垂眼眸淺笑',back:'遠坂次女、送養間桐受蟲蝕十一年後黑化',
    dailyLook:'深紫長髮、身形玲瓏有致的成熟女子身影、氣質沉靜柔順、自稱「我」・語調輕柔卻偶藏一絲小心機、私下會用無傷大雅的小惡作劇，悄悄試探對方有多在意自己',
    dailyOutfit:'帶酒紅色點綴的精緻洋裝',
    dailyWords:'溫柔中帶著一點小惡魔屬性、佔有慾偷偷冒出但多半轉化成撒嬌、香甜的點心與嚇人的怪談、體育課與量體重的時刻',dailyMoe:'看似溫順乖巧，其實佔有慾滿滿',
    // dailyBack：拿掉蟲蝕/黑化的悲劇成因，改寫成單純的姊妹血緣事實。
    dailyBack:'遠坂家的妹妹，被送去間桐家生活，個性文靜內斂'} },
  // 🌹 正典人物、非從者：cls刻意標'御主'(非七大職階)，只供鑑賞召喚同行，不進solo。士郎這裡改寫成
  //   鑑賞版，拿掉「大火孤兒/繼承理想」的悲劇成因，只留單純的家人事實。
  { id:'衛宮士郎-Master', cls:'御主', realName:'衛宮士郎', wars:['客串'], gender:'男',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{firstP:'我',look:'紅褐短髮的高中生身影・樸素制服，認真踏實',words:'樂於助人的好好先生・過度的自我犧牲傾向・厭惡見死不救',toMaster:'總是先為對方著想，讓人捏一把冷汗',speech:'直率溫和，偶爾少根筋',moe:'自己滿身傷還先擔心別人',tic:'習慣性收拾善後、順手把家事全包了',back:'受衛宮家收養長大，如今自己打理老宅與工房',
    dailyLook:'紅褐短髮的高中生身影、氣質認真踏實勤快、自稱「我」・說話直率溫和、私下看到誰手忙腳亂就忍不住湊過去幫忙，袖口常沾著木屑或油污',
    dailyOutfit:'簡樸的高中制服或家居服，袖子總是挽起方便做事',
    dailyWords:'樂於助人到有點不要命、看到別人逞強受傷就坐不住、木工修繕與張羅三餐、有人在他面前硬撐著不肯求助',dailyMoe:'自己滿身傷還先擔心別人，過度雞婆',
    dailyBack:'在深山町一帶經營小小的工房兼做木工修繕，閒暇常幫鄰里修東修西'} },
  { id:'藤村大河-Master', cls:'御主', realName:'藤村大河', wars:['客串'], gender:'女',
    six:{}, classSkills:[], skills:[], traits:[], np:'',
    align:'中立・善', persona:{firstP:'我',look:'亞麻色及肩短髮的身影・雖已是成熟大人卻仍帶著爽朗元氣，自封「大河大人」',words:'大姊頭般罩著大家的女王大人・其實怕寂寞想要人陪・厭惡被當小孩子看待',toMaster:'嘴上兇巴巴地念，其實把人當自己家人疼',speech:'中氣十足、得意時自稱「藤村家的大河大人」',moe:'嘴上兇巴巴罩著大家，其實廚藝差得嚇人還硬要下廚',tic:'得意地插腰大笑',back:'地方上的老師，也是這一帶地主家的大小姐',
    dailyLook:'亞麻色及肩短髮、身形嬌小的身影、雖已是成熟大人卻仍帶著爽朗直率的元氣、自稱「我」・說話中氣十足，得意時會自封「藤村家的大河大人」、私下一看到好吃的東西眼睛就發亮',
    dailyOutfit:'休閒的成套運動服，或教師風格的簡便套裝',
    dailyWords:'大姊頭般罩著身邊的人、其實怕寂寞想要人陪、蹭飯偷吃東西的機會、被說像小孩子鬧脾氣',dailyMoe:'嘴上兇巴巴罩著大家，其實廚藝差得嚇人還硬要下廚',
    dailyBack:'在地方上教書，也是這一帶地主家的大小姐，閒不下來愛管鄰里的事'} }
];

// 御主 persona 為 4 段頓號（日常表象・真實內裡・喜歡・厭惡）供 TRAIT/PREF 解析；
// back＝身世生平（show-don't-tell 的演出依據）、moe＝萌點（不限反差，外觀/行為/習慣特色皆可）。
var SEED_MASTERS = [
  // 第五次
  // circuits=27(官方數字，一般魔術師約20條)：他真正的弱項是迴路品質而非數量，此欄只管數量。
  {id:'衛宮士郎-5th',  name:'衛宮士郎', gender:'男', appearance:'紅褐短髮的高中生，樸素襯衫',   war:'5th', align:'秩序・善', magic:'投影／強化',          circuits:27, melee:'D', magic_rank:'D', home:'冬木·深山町', wish:'成為正義的伙伴',          persona:'樂於助人的好好先生・扭曲的自我犧牲・熱衷修繕與張羅三餐・厭惡見死不救', back:'冬木大火倖存的孤兒、繼承切嗣的理想', moe:'自己滿身傷還先擔心別人'},
  // circuits=50：她的魔術回路質量遠超同齡水準，公認罕見。凜是姊姊，櫻才是被送養的妹妹。
  {id:'遠坂凜-5th',    name:'遠坂凜', gender:'女', appearance:'黑長雙馬尾、紅衣黑裙，傲然',     war:'5th', align:'中立・善', magic:'寶石魔術',            circuits:50, melee:'C', magic_rank:'A', home:'遠坂宅',     wish:'見證聖杯・不負遠坂之名',  persona:'人前完美的優等生・刀子嘴豆腐心・收藏寶石・厭惡示弱與失態', back:'遠坂家長女（櫻是被送養的妹妹）、父親死於上屆聖杯戰爭', moe:'連家電都用不明白'},
  // 慎二才是間桐家血親獨子，妹妹櫻才是被收養進來頂替魔術後嗣的那位。
  {id:'間桐慎二-5th',  name:'間桐慎二', gender:'男', appearance:'藍髮神經質青年，刻薄表情',   war:'5th', align:'混沌・惡', magic:'魔術迴路微弱・依賴從者', circuits:15, melee:'E', magic_rank:'E', home:'間桐宅',     wish:'被認可・奪取勝利',        persona:'自信張揚的表象・自卑虛榮・眾人吹捧與凌駕他人的優越感・厭惡比自己強的人', back:'間桐血親獨子（櫻才是養女）、迴路微弱不被家族認可', moe:'色厲內荏一戳就破'},
  // wish：「到達根源」是他早已放棄的舊初衷，如今只剩逃脫死亡、把奪杯戰爭當餘生消遣。
  {id:'間桐臟硯-5th',  name:'間桐臟硯', gender:'男', appearance:'乾癟矮小的千年老人，蟲蝕枯槁之軀', war:'5th', align:'混沌・惡', magic:'間桐之蟲術・吸血蟲・延命', circuits:40, melee:'E', magic_rank:'A', home:'間桐宅',     wish:'逃脫死亡（不老不死）・視奪杯為餘生消遣', persona:'老謀深算・對活下去的病態執著・蒐羅珍稀魔術與延命的活體材料・厭惡死亡與軟弱', back:'活了五百年的間桐始祖、視子孫為延命容器', moe:'陰森的耐性'},
  {id:'葛木宗一郎-5th',name:'葛木宗一郎', gender:'男', appearance:'戴眼鏡的沉默教師，黑西裝', war:'5th', align:'秩序・中庸', magic:'體術（蛇之拳）・無魔術', circuits:10, melee:'A', magic_rank:'E', home:'柳洞寺',     wish:'無所求・守護所重視之人',     persona:'沉默盡責的教師・別無所求的絕對忠誠・教書育人與默默鍛鍊武藝・厭惡虛偽的言辭', back:'本是無名殺手，因其從者第一次有了「想守護之物」', moe:'不懂浪漫卻最深情'},
  {id:'言峰綺禮-5th',  name:'言峰綺禮', gender:'男', appearance:'高大神父、黑色法衣，陰沉',   war:'5th', align:'混沌・惡', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'尋得能讓自己喜悅之物',    persona:'虔誠神父的假面・以他人痛苦為樂的空虛・與從者對飲時的閒談・厭惡平庸的善', back:'壓抑天性數十年，已在某位高傲英靈慫恿下坦然墮落', moe:'麻婆豆腐的意外執著'},
  {id:'伊莉雅絲菲爾-5th',name:'伊莉雅絲菲爾', gender:'女', appearance:'紅眼白髮的幼小少女，毛領大衣',war:'5th', align:'中立・善',magic:'愛因茲貝倫煉金術・聖杯依代',    circuits:80, melee:'D', magic_rank:'A', home:'冬木·新都', wish:'完成聖杯的使命',          persona:'天真爛漫・哀傷的聖杯依代・被珍視疼愛的陪伴・厭惡孤獨', back:'人造人、被當作工具養大卻渴望親情', moe:'強顏歡笑的寂寞'},
  // circuits=50：她本人的回路質量與凜同級(人類頂尖水準)，無限魔力來自聖杯泥附體(已在magic欄體現)，
  // 不該混進她自己的天賦數字。官方設定髮色為深紫色，黑化不因此變色。
  {id:'間桐櫻(黑化)-5th',name:'間桐櫻', gender:'女', appearance:'深紫長髮、黑紅禮服，泛著陰冷寒意',war:'5th', align:'混沌・惡',magic:'聖杯之泥・無限魔力・蟲爪', circuits:50, melee:'E', magic_rank:'A', home:'間桐宅', wish:'獨佔所愛、將世界一同拖入黑暗', persona:'溫順乖巧的假面・被黑泥吞噬的佔有慾・香甜的點心與嚇人的怪談・厭惡傷害過自己的一切', back:'遠坂次女、送養間桐受蟲蝕十一年後黑化', moe:'可憐又可怖'},
  // 第四次
  // circuits=15/magic_rank=C：他的魔術回路數量少質量也差(原作明寫、故Saber供魔得靠愛麗絲)，
  // 真正殺傷力來自起源彈與戰術，「天才殺手·蹩腳魔術師」的反差不該被回路數字掩蓋。
  {id:'衛宮切嗣-4th',  name:'衛宮切嗣', gender:'男', appearance:'黑髮疲憊的男人，風衣',   war:'4th', align:'中立・善', magic:'起源彈・固有時制御',    circuits:15, melee:'A', magic_rank:'C', home:'冬木·深山町', wish:'以聖杯拯救世界、終結戰爭',persona:'冷酷疲憊的魔術師殺手・為大義不擇手段・與家人共度的平靜日常・厭惡無謂的犧牲', back:'背負「拯救多數而犧牲少數」的覺悟參戰', moe:'冷酷算計下其實最痛恨殺戮'},
  {id:'遠坂時臣-4th',  name:'遠坂時臣', gender:'男', appearance:'金棕髮的優雅紳士，名門做派',   war:'4th', align:'秩序・中庸', magic:'寶石魔術',            circuits:50, melee:'D', magic_rank:'A', home:'遠坂宅',     wish:'抵達「根源之渦」',        persona:'優雅從容的名門紳士・抵達根源的執念・珍稀寶石與名門的體面排場・厭惡粗鄙與失格', back:'遠坂當主、以正統之道召喚出契合自身的英靈', moe:'名門的迂腐可愛'},
  // home=海特飯店(他實際據點，被切嗣炸毀之處)；circuits=65為時鐘塔科主等級，與韋伯拉開懸殊差距。
  {id:'肯尼斯-4th',    name:'肯尼斯', gender:'男', appearance:'金髮高傲的年輕教授',     war:'4th', align:'秩序・惡', magic:'礦石科・流體操作',      circuits:65, melee:'C', magic_rank:'A', home:'海特飯店', wish:'榮譽與學術成就',          persona:'高傲的天才教授・極高的自尊・學術成就與未婚妻索菈的陪伴・厭惡被輕視', back:'時鐘塔天才講師、攜未婚妻索菈參戰', moe:'被打臉時的崩潰'},
  // home=麥肯基宅(他借住深山町山丘老夫婦家)；circuits=15：原作明寫他是時鐘塔墊底資質。
  {id:'韋伯·維爾維特-4th',name:'韋伯·維爾維特', gender:'男', appearance:'黑髮瘦小的少年魔術師',war:'4th', align:'中立・善',magic:'自我暗示・基礎魔術', circuits:15, melee:'E', magic_rank:'C', home:'麥肯基宅', wish:'證明自己的價值',          persona:'故作老成的少年・自卑卻好強・渴望獲得認可的實力・厭惡被當作無能', back:'時鐘塔末席學生、偷走觸媒召喚出羈絆深厚的英靈', moe:'口嫌體正直'},
  // wish：他對聖杯毫無興趣，圖的是跟從者共享新奇殺戮的快感；home=澪標川下水道廢棄工房(實際據點)。
  {id:'雨生龍之介-4th',name:'雨生龍之介', gender:'男', appearance:'輕浮的金髮青年，咧嘴而笑', war:'4th', align:'混沌・惡', magic:'無魔術・召喚術（外行）', circuits:10, melee:'C', magic_rank:'E', home:'碼頭倉庫', wish:'見識更新奇的殺戮・與從者共享獵奇的快感',persona:'輕浮開朗・天生純粹之惡・新奇獵奇的殺戮快感・厭惡無聊', back:'毫無魔術素養、誤打誤撞召喚出與自己瘋狂共鳴的英靈', moe:'毫無惡意的惡'},
  {id:'言峰綺禮-4th',  name:'言峰綺禮', gender:'男', appearance:'尚未墮落的青年神父，壓抑',   war:'4th', align:'秩序・中庸', magic:'代行者・黑鍵',        circuits:25, melee:'A', magic_rank:'C', home:'言峰教會',   wish:'探求自身空虛的答案',      persona:'壓抑的青年神父・尚未墮落的空虛・說不出所以然卻感到安心的日常公務・厭惡虛假的自己', back:'奉命輔佐盟友魔術師、正逐步走向深淵', moe:'壓抑天性的痛苦掙扎'},
  {id:'間桐雁夜-4th',  name:'間桐雁夜', gender:'男', appearance:'蟲蝕半白頭髮的憔悴男子',   war:'4th', align:'中立・善', magic:'間桐之蟲術',          circuits:15, melee:'D', magic_rank:'C', home:'間桐宅',     wish:'從間桐手中救出櫻',        persona:'憔悴悲憤・自我犧牲的執念・對櫻叔父般的疼惜・厭惡間桐家', back:'曾逃離間桐的男人、為救櫻重回家門植入蟲術', moe:'對櫻叔父般的疼惜（非生父）'}
];

// 從者物件 → 英靈殿列（順序＝COL.HERO）
function servantToHeroRow_(s) {
  var p = s.persona || {};
  return [s.id, s.cls, s.realName, s.gender, JSON.stringify(s.six),
    JSON.stringify(s.classSkills), JSON.stringify(s.skills), JSON.stringify(s.traits),
    s.np, JSON.stringify(s.persona), s.align, JSON.stringify(s.wars), 'seed',
    p.dailyLook || '', p.dailyWords || '', p.dailyMoe || '', p.dailyOutfit || ''];
}
// 御主物件 → 御主殿列（順序＝COL.MASTER；末兩欄 身世、萌點 為本版新增）
function masterToCodexRow_(m) {
  return [m.id, m.name, m.gender, m.appearance, m.magic, m.circuits, m.melee,
    m.magic_rank, m.home, m.wish, m.persona, m.war, 'seed', m.back || '', m.moe || '', m.align || ''];
}

// 種子人設版本：每次精緻化 persona(萌點/口吻) 就升一版，觸發既有英靈殿/御主殿升級
var CODEX_PERSONA_VER = 'v69'; // v69：玩家指出「豐滿」太籠統(AI不一定會讀成胸部大)，美杜莎/斯卡哈
//   x2的胸部描寫改成明確的「巨乳」，AI生成prompt的範例詞同步從「高挑豐滿」改「巨乳/貧乳」對照組。
//   v68：女性種子角色dailyLook補上身形/體態描寫(阿爾托莉雅嬌小玲瓏、
//   美杜莎/斯卡哈豐滿、美狄亞纖細、凜勻稱、大河嬌小)，幼女型角色(伊莉雅絲菲爾等)刻意不加。
//   v67：萌點欄位不再侷限「反差萌」——凜的萌點從瞎編的「私下迷糊」
//   改成canon「電器白痴」；大河的喜歡改成canon「蹭飯偷吃」(大食)，不再是抽象句子。
//   v66：凜/櫻/大河鑑賞日常欄補喜歡/討厭具體細節、拿掉會被覆誦的身高數字；
//   SEED_MASTERS 全數14人persona欄從3段補齊成註解要求的4段(原本喜歡欄位缺失，解析時被厭惡內容錯位頂替)。
//   v65：SEED_MASTERS 補齊 align 陣營欄(原本從沒填過)。每次精緻化種子 persona(萌點/口吻/日常欄)就升一版，觸發
//   upgradeCodexPersonas_ 整列覆寫既有英靈殿/御主殿(已召喚過的英靈才讀得到新內容)。
//   逐版校對細節與查證來源見 SOLO_REFERENCE.md，不在此堆積歷史留言。

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
      // 日常版欄位(dailyLook/dailyWords等)已手寫寫死進每位 persona，servantToHeroRow_ 回傳含這些欄，
      // 整列覆寫即帶最新內容，不需要事後 clearContent() 逼 AI 重新生成。
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
  // 🧹 淘汰孤兒：種子改名/汰換後，英靈殿殘留的舊種子列(ID 已不在 SEED_SERVANTS)自動清除，
  //    嚴格只刪來源=='seed' 者，杜絕誤刪玩家自創英靈(ai_gen)。由下往上刪避免位移。
  for (var j = d.length - 1; j >= 1; j--) {
    if (!byId[String(d[j][COL.HERO.ID])] && String(d[j][COL.HERO.SOURCE]) === 'seed') { hero.deleteRow(j + 1); n++; }
  }
  if (n) try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  return n;
}

// 升級既有御主殿：依種子整列重寫（依 ID 對應；不動客製御主）。整列重寫(而非只刷 persona/back/moe)
//   確保 circuits/home/wish/melee/magic_rank 等影響玩法的欄位(如迴路→敵御主魔力池)也能吃到種子校正。
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
  return n;
}

// 🔄 重刷「已召喚實體化」從者的【戰鬥數據】(寶具/六圍/標籤 fx)為最新種子值——種子改了，已在場的從者也跟上。
//   依 (真名, 職階) 對應種子(斯卡哈 Lancer/Assassin 同名靠職階區分)。只刷 GAS 掌的數值欄；
//   ⚠ 不動 HP/MP/MEMORY/敘事欄/狀態/位置/羈絆，保住玩家實例狀態與逆天改命。查無種子(AI 原創從者)→跳過。
// ⚠ 換職階遷移表：種子改版連職階都換掉時(舊 key→新 key)，已召喚實體的 RANK 欄還存舊職階，
//   單靠 (真名,職階) 對不上新種子，換版削弱就永遠不生效於既有存檔。
// 🐛→✅ 舊表另有 '貞德｜Ruler': '貞德｜Archer' 一條，新舊 key 指的「貞德」在現行 SEED_SERVANTS
//   都查無此人(regulation 換版遺留的懸空項)，久放只會混淆維護者，故清除；只留下面這條活的改名映射。
var SEED_RECLASSED_ = { '吉爾·德·萊斯（青鬍子）｜Caster': '吉爾·德·萊斯｜Caster' }; // 後者為 realName 去掉原型綽號，舊列名字不改、kit 照刷
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
    // 🐛→✅ 舊碼查無新 key 就直接改 RANK，若遷移表的「新 key」本身也是懸空值(如已從種子庫整個
    //   移除的英靈)，會把玩家實例的職階欄改成一個查無數據的職階、卻因下面 !s continue 而拿不到
    //   新六圍/技能同步——職階跟戰鬥數據對不上。改成先確認新 key 真的解得到種子才動 RANK。
    if (!byKey[k] && SEED_RECLASSED_[k] && byKey[SEED_RECLASSED_[k]]) {
      k = SEED_RECLASSED_[k];
      data[i][COL.PC.RANK] = k.split('｜')[1]; // 職階欄跟著換新(戰鬥 profile/演出都吃這欄)
    }
    var s = byKey[k];
    if (!s) continue; // AI 原創從者無種子 → 不動
    // 🌸 鑑賞(k_)實例：戰時無 back、身世改讀 dailyBack。補寫種子後，已在場的同伴也趁版本升級一起
    //   刷新身世，不再卡在「生活在這座城鎮裡的普通身影」通用預設(如舊 SABER)。只動鑑賞列、不碰 solo。
    if (String(data[i][COL.PC.GAME_ID] || '').indexOf('k_') === 0 && s.persona && s.persona.dailyBack) {
      data[i][COL.PC.BACK] = String(s.persona.dailyBack).slice(0, 28);
    }
    data[i][COL.PC.MARTIAL] = s.np || data[i][COL.PC.MARTIAL];
    data[i][COL.PC.SIX] = JSON.stringify(s.six);
    data[i][COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(s.classSkills, 'class').concat(tagSkillKind_(s.skills, 'skill')), traits: s.traits || [] });
    n++;
  }
  if (n) pc.getRange(1, 1, data.length, data[0].length).setValues(data);
  // 🌸 鑑賞眾生(獨立分頁)補刷：上面 k_ 分支掃的是「眾生」，但鑑賞同伴其實住「鑑賞眾生」分頁，
  //   原分支永遠掃不到(§125 死分支)。這裡對鑑賞列刷三樣會被寫進在場卡的種子衍生欄：
  //   BACK(dailyBack)、TRAIT(最新 dailyLook 四段)、MEMORY 的【口吻】(最新 dailyLook 第3段)——
  //   種子措辭修正(如大河「動不動自稱」→「得意時自稱」)已召喚的同伴才吃得到。工房/AI原創查無種子不動。
  var kpc = ss.getSheetByName('鑑賞眾生');
  if (kpc && kpc.getLastRow() > 1) {
    var kdata = kpc.getDataRange().getValues();
    var kn = 0;
    for (var j = 1; j < kdata.length; j++) {
      if (String(kdata[j][COL.PC.FACTION]) !== '從者') continue;
      if (String(kdata[j][COL.PC.ID]).indexOf('DEAD_') === 0) continue;
      var kk = key(kdata[j][COL.PC.NAME], kdata[j][COL.PC.RANK]);
      if (!byKey[kk] && SEED_RECLASSED_[kk] && byKey[SEED_RECLASSED_[kk]]) kk = SEED_RECLASSED_[kk];
      var ks = byKey[kk];
      if (!ks || !ks.persona) continue;
      if (ks.persona.dailyBack) kdata[j][COL.PC.BACK] = String(ks.persona.dailyBack).slice(0, 28);
      var kparts = String(ks.persona.dailyLook || '').split('、').map(function (x) { return x.trim(); }).filter(Boolean);
      if (kparts.length >= 4) {
        kdata[j][COL.PC.TRAIT] = parseTraitsHelper(ks.persona.dailyLook, '外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面');
        var kmem = String(kdata[j][COL.PC.MEMORY] || '');
        var ksp = kparts[2].slice(0, 40);
        kdata[j][COL.PC.MEMORY] = /【口吻】/.test(kmem)
          ? kmem.replace(/【口吻】[^｜|【]*/, '【口吻】' + ksp)
          : (kmem ? kmem + '｜' : '') + '【口吻】' + ksp;
      }
      kn++;
    }
    if (kn) kpc.getRange(1, 1, kdata.length, kdata[0].length).setValues(kdata);
    n += kn;
  }
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

