// ==========================================
// 九州江湖 - 飛書(信件)系統 Mail_Action.gs
// 由 Router_Action.gs 拆分而來，函式與呼叫關係不變(GAS 全域共用)。
// 對應 action：send_mail / get_mails / claim_mail_item / delete_mail
// ==========================================

function actionSendMail(userData, pcId, sheets) {
  const { targetName, msg, attachItemId } = userData;
  const pcData = sheets.pc.getDataRange().getValues();

  // 1. 找收件人（NPC 與玩家都能收）
  const targetRow = pcData.find(r => String(r[COL.PC.NAME]).trim() === String(targetName).trim());
  if (!targetRow) return JSON.stringify({ success: false, message: "查無此人，無法傳音。" });

  const targetId = targetRow[COL.PC.ID];
  const isNPC = !String(targetId).startsWith("PC_");

  const senderRow = pcData.find(r => r[COL.PC.ID] == pcId);
  const senderName = senderRow ? senderRow[COL.PC.NAME] : "神祕人";
  const msgId = "MAIL_" + Date.now() + Math.floor(Math.random() * 1000);

  let finalAttachId = "", finalAttachName = "";

  // 2. 處理玩家寄出的附件
  if (attachItemId && sheets.item) {
    const itemData = sheets.item.getDataRange().getValues();
    const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === attachItemId && String(r[COL.ITEM.OWNER]) === String(pcId));
    if (iIdx !== -1) {
      finalAttachId = itemData[iIdx][COL.ITEM.ID];
      finalAttachName = itemData[iIdx][COL.ITEM.NAME];
      if (isNPC) {
        // 寄給 NPC：物品先過戶到 NPC 名下（代表收到了，之後才能判定退不退）
        sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(targetId);
      } else {
        // 寄給玩家：寄存虛空，等對方手動領取
        sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(msgId);
      }
    }
  }

  // 3. 寄給真人玩家：寫一筆信到對方信箱就結束
  if (!isNPC) {
    if (sheets.mail) {
      sheets.mail.appendRow([msgId, senderName, targetId, msg, finalAttachId, finalAttachName, "未讀", new Date()]);
    }
    sheets.log.appendRow([new Date(), targetId, `【飛書】收到來自『${senderName}』的傳音玉簡。`, targetRow[COL.PC.LOC]]);
    return JSON.stringify({ success: true, isNPC: false });
  }

  // ===== 4. 寄給 NPC：當場產一封回信，純 GAS，不驚動主遊戲 =====
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  let relRow = relData.find(r => r[COL.REL.PC] === senderName && r[COL.REL.NPC] === targetName);
  if (!relRow) relRow = [senderName, targetName, 0, "萍水相逢", "", "", "無"];

  let replyContent = "";
  try {
    // 借用 Scheduler.gs 既有的個性化短訊產生器（花一次 AI，回一句符合個性的話）
    replyContent = generateNpcMessage(targetRow, senderRow, relRow);
  } catch (e) {
    Logger.log("NPC 回信生成失敗：" + e.message);
  }
  if (!replyContent) replyContent = `『${targetName}』收下了你的傳音，未多言語。`;

  // 5. 先決定回信 id（退禮要掛在這封回信下，才能被 actionClaimMailItem 領取）
  const replyId = "MAIL_NPC_" + Date.now() + Math.floor(Math.random() * 1000);

  // 6. 退禮判定：玩家有送附件 + 好感 <30 → NPC 原封退還
  let returnAttachId = "", returnAttachName = "";
  if (finalAttachId && sheets.item) {
    const fav = parseInt(relRow[COL.REL.FAV]) || 0;
    if (fav < 30) {
      const itemData2 = sheets.item.getDataRange().getValues();
      // 此時附件 owner 已是 NPC，找出來掛回這封回信
      const ri = itemData2.findIndex(r => r[COL.ITEM.ID] === finalAttachId && String(r[COL.ITEM.OWNER]) === String(targetId));
      if (ri !== -1) {
        returnAttachId = finalAttachId;
        returnAttachName = finalAttachName;
        sheets.item.getRange(ri + 1, COL.ITEM.OWNER + 1).setValue(replyId);
        replyContent += `（將「${finalAttachName}」原封退還）`;
      }
    }
  }

  // 7. NPC 回信寫進「玩家」信箱
  if (sheets.mail) {
    sheets.mail.appendRow([replyId, targetName, pcId, replyContent, returnAttachId, returnAttachName, "未讀", new Date()]);
  }

  // 8. 記一筆因果 log（可留可拿）
  sheets.log.appendRow([new Date(), pcId, `【飛書】向『${targetName}』傳音，已收到回音。`, targetRow[COL.PC.LOC]]);

  return JSON.stringify({ success: true, isNPC: true, replied: true });
}

function actionGetMails(userData, pcId, sheets) {
  if (!sheets.mail) return JSON.stringify({ success: true, data: [] });

  const mailData = sheets.mail.getDataRange().getValues();
  const msgs = [];

  // 倒著讀取，最新的在前面
  for (let i = mailData.length - 1; i >= 1; i--) {
    const row = mailData[i];
    if (String(row[COL.MAIL.RECEIVER]) === String(pcId)) {
      msgs.push({
        id: row[COL.MAIL.ID],
        sender: row[COL.MAIL.SENDER],
        content: row[COL.MAIL.CONTENT],
        attachItemId: row[COL.MAIL.ITEM_ID] || "",
        attachItemName: row[COL.MAIL.ITEM_NAME] || "",
        status: row[COL.MAIL.STATUS] || "未讀",
        time: row[COL.MAIL.TIME]
      });
    }
  }

  // 當玩家讀取信件列表時，自動將「未讀」改為「已讀」
  let isChanged = false;
  for (let i = 1; i < mailData.length; i++) {
    if (String(mailData[i][COL.MAIL.RECEIVER]) === String(pcId) && mailData[i][COL.MAIL.STATUS] === "未讀") {
      mailData[i][COL.MAIL.STATUS] = "已讀";
      isChanged = true;
    }
  }
  if (isChanged) safeWriteSheet(sheets.mail, mailData);

  return JSON.stringify({ success: true, data: msgs });
}

function actionClaimMailItem(userData, pcId, sheets) {
  const { mailId } = userData;
  const mailData = sheets.mail.getDataRange().getValues();
  const mIdx = mailData.findIndex(r => r[COL.MAIL.ID] === mailId && String(r[COL.MAIL.RECEIVER]) === String(pcId));

  if (mIdx === -1) return JSON.stringify({ success: false, message: "找不到此飛書。" });

  const attachId = mailData[mIdx][COL.MAIL.ITEM_ID];
  if (!attachId) return JSON.stringify({ success: false, message: "此信並無附件。" });
  if (mailData[mIdx][COL.MAIL.STATUS] === "已領取") return JSON.stringify({ success: false, message: "附件已領取過了。" });

  const itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === attachId && String(r[COL.ITEM.OWNER]) === String(mailId));

  if (iIdx === -1) return JSON.stringify({ success: false, message: "物品已遺失在虛空之中。" });

  // 檢查包包有沒有滿
  const currentBagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
  if (currentBagCount >= MAX_BAG_SIZE) return JSON.stringify({ success: false, message: "行囊已滿，無法領取！" });

  // 將物品所有權轉交給玩家
  sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(pcId);

  // 更新信件狀態為已領取
  sheets.mail.getRange(mIdx + 1, COL.MAIL.STATUS + 1).setValue("已領取");

  return JSON.stringify({ success: true, message: `成功領取「${mailData[mIdx][COL.MAIL.ITEM_NAME]}」！` });
}

function actionDeleteMail(userData, pcId, sheets) {
  const { mailId } = userData;
  const mailData = sheets.mail.getDataRange().getValues();
  const mIdx = mailData.findIndex(r => r[COL.MAIL.ID] === mailId && String(r[COL.MAIL.RECEIVER]) === String(pcId));

  if (mIdx !== -1) {
    // 如果信件有附件且未領取，刪除信件等同於把物品摧毀 (或者妳也可以設定為不能刪除)
    const attachId = mailData[mIdx][COL.MAIL.ITEM_ID];
    if (attachId && mailData[mIdx][COL.MAIL.STATUS] !== "已領取" && sheets.item) {
      const itemData = sheets.item.getDataRange().getValues();
      const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === attachId && String(r[COL.ITEM.OWNER]) === String(mailId));
      if (iIdx !== -1) sheets.item.deleteRow(iIdx + 1);
    }

    // 刪除信件
    sheets.mail.deleteRow(mIdx + 1);
    return JSON.stringify({ success: true });
  }
  return JSON.stringify({ success: false, message: "信件不存在或已被刪除。" });
}
