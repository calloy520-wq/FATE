#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""🧩 ctx 參數物件：函式讀了 ctx.X，呼叫端就必須給 X。

2026-09 拆 actionPlay_（705 行）時當場踩到：把「AI 回報的狀態落盤」那段搬進
kanshouApplyIntimacyFeedback_(ctx) 之後漏傳 curL，於是每位在場者的比對都拿 undefined 去比，
整段回寫靜靜失效——而它住在 actionPlay_ 的 try/catch 裡，【連例外都不會冒出來】。
check.sh 全綠、部署會成功、玩家只會覺得「AI 寫的關係稱呼怎麼都沒存到」。

盯的是【結構】：函式體裡出現 `ctx.X` 就把 X 記下來，再找所有 `函式名({ … })` 的呼叫端，
逐一比對鍵有沒有齊。只認字面物件的呼叫端（傳變數進去的無從靜態比對，略過不報）。
"""
import os, re, sys, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
GAS = os.path.join(ROOT, 'gas')


def brace_body(src, start):
    i = src.index('{', start); d = 0; k = i
    while k < len(src):
        if src[k] == '{': d += 1
        elif src[k] == '}':
            d -= 1
            if d == 0: return src[i:k + 1]
        k += 1
    return src[i:]


def paren_arg(src, start):
    i = src.index('(', start); d = 0; k = i
    while k < len(src):
        if src[k] == '(': d += 1
        elif src[k] == ')':
            d -= 1
            if d == 0: return src[i + 1:k]
        k += 1
    return ''


def scan(files):
    fns, n_call = {}, 0
    bad = []
    srcs = {p: open(p, encoding='utf-8').read() for p in files}
    # ① 收「吃 ctx 的函式」與它讀了哪些鍵
    for p, s in srcs.items():
        for m in re.finditer(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*ctx\s*\)', s):
            body = brace_body(s, m.end())
            body_nc = re.sub(r'//[^\n]*', '', body)
            keys = set(re.findall(r'\bctx\.([A-Za-z_$][\w$]*)', body_nc))
            if keys: fns[m.group(1)] = keys
    # ② 逐個呼叫端比對
    for name, keys in fns.items():
        for p, s in srcs.items():
            for m in re.finditer(r'\b' + re.escape(name) + r'\s*\(\s*\{', s):
                arg = paren_arg(s, m.end() - 2 if s[m.end() - 1] == '{' else m.end())
                if not arg.lstrip().startswith('{'):
                    continue
                n_call += 1
                given = set(re.findall(r'(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:', arg))
                miss = sorted(keys - given)
                if miss:
                    bad.append('%s：呼叫端沒給 %s（函式裡讀得到 ctx.%s，拿到的是 undefined）'
                               % (name, '／'.join(miss), miss[0]))
    return fns, n_call, bad


def main():
    files = sorted(glob.glob(os.path.join(GAS, '*.gs')))
    fns, n_call, bad = scan(files)

    # 🧪 自我退化測試：注入一個漏傳鍵的呼叫端，這支必須叫。
    import tempfile
    with tempfile.NamedTemporaryFile('w', suffix='.gs', dir=GAS, delete=False, encoding='utf-8') as f:
        f.write('function _probeCtx_(ctx) { return ctx.alpha + ctx.beta; }\n'
                '_probeCtx_({ alpha: 1 });\n')
        inj = f.name
    try:
        _, _, probe = scan([inj])
    finally:
        os.unlink(inj)
    if not probe:
        print('🧩 ctx 參數物件：❌ 掃描器自身失效（注入的漏傳鍵抓不到）')
        return 1

    print('🧩 ctx 參數物件：吃 ctx 的函式 %d 支、字面呼叫端 %d 處（含自我退化測試）' % (len(fns), n_call))
    if bad:
        print('  ❌ %d 處漏傳：' % len(bad))
        for b in bad:
            print('     ' + b)
        print('  → 漏傳的鍵在函式裡是 undefined，而這種函式多半住在 try/catch 裡：')
        print('     不會拋例外、不會有錯誤訊息，那一段就只是靜靜不做事。')
        return 1
    print('  ✅ 每支 ctx 函式要的鍵，呼叫端都給了')
    return 0


if __name__ == '__main__':
    sys.exit(main())
