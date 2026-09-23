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
④ 抽不到的種子：solo 只標客串、鑑賞又封鎖召喚——整筆設定沒有出口。
   ⚠ 2026-09 修：舊版還讀 KANSHOU_ENCOUNTER_FEMALE_IDS_／KANSHOU_STARTER_IDS_／KANSHOU_LOCATION_TAGS_
     三個【早就不存在】的常數當「其他池」，全成空集合、整道靜靜什麼都驗不到卻天天綠燈。
     地點/巧遇/起始住民退休後，鑑賞唯一的出口就是召喚，規則收成一句。
⑨ 階段表整句取代角色欄：好感/階級表本來只該說「偏離了多少」，寫成一句完整的態度就會【蓋掉】
   種子的角色底色——實測好感≥45 之後 25 位從者的「此刻對你」變成同一句話，吉爾伽美什會
   「打從心底信任你」、狂化的赫拉克勒斯會「露出只給你看的那一面」。角色的區別度在關係
   開始好看的那一刻整個消失，而且零錯誤訊息。
⑩ 退休的欄位長回來：萌點 2026-09 整組退休（玩家「萌不萌是玩家的事情，我們只給性格」）。
   這種「概念砍掉、某個角落又寫回去」的復發最難發現——COL 欄位還在，寫進去不會報錯。
⑪ 氣質格寫成常態舞台指示：「背脊永遠打得筆直」不是第一眼的氛圍，是叫 AI 每回合表演一個動作。
"""
import os, re, sys, tempfile

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
    'MASTER.MELEE': '2026-09 玩家「體術骰子不太需要，AI 會錯亂硬掰」：【體術】標記整組退休，欄位保留因 COL 是位置索引',
    'MASTER.MAGIC_RANK': '2026-09 同上：魔術階位不再自成一顆骰，改由 masterMagicRankFromCircuits_ 從迴路推',
    'MASTER.HOME': '2026-09 稽核：全樹零讀取，種子已不再供值；欄位保留因 COL 是位置索引',
    'MASTER.WAR': '2026-09 稽核：全樹零讀取（屆次靠從者的 WARS 欄判定），種子已不再供值',
    'PC.MAX_MP': '出力電池制後從者無自有魔力池，欄位留著不刪',
    'PC.MONEY': '經濟層整組砍除（CLAUDE.md 現況鐵則：兩軌皆無經濟/生活層），欄位留著不刪',
    'PC.UPKEEP_WEEK': '同上，生活層週開銷已不存在',
    'PC.ROOM': '同上，房東房客世界觀已砍',
    'MAP.REGION': '坤圖靜態化後改直讀 FATE_MAP_SEED，母區域走名稱比對不走這格',
    'PC.INTENT': '2026-09 萌點整組退休（玩家「萌不萌是玩家的事情」），永遠寫空字串；COL 是位置索引，欄位不刪',
    'HERO.DAILY_MOE': '同上，鑑賞的日常萌點一併退休',
    'MASTER.MOE': '同上，御主殿的萌點欄一併退休',
}
# 永遠抽不到但刻意的（玩家自己關的）。解封時把這一行刪掉即可。
UNREACHABLE_ALLOW = {
    # 2026-09 清空：KANSHOU_SUMMON_BLOCKED_IDS_ 現為 []，之前登記的三位都抽得到了。
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
    for i in sids:
        if i in UNREACHABLE_ALLOW:
            continue
        # solo 進得去(非客串) 或 鑑賞召喚得到(沒被封鎖) 就算有出口——鑑賞現在只剩召喚這一條路
        if i not in guest or i not in blocked:
            continue
        bad.append("抽不到的種子「%s」：solo 標了客串、鑑賞又封鎖召喚——整筆設定沒有出口" % i)
    return len(sids)


# ⑨ 好感階段表不可以整句取代種子的角色底色。
#    這條盯的是「疊加」這個結構：階梯的值必須先落進一個變數，最後的 return 必須同時帶上
#    種子參數與那個變數——只要有人把它改回 `return LADDER[i].s`，這裡就會叫。
STANCE_LADDERS = [('BOND_STANCE_', 'bondStance_')]


def check_stance_additive(bad, persona_src):
    n = 0
    for tbl, fn in STANCE_LADDERS:
        m = re.search(r"function %s\(([^)]*)\)\s*\{(.*?)\n\}" % re.escape(fn), persona_src, re.S)
        if not m:
            bad.append("查無 %s：「好感只說偏離多少、不取代角色底色」這條規則沒人守了" % fn)
            continue
        params = [x.strip() for x in m.group(1).split(',') if x.strip()]
        body = m.group(2)
        if len(params) < 2:
            bad.append("%s 沒有收種子態度參數：那就只剩階段表說了算" % fn)
            continue
        seed_param = params[1]
        # 種子參數常先被正規化成區域變數（var seed = String(seedStance || '')）——跟著別名走，
        # 否則掃描器會逼人把程式寫成它認得的樣子，那是本末倒置。
        seed_names = {seed_param} | set(re.findall(r"(?:var|let|const)\s+(\w+)\s*=[^\n;]*\b%s\b" % re.escape(seed_param), m.group(2)))
        n += len(re.findall(r"\{\s*min:", re.search(r"var %s\s*=\s*\[(.*?)\];" % re.escape(tbl), persona_src, re.S).group(1))) if re.search(r"var %s\s*=\s*\[(.*?)\];" % re.escape(tbl), persona_src, re.S) else 0
        # 階梯的值不可以直接 return（那就是取代）
        if re.search(r"return\s+%s\[[^\]]+\]\.s" % re.escape(tbl), body):
            bad.append("%s 直接 return %s 的字串＝整句取代種子態度：好感一過門檻，所有角色會講同一句話" % (fn, tbl))
            continue
        # 最後必須有一個同時帶著【種子】與【階梯值】的回傳
        holder = re.search(r"(\w+)\s*=\s*%s\[[^\]]+\]\.s" % re.escape(tbl), body)
        if not holder:
            bad.append("%s 沒把 %s 的值接進變數：認不出它是疊加還是取代" % (fn, tbl))
            continue
        hv = holder.group(1)
        if not [r for r in re.findall(r"return ([^\n;]+)", body) if any(sn in r for sn in seed_names) and hv in r]:
            bad.append("%s 的回傳沒有同時帶上種子態度(%s)與位移句(%s)：高好感時角色底色會被吃掉" % (fn, seed_param, hv))
    return n


# ⑩ 萌點已整組退休，不准從任何角落長回來。
#    ⚠ 只看【代碼行】：註解與墓碑（標著「棄用」「退休」「已移除」）本來就會提到它，全掃會整排誤報。
MOE_DEAD_WORDS = ('萌點', 'npc_intent', 'clampMoe_', 'translateMoeToDaily_', 'MOE_STORE_MAX_')
MOE_TOMB = ('棄用', '退休', '已移除', '已刪', '不刪', '原萌點')


def check_moe_retired(bad, paths):
    n = 0
    for p in paths:
        for i, line in enumerate(read(p).split('\n'), 1):
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('<!--'):
                continue
            if any(t in line for t in MOE_TOMB):
                continue
            hit = [w for w in MOE_DEAD_WORDS if w in line]
            if hit:
                bad.append("%s:%d 萌點已整組退休，這行又把它寫回來了：%s" % (os.path.basename(p), i, '／'.join(hit)))
            # 讀取 INTENT 欄（寫空字串不算）
            if 'COL.PC.INTENT' in line and not re.search(r"COL\.PC\.INTENT\]?\s*=\s*['\"]{2}", line):
                bad.append("%s:%d 讀了已退休的萌點欄 COL.PC.INTENT" % (os.path.basename(p), i))
            if 'COL.HERO.DAILY_MOE' in line and not re.search(r"COL\.HERO\.DAILY_MOE\]?\s*=\s*['\"]{2}", line):
                bad.append("%s:%d 讀了已退休的日常萌點欄 COL.HERO.DAILY_MOE" % (os.path.basename(p), i))
            n += 1
    return n


# ⑫ 性格第二格＝「熟了之後看得到的那一面」，是一種性情，不是條件觸發句、也不是設定註記。
#    2026-09 玩家逐筆看卡時抓到：「越被道謝越兇」「佔有慾冒頭時轉成撒嬌」「見人逞強就坐不住」
#    是【條件觸發句】——跟 2026-09 已經整格退休的「卸下心防的私密一面」同一個形狀，
#    玩家原話是「模型只能硬塞，寫出來就尷尬」。同一批還抓到「多重人格意外和睦」
#    「骨子裡仍是潛行者」——那是【旁觀者的設定註記】（在說她是什麼，不是說她怎麼對人）。
#    ⚠ 只擋條件觸發句：那個形狀有明確的句法特徵，regex 抓得準。設定註記沒有句法特徵，
#    硬抓只會誤報——那一類靠人讀，記在 SOLO/KANSHOU_REFERENCE 的判準裡。
PREF2_COND = re.compile(r'越.{0,8}越|.{0,8}時轉成|見.{0,6}就|被.{0,6}就|一.{0,5}就|只要.{0,6}就')


# ⑬ 行為準則(persona.logic)＝這個人【做選擇的方式】，必須是一個取捨：把兩件都想要的東西擺在一起，
#    說出最後放掉哪一個。寫成「重視朋友」「個性溫柔」那種單向形容詞等於沒寫——AI 遇到沒寫過的
#    情境還是只能猜，而這一欄存在的理由就是要接住那些情境。
#    盯的是【取捨語氣詞】：卻/但/還是/最後/反而/寧可/只/先/選/讓/放/挑/比。這組詞在中文裡就是
#    「兩邊擺一起、選了一邊」的標記，缺了它幾乎不可能寫出取捨。順便擋兩件事：
#    怪癖(persona.quirks)必須剛好兩格（一個習慣動作＋一個應付不來的領域，一格會退化成舊的 tic），
#    以及「在這座城裡是誰」(dailyBack)要有身分/地點/關係的實詞——全是形容詞就是把性格再抄一遍
#    （2026-09 逐筆檢查時 22 筆裡有 9 筆是這樣，只有 8 筆在做事）。
LOGIC_TRADEOFF = re.compile(r'[卻但只先選讓放挑比]|還是|最後|反而|寧可')
BACK_CONCRETE = re.compile(r'家|町|校|教|經營|工房|當家|妹妹|姊|兄|弟|女兒|兒子|老師|學生|住|店|舖|鋪|'
                           r'獨子|養女|大小姐|打工|上班|顧店|代課|警衛|苗圃|道場|神社|公司|屋|廠')


def check_logic(bad, seed_src):
    n_logic = n_quirk = n_back = 0
    for m in re.finditer(r"logic:'([^']*)'", seed_src):
        n_logic += 1
        if not LOGIC_TRADEOFF.search(m.group(1)):
            bad.append("行為準則沒有取捨：「%s」——這一欄要把兩件都想要的東西擺在一起、說出放掉哪一個，"
                       "單向形容詞接不住沒寫過的情境" % m.group(1))
    for m in re.finditer(r"quirks:'([^']*)'", seed_src):
        n_quirk += 1
        if len([x for x in m.group(1).split('、') if x.strip()]) != 2:
            bad.append("怪癖不是兩格：「%s」——一個看得見的習慣動作＋一個應付不來的領域" % m.group(1))
    for m in re.finditer(r"dailyBack:'([^']*)'", seed_src):
        n_back += 1
        if not BACK_CONCRETE.search(m.group(1)):
            bad.append("「在這座城裡是誰」寫成形容詞：「%s」——這一欄要身分/在哪/跟誰有關係，"
                       "形容詞性格欄已經講過了；它同時是世界帳本的起點" % m.group(1))
    return n_logic, n_quirk, n_back


# ⑫ 觸發條目（persona.book）：規格照 SillyTavern character_book。每條要有 keys 與 content；
#    key 至少兩字（單字 key 逢字就亮，「吃」「書」會讓條目每回合都在），允許的單字寫在 Gallery.gs 的
#    KANSHOU_LORE_KEY_ALLOW1_（單一真實來源，這裡讀它不另抄）；content 是事實不是舞台指示（AURA_BAN 同一組詞）。
def lore_allow1(gallery_src):
    m = re.search(r"KANSHOU_LORE_KEY_ALLOW1_\s*=\s*\[([^\]]*)\]", gallery_src)
    return re.findall(r"'([^']+)'", m.group(1)) if m else []


def check_lore(bad, seed_src, gallery_src):
    allow1 = lore_allow1(gallery_src)
    n = 0
    for m in re.finditer(r"book:\s*\[(.*?)\]\s*\}", seed_src, re.S):
        for e in re.finditer(r"\{\s*'keys'\s*:\s*\[([^\]]*)\]\s*,\s*'content'\s*:\s*'([^']*)'\s*\}", m.group(1)):
            n += 1
            keys = re.findall(r"'([^']+)'", e.group(1))
            content = e.group(2).strip()
            if not keys:
                bad.append("觸發條目沒有 keys：「%s」——沒有關鍵字的條目永遠亮不起來" % content)
            for k in keys:
                if len(k) < 2 and k not in allow1:
                    bad.append("觸發條目的單字 key「%s」（%s）——逢字就亮，要嘛寫兩字以上，要嘛登記進 KANSHOU_LORE_KEY_ALLOW1_" % (k, content))
            if not content:
                bad.append("觸發條目沒有 content（keys=%s）" % keys)
            elif len(content) > 40:
                bad.append("觸發條目太長（%d 字）：「%s」——這是一句底細，不是一段設定" % (len(content), content))
            elif any(w in content for w in AURA_BAN):
                bad.append("觸發條目寫成舞台指示：「%s」——條目是事實，怎麼演交給模型" % content)
    return n


def check_pref2(bad, seed_src):
    segs = 0
    for m in re.finditer(r"dailyWords:'([^']*)'", seed_src):
        parts = m.group(1).split('、')
        if len(parts) < 2:
            continue
        segs += 1
        if PREF2_COND.search(parts[1]):
            bad.append("性格第二格寫成條件觸發句：「%s」——那要等情境對了才演得出來，"
                       "寫成一種性情（刀子嘴豆腐心／放不下別人的事）模型每一回合都用得上" % parts[1])
    return segs


# ⑪ 氣質格＝第一眼的氛圍，不是叫 AI 每回合表演的常態動作。
#    2026-09 v77 把 21 筆氣質從形容詞改寫成「看得到的畫面」，結果寫成了常態舞台指示
#    （「背脊永遠打得筆直」「下巴總是微抬半分」），玩家一眼看穿：「這就是強迫 AI 這樣扮演吧」。
#    兩件事一起擋：①種子裡不可再出現常態指令詞 ②每個生成這一格的提示詞都必須帶上 AURA_SPEC_
#    （五處提示詞共用同一份規格＝單一真實來源；少接一處，那條路生出來的角色就會走回頭路）。
AURA_BAN = ('永遠', '總是', '老是', '一律', '每次', '從不', '不停')
AURA_SLOT_MARKS = ('[氣質', '外貌、氣質')


def check_aura(bad, seed_src, paths):
    segs = 0
    for m in re.finditer(r"dailyLook:'([^']*)'", seed_src):
        parts = m.group(1).split('、')
        if len(parts) < 2:
            continue
        segs += 1
        hit = [w for w in AURA_BAN if w in parts[1]]
        if hit:
            bad.append("氣質格寫成常態舞台指示（%s）：「%s」——那是叫 AI 每回合表演一個動作，不是第一眼的氛圍"
                       % ('／'.join(hit), parts[1]))
    wired = 0
    for p in paths:
        for i, line in enumerate(read(p).split('\n'), 1):
            if line.strip().startswith('//'):
                continue
            if any(k in line for k in AURA_SLOT_MARKS):
                if 'AURA_SPEC_' in line:
                    wired += 1
                else:
                    bad.append("%s:%d 這條提示詞在叫 AI 寫氣質格，卻沒帶上 AURA_SPEC_：這條路生出來的角色會走回常態動作"
                               % (os.path.basename(p), i))
    if not wired:
        bad.append("全樹沒有任何提示詞接上 AURA_SPEC_：氣質格的寫法規格沒人在用了")
    return segs


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
    n_stance = check_stance_additive(bad, read(os.path.join(GAS, 'Router_Persona.gs')))
    n_line = check_moe_retired(bad, gas_files())
    n_aura = check_aura(bad, seed_src, gas_files())
    n_pref2 = check_pref2(bad, seed_src)
    n_logic, n_quirk, n_back = check_logic(bad, seed_src)
    _gallery = read(os.path.join(GAS, 'Gallery.gs'))
    n_lore = check_lore(bad, seed_src, _gallery)

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
    with tempfile.NamedTemporaryFile('w', suffix='.gs', dir=GAS, delete=False, encoding='utf-8') as f:
        f.write("★【格式鐵律】traits 【恰好9段】、personality 【恰好4段】")
        _inj = f.name
    try:
        check_prompt_seg_counts(probe, [_inj])
    finally:
        os.unlink(_inj)
    _st_before = len(probe)
    check_stance_additive(probe, "var BOND_STANCE_ = [{ min: 45, s: '注入' }];\n"
                                 "function bondStance_(bond, seedStance) {\n"
                                 "  for (var i = 0; i < BOND_STANCE_.length; i++) return BOND_STANCE_[i].s;\n"
                                 "  return seedStance;\n}")
    _aura_before = len(probe)
    check_aura(probe, "dailyLook:'金髮碧眼、背脊永遠打得筆直、簡潔認真',", [])
    _logic_before = len(probe)
    check_logic(probe, "logic:'重視朋友'\nquirks:'撥髮'\ndailyBack:'溫柔而沉靜'")
    _pref2_before = len(probe)
    check_pref2(probe, "dailyWords:'測試、越被誇越兇、甲、乙'")
    _lore_before = len(probe)
    check_lore(probe, "book:[{'keys':['吃'],'content':'喜歡吃'},{'keys':[],'content':'x'},{'keys':['手機'],'content':'每次看到手機總是炸'}]}", _gallery)
    _unr_before = len(probe)
    # 拿種子庫裡真的標了客串的第一位，注入一份把她封鎖的 Gallery——這道必須叫。
    _guest1 = next((m.group(1) for m in re.finditer(r"id\s*:\s*'([^']+)'.*?wars\s*:\s*\[([^\]]*)\]", seed_src, re.S) if '客串' in m.group(2)), None)
    if _guest1:
        check_unreachable(probe, seed_src, "const KANSHOU_SUMMON_BLOCKED_IDS_ = ['%s'];" % _guest1, "")
    _moe_before = len(probe)
    with tempfile.NamedTemporaryFile('w', suffix='.gs', dir=GAS, delete=False, encoding='utf-8') as f:
        f.write("  card += `｜萌點：${moe}`;\n")
        _inj2 = f.name
    try:
        check_moe_retired(probe, [_inj2])
    finally:
        os.unlink(_inj2)
    if len(probe) < 13 or len(probe) == before or len(probe) == _seg_before \
            or len(probe) == _st_before or len(probe) == _moe_before or len(probe) == _aura_before \
            or len(probe) == _pref2_before or len(probe) == _logic_before or len(probe) == _unr_before \
            or len(probe) - _lore_before < 3:
        print('🌱 種子庫：❌ 掃描器自身失效（注入的幽靈 fx／劇情弧態度／過期真名／取代式階段表／復活的萌點／常態舞台指示／條件觸發性格／沒有取捨的準則／封鎖後抽不到的種子抓不到）')
        return 1

    print('🌱 種子庫不變式：技能 fx %d 種、COL 欄位 %d 格（棄用登記 %d）、種子 %d 筆、對御主態度 %d 條、真名 %d 個（寫死比對 %d 處）、經歷 %d 條、提示詞格數 %d 處、daily 專欄 %d 格、好感位移 %d 階、退休欄掃 %d 行、氣質格 %d 筆、性格第二格 %d 筆、行為準則 %d 條（怪癖 %d 格·城裡身分 %d 條）、觸發條目 %d 條（含自我退化測試）'
          % (n_fx, n_col, len(DEAD_COL_ALLOW), n_seed, n_tom, n_nm, n_lit, n_bk, n_seg, n_own, n_stance, n_line, n_aura, n_pref2, n_logic, n_quirk, n_back, n_lore))
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
