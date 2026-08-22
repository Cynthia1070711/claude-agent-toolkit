# Chrome MCP 觀察員模式 SOP

## 核心概念:中控是觀察員,不是操作者

| 角色 | 動作 | 禁止 |
|------|------|------|
| **使用者** | 手動操作瀏覽器(click/type/drag/press) | — |
| **中控 (orchestrator)** | 觀察 + 證據收集 + 分析 | click/type/fill/drag/press_key |
| **Sub-agent** | Read 程式碼 + 深度分析 | 使用 Chrome MCP 工具 |

---

## 7 個工具集(最小必要)

| 工具 | 用途 | 使用頻率 |
|------|------|:-------:|
| `list_pages` | 確認 Chrome 連線 + 取得 page ID | 每模組 1 次 |
| `navigate_page` | 開啟目標 URL / 登出 / 回上一頁 | 每模組 2-5 次 |
| `take_snapshot` | DOM 結構快照(含 uid 定位) | 每回饋 1 次 |
| `take_screenshot` | 視覺證據(含 fullPage option) | 每回饋 1 次 |
| `list_console_messages` | JS errors / warnings / info | 每回饋 1 次 |
| `list_network_requests` | API 4xx / 5xx / timing | 每回饋 1 次 |
| `evaluate_script` | Fabric.js 物件查詢 / clear storage | Canvas 物件問題時 |

**不使用的工具**:
- ❌ `click` / `dblClick` — 使用者的工作
- ❌ `type_text` / `fill` / `fill_form` — 使用者的工作
- ❌ `drag` / `hover` — 使用者的工作
- ❌ `press_key` — 使用者的工作
- ❌ `upload_file` — 使用者的工作

---

## 4 Phase SOP

### Phase A: 模組初始化(每個 L2 模組開始時執行 1 次)

```
Step A.1 中控執行
  mcp__chrome-devtools__list_pages
    → 確認 Chrome 已連線且有可用 page
    → 若無 page,提示 Alan 手動開啟 Chrome + 連線
  
  mcp__chrome-devtools__navigate_page
    → url: https://localhost:7135/editor/{projectId}
    → 觸發 page 載入
  
  mcp__chrome-devtools__take_snapshot
    → 儲存為基線 snapshot (不寫檔,僅記憶作為後續對比)

Step A.2 中控顯示給 Alan
  """
  📋 L2 模組測試準備就緒
  
  模組: {DataSourcePanel}
  URL: /editor/{projectId}
  目標: 測試 Excel 上傳、CSV 匯入、欄位映射、配額限制
  
  請使用以下帳號依序登入測試(中控持續觀察):
  1. user1@example.com (Free)
  2. user2@example.com (Basic)
  3. user3@example.com (Advanced)
  4. user4@example.com (Professional)
  5. user5@example.com (Business)
  
  密碼: ExamplePw123
  
  測試劇本:
  [1] 上傳 Excel (50 列內 / 50 列邊界 / 51 列 / 5001 列)
  [2] 上傳 CSV (UTF-8 / Big5 / 密碼保護)
  [3] 欄位映射操作
  [4] 切換 API 模式 (Business 帳號)
  
  有問題隨時告訴我,我會立即截圖留證。
  """
```

### Phase B: 觀察與證據收集(使用者測試中)

```
Step B.1 等待使用者回饋
  使用者說: "[A1] Excel 上傳 51 列,沒有任何提示就截斷了"

Step B.2 中控立即執行(5 秒內)
  // 並行執行多個 Chrome MCP 工具
  Parallel [
    mcp__chrome-devtools__take_snapshot → 
      filePath: "docs/tracking/active/evidence/{module}-{plan}-{seq}.snapshot.md"
    
    mcp__chrome-devtools__take_screenshot →
      filePath: "docs/tracking/active/evidence/{module}-{plan}-{seq}.png"
      fullPage: true
    
    mcp__chrome-devtools__list_console_messages →
      types: ["error", "warn"]
      includePreservedMessages: true
    
    mcp__chrome-devtools__list_network_requests →
      resourceTypes: ["xhr", "fetch"]
      (過濾 status >= 400)
  ]

Step B.3 證據整理
  建立 feedback item:
  {
    id: "{module}-{plan}-{seq}",
    timestamp: "2026-04-07T10:30:15+08:00",
    user_feedback: "[A1] Excel 上傳 51 列,沒有任何提示就截斷了",
    evidence: {
      snapshot: "docs/tracking/active/evidence/...",
      screenshot: "docs/tracking/active/evidence/...",
      console_errors: [...],
      network_failures: [...]
    }
  }

Step B.4 進入 Sub-agent 委派
  → 跳到 sub-agent-pivot-template.md
```

### Phase C: Plan 切換 SOP(使用者切換帳號時執行)

```
Step C.1 中控偵測 Plan 切換需求
  觸發條件:
    - 使用者明確說 "切到 A2"
    - 或使用者完成一個 Plan 的所有測試劇本

Step C.2 中控執行清理
  mcp__chrome-devtools__navigate_page
    → url: https://localhost:7135/Account/Logout
    → 觸發登出
  
  mcp__chrome-devtools__evaluate_script
    → function: "() => { 
        localStorage.clear(); 
        sessionStorage.clear();
        document.cookie.split(';').forEach(c => {
          const eqPos = c.indexOf('=');
          const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        });
        return 'cleared';
      }"

Step C.3 中控提示 Alan
  "已登出 + 清除 localStorage/sessionStorage/cookies,
   請以 user2@example.com 登入並回到 /editor/{projectId}。"

Step C.4 使用者登入後
  mcp__chrome-devtools__take_snapshot
    → 確認登入狀態 (檢查 header 顯示的使用者名稱)
  
  mcp__chrome-devtools__evaluate_script
    → function: "() => window.__currentUser || null"
    → 確認前端 state 的 user 物件為 A2
```

### Phase D: 模組測試結束(Alan 確認時執行)

```
Step D.1 中控執行最終 snapshot
  mcp__chrome-devtools__take_snapshot → final-{module}.snapshot.md

Step D.2 更新 Story status
  所有相關 Stories: in-progress (保持,Phase 3.5 統一處理)
  
Step D.3 檢查 Skill Sync Pool
  → 是否達到批次同步閾值 (5 corrections / 或結束日)
  → 若達到,觸發批次 Skill edit

Step D.4 告知 Alan
  "模組 {module} 測試完成。
   累積問題: {N} 個
   涉及 Stories: {list}
   Skill Sync Pool 狀態: {status}
   
   下一個模組選項:
   [1] 繼續測試 {next_module}
   [2] 暫停休息
   [3] 結束 Phase 3 進入 3.5 Refinement"
```

---

## Canvas 物件查詢(Fabric.js 特有)

由於 Fabric.js 物件不在 DOM 中,需要使用 `evaluate_script` 查詢:

```javascript
// 查詢所有 canvas 物件
() => {
  const canvas = window.fabricCanvas || window.__canvas;
  if (!canvas) return { error: 'canvas not found' };
  return canvas.getObjects().map(obj => ({
    type: obj.type,
    objectType: obj.objectType,
    left: obj.left,
    top: obj.top,
    width: obj.width,
    height: obj.height,
    visible: obj.visible,
    locked: obj.lockMovementX && obj.lockMovementY,
    data: obj.data
  }));
}

// 查詢選取物件
() => {
  const canvas = window.fabricCanvas;
  const active = canvas?.getActiveObject();
  return active ? {
    type: active.type,
    uid: active.data?.uid,
    props: { left: active.left, top: active.top, width: active.width, height: active.height }
  } : null;
}

// 查詢 viewportTransform(縮放/平移狀態)
() => {
  const canvas = window.fabricCanvas;
  return canvas?.viewportTransform || null;
}
```

---

## 證據檔案命名規範

```
docs/tracking/active/evidence/{epic}/{module}/{plan}-{seq}.{ext}

範例:
evidence/epic-eft/data-source-panel/A1-01.snapshot.md
evidence/epic-eft/data-source-panel/A1-01.png
evidence/epic-eft/data-source-panel/A2-01.snapshot.md
evidence/epic-eft/data-source-panel/A2-01.png
```

---

## FORBIDDEN

- ❌ 中控使用 click/type/fill/drag/press_key 主動操作瀏覽器
- ❌ 觸發 JavaScript dialog(alert/confirm/prompt)— 會鎖死 Chrome MCP
- ❌ 使用者測試時中控搶先操作
- ❌ 忘記在 Plan 切換時清 cookies/storage(會造成 session 污染)
- ❌ 長時間不 take_snapshot(錯過證據收集時機)
- ❌ Canvas 物件問題用 DOM 定位(應該用 evaluate_script)
