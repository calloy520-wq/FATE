#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🔌 前後端契約掃描（2026-09 新增）

為什麼要有這支：既有掃描器沒有一支看得見「路由兩端對不對得上」。
check_wiring 管死路由、check_mirror 管常數鏡射，但「前端送了一個後端沒人讀的欄位」
「後端下傳了一個前端沒人讀的欄位」是完全的盲區——
實測抓到 actionMove 每次移動白送 1691 字元(整包 14.6%)，而且為了那份沒人看的副本
把 masterCard_/performanceNote_ 各多算一次。移動是 solo 最常按的鍵，那是每一步都在付的稅。

兩個方向：
  ① 前端送 → 後端讀：送了沒人讀 ＝ 玩家填的東西悄悄蒸發，或是早該刪的殘留參數
  ② 後端傳 → 前端讀：傳了沒人讀 ＝ 白算白送（payload 稅），或前端漏接了該顯示的結果

⚠ 掃描器本身要誠實：
  · ① 會跟著「把 userData 整包轉給內層函式」的委派走（handler 常轉給 actionX_），
    也認得解構 `const { a, b } = userData`。不跟的話會誤報一整排。
  · ② 只取【最外層】的回傳鍵——巢狀物件(如 buildArrivePrompt_({...}) 的參數)不是回傳欄位，
    不分層就會把內層參數誤報成死欄位；圓括號同理（三元運算子）。
  · 兩邊都寧可漏報不誤報：前端讀取偵測用寬鬆的 `.x` / `['x']` 全檔比對。
"""
import re, io, glob, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
G = lambda p: os.path.join(ROOT, p)
html = '\n'.join(io.open(f, encoding='utf-8').read() for f in sorted(glob.glob(G('gas/*.html'))))
allgs = '\n'.join(io.open(f, encoding='utf-8').read() for f in sorted(glob.glob(G('gas/*.gs'))))
routes = dict(re.findall(r'"([a-z_0-9]+)":\s*(action[A-Za-z0-9_]+)', allgs))

# dispatcher 層統一處理、不歸 handler 管的欄位
COMMON = {'pcId', 'acctName', 'account', 'isNsfw'}

# 明知故犯的殘留欄位：每一條都要寫清楚為什麼留著，否則就是該刪沒刪。
ALLOW_SEND = {}
ALLOW_RETURN = {
  # 這些是「結果已由 aiPrompt 敘述 ＋ syncData 刷新」的純量副本，留著不花錢、刪了要動戰鬥回傳結構。
  'np_respond': {'counterDmg', 'fled', 'fledTo', 'foeDead', 'response'},
  'fate_battle': {'knockedOut', 'outputRestored'},
  'rest': {'restHours', 'wasInjured'},
  'spirit_repair': {'cost', 'healed'},
  'mana_supply': {'declined'},
  'court_enemy': {'delta'},
  'scout': {'revealed'},          # message 裡已含同一份清單，前端顯示的是 message
  'prep_meal': {'mealBuff'},
  'propose_alliance': {'allied', 'until'},
  'summon_servant': {'fromCodex'},
  'save_hero': {'created', 'edited', 'firstP', 'words'},
  'purge_orphans': {'kept', 'removed'},
  'account_login': {'ended'},
  'check_name': {'canon'},
  'get_full_status': {'canEditFate', 'targetId'},
  'kanshou_set_nickname': {'newNickname'},
  'kanshou_summon_hero': {'added'},
  'update_rel_tag': {'newTag'},
}

def body(fn):
    m = re.search(r'function\s+%s\s*\([^)]*\)\s*\{' % re.escape(fn), allgs)
    if not m: return ''
    i = m.end() - 1; d = 0
    for j in range(i, len(allgs)):
        if allgs[j] == '{': d += 1
        elif allgs[j] == '}':
            d -= 1
            if d == 0: return allgs[i:j + 1]
    return allgs[i:]

def ud_fields(b):
    ks = set(re.findall(r'userData\.([A-Za-z_]\w*)', b))
    ks |= set(re.findall(r'userData\[["\']([A-Za-z_]\w*)["\']\]', b))
    for m in re.finditer(r'\{([^{}]*)\}\s*=\s*userData', b):
        for part in m.group(1).split(','):
            n = part.split(':')[0].strip()
            if re.fullmatch(r'[A-Za-z_]\w*', n): ks.add(n)
    return ks

def reads_deep(fn, seen=None, depth=0):
    if seen is None: seen = set()
    if fn in seen or depth > 4: return set()
    seen.add(fn)
    b = body(fn); ks = ud_fields(b)
    for callee in set(re.findall(r'\b([A-Za-z_]\w*)\s*\([^)]*\buserData\b', b)):
        if callee != fn: ks |= reads_deep(callee, seen, depth + 1)
    return ks

def outer_keys(blk):
    """只取最外層的鍵，巢狀物件跳過"""
    # ⚠ 圓括號也要算層：`npChoice: (cond ? npChoiceArg : undefined)` 裡的 `npChoiceArg :`
    #   會被當成欄位名，三元運算子一多就整排誤報（第一版就是這樣）。
    depth = 0; i = 0; out = []
    while i < len(blk):
        c = blk[i]
        if c in '{[(': depth += 1
        elif c in '}])': depth -= 1
        elif depth == 1:
            m = re.match(r'([A-Za-z_]\w*)\s*:', blk[i:])
            # ⚠ 鍵的前面(跳過空白)必須是 `{` 或 `,`。只檢查「前一個字元是空白也算」會把
            #   三元運算子的 `? false : undefined` 讀成一個叫 false 的欄位。
            if m:
                k = i - 1
                while k >= 0 and blk[k] in ' \t\n\r': k -= 1
                if k < 0 or blk[k] in '{,':
                    out.append(m.group(1)); i += m.end() - 1
        i += 1
    return out

def ret_keys(fn, seen=None, depth=0):
    if seen is None: seen = set()
    if fn in seen or depth > 3: return set()
    seen.add(fn); b = body(fn); ks = set()
    for m in re.finditer(r'JSON\.stringify\(\s*\{', b):
        i = m.end() - 1; d = 0; blk = None
        for j in range(i, min(i + 8000, len(b))):
            if b[j] == '{': d += 1
            elif b[j] == '}':
                d -= 1
                if d == 0: blk = b[i:j + 1]; break
        if blk: ks |= set(outer_keys(blk))
    for callee in set(re.findall(r'return\s+([A-Za-z_]\w*)\s*\(', b)):
        ks |= ret_keys(callee, seen, depth + 1)
    return ks

# ── ① 前端送 → 後端讀 ──
sends = {}
for m in re.finditer(r'gasRun\(\s*\{', html):
    i = m.end() - 1; d = 0; blk = None
    for j in range(i, min(i + 4000, len(html))):
        if html[j] == '{': d += 1
        elif html[j] == '}':
            d -= 1
            if d == 0: blk = html[i:j + 1]; break
    if not blk: continue
    am = re.search(r'action\s*:\s*[\'"]([a-z_0-9]+)[\'"]', blk)
    if not am: continue
    ks = set(outer_keys(blk)); ks.discard('action')
    sends.setdefault(am.group(1), set()).update(ks)

problems = []
for act, sk in sorted(sends.items()):
    if act not in routes:
        problems.append(f'① 前端呼叫了不存在的 action「{act}」'); continue
    dead = sorted(sk - COMMON - ALLOW_SEND.get(act, set()) - reads_deep(routes[act]))
    if dead:
        problems.append(f'① {act}：前端送了 {"、".join(dead)}，但 {routes[act]} 從來沒讀過'
                        f'——是玩家填的東西悄悄蒸發，還是早該刪的殘留？二選一。')

# ── ② 後端傳 → 前端讀 ──
fread = set(re.findall(r'\.([A-Za-z_]\w*)\b', html)) | set(re.findall(r'\[["\']([A-Za-z_]\w*)["\']\]', html))
IGNORE = {'success', 'message'}
for act, fn in sorted(routes.items()):
    dead = sorted(k for k in ret_keys(fn) - IGNORE - ALLOW_RETURN.get(act, set()) if k not in fread)
    if dead:
        problems.append(f'② {act}：後端下傳 {"、".join(dead)}，前端整份 html 都沒讀'
                        f'——白算白送（payload 稅），還是前端漏接了該顯示的結果？'
                        f'確定是刻意留的就登記進 ALLOW_RETURN 並寫明理由。')

print(f'🔌 前後端契約：路由 {len(routes)} 條、前端有送資料的 {len(sends)} 個、'
      f'登記在案的殘留欄位 {sum(len(v) for v in ALLOW_RETURN.values()) + sum(len(v) for v in ALLOW_SEND.values())} 個')
if problems:
    print(f'  ❌ {len(problems)} 處對不上')
    for p in problems: print('     ' + p)
    sys.exit(1)
print('  ✅ 每個欄位兩端都對得上')
