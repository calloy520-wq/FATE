#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔎 未宣告識別字掃描（第九支）

為什麼需要它：check.sh 只做語法檢查，而「叫一個不存在的函式／變數」在語法上完全合法——
要跑到那一行才會 ReferenceError。更糟的是這專案很多落地區段包在 try/catch 裡，
錯誤會被【整個吞掉】變成「操作靜默失敗」：綠燈、部署成功、零錯誤訊息。

真實案例（2026-09）：情境橋段那批表被移除後，拍照落地那段仍在叫 kanshouLocActivity_ 與
kanshouReFest_。整段包在 try/catch 中 → 拍照永遠失敗、相簿永遠存不進去，而且什麼都不會說。
check.sh 八支全過、49 支探針也沒叫（探針只驗了提示詞，沒驗落地）。

做法：收集全專案宣告過的名字，再掃「符合本專案命名慣例」的識別字（kanshouXxx_／_xxx_／CONST_），
對不上的就報。刻意只掃自家命名慣例，不掃全部識別字——寧可漏抓，不可誤報。
"""
import io, re, sys, glob


def blank_literals(t):
    """把字串／樣板／正規表達式【字面】裡的文字挖空，但保留樣板的 ${...} 內容（那裡面是真的識別字）。
    不做這件事就會誤報：/^DEAD_/ 的 DEAD_、`__PRESENCE__` 的 PRESENCE__ 都不是識別字。"""
    out = []
    i, n = 0, len(t)
    while i < n:
        c = t[i]
        if c in '"\'':
            q = c; i += 1
            while i < n and t[i] != q:
                i += 2 if t[i] == '\\' else 1
            i += 1; out.append('""')
        elif c == '`':
            i += 1; out.append('`')
            depth = 0
            while i < n:
                if t[i] == '\\': i += 2; continue
                if depth == 0 and t[i] == '`': i += 1; break
                if depth == 0 and t.startswith('${', i):
                    depth = 1; out.append('${'); i += 2; continue
                if depth:
                    if t[i] == '{': depth += 1
                    elif t[i] == '}':
                        depth -= 1
                        if depth == 0: out.append('}'); i += 1; continue
                    out.append(t[i])
                i += 1
            out.append('`')
        elif c == '/' and i + 1 < n and t[i+1] not in '/*':
            # 正規表達式字面：只在「前一個有意義字元」允許的位置才算（否則是除號）
            prev = next((x for x in reversed(out) if not x.isspace()), '')
            if prev and prev[-1] not in '})]0123456789_$' and not prev[-1].isalpha():
                j = i + 1; ok = False
                while j < n and t[j] != '\n':
                    if t[j] == '\\': j += 2; continue
                    if t[j] == '[':
                        while j < n and t[j] != ']' and t[j] != '\n':
                            j += 2 if t[j] == '\\' else 1
                    elif t[j] == '/': ok = True; break
                    j += 1
                if ok:
                    i = j + 1
                    while i < n and t[i].isalpha(): i += 1   # flags
                    out.append(' RE '); continue
            out.append(c); i += 1
        else:
            out.append(c); i += 1
    return ''.join(out)

FILES = sorted(glob.glob('gas/*.gs')) + sorted(glob.glob('gas/*.html'))

def declared_names(texts):
    d = set()
    for t in texts:
        d |= set(re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)', t))
        # 多重宣告：const A = 1, B = 2, C = 3  —— 每一個都要收，只抓第一個會製造誤報
        for m in re.finditer(r'\b(?:const|let|var)\s+([^;=\n]*?=[^;\n]*(?:,[^;\n]*)*)', t):
            d |= set(re.findall(r'(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=', m.group(1)))
        d |= set(re.findall(r'\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)', t))
        for m in re.finditer(r'function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)', t):
            d |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
        for m in re.finditer(r'\(([^)]*)\)\s*=>', t):
            d |= set(re.findall(r'[A-Za-z_$][\w$]*', m.group(1)))
        d |= set(re.findall(r'\bcatch\s*\(\s*([A-Za-z_$][\w$]*)', t))
        d |= set(re.findall(r'\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)', t))
        d |= set(re.findall(r'([A-Za-z_$][\w$]*)\s*=>', t))
        d |= set(re.findall(r'\b(?:const|let|var)\s*\{([^}]*)\}', t) and
                 re.findall(r'[A-Za-z_$][\w$]*', ' '.join(re.findall(r'\b(?:const|let|var)\s*\{([^}]*)\}', t))) or [])
    return d

# 只認本專案的命名慣例（見檔頭說明）
# ⚠ 2026-09 盲區：舊 pattern 只認 kanshou*_／_x_／ALL_CAPS_ 三種形狀，getX_／worldX_／relMemMemoryStr_
#   這類「動詞開頭＋尾底線」的私有 helper 整個看不見——當場漏掉 Router_Action.gs 的 sync 還在叫
#   已經砍掉的 getKanshouPeopleList_（fuzz.js 探針抓到的，這道綠燈）。放寬到【任何尾底線識別字】；
#   屬性存取（前面有 .）與物件鍵照舊排除。
PAT = re.compile(r'(?<![.\w$])([A-Za-z_$][\w$]*_)(?![\w$])')

def scan(texts_by_file):
    d = declared_names(list(texts_by_file.values()))
    bad = {}
    for f, t in texts_by_file.items():
        body = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
        body = re.sub(r'(?m)^\s*//.*$', '', body)
        body = blank_literals(body)
        for m in PAT.finditer(body):
            n = m.group(1)
            if n in d:
                continue
            bad.setdefault(n, []).append((f, body[:m.start()].count('\n') + 1))
    return bad

texts = {f: io.open(f, encoding='utf-8').read() for f in FILES}
bad = scan(texts)

# ── 自我退化測試：注入一個必然不存在的呼叫，確認這支真的會叫 ──
#    ⚠ 假名字刻意用 getX_ 形狀（不是 kanshou*_）：2026-09 抓到舊 pattern 只認三種形狀，
#      而自我測試的假名正好是它認得的那種——盲區從來沒被守過。
probe_file = 'gas/Gallery.gs'
poisoned = dict(texts)
poisoned[probe_file] = texts[probe_file] + "\nfunction __selftest__() { return getThisDoesNotExist_(1); }\n"
if 'getThisDoesNotExist_' not in scan(poisoned):
    print("🔎 未宣告識別字：❌ 掃描器自我測試失敗——注入的假呼叫沒被抓到，這支形同虛設")
    sys.exit(1)

print("🔎 未宣告識別字：掃 %d 檔、宣告 %d 個名字（含自我退化測試）" % (len(FILES), len(declared_names(list(texts.values())))))
if not bad:
    print("  ✅ 沒有叫得到卻查無宣告的識別字")
    sys.exit(0)
print("  ❌ %d 個" % len(bad))
for n, locs in sorted(bad.items()):
    where = '、'.join('%s:%d' % (a.split('/')[-1], b) for a, b in locs[:4])
    print("     %s —— %s" % (n, where))
print("     （語法檢查看不到這種錯；若那段又包在 try/catch 裡，會變成靜默失敗）")
sys.exit(1)
