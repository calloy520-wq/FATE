# -*- coding: utf-8 -*-
"""🔍 鑑賞提示詞不變式掃描（check.sh 會跑）
本 session 所有 bug 都是這三種的變體，寫成機器檢查免得再靠人眼：
  ① 代名詞「她」必須有指涉對象（自身插值、或插值的變數本身帶名字）
  ② 不可出現寫死的台詞（AI 會照抄——反例列舉/概念標籤/輸入判準除外）
  ③ 提示詞一律【正面指示】：玩家 2026-09「LLM 會有重點還有語意問題，他有時候只會記憶重點、
     忘記前面的禁——所以我們專注在要他做什麼，盡可能不要做禁止什麼」。兩件事一起擋：
     (a) 硬禁令標記（【禁…】【嚴禁】【不可】絕不可）在提示詞裡一律 0，真的只能用否定寫的
         登記進 HARD_BAN_ALLOW 並寫明理由；
     (b) 否定句後面不可以再附上被禁的寫法當例句——那等於把那個寫法示範給模型看
         （玩家原話「說越多它會越想歪」）。
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
    '強迫也照上面那張表判': '輸入判準——辨識玩家打的字，不是要 AI 講的台詞；「她」泛指任一同伴（⚠ key 是標題文字，改標題就要同步改這裡，2026-07 已踩過一次）',
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


# ③ 正面指示不變式（見檔頭）。掃全 .gs，只看提示詞字串行。
import os as _os
_LITERAL = re.compile(r"`([^`]*)`|'([^'\\n]*)'|\"([^\"\\n]*)\"")
HARD_BAN = re.compile(r'【禁[^】]*】|【嚴禁】|【不可】|絕不可|嚴禁')
# 軟性否定：同一條原則，只是沒有【】包起來。要排掉三種假陽性——
#   ①「要不要」是疑問不是禁令 ②「情不自禁」等成語 ③行尾的 // 註解（註解本來就會講禁了什麼）
SOFT_BAN = re.compile(r'(?<!要)(不可|不要|不得|禁止|勿(?!論)|絕不|別讓|別再|別把|別只|別當|別靠|別急|別跳|別改|別拿)')
SOFT_SKIP = ('情不自禁', '不禁')
# 真的只能用否定寫的登記在這裡，鍵＝「檔名:出現的字樣」，值＝理由。目前一條都不需要。
HARD_BAN_ALLOW = {}
# 這兩類字串不是提示詞：①種子庫是角色資料 ②`message:` 是給玩家看的錯誤訊息，本來就該說「不行」。
PROMPT_SKIP_FILES = {'Seed_Codex.gs'}
PLAYER_MSG = re.compile(r'\bmessage\s*:')
# 否定句 ＋ 同一子句裡的引號內容／(例…)：那個內容就是示範。
NEG_EXAMPLE = re.compile(r'(?:不可|不要|不得|別|勿|禁)[^\n。；]{0,40}?(?:「([^」\n]{2,24})」|[（(](?:例|如)[:：]?([^）)\n]{2,30})[）)])')


def _prompt_lines(path):
    """回傳 [(行號, 提示詞文字, 原始整行)]。
    ⚠ 幾乎所有提示詞本體都住在【跨數十行的樣板字串】裡（nsfwBaseRules 整包就是），
    只做單行引號比對會整批看不到——這個坑 check_pronoun 踩過一次，這裡不再踩第二次。
    作法：先掃一遍反引號的奇偶，標出哪些行在樣板字串【裡面】；裡面的整行都算提示詞文字，
    外面的才退回單行引號抽取。行尾 // 註解一律先切掉。"""
    src = open(path, encoding='utf-8').read()
    inside, out, depth = False, [], 0
    for ln, line in enumerate(src.split('\n'), 1):
        st = line.strip()
        started_inside = inside
        # 先算這一行結束後還在不在樣板字串裡。
        # ⚠ 只數【不在單/雙引號裡】的反引號——引號裡的反引號是資料不是語法，
        #    數進去奇偶就會歪掉，之後整段程式碼會被誤判成提示詞（第一版就是這樣誤報 4 處）。
        i, q = 0, ''
        while i < len(line):
            c = line[i]
            if c == '\\':
                i += 2
                continue
            if q:
                if c == q:
                    q = ''
            elif c in ('"', "'"):
                if not inside:
                    q = c
            elif c == '`':
                inside = not inside
            i += 1
        if st.startswith('//') or st.startswith('*'):
            continue
        if started_inside or '`' in line:
            text = line.split('//')[0] if (not started_inside and '//' in line) else line
        else:
            text = line.split('//')[0] if '//' in line else line
            text = re.sub(r"\b(?:name|hint)\s*:\s*'[^']*'", '', text)
            text = '｜'.join(''.join(t) for t in _LITERAL.findall(text))
        out.append((ln, text, line))
    return out


def scan_positive():
    hits = []
    for f in sorted(_os.listdir('gas')):
        if not f.endswith('.gs') or f in PROMPT_SKIP_FILES:
            continue
        for ln, code, raw in _prompt_lines(_os.path.join('gas', f)):
            if PLAYER_MSG.search(raw):
                continue
            if len(re.findall(r'[\u4e00-\u9fff]', code)) < 8:
                continue
            for m in SOFT_BAN.finditer(code):
                around = code[max(0, m.start() - 4):m.start() + 4]
                if any(k in around for k in SOFT_SKIP):
                    continue
                if HARD_BAN_ALLOW.get(f + ':' + m.group(0)):
                    continue
                hits.append((f, ln, '否定式寫法「%s」——改成「要做什麼」的正面指示' % m.group(0)))
            for m in HARD_BAN.finditer(code):
                w = m.group(0)
                if HARD_BAN_ALLOW.get(f + ':' + w):
                    continue
                hits.append((f, ln, '硬禁令「%s」——改成「要做什麼」的正面指示' % w))
            for m in NEG_EXAMPLE.finditer(code):
                ex = m.group(1) or m.group(2)
                if '${' in ex:      # 插值不是例句，是這一局真的要代進去的值
                    continue
                # 結構佔位（「(外貌)、(氣質)」）示範的是【斷句形狀】不是內容，不會固化畫面
                if not re.sub(r'[（(][^）)]*[）)]|[、，,／/·\s]', '', ex):
                    continue
                hits.append((f, ln, '否定句後面附了例句「%s」——那是把被禁的寫法示範給模型看' % ex))
    return hits


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

_pos = scan_positive()
# 🧪 自我退化測試：注入一行硬禁令＋一行「否定＋例句」，這兩條都必須被抓到。
_probe_src = '  sys += `★【禁】寫成習慣動作(「背脊永遠打得筆直」)。`;'
_probe = [x for x in [
    ('inj', 1, '硬') if HARD_BAN.search(_probe_src) else None,
    ('inj', 1, '例') if NEG_EXAMPLE.search(_probe_src) else None,
] if x]
if len(_probe) < 2:
    print('  ❌ 正面指示掃描自身失效（注入的硬禁令／例句抓不到）")'.replace('")', ''))
    sys.exit(1)
if _pos:
    bad += len(_pos); print(f"  ❌ 提示詞裡還有否定式寫法：{len(_pos)} 處")
    for f, ln, why in _pos: print(f"     {f}:{ln} {why}")
else:
    print(f"  ✅ 提示詞全是正面指示（硬禁令與否定式寫法 0、否定句零例句・含自我退化測試）")
sys.exit(1 if bad else 0)
