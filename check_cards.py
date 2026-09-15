#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""performanceNote_ 點名了誰，就必須有誰的卡。

踩過的坑（2026-09 稽核抓到三處）：
  ‧ 羈絆·突襲分支只給敵方卡，卻在 performanceNote_ 點名我方從者「依真名與性格演出」
  ‧ 令咒·治療／脫離連御主與從者的卡都沒有，只有一句「描寫令咒在手背灼亮」
這比單純缺漏更糟——提示詞看起來很完整，AI 只能憑空捏造性格，
而它捏出來的東西會被玩家當成角色設定。

判準：從呼叫點往回掃到【本分支的起點】為止（三元的 ? / :、指派、return、函式開頭），
這一段裡要出現任一張卡的建構器。⚠ 不能用「往前 N 行」的視窗——ternary 的兩個分支緊鄰，
視窗會抓到隔壁分支的卡而永遠綠燈（第一版就是這樣，注入退化測不出來才發現）。
"""
import re, sys, glob

CARD = re.compile(r'servantCard_\(|masterCard_\(|enemyMasterCard_\(|foeCard|Card_\(|CardStr')
CALL = re.compile(r'performanceNote_\(')
ALLOW = {
    ('gas/Router_Persona.gs', 'servantCard_ 自己的收尾註記，本來就長在卡裡面'),
}
ALLOW_FILES = {f for f, _ in ALLOW}

bad = []
total = 0
for f in sorted(glob.glob('gas/*.gs')):
    lines = open(f, encoding='utf-8').read().split('\n')
    for i, line in enumerate(lines):
        if not CALL.search(line) or 'function performanceNote_' in line:
            continue
        total += 1
        # 往回掃到本分支起點：三元的 ?/:、指派、return、或函式開頭
        j = i
        while j > 0:
            st = lines[j].strip()
            if re.match(r'^[?:]|^return\b|^(?:const|let|var)\s|=\s*$|^\}', st):
                break
            j -= 1
        branch = '\n'.join(lines[j:i + 1])
        if CARD.search(branch):
            continue
        if f in ALLOW_FILES:
            continue
        bad.append((f, i + 1, line.strip()[:90]))

print(f'🎭 點名↔角色卡：{total} 個 performanceNote_ 呼叫點、{len(ALLOW)} 條豁免')
if not bad:
    print('  ✅ 每個點名都有對應的卡')
    sys.exit(0)
print(f'  ❌ {len(bad)} 處點名卻沒給卡')
for f, l, t in bad:
    print(f'     {f}:{l}  {t}')
print('  點名是承諾：沒有卡＝叫 AI 憑空捏造性格，而玩家會把那當成角色設定。')
sys.exit(1)
