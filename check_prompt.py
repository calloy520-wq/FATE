# -*- coding: utf-8 -*-
"""🔍 鑑賞提示詞不變式掃描（check.sh 會跑）
本 session 所有 bug 都是這三種的變體，寫成機器檢查免得再靠人眼：
  ① 代名詞「她」必須有指涉對象（自身插值、或插值的變數本身帶名字）
  ② 不可出現寫死的台詞（AI 會照抄——反例列舉/概念標籤/輸入判準除外）
用法：python3 check_prompt.py   ← 有問題回傳非 0
"""
import re, sys

s = open('gas/Gallery.gs', encoding='utf-8').read()
lines = s.split('\n')

# 某變數的定義/push 模板裡有沒有帶人名
NAME_SRC = r'COL\.PC\.NAME|_herN|_her\b|Name\b|name\b|partyMembers'
def var_has_name(v):
    # ① 樣板字面賦值／push：`...${r[COL.PC.NAME]}...`
    for m in re.finditer(r'\b' + re.escape(v) + r'\s*(?:\.push\(|=)\s*`([^`]{0,300})', s):
        if re.search(NAME_SRC, m.group(1)): return True
    # ② 由既有名單推導出來的變數：const _x = String(yNames).split('、').filter(...).join('、')
    #    這種寫法沒有 backtick，①一律漏判(2026-07 實際誤報：晨間餘韻/昨夜道別依在場過濾後的名單)。
    #    仍然要求 RHS 出現名單來源字樣才算數——放寬到「任何賦值都算」會讓這道檢查形同虛設。
    for m in re.finditer(r'\b' + re.escape(v) + r'\s*=\s*([^;]{0,300});', s):
        if re.search(NAME_SRC, m.group(1)): return True
    return False

blocks = []
for i, l in enumerate(lines, 1):
    t = l.strip()
    if t.startswith('//') or '★' not in l: continue
    # ⚠ 2026-07 兩次踩到同一個坑：標題上限原本 20 → 放寬到 40 → 同一天又有個標題超過 40（合併多件
    #   道具的 ★ 行）再次被**靜靜跳過**。根源是「上限」這件事本身沒有存在的理由：`[^】]` 本來就跨不過
    #   收尾的 】，不會失控吃掉整份檔案。改成 120（純防呆），別再靠猜一個數字。
    #   ⚠ 加了新 ★ 區塊後，順手確認下面印出的區塊數有跟著增加——數字沒動就代表它沒被看見。
    for m in re.finditer(r'★【[^】]{2,120}】[^`]{0,420}', l):
        blocks.append((i, m.group(0)))

PRON  = re.compile(r'(?<![你妳我他])[她](?!們)')
DIRECT = re.compile(r'\$\{[^}]*(name|Name|NAME|_her|Her|partyMembers|kanshouHeldName_)[^}]*\}')
INTERP = re.compile(r'\$\{\s*([A-Za-z_][\w]*)')
QUOTE = re.compile(r'「([^」]{4,})」')
EXEMPT_BLOCK = ('在場人物', '各人', '所有人', '在場只有', '玩家命格')
# 概念標籤(演出「X」的…)、反例(禁/不可/別/勿/非)、輸入判準(如「…」) 都不是要 AI 講的台詞
# 概念標籤：演出「X」的欣喜／讓「X」這件事／問起「X」——引號在包一個【概念名】而非台詞
CONCEPT = re.compile(r'(演出|這份|那份|讓|把|問起|所謂|叫做|重複同一個)$')
# 反例/判準：同一句話裡先出現過 禁/不可/別/勿/非/如 → 這個引號是「不要這樣」或「玩家打這種字」
NEG     = re.compile(r'[禁勿別非]|不可|不得|不會|如「')

# ✅ 設計如此(靜音)：這些引號/代名詞不是「要 AI 講的話」，而是【辨識玩家輸入】或泛指任一同伴。
ALLOW = {
    '天花板也管命令/強迫/暴力': '輸入判準——辨識玩家打的字，不是要 AI 講的台詞；「她」泛指任一同伴',
    '世界概況·這些人你確實認識': '玩家提問類型；「她」泛指名單上任一人',
}
# ⚠ 已知待處理(警告但不擋)：真的是寫死台詞，但位於 NSFW 區(紅線鄰接)，需玩家明確授權才動。
# 2026-07 催眠三階已重寫，示範台詞全數移除，兩條 PENDING 清空。
PENDING = {
}
def _cls(b):
    for k, v in ALLOW.items():
        if k in b: return ('allow', v)
    for k, v in PENDING.items():
        if k in b: return ('pending', v)
    return ('bad', '')

pron, quote, pend = [], [], []
for ln, b in blocks:
    if any(k in b for k in EXEMPT_BLOCK): continue
    if PRON.search(b) and not DIRECT.search(b):
        named = any(var_has_name(v) for v in INTERP.findall(b))
        if not named:
            c, why = _cls(b)
            if c == 'bad': pron.append((ln, b[:110]))
            elif c == 'pending': pend.append((ln, '代名詞', why))
    for m in QUOTE.finditer(b):
        q, pre = m.group(1), b[:m.start()]
        if '${' in q: continue
        sent = re.split(r'[。；]', pre)[-1]          # 只看同一句
        if CONCEPT.search(pre) or NEG.search(sent): continue
        c, why = _cls(b)
        if c == 'bad': quote.append((ln, q, b[:70]))
        elif c == 'pending': pend.append((ln, f'台詞「{q}」', why))

print(f"🔍 提示詞不變式掃描：{len(blocks)} 個 ★ 區塊")
bad = 0
if pron:
    bad += len(pron); print(f"  ❌ 代名詞無指涉：{len(pron)} 處")
    for ln, b in pron: print(f"     L{ln}: {b}")
else:
    print("  ✅ 代名詞全部有指涉對象")
if quote:
    bad += len(quote); print(f"  ❌ 疑似寫死台詞：{len(quote)} 處")
    for ln, q, b in quote: print(f"     L{ln}: 「{q}」 ← {b}")
else:
    print("  ✅ 無寫死台詞")
if pend:
    print(f"  ⚠️ 已知待處理（不擋 CI）：{len(pend)} 處")
    for ln, what, why in pend: print(f"     L{ln}: {what} — {why}")
sys.exit(1 if bad else 0)
