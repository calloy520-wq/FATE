import express from 'express';
import path from 'path';
import fs from 'fs';
import vm from 'vm';
import os from 'os';
import cp from 'child_process';

const app = express();
const PORT = 3000;

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Database Path
const dbPath = path.join(process.cwd(), 'db.json');

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

// Spreadsheet Class for Google Sheets Spreadsheet simulation
class Spreadsheet {
  dbPath: string;
  store: any;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.store = {};
    this.load();
  }

  load() {
    if (fs.existsSync(this.dbPath)) {
      try {
        this.store = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
      } catch (err) {
        console.error("Error reading database file, resetting:", err);
        this.store = {};
      }
    } else {
      this.store = {};
    }
  }

  save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.store, null, 2));
  }

  // 🔴 修復：真實GAS的getSheetByName()在表不存在時回傳null，呼叫端(ensureFateSheets_)靠這個
  //   判斷「是不是第一次建立」來決定要不要寫表頭/灌種子資料。這裡不能像之前一樣自動補空陣列——
  //   一旦永遠回傳真值，existing永遠是truthy，insertSheet那個「真正寫表頭+種子資料」的分支就
  //   永遠執行不到，db.json每張表都會停在空陣列、沒有表頭沒有種子資料。
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

// Google Apps Script Global Services Mocks
const SpreadsheetApp = {
  activeSpreadsheet: null as any,
  init: (dbPath: string) => {
    SpreadsheetApp.activeSpreadsheet = new Spreadsheet(dbPath);
  },
  getActiveSpreadsheet: () => {
    return SpreadsheetApp.activeSpreadsheet;
  }
};

SpreadsheetApp.init(dbPath);

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
    const store = new Map();
    return {
      get: (key: string) => store.get(key) || null,
      put: (key: string, value: string, seconds: number) => store.set(key, value),
      remove: (key: string) => store.delete(key)
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
      // Synchronous blocking sleep for GAS engine execution inside VM
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

    // If calling OpenRouter, but no OPENROUTER_API_KEY is found and we have GEMINI_API_KEY
    if (url.includes('openrouter.ai') && !process.env.OPENROUTER_API_KEY && process.env.GEMINI_API_KEY) {
      console.log(`⚠️  [AI ROUTING WARNING] OPENROUTER_API_KEY not found.`);
      console.log(`🔄 Redirecting to Gemini OpenAI compatibility endpoint...`);
      console.log(`💡 Note: Parameters like repetition_penalty or custom passthrough models may not be natively supported by Gemini compatibility layer.`);
      
      targetUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      targetHeaders['Authorization'] = `Bearer ${process.env.GEMINI_API_KEY}`;
      
      // Map requested models to standard Gemini models
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
      
      // Cleanup
      try { fs.unlinkSync(tempInPath); } catch(_) {}
      try { fs.unlinkSync(tempOutPath); } catch(_) {}

      return {
        getContentText: () => responseText,
        getResponseCode: () => 200
      };
    } catch (err) {
      console.error("UrlFetchApp.fetch error:", err);
      try { fs.unlinkSync(tempInPath); } catch(_) {}
      try { fs.unlinkSync(tempOutPath); } catch(_) {}
      throw err;
    }
  }
};

const Logger = {
  log: (...args: any[]) => console.log('[GAS Logger]', ...args)
};

// Create VM sandbox context with mock GAS globals
const sandboxContext = {
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

const sandbox = vm.createContext(sandboxContext);

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

const gsDir = path.join(process.cwd(), 'gas');
let combinedGsCode = '';

for (const file of preferredOrder) {
  const filePath = path.join(gsDir, file);
  if (fs.existsSync(filePath)) {
    combinedGsCode += `\n// --- FILE: ${file} ---\n` + fs.readFileSync(filePath, 'utf-8');
  }
}

// Evaluate combined GAS codebase inside the VM sandbox
try {
  vm.runInContext(combinedGsCode, sandbox, { filename: 'FATE_COMBINED_GAS.js' });
  console.log("Successfully compiled and loaded all Google Apps Script files.");
} catch (err) {
  console.error("FATAL: Failed to evaluate combined GAS codebase:", err);
  process.exit(1);
}

// Auto-initialize the database with standard FATE sheets and seed values if not already set up
try {
  const ss = (sandbox as any).SpreadsheetApp.getActiveSpreadsheet();
  (sandbox as any).ensureFateSheets_(ss);
  console.log("FATE database sheets auto-initialized and seeded successfully in db.json.");
} catch (err) {
  console.error("Error auto-initializing database sheets:", err);
}

// Route to run GAS server-side functions called by the client
app.post('/api/run', (req, res) => {
  const { functionName, args } = req.body;
  try {
    const fn = (sandbox as any)[functionName];
    if (typeof fn !== 'function') {
      console.warn(`Function ${functionName} not found on GAS backend.`);
      return res.status(404).json({ success: false, error: `Function ${functionName} not found` });
    }

    const result = fn(...(args || []));
    res.json({ success: true, result });
  } catch (err: any) {
    console.error(`Error executing ${functionName}:`, err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// Serve main Index page with processed script/style templates
app.get('/', (req, res) => {
  try {
    const gasDir = path.join(process.cwd(), 'gas');
    let html = fs.readFileSync(path.join(gasDir, 'Index.html'), 'utf-8');

    // Replace Style Template
    const styleContent = fs.readFileSync(path.join(gasDir, 'Style.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Style['"]\)\.getContent\(\);\s*\?>/gi, styleContent);

    // Replace Script Template
    const scriptContent = fs.readFileSync(path.join(gasDir, 'Script.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Script['"]\)\.getContent\(\);\s*\?>/gi, scriptContent);

    // Replace Script_Onboarding Template
    const onboardingContent = fs.readFileSync(path.join(gasDir, 'Script_Onboarding.html'), 'utf-8');
    html = html.replace(/<\?!=\s*HtmlService\.createHtmlOutputFromFile\(['"]Script_Onboarding['"]\)\.getContent\(\);\s*\?>/gi, onboardingContent);

    // Replace Script_Kanshou Template
    const kanshouContent = fs.readFileSync(path.join(gasDir, 'Script_Kanshou.html'), 'utf-8');
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
