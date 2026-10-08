#!/bin/bash
# 改完必跑：戰棋引擎測試、自動對戰跑得完、劇情與圖鑑的資料、網頁 JS 語法、repo 裡沒有簡體字。
set -o pipefail
cd "$(dirname "$0")"
fail=0
echo "── 戰棋引擎"; node tools/srw_test.js | tail -1 || fail=1
echo "── 戰棋自動對戰（每關最多重打 3 次）"; N=6 node tools/srw_sim.js | tail -1 || fail=1
echo "── 劇情與圖鑑的資料"; node tools/story_test.js | tail -1 || fail=1
echo "── 網頁 JS 語法"
for f in gas/*.html; do
  node -e "const s=require('fs').readFileSync('$f','utf8').replace(/<\?!=[\s\S]*?\?>/g,''); const js=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'); new Function(js);" && echo "  ✅ $f" || { echo "  ❌ $f"; fail=1; }
done
echo "── 簡體字"
node -e "
const fs=require('fs'); const simp=new Set('个们这么说话时问现实为会学习觉认识让讲谈请谢边过还进远连达运选适门开关闭闻东车轮转软轻较见观规视贝贵费货财购赛赞赢赏质责贫赖赶马骑验骗驾鸟鸡鱼鲜长张帐账风飞汤场扬杨业严丝丢乐药书画买卖读续号儿乡写军挥辉农浓决减凉净刘刚创别删剑劳势动务医华单卫参双变叶启员响团园图圆国块坚坏执声处头夺奋奖妇妈孙宁审宽宾对寻导将尔尘尝层属岁岛币帅师帮带广庆庄应库归当录彻径忆忧怀态怜总恋恶恼惧惨惯愤愿战扑扩扫担择挂挤损换据摆摄摊敌数断显晓暂术机杀杂权来极构枪标栏树样桥检楼欢残毁气汉洁济浅测涛润渐湾满滚灭灯灵炉烂烦烧热爱独猎猪猫献环电疗监盘确碍礼祸离种积称稳穷窃竞笔简筹类粮纠红纪纯纳纵纷纸纹织终组细绍经绑结绕绘给绝络统继绩绪绳维绵综绿缓编缘缩罗罚职联聪肃肿脉脑脸腊舰舱艰艺节苏苹荐荣莱莲萧蒋蓝虏虑虫蚁蛮补衬袄装计订讨训议讯记许论设访证评诈诉诊词译试诗诚诞询该详误诵诸诺课谁调谅谊谋谎谓谜谣谦谨谱趋跃践轨轩轰辞办迁邮郑钟钢钥钱钻铁铃铜铺链销锁锋错锦键镇镜闯闲阀阁阅阔队阶阳阴陆陈险隐难韩页顶项顺须顽顾顿颁预领颇颈频颗题颜额颤饥饭饮饰饱馆骤麦齐齿龄龙龟产'); let bad=[];
for (const f of fs.readdirSync('gas').map(x=>'gas/'+x).concat(['README.md','CLAUDE.md'])) { const s=fs.readFileSync(f,'utf8'); [...s].forEach(ch=>{ if(simp.has(ch)) bad.push(f+':'+ch); }); }
if (bad.length) { console.log('  ❌ '+bad.slice(0,10).join(' ')); process.exit(1); } console.log('  ✅ 沒有簡體字');" || fail=1
echo "──────────────"
[ $fail = 0 ] && echo "✅ 全部通過" || { echo "❌ 有沒過的"; exit 1; }
