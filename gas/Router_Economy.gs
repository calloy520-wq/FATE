// ==========================================
// 🔋 Router_Economy.gs — 靈基出力／魔境／符文／寶具選／補魔（2026-07 從 Router_Action.gs 拆出）
//   玩家可調的從者旋鈕(樂觀更新 setter)＋actionManaSupply(硬擠迴路回滿共用池)。
// ==========================================

function actionSetServantOutput(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可調整出力。" });
  const want = snapOutput_(userData.output);
  pcData[svIdx][COL.PC.MEMORY] = setServantOutput_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const t = outputTier_(want);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, output: want, label: t.label,
    message: `已將「${svName}」的靈基出力調至 ${want}%（${t.label}）。${want >= 100 ? '全力解放——可釋放寶具，但御主魔力消耗最劇。' : (want <= 20 ? '僅維持靈基——御主魔力消耗最省，但戰力明顯受限、無法解放寶具。' : '')}`,
    economy: playerServantEconomy_(sheets, pcId, pcData) // 樂觀更新只吃 economy；不再算前端會丟棄的 statusString(省一次整表讀)
  });
}

// 🔮 設定魔境的智慧選定標籤（斯卡哈專屬，玩家點選 1 個通用 A 階被動）：免費、即時、不耗 AP。
//   只接受 mageRealmPool_ 池內 fx；持 mage_realm 的從者才能設；空字串＝清除選擇。
function actionSetMageRealm(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = tg.skills || []; } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'mage_realm')) {
    return JSON.stringify({ success: false, message: "此從者不具「魔境的智慧」，無法自選武技。" });
  }
  const wantFx = String(userData.fx || "");
  const ent = wantFx ? mageRealmEntry_(wantFx) : null;
  if (wantFx && !ent) return JSON.stringify({ success: false, message: "該標籤不在魔境可選之列。" });
  pcData[svIdx][COL.PC.MEMORY] = setMageRealmPick_(pcData[svIdx][COL.PC.MEMORY], wantFx);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, pick: wantFx,
    message: ent ? `「${svName}」以魔境的智慧運起【${ent.n} A】——${ent.desc}` : `「${svName}」收起所運武技，回歸本來。`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// 🔯 設定原初符文運用方式（持 rune 的從者，玩家選 減傷/增傷/回血）：免費、即時、不耗 AP。
function actionSetRuneMode(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = (tg.classSkills || []).concat(tg.skills || []); } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'rune')) {
    return JSON.stringify({ success: false, message: "此從者不具「原初符文」。" });
  }
  const want = String(userData.mode || 'def');
  if (RUNE_MODES_.indexOf(want) < 0) return JSON.stringify({ success: false, message: "無此符文運用方式。" });
  pcData[svIdx][COL.PC.MEMORY] = setRuneMode_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const label = { def: '減傷（護符結界）', dmg: '增傷（符文灼擊）', regen: '回血（治癒符文）' }[want];
  return JSON.stringify({
    success: true, mode: want,
    message: `「${pcData[svIdx][COL.PC.NAME]}」將原初符文運用為【${label}】。`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// ⚡ 切換從者主動技開關（存從者 MEMORY【主動技】on/off）：免費、即時、不耗 AP。
//   on＝每戰自動全效發動(耗魔)／off＝微量被動(免費)。只對「真有施放技術(burst/str_up/projection)」的從者有意義。
function actionSetActiveSkill(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  const buff = servantActiveSkill_(rowToCombatant_(pcData[svIdx]));
  if (!buff) return JSON.stringify({ success: false, message: "此從者無可主動施放的技術（其技能皆為被動）。" });
  const on = (userData.on === true || userData.on === 'true');
  pcData[svIdx][COL.PC.MEMORY] = setActiveSkillMode_(pcData[svIdx][COL.PC.MEMORY], on);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  return JSON.stringify({
    success: true, on: on,
    message: on
      ? `「${pcData[svIdx][COL.PC.NAME]}」的「${buff.name}」已【開啟】——此後每戰自動全力發動（每戰耗魔約 ${Math.round(200 * buff.mpPct)}）。`
      : `「${pcData[svIdx][COL.PC.NAME]}」的「${buff.name}」已【關閉】——回到微量被動（免費、每擊自動生效）。`
  }); // 樂觀更新·前端自走輕量 syncData
}

// 🗡️ 理想鄉·無敵結界主動開關（唯阿爾托莉雅持「全世界之鞘 Avalon」禮裝可用）：ON＝待命，
//   敵寶具來襲且御主純魔 ≥200 → 完全擋下該發＋扣 200＋自動關閉。免費開關·即時·不耗 AP。
function actionSetIdealRealm(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  const sc = rowToCombatant_(pcData[svIdx]); injectMysticBuff_(sc, pcData[pIdx][COL.PC.MEMORY]);
  if (!hasFx_(sc, 'avalon_saber')) return JSON.stringify({ success: false, message: "唯有『阿爾托莉雅』手持『全世界之鞘 Avalon』禮裝，方能展開理想鄉。" });
  const on = (userData.on === true || userData.on === 'true');
  pcData[svIdx][COL.PC.MEMORY] = setIdealRealm_(pcData[svIdx][COL.PC.MEMORY], on);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  return JSON.stringify({
    success: true, on: on,
    message: on
      ? `「${pcData[svIdx][COL.PC.NAME]}」展開【理想鄉】待命——下一發來襲的真名解放將被無敵結界完全隔絕（觸發時耗御主 200 魔·自動收起）。${mMp < 200 ? '⚠️當前御主魔力不足 200，結界雖張、觸發時恐無力支撐。' : `（御主現有魔力 ${mMp}）`}`
      : `「${pcData[svIdx][COL.PC.NAME]}」收起了理想鄉結界。`
  }); // 樂觀更新·前端自走輕量 syncData
}

// 🌟 設定多寶具英靈要解放哪個寶具（存從者 MEMORY【寶具選】N）：免費、即時、不耗 AP。
function actionSetNpChoice(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  const opts = servantNpOptions_(pcData[svIdx][COL.PC.NAME], pcData[svIdx][COL.PC.RANK]);
  if (!opts || !opts.length) return JSON.stringify({ success: false, message: "此從者只有單一寶具，無從選擇。" });
  const idx = Math.max(0, Math.min(opts.length - 1, parseInt(userData.idx) || 0));
  pcData[svIdx][COL.PC.MEMORY] = setNpChoice_(pcData[svIdx][COL.PC.MEMORY], idx);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  return JSON.stringify({
    success: true, idx: idx,
    message: `「${pcData[svIdx][COL.PC.NAME]}」此戰將解放【${opts[idx].n}】——${opts[idx].desc}`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// 🔵 補魔（魔力供給）：把御主魔力導入從者，回魔＋羈絆＋fade 演出。耗 1 AP（導入魔力需時）
function actionManaSupply(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可供魔。" });
  const svName = pcData[svIdx][COL.PC.NAME];
  // 🔋 共用魔力池制：補魔＝御主硬擠魔術迴路、回滿共用池——但【永久】燒蝕：血量上限−5~10、迴路−1~2(有地板)。
  //   過度補魔＝慢性自盡(迴路↓→池縮、回魔慢、禮裝弱)。另有「被動燃血」：池見底時 applyRegen_ 自動扣御主＋從者HP續契約。
  const CIRC_FLOOR = 8, HP_FLOOR = 40;
  const curMpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || masterPoolMax_(masterCircuits_(pcData[pIdx]), 0);
  const curMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (curMp >= curMpMax) return JSON.stringify({ success: false, message: `御主的魔力儲備已然充盈，毋須補魔（免付燒蝕之代價）。` });

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動力不足以行補魔之儀——請『休息』恢復後再來。" });
  }
  const oldCirc = masterCircuits_(pcData[pIdx]);
  if (oldCirc <= CIRC_FLOOR) {
    return JSON.stringify({ success: false, message: `你的魔術迴路已燒蝕至極限（${oldCirc} 條），再以補魔強擠恐徹底斷絕——改以靈脈／陣地／休息回魔吧。` });
  }
  // 永久代價：迴路−1~2、血量上限−5~10（各有地板）
  const circCut = Math.floor(Math.random() * 2) + 1;   // 1~2
  const hpCut = Math.floor(Math.random() * 6) + 5;     // 5~10
  const newCirc = Math.max(CIRC_FLOOR, oldCirc - circCut);
  const oldMaxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 100;
  const newMaxHp = Math.max(HP_FLOOR, oldMaxHp - hpCut);
  // 同隊從者魔力 → 重算池上限(新迴路 + 魔力×2)；回滿
  let partyMag = 0;
  pcData.forEach(function (r) { if (String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")) { try { partyMag += rankVal(JSON.parse(r[COL.PC.SIX] || '{}')['魔力'] || 'E'); } catch (e) { } } });
  const newMpMax = masterPoolMax_(newCirc, partyMag);
  const restored = newMpMax; // 回滿池
  // 寫回：迴路(MEMORY)、血上限、(夾)當前血、池上限、回滿魔
  pcData[pIdx][COL.PC.MEMORY] = /【迴路】\d+/.test(String(pcData[pIdx][COL.PC.MEMORY] || ""))
    ? String(pcData[pIdx][COL.PC.MEMORY]).replace(/【迴路】\d+/, '【迴路】' + newCirc)
    : (String(pcData[pIdx][COL.PC.MEMORY] || "") + '｜【迴路】' + newCirc);
  pcData[pIdx][COL.PC.MAX_HP] = newMaxHp;
  pcData[pIdx][COL.PC.HP] = Math.min(parseInt(pcData[pIdx][COL.PC.HP]) || 0, newMaxHp);
  pcData[pIdx][COL.PC.MAX_MP] = newMpMax;
  pcData[pIdx][COL.PC.MP] = restored;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 3);
  const mpMax = newMpMax; // 給下方敘述沿用

  let manaAp = AP_PER_DAY, manaClock = "";
  if (isFateMana) { try { manaAp = spendAp_(myGameId, 1).ap; manaClock = clockLabel_(myGameId); } catch (e) { } }

  // ⚔️ 卸防突襲：補魔時門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.4);

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  let aiPrompt;
  if (ambush) {
    aiPrompt = `【系統·補魔遭突襲·已裁定】御主正以魔力供給「${svName}」、彼此門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、${ambush.destroyed ? '從者消滅的痛楚（語氣留白）' : '從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·補魔已結算】御主硬擠魔術迴路為「${svName}」回滿共用魔力池（${restored}/${mpMax}），代價沉重——魔術迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}。羈絆微升。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】描寫這場「燃迴路續契約」的私密而沉重的一刻——御主強行催動將要燒斷的魔術迴路、魔力沿靈魂聯繫流向從者、體溫與屏息、從者察覺御主迴路受損／面色透支時的反應【一概依其性格與當前羈絆自然演出·不預設溫情(高羈絆或有不忍、冷傲疏離者則淡然受之)】，最後 fade-to-black 留白。\n` +
      `★【鐵律】止於唯美曖昧、點到為止；【不可】出現性器官、性交或露骨情慾描寫（那是奪杯後鑑賞的事）。演出而非複述設定。`;
  }
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🩸 燃血補魔已改為【被動機制】(2026-06)：不再是主動 action。
//   共用魔力池見底、時消耗補不上時，於 applyRegen_(Time_World) 自動「燃命續契約」——
//   缺口÷2，同時扣御主HP＋從者HP(各保底1)。詳見 applyRegen_。舊主動 actionBloodSupply 已移除。

// ── 💕 羈絆日限：記於御主 MEMORY 的【羈絆日】D:type1,type2（跨日自動重置）──
