// ==========================================
// 📜 Seed_Canon.gs — 正典劇情「插針」系統【已退役】（2026-06 玩家定案：沒啥用處·移除）
//   原本：移動/休息推進時間後，依【戰爭】×【路線】×日×時段×地點自動把 Fate 原作橋段(canonBeats)＋
//   引導(canonLeads)餵給 AI 演出，並依羈絆/殺戮自然鎖定 fate/ubw/hf 路線(【路線】)、記已觸發針腳(【史】)。
//   ▸ 已移除：actionMove/actionRest 不再呼叫；前端不再顯示 canonBeats/canonLeads；整套針腳資料與
//     route/shadow/blacken/spawnGilgamesh 等世界事件一併退役。
//   ▸ 保留：`checkCanonPins_` 留一個 no-op 空殼，防任何漏網呼叫崩潰（永遠回空）。
//   ▸ 未動：正史/混亂【戰爭】模式與「扮演正典御主」(敵方陣營生成)仍在(getWarName_/扮演 在 Router_Action)。
//   ▸ MEMORY 舊標記【路線】【史】成為無用遺留資料，無害、不再讀寫。
// ==========================================

// no-op 空殼：正典插針已退役，永遠回空陣列（保留簽名以防漏網呼叫）
function checkCanonPins_(sheets, pcId) { return { beats: [], leads: [], route: "" }; }
