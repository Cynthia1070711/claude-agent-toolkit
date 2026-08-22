# Rotation SSoT 設計細節（Mode B 專用）

> 本文件為 `phycool-otel-micro-collector` SKILL §S13 的深度補充。
> 正式決策見 `docs/technical-decisions/ADR-INFRA-001-otel-rotation-ssot.md`。

---

## 1. 設計原則（三原則）

### 1.1 SSoT by Writer

**原則**: Path of Truth 的發佈權屬於唯一 writer（collector），不是 hook、不是 aggregate。

**理由**:
- Collector 是唯一知道「現在正在寫哪個檔」的進程
- Hook 只看到啟動瞬間的狀態，無法感知之後的跨日
- Aggregate 任何推算（today、glob、mtime）都是「事後猜測」，有 race condition

**實踐**: Collector 啟動時 + 每次 rotate 時，原子寫 `logs/main-otel-info.json`。

### 1.2 Self-Rotating Writer

**原則**: Rotation 在 writer 端完成，不靠外部進程重啟。

**理由**:
- 重啟 = 斷流（in-flight OTLP export 失敗）
- 重啟需要跨進程 state 同步（誰清 port.txt？誰更新 info.json？）
- 重啟觸發時機難定（每小時檢查？每次寫入？）

**實踐**: `rotateIfNeeded()` 在每次 `appendJsonl()` 前呼叫，零開銷（字串比較 + 早退）。

### 1.3 Glob-Resilient Reader

**原則**: Reader 不信任任何「單點檔名推算」，必須掃描並以 marker 作冪等保證。

**理由**:
- 跨日瞬間 00:00:00：一筆 trace 可能寫在舊檔，下一筆在新檔
- Collector 崩潰重啟：新 collector 可能開了新檔，但舊資料未聚合
- Marker 以「檔案絕對路徑」為 key，保證同檔不重讀、不遺失

**實踐**: `getSharedJsonlCandidates()` = {info.json.jsonl} ∪ {glob main-otel-*.jsonl}。

---

## 2. 資料流

```
Claude CLI (OTLP export)
       │
       ▼
┌────────────────────────────────────┐
│  Collector (long-running writer)    │
│  port 49200, PID N                  │
│                                      │
│  On POST /v1/logs:                  │
│    rotateIfNeeded()                 │
│      if (today !== currentDay):     │
│        close(old)                   │
│        open(new = main-otel-today)  │
│        writeInfoJsonAtomic()        │
│    appendJsonl(currentJsonlPath)    │
└────────────────────────────────────┘
       │                  │
       ▼                  ▼
  logs/main-otel-      logs/main-otel-
  {YYYY-MM-DD}.jsonl   info.json (PoT)
       │                  │
       └──────┬───────────┘
              │ readers ↓
              ▼
┌────────────────────────────────────┐
│  Aggregate (SessionEnd hook)        │
│                                      │
│  getSharedJsonlCandidates():        │
│    1. info.json.jsonl (SSoT)        │
│    2. glob main-otel-*.jsonl (SAFETY)│
│    dedup via Set                    │
│                                      │
│  for each candidate:                │
│    offset = marker[jsonl] || 0      │
│    entries = readFrom(jsonl, offset)│
│    marker[jsonl] = newOffset        │
│    aggregate(entries)               │
│                                      │
│  UPDATE workflow_executions         │
└────────────────────────────────────┘
              │
              ▼
    logs/main-otel-marker.json
    (per-file offset map)
```

---

## 3. 關鍵函式詳解

### 3.1 `rotateIfNeeded(activePort)` (collector)

```javascript
function rotateIfNeeded(activePort) {
  if (!ROTATION_ENABLED) return;            // Mode A/C 跳過
  const today = rotationEnabled_todayStr(); // UTC+8 "YYYY-MM-DD"
  if (today === currentDay) return;         // 同日，快速退出

  // Cross-day: close 舊 + open 新 + publish PoT
  const oldJsonl = currentJsonlPath;
  currentDay = today;
  currentJsonlPath = computeJsonlPathForDay(today);
  writeInfoJsonAtomic(activePort);
  process.stderr.write(
    `[otel-collector] Rotated jsonl: ${basename(oldJsonl)} → ${basename(currentJsonlPath)}\n`
  );
}
```

**注意**:
- `appendFileSync` 會自動建立不存在的檔案，不需要 explicit open()
- 舊檔不用 explicit close（Node.js append 模式每次寫入各自 open/close）
- 若要明確 flush，可在 rotation 時 append 一個 `{"type":"rotation_boundary"}` 標記（未實作）

### 3.2 `writeInfoJsonAtomic(port)` (collector)

```javascript
function writeInfoJsonAtomic(port) {
  if (!ROTATION_ENABLED) return;
  const info = {
    port, jsonl: currentJsonlPath, pid: process.pid,
    startedAt: startedAtIso, currentDay,
    updatedAt: new Date().toISOString(),
  };
  const tmpPath = infoJsonPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(info, null, 2), 'utf8');
  fs.renameSync(tmpPath, infoJsonPath);  // atomic on same fs
}
```

**原子性保證**:
- Windows NTFS + Linux ext4：同磁碟 `rename` 是原子操作
- Reader 永遠讀到完整 JSON 或舊版 JSON，不會讀到半檔
- 若 crash 在 `writeFileSync` 後、`renameSync` 前，`.tmp` 殘留但 `info.json` 保持舊版（仍可用）

### 3.3 `getSharedJsonlCandidates()` (aggregate)

```javascript
function getSharedJsonlCandidates() {
  const results = new Set();
  // Priority 1: info.json PoT
  if (fs.existsSync(infoJsonPath)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
      if (info.jsonl && fs.existsSync(info.jsonl)) {
        results.add(path.resolve(info.jsonl));
      }
    } catch (_) { /* 降級至 glob */ }
  }
  // Priority 2: glob safety net
  try {
    for (const f of fs.readdirSync(logDir)) {
      if (/^main-otel-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) {
        results.add(path.resolve(path.join(logDir, f)));
      }
    }
  } catch (_) { }
  return [...results];
}
```

**設計理由**:
- **雙層 fallback**: info.json 可能暫時損毀或落後 → glob 保底
- **Set dedup**: info.json 和 glob 可能重疊（active jsonl 同時在兩者） → 自動去重
- **絕對路徑**: marker key 必須穩定，相對路徑會因 cwd 不同而變

---

## 4. 邊界 Case 時序圖

### 4.1 跨日 00:00（正常 case）

```
23:59:59  api_request → rotateIfNeeded: today=04-14=currentDay → write 04-14.jsonl
00:00:00  api_request → rotateIfNeeded: today=04-15 ≠ currentDay=04-14
                       → close 04-14.jsonl (logical)
                       → currentJsonlPath = 04-15.jsonl
                       → writeInfoJsonAtomic({jsonl: 04-15})
                       → write 04-15.jsonl
00:00:01  api_request → rotateIfNeeded: today=04-15=currentDay → write 04-15.jsonl

# Aggregate at 00:30:
#   info.json.jsonl = 04-15.jsonl (Priority 1)
#   glob = {04-13, 04-14, 04-15} (Priority 2)
#   Union = {04-13, 04-14, 04-15}
#   marker[04-13] at EOF, marker[04-14] at 23:59:59 entry, marker[04-15] at 00:00:01 entry
#   For each: read new bytes → aggregate → update marker
#   Result: 00:00:00 那筆 token 歸屬 04-15.jsonl 被聚合進 workflow_executions
```

### 4.2 Collector 崩潰重啟（degraded case）

```
10:00  Collector PID=A 正在運行，currentJsonlPath=04-14.jsonl
10:01  Collector A crash (OOM, segfault, ...)
         → info.json 殘留舊值 {jsonl: 04-14, pid: A}
10:02  Next SessionStart: otel-auto-start.js healthCheck port 49200 → fail
         → spawn collector PID=B
         → Collector B 啟動，currentDay=04-14, currentJsonlPath=04-14.jsonl (append)
         → writeInfoJsonAtomic({jsonl: 04-14, pid: B})  # 覆蓋舊 pid

# 潛在資料遺失: 10:01 crash 當下 in-flight 的 OTLP request 失敗（OTel client 有 retry）
# 潛在 marker 問題: 若 crash 前 aggregate 已記 marker[04-14]=X,
#   B 繼續 append 從 X+ delta,marker 保證不重複讀。
```

### 4.3 Aggregate 在 rotate 中途跑（race case）

```
00:00:00.000  Collector 開始 rotate（compute new path）
00:00:00.005  Aggregate 讀 info.json → 此時可能是舊 04-14 or 新 04-15
             情況 A: 讀到舊值
               candidates = {04-14} ∪ glob = {04-13, 04-14}
               (04-15 尚未 glob 到，因為檔案尚未實際寫入)
             情況 B: 讀到新值
               candidates = {04-15} ∪ glob = {04-13, 04-14, 04-15 (if exists)}
00:00:00.010  Collector writeInfoJsonAtomic 完成
00:00:00.015  Aggregate 聚合完畢

# 兩種情況皆 OK: marker 保證下次聚合從 offset 續讀,零遺失。
# 唯一差別: 新 04-15 的初始幾筆可能延到下次 SessionEnd 才聚合（可接受）。
```

---

## 5. 性能考量

### 5.1 每次寫入開銷

`rotateIfNeeded` 在每次 `appendJsonl` 前呼叫。開銷：

| 操作 | 次數 | 開銷 |
|------|------|------|
| `new Date()` | 1 | < 1μs |
| UTC+8 轉換 + `slice(0,10)` | 1 | < 1μs |
| 字串比較 `today === currentDay` | 1 | < 1μs |
| **跨日 branch** | 1/day | close + open + writeFileSync + rename ≈ 5-10ms |

日常寫入成本：**< 3μs**。跨日寫入成本：**< 10ms**（每天一次）。可忽略。

### 5.2 Aggregate 開銷

| 操作 | 次數 | 開銷 |
|------|------|------|
| `readdirSync(logDir)` | 1 | < 5ms |
| Regex 比對每個 filename | N | < 1μs each |
| `fs.statSync` 每檔 | N | < 1ms each |
| `readSync` delta | N | 依 delta 大小（通常 < 10KB） |

N 通常 = 1-3 天的 jsonl。總開銷 < 50ms。

---

## 6. 測試策略

### 6.1 已驗證（手動）

- [x] Collector 啟動寫 info.json（port/jsonl/pid/currentDay 齊全）
- [x] 跨 test + prod mode OTLP POST 寫入成功
- [x] Aggregate glob 多檔（3 個日期檔 case）
- [x] Hot-swap deploy 無 port 衝突

### 6.2 待未來 Story 補強

- [ ] 單元測試：mock Date，驗證 `rotateIfNeeded` 跨日邏輯
- [ ] 整合測試：啟 2 個 collector 模擬崩潰重啟
- [ ] 壓測：高頻寫入下 rotation 是否有 race condition
- [ ] E2E：跨日自然時間驗證（需 cron 排程測試）

---

## 7. 未來擴展

### 7.1 自動歸檔
- Boy Scout: SessionEnd 後,若 `main-otel-*.jsonl` mtime > 7 天 → 移至 `logs/archive/`
- 實作位置建議：`scripts/otel-archive.js` 新增

### 7.2 DevConsole 整合
- `tools/dev-console/server/services/otelService.ts` 讀 info.json → 顯示「Collector 狀態」panel
- Dashboard 指標：active jsonl 大小、rotation 時間、最後一筆 trace

### 7.3 Metric Exporter
- Collector 暴露 `/metrics` Prometheus endpoint（可選）
- 指標：entries_written_total、rotations_total、bytes_written_total

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| 1.0 | 2026-04-14 | Initial design doc（SKILL v2.1.0 配套）|
