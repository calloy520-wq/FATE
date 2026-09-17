#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🌱 種子庫不變式 — 「設定寫了，但沒有任何東西吃它」的四種形狀，一次擋掉。

這三件事都是零錯誤訊息的：寫了設定、綠燈、部署成功，玩家看到一個做不到事情的技能，
或者一個永遠抽不到的角色，而沒有任何人會發現。2026-09 稽核當場各抓到一個。

① 幽靈 fx：種子給了技能 fx，引擎卻完全沒提過那個字串（美狄亞的「金羊毛 Argon Coin EX」
   長年掛在她身上、引擎零接線、前端也沒有說明——玩家看得到，按了什麼都不會發生）。
② 死欄位：種子寫進試算表的欄位，全樹沒有任何讀取端（御主殿的「居所」「屆次」）。
   ⚠ COL 是位置索引，欄位本身【不刪】(刪了整表位移)——所以刻意棄用的登記進 DEAD_COL_ALLOW。
③ 同一列存兩份：daily 四欄各有專欄，PERSONA JSON 不可以再收一份（單一真實來源）。
④ 抽不到的種子：既不在 solo 對戰池、也不在鑑賞的召喚/巧遇/起手任一池——整筆設定沒有出口。
"""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
GAS = os.path.join(ROOT, 'gas')
SEED = os.path.join(GAS, 'Seed_Codex.gs')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def gas_files(exclude=()):
    return [os.path.join(GAS, f) for f in sorted(os.listdir(GAS))
            if f.endswith(('.gs', '.html')) and f not in exclude]


# 刻意棄用但欄位保留的（COL 是位置索引，寧棄用不刪欄）。加一條要寫清楚理由。
DEAD_COL_ALLOW = {
    'MASTER.HOME': '2026-09 稽核：全樹零讀取，種子已不再供值；欄位保留因 COL 是位置索引',
    'MASTER.WAR': '2026-09 稽核：全樹零讀取（屆次靠從者的 WARS 欄判定），種子已不再供值',
    'PC.MAX_MP': '出力電池制後從者無自有魔力池，欄位留著不刪',
    'PC.MONEY': '經濟層整組砍除（CLAUDE.md 現況鐵則：兩軌皆無經濟/生活層），欄位留著不刪',
    'PC.UPKEEP_WEEK': '同上，生活層週開銷已不存在',
    'PC.ROOM': '同上，房東房客世界觀已砍',
    'MAP.REGION': '坤圖靜態化後改直讀 FATE_MAP_SEED，母區域走名稱比對不走這格',
}
# 永遠抽不到但刻意的（玩家自己關的）。解封時把這一行刪掉即可。
UNREACHABLE_ALLOW = {
    '斯卡哈-Assassin': '玩家暫時關閉召喚（KANSHOU_SUMMON_BLOCKED_IDS_）',
    '伊莉雅-Caster': '玩家暫時關閉召喚（KANSHOU_SUMMON_BLOCKED_IDS_）',
    '恩奇都-Lancer': '玩家暫時關閉召喚（KANSHOU_SUMMON_BLOCKED_IDS_）',
}


def check_ghost_fx(bad, seed_src, others):
    fxs = sorted(set(re.findall(r"fx\s*:\s*'([a-z_0-9]+)'", seed_src)))
    ghosts = [f for f in fxs if not re.search(r"['\"]%s['\"]" % re.escape(f), others)]
    for f in ghosts:
        bad.append("幽靈 fx「%s」：種子掛了這個技能，引擎裡一個字串都找不到（玩家看得到、按了沒反應）" % f)
    return len(fxs)


def check_dead_cols(bad, files):
    core = read(os.path.join(GAS, 'Core_Settings.gs'))
    # COL 的各張子表：  HERO: { ID: 0, CLS: 1, ... },
    tables = re.findall(r"^\s*(HERO|MASTER|PC|MAP|ACC)\s*:\s*\{([^}]*)\}", core, re.M)
    whole = '\n'.join(read(p) for p in files)
    n = 0
    for tname, body in tables:
        for key in re.findall(r"(\w+)\s*:\s*\d+", body):
            n += 1
            tag = '%s.%s' % (tname, key)
            if tag in DEAD_COL_ALLOW:
                continue
            if len(re.findall(r"COL\.%s\.%s\b" % (tname, key), whole)) == 0:
                bad.append("死欄位 COL.%s：種子/寫入端在填它，全樹沒有任何讀取端" % tag)
    return n


def check_double_store(bad, seed_src):
    m = re.search(r"var HERO_PERSONA_OWN_COL_\s*=\s*\[([^\]]*)\]", seed_src)
    if not m:
        bad.append("查無 HERO_PERSONA_OWN_COL_：daily 四欄「不可以同時塞進 PERSONA JSON」這條規則沒人守了")
        return 0
    own = re.findall(r"'([a-zA-Z_]+)'", m.group(1))
    body = re.search(r"function servantToHeroRow_\(s\)\s*\{(.*?)\n\}", seed_src, re.S)
    if not body:
        bad.append("查無 servantToHeroRow_")
        return len(own)
    body = body.group(1)
    # PERSONA 欄就是 np 後面那一格：它必須寫【剔除過專欄鍵】的那份，不是整包 persona。
    slot = re.search(r"s\.np,\s*JSON\.stringify\(([\w.]+)\)", body)
    if not slot:
        bad.append("servantToHeroRow_ 的 PERSONA 欄認不出來（欄序被改過？）")
    elif slot.group(1) != 'slim':
        bad.append("servantToHeroRow_ 把 %s 整包寫進 PERSONA 欄：daily 四欄各有專欄，這樣會存兩份" % slot.group(1))
    elif not re.search(r"HERO_PERSONA_OWN_COL_\.indexOf\(\s*k\s*\)\s*<\s*0", body):
        bad.append("servantToHeroRow_ 的 slim 沒有依 HERO_PERSONA_OWN_COL_ 剔除專欄鍵")
    return len(own)


def check_unreachable(bad, seed_src, gallery, rivals):
    ids = re.findall(r"\{\s*id\s*:\s*'([^']+)'", seed_src)
    seen, sids = set(), []
    for i in ids:
        if i not in seen and re.search(r"id\s*:\s*'%s'\s*,\s*cls" % re.escape(i), seed_src):
            seen.add(i); sids.append(i)
    guest = set()
    for m in re.finditer(r"id\s*:\s*'([^']+)'.*?wars\s*:\s*\[([^\]]*)\]", seed_src, re.S):
        if '客串' in m.group(2):
            guest.add(m.group(1))
    def arr(name, src):
        mm = re.search(r"%s\s*=\s*\[([^\]]*)\]" % re.escape(name), src)
        return set(re.findall(r"'([^']+)'", mm.group(1))) if mm else set()
    blocked = arr('KANSHOU_SUMMON_BLOCKED_IDS_', gallery)
    pools = arr('KANSHOU_ENCOUNTER_FEMALE_IDS_', gallery) | arr('KANSHOU_STARTER_IDS_', gallery)
    tags = re.search(r"KANSHOU_LOCATION_TAGS_\s*=\s*\{(.*?)\n\};", gallery, re.S)
    if tags:
        pools |= set(re.findall(r"'([^']+-[^']+)'", tags.group(1)))
    for i in sids:
        if i in UNREACHABLE_ALLOW:
            continue
        # solo 進得去(非客串) 或 鑑賞抽得到(沒被封鎖 或 在任一池) 就算有出口
        if i not in guest:
            continue
        if i not in blocked or i in pools:
            continue
        bad.append("抽不到的種子「%s」：solo 標了客串、鑑賞又封鎖召喚，也不在巧遇/起手池——整筆設定沒有出口" % i)
    return len(sids)


def main():
    bad = []
    seed_src = read(SEED)
    others = '\n'.join(read(p) for p in gas_files(exclude=('Seed_Codex.gs',)))
    n_fx = check_ghost_fx(bad, seed_src, others)
    n_col = check_dead_cols(bad, gas_files())
    n_own = check_double_store(bad, seed_src)
    n_seed = check_unreachable(bad, seed_src, read(os.path.join(GAS, 'Gallery.gs')),
                               read(os.path.join(GAS, 'Seed_Rivals.gs')))

    # 🧪 自我退化測試：注入一個不存在的 fx，這支必須叫。
    probe = []
    check_ghost_fx(probe, seed_src + "\n{n:'測試',r:'A',fx:'zzz_not_wired'},", others)
    if not probe:
        print('🌱 種子庫：❌ 掃描器自身失效（注入的幽靈 fx 抓不到）')
        return 1

    print('🌱 種子庫不變式：技能 fx %d 種、COL 欄位 %d 格（棄用登記 %d）、種子 %d 筆、daily 專欄 %d 格（含自我退化測試）'
          % (n_fx, n_col, len(DEAD_COL_ALLOW), n_seed, n_own))
    if bad:
        print('  ❌ %d 處「寫了但沒人吃」：' % len(bad))
        for b in bad:
            print('     ' + b)
        print('  → 設定寫了沒人讀是零錯誤訊息的：綠燈、部署成功，玩家看到一個做不到事情的東西。')
        print('     刻意棄用的登記進 check_seed.py 的 DEAD_COL_ALLOW／UNREACHABLE_ALLOW 並寫明理由。')
        return 1
    print('  ✅ 種子寫的每一項都有人吃')
    return 0


if __name__ == '__main__':
    sys.exit(main())
