#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""🧮 技能說明的算式，跟引擎真正在算的那條要一致。

前端 Script.html 的技能/寶具說明會把數字【當場算給玩家看】（`傷害 +${Math.round(8 * m) + 14}`），
真正結算的卻是後端 Engine_Fate.gs 的 `SKILL_FX_`／`DEF_FX_`。同一條公式寫兩遍，
改了後端沒改前端 → 玩家看到的數字是假的，而且不會有任何錯誤訊息。

這不是假想：CODE_NOTES 就記著「str_up/burst 那批漏改的一則」，同一批說明漏改過一次。
`check_mirror` 只認 `KC_*` 常數，看不到藏在樣板字串裡的算式，所以這一塊一直沒有防線。

⚠ 比【數值】不比字面：引擎記 `1-0.18r` 這種受傷倍率，說明常寫成「−18%」，那是同一件事的
   兩種講法。第一版只比字面，divine_core 當場誤報——誤報整排的掃描器會被直接無視，比沒有更糟。
"""
import re, sys, os, math

ROOT = os.path.dirname(os.path.abspath(__file__))
BE = open(os.path.join(ROOT, 'gas/Engine_Fate.gs'), encoding='utf-8').read()
FE = open(os.path.join(ROOT, 'gas/Script.html'), encoding='utf-8').read()


def norm(x):
    x = re.sub(r'\.toFixed\(\d+\)', '', x)
    x = re.sub(r'\bMath\.', '', x)
    x = re.sub(r'\b[rm]\b', 'x', x)
    return re.sub(r'\s+', '', x)


def ev(expr, x):
    """把 JS 算式當 Python 算（只用到 round/min/max 與四則）。算不動回 None。"""
    try:
        return eval(expr, {'__builtins__': {}},
                    {'x': x, 'round': lambda v: math.floor(v + 0.5), 'min': min, 'max': max})
    except Exception:
        return None


RANKS = [0.33, 0.67, 1.0, 1.33, 1.67, 2.0]   # E~EX 的 rankMul_


def same(bf, ff):
    b = [ev(bf, x) for x in RANKS]
    f = [ev(ff, x) for x in RANKS]
    if None in b or None in f:
        return None
    if all(abs(p - q) < 1e-9 for p, q in zip(b, f)):
        return True
    for tf in (lambda v: math.floor((1 - v) * 100 + 0.5),      # 倍率 → 減傷 %
               lambda v: math.floor((v - 1) * 100 + 0.5)):     # 倍率 → 增傷 %
        if all(abs(tf(p) - q) < 1e-9 for p, q in zip(b, f)):
            return True
    return False


def back_table(name):
    i = BE.index('var %s = {' % name)
    depth, j = 0, i
    while True:
        if BE[j] == '{':
            depth += 1
        elif BE[j] == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    out = {}
    for m in re.finditer(r'^\s{2}([a-z_0-9]+):\s*\{(.*)$', BE[i:j], re.M):
        forms = re.findall(r'function \(([rm])[^)]*\)\s*\{\s*return ([^;]+);', m.group(2))
        if forms:
            out[m.group(1)] = set(norm(f[1]) for f in forms)
    return out


def scan(extra_fe=''):
    back = {}
    for t in ('SKILL_FX_', 'DEF_FX_'):
        back.update(back_table(t))
    front = {}
    for m in re.finditer(r'^\s*([a-z_0-9]+):\s*m\s*=>\s*`([^`]*)`', FE + extra_fe, re.M):
        exprs = set(norm(e) for e in re.findall(r'\$\{([^}]+)\}', m.group(2)) if re.search(r'\bm\b', e))
        if exprs:
            front[m.group(1)] = exprs
    shared = sorted(set(back) & set(front))
    bad, unsure = [], []
    for fx in shared:
        for ff in sorted(front[fx]):
            if any(same(bf, ff) is True for bf in back[fx]):
                continue
            if all(same(bf, ff) is None for bf in back[fx]):
                unsure.append((fx, ff))
                continue
            bad.append((fx, sorted(back[fx]), ff))
    return back, front, shared, bad, unsure


back, front, shared, bad, unsure = scan()
# 🔁 自我退化測試：塞一條跟引擎不一樣的說明進去，這支掃描器必須叫得出來
_probe = '\n    mad: m => `狂化：傷害 +${Math.round(99 * m)}。`,\n'
if not scan(_probe)[3]:
    print('❌ 自我退化測試失敗：改壞了也不會叫，這支掃描器等於沒有')
    sys.exit(1)

print('🧮 技能算式對照：後端 %d 條公式、前端 %d 條說明、兩邊都有的 %d 個（含自我退化測試）'
      % (len(back), len(front), len(shared)))
if unsure:
    print('  ⓘ 算不動、沒下結論（要人看一眼）：' + '、'.join('%s=%s' % u for u in unsure))
if bad:
    print('  ❌ 說明算出來的跟引擎不一樣（玩家會看到假數字）：')
    for fx, b, f in bad:
        print('     %s：引擎 %s ／ 說明 %s' % (fx, '、'.join(b), f))
    print('  → 改後端公式時 Script.html 的說明要跟著改；這裡只負責在兩邊不一致時叫。')
    sys.exit(1)
print('  ✅ 說明裡的算式跟引擎一致')
