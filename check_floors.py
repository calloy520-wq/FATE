#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""📉 覆蓋數不得無聲下降：每支掃描器都會印「我檢查了幾個點」，那些數字只准持平或變多。

為什麼要這支：掃描器可以一邊印綠燈、一邊悄悄少看一半。實際踩過兩次——
  ① `check_wait` 是往上 30 行找等待指示，`chooseWorld` 的預取本來是靠鄰居的標記
     剛好落在視窗內才過的；插兩行就穿幫（也就是說，在那之前它根本沒真的檢查到那一點）。
  ② `check_prompt` 的 ★ 區塊 regex 只認 `★【…】`，寫成 `★寶具名【…】` 的一個都不算。
兩個的共同形狀是【覆蓋悄悄變少，而輸出仍是綠的】。`check_wiring` 早就對 ★ 區塊做了
MIN_STAR_BLOCKS「不得下降」，這支把那一招推廣到每一支掃描器。

做法刻意笨：不改那 18 支，只吃它們【已經在印】的輸出。把每一行的整數抓出來當指紋，
跟 check_floors.json 的基線比；任何一格變小就叫。數字合理長大時跑 `--bless` 收下新基線。
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.join(ROOT, 'check_floors.json')
# 只收「某某掃描器的抬頭行」——那一行才寫著它檢查了幾個點。抬頭一律是「圖示 名稱：…數字…」
HEAD = re.compile(r'^(\S*\s*[一-鿿][^：:]{1,24})[：:](.*\d.*)$')
NUM = re.compile(r'\d+')
# 這些數字天天變、不是覆蓋率（時間、版本、百分比…）。
# ⚠ 自己那一行一定要排掉：check.sh 是把【這支跑之前】的輸出餵進來的，log 裡本來就沒有自己；
#   但用管線收基線時（bash check.sh | check_floors.py --bless）自己那行會混進去，
#   下一次正式跑就變成「抬頭不見了」。踩過一次。
SKIP_KEYS = {'📉 覆蓋數不得無聲下降', '📉 覆蓋數'}


def collect(text):
    """從 check.sh 的輸出抓出 {抬頭: [數字…]}。"""
    out = {}
    for line in text.split('\n'):
        line = line.rstrip()
        if not line or line.startswith(' ') or line.startswith('\t'):
            continue  # 縮排的是結論行（✅/❌/明細），不是抬頭
        m = HEAD.match(line)
        if not m:
            continue
        key = m.group(1).strip()
        if key in SKIP_KEYS:
            continue
        nums = [int(n) for n in NUM.findall(m.group(2))]
        if nums:
            out[key] = nums
    return out


def main():
    bless = '--bless' in sys.argv
    src = None
    if not sys.stdin.isatty():
        src = sys.stdin.read()
    if not src:
        src = subprocess.run(['bash', os.path.join(ROOT, 'check.sh')],
                             capture_output=True, text=True).stdout
    now = collect(src)
    if not now:
        print('📉 覆蓋數：❌ 一行抬頭都沒抓到——check.sh 的輸出格式變了，這支等於沒在檢查')
        return 1

    base = {}
    if os.path.exists(STORE):
        try:
            base = json.load(open(STORE, encoding='utf-8'))
        except Exception:
            base = {}

    if bless or not base:
        json.dump(now, open(STORE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
        print('📉 覆蓋數：已收下基線（%d 支掃描器、%d 個數字）' % (len(now), sum(len(v) for v in now.values())))
        return 0

    drops, gone = [], []
    for k, old in base.items():
        if k not in now:
            gone.append(k)
            continue
        cur = now[k]
        for i, o in enumerate(old):
            if i < len(cur) and cur[i] < o:
                drops.append((k, i + 1, o, cur[i]))
        if len(cur) < len(old):
            drops.append((k, 0, len(old), len(cur)))

    print('📉 覆蓋數不得無聲下降：比對 %d 支掃描器、%d 個數字'
          % (len(base), sum(len(v) for v in base.values())))
    if gone:
        print('  ❌ 這些掃描器的抬頭不見了（被砍掉？改格式？）：')
        for k in gone:
            print('     %s' % k)
    if drops:
        print('  ❌ 檢查到的點變少了（掃描器還是綠的，但它少看了東西）：')
        for k, i, o, c in drops:
            print('     %s　第 %s 個數字 %d → %d' % (k, i or '?', o, c))
    if gone or drops:
        print('  → 真的是代碼變少（砍功能）造成的，跑 `python3 check_floors.py --bless` 收下新基線；')
        print('     否則就是掃描器悄悄漏看了——先查它為什麼少看。')
        return 1
    print('  ✅ 每支掃描器檢查到的點都沒有變少')
    return 0


if __name__ == '__main__':
    sys.exit(main())
