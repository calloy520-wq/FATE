#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""🔒 扣了資源，節流戳記就必須在同一刻落地。

2026-09 稽核抓到的真 bug：`actionAllyBond` 先扣 AP，中間的卸防突襲分支會提早 `return`，
而「今天已跟這位盟友相處過」的戳記寫在函式尾端——被突襲時戳記根本沒落地。
結果是同一天同一個盟友可以無限重按（AP 照扣、回合照用，只是限制消失）。

失敗的形狀：**扣款 → 中途 return → 戳記**。三者順序一旦變成這樣，那條 return 就是漏洞，
而且完全靜默：沒有錯誤訊息、探針不特意測也看不到、`node --check` 當然更看不到。

判準：凡是「這一回合已經用掉」性質的節流標記，都要跟扣款黏在一起，
不可以放在任何可能提早 return 的分支後面。

⚠ 這支刻意只看【扣款之後】的 return——扣款【之前】的 return 全是「不夠／不符合條件」的
   正常拒絕路徑，那時候還沒付錢，本來就不該蓋戳。
"""
import re, sys, os, glob

ROOT = os.path.dirname(os.path.abspath(__file__))

# 扣掉「這一回合的錢」：AP 是唯一的回合貨幣
SPEND = re.compile(r'\b(chargeApOrReject_|spendAp_)\s*\(')
# 節流戳記的寫入（以「日」為單位的一次性標記）
STAMP = re.compile(r'(\b\w*_DAY_TAG_\.set\(|\bsetBondUsedToday_\s*\(|【[^】]*日】)')
RET = re.compile(r'\breturn\s+JSON\.stringify')

# 刻意豁免：{函式名: 理由}
ALLOW = {}


def scan(extra_src=None):
    """回傳 (檢查過的函式數, 有戳記的函式數, 命中的漏洞)"""
    files = [(f, open(f, encoding='utf-8').read()) for f in sorted(glob.glob(os.path.join(ROOT, 'gas/*.gs')))]
    if extra_src:
        files.append(('<自我退化測試>', extra_src))
    checked = stamped = 0
    bad = []
    for path, src in files:
        lines = src.split('\n')
        heads = [i for i, l in enumerate(lines) if re.match(r'^function\s+\w+', l)]
        heads.append(len(lines))
        for a, b in zip(heads, heads[1:]):
            name = re.match(r'^function\s+(\w+)', lines[a]).group(1)
            body = lines[a:b]
            spends = [i for i, l in enumerate(body) if SPEND.search(l)]
            if not spends:
                continue
            checked += 1
            # 戳記的「寫入」——只認真的有在賦值/呼叫 set 的那幾行，讀取(match/get)不算
            stamps = [i for i, l in enumerate(body)
                      if STAMP.search(l) and ('=' in l or '.set(' in l)
                      and not re.search(r'\.(match|get|test|indexOf)\(', l)]
            if not stamps:
                continue
            stamped += 1
            if name in ALLOW:
                continue
            rets = [i for i, l in enumerate(body) if RET.search(l)]
            first_spend = spends[0]
            for s in stamps:
                mid = [r for r in rets if first_spend < r < s]
                if mid:
                    bad.append((os.path.basename(path), name, a + first_spend + 1,
                                a + s + 1, [a + r + 1 for r in mid]))
                    break
    return checked, stamped, bad


checked, stamped, bad = scan()

# 🔁 自我退化測試：把當初那個形狀原樣塞回去，這支掃描器必須叫得出來
_probe = '''
function actionSelfDegradeProbe_(userData, pcId, sheets) {
  const apr = chargeApOrReject_(gid, 1, pcData, sheets, "行動力不夠", { isFate: true });
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, gid, 1.3, svIdx);
  if (ambush) {
    return JSON.stringify({ success: true, ambush: true });
  }
  pcData[aIdx][COL.PC.MEMORY] = SOME_DAY_TAG_.set(pcData[aIdx][COL.PC.MEMORY], day);
  return JSON.stringify({ success: true });
}
'''
if not scan(_probe)[2]:
    print('❌ 自我退化測試失敗：把當初那個 bug 原樣塞回去它也不叫，這支掃描器等於沒有')
    sys.exit(1)

print('🔒 節流戳記落地：會扣 AP 的 %d 支、其中帶日限戳記的 %d 支、豁免 %d 條（含自我退化測試）'
      % (checked, stamped, len(ALLOW)))
if bad:
    print('  ❌ 扣了 AP 之後、蓋戳之前有提早 return——走那條路就能無限重按：')
    for f, name, sp, st, mid in bad:
        print('     %s  %s：扣款 L%d ／ 戳記 L%d ／ 中間的 return L%s'
              % (f, name, sp, st, '、L'.join(map(str, mid))))
    print('  → 把戳記搬到緊接著扣款之後（扣了錢就代表這回合已經用掉），或把理由登記進 ALLOW。')
    sys.exit(1)
print('  ✅ 扣了 AP 的動作，日限戳記都在提早 return 之前就落地')
