// ---------------------------------------------------------
// 🌿 生活技能：伐木/釣魚/挖礦/採藥/搜索/狩獵/淘金/採果 (獨立模組)
// GAS 決定品級與是否有收穫，AI 僅負責命名與敘事，絕不judge結果
// ---------------------------------------------------------
const LIFESKILL_LIST = ["伐木", "釣魚", "挖礦", "採藥", "搜索", "狩獵", "淘金", "採果"];

const LIFESKILL_DOMAIN = {
  "伐木": "山林中砍伐而得的木材、樹脂、稀有木料",
  "釣魚": "溪河湖海中釣獲的魚獲、貝類、罕見水產",
  "挖礦": "深山礦脈中挖出的礦石、礦砂、玉石",
  "採藥": "野外採集的藥草、藥材、罕見靈植",
  "搜索": "翻找雜物時撿到的零碎銀錢、小玩意、不起眼的小物",
  "狩獵": "獵殺野獸所得的獸肉、毛皮、獸骨、犄角",
  "淘金": "河沙中淘洗出的砂金、寶石碎屑、奇石",
  "採果": "山野間採摘的野果、山珍食材"
};

const LIFESKILL_ROLL_COST = 10; // 每骰一次扣 10 真氣
const LIFESKILL_TIER_PRICE = { "普通": [5, 15], "不錯": [20, 40], "大豐收": [50, 100] };

function rollLifeskillTier(roll) {
  if (roll <= 5) return null; // 落空
  if (roll <= 12) return "普通";
  if (roll <= 18) return "不錯";
  return "大豐收";
}

function playLifeskillGather(pcId, skillName, rollCount, sheets, COL) {
  try {
    if (!LIFESKILL_LIST.includes(skillName)) {
      return JSON.stringify({ success: false, message: "天道異常：未知的生活技能。" });
    }
    const count = [1, 3, 5].includes(parseInt(rollCount, 10)) ? parseInt(rollCount, 10) : 1;
    const cost = count * LIFESKILL_ROLL_COST;

    const pcData = sheets.pc.getDataRange().getValues();
    const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
    if (pIdx === -1) return JSON.stringify({ success: false, message: "天道異常：找不到玩家本體。" });

    let mp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    if (mp < cost) {
      return JSON.stringify({ success: false, message: `真氣不足！這趟「${skillName}」至少需要 ${cost} 真氣。` });
    }

    let lifeskills = {};
    try { lifeskills = JSON.parse(pcData[pIdx][COL.PC.LIFESKILL] || "{}"); } catch (e) { lifeskills = {}; }
    const level = parseInt(lifeskills[skillName], 10) || 0;
    const bonus = Math.min(5, Math.floor(level / 10));

    const hits = [];
    for (let i = 0; i < count; i++) {
      const roll = Math.min(20, rollD20() + bonus);
      const tier = rollLifeskillTier(roll);
      if (tier) hits.push(tier);
    }

    mp -= cost;
    lifeskills[skillName] = Math.min(100, level + 1);
    sheets.pc.getRange(pIdx + 1, COL.PC.MP + 1).setValue(mp);
    sheets.pc.getRange(pIdx + 1, COL.PC.LIFESKILL + 1).setValue(JSON.stringify(lifeskills));

    let itemsGained = [];
    let narrationText;

    if (hits.length > 0) {
      const domain = LIFESKILL_DOMAIN[skillName];
      const tierCounts = hits.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {});
      const tierDesc = Object.entries(tierCounts).map(([t, c]) => `${t}x${c}`).join("、");

      const system = `你是九州江湖的天道，玩家剛完成一次「${skillName}」（${domain}），結算結果已固定：獲得 ${tierDesc}，總計 ${hits.length} 件成果。
請為每一件成果各自構思一個符合「${domain}」意境、且貼合其品級（普通/不錯/大豐收，品級越高越罕見珍貴）的物品名稱與簡短描述(15字內)。
並用 60~120 字生動描寫這趟「${skillName}」的過程與收穫畫面(narration)。
只輸出 JSON：{"narration":"...","items":[{"name":"...","desc":"..."}]}，items 陣列長度必須恰好等於 ${hits.length}，禁止其他欄位、禁止 Markdown。`;

      const raw = callGeminiAPI(`執行生活技能：${skillName}`, system, {
        temperature: 0.9, ignoreLaw: true, max_tokens: 600, model: "google/gemini-3.1-flash-lite"
      });

      let data;
      try {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        data = JSON.parse(raw.substring(start, end + 1));
      } catch (e) { data = {}; }

      let itemData = sheets.item.getDataRange().getValues();
      const bagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
      const freeSlots = Math.max(0, MAX_BAG_SIZE - bagCount);
      const aiItems = Array.isArray(data.items) ? data.items : [];

      hits.forEach((tier, idx) => {
        if (idx >= freeSlots) return; // 行囊已滿，超出部分作廢
        const range = LIFESKILL_TIER_PRICE[tier];
        const price = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
        const aiItem = aiItems[idx] || {};
        const itemName = (aiItem.name && String(aiItem.name).trim()) || `${skillName}・${tier}收穫`;
        const itemDesc = (aiItem.desc && String(aiItem.desc).trim()) || `透過「${skillName}」取得的${tier}成果。`;
        const newItemId = "ITM_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + "_" + idx;
        sheets.item.appendRow([itemName, "消耗品", itemDesc, price, pcId, 0, 0, 0, 0, 0, newItemId]);
        itemsGained.push({ name: itemName, desc: itemDesc, tier: tier });
      });

      narrationText = (data.narration && String(data.narration).trim()) ||
        `一趟「${skillName}」下來，收穫了 ${itemsGained.length} 件東西。`;
    } else {
      narrationText = `這趟「${skillName}」沒能有什麼斬獲，看來運氣不太好。`;
    }

    const r = pcData[pIdx];
    r[COL.PC.MP] = mp;
    const freshItemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
    const statusString = buildPlayerStatusString(r, getCharacterTotalStats(pcId, sheets, pcData, freshItemData), freshItemData);

    return JSON.stringify({
      success: true,
      skill: skillName,
      rollCount: count,
      hits: hits,
      itemsGained: itemsGained,
      narration: narrationText,
      newLevel: lifeskills[skillName],
      statusString: statusString
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "生活技能運作異常：" + e.toString() });
  }
}
