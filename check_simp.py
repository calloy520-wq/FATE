# -*- coding: utf-8 -*-
"""🈶 簡體字檢查（check.sh 會跑）

玩家要的是【台灣繁體中文】。提示詞裡已經有兩道語言鐵律叫 AI 寫正體字，但那只管
AI 的輸出——**我們自己寫進 repo 的字沒有任何東西在管**。混進去的簡體字有兩種傷害：
  ① 罐頭文案/種子資料裡的，玩家直接看得到
  ② 提示詞裡的，等於一邊叫 AI 寫繁體、一邊拿簡體示範給它看（模型會照著鏡射）
兩種都不會報錯，只會被玩家在遊戲裡撞見。

字表只收「繁體絕不會出現」的簡化字，刻意排除兩邊都合法的（台/只/干/裡/後/面/丰/几/云/系…）——
**寧可漏抓，不可誤報**（誤報比沒有檢查器更糟，這專案踩過）。發現新的漏網字就往 SIMP 加。

用法：python3 check_simp.py [路徑…]   ← 預設掃整個 repo，有問題回傳非 0
"""
import sys, os, glob, re
# 只收「繁體絕不會出現」的簡化字；刻意排除兩邊都合法的（台/只/干/裡/后/面/丰/几/云/系/征/复?…）
SIMP = (
"个们这么说话时问现实为会学习觉认识让讲谈请谢边过还进远连达迟运选适递遗邻"
"门开关闭闻闹闪东车轮转软轻较辆输载见观规视览贝贵费货财贴购贷赛赞赢赏质责贤贫赋贯赖赶赵"
"马骑驾验骗驻驶骂骄惊鸟鸡鸣鸭鹅鹤凤鱼鲜鲁鲍韦违围伟纬长张帐账胀涨风疯枫讽飞汤场扬杨肠荡"
"业严丛丝丢乐药书昼画买卖读续号儿乡写军挥辉农浓侬决减凉净刘刚创别删剑劳势动务医华单卫参"
"双发变叶启员响哑唤啰喽团园图圆国垒块坚坛坏执声处头夹夺奋奖妆娄妇妈婴孙宁审宽宾对寻导将"
"尔尘尝层属岁岛岂币帅师帮带广庆庄应库弥归当录彻径忆忧怀态怜总恋恶恳恼惧惨惯愤愿戏战扑扩"
"扫担拟拢择挂挤损换据掷搂摆摄摊攒敌数断昙显晓暂术机杀杂权来极构枪枢标栏树样桥检楼榄欢残"
"殡毁气汉汇洁济浅测浏涛涡润渐湾溃满滚滤滨滩灭灯灵炉烂烦烧热爱爷犹狈独狮猎猪猫献玛环珑玮"
"琼产电疗疟监盘睁矫码硕确碍礼祸祷离种积称稳穷窃窜窝竞笋笔笼简筹签篮类粮纠红纪纯纳纵纷纸"
"纹织终组细绅绊绍经绑绒结绕绘给绝络绞统继绩绪绳维绵绷综绽绿缄缆缓编缘缠缩缤缴罗罚翘耻职"
"联聪肃肿脉脏脑脸腊腻舰舱艰艺节芦苏苹茎荐荣莱莲获萧蒋蓝蔷虏虑虫蚁蛮蜡蝉补衬袄装计订认讥"
"讨训议讯记许论讼设访诀证评诈诉诊词译试诗诚诞诡询该详诫语误诵诸诺课谁调谅谊谋谎谐谓谜谣"
"谦谨谱谴赛趋跃践轨轩轰辞办迁邮郑酝钟钢钥钱钻铁铃铜铺链销锁锋错锦键镇镜闯闷闲阀阁阅阔队"
"阶阳阴陆陈险隐难雏韩页顶项顺须顽顾顿颁颂预领颇颈颊频颗题颜额颤饥饭饮饰饱饶馆骤髅麦齐齿"
"龄龙龟"
"着裏爲麽衆綫説懒随厨抛脚凑况温産叹户内兑黄従圏単収処争寛実対専徳楽気沢涙発応戦拝掲検歩歳満済焼獣県縁継聴蔵訳読賛転軽辺遅郷険隣雑霊顔駅験鶏麺齢黒録亀誉賎醤鉄銭錬闘陥隠覇"   # 2026-09-23 toTaiwanTrad_ 字表同步：簡體＋舊字形／日本新字體（着裏爲麽衆綫説…）
)
S = set(SIMP)
roots = sys.argv[1:] or [os.path.dirname(os.path.abspath(__file__))]
hits = {}
for root in roots:
    files = glob.glob(os.path.join(root, '**', '*'), recursive=True) if os.path.isdir(root) else [root]
    for f in files:
        if not os.path.isfile(f): continue
        if not re.search(r'\.(gs|html|md|js|py|sh|json)$', f): continue
        if os.path.basename(f) == 'check_simp.py': continue  # 字表本身就是一串簡體字
        try: txt = open(f, encoding='utf-8').read()
        except Exception: continue
        for i, line in enumerate(txt.split('\n'), 1):
            bad = sorted({c for c in line if c in S})
            if bad:
                hits.setdefault(f, []).append((i, ''.join(bad), line.strip()[:90]))
tot = sum(len(v) for v in hits.values())
print(f'🈶 簡體字檢查：字表 {len(S)} 字')
for f, rows in sorted(hits.items()):
    print(f'\n■ {f}  ({len(rows)} 行)')
    for i, bad, line in rows[:40]:
        print(f'   {i:>5}  [{bad}]  {line}')
    if len(rows) > 40: print(f'   …還有 {len(rows)-40} 行')
print(f'  ❌ {tot} 行混到簡體字（上面列出行號與字）' if tot else '  ✅ 沒有簡體字')
sys.exit(1 if tot else 0)
