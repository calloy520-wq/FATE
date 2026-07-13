import express from 'express';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import os from 'os';
import cp from 'child_process';
import { Worker } from 'worker_threads';

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Database Path
const dbPath = path.join(process.cwd(), 'db.json');
const gsDir = path.join(process.cwd(), 'gas');

// Range Class for Google Sheets Range simulation
class Range {
  sheet: any;
  row: number;
  col: number;
  numRows: number;
  numCols: number;

  constructor(sheet: any, row: number, col: number, numRows: number, numCols: number) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const values: any[][] = [];
    const maxRow = Math.min(this.sheet.data.length, this.row - 1 + this.numRows);
    for (let r = this.row - 1; r < maxRow; r++) {
      const rowData = this.sheet.data[r] || [];
      const colData: any[] = [];
      const maxCol = this.col - 1 + this.numCols;
      for (let c = this.col - 1; c < maxCol; c++) {
        colData.push((rowData[c] !== undefined && rowData[c] !== null) ? rowData[c] : "");
      }
      values.push(colData);
    }
    while (values.length < this.numRows) {
      values.push(new Array(this.numCols).fill(""));
    }
    return values;
  }

  setValues(values: any[][]) {
    for (let r = 0; r < values.length; r++) {
      const targetRow = this.row - 1 + r;
      if (!this.sheet.data[targetRow]) {
        this.sheet.data[targetRow] = [];
      }
      for (let c = 0; c < values[r].length; c++) {
        const targetCol = this.col - 1 + c;
        this.sheet.data[targetRow][targetCol] = values[r][c];
      }
    }
    this.sheet.save();
  }

  getValue() {
    const values = this.getValues();
    return values[0][0];
  }

  setValue(value: any) {
    this.setValues([[value]]);
  }
}

// Sheet Class for Google Sheets Sheet simulation
class Sheet {
  name: string;
  spreadsheet: any;
  data: any[][];

  constructor(name: string, spreadsheet: any) {
    this.name = name;
    this.spreadsheet = spreadsheet;
    if (!this.spreadsheet.store[name]) {
      this.spreadsheet.store[name] = [];
    }
    this.data = this.spreadsheet.store[name];
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    return this.data.length;
  }

  getLastColumn() {
    let maxCol = 0;
    for (const r of this.data) {
      if (r.length > maxCol) maxCol = r.length;
    }
    return maxCol;
  }

  getDataRange() {
    return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn());
  }

  getRange(row: number, col: number, numRows?: number, numCols?: number) {
    return new Range(this, row, col, numRows !== undefined ? numRows : 1, numCols !== undefined ? numCols : 1);
  }

  setFrozenRows(num: number) {
    // No-op
  }

  deleteRow(rowIndex: number) {
    if (rowIndex >= 1 && rowIndex <= this.data.length) {
      this.data.splice(rowIndex - 1, 1);
      this.save();
    }
  }

  appendRow(rowArray: any[]) {
    this.data.push(rowArray);
    this.save();
  }

  clearContents() {
    if (this.data.length > 1) {
      this.data.splice(1);
    } else {
      this.data = [];
    }
    this.save();
  }

  save() {
    this.spreadsheet.save();
  }
}

// Spreadsheet Class for Google Sheets Spreadsheet simulation.
// 🧵 2026-07 併發修復：不再自己管dbPath/fs讀寫——store由呼叫端(主執行緒或worker)注入，
//   save()只透過onSave回呼通知「資料變了」，實際要不要落地寫db.json由呼叫端決定。這樣同一套
//   class main thread(啟動時初始化用)跟worker thread(每個請求執行用)都能共用，不必寫兩份。
class Spreadsheet {
  store: any;
  onSave: () => void;

  constructor(store: any, onSave?: () => void) {
    this.store = store || {};
    this.onSave = onSave || (() => {});
  }

  save() {
    this.onSave();
  }

  //   判斷「是不是第一次建立」來決定要不要寫表頭/灌種子資料。這裡不能自動補空陣列——一旦永遠
  //   回傳真值，existing永遠是truthy，insertSheet那個「真正寫表頭+種子資料」的分支就永遠執行
  //   不到，每張表都會停在空陣列、沒有表頭沒有種子資料。
  getSheetByName(name: string) {
    return Object.prototype.hasOwnProperty.call(this.store, name) ? new Sheet(name, this) : null;
  }

  insertSheet(name: string) {
    if (!this.store[name]) {
      this.store[name] = [];
    }
    this.save();
    return new Sheet(name, this);
  }
}

// 🧵 2026-07 併發修復：組出一整套GAS全域服務mock，餵給vm sandbox用。抽成獨立函式(而非模組層級
//   單例)是為了main thread(啟動初始化)跟每個worker thread(執行單一請求)都能各自建一份獨立的
//   sandbox——避免多個請求共用同一份可變狀態，也讓每個worker的store完全由呼叫端注入/取回，
//   不必自己碰db.json。UrlFetchApp.fetch/Utilities.sleep仍是同步阻塞寫法(GAS原生語意本來就是
//   同步呼叫，沒辦法改成async又不碰gas/*.gs)，但因為整段執行都在獨立worker thread裡跑，阻塞
//   的只有那顆worker，不會凍結主執行緒的Express伺服器讓其他玩家的畫面卡死。
function buildSandbox(store: any, onSave: () => void) {
  const ss = new Spreadsheet(store, onSave);
  const SpreadsheetApp = {
    activeSpreadsheet: ss as any,
    getActiveSpreadsheet: () => SpreadsheetApp.activeSpreadsheet
  };

  const PropertiesService = {
    getScriptProperties: () => {
      return {
        getProperty: (key: string) => {
          if (key === 'API_KEY' || key === 'OPENROUTER_API_KEY' || key === 'OPENROUTER_KEY' || key === 'OPENROUTER') {
            return process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || '';
          }
          return process.env[key] || '';
        },
        setProperty: (key: string, val: string) => {
          process.env[key] = val;
        }
      };
    }
  };

  const CacheService = {
    getScriptCache: () => {
      const store2 = new Map();
      return {
        get: (key: string) => store2.get(key) || null,
        put: (key: string, value: string, seconds: number) => store2.set(key, value),
        remove: (key: string) => store2.delete(key)
      };
    }
  };

  const LockService = {
    getScriptLock: () => {
      return {
        tryLock: (timeout: number) => true,
        releaseLock: () => {}
      };
    }
  };

  const Utilities = {
    sleep: (ms: number) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        // Synchronous blocking sleep — safe here because this only runs inside an isolated
        // worker thread, never on the main thread that serves other players.
      }
    }
  };

  const UrlFetchApp = {
    fetch: (url: string, options: any) => {
      let targetUrl = url;
      let targetHeaders = { ...(options.headers || {}) };
      let payloadObj = JSON.parse(options.payload || '{}');

      console.log(`\n========================================`);
      console.log(`📡 [GAS Simulator API] REQUEST TRIGGERED`);
      console.log(`🔗 URL: ${url}`);
      console.log(`🤖 Requested Model: ${payloadObj.model}`);
      console.log(`🌡️  Temperature: ${payloadObj.temperature} | Top P: ${payloadObj.top_p}`);
      if (payloadObj.repetition_penalty) console.log(`🔄 Repetition Penalty: ${payloadObj.repetition_penalty}`);
      if (payloadObj.top_k) console.log(`🎯 Top K: ${payloadObj.top_k}`);

      if (url.includes('openrouter.ai') && !process.env.OPENROUTER_API_KEY && process.env.GEMINI_API_KEY) {
        console.log(`⚠️  [AI ROUTING WARNING] OPENROUTER_API_KEY not found.`);
        console.log(`🔄 Redirecting to Gemini OpenAI compatibility endpoint...`);
        console.log(`💡 Note: Parameters like repetition_penalty or custom passthrough models may not be natively supported by Gemini compatibility layer.`);

        targetUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
        targetHeaders['Authorization'] = `Bearer ${process.env.GEMINI_API_KEY}`;

        const originalModel = payloadObj.model || '';
        if (originalModel.includes('grok') || originalModel.includes('pro') || originalModel.includes('deepseek-r1')) {
          payloadObj.model = 'gemini-2.5-pro';
        } else {
          payloadObj.model = 'gemini-2.5-flash';
        }
        console.log(`➡️  Mapped Model: ${payloadObj.model}`);
      } else if (url.includes('openrouter.ai') && process.env.OPENROUTER_API_KEY) {
        console.log(`✅ [AI ROUTING] OPENROUTER_API_KEY found! Forwarding directly to OpenRouter.`);
        targetHeaders['Authorization'] = `Bearer ${process.env.OPENROUTER_API_KEY}`;
      }
      console.log(`========================================\n`);

      const headerArgs: string[] = [];
      for (const [key, value] of Object.entries(targetHeaders)) {
        headerArgs.push('-H', `${key}: ${value}`);
      }

      const bodyStr = JSON.stringify(payloadObj);
      const tempInPath = path.join(os.tmpdir(), `api_req_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
      const tempOutPath = path.join(os.tmpdir(), `api_res_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);

      fs.writeFileSync(tempInPath, bodyStr);

      try {
        const curlCmd = [
          'curl',
          '-s',
          '-X', options.method ? options.method.toUpperCase() : 'POST',
          ...headerArgs,
          '-d', `@${tempInPath}`,
          `"${targetUrl}"`,
          '-o', `"${tempOutPath}"`
        ].join(' ');

        cp.execSync(curlCmd, { stdio: 'ignore' });

        const responseText = fs.readFileSync(tempOutPath, 'utf-8');

        try { fs.unlinkSync(tempInPath); } catch (_) {}
        try { fs.unlinkSync(tempOutPath); } catch (_) {}

        return {
          getContentText: () => responseText,
          getResponseCode: () => 200
        };
      } catch (err) {
        console.error("UrlFetchApp.fetch error:", err);
        try { fs.unlinkSync(tempInPath); } catch (_) {}
        try { fs.unlinkSync(tempOutPath); } catch (_) {}
        throw err;
      }
    }
  };

  const Logger = {
    log: (...args: any[]) => console.log('[GAS Logger]', ...args)
  };

  return {
    PropertiesService,
    CacheService,
    UrlFetchApp,
    LockService,
    SpreadsheetApp,
    Logger,
    Utilities,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
}

// Load and concatenate all .gs files in precise order to preserve const/let scoping and initialization
const preferredOrder = [
  'Core_Settings.gs',
  'Seed_Codex.gs',
  'Seed_Rivals.gs',
  'Setup_FateWorld.gs',
  'Time_World.gs',
  'History_Sync.gs',
  'Account.gs',
  'Mystic_Code.gs',
  'Gallery.gs',
  'Engine_Combat.gs',
  'Engine_Fate.gs',
  'Router_Action.gs',
  'Router_Battle.gs',
  'Router_Bond.gs',
  'Router_Creation.gs',
  'Router_Economy.gs',
  'Router_Movement.gs',
  'Router_Narrative.gs',
  'Router_Persona.gs'
];

let combinedGsCode = '';
for (const file of preferredOrder) {
  const filePath = path.join(gsDir, file);
  if (fs.existsSync(filePath)) {
    combinedGsCode += `\n// --- FILE: ${file} ---\n` + fs.readFileSync(filePath, 'utf-8');
  }
}

// ---- Canonical in-memory store (main thread only). Every request is processed one-at-a-time
// through a Worker (see runInWorker/taskQueue below), so there is never more than one writer
// mutating `store` at a time — no lost-update races, even though each request's actual GAS
// execution happens off the main thread.
let store: any = {};
if (fs.existsSync(dbPath)) {
  try {
    store = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  } catch (err) {
    console.error("Error reading database file, resetting:", err);
    store = {};
  }
}

function persist() {
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2));
}

// ---- One-time startup initialization (main thread, synchronous — fine, happens once before
// the server starts accepting connections, no concurrent players yet).
try {
  const sandbox = vm.createContext(buildSandbox(store, persist));
  vm.runInContext(combinedGsCode, sandbox, { filename: 'FATE_COMBINED_GAS.js' });
  console.log("Successfully compiled and loaded all Google Apps Script files.");
  const ss = (sandbox as any).SpreadsheetApp.getActiveSpreadsheet();
  (sandbox as any).ensureFateSheets_(ss);
  persist();
  console.log("FATE database sheets auto-initialized and seeded successfully in db.json.");
} catch (err) {
  console.error("FATAL: Failed to evaluate combined GAS codebase or initialize sheets:", err);
  process.exit(1);
}

// ---- Per-request execution: each call to a GAS function runs inside its own isolated Worker
// thread. UrlFetchApp.fetch/Utilities.sleep inside that worker still block synchronously (GAS's
// real execution model is synchronous — rewriting to async would mean the .gs files no longer
// behave the same on the real GAS deploy), but because it's confined to a worker thread, it only
// blocks THAT worker, never the shared Express process serving everyone else.
//
// Requests are still funneled through a strict FIFO queue (taskQueue) rather than run truly in
// parallel: each worker gets the current canonical `store`, and only one worker's result is ever
// being merged back at a time. This trades true concurrency for correctness — without per-row
// merging (a much bigger undertaking), running many workers fully in parallel against snapshots
// of `store` risks one player's finished write silently clobbering another's still-in-flight
// change. Queuing means players wait their turn instead of racing, but nobody's screen freezes
// waiting on someone else's slow AI call — the server itself stays responsive throughout.
const WORKER_SOURCE = `
const { workerData, parentPort } = require('worker_threads');
const vm = require('vm');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

${Range.toString()}
${Sheet.toString()}
${Spreadsheet.toString()}
${buildSandbox.toString()}

try {
  const sandbox = vm.createContext(buildSandbox(workerData.store, () => {}));
  vm.runInContext(workerData.gsCode, sandbox, { filename: 'FATE_COMBINED_GAS.js' });
  const fn = sandbox[workerData.functionName];
  if (typeof fn !== 'function') {
    parentPort.postMessage({ success: false, error: 'Function ' + workerData.functionName + ' not found', store: workerData.store });
  } else {
    const result = fn.apply(null, workerData.args || []);
    parentPort.postMessage({ success: true, result: result, store: workerData.store });
  }
} catch (err) {
  parentPort.postMessage({ success: false, error: (err && err.message) || String(err), store: workerData.store });
}
`;

function runInWorker(functionName: string, args: any[]): Promise<{ success: boolean; result?: any; error?: string }> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { functionName, args, store, gsCode: combinedGsCode }
    });
    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`⏱️  Worker timeout executing ${functionName}, terminating.`);
      worker.terminate();
      resolve({ success: false, error: 'Worker execution timed out' });
    }, 60000);

    worker.on('message', (msg: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (msg && msg.store) {
        store = msg.store;
        try { persist(); } catch (e) { console.error('Failed to persist db.json:', e); }
      }
      resolve(msg);
      worker.terminate();
    });
    worker.on('error', (err: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ success: false, error: (err && err.message) || String(err) });
    });
  });
}

let taskQueue: Promise<void> = Promise.resolve();

// Route to run GAS server-side functions called by the client
app.post('/api/run', (req, res) => {
  const { functionName, args } = req.body;
  taskQueue = taskQueue
    .then(() => runInWorker(functionName, args))
    .then((msg: any) => {
      if (msg.success) {
        res.json({ success: true, result: msg.result });
      } else {
        console.error(`Error executing ${functionName}:`, msg.error);
        res.status(500).json({ success: false, error: msg.error });
      }
    })
    .catch((err: any) => {
      try { res.status(500).json({ success: false, error: (err && err.message) || String(err) }); } catch (_) {}
    });
});

// Serve main Index page with processed script/style templates
app.get('/', (req, res) => {
  try {
    let html = fs.readFileSync(path.join(gsDir, 'Index.html'), 'utf-8');

    // Replace Style Template
    const styleContent = fs.readFileSync(path.join(gsDir, 'Style.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Style['"]\)\.getContent\(\);\s*\?>/gi, styleContent);

    // Replace Script Template
    const scriptContent = fs.readFileSync(path.join(gsDir, 'Script.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Script['"]\)\.getContent\(\);\s*\?>/gi, scriptContent);

    // Replace Script_Onboarding Template
    const onboardingContent = fs.readFileSync(path.join(gsDir, 'Script_Onboarding.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Script_Onboarding['"]\)\.getContent\(\);\s*\?>/gi, onboardingContent);

    // Replace Script_Kanshou Template
    const kanshouContent = fs.readFileSync(path.join(gsDir, 'Script_Kanshou.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Script_Kanshou['"]\)\.getContent\(\);\s*\?>/gi, kanshouContent);

    // Inject client-side google.script.run Mock at the top of <body>
    const googleMockScript = `
<script>
window.google = {
  script: {
    run: {
      withSuccessHandler: function(successCallback) {
        return {
          withFailureHandler: function(failureCallback) {
            return new Proxy({}, {
              get: function(target, propName) {
                return function(...args) {
                  fetch('/api/run', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      functionName: propName,
                      args: args
                    })
                  })
                  .then(response => {
                    if (!response.ok) {
                      throw new Error('Network response was not ok: ' + response.statusText);
                    }
                    return response.json();
                  })
                  .then(data => {
                    if (data.success === false) {
                      if (failureCallback) failureCallback(new Error(data.error));
                    } else {
                      if (successCallback) successCallback(data.result);
                    }
                  })
                  .catch(err => {
                    if (failureCallback) failureCallback(err);
                  });
                };
              }
            });
          },
          ...new Proxy({}, {
            get: function(target, propName) {
              return function(...args) {
                fetch('/api/run', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    functionName: propName,
                    args: args
                  })
                })
                .then(response => {
                  if (!response.ok) {
                    throw new Error('Network response was not ok');
                  }
                  return response.json();
                })
                .then(data => {
                  if (successCallback && data.success) successCallback(data.result);
                })
                .catch(err => console.error(err));
              };
            }
          })
        };
      },
      withFailureHandler: function(failureCallback) {
        return {
          withSuccessHandler: function(successCallback) {
            return new Proxy({}, {
              get: function(target, propName) {
                return function(...args) {
                  fetch('/api/run', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      functionName: propName,
                      args: args
                    })
                  })
                  .then(response => response.json())
                  .then(data => {
                    if (data.success === false) {
                      if (failureCallback) failureCallback(new Error(data.error));
                    } else {
                      if (successCallback) successCallback(data.result);
                    }
                  })
                  .catch(err => {
                    if (failureCallback) failureCallback(err);
                  });
                };
              }
            });
          }
        };
      },
      ...new Proxy({}, {
        get: function(target, propName) {
          return function(...args) {
            fetch('/api/run', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                functionName: propName,
                args: args
              })
            });
          };
        }
      })
    }
  }
};
</script>
`;

    // Insert mock script immediately after the opening <body> tag
    const bodyStartIdx = html.toLowerCase().indexOf('<body>');
    if (bodyStartIdx !== -1) {
      const insertPos = bodyStartIdx + 6;
      html = html.slice(0, insertPos) + googleMockScript + html.slice(insertPos);
    } else {
      html = googleMockScript + html;
    }

    res.send(html);
  } catch (err: any) {
    console.error("Error building Index page:", err);
    res.status(500).send(`Error assembling index page: ${err.message || err}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FATE local-GAS server running on http://localhost:${PORT}`);
});
