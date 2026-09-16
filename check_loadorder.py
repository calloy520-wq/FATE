#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""📦 檔案載入當下就求值的東西，不可以依賴別的檔。

GAS 把所有 `.gs` 串成一個檔跑，載入順序由專案決定、**我們控制不了也看不到**。
`var A = ...` 的右邊在載入那一刻就求值；如果它用到的常數住在另一個檔、而那個檔還沒跑到，
拿到的是 `undefined`——不會報錯，只會把 `undefined` 當字面值烤進去，永遠跟著跑。

2026-09 抓到的真例：`DOJO_CAUSE_.deadline.fact` 寫成 `` `${FATE_DEADLINE_DAYS_} 日時限耗盡` ``，
而 `FATE_DEADLINE_DAYS_` 住在 `Time_World.gs`。玩家敗北後的老虎道場講評因此變成
「這一局輸在：undefined 日時限耗盡」——送進提示詞、AI 照著演，而且零錯誤訊息。

安全的寫法：① 佔位字串（`'{days} 日'`）用的時候才代入，跟 `{sv}`/`{foe}` 同一條路；
② 改成函式（`function daysText_() { return ... }`）；③ 把常數搬到同一個檔。

⚠ 這支只看「載入當下就會跑到」的部分：初始化式裡的**函式值**（`function(){}`／`=>`）
   是之後才執行的，一律剝掉不算——不剝的話整個路由表、整張 fx 表都會誤報。
"""
import re, sys, os, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
ALLOW = {}          # {(檔, 常數名, 用到的名字): 理由}


def strip_noise(src):
    """把註解與字串內容抹掉（保留長度與換行），只留結構。樣板字串的 ${} 內容要保留。"""
    out = list(src)
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != '\n':
                out[i] = ' '; i += 1
        elif c == '/' and i + 1 < n and src[i + 1] == '*':
            while i < n and not (src[i] == '*' and i + 1 < n and src[i + 1] == '/'):
                if src[i] != '\n': out[i] = ' '
                i += 1
            if i < n: out[i] = ' '; out[min(i + 1, n - 1)] = ' '; i += 2
        elif c in '"\'':
            q = c; out[i] = ' '; i += 1
            while i < n and src[i] != q:
                if src[i] == '\\': out[i] = ' '; i += 1
                if i < n and src[i] != '\n': out[i] = ' '
                i += 1
            if i < n: out[i] = ' '; i += 1
        elif c == '`':
            out[i] = ' '; i += 1
            depth = 0
            while i < n:
                if src[i] == '\\':
                    out[i] = ' '; out[min(i + 1, n - 1)] = ' '; i += 2; continue
                if src[i] == '$' and i + 1 < n and src[i + 1] == '{':
                    depth += 1; i += 2; continue        # ${} 裡是真的程式碼，留著
                if depth and src[i] == '}':
                    depth -= 1; i += 1; continue
                if depth:
                    i += 1; continue
                if src[i] == '`':
                    out[i] = ' '; i += 1; break
                if src[i] != '\n': out[i] = ' '
                i += 1
        else:
            i += 1
    return ''.join(out)


def initializer(src, start):
    """從 `= ` 之後取到這個宣告的結尾（分號或下一個頂層宣告），括號要配對。"""
    i, n = start, len(src)
    depth = 0
    while i < n:
        c = src[i]
        if c in '([{': depth += 1
        elif c in ')]}': depth -= 1
        elif c == ';' and depth <= 0: return src[start:i]
        elif c == '\n' and depth <= 0 and src[start:i].strip():
            nxt = src[i + 1:i + 40]
            if re.match(r'\s*(var|const|let|function)\s', nxt): return src[start:i]
        i += 1
    return src[start:]


FN_RE = re.compile(r'function\s*\w*\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>\s*\{?|\b\w+\s*=>\s*\{?')


def drop_functions(expr):
    """剝掉初始化式裡的函式值（之後才執行，不受載入順序影響）。"""
    out, i = [], 0
    while i < len(expr):
        m = FN_RE.search(expr, i)
        if not m:
            out.append(expr[i:]); break
        out.append(expr[i:m.start()])
        j = m.end()
        if expr[m.end() - 1] == '{':          # 有大括號的函式體 → 吃到配對
            depth = 1
            while j < len(expr) and depth:
                if expr[j] == '{': depth += 1
                elif expr[j] == '}': depth -= 1
                j += 1
        else:                                  # 箭頭函式的運算式本體 → 吃到逗號/收尾
            depth = 0
            while j < len(expr):
                if expr[j] in '([{': depth += 1
                elif expr[j] in ')]}':
                    if depth == 0: break
                    depth -= 1
                elif expr[j] == ',' and depth == 0: break
                j += 1
        i = j
    return ''.join(out)


def scan(extra=None):
    files = [(os.path.basename(f), open(f, encoding='utf-8').read()) for f in sorted(glob.glob(os.path.join(ROOT, 'gas/*.gs')))]
    if extra: files.append(extra)
    owners = {}
    for name, src in files:
        for m in re.finditer(r'(?m)^(?:var|const|let)\s+(\w+)\s*=', src):
            owners.setdefault(m.group(1), set()).add(name)
    checked, bad = 0, []
    for name, src in files:
        clean = strip_noise(src)
        for m in re.finditer(r'(?m)^(?:var|const|let)\s+(\w+)\s*=', clean):
            checked += 1
            expr = drop_functions(initializer(clean, m.end()))
            for ident in sorted(set(re.findall(r'\b([A-Za-z_]\w*)\b', expr))):
                own = owners.get(ident)
                if not own or name in own or ident == m.group(1):
                    continue
                if (name, m.group(1), ident) in ALLOW:
                    continue
                bad.append((name, m.group(1), ident, sorted(own)))
    return checked, bad


checked, bad = scan()

# 🔁 自我退化測試：把當初那個形狀原樣塞回去（跨檔常數直接寫進樣板字串），必須叫得出來
_probe = ('<自我退化測試>.gs', 'var PROBE_TABLE_ = { fact: `${FATE_DEADLINE_DAYS_} 日時限耗盡` };\n')
if not [b for b in scan(_probe)[1] if b[0].startswith('<')]:
    print('❌ 自我退化測試失敗：跨檔常數直接寫進頂層樣板字串它也不叫，這支掃描器等於沒有')
    sys.exit(1)

print('📦 載入順序：頂層宣告 %d 個、豁免 %d 條（含自我退化測試）' % (checked, len(ALLOW)))
if bad:
    print('  ❌ 載入當下就求值，卻用到別的檔宣告的東西（那時可能還是 undefined）：')
    for f, who, ident, own in bad:
        print('     %s  %s → %s（宣告在 %s）' % (f, who, ident, '、'.join(own)))
    print('  → 改成用的時候才代入（佔位字串或函式），或把常數搬到同一個檔。')
    sys.exit(1)
print('  ✅ 頂層初始化沒有跨檔依賴')
