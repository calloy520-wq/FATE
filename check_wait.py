#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""⏳ 每一個玩家按下去要等的動作，都必須看得見它在跑。

玩家講過兩次同一件事：
  「可以刪除 但是可以有等待的畫面嗎 輸入名字後 就消失了 不知道有沒有在執行」
  「如果需要玩家等待的地方 都加上一個等待畫面 不要只是背景執行！」
這個壞法沒有任何錯誤訊息——按鈕按下去、視窗關掉、畫面靜止一兩秒，玩家只會以為沒按到，
於是再按一次。所以把它改成機器擋：**每個 gasRun() 呼叫點，往上找不到等待指示就叫。**

放行的只有兩類，而且要逐支列在 BACKGROUND 裡寫清楚理由：
  ① 樂觀更新——畫面【已經】先反映結果了，玩家沒有在等（出力轉盤）。
  ② 背景同步——不是玩家按出來的，玩家也沒在等它（sync、動作完成後的清單重抓）。
真的必須非阻塞又要讓玩家知道還在跑的（補生成敘事欄），用 bgHint_() 那顆小提示，不是留白。
"""
import re, sys, os

ROOT = os.path.dirname(os.path.abspath(__file__))
FILES = ['gas/Script.html', 'gas/Script_Kanshou.html', 'gas/Script_Onboarding.html']

# 看得見的等待指示：全螢幕遮罩／面板讀條／非阻塞小提示／行內「…中」字樣＋按鈕鎖
WAIT = re.compile(
    r'beginAction\(|showProcessing\(|withProcessing_\(|_showOverlayLoading_\(|_kmShowLoading_\('
    r'|kmSpinner_\(|bgHint_\(|loaderCaptions'
    r'|中\.\.\.|中…|中……')

# 允許沒有等待畫面的呼叫點：{函式名: 理由}
BACKGROUND = {
    'manaSetOutput':      '樂觀更新：openManaPanel() 當場重畫新檔位，玩家看到的就是結果',
    'ksPick_':            '樂觀更新：篇幅檔位按下去就重畫成選中的那顆，玩家看到的就是結果（下一回合才吃到）',
    'setServantOutput':   '樂觀更新：轉盤當場改外觀，失敗才 alert＋syncData 校正',
    'syncData':           '背景同步：不是玩家按出來的，且多半吃 __pendingState 不發網路',
    'refreshFateTags':    '背景標籤刷新：呼叫端多半已帶 prefetched，且都在別人的遮罩底下',
    'kcRefreshPartyOnly_': '背景局部刷新：跟在已經有回饋的動作後面',
    'renderMapPane':      '地圖重繪：只有無快取那一支發網路，該支自己包了遮罩',
    'kcRefreshAfterPromise_': '背景局部刷新：約定有變動時重抓同伴清單，玩家正在讀剛出爐的敘述',
    'setWarFromSelect_': '背景預取：換場次時先抓該場的正典御主名單，玩家還在打名字、沒有在等它（切下拉選單當場就變，沒有靜止的畫面）',
}

# 等待畫面【畫在原地】、沒走共用 helper 的（這些比蓋一張全螢幕遮罩更好，所以不強迫它們改）
INPLACE = {
    'runTigerDojo_': '道場畫面就地顯示「藤村老師正在翻你的戰報……」＋鎖住「下一步」鈕',
    'rollFate':      '測定卡片框就地顯示「正在測定…」＋_fateRolling 擋連點',
}

CALL = re.compile(r'\bgasRun\s*\(')
FUNC = re.compile(r'(?:async\s+)?function\s+([A-Za-z_$][\w$]*)')


def scan(extra=None):
    """回傳 (檢查過的呼叫點數, [(檔, 行, 函式, 原始行)])。extra=(檔名, 追加的原始碼) 供退化測試。"""
    bad, n = [], 0
    for f in FILES:
        src = open(os.path.join(ROOT, f), encoding='utf-8').read()
        if extra and extra[0] == f:
            src += '\n' + extra[1]
        lines = src.split('\n')
        for i, line in enumerate(lines):
            if not CALL.search(line):
                continue
            if 'function gasRun' in line or line.strip().startswith('//'):
                continue
            n += 1
            fn = ''
            for j in range(i, max(0, i - 120), -1):
                m = FUNC.search(lines[j])
                if m:
                    fn = m.group(1)
                    break
            if fn in BACKGROUND or fn in INPLACE:
                continue
            # 往上 30 行(夠含括同一支 handler 的前置)找看得見的等待指示
            if WAIT.search('\n'.join(lines[max(0, i - 30):i + 1])):
                continue
            bad.append((f, i + 1, fn, line.strip()[:70]))
    return n, bad


def main():
    n, bad = scan()

    # 🧪 自我退化測試：塞一顆沒有等待畫面的 gasRun 進去，這支必須叫。
    _, probe = scan(('gas/Script.html',
                     'async function __waitProbe_() { const r = await gasRun({ action: "x" }); return r; }'))
    if not any(fn == '__waitProbe_' for _, _, fn, _ in probe):
        print('⏳ 等待畫面：❌ 掃描器自身失效（注入的無指示呼叫抓不到）')
        return 1

    print('⏳ 等待畫面：掃 %d 個 gasRun 呼叫點、%d 支不需等待畫面、%d 支就地顯示（含自我退化測試）'
          % (n, len(BACKGROUND), len(INPLACE)))
    if bad:
        print('  ❌ 這些地方玩家會按下去然後看著靜止的畫面：')
        for f, ln, fn, src in bad:
            print('     %s:%d  %s()  %s' % (f, ln, fn or '(頂層)', src))
        print('  → 玩家在等 → 包一層 withProcessing_(\'…中…\', () => gasRun(...))；')
        print('     玩家不必等但別留白 → bgHint_(\'…\')；真的是樂觀更新/背景同步 → 加進 BACKGROUND 並寫理由。')
        return 1
    print('  ✅ 每個要等的動作都看得見')
    return 0


if __name__ == '__main__':
    sys.exit(main())
