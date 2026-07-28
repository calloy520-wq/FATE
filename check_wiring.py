# -*- coding: utf-8 -*-
"""🔌 接線檢查（check.sh 會跑）

這支擋的是三種「不會有任何錯誤訊息」的漏洞形狀，都是本專案實際踩過的：

  ① 永遠不會成功的按鈕
     後端有門檻（好感不足／已達上限）會拒絕，前端卻照樣把按鈕長出來，
     玩家點下去才被打回票。修法一律是「門檻由後端下傳、前端據此鎖」，
     所以規則是：每個門檻/上限常數要嘛前端拿得到，要嘛你得明講它不需要 UI 出口。

  ② 查表漏一格 ／ 三階套同一句
     資料驅動的查表（強度→演法之類）沒覆蓋到 enum 的每一個值 → 那一階靜靜地什麼都不做；
     或三階的值其實一模一樣 → 玩家感覺「調了跟沒調一樣」。兩者都不會報錯。

  ③ 掃描器自己漏看
     check_prompt.py 的 ★ 區塊數若無聲下降，代表 regex 漏看了東西，
     而它還是會印「✅ 全部通過」。覆蓋數設下限，掉下去就擋。

用法：python3 check_wiring.py   ← 有問題回傳非 0
"""
import re, sys, os, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
GAS = os.path.join(ROOT, 'gas')
back = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(os.path.join(GAS, '*.gs'))}
front = {os.path.basename(p): open(p, encoding='utf-8').read() for p in glob.glob(os.path.join(GAS, 'Script*.html'))}
BACK_ALL = '\n'.join(back.values())
FRONT_ALL = '\n'.join(front.values())

problems = []

# ── ① 門檻/上限常數必須有前端出口 ────────────────────────────────
# 沒有 UI 出口是合理的那些，一律要寫明理由——「忘了接」跟「不用接」從外面看長得一樣，
# 只能靠人簽名區分。新增門檻常數時你會被迫做這個決定，這正是重點。
NO_UI_NEEDED = {
    'KANSHOU_PARTY_DETAIL_CAP_': '提示詞內部的篇幅上限，玩家看不到也不需要知道',
    'KANSHOU_WORLD_ROSTER_CAP_': '同上，餵 AI 的名冊長度上限',
    'KANSHOU_SCENE_BOND_': '橋段給的好感增量，不是門檻、沒有按鈕會被它擋',
    'KANSHOU_KNOCK_MIN_BOND_': '敲門事件的觸發條件，隨機事件不是玩家主動按的按鈕',
    'KANSHOU_ALBUM_CAP_': '相簿上限，滿了是自動汰換舊照而非拒絕玩家',
    'KANSHOU_INIT_BASE_': '她主動的機率參數，非門檻',
    'KANSHOU_INIT_MAX_': '同上',
    'KANSHOU_APPT_LEAVE_EARLY_': '赴約提前離場機率，非門檻',
    'KANSHOU_KNOCK_CHANCE_': '敲門機率，非門檻',
    'KANSHOU_KNOCK_RAID_CHANCE_': '同上',
    'KANSHOU_SIDEWRITE_EVERY_': '側寫回填頻率，內部節流',
    'KANSHOU_FIRSTS_CAP_': '「第一次」紀錄的 MEMORY 儲存上限，滿了就不再收，玩家沒有對應的按鈕',
    'KANSHOU_INIT_PER_BOND_': '她主動的機率係數（名字尾巴剛好是 _BOND_），非門檻',
}
# 有些門檻不是「把數字下傳給前端」，而是後端直接算好結果下傳（逐項的解鎖清單之類），
# 那比下傳數字更精準。這種要指名是靠哪個欄位接的，工具會確認那個欄位前後端都真的存在。
DOWNLINKED_VIA = {
    'KANSHOU_VISIT_BOND_': ('unlockedResidences', '逐地點的解鎖清單，比下傳門檻數字更精準（前端據此把未解鎖住處灰掉）'),
}
gate_re = re.compile(r'\b(KANSHOU_[A-Z0-9_]*(?:BOND|CAP)_)\s*=')
gates = sorted(set(gate_re.findall(BACK_ALL)))
for g in gates:
    if g in NO_UI_NEEDED:
        continue
    short = 'KC_' + g[len('KANSHOU_'):]
    mirrored = re.search(r'\b' + re.escape(short), FRONT_ALL)
    # 下傳：後端把常數塞進回應物件（`propBond: KANSHOU_PROP_EQUIP_BOND_`）
    downlinked = re.search(r'[A-Za-z_]\w*\s*:\s*' + re.escape(g) + r'\b', BACK_ALL)
    via = DOWNLINKED_VIA.get(g)
    if via:
        field = via[0]
        if not re.search(r'\b' + re.escape(field) + r'\s*:', BACK_ALL):
            problems.append(f'① {g}：登記說靠 `{field}` 下傳，但後端回應裡找不到這個欄位')
        elif not re.search(r'\b' + re.escape(field) + r'\b', FRONT_ALL):
            problems.append(f'① {g}：後端有下傳 `{field}`，前端卻沒有任何地方讀它——等於白傳')
        continue
    if not mirrored and not downlinked:
        problems.append(
            f'① {g}：後端拿它擋玩家，前端卻既沒鏡射常數({short})、也沒有下傳欄位——'
            f'按鈕會照長出來、點了才被拒。請下傳給前端鎖，或登記進 NO_UI_NEEDED 並寫明為什麼不用。')

# ── ② 查表覆蓋 enum ＋ 值必須彼此不同 ──────────────────────────
# (enum 常數, 查表常數, 可以不覆蓋的值與理由)
ENUM_TABLES = [
    ('KANSHOU_PROP_LEVELS_', 'KANSHOU_PROP_LEVEL_FX_', {'關閉': '關閉＝沒在作用，本來就不該有行為指令'}),
]


def grab(name, text):
    """抓 `const/var NAME = <字面量>` 的原始字串（括號配對，不靠縮排）。"""
    m = re.search(r'(?:^|\n)\s*(?:const|var|let)\s+' + re.escape(name) + r'\s*=\s*', text)
    if not m:
        return None
    i = m.end()
    if text[i] not in '[{':
        j = text.find(';', i)
        return text[i:j if j > 0 else text.find('\n', i)]
    op, cl = text[i], (']' if text[i] == '[' else '}')
    depth, in_str, esc, j = 0, None, False, i
    while j < len(text):
        c = text[j]
        if esc:
            esc = False
        elif in_str:
            if c == '\\':
                esc = True
            elif c == in_str:
                in_str = None
        elif c in '"\'`':
            in_str = c
        elif c == op:
            depth += 1
        elif c == cl:
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
        j += 1
    return None


for enum_name, table_name, exempt in ENUM_TABLES:
    e_src, t_src = grab(enum_name, BACK_ALL), grab(table_name, BACK_ALL)
    if not e_src or not t_src:
        problems.append(f'② {enum_name} / {table_name}：抓不到其中一個定義（改名了？檢查沒跟上就等於沒檢查）')
        continue
    values = re.findall(r"'([^']+)'", e_src)
    keys = re.findall(r"'([^']+)'\s*:", t_src)
    missing = [v for v in values if v not in keys and v not in exempt]
    if missing:
        problems.append(f'② {table_name} 沒有覆蓋 {enum_name} 的：{"、".join(missing)}——那幾階會靜靜地什麼都不做')
    vals = re.findall(r":\s*'([^']{4,})'", t_src)
    if len(vals) != len(set(vals)):
        problems.append(f'② {table_name} 有內容完全相同的階——玩家會覺得「調了跟沒調一樣」')
    tooshort = [v for v in vals if len(v) < 15]
    if tooshort:
        problems.append(f'② {table_name} 有過短的階（{tooshort[0][:20]}…）：小模型對只有形容詞的短指令區分度很弱')

# ── ④ 前端呼叫的 action 名稱必須真的存在於後端 router ────────────
# 打錯一個字，玩家按下去只會拿到一句無關的失敗訊息（或整個沒反應），
# 沒有任何東西會告訴你「這個 action 根本不存在」。反向也查：後端掛著沒人呼叫的 action
# ——那是刪功能時留下的死路由，下次有人照著它改就白改了。
router_src = back.get('Router_Action.gs', '')
m = re.search(r'const\s+ActionRouter\s*=\s*\{', router_src)
routed = set()
if m:
    depth, j = 0, m.end() - 1
    while j < len(router_src):
        if router_src[j] == '{':
            depth += 1
        elif router_src[j] == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    routed = set(re.findall(r'"([a-z0-9_]+)"\s*:', router_src[m.end():j]))
called = set(re.findall(r"action\s*:\s*'([a-z0-9_]+)'", FRONT_ALL)) | set(re.findall(r'action\s*:\s*"([a-z0-9_]+)"', FRONT_ALL))
# 前端沒直接寫死、由變數帶入的（樣板函式），登記在這裡免得誤判成死路由
DYNAMIC_CALLERS = {
    'sync': '開場/每回合同步，由共用樣板帶入',
    'play': '主要互動，由 send() 帶入',
}
unknown = sorted(called - routed)
if unknown:
    problems.append(f'④ 前端呼叫了後端沒有的 action：{"、".join(unknown)}——按下去只會得到一句無關的失敗訊息')
# ⚠ 判「死路由」不能只認 `action: 'xxx'` 這一種寫法——有些是當參數傳的
#   （pickSelectable('set_mage_realm', …)），只認一種寫法會把活的路由誤報成死的。
#   反向查（前端呼叫了不存在的 action）才需要精準比對，那邊維持嚴格 regex。
#   （引號在 HTML 字串裡還會被跳脫成 \'，比對引號會再漏一次——直接找裸名字最穩。）
mentioned = set(k for k in routed if re.search(r'\b' + re.escape(k) + r'\b', FRONT_ALL))
dead = sorted(routed - called - mentioned - set(DYNAMIC_CALLERS))
if dead:
    problems.append(f'④ 後端有路由但前端從沒呼叫（死路由或只給 API 直打）：{"、".join(dead)}')

# ── ③ 提示詞掃描器的覆蓋數不得無聲下降 ──────────────────────────
# check_prompt.py 的 ★ 區塊 regex 若哪天漏看了東西，它仍然會印「✅ 全部通過」。
# 這裡記一個下限；真的刻意刪掉區塊時，請一併把這個數字調下來（強迫是個有意識的動作）。
# ⚠ 這裡的計數方式跟 check_prompt.py 不同（那邊的 regex 會把同一行後面的 ★ 一起吃進 420 字尾巴裡），
#   所以數字不一樣是正常的；重點是「不准無聲變少」。
MIN_STAR_BLOCKS = 128   # 2026-07 +5：告白(成立/被拒/冷卻/已在一起/撲空)。前次 123（移除「悄悄解除」那一階）
star = 0
for l in BACK_ALL.split('\n'):
    t = l.strip()
    if t.startswith('//') or '★' not in l:
        continue
    star += len(re.findall(r'★【[^】]{2,120}】', l))
if star < MIN_STAR_BLOCKS:
    problems.append(
        f'③ ★ 區塊只掃到 {star} 個，低於下限 {MIN_STAR_BLOCKS}——'
        f'要嘛 check_prompt.py 的 regex 漏看了（它還是會印「全部通過」），'
        f'要嘛你真的刪了區塊；後者請把 check_wiring.py 的 MIN_STAR_BLOCKS 一起調下來。')

# ── ⑤ 餵 AI 的資料表：不准當謎語人、不准替角色決定演技 ──────────────────────
# 兩次實際踩到的形狀，都不在 ★ 區塊裡（check_prompt.py 只掃 ★ 行，看不到資料表）：
#   ⓐ 未指涉的代詞：「唯獨這件事聊不了」——哪件事？小模型解不開，就自己編一個。
#   ⓑ 替角色決定微動作：「愣一下／打呵欠／慌一下然後裝沒事」——12 格套同一套表情，
#      凜和櫻會被演成同一個人（玩家原話：「這樣有模板·誰來演都一樣·那我多個角色不就沒有意義了」）。
# 規則：這些表只寫【既定事實】（此刻什麼是真的／什麼不會發生），演法留給 AI。
FACT_TABLES = ['KANSHOU_RAPPORT_TONE_']
fact_cells = 0
VAGUE = ['這件事', '那件事', '這種事', '那個意思', '這一切', '那件', '如此這般']
ACTING = ['愣一下', '打呵欠', '慌一下', '臉紅', '嘟嘴', '歪頭', '眨眨眼', '吐舌']
for tname in FACT_TABLES:
    src = grab(tname, BACK_ALL)
    if not src:
        problems.append(f'⑤ {tname}：抓不到定義（改名了？檢查沒跟上就等於沒檢查）')
        continue
    cells = re.findall(r":\s*'([^']{6,})'", src)
    fact_cells += len(cells)
    for c in cells:
        for v in VAGUE:
            if v in c:
                problems.append(f'⑤ {tname} 有未指涉的代詞「{v}」：{c[:34]}…——小模型解不開就會自己編一個，直接寫白')
        for a in ACTING:
            if a in c:
                problems.append(f'⑤ {tname} 替角色決定了微動作「{a}」：{c[:34]}…——這是她的個性該決定的，表只寫既定事實')

print(f'🔌 接線檢查：門檻常數 {len(gates)} 個（其中 {len(NO_UI_NEEDED)} 個登記為不需 UI 出口）、'
      f'查表 {len(ENUM_TABLES)} 組、事實表 {fact_cells} 格、★ 區塊 {star} 個、action 路由 {len(routed)} 條（前端呼叫 {len(called)} 條）')
if problems:
    print(f'  ❌ {len(problems)} 處')
    for p in problems:
        print('     ' + p)
else:
    print('  ✅ 全部通過')
sys.exit(1 if problems else 0)
