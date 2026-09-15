// 🧵 solo 敘事記憶檢查（check.sh 會跑）
//
// 擋的是一個「存了、但存錯東西」的漏洞形狀，2026-09 玩家回報「對話牛頭不對馬嘴」才挖出來：
//
//   每回合結束會把玩家那半存進「歷史暫存」，下一回合再餵回 AI 當作上一輪的 user 訊息。
//   舊版存的是 cleanNarrateEcho_(提示詞前 80 字)——戰鬥回合的提示詞【開頭是角色卡】，
//   於是存進去的是「風音｜性別：女｜性格：不服輸…」這種卡片碎片，
//   誰打誰、打贏打輸、誰死了，一個字都沒留下。AI 下一回合等於完全失憶。
//
// 這種形狀沒有錯誤訊息、check.sh 全綠、部署成功，只有玩家會覺得「怎麼接不上」。
// 所以這支不看寫法、只看行為：拿真的 narrateMemoryLine_ 餵每一種按鈕的提示詞，
// 檢查存下來的那句話是不是【這回合發生的事】。
//
// 用法：node check_memory.js   ← 有問題回傳非 0

const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, 'gas', 'Router_Narrative.gs'), 'utf8');
const problems = [];

function grab(re, what) {
  const m = SRC.match(re);
  if (!m) problems.push(`抓不到 ${what}（改名了？檢查沒跟上就等於沒檢查）`);
  return m ? m[0] : '';
}
const parts = [
  grab(/const NARRATE_EVENT_TAG_ =[^\n]*/, 'NARRATE_EVENT_TAG_'),
  grab(/const NARRATE_OUTCOME_ =[^\n]*/, 'NARRATE_OUTCOME_'),
  grab(/function cleanNarrateEcho_[\s\S]*?\n}/, 'cleanNarrateEcho_'),
  grab(/function narrateMemoryLine_[\s\S]*?\n}/, 'narrateMemoryLine_'),
];
let mem = null;
if (!problems.length) {
  const ctx = { String }; vm.createContext(ctx);
  vm.runInContext(parts.join('\n'), ctx);
  mem = t => vm.runInContext('narrateMemoryLine_(' + JSON.stringify(t) + ')', ctx);
}

// 每種按鈕給一段【真實形狀】的提示詞（卡片在前、事實在中、★指令在後），看記憶句抓到什麼。
const CARD = '【我方御主】風音｜性別：女｜性格：不服輸、逞強｜外貌：黑長直\n。御主＝玩家本人：他會依性格開口。\n'
  + '【我方從者】阿爾托莉雅｜Saber\n【敵方從者·非我方】美狄亞｜Caster\n★依真名與性格演出\n';
const CASES = [
  ['戰鬥', CARD + '【戰報·已裁定】御主號令阿爾托莉雅出擊，與「美狄亞」交鋒 3 回合。\n第1回合 命中18 傷害42\n'
    + '我方造成 108 傷害、受創 18。「美狄亞」靈基崩潰、徹底消滅。\n── 本戰發生的事 ──\n· 御主燃燒一道令咒。\n★以 Fate 筆觸演出\n',
    ['交鋒', '靈基崩潰']],
  ['移動', CARD + '【抵達場景】御主『風音』與從者「阿爾托莉雅」剛抵達冬木的「冬木大橋」，時值黃昏。\n'
    + '此地氛圍：長橋橫跨未遠川。\n敵情：敵御主『言峰綺禮』在此。\n★描寫抵達此地的所見所感\n', ['冬木大橋', '敵情']],
  ['休息', '【系統·休息已結算】御主於據點休整 4 小時，恢復行動力。\n★演出這段喘息。\n', ['休整']],
  ['補魔', '【系統·補魔已結算】御主分予從者魔力，魔力池 40→22。\n★演出這段交付。\n', ['魔力']],
  ['結盟', '【系統·結盟已達成·已裁定】御主與『遠坂凜』締結同盟。\n★演出締約當下。\n', ['同盟']],
  ['敗北之夢', '【虛假之夢·已裁定】御主『風音』在聖杯戰爭中敗北，意識墜入聖杯泥。\n★寫一段虛假美夢\n', ['敗北']],
  ['召喚登場', '【召喚登場】御主『風音』剛以令咒召喚出從者阿爾托莉雅。\n★演出召喚瞬間\n', ['召喚']],
];
// 這些字只會出現在角色卡／鷹架裡——記憶句裡看到它們，就代表又抓到卡片而不是事件了
const CARD_LEAK = /性格：|外貌：|身世：|御主＝玩家本人|show, don/;
if (mem) {
  for (const [label, prompt, mustHave] of CASES) {
    let out;
    try { out = mem(prompt); } catch (e) { problems.push(`${label}：narrateMemoryLine_ 炸了 ${e.message}`); continue; }
    if (CARD_LEAK.test(out)) problems.push(`${label}：記憶句抓到的是【角色卡】不是事件 → 「${out.slice(0, 50)}…」`);
    else if (/^[：:·・]/.test(out)) problems.push(`${label}：記憶句開頭是孤兒標點（標籤被剝掉留下的）→ 「${out.slice(0, 30)}…」`);
    else if (out.length > 160) problems.push(`${label}：記憶句 ${out.length} 字，超過 160 上限`);
    else {
      const miss = mustHave.filter(k => out.indexOf(k) < 0);
      if (miss.length) problems.push(`${label}：記憶句漏掉這回合的關鍵字【${miss.join('】【')}】→ 「${out}」`);
    }
  }
  // 接線：存歷史的那一行必須真的走 narrateMemoryLine_——函式寫對了但沒接上，等於沒改
  const wired = SRC.match(/speaker:\s*"player",\s*content:\s*(\w+)\(promptText\)/);
  if (!wired) problems.push('抓不到「存進歷史的玩家那一句」是怎麼組的（saveGameHistoryBatch 改寫法了？）');
  else if (wired[1] !== 'narrateMemoryLine_') {
    problems.push(`存進歷史的玩家那一句走的是 ${wired[1]}()，不是 narrateMemoryLine_()`
      + '——cleanNarrateEcho_ 是給【玩家看】的 80 字摘要，戰鬥回合會取到角色卡碎片，AI 下一回合就失憶了');
  }

  // 歷史深度：solo 一次按鍵＝一輪，只餵 2 筆等於只記得上一個按鍵
  const m = SRC.match(/getGameHistoryBatchRaw\(pcId,\s*(\d+)\)/);
  if (!m) problems.push('抓不到 solo 的歷史深度設定（getGameHistoryBatchRaw 改寫法了？）');
  else if (parseInt(m[1]) < 4) problems.push(`solo 歷史只餵 ${m[1]} 筆＝${Math.floor(m[1] / 2)} 個按鍵，太淺——移動→戰鬥→休息走到第三步就忘了第一步`);
}

console.log(`🧵 solo 敘事記憶：按鈕情境 ${CASES.length} 種、歷史深度 ${(SRC.match(/getGameHistoryBatchRaw\(pcId,\s*(\d+)\)/) || [, '?'])[1]} 筆`);
if (problems.length) { console.log(`  ❌ ${problems.length} 處`); problems.forEach(p => console.log('     ' + p)); }
else console.log('  ✅ 全部通過');
process.exit(problems.length ? 1 : 0);
