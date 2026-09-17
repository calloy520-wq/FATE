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
CORE = open(os.path.join(ROOT, 'gas/Core_Settings.gs'), encoding='utf-8').read()


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


# ══ 第二道：有條件效果的係數表 FX_TUNING_ ══
# 這批 fx 的條件邏輯留在 resolveFateBattle_ 裡（只對 Archer／只在奇襲／只在第 1 回合…），
# 塞不進上面那種「平坦算式」的表，但【數字】已全部搬進 FX_TUNING_。
# 這裡驗的是：前端說明裡出現的每一個數字，都要能從那格係數推得出來。
FX_TUNE_ALLOW = {          # 說明裡出現、但不是係數的數字——逐條寫明它是什麼
    'tsubame': {1, 2, 3},  # 「僅第 1 回合發動、第 2、3 回合不觸發」＝回合序號，不是係數
    'stealth': {1},        # 「一旦交手氣息即破功」那句裡的數字
}
VOLLEY_EV = (2 + 3) / 3.0  # 彈幕每發期望值：d3 捨去 1，只計 2/3


def tune_table():
    i = BE.index('var FX_TUNING_ = {')
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
    for m in re.finditer(r'^\s{2}([a-z_0-9]+):\s*\{([^}]*)\}', BE[i:j], re.M):
        vals = {}
        for f, v in re.findall(r'(\w+):\s*(-?\d+(?:\.\d+)?)', m.group(2)):
            vals[f] = float(v)
        if vals:
            out[m.group(1)] = vals
    return out


def explainable(vals):
    """純文字說明裡的數字，這格係數能不能解釋：原值／百分比／逐階級換算／除數／彈幕期望值。
    ⚠ 刻意【不】放 a-1、1-a 這種裸轉換——太鬆，實測會讓 weapon_steal 的 1.5 被 2.5 解釋掉。"""
    cand = set()
    RANKVALS = [10, 20, 30, 40, 50, 55, 60]
    for f, v in vals.items():
        a = abs(v)
        cand |= {a, a * 100, round((1 - a) * 100), round((a - 1) * 100)}
        # 逐階級換算只給【名字就說了是 per-rank】的欄位。平坦值（hitFlat／dmgMul…）不該被階級倍率解釋，
        #   否則 3 可以生出 1（3×0.33），愛之痣的 −1 改成 −3 就叫不出來。
        per_rank = ('PerRank' in f) or ('PerVal' in f) or ('Div' in f)
        for m in RANKS:
            if per_rank:
                cand |= {round(a * m), round(a * m * 100)}
            # 「1 ＋ 每階增量」這種爬坡倍率，只認【有 cap 欄】的那格（神殺 ×1.17〜2.0 就是這種）
            if 'cap' in vals:
                cand.add(round(1 + a * m, 2))
        if 'Div' in f:
            cand |= {round(rv / a) for rv in RANKVALS if a}
        if 'volley' in f.lower() or 'Shots' in f:
            cand |= {round(a * VOLLEY_EV), a}
    return {round(float(c), 2) for c in cand}


def formula_ok(vals, fexpr):
    """說明是【算式】(`${Math.round(3 * m)}`) 時，就拿係數組出後端算式逐階級比值——
    比字面鬆得可怕（6 可以被 9×0.67 解釋掉），比值才咬得住。"""
    for v in vals.values():
        a = abs(v)
        # 前端多半寫 Math.round(3 * m)，候選也要有 round 版本，否則 0.99 vs 1 會被判成不同
        for cand in ('%s*x' % a, 'round(%s*x)' % a, '-%s*x' % a, 'round(-%s*x)' % a,
                     '1+%s*x' % a, '1-%s*x' % a, '%s' % a):
            if same(norm(cand), fexpr) is True:
                return True
    return False


def scan_tune(extra_fe=''):
    tune = tune_table()
    # ⚠ 注入的那行要放【前面】：re.search 取第一個命中，放後面會被原版蓋掉、退化測試就永遠不會叫
    text = extra_fe + FE
    bad, checked, silent = [], 0, []
    for fx, vals in sorted(tune.items()):
        m = re.search(r'^\s*' + fx + r':\s*(?:m|\(\))\s*=>\s*(.+)$', text, re.M)
        if not m:
            continue
        checked += 1
        tip = m.group(1)
        # 只把 0／100 當「不是係數」——1 是真的可能是係數（愛之痣命中 −1），不可以跟著剔掉
        if not re.search(r'(?<![\d.])\d+(?:\.\d+)?(?![\d])', re.sub(r'(?<![\d.])(?:0|100)(?![\d.])', '', tip)):
            silent.append(fx)          # 說明完全沒寫數字＝無從對照（誠實報出來，不要假裝驗過）
        # ① 說明裡的算式 → 逐階級比值
        for fexpr in [norm(e) for e in re.findall(r'\$\{([^}]+)\}', tip) if re.search(r'\bm\b', e)]:
            if not formula_ok(vals, fexpr):
                bad.append((fx, '算式 ' + fexpr, sorted(vals.items())))
        # ② 散文裡寫死的數字 → 看係數推不推得出來
        #    邊界只擋數字與小數點，【不要】用 \w——中文也是 \w，「均傷約30」會被整個跳過
        plain = re.sub(r'\$\{[^}]*\}', '', tip)
        ok = explainable(vals) | {float(x) for x in FX_TUNE_ALLOW.get(fx, set())}
        for lit in re.findall(r'(?<![\d.])(\d+(?:\.\d+)?)(?![\d])', plain):
            v = round(float(lit), 2)
            # 只跳過 0 與 100（排版／百分比基準）。**不要連 1 一起跳**——係數剛好是 1 的那格
            #   （愛之痣命中 −1）就再也驗不到了，實測改成 −3 它不會叫。
            if v in (0.0, 100.0):
                continue
            if not any(abs(v - c) < 0.011 for c in ok):
                bad.append((fx, '說明寫 ' + lit, sorted(vals.items())))
    return len(tune), checked, bad, silent


# ══ 第三道：最大生命加成 HP_BONUS_FX_ ══
# 這批不是每擊的算式、是召喚當下算進血上限的固定值（金羊毛 +10），上面兩道都掃不到它；
# 而說明卡會把數字講給玩家聽，同一個數又存兩處。
def scan_hp(extra_fe=''):
    m = re.search(r'var HP_BONUS_FX_\s*=\s*\{([^}]*)\}', CORE)
    if not m:
        return None, []
    tbl = {k: int(v) for k, v in re.findall(r'(\w+)\s*:\s*(\d+)', m.group(1))}
    src = extra_fe + FE   # ⚠ 注入行要放【前面】：re.search 取第一個匹配，放後面會被原版蓋掉（這個坑踩過兩次）
    out = []
    for fx, hp in sorted(tbl.items()):
        d = re.search(r'^\s*%s:\s*\([^)]*\)\s*=>\s*([\'"`])(.*?)\1' % re.escape(fx), src, re.M | re.S)
        if not d:
            out.append((fx, hp, '前端沒有這條說明'))
        elif not re.search(r'(?<![\d])%d(?![\d])' % hp, d.group(2)):
            out.append((fx, hp, '說明裡找不到 +%d' % hp))
    return tbl, out


hp_tbl, hp_bad = scan_hp()
# 🔁 退化測試③：把說明裡的數字改掉，這道必須叫
_probe3 = "\n    golden_fleece: () => '金羊毛：最大生命 +99。',\n"
if hp_tbl and not scan_hp(_probe3)[1]:
    print('❌ 自我退化測試失敗：最大生命加成那道改壞了也不會叫')
    sys.exit(1)

back, front, shared, bad, unsure = scan()
# 🔁 自我退化測試：塞一條跟引擎不一樣的說明進去，這支掃描器必須叫得出來
_probe = '\n    mad: m => `狂化：傷害 +${Math.round(99 * m)}。`,\n'
if not scan(_probe)[3]:
    print('❌ 自我退化測試失敗：改壞了也不會叫，這支掃描器等於沒有')
    sys.exit(1)

n_tune, n_tune_checked, tune_bad, tune_silent = scan_tune()
# 🔁 退化測試②：把係數表的某一格改掉，前端說明就對不上了，必須叫
_probe2 = '\n    ride: m => `騎乘：命中 +${Math.round(9 * m)}。`,\n'
if not scan_tune(_probe2)[2]:
    print('❌ 自我退化測試失敗：係數表那道改壞了也不會叫')
    sys.exit(1)

print('🧮 技能算式對照：後端 %d 條公式、前端 %d 條說明、兩邊都有的 %d 個；係數表 %d 格·對到說明 %d 條；血上限加成 %d 格（含自我退化測試）'
      % (len(back), len(front), len(shared), n_tune, n_tune_checked, len(hp_tbl or {})))
if hp_bad:
    print('  ❌ 最大生命加成跟說明對不上：')
    for fx, hp, why in hp_bad:
        print('     %s：HP_BONUS_FX_ 是 +%d，%s' % (fx, hp, why))
    print('  → 改 HP_BONUS_FX_ 時 Script.html 的 FX_DESC 要跟著改。')
    sys.exit(1)
if tune_silent:
    print('  ⓘ 說明沒寫數字、無從對照（改了也不會叫，心裡有數就好）：' + '、'.join(tune_silent))
if tune_bad:
    print('  ❌ 說明裡的數字，係數表推不出來（改了一邊沒改另一邊）：')
    for fx, lit, vals in tune_bad:
        print('     %s：說明寫 %s ／ 表上是 %s' % (fx, lit, ', '.join('%s=%s' % kv for kv in vals)))
    print('  → 改 FX_TUNING_ 時 Script.html 的說明要跟著改；真不是係數就登記進 FX_TUNE_ALLOW 並寫明它是什麼。')
    sys.exit(1)
if unsure:
    print('  ⓘ 算不動、沒下結論（要人看一眼）：' + '、'.join('%s=%s' % u for u in unsure))
if bad:
    print('  ❌ 說明算出來的跟引擎不一樣（玩家會看到假數字）：')
    for fx, b, f in bad:
        print('     %s：引擎 %s ／ 說明 %s' % (fx, '、'.join(b), f))
    print('  → 改後端公式時 Script.html 的說明要跟著改；這裡只負責在兩邊不一致時叫。')
    sys.exit(1)
print('  ✅ 說明裡的算式跟引擎一致')
