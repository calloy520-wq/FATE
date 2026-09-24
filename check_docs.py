#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""📚 文件↔代碼 對照：文件裡用 `名字(` 寫法點名的函式，代碼裡必須真的還在。

為什麼要這支：CLAUDE.md 說 FUNCTION_MANUAL.md 是「逐字寫簽名的索引、零容錯」，
但刪一支函式時忘了回頭改文件不會有任何症狀——下一個失憶的我照著文件去 grep，
查無此函式，只好重新讀整個 repo，等於這份索引比沒有還誤導人。
2026-09 一次稽核抓到 17 條這種幽靈條目（kanshouRollEvent_／stanceLine_／summonTab…），
全是「功能砍掉了、索引沒跟著砍」。這道網把那個形狀改成機器擋。

只認【反引號包住、後面緊接左括號】的寫法——那就是在點名一支函式。
散文裡提到名字（沒括號）不算，歷史沿革寫「`kanshouRollEvent_` 已刪除」也不算。

2026-09 補第二道：**常數也會變成幽靈**（`SCAVENGE_TAG_`／`KANSHOU_FESTIVAL_DONE_TAG_` 兩條當場抓到），
而它們沒有括號、上面那道網看不見。常數這道只掃 `FUNCTION_MANUAL.md`——
其餘文件本來就有大量歷史敘述（「舊版的 X 已整組砍除」），全掃會整排誤報，
而 FUNCTION_MANUAL 是 CLAUDE.md 指名「零容錯」的那份索引。
刪除線 ~~`X`~~ 與同行寫著「已移除／已刪／整組砍除…」的墓碑一律放行。
"""
import re, sys, os, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
DOCS = ['FUNCTION_MANUAL.md', 'KANSHOU_REFERENCE.md', 'SOLO_REFERENCE.md',
        'CODE_MAP.md', 'HANDBOOK.md', 'AI_PROMPT_MAP.md', 'CODE_NOTES.md',
        'PLAYBOOK.md', 'CLAUDE.md', 'DESIGN.md']

# 語言內建／瀏覽器 API／GAS API／文件裡當常數或散文用的名字——不是我們的函式
BUILTIN = set('''
if for while switch catch function return typeof new delete void
parseInt parseFloat String Number Boolean Array Object JSON Math Date RegExp Promise Error
map filter find findIndex forEach push pop shift unshift slice splice concat join split
replace test match exec trim indexOf lastIndexOf includes sort reverse some every reduce
keys values entries stringify parse assign freeze
alert confirm prompt setTimeout setInterval clearTimeout require console log
createElement appendChild querySelector querySelectorAll getElementById addEventListener
getRange getValues setValues getValue setValue getDataRange appendRow deleteRow deleteRows
getSheetByName insertSheet getActiveSpreadsheet getScriptCache getUserProperties
round min max abs floor ceil random
'''.split())
# 文件裡刻意用「名字(參數)」寫法表達的非函式（常數查表、散文）——加進來前先確認它真的不是函式
PROSE = {'FORGE_SK_PTS', 'MEAL_BUFF_BONUS', 'ROUNDS', 'pc', 'main',
         '_kbCb', '_kpCb', 'interruptedFn', 'normalFn',
         'MEMORY標記不再讀寫', 'TA是你的老婆', 'solo專用'}

DECL = re.compile(r'function\s+([A-Za-z_$][\w$]*)')
ASSIGN = re.compile(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|async|\()')
CITE = re.compile(r'`([A-Za-z_$][\w$]*)\(')


def declared(extra_src=""):
    names = set()
    for f in sorted(glob.glob(os.path.join(ROOT, 'gas', '*.gs')) +
                    glob.glob(os.path.join(ROOT, 'gas', '*.html'))):
        s = open(f, encoding='utf-8').read()
        names |= set(DECL.findall(s)) | set(ASSIGN.findall(s))
    if extra_src:
        names |= set(DECL.findall(extra_src)) | set(ASSIGN.findall(extra_src))
    return names


def scan(names, docs_override=None):
    ghosts = []
    cited = 0
    for d in DOCS:
        path = os.path.join(ROOT, d)
        if not os.path.exists(path):
            continue
        s = (docs_override or {}).get(d) or open(path, encoding='utf-8').read()
        for i, line in enumerate(s.split('\n'), 1):
            for n in CITE.findall(line):
                if n in BUILTIN or n in PROSE:
                    continue
                cited += 1
                if n in names:
                    continue
                # 墓碑放行，跟常數／錨點那兩道同一條規則：刪除線包住，或同一行寫明它已經沒了。
                #   2026-09 這道原本沒有放行——三支掃描器對墓碑態度不一致，
                #   於是我拿 ~~ 包了兩處以為修好、實際照樣叫（然後在紅燈上 push 了）。
                if ('~~`%s(' % n) in line or TOMB.search(line):
                    continue
                ghosts.append((d, i, n))
    return cited, ghosts


# 常數的幽靈掃描（只掃 FUNCTION_MANUAL.md，理由見檔頭）
CONST_DOC = 'FUNCTION_MANUAL.md'
CONST_CITE = re.compile(r'`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+_?)`')
TOMB = re.compile(r'已移除|已刪|刪除|整組砍|砍除|砍掉|退役|退休|取代|不再|清空|已無|廢止|移出|改名')
# 不是 gas 代碼裡的名字，但確實存在的東西——每一條寫明它在哪
CONST_ALLOW = {
    'CODE_NOTES': '文件檔名，不是常數',
    'FUNCTION_MANUAL': '文件檔名',
    'SOLO_REFERENCE': '文件檔名',
    'KANSHOU_REFERENCE': '文件檔名',
    'AI_PROMPT_MAP': '文件檔名',
    'CODE_MAP': '文件檔名',
    'FATE_HERO_CODEX': 'CacheService 的快取鍵字串，不是宣告',
}


def declared_consts(extra_src=""):
    names = set()
    # 掃描器自己的常數（TIER_TABLES／ALLOW_RETURN…）也算「代碼裡真的有」——文件會提到它們
    srcs = sorted(glob.glob(os.path.join(ROOT, 'gas', '*.gs')) +
                  glob.glob(os.path.join(ROOT, 'gas', '*.html')) +
                  glob.glob(os.path.join(ROOT, 'check_*.py')) +
                  glob.glob(os.path.join(ROOT, 'check_*.js')))
    for f in srcs:
        s = open(f, encoding='utf-8').read()
        names |= set(re.findall(r'(?:var|const|let|function)\s+([A-Za-z_]\w*)', s))
        # 逗號串宣告 const A = [], B = [];
        for m in re.finditer(r'(?:var|const|let)\s+([^;\n]+)', s):
            names |= set(re.findall(r'([A-Za-z_]\w*)\s*=', m.group(1)))
        names |= set(re.findall(r'\b([A-Za-z_]\w*)\s*:', s))      # 物件鍵（COL 那批）
        names |= set(re.findall(r'\.([A-Za-z_]\w*)\b', s))        # 屬性存取
        names |= set(re.findall(r'(?m)^([A-Z][A-Z0-9_]+)\s*=', s))  # python 常數
    if extra_src:
        names |= set(re.findall(r'(?:var|const|let|function)\s+([A-Za-z_]\w*)', extra_src))
    return names


def scan_consts(names, extra_line=None):
    ghosts, cited = [], 0
    path = os.path.join(ROOT, CONST_DOC)
    lines = open(path, encoding='utf-8').read().split('\n') if os.path.exists(path) else []
    if extra_line:
        lines = lines + [extra_line]
    for i, line in enumerate(lines, 1):
        for n in CONST_CITE.findall(line):
            if n in names or n in CONST_ALLOW:
                continue
            cited += 1
            if ('~~`%s`~~' % n) in line or TOMB.search(line):
                continue
            ghosts.append((CONST_DOC, i, n))
    return cited, ghosts


# 🌹 鑑賞現況區的幽靈掃描（2026-09 新增·玩家「把資料都更新到最新，沒用的備註都砍了」）
#    KANSHOU_REFERENCE.md 是 CLAUDE.md 指名「動鑑賞任何一塊先看這份」的那本，但它一路堆成
#    3600 行的編年史，當場量出 121 個幽靈名字、其中整整 576 行是**用現在式**在講好感/地點/
#    作息那些已經整組砍掉的系統——下一個失憶的我照著它做，會去找根本不存在的東西。
#    ⚠ 為什麼不整份掃：編年史那半本來就滿是已砍東西的名字（「那一輪砍了 X／Y／Z」），
#      全掃會整排誤報，而誤報一次的掃描器會被直接無視，比沒有更糟。
#    所以文件裡插了一條 CURRENT_STATE_END 界線，這道【只掃線以上】——那一半宣稱自己是現況。
CUR_DOC = 'KANSHOU_REFERENCE.md'
CUR_MARK = 'CURRENT_STATE_END'
# 全大寫常數 與 kanshou*/action* 這兩種名字都算點名（舊的常數那道只認全大寫）
CUR_CITE = re.compile(r'`((?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+_?)|(?:kanshou[A-Za-z0-9_]*_?)|(?:action[A-Z][A-Za-z0-9_]*))`')


def scan_current_state(extra_line=None):
    """回傳 (界線行號, 點名數, 幽靈清單)。查無界線＝回 (0,0,[])，不擋。"""
    path = os.path.join(ROOT, CUR_DOC)
    if not os.path.exists(path):
        return 0, 0, []
    lines = open(path, encoding='utf-8').read().split('\n')
    end = next((i for i, l in enumerate(lines) if CUR_MARK in l), None)
    if end is None:
        return 0, 0, []
    head = lines[:end]
    if extra_line:
        head = head + [extra_line]
    code = ""
    # 掃描器自己的常數也算「代碼裡真的有」（MIN_STAR_BLOCKS 那批住在 check_*.py）
    for f in sorted(glob.glob(os.path.join(ROOT, 'gas', '*.gs')) +
                    glob.glob(os.path.join(ROOT, 'gas', '*.html')) +
                    glob.glob(os.path.join(ROOT, 'check_*.py')) +
                    glob.glob(os.path.join(ROOT, 'check_*.js'))):
        code += open(f, encoding='utf-8').read()
    cited, ghosts = 0, []
    for i, line in enumerate(head, 1):
        for n in set(CUR_CITE.findall(line)):
            cited += 1
            if n in code:
                continue
            # 墓碑放行：刪除線，或同一行寫明它已經沒了
            if ('~~`%s`~~' % n) in line or TOMB.search(line):
                continue
            ghosts.append((i, n))
    return end, cited, ghosts


# 🔀 文件表格裡的【action 名字】↔ 路由器（2026-09 新增）
#    既有兩道的盲區：常數那道只認全大寫、函式那道要看到括號——
#    `kanshou_set_pace` 這種小寫底線的路由名，兩道都看不見。
#    當場抓到：FUNCTION_MANUAL 與 AI_PROMPT_MAP 各列著一條時間流速的路由，
#    那個 action 2026-09 就整組砍了；還有一條 court_enemy 其實是【改名】成 parley。
#    ⚠ 這兩份是 CLAUDE.md 指名「要動手前先查」的索引，列著不存在的路由＝直接把人帶到死路。
ACT_DOCS = ['FUNCTION_MANUAL.md', 'AI_PROMPT_MAP.md', 'CODE_MAP.md']
ACT_ROW = re.compile(r'^\|\s*`([a-z][a-z0-9_]{3,})`\s*\|')


def live_actions():
    code = ""
    for f in sorted(glob.glob(os.path.join(ROOT, 'gas', '*.gs'))):
        code += open(f, encoding='utf-8').read()
    names = set(re.findall(r"case\s*['\"]([a-z][a-z0-9_]*)['\"]", code))
    names |= set(re.findall(r"['\"]([a-z][a-z0-9_]{3,})['\"]\s*:\s*action", code))
    return names


# 🗺️ CODE_MAP §4 的 action 總表 ↔ ActionRouter（2026-09 新增）
#    上面那道只認第一格有反引號的列，而這張表是【沒有反引號、左右兩欄並排】的——等於從來沒被驗過。
#    2026-09 整體檢查時一數：路由器 70 條，表上少 19 條（整批鑑賞路由與新聖杯戰爭）、多 3 條早就砍掉的
#    （save_hero／claim_hero／kanshou_set_pace），表頭還寫著 69。這張是「要動手前先查」的地圖，
#    少列＝以為沒有那條路由，多列＝照著走到死路。所以兩個方向都驗，表頭的數字也要對。
MAP_DOC = 'CODE_MAP.md'


def router_actions():
    src = open(os.path.join(ROOT, 'gas', 'Router_Action.gs'), encoding='utf-8').read()
    i = src.find('const ActionRouter')
    body = src[i:src.find('};', i)]
    return set(re.findall(r'^\s*"?([a-z][a-z0-9_]*)"?\s*:\s*\w+', body, re.M))


def scan_map_table(routes, drop=None):
    text = open(os.path.join(ROOT, MAP_DOC), encoding='utf-8').read()
    i = text.find('## §4')
    j = text.find('\n## §', i + 4)
    sec = text[i:j if j > 0 else len(text)]
    listed = set()
    for line in sec.split('\n'):
        if not line.startswith('|'):
            continue
        cells = [c.strip().strip('`') for c in line.strip().strip('|').split('|')]
        for k in (0, 4):
            if k < len(cells) and re.match(r'^[a-z][a-z0-9_]+$', cells[k]) and cells[k] != 'action':
                listed.add(cells[k])
    if drop:
        listed.discard(drop)
    m = re.search(r'## §4 全 (\d+) action', sec)
    head = int(m.group(1)) if m else -1
    return sorted(routes - listed), sorted(listed - routes), head


def scan_actions(acts, extra=None):
    cited, ghosts = 0, []
    for d in ACT_DOCS:
        path = os.path.join(ROOT, d)
        if not os.path.exists(path):
            continue
        lines = open(path, encoding='utf-8').read().split('\n')
        if extra:
            lines = lines + [extra]
        for i, line in enumerate(lines, 1):
            m = ACT_ROW.match(line)
            if not m:
                continue
            cited += 1
            if m.group(1) in acts or TOMB.search(line):
                continue
            ghosts.append((d, i, m.group(1)))
    return cited, ghosts


# 📓 CODE_NOTES 的錨點（### `名字`）——這個形式上面兩道都看不到（沒有括號、也不是全大寫常數）。
#    2026-09 當場清出 14 個指向「代碼全樹 0 次出現」的條目（actionCourtEnemy、OFFENSIVE_NP_ATK_FX_…）。
#    錨點對不上＝那段歷史等於消失（CLAUDE.md 紀律那條講的就是這件事），而且比沒有更誤導。
#    判準刻意用「全樹 0 次」而不是「有沒有宣告」——宣告形式太多種，用出現次數才不會誤報。
NOTES_DOC = 'CODE_NOTES.md'
NOTES_ANCHOR = re.compile(r'(?m)^### `([A-Za-z_$][\w$]*)`')


def scan_notes(extra_line=None):
    path = os.path.join(ROOT, NOTES_DOC)
    if not os.path.exists(path):
        return 0, []
    text = open(path, encoding='utf-8').read()
    if extra_line:
        text += '\n' + extra_line
    src = ''
    for f in (sorted(glob.glob(os.path.join(ROOT, 'gas', '*.gs'))) +
              sorted(glob.glob(os.path.join(ROOT, 'gas', '*.html')))):
        src += open(f, encoding='utf-8').read()
    # ⚠ 2026-09 抓到的盲點：「全樹 0 次出現」把【註解裡的名字】也算進去了。
    #    地點退休那批墓碑註解（「這裡原本住著：KANSHOU_REGIONS_／kanshouLocContextForAI_／…」）
    #    讓 15 個早就砍掉的錨點一直被判成活的。只認【去掉註解之後】還在的名字。
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = '\n'.join(l for l in src.split('\n') if not l.strip().startswith('//'))
    anchors = NOTES_ANCHOR.findall(text)
    return len(anchors), sorted({a for a in anchors if a not in src})


def main():
    names = declared()
    cited, ghosts = scan(names)

    # 🧪 自我退化測試：注入一條指向不存在函式的文件條目，這支必須叫。
    #    不會叫的掃描器比沒有更糟——它給你「已經有防線」的錯覺。
    _, probe = scan(names, {'CLAUDE.md': '- `thisFunctionDoesNotExist_(x)` — 假的'})
    if not any(n == 'thisFunctionDoesNotExist_' for _, _, n in probe):
        print('📚 文件↔代碼：❌ 掃描器自身失效（注入的幽靈條目抓不到）')
        return 1

    cnames = declared_consts()
    c_cited, c_ghosts = scan_consts(cnames)
    if not scan_consts(cnames, '- `THIS_CONST_DOES_NOT_EXIST_`（var）— 假的')[1]:
        print('📚 文件↔代碼：❌ 常數那道失效（注入的幽靈常數抓不到）')
        return 1

    n_anchor, n_ghost = scan_notes()
    if not scan_notes('### `thisAnchorIsGone_`')[1]:
        print('📚 文件↔代碼：❌ CODE_NOTES 那道失效（注入的幽靈錨點抓不到）')
        return 1

    acts = live_actions()
    a_cited, a_ghosts = scan_actions(acts)
    _fakeact = '| `' + 'this_route_is_gone' + '` | `actionNope` | 假的 |'
    if not scan_actions(acts, _fakeact)[1]:
        print('📚 文件↔代碼：❌ action 路由那道失效（注入的死路由抓不到）')
        return 1

    routes = router_actions()
    map_missing, map_ghost, map_head = scan_map_table(routes)
    _one = sorted(routes)[0] if routes else ''
    if not routes or not scan_map_table(routes, _one)[0]:
        print('📚 文件↔代碼：❌ CODE_MAP 路由總表那道失效（拿掉一列抓不到）')
        return 1
    if map_missing or map_ghost or map_head != len(routes):
        print('📚 文件↔代碼：❌ %s §4 的 action 總表跟 ActionRouter 對不上（路由器 %d 條、表頭寫 %d）' % (MAP_DOC, len(routes), map_head))
        if map_missing:
            print('     表上少了：' + '、'.join(map_missing))
        if map_ghost:
            print('     表上多了（路由器裡沒有）：' + '、'.join(map_ghost) + '　→ 先查是不是改名')
        return 1

    cur_end, cur_cited, cur_ghosts = scan_current_state()
    # ⚠ 假名字【拼出來】：這道會去讀 check_*.py，寫成字面量就等於「代碼裡真的有」，
    #   注入測試會自己把自己毒到、然後安靜地過關（2026-09 當場踩到）。
    _fake = '`' + 'kanshou' + 'ThisIsGone_' + '` 與 `' + 'KANSHOU_' + 'GONE_TAG_' + '`'
    if cur_end and not scan_current_state(_fake)[2]:
        print('📚 文件↔代碼：❌ 鑑賞現況區那道失效（注入的幽靈抓不到）')
        return 1

    print('📚 文件↔代碼對照：%d 個函式點名、%d 個常數點名（只查 %s）、%d 個 CODE_NOTES 錨點、鑑賞現況區 %d 行·%d 個點名、路由表 %d 條對照 %d 條 action、CODE_MAP 總表 %d 條全對（含自我退化測試）'
          % (cited, c_cited, CONST_DOC, n_anchor, cur_end, cur_cited, a_cited, len(acts), len(routes)))
    if a_ghosts:
        print('  ❌ 文件的路由表列著路由器不認得的 action：')
        for d, i, n in a_ghosts:
            print('     %s:%d  %s' % (d, i, n))
        print('  → 先查是不是【改名】（court_enemy→parley 就是），是就改名字、別直接砍那一列；')
        print('     真的整組砍了就刪掉那一列，或在同一行寫明它已移除。')
        return 1
    if cur_ghosts:
        print('  ❌ %s 的【現況區】點名了代碼裡已經沒有的東西：' % CUR_DOC)
        for i, n in cur_ghosts:
            print('     %s:%d  %s' % (CUR_DOC, i, n))
        print('  → 現況區宣稱「現在是這樣」，寫著不存在的名字就是在騙下一個失憶的我。')
        print('     真的只是歷史敘述：加刪除線 ~~`X`~~、同行寫明已移除，或整段搬到 %s 界線【以下】。' % CUR_MARK)
        return 1
    if n_ghost:
        print('  ❌ CODE_NOTES 掛著代碼全樹已經找不到的名字：')
        for a in n_ghost:
            print('     ### `%s`' % a)
        print('  → 那段歷史的錨點對不上，等於消失了。砍掉那條，或把錨點改成現在的名字。')
        return 1
    if c_ghosts:
        print('  ❌ 索引裡列著代碼已經沒有的常數：')
        for d, i, n in c_ghosts:
            print('     %s:%d  %s' % (d, i, n))
        print('  → 砍常數時同步改這條；真的只是歷史敘述就加刪除線 ~~`X`~~ 或在同一行寫明它已移除。')
        return 1
    if ghosts:
        print('  ❌ 文件點名了代碼裡已經沒有的函式：')
        for d, i, n in ghosts:
            print('     %s:%d  %s(' % (d, i, n))
        print('  → 函式刪了/改名了就同步改這條（CLAUDE.md：FUNCTION_MANUAL 零容錯）；')
        print('     若它本來就不是函式（常數查表/散文），加進 check_docs.py 的 PROSE。')
        return 1
    print('  ✅ 文件點名的函式代碼裡都還在')
    return 0


if __name__ == '__main__':
    sys.exit(main())
