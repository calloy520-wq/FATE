/**
 * ============================================================
 * FATE 第五次聖杯戰爭 (多人分享・獨立存檔完全體) - SetupDB.gs 強制升級版
 * 執行此函式會強制建立 Players_Save (32欄多人存檔) 並清除舊版單人 Status 分頁
 * ============================================================
 */
function initFateDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 先建立所有新結構分頁 (確保試算表至少有5個分頁，刪除舊分頁才不會報錯)
  setupCharAppearanceSheet_(ss);
  setupFactionsRelationsSheet_(ss);
  setupLorebookSheet_(ss);
  setupPlayersSaveSheet_(ss);
  setupChatLogSheet_(ss);

  // 2. 安全移除舊版單人 Status 分頁
  const oldStatus = ss.getSheetByName('Status');
  if (oldStatus && ss.getSheets().length > 1) {
    ss.deleteSheet(oldStatus);
  }

  // 3. 若有預設的「工作表1」且為空白，順便清理保持整潔
  const defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.flush();
  Logger.log('✅ 升級成功！Players_Save (多人獨立存檔表) 與全套世界書已就緒！');
}

/**
 * 1. 角色外觀庫 (核心體貌與當前服裝分離，支援動態換裝與破損)
 */
function setupCharAppearanceSheet_(ss) {
  const sheetName = 'Char_Appearance';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  const headers = [
    '角色ID',
    '觸發名稱',
    '性別(girl/boy)',
    '核心體貌特徵 (永不改變的五官/髮型/體型)',
    '預設初始服裝 (開局基準服裝)',
    '負面排除 UC'
  ];

  const rows = [
    [
      'player_master',
      '玩家,御主,我,自己',
      'girl',
      '1girl, black hair, long hair, golden eyes, large breasts',
      'black turtleneck keyhole sweater, black pantyhose, bare feet',
      'armor, weapon'
    ],
    [
      'scathach',
      '斯卡哈,師匠,影之國女王',
      'girl',
      '1.2::scathach (fate)::, fate/grand order, very long purple hair, red eyes, large breasts, slender',
      'purple bodysuit, tight bodysuit, black veil, gold trim, thighhighs',
      'short hair'
    ],
    [
      'prisma_illya',
      '魔法少女伊莉雅,魔伊,紅寶石之星',
      'girl',
      '1.2::illyasviel von einzbern (prism illya)::, fate/kaleid liner prisma illya, long silver hair, white hair, twintails, red eyes, petite',
      'magical girl, pink and white dress, frills, pink ribbon, thighhighs, white boots, holding magical wand',
      'winter coat, purple coat, hat, tall'
    ],
    [
      'chloe',
      '小黑,克洛伊',
      'girl',
      '1.2::chloe von einzbern::, fate/kaleid liner prisma illya, dark skin, tanned skin, silver hair, white hair, twintails, yellow eyes, petite',
      'pink and black outfit, exposed shoulders, shorts, thighhighs',
      'pale skin, winter coat'
    ],
    [
      'miyu',
      '美遊,藍寶石之星',
      'girl',
      '1.2::miyu edelfelt::, fate/kaleid liner prisma illya, long black hair, twintails, yellow eyes, petite',
      'magical girl, blue and white dress, frills, blue ribbon, thighhighs, blue boots',
      'silver hair, pink dress'
    ],
    [
      'saber',
      'Saber,阿爾托莉雅,亞瑟王',
      'girl',
      '1.2::artoria pendragon (fate)::, fate/stay night, blonde hair, hair bun, single hair bun, ahoge, green eyes',
      'blue dress, silver chestplate, silver gauntlets, armored skirt, blue ribbon',
      'alter'
    ],
    [
      'saber_alter',
      '黑Saber,Saber Alter',
      'girl',
      '1.2::artoria pendragon (alter)::, fate/stay night, pale skin, blonde hair, hair bun, yellow eyes',
      'black visor, black armor, dark dress, black gauntlets',
      'ahoge, green eyes, blue dress'
    ],
    [
      'archer',
      'Archer,紅A,衛宮',
      'boy',
      '1.2::emiya (fate)::, fate/stay night, white hair, spiky hair, slicked-back hair, tanned skin, grey eyes, muscular',
      'red coat, black sleeveless bodysuit, metal shoulder plates, black trousers',
      'blonde hair'
    ],
    [
      'lancer',
      'Lancer,庫夫林,大狗',
      'boy',
      '1.2::cu chulainn (fate)::, fate/stay night, blue hair, long hair, low ponytail, red eyes, earrings',
      'blue bodysuit, tight clothes, silver shoulder armor, rune patterns on outfit',
      'short hair, blonde hair'
    ],
    [
      'rider',
      'Rider,美杜莎,R姐',
      'girl',
      '1.2::medusa (fate)::, fate/stay night, very long purple hair, pink eyes, large breasts, slender',
      'black blindfold, black visor, black turtleneck sleeveless dress, black thighhighs, high heels',
      'short hair'
    ],
    [
      'caster',
      'Caster,美狄亞,C媽',
      'girl',
      '1.2::medea (fate)::, fate/stay night, long purple hair, pointed ears, elf ears, purple eyes',
      'purple hooded cloak, blue dress, gold trim, golden collar',
      'round ears, short hair'
    ],
    [
      'assassin',
      'Assassin,佐佐木小次郎',
      'boy',
      '1.2::sasaki kojiro (fate)::, fate/stay night, long purple hair, high ponytail, purple eyes',
      'purple haori, blue hakama, white undershirt, japanese clothes',
      'western armor'
    ],
    [
      'berserker',
      'Berserker,海克力士,B叔',
      'boy',
      '1.2::heracles (fate)::, fate/stay night, giant, extremely muscular, dark skin, long wild black hair, red glowing eyes',
      'grey loincloth, leather straps',
      'shirt, slender'
    ],
    [
      'gilgamesh',
      '吉爾伽美什,金閃閃,英雄王',
      'boy',
      '1.2::gilgamesh (fate)::, fate/stay night, blonde hair, spiky hair, red eyes, slit pupils, earrings',
      'golden armor, ornate gold chestplate, red waistcloth',
      'black hair'
    ],
    [
      'shirou',
      '衛宮士郎,士郎',
      'boy',
      '1.2::emiya shirou::, fate/stay night, auburn hair, spiky hair, golden-brown eyes',
      'white and blue raglan shirt, blue jeans',
      'white hair, tanned skin'
    ],
    [
      'rin',
      '遠坂凜,凜',
      'girl',
      '1.2::tohsaka rin::, fate/stay night, long black hair, twintails, blue eyes',
      'red turtleneck sweater, black pleated skirt, black thighhighs, cross necklace',
      'blonde hair, ponytail'
    ],
    [
      'sakura',
      '間桐櫻,櫻',
      'girl',
      '1.2::matou sakura::, fate/stay night, purple hair, medium hair, purple eyes',
      'red hair ribbon, white blouse, purple skirt, school uniform',
      'twintails, glasses'
    ],
    [
      'illya',
      '伊莉雅(原作),愛因茲貝倫伊莉雅',
      'girl',
      '1.2::illyasviel von einzbern::, fate/stay night, long silver hair, white hair, red eyes, petite',
      'purple winter coat, white fur trim, purple hat, white thighhighs',
      'magical girl, pink dress'
    ],
    [
      'kirei',
      '言峰綺禮,神父',
      'boy',
      '1.2::kotomine kirei::, fate/stay night, short black hair, dark eyes, stern face',
      'black priest cassock, white clerical collar, silver cross',
      'blonde hair'
    ],
    [
      'souichirou',
      '葛木宗一郎,葛木老師',
      'boy',
      '1.2::kuzuki souichirou::, fate/stay night, short black hair, glasses, sharp eyes',
      'dark grey suit, white dress shirt, necktie',
      'casual clothes'
    ],
    [
      'jeanne',
      '貞德,聖女貞德',
      'girl',
      '1.2::jeanne d\'arc (fate)::, fate/apocrypha, blonde hair, very long hair, single braid, blue eyes',
      'black headpiece, silver armor, purple dress, cape, thighhighs',
      'short hair, alter, yellow eyes'
    ],
    [
      'jalter',
      '黑貞德,貞德Alter',
      'girl',
      '1.2::jeanne d\'arc (alter) (fate)::, fate/grand order, white hair, short hair, yellow eyes',
      'black headpiece, black armor, dark purple dress, black cape, chains',
      'long hair, braid, blue eyes'
    ],
    [
      'mordred',
      '莫德雷德,小莫',
      'girl',
      '1.2::mordred (fate)::, fate/apocrypha, blonde hair, ponytail, ahoge, green eyes',
      'silver and red armor, horned helmet, armored gauntlets, red cape',
      'blue dress, long hair'
    ],
    [
      'okita',
      '沖田總司,沖田',
      'girl',
      '1.2::okita souji (fate)::, fate/grand order, blonde hair, ponytail, ahoge, teal eyes',
      'blue haori, white scarf, black kimono, japanese clothes, thighhighs',
      'western armor'
    ],
    [
      'tamamo',
      '玉藻前,C狐',
      'girl',
      '1.2::tamamo no mae (fate)::, fate/extra, pink hair, long hair, fox ears, fox tail, yellow eyes',
      'blue kimono, wide sleeves, gold hair ornament, obi',
      'human ears, armor'
    ],
    [
      'ereshkigal',
      '艾蕾什基伽爾,艾蕾',
      'girl',
      '1.2::ereshkigal (fate)::, fate/grand order, blonde hair, twintails, red eyes',
      'golden crown, black dress, red cape, gold jewelry, black thighhighs',
      'blue eyes'
    ],
    [
      'karna',
      '迦爾納',
      'boy',
      '1.2::karna (fate)::, fate/apocrypha, white hair, medium hair, pale skin, blue eyes',
      'golden armor, red bodysuit, black fur collar, earrings',
      'dark skin'
    ],
    [
      'hassan',
      '咒腕哈桑,真Assassin,哈桑,咒腕',
      'boy',
      '1.2::hassan of the cursed arm (fate)::, fate/stay night, white skull mask, dark skin, tall, thin, long right arm',
      'black cloak, tattered cloak, bandaged right arm, wrapped arm',
      'visible face, eyes, short arms'
    ]
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
  sheet.setColumnWidth(4, 380);
  sheet.setColumnWidth(5, 380);
}

/**
 * 2. 原作七組主從與人際關係矩陣
 */
function setupFactionsRelationsSheet_(ss) {
  const sheetName = 'Factions_Relations';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  const headers = ['陣營名稱', '御主ID', '從者ID', '預設狀態', '預設態度', '原作主從關係與人際內幕 (結盟/挖角依據)'];
  const rows = [
    [
      '衛宮組 (Saber陣營)',
      'shirou',
      'saber',
      '存活',
      '中立警戒',
      '【主從關係】衛宮士郎與阿爾托莉雅。士郎魔術半吊子且過度保護Saber，Saber重視騎士榮譽與保護無辜。士郎與遠坂凜是同校同學、與間桐櫻是青梅竹馬。若玩家展現正義感或保護普通人，極易達成臨時結盟。'
    ],
    [
      '遠坂組 (Archer陣營)',
      'rin',
      'archer',
      '存活',
      '中立試探',
      '【主從關係】遠坂凜與紅A。表面常鬥嘴實則默契極佳，紅A的真實身分是未來的衛宮士郎。凜其實是間桐櫻的親姐姐。重視利益交換，可透過情報或聯手討伐Caster結盟。'
    ],
    [
      '教會組 (Lancer陣營)',
      'kirei',
      'lancer',
      '存活',
      '敵對暗算',
      '【主從關係】言峰綺禮殺害原御主後奪取了庫·夫林的控制權，Lancer極度厭惡綺禮的卑鄙作風，僅因令咒被迫服從。綺禮同時是英雄王吉爾伽美什的御主。若在戰鬥中堂堂正正認可Lancer的武勇，有機會觸發其倒戈。'
    ],
    [
      '間桐組 (Rider陣營)',
      'sakura',
      'rider',
      '存活',
      '隱蔽觀察',
      '【主從關係】美杜莎的真正御主是間桐櫻，因櫻不願戰鬥而透過「偽臣之書」交給哥哥間桐慎二指揮。Rider對慎二毫無忠誠，一心只想保護櫻。只要解救櫻或奪取偽臣之書，Rider會毫不猶豫轉投玩家陣營。'
    ],
    [
      '柳洞寺組 (Caster/Assassin陣營)',
      'souichirou',
      'caster',
      '存活',
      '敵對防備',
      '【主從關係】Caster美狄亞與葛木宗一郎聯手佔據柳洞寺，山門由守門人Assassin佐佐木小次郎（必殺劍技「燕返」）鎮守。Caster持有寶具「萬符必應破戒」，會試圖搶奪其他御主的從者契約。'
    ],
    [
      '愛因茲貝倫組 (Berserker陣營)',
      'illya',
      'berserker',
      '存活',
      '敵對獵殺',
      '【主從關係】伊莉雅與狂戰士海克力士擁有極高魔力連結與深厚羈絆。伊莉雅初期對衛宮士郎抱有強烈恨意，性格殘酷卻內心孤獨。'
    ]
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#7c2d12').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 5);
  sheet.setColumnWidth(6, 540);
}

/**
 * 3. 世界書 (核心規則 + 寶具設定)
 */
function setupLorebookSheet_(ss) {
  const sheetName = 'Lorebook';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  const headers = ['觸發關鍵字 (逗號分隔)', '分類', '優先級(1-10)', '世界觀與能力設定'];
  const rows = [
    [
      '第八組,異常參戰,聖杯戰爭,令咒,規則,雙從者',
      '核心規則',
      10,
      '大聖杯空間扭曲將玩家召喚為「第 8 組異常御主」。玩家可透過劇情說服、解除契約或使用特殊手段達成「結盟」甚至「雙從者契約（同時擁有主從者與副從者）」。御主擁有三劃令咒，可下達絕對命令、空間轉移或強制強化。'
    ],
    [
      '魔法少女伊莉雅,魔伊,紅寶石之星,多元重奏飽和砲擊',
      '英靈設定',
      9,
      '魔法少女伊莉雅：手持「萬華鏡之杖·紅寶石之星」，能透過「夢幻召喚」借用其他英靈卡片力量，全力砲擊「多元重奏飽和砲擊」具備對城級破壞力。'
    ],
    [
      '貫穿死翔之槍,影之國,斯卡哈,師匠',
      '英靈設定',
      9,
      '斯卡哈（Lancer）：凱爾特影之國女王，擅長原初盧恩魔術與魔槍「貫穿死翔之槍」，對神性敵人具備壓倒性特攻。'
    ],
    [
      '誓約勝利之劍,Excalibur,風王結界,Saber',
      '英靈設定',
      8,
      'Saber阿爾托莉雅：平時以「風王結界」隱藏劍身，真名解放「誓約勝利之劍」釋放金色毀滅光束。'
    ],
    [
      '無限劍製,Unlimited Blade Works,Archer,紅A',
      '英靈設定',
      8,
      'Archer（紅A）：擅長干將莫邪雙刀與遠程狙擊，固有結界「無限劍製」可複製見過的所有兵器。'
    ],
    [
      '刺穿死棘之槍,Gae Bolg,Lancer,庫夫林',
      '英靈設定',
      8,
      'Lancer庫·夫林：魔槍「刺穿死棘之槍」逆轉因果，必中心臟。'
    ],
    [
      '王之財寶,天地乖離,Ea,吉爾伽美什,金閃閃',
      '英靈設定',
      10,
      '英雄王吉爾伽美什：背後金色波紋無限射出寶具原典「王之財寶」，最強對界寶具「Ea」可撕裂世界。'
    ]
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#312e81').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 3);
  sheet.setColumnWidth(4, 520);
}

/**
 * 4. 多玩家獨立存檔總表 (取代舊版單人 Status 分頁)
 */
function setupPlayersSaveSheet_(ss) {
  const sheetName = 'Players_Save';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  const headers = [
    '玩家名稱(繁中5字內)', // 1
    '最後登入時間',         // 2
    '遊戲階段',             // 3
    '遊玩模式',             // 4
    '自動生圖',             // 5
    '成人模式',             // 6
    '天數(Day)',            // 7
    '時段',                 // 8
    '剩餘AP',               // 9
    '警戒度(0-100)',        // 10
    '當前地點',             // 11
    '御主性別',             // 12
    '御主出身',             // 13
    '御主外觀Tags',         // 14
    '御主HP',               // 15
    '御主MP',               // 16
    '剩餘令咒',             // 17
    '主從者ID',             // 18
    '主從者職階',           // 19
    '主從者真名',           // 20
    '主從者HP',             // 21
    '主從者NP',             // 22
    '主從者六維',           // 23
    '副從者ID',             // 24
    '副從者職階',           // 25
    '副從者真名',           // 26
    '副從者HP',             // 27
    '副從者NP',             // 28
    '動態服裝狀態JSON',     // 29
    '陣營關係與結盟JSON',   // 30
    '長期記憶摘要',         // 31
    '結局與排行榜積分'      // 32
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#064e3b').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(14, 280);
  sheet.setColumnWidth(29, 320);
  sheet.setColumnWidth(31, 360);
}

/**
 * 5. 多玩家對話紀錄表 (含玩家名稱隔離欄位)
 */
function setupChatLogSheet_(ss) {
  const sheetName = 'ChatLog';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clear();

  const headers = [
    '玩家名稱',
    '回合數',
    '時間戳記',
    '地點與時段',
    '玩家行動輸入',
    'Gemini 劇情回覆',
    '出場角色ID',
    'NAI 最終場景 Prompt',
    'Seed'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#4c1d95').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(5, 220);
  sheet.setColumnWidth(6, 420);
  sheet.setColumnWidth(8, 320);
}