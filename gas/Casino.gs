// ---------------------------------------------------------
// 🎲 長樂坊：靈紋骰局核心邏輯 (獨立模組)
// ---------------------------------------------------------
function playDiceGame(pcId, betType, betAmount, sheets, COL) {
  try {
    // 1. 取得玩家資料庫與當前銀兩
    const pcData = sheets.pc.getDataRange().getValues();
    const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
    if (pIdx === -1) return JSON.stringify({ success: false, message: "天道異常：找不到玩家本體。" });

    let playerMoney = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;

    // 2. 防呆與限額檢查
    if (betAmount < 100 || betAmount > 10000) {
      return JSON.stringify({ success: false, message: "下注金額必須在 100 至 10,000 兩之間。" });
    }
    if (playerMoney < betAmount) {
      return JSON.stringify({ success: false, message: "囊中羞澀！大俠，妳的銀兩不夠啊。" });
    }

    // 3. 擴充核心：賠率與勝利條件設定檔
    const BET_CONFIG = {
      "大": { payout: 2, checkWin: (sum, isTriple) => !isTriple && sum >= 11 && sum <= 17 }, // 1賠1，遇豹子通殺
      "小": { payout: 2, checkWin: (sum, isTriple) => !isTriple && sum >= 4 && sum <= 10 },
      "任意豹子": { payout: 25, checkWin: (sum, isTriple) => isTriple }, // 1賠24
      "豹子666": { payout: 151, checkWin: (sum, isTriple, dice) => isTriple && sum === 18 } // 1賠150
    };

    if (!BET_CONFIG[betType]) {
      return JSON.stringify({ success: false, message: "天道異常：未知的下注類型。" });
    }

    // 4. 擲出三顆骰子 (GAS 絕對安全的隨機數)
    const dice = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];
    const sum = dice.reduce((a, b) => a + b, 0);
    const isTriple = (dice[0] === dice[1] && dice[1] === dice[2]);

    // 5. 判斷勝負與結算金額
    const rule = BET_CONFIG[betType];
    const isWin = rule.checkWin(sum, isTriple, dice);
    let winnings = 0;
    let resultMsg = `開出【${dice.join(', ')}】共 ${sum} 點。`;
    let newMoney = playerMoney;

    if (isWin) {
      winnings = betAmount * rule.payout;
      newMoney += (winnings - betAmount); // 加上贏得的淨利潤
      resultMsg += `\n🎉 恭喜！押中「${betType}」，贏得 ${winnings - betAmount} 兩白銀！`;
    } else {
      newMoney -= betAmount; // 扣除下注本金
      resultMsg += isTriple ? `\n💀 天煞豹子！莊家通殺！妳失去了 ${betAmount} 兩。` : `\n差了一點！妳失去了 ${betAmount} 兩。`;
    }

    // 6. 物理寫入資料庫 (真實扣款/加錢)
    sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);

    // 7. 更新玩家狀態字串 (為了讓前端 UI 的錢包瞬間跳動)
    const r = pcData[pIdx];
    r[COL.PC.MONEY] = newMoney;
    const freshItemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
    const statusString = buildPlayerStatusString(r, getCharacterTotalStats(pcId, sheets, pcData, freshItemData), freshItemData);

    // 8. 回傳給前端播放動畫
    return JSON.stringify({
      success: true,
      diceResult: dice,
      sum: sum,
      isWin: isWin,
      winnings: winnings,
      message: resultMsg,
      statusString: statusString // 攜帶新狀態回傳
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "賭坊運作異常：" + e.toString() });
  }
}

// ---------------------------------------------------------
// 🐎 長樂坊：天馬競速核心邏輯 (獨立模組，賠率/勝率全寫死，AI僅敘述)
// ---------------------------------------------------------
const HORSE_CONFIG = [
  { id: 1, name: "閃電週", tier: "強馬", payout: 3.5 },
  { id: 2, name: "孤影鈴", tier: "強馬", payout: 3.5 },
  { id: 3, name: "東海霸", tier: "中馬", payout: 5 },
  { id: 4, name: "赤驥俠", tier: "中馬", payout: 5 },
  { id: 5, name: "瘋帆船", tier: "黑馬", payout: 7.5 },
  { id: 6, name: "米霸天", tier: "黑馬", payout: 7.5 }
];
const HORSE_RACE_GOAL = 30;
const HORSE_RACE_MAX_TURNS = 60;

// 各檔骰池經模擬驗證：強馬個體勝率約22%、中馬約15%、黑馬約13%（黑馬靠稀有大暴衝拉勝率，非穩定領先）
const HORSE_DICE_POOL = {
  "強馬": [4, 5, 6],
  "中馬": [3, 4, 5, 6, 6],
  "黑馬": [1, 1, 1, 1, 1, 1, 1, 1, 18]
};

function rollHorseTier(tier) {
  const pool = HORSE_DICE_POOL[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

function simulateHorseRace() {
  const positions = HORSE_CONFIG.map(() => 0);
  const log = [positions.slice()];
  let winnerIdx = -1;
  let turn = 0;

  while (winnerIdx === -1 && turn < HORSE_RACE_MAX_TURNS) {
    turn++;
    for (let i = 0; i < HORSE_CONFIG.length; i++) {
      positions[i] += rollHorseTier(HORSE_CONFIG[i].tier);
    }
    log.push(positions.slice());

    const maxPos = Math.max(...positions);
    if (maxPos >= HORSE_RACE_GOAL) {
      const leaders = positions.reduce((arr, p, idx) => p === maxPos ? arr.concat(idx) : arr, []);
      winnerIdx = leaders.length === 1 ? leaders[0] : leaders[Math.floor(Math.random() * leaders.length)];
    }
  }
  if (winnerIdx === -1) {
    const maxPos = Math.max(...positions);
    winnerIdx = positions.indexOf(maxPos);
  }

  const ranking = HORSE_CONFIG
    .map((h, idx) => ({ id: h.id, name: h.name, position: positions[idx] }))
    .sort((a, b) => b.position - a.position);

  return { log, winnerIdx, ranking };
}

function playHorseRaceGame(pcId, horseId, betAmount, sheets, COL) {
  try {
    const pcData = sheets.pc.getDataRange().getValues();
    const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
    if (pIdx === -1) return JSON.stringify({ success: false, message: "天道異常：找不到玩家本體。" });

    let playerMoney = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;

    if (betAmount < 100 || betAmount > 10000) {
      return JSON.stringify({ success: false, message: "下注金額必須在 100 至 10,000 兩之間。" });
    }
    if (playerMoney < betAmount) {
      return JSON.stringify({ success: false, message: "囊中羞澀！大俠，妳的銀兩不夠啊。" });
    }

    const betHorse = HORSE_CONFIG.find(h => h.id == horseId);
    if (!betHorse) return JSON.stringify({ success: false, message: "天道異常：未知的賽馬編號。" });

    const { log, winnerIdx, ranking } = simulateHorseRace();
    const winnerHorse = HORSE_CONFIG[winnerIdx];
    const isWin = winnerHorse.id === betHorse.id;

    let winnings = 0;
    let newMoney = playerMoney;
    if (isWin) {
      winnings = Math.round(betAmount * betHorse.payout);
      newMoney += (winnings - betAmount);
    } else {
      newMoney -= betAmount;
    }

    sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);

    const r = pcData[pIdx];
    r[COL.PC.MONEY] = newMoney;
    const freshItemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
    const statusString = buildPlayerStatusString(r, getCharacterTotalStats(pcId, sheets, pcData, freshItemData), freshItemData);

    const rankingText = ranking.map((h, i) => `${i + 1}. ${h.name}(${h.position}步)`).join("、");
    const raceSystem = `你是九州「天馬競速」場的賭場說書人。一場賽馬剛剛結束，最終名次：${rankingText}。冠軍是「${winnerHorse.name}」(${winnerHorse.tier})。
玩家押注的是「${betHorse.name}」(${betHorse.tier})，結果${isWin ? `中獎，贏得 ${winnings - betAmount} 兩` : `落敗，輸了 ${betAmount} 兩`}。
請用 80~150 字生動描寫這場賽馬的激烈過程與終點衝線畫面(narration)，並自然帶出名次結果，不要重複列出數字步數。
只輸出 JSON：{"narration":"..."}，禁止其他欄位、禁止 Markdown。`;

    const raw = callGeminiAPI(`賽馬結果播報：冠軍${winnerHorse.name}`, raceSystem, {
      temperature: 0.9, ignoreLaw: true, max_tokens: 400, model: "google/gemini-3.1-flash-lite"
    });

    let data;
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      data = JSON.parse(raw.substring(start, end + 1));
    } catch (e) { data = {}; }

    const narration = (data.narration && String(data.narration).trim()) ||
      `「${winnerHorse.name}」率先衝過終點，拔得頭籌！`;

    return JSON.stringify({
      success: true,
      log: log,
      ranking: ranking,
      winnerId: winnerHorse.id,
      winnerName: winnerHorse.name,
      betHorseId: betHorse.id,
      isWin: isWin,
      winnings: winnings,
      narration: narration,
      statusString: statusString
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "賭坊運作異常：" + e.toString() });
  }
}
