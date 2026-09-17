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
    # ⚠ 三種寫法都算「有人提到它」：引號字串、物件鍵（FX_DESC 的 `golden_fleece: () => …`）、屬性存取。
    #   第一版只認引號，於是把有說明卡的 golden_fleece 誤報成幽靈——寧可漏抓也不要誤報，
    #   真正的幽靈是「整棵樹一次都沒出現」。
    def mentioned(f):
        e = re.escape(f)
        return re.search(r"['\"]%s['\"]" % e, others) or re.search(r"(?m)^\s*%s\s*:" % e, others) \
            or re.search(r"\.%s\b" % e, others)
    ghosts = [f for f in fxs if not mentioned(f)]
    for f in ghosts:
        bad.append("幽靈 fx「%s」：種子掛了這個技能，引擎裡一個字串都找不到（玩家看得到、按了沒反應）" % f)
    return len(fxs)


# 🧭「對御主的態度」必須是一個【當下成立】的立場，不可以寫成隨時間變化或有條件分岔的劇情弧。
#    玩家 2026-09：「應該要有一個核心，不要逐漸動搖這種模稜兩可的」。
#    寫成弧線＝把劇情走向先告訴 AI（「初期保持距離，逐漸動搖」），它會照著演，
#    而實際的關係深淺已經由好感/契約在管——等於兩個真實來源打架。
TOMASTER_BAN_ = ['逐漸', '漸漸', '初期', '起初', '後來', '日後', '最終', '久了', '否則', '一旦', '；', ';']


def check_tomaster(bad, seed_src):
    n = 0
    for m in re.finditer(r"id\s*:\s*'([^']+)'.*?toMaster\s*:\s*'([^']*)'", seed_src, re.S):
        sid, val = m.group(1), m.group(2)
        n += 1
        hit = [w for w in TOMASTER_BAN_ if w in val]
        if hit:
            bad.append("「%s」的對御主態度寫成了劇情弧／分岔（%s）：%s —— 要一個當下成立的核心立場"
                       % (sid, '、'.join(hit), val))
    return n


# 🏷️ 代碼裡拿【真名】做逐字比對的地方（寶具選項、Avalon 專屬判定…），種子改名了就會靜靜失效：
#    那些 if 永遠不成立、選項整條消失，沒有錯誤訊息。2026-09 把真名裡的元資料括號
#    （「（Caster install）」「（征服王）」）清掉時，Engine_Fate 兩處 `name === '…'` 就是這個形狀。
#    規則：比對用的字面量若【是某個真名的一部分、或包住某個真名，卻不等於任何一個真名】＝過期了。
NAME_LIT_ALLOW = set()


# 🈶 真名裡【必須有中文字】：`cleanChineseName` 會把非中日韓字元整個剝掉，
#    純拉丁字母的真名（試過把 EMIYA 的真名改成「EMIYA」）會被洗成空字串——
#    於是「未指定攻擊目標」、名字比對整條靜默失效，而且看起來只是「那個按鍵沒反應」。
def check_name_has_cjk(bad, seed_src):
    names = re.findall(r"realName\s*:\s*'([^']*)'", seed_src)
    for n in names:
        if not re.search(r'[\u3400-\u4dbf\u4e00-\u9fff]', n):
            bad.append("真名「%s」沒有半個中文字：cleanChineseName 會把它洗成空字串，名字比對會整條靜默失效" % n)
    return len(names)


# 📖「經歷」不可以是「性格」的改寫：兩欄在同一張卡上並排送給 AI，講同一件事就是白付兩次的字，
#    而玩家的原話是「給太多資料 AI 反而演不出來」。用 2-gram 重疊率量，≥40% 就當成改寫。
#    經歷該放的是【事實】（他是誰／做什麼／和誰有關係），性格那格才放形容。
BACK_DUP_MAX = 0.4


def _grams(t):
    t = re.sub(r'[、，。・()（）,\s]', '', str(t or ''))
    return {t[i:i + 2] for i in range(len(t) - 1)}


def check_back_not_personality(bad, seed_src):
    n = 0
    for m in re.finditer(r"id\s*:\s*'([^']+)'.*?dailyWords\s*:\s*'([^']*)'.*?dailyBack\s*:\s*'([^']*)'", seed_src, re.S):
        sid, words, back = m.group(1), m.group(2), m.group(3)
        if not back:
            continue
        n += 1
        a, b = _grams(back), _grams(words)
        if not a or not b:
            continue
        ov = len(a & b) / min(len(a), len(b))
        if ov >= BACK_DUP_MAX:
            bad.append("「%s」的經歷只是性格的改寫（重疊 %d%%）：%s —— 經歷放事實，形容留給性格那格"
                       % (sid, round(ov * 100), back))
    return n


# 🔢 創角提示詞裡寫的【格數】必須等於吃它的那張表的格數：
#    prompt 叫 AI 寫 3 段、`parseTraitsHelper(..., TRAIT_SLOTS_)` 只收 2 段＝第 3 段靜靜被丟掉，
#    玩家花了 token 生成、也在卡上看不到，而且零錯誤訊息。2026-09 把特徵從 3 格收成 2 格時，
#    六處提示詞（御主創角／常民升格／人格編織者／AI 生成從者／日常外貌轉換）全都還寫著舊數字。
SEG_SPECS = [
    (r"traits\s*【恰好(\d+)段】", 'TRAIT_SLOTS_'),
    (r"personality\s*【恰好(\d+)段】", 'PREF'),
    (r"look【恰好(\d+)段】", 'TRAIT_SLOTS_'),
    (r"【外貌 look】剛好\s*(\d+)\s*短句", 'TRAIT_SLOTS_'),
    (r"日常版「外貌」(三|四|二|兩)短句", 'DAILY_LOOK_SLOTS_'),
]
CN_NUM = {'二': 2, '兩': 2, '三': 3, '四': 4}


def check_prompt_seg_counts(bad, files):
    core = read(os.path.join(GAS, 'Core_Settings.gs'))
    want = {
        'TRAIT_SLOTS_': int(re.search(r"var TRAIT_SLOTS_\s*=\s*(\d+)", core).group(1)),
        'DAILY_LOOK_SLOTS_': int(re.search(r"var DAILY_LOOK_SLOTS_\s*=\s*(\d+)", core).group(1)),
        'PREF': len(re.findall(r"'[^']+'", re.search(r"var PREF_LABELS_\s*=\s*\[([^\]]*)\]",
                                                     read(os.path.join(GAS, 'Router_Persona.gs'))).group(1))),
    }
    n = 0
    for path in files:
        t = read(path)
        for pat, key in SEG_SPECS:
            for m in re.finditer(pat, t):
                raw = m.group(1)
                got = CN_NUM.get(raw, None) or int(raw) if raw.isdigit() else CN_NUM.get(raw)
                n += 1
                if got != want[key]:
                    bad.append("%s 的提示詞叫 AI 寫 %s 段，但 %s 只收 %d 段——多的那幾段會被靜靜丟掉"
                               % (os.path.basename(path), raw, key, want[key]))
    return n


def check_hardcoded_names(bad, seed_src, files, extra=()):
    names = set(re.findall(r"realName\s*:\s*'([^']*)'", seed_src))
    ids = set(re.findall(r"\{\s*id\s*:\s*'([^']*)'", seed_src))   # id 不是真名（「衛宮士郎-Master」含著真名）
    n = 0
    srcs = [(os.path.basename(p), read(p)) for p in files if os.path.basename(p) != 'Seed_Codex.gs']
    srcs += list(extra)
    for path, t in srcs:
        for m in re.finditer(r"[!=]==\s*'([^']{2,40})'", t):
            lit = m.group(1)
            if lit in NAME_LIT_ALLOW or lit in ids or not re.search(r'[\u4e00-\u9fff A-Za-z]', lit):
                continue
            if lit in names:
                n += 1
                continue
            near = [x for x in names if (lit in x or x in lit)]
            if near:
                bad.append("%s 的 `=== '%s'` 對不上任何真名（最接近：%s）——種子改名了，那條比對已經永遠不成立"
                           % (path, lit, '／'.join(sorted(near)[:2])))
    return n


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
    n_tom = check_tomaster(bad, seed_src)
    n_lit = check_hardcoded_names(bad, seed_src, gas_files())
    n_nm = check_name_has_cjk(bad, seed_src)
    n_bk = check_back_not_personality(bad, seed_src)
    n_seg = check_prompt_seg_counts(bad, gas_files())

    # 🧪 自我退化測試：注入一個不存在的 fx，這支必須叫。
    probe = []
    check_ghost_fx(probe, seed_src + "\n{n:'測試',r:'A',fx:'zzz_not_wired'},", others)
    check_tomaster(probe, "{ id:'測試-Saber', persona:{toMaster:'起初疏離，逐漸動搖'} }")
    before = len(probe)
    check_hardcoded_names(probe, seed_src, [], extra=[('(注入)', "if (name === '阿爾托莉雅') return [];")])
    check_name_has_cjk(probe, "realName:'EMIYA',")
    check_back_not_personality(probe, "{ id:'測試-Saber', dailyWords:'隨性自來熟、重情義、釣魚與湊熱鬧、拐彎抹角的算計', dailyBack:'隨性愛湊熱鬧，重情義' }")
    _seg_before = len(probe)
    _tmp = os.path.join(GAS, 'Core_Settings.gs')
    check_prompt_seg_counts(probe, [_tmp])   # Core_Settings 本身沒有這些提示詞，下面改用注入檔
    import tempfile
    with tempfile.NamedTemporaryFile('w', suffix='.gs', dir=GAS, delete=False, encoding='utf-8') as f:
        f.write("★【格式鐵律】traits 【恰好9段】、personality 【恰好4段】")
        _inj = f.name
    try:
        check_prompt_seg_counts(probe, [_inj])
    finally:
        os.unlink(_inj)
    if len(probe) < 6 or len(probe) == before or len(probe) == _seg_before:
        print('🌱 種子庫：❌ 掃描器自身失效（注入的幽靈 fx／劇情弧態度／過期真名抓不到）')
        return 1

    print('🌱 種子庫不變式：技能 fx %d 種、COL 欄位 %d 格（棄用登記 %d）、種子 %d 筆、對御主態度 %d 條、真名 %d 個（寫死比對 %d 處）、經歷 %d 條、提示詞格數 %d 處、daily 專欄 %d 格（含自我退化測試）'
          % (n_fx, n_col, len(DEAD_COL_ALLOW), n_seed, n_tom, n_nm, n_lit, n_bk, n_seg, n_own))
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
