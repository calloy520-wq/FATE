// ==========================================
// 🎨 生圖測試（驗證 A · AI 生圖差分 這條路）
//   OpenRouter Nano Banana（Gemini Flash Image）→ 存 Drive ＋ 塞進試算表 ＋ 回前端內嵌顯示。
//   跟文字用同一把 OPENROUTER_API_KEY / 同一個端點（MODEL_URL），只是帶 modalities:["image","text"]。
// ==========================================

// 便宜快（~4秒）的 Lite 版當預設；要更高品質換 'google/gemini-3.1-flash-image'。
const IMG_MODEL_LITE_ = 'google/gemini-3.1-flash-lite-image';
const IMG_MODEL_FULL_ = 'google/gemini-3.1-flash-image';

// 呼叫 OpenRouter 生圖，回 { ok, dataUri } 或 { ok:false, err, raw }。
function callImageAPI_(prompt, model) {
  if (!OPENROUTER_API_KEY) return { ok: false, err: "未設定 OPENROUTER_API_KEY 指令碼屬性" };
  model = model || IMG_MODEL_LITE_;
  const payload = {
    model: model,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"]
  };
  const options = {
    method: "post", contentType: "application/json",
    headers: { "Authorization": "Bearer " + OPENROUTER_API_KEY },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };
  try {
    const res = UrlFetchApp.fetch(MODEL_URL, options);
    const body = res.getContentText();
    const data = JSON.parse(body);
    if (data.error) return { ok: false, err: (data.error.message || "API 錯誤"), raw: body.slice(0, 600) };
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) return { ok: false, err: "回應無 message 結構", raw: body.slice(0, 600) };
    // 生成圖優先在 message.images[]；保險再掃 content 找 data:image。
    let dataUri = "";
    if (Array.isArray(msg.images) && msg.images.length) {
      const im = msg.images[0];
      dataUri = (im && im.image_url && im.image_url.url) || (im && im.url) || (typeof im === "string" ? im : "");
    }
    if (!dataUri && typeof msg.content === "string") {
      const m = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (m) dataUri = m[0];
    }
    if (!dataUri) return { ok: false, err: "回應裡找不到圖片（模型可能不支援生圖或被擋）", raw: body.slice(0, 800) };
    return { ok: true, dataUri: dataUri };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
}

// 前端呼叫入口：生圖 → 存 Drive 資料夾 ＋ 插進試算表 ＋ 回內嵌 dataUri 讓網頁當場顯示。
function imageTestGenerate(prompt, useFullModel) {
  prompt = String(prompt || "").trim();
  if (!prompt) return { ok: false, err: "請先輸入描述（prompt）" };
  const model = useFullModel ? IMG_MODEL_FULL_ : IMG_MODEL_LITE_;

  const r = callImageAPI_(prompt, model);
  if (!r.ok) return { ok: false, err: r.err, raw: r.raw || "", model: model };

  const out = { ok: true, dataUri: r.dataUri, model: model };
  // 解析 base64
  let mime = "image/png", b64 = r.dataUri;
  const mm = r.dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (mm) { mime = mm[1]; b64 = mm[2]; }

  // 存 Drive ＋ 塞試算表（任何一步失敗都不擋「當場看到圖」，只回報 storeErr）
  try {
    const bytes = Utilities.base64Decode(b64);
    const ext = mime.indexOf("png") >= 0 ? "png" : (mime.indexOf("webp") >= 0 ? "webp" : "jpg");
    const stamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyyMMdd_HHmmss");
    const blob = Utilities.newBlob(bytes, mime, "圖_" + stamp + "." + ext);

    const folder = imgGetOrCreateFolder_("命運圖庫測試");
    const file = folder.createFile(blob);
    out.driveUrl = file.getUrl();

    const ss = imgGetOrCreateSheet_("命運圖庫測試", folder);
    const sh = ss.getSheets()[0];
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1).setValue(stamp);
    sh.getRange(row, 2).setValue(prompt);
    sh.setRowHeight(row, 200);
    sh.insertImage(blob, 3, row); // 直接用 blob 插圖·不需公開 URL（避開 Drive 熱連結雷）
    out.sheetUrl = ss.getUrl();
  } catch (e) {
    out.storeErr = String((e && e.message) || e);
  }
  return out;
}

function imgGetOrCreateFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function imgGetOrCreateSheet_(name, folder) {
  const files = DriveApp.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(name);
  const sh = ss.getSheets()[0];
  sh.getRange(1, 1, 1, 3).setValues([["時間", "描述(prompt)", "圖"]]).setFontWeight("bold");
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 240);
  try { // 移進資料夾（失敗無妨）
    if (folder) { const sf = DriveApp.getFileById(ss.getId()); folder.addFile(sf); DriveApp.getRootFolder().removeFile(sf); }
  } catch (e) { }
  return ss;
}
