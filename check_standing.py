#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""🎬 每回合都送的提示詞不可以有【無條件常駐指令】。

2026-09 玩家抓到：「讓它們互相拉扯…? 這不用提示吧，他會一直拉扯，很怪。
有沒有類似的怪怪提示詞請修正——因為這是每次都會給 AI 所以要避免固化。」

形狀跟種子那邊已經退休的「背脊永遠打得筆直」一模一樣：一句沒有條件的指令，
每回合都送給模型，它就每回合都照做，角色從此只會做那一個動作。
（同一批抓到的還有★【誰在場】的「每一位都要有反應」——五個人同場就變成點名輪流。）

判準：每回合都進提示詞的那幾段，禁止出現「一定會發生」的詞。
真的必須無條件的（格式類，如分段規則）登記進 ALLOW 並寫明理由。
⚠ 只掃【每回合都送】的那幾段——一次性的創角提示詞不在此列，那裡說死是對的。
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
GAS = os.path.join(ROOT, 'gas')

# 「這件事一定會發生」的詞。條件句用的「…時／…就／才／碰到／遇到」不在此列。
STANDING = ['永遠', '總是', '一律', '每次', '每回合', '都要', '不停', '每一位', '無時無刻']

ALLOW = {
    # 出現在段落裡的片段 → 為什麼它可以無條件
    '每3~4句': '排版格式，本來就該每回合一樣',
    '同一個人跨回合都用同一個名字': '稱謂一致性，這正是要它固定的東西',
    '所有輸出內容一律用中文字': '語言鐵律，是格式不是演出指示',
    '才會永遠留在這座城裡': '在講世界帳本這個機制的事實（寫進去就會留著），不是叫 AI 每回合做什麼',
}


def blocks(src):
    """每回合都送的兩處：鑑賞風格模組的預設值、對話格式規則。"""
    out = []
    m = re.search(r'var KANSHOU_STYLE_MODULES_ = \[([\s\S]*?)\n\];', src)
    if m:
        for d in re.finditer(r"def:\s*'((?:[^'\\]|\\.)*)'", m.group(1)):
            out.append(('風格模組 def', d.group(1)))
    m2 = re.search(r'function dialogueFormatRule_\(\)\s*\{([\s\S]*?)\n\}', src)
    if m2:
        for d in re.finditer(r'`([^`]*)`', m2.group(1)):
            out.append(('對話格式', d.group(1)))
    # actionPlay 每回合組的 ★ 區塊（樣板字串裡以 ★/🚨/🛑 起頭的整句）
    for d in re.finditer(r'[★🚨🛑]【[^】]{1,12}】[^\n`]{0,300}', src):
        out.append(('每回合的★區塊', d.group(0)))
    return out


def scan(src):
    bad, n = [], 0
    for where, text in blocks(src):
        n += 1
        for w in STANDING:
            if w not in text:
                continue
            if any(a in text for a in ALLOW):
                continue
            i = text.index(w)
            bad.append('%s 出現「%s」：…%s…' % (where, w, text[max(0, i - 18):i + 22]))
    return n, bad


def main():
    src = open(os.path.join(GAS, 'Gallery.gs'), encoding='utf-8').read()
    n, bad = scan(src)

    # 🧪 自我退化測試：注入一條無條件常駐指令，這支必須叫。
    _, probe = scan("var KANSHOU_STYLE_MODULES_ = [\n"
                    "  { key: 'x', def: '她永遠把背脊打得筆直。' },\n];\n")
    if not probe:
        print('🎬 常駐指令：❌ 掃描器自身失效（注入的「永遠」抓不到）')
        return 1

    print('🎬 每回合都送的提示詞：掃 %d 段、豁免 %d 條（含自我退化測試）' % (n, len(ALLOW)))
    if bad:
        print('  ❌ %d 處無條件常駐指令：' % len(bad))
        for b in bad:
            print('     ' + b)
        print('  → 每回合都送的話模型就每回合都照做，角色會固化成只會那一個動作')
        print('     （玩家原話：「他會一直拉扯，很怪…這是每次都會給 AI 所以要避免固化」）。')
        print('     改成有條件的寫法（…的時候／碰到…就／真的…才），或登記進 ALLOW 並寫明理由。')
        return 1
    print('  ✅ 每一條都有條件，不會每回合硬演')
    return 0


if __name__ == '__main__':
    sys.exit(main())
