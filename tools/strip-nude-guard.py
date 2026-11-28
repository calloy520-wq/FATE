# 部署用：把工作分支的檔案轉成「不含全裸把關」的版本（使用者尚未同意全裸把關上線）
# 用法：在以 origin/main 為底、已 checkout 工作分支全部檔案的暫存分支根目錄執行 python3 tools/strip-nude-guard.py .
# 跑完必須確認 Code.js／tests 中 NO_NUDE_CHAR_IDS_、sanitizeNudeOutfitForChar_ 出現 0 次，再跑全部測試

import re, sys
root = sys.argv[1]
def rw(p, f):
    s = open(p, encoding='utf-8').read(); t = f(s)
    open(p, 'w', encoding='utf-8').write(t)
def code(s):
    a = s.index('// 未成年／孩童外觀的角色：任何情況都不畫裸露')
    b = s.index('function stripClothesFromCore_(')
    s = s[:a] + s[b:]
    old = "? (NO_NUDE_CHAR_IDS_.has(cid) ? (currentOutfits[cid] || charDb[cid].defaultOutfit) : 'nude, completely nude, no clothes')"
    assert old in s; s = s.replace(old, "? 'nude, completely nude, no clothes'")
    m = re.search(r"    profile\.outfit = sanitizeNudeOutfitForChar_\([^\n]*\n", s); assert m
    s = s[:m.start()] + "    if (wantsNude && !isNudeOutfitTags_(profile.outfit)) profile.outfit = 'nude, completely nude, no clothes';\n" + s[m.end():]
    a = s.index('      // 導演回報的裸露先經過把關')
    b = s.index('      const directedNude = ', a)
    s = s[:a] + s[b:]
    return s
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
rw(root + '/Code.js', code); rw(root + '/tests/run-tests.js', tests); rw(root + '/CLAUDE.md', doc)
print('stripped')
