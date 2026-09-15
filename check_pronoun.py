#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""提示詞裡寫死的性別代名詞掃描。

踩過的坑：整個提示詞層預設「御主是男、從者/同伴是女」，但兩邊都是資料決定的——
鑑賞支援 女玩家×男同伴（種子英靈 25 人裡 12 男），solo 有 3 位女性御主且玩家御主性別可選。
實測一份提示詞裡「她」×16「他」×5，而那 5 個「他」全指向女性玩家——兩邊同時指錯人。

判準：會進提示詞的字串字面裡，出現裸的「她」或「他」就算命中。
  ‧ ${...} 內是算出來的（走 pron_()），不算
  ‧ 複合詞（他人/其他/他們/他者…）不是代名詞，不算
  ‧ Seed_Codex.gs 是逐角色資料、性別已知，寫死是正確的，整檔不掃
命中就修：角色的 row 在手上就用 pron_(row[COL.PC.SEX])，泛指就改中性寫法（對方／那個人／要走的人）。
真的已經分好性別的分支寫進 ALLOW，附理由。
"""
import re, sys, glob

SKIP_FILES = {'gas/Seed_Codex.gs'}
COMPOUND = r'(?:他人|他處|他方|他鄉|他者|其他|其它|他們|她們|她/他|他/她)'
# 真正已知性別、寫死是對的
ALLOW = {
    ('gas/Router_Persona.gs', '進入她'):
        '在 mSex==="女" && sSex==="女" 的分支內，雙方性別都已確定',
    ('gas/Core_Settings.gs', "'男': '他', '女': '她'"):
        'PRONOUN_ 對照表本體，這是代名詞的單一真實來源',
}

def scan():
    hits = []
    for f in sorted(glob.glob('gas/*.gs')):
        if f in SKIP_FILES:
            continue
        for i, line in enumerate(open(f, encoding='utf-8').read().split('\n'), 1):
            st = line.strip()
            if st.startswith('//') or st.startswith('*'):
                continue
            for m in re.finditer(r'`([^`]*)`|"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\'', line):
                lit = m.group(1) or m.group(2) or m.group(3) or ''
                if not re.search(r'[她他]', lit):
                    continue
                if any(k[0] == f and k[1] in line for k in ALLOW):
                    continue
                bare = re.sub(r'\$\{[^}]*\}', '', lit)
                bare = re.sub(COMPOUND, '', bare)
                for pm in re.finditer(r'[她他]', bare):
                    ctx = bare[max(0, pm.start() - 24):pm.start() + 24].replace('\n', ' ')
                    hits.append((f, i, pm.group(), ctx))
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
