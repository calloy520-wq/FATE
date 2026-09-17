#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""提示詞裡寫死的性別代名詞掃描。

踩過的坑：整個提示詞層預設「御主是男、從者/同伴是女」，但兩邊都是資料決定的——
鑑賞支援 女玩家×男同伴（種子英靈 25 人裡 12 男），solo 有 3 位女性御主且玩家御主性別可選。
實測一份提示詞裡「她」×16「他」×5，而那 5 個「他」全指向女性玩家——兩邊同時指錯人。

判準：會進提示詞的字串字面裡，出現裸的「她」或「他」就算命中。
  ‧ ${...} 內是算出來的（走 pron_()），不算
  ‧ 複合詞（他人/其他/他們/他者…）不是代名詞，不算
  ‧ 註解不算（註解不會進提示詞）
  ‧ Seed_Codex.gs 是逐角色資料、性別已知，寫死是正確的，整檔不掃
命中就修：角色的 row 在手上就用 pron_(row[COL.PC.SEX])，泛指就改中性寫法（對方／那個人／要走的人）。
真的已經分好性別的分支寫進 ALLOW，附理由。

⚠ 2026-09 修掉一個【讓這支掃描器一直在說謊】的盲點：舊版是【逐行】用正規表達式找字串字面，
   所以只看得到單行字串——而這個專案幾乎【所有】提示詞本體都住在跨好幾十行的樣板字串(`...`)裡，
   那裡面寫死「她/他」它一個都抓不到。實測：把「★【退化測試】她一定會這樣做。」塞進 nsfwBaseRules
   附近的多行樣板，掃描器照樣回報 ✅。改成走一次真正的 tokenizer(逐字元分辨 程式碼/註解/三種字串/
   正規表達式字面)，字串區間跨不跨行都看得到。
   ⚠ 正規表達式字面【必須】單獨處理：repo 裡真的有 /[<>&"'`｜【】...]/ 這種內含引號與反引號的樣式，
   不認得它的 tokenizer 會從那裡開始把整份檔案的引號配對全部算錯。
"""
import re, sys, glob

SKIP_FILES = {'gas/Seed_Codex.gs'}
COMPOUND = r'(?:他人|他處|他方|他鄉|他者|其他|其它|他們|她們)'
# 真正已知性別、寫死是對的
ALLOW = {
    ('gas/Router_Persona.gs', '進入她'):
        '在 mSex==="女" && sSex==="女" 的分支內，雙方性別都已確定',
    ('gas/Core_Settings.gs', "'男': '他', '女': '她'"):
        'PRONOUN_ 對照表本體，這是代名詞的單一真實來源',
    ('gas/Router_Narrative.gs', '大河用她一貫誇張的方式'):
        '藤村大河是具名正典角色、性別確定，同一句裡就指名道姓',
}

PREV_RE_OK = re.compile(r'[A-Za-z0-9_$\)\]]$')   # 這些字元之後的 / 是除法，不是正規表達式


def string_spans(src):
    """走一次原始碼，回傳所有【字串字面】的 (起始offset, 內容) —— 跨行的樣板字串也算。

    同時負責跳過：註解、正規表達式字面、以及樣板字串裡的 ${...}（那些是算出來的）。
    """
    spans, i, n = [], 0, len(src)   # 每個 span = (起始offset, 內容, 內容每個字元的原始offset)
    prev = ''   # 最近一個非空白字元，用來判斷 / 是除法還是正規表達式
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            while i < n and src[i] != '\n':
                i += 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            i = src.find('*/', i + 2)
            i = n if i < 0 else i + 2
            continue
        if c == '/' and not PREV_RE_OK.search(prev):
            j, cls = i + 1, False           # 正規表達式字面：整段跳過，不當字串
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '[':
                    cls = True
                elif src[j] == ']':
                    cls = False
                elif src[j] == '/' and not cls:
                    break
                elif src[j] == '\n':
                    break
                j += 1
            i = j + 1
            prev = '/'
            continue
        if c in '"\'`':
            q, j, buf, offs = c, i + 1, [], []
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    break
                if q != '`' and src[j] == '\n':
                    break                    # 單引號/雙引號不跨行：沒收尾就當它結束
                if q == '`' and src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    depth, j = 1, j + 2      # ${...} 是算出來的，整段跳過
                    while j < n and depth:
                        if src[j] == '{':
                            depth += 1
                        elif src[j] == '}':
                            depth -= 1
                        j += 1
                    continue
                buf.append(src[j]); offs.append(j)
                j += 1
            spans.append((i, ''.join(buf), offs))
            i = j + 1
            prev = q
            continue
        if not c.isspace():
            prev = c
        i += 1
    return spans


def scan():
    hits = []
    for f in sorted(glob.glob('gas/*.gs')):
        if f in SKIP_FILES:
            continue
        src = open(f, encoding='utf-8').read()
        starts = [0]
        for ch in src:
            starts.append(starts[-1] + (1 if ch == '\n' else 0))
        lines = src.split('\n')
        for off, lit, offs in string_spans(src):
            if not re.search(r'[她他]', lit):
                continue
            # 複合詞(他人/其他/…)不是代名詞：抹成同長度的空白，offs 才不會跟著位移
            bare = re.sub(COMPOUND, lambda m: ' ' * len(m.group()), lit)
            for pm in re.finditer(r'[她他]', bare):
                # ⚠ 報【命中那一行】，不是字串開頭那一行——樣板字串動輒橫跨數十行，
                #    報開頭等於叫人自己去整段裡找。ALLOW 也比對字串內容(跨行的豁免才對得上)。
                line = starts[offs[pm.start()]] + 1
                raw_line = lines[line - 1]
                if any(k[0] == f and (k[1] in raw_line or k[1] in lit) for k in ALLOW):
                    continue
                ctx = bare[max(0, pm.start() - 24):pm.start() + 24].replace('\n', ' ')
                hits.append((f, line, pm.group(), ctx))
    return hits


hits = scan()
print(f'⚧ 提示詞代名詞：掃 {len(glob.glob("gas/*.gs")) - len(SKIP_FILES)} 檔、{len(ALLOW)} 條已知性別豁免')
if not hits:
    print('  ✅ 沒有寫死的性別代名詞')
    sys.exit(0)
print(f'  ❌ {len(hits)} 處寫死')
for f, i, p, c in hits[:40]:
    print(f'     {f}:{i} [{p}] …{c}…')
print('  角色 row 在手上就用 pron_(row[COL.PC.SEX])；泛指改中性寫法；已分好性別的分支寫進 ALLOW 附理由。')
sys.exit(1)
