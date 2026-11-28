# 部署用：把工作分支的檔案轉成「不含全裸把關」的版本（使用者尚未同意全裸把關上線）
# 用法：在以 origin/main 為底、已 checkout 工作分支全部檔案的暫存分支根目錄執行 python3 tools/strip-nude-guard.py .
# 跑完必須確認 Code.js／Image.js／Characters.js／tests 中 NO_NUDE_CHAR_IDS_、sanitizeNudeOutfitForChar_ 出現 0 次，再跑全部測試

import re, sys
root = sys.argv[1]
def rw(p, f):
    s = open(p, encoding='utf-8').read(); t = f(s)
    open(p, 'w', encoding='utf-8').write(t)
GAME_FILES = ['Code.js', 'Image.js', 'Characters.js']
def code_all(root):
    # 把關的程式碼分散在幾個遊戲檔裡（2026-11 拆檔後繪圖在 Image.js）：每一處都到含有比對字串的那個檔案去改
    texts = {f: open(root + '/' + f, encoding='utf-8').read() for f in GAME_FILES}
    def find(anchor):
        hits = [f for f in GAME_FILES if anchor in texts[f]]
        assert len(hits) == 1, (anchor, hits)
        return hits[0]
    f = find('// 未成年／孩童外觀的角色：任何情況都不畫裸露'); t = texts[f]
    a = t.index('// 未成年／孩童外觀的角色：任何情況都不畫裸露'); b = t.index('function stripClothesFromCore_(')
    texts[f] = t[:a] + t[b:]
    old = "? (NO_NUDE_CHAR_IDS_.has(cid) ? (currentOutfits[cid] || charDb[cid].defaultOutfit) : 'nude, completely nude, no clothes')"
    f = find(old); texts[f] = texts[f].replace(old, "? 'nude, completely nude, no clothes'")
    f = find('    profile.outfit = sanitizeNudeOutfitForChar_('); t = texts[f]
    m = re.search(r"    profile\.outfit = sanitizeNudeOutfitForChar_\([^\n]*\n", t); assert m
    texts[f] = t[:m.start()] + "    if (wantsNude && !isNudeOutfitTags_(profile.outfit)) profile.outfit = 'nude, completely nude, no clothes';\n" + t[m.end():]
    f = find('      // 導演回報的裸露先經過把關'); t = texts[f]
    a = t.index('      // 導演回報的裸露先經過把關'); b = t.index('      // 成人模式關閉：導演回報的裸露', a)
    texts[f] = t[:a] + t[b:]
    for f in GAME_FILES:
        open(root + '/' + f, 'w', encoding='utf-8').write(texts[f])
def tests(s):
    s = s.replace('sanitizeNudeOutfitForChar_, ', '')
    a = s.index("eq('裸露把關：成人模式成人角色")
    b = s.index("const pst = ", a)
    s = s[:a] + s[b:]
    a = s.index("let np = T.buildNaiPayloadFromScene_(pst(true), [{ id: 'scathach' }, { id: 'rin' }]")
    b = s.index("{\n  const crowd = ", a)
    s = s[:a] + s[b:]
    s = re.sub(r"eq\('繪圖：只有凜時沒有 nsfw'[^\n]*\n", '', s)
    return s
def doc(s):
    return re.sub(r"- 裸露把關（`sanitizeNudeOutfitForChar_`）[^\n]*\n", '', s)
code_all(root); rw(root + '/tests/run-tests.js', tests); rw(root + '/CLAUDE.md', doc)
print('stripped')
