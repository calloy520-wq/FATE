// ==========================================
// 🎭 Router_Persona.gs — 角色人設的共用零件：MEMORY 裡的小動作／行為準則標記、空白佔位字、
//   補魔的尺度句、性別事實句、創角提示詞共用的長句子（外貌段、氣質格）。鑑賞與新聖杯戰爭共用。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
var PERSONA_QUIRK_TAG_ = makeTextTag_('小動作');
var PERSONA_LOGIC_TAG_ = makeTextTag_('準則');
function getPersonaLogic_(memory) { return PERSONA_LOGIC_TAG_.get(memory); }
// 把種子的怪癖/行為準則附加到既有 MEMORY 字串尾端(召喚建列時呼叫，僅在有值時才附加)。
function stampPersonaFlavor_(memory, quirks, logic) {
  var s = String(memory || "");
  if (quirks) s = PERSONA_QUIRK_TAG_.set(s, String(quirks).slice(0, 40));
  if (logic) s = PERSONA_LOGIC_TAG_.set(s, String(logic).slice(0, 40));
  return s;
}

// 空白與佔位字：這些字面值一律當成「沒寫」。
var QUAD_EMPTY_ = ['', '無',
  '外貌出眾', '外貌平凡', '舉止從容', '卸下心防時的柔軟一面', '卸下心防的私密一面',
  '沉著表象', '堅定內裡', '珍視之物', '厭惡之事', '通曉魔術', '深藏心事'];


// 🔞 補魔的尺度指示（新聖杯戰爭僅有的露骨橋段，單一真實來源）。
var LEWD_EXPLICIT_ = '★這一段放到最色，寫滿寫透：器官用本名，體液、聲音、氣味、溫度全部照實寫；'
  + '衣服怎麼被解開、手先碰到哪裡、姿勢怎麼換、進出的節奏怎麼變，一個環節都攤開來寫；'
  + '身體的反應寫具體——發抖、收緊、痙攣、失神，越到後面越失控。鏡頭貼著身體走，慢慢寫。';

// 性別事實句：直接講清楚兩人的性別，免得小模型預設男性插入視角；這裡把配對事實算好直接餵給 AI。
function sealGenderFact_(masterSex, svSex, svName) {
  var mRaw = String(masterSex || ""), sRaw = String(svSex || "");
  var mSex = (mRaw === "男" || mRaw === "女") ? mRaw : "女"; // 異/無 一律按女性向器官處理，對齊全專案既有慣例
  var sSex = (sRaw === "男" || sRaw === "女") ? sRaw : "女";
  var mNote = mRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  var sNote = sRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  if (mSex === "女" && sSex === "女") {
    return `★【性別】御主${mNote}與「${svName}」${sNote}皆為女性。`;
  }
  return `★【性別】御主為${mSex}性${mNote}、「${svName}」為${sSex}性${sNote}。`;
}

// 📝 創角提示詞的共用零件（御主生成／從者召喚兩支各寫一份的那些長句子，收在這裡講一次）。
var BUST_NOTE_ = '外貌段要把身形與胸部寫進自然的敘述句裡，不用孤立的分類標籤——這句玩家看得到。';
// 🌸 氣質格怎麼寫（五處提示詞共用·單一真實來源）：第一眼撞見的氛圍，不是叫 AI 每回合表演的動作。
// ⚠ 刻意【不給例句】：禁令後面附上被禁的寫法，等於把那個寫法示範給模型看（玩家「說越多它會越想歪」）。
var AURA_SPEC_ = '氣質＝【第一眼撞見這個人時的整體氛圍】：寫成一個聞得到或感覺得到的意象，可帶淡淡的氣味、溫度或光線。'
  + '寫這個人給人的感受，不寫這個人做出來的動作，也不用單一形容詞交差。'
