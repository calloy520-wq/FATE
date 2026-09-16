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
                if n not in names:
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

    print('📚 文件↔代碼對照：%d 個函式點名、%d 個常數點名（只查 %s）、代碼宣告 %d 個名字（含自我退化測試）'
          % (cited, c_cited, CONST_DOC, len(names)))
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
