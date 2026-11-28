// 全裸把關（使用者尚未同意上線）：這個檔案刻意不放進 .claspignore 白名單，所以永遠不會被推上 GAS、正式遊戲不會套用。
// 遊戲檔裡只有「typeof … === 'function' 才用」的判斷：沒有這個檔案時行為和正式站完全一樣。
// 要讓它上線，必須把「!NudeGuard.js」加進 .claspignore —— 沒有使用者明確同意，絕對不可以加。
// 測試：node tests/nude-guard.js

// 未成年／孩童外觀的角色：任何情況都不畫裸露（洗澡等劇情照常寫，畫面維持穿著）
const NO_NUDE_CHAR_IDS_ = new Set(['prisma_illya', 'chloe', 'miyu', 'illya', 'rin', 'sakura', 'dark_sakura', 'shirou']);

function isNudeBlockedChar_(charId) {
  return NO_NUDE_CHAR_IDS_.has(charId);
}

// 畫面上的裸露把關：上面的角色一律改回 fallback（預設服裝）（成人模式關閉另由 adultOffOutfit_ 處理）
function sanitizeNudeOutfitForChar_(charId, outfit, adultMode, fallback) {
  if (!isNudeOutfitTags_(outfit)) return outfit;
  if (NO_NUDE_CHAR_IDS_.has(charId)) return String(fallback || '').trim() || 'casual clothes, shirt, pants';
  return outfit;
}
