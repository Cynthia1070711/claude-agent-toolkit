# §7 子系統 F：自我演化（ECC Instincts）

**版本**: 5.4.2
**建立日期**: 2026-08-07 15:56:13
**更新日期**: 2026-08-15 14:35（v5.4.2：consume 門檻判準正式化四判準 + evolve 首輪採收，詳深度補全 v5.6.0 §7.12.10。v5.4.1：常駐 agent 列補生命週期與 `/emergence` health 第 8 項可觀測）
**上層**: [開發環境架構清單（總表）](../00-開發環境架構清單.md)

> AI 的直覺 —— 從自身開發行為萃取直覺，觀察→蒸餾→驗證→注入→治理→衰減
> 完整細節（引擎/Key 輪替/Model 輪替/真實 schema/生命週期）見 [07-自我演化-ECC-深度補全.md](07-自我演化-ECC-深度補全.md)
> 🔴 **2026-08-13 觀測層根治與三軸落地**（本次更正的是**實作缺陷**不是文檔誤載）見深度補全版 **§7.12**
> ✅ **同日 23:00 續補**：量測驅動的判準收緊（(h) OBSERVABLE）+ verifier 異質化 + 四支 CLI 接排程，見深度補全版 **§7.12.6**
> ✅ **2026-08-14 續補**：人類口頭糾正入池（第五支收割器 · `human-correction` 與守衛攔截的 `user-correction` 分立）+ `require()` 即寫生產 DB 的既有缺陷修復，見深度補全版 **§7.12.8**
> 🔴 **2026-08-15 續補**：reward 補**第二維度「注入相關性」** —— 遵循率預設「注入是相關的」，實測推翻（同一 session 連續 8 個 prompt 注入完全相同的 2 條；首跑**相關率 39%**）。方法經**陽性對照自我修正**（embedding 跨語言無鑑別力 → 改路徑比對）。純觀測未設門檻。見深度補全版 **§7.12.9**
> 🔴 **2026-08-15 續補 2**：**Gemini 常駐服務（ECC agent）落地 · shadow 起跑** —— 61% 錯投的機制解（使用者指定方向）：guardian 範式常駐離線判情境 / 選條目 / 打標籤，寫 `agent-precompute.json`；Layer 12 只讀檔**零 API 延遲**。消費預設 OFF（`PHYCOOL_INSTINCT_AGENT_CONSUME`），injection-log 附 `agent` 對照欄累積門檻裁定數據。**門檻判準已正式化（2026-08-15 使用者核可）**：①樣本 ≥100 筆 ②抽樣 would 相關率 ≥70% ③空判定正確率 ≥80%（守門項）④flag on + 兩義務；手動軌產報告 → HITL 確認 → 落地。見深度補全版 **§7.12.10**

---

ECC 讓環境**從自身開發行為中萃取直覺**，而非靠人手寫規則。蒸餾與驗證引擎為 **Gemini API**（`gemini-3.5-flash-lite` 主力 → `gemini-3.1-flash-lite` 備援，2026-08-09 切換；Ollama 自動保底停用），全程無 Claude/Haiku 參與、零主視窗 token 成本。

### 7.1 元件

| 層 | 檔案 | 職能 |
|----|------|------|
| **觀察（雙表）** | `.context-db/scripts/observe-pattern.js`（PostToolUse + PostToolUseFailure hook） | 每次工具呼叫並行寫 `pattern_observations`（聚合頻率，13,152 筆）+ `observations_queue`（逐事件 raw，27,576 筆）；成敗由 **hook 事件型別**判定，失敗事件另存 `error_head` |
| **觀察補捉（失敗）** | `ecc-harvest-transcript-errors.cjs`（consolidate 前置 · 自動） | `PostToolUseFailure` 對 Edit/Write 工具層錯誤**不觸發**（深度補全 §7.12.2）⇒ 真實失敗改由 transcript 收割，格式對齊 capture、消費端零改 |
| **觀察補捉（人類糾正）** | `ecc-harvest-user-corrections.cjs`（consolidate 前置 · 自動，2026-08-14） | `PostToolUse`/`Stop` 的 stdin **無 `prompt` 欄位**⇒ 使用者口頭糾正同樣掛不到 hook，改讀 `conversation_turns`（422 筆入池）。窄糾正線索召回 + 必附前一個 assistant turn 摘要 + 貼上內容剔除與秘密遮罩；分類值 `human-correction` 與守衛攔截的 `user-correction` **刻意分立** |
| **觸發閘門** | `.claude/hooks/ecc-emergence-gate.cjs`（Stop hook） | dual-gate（未處理 ≥ 20 筆 且 距上次 ≥ 24h）→ 背景 spawn 蒸餾器；**它不逐筆判定候選** |
| **蒸餾＋驗證** | `.context-db/scripts/ecc-consolidate-mvp.cjs` | Gemini 把觀察蒸餾成 instinct 候選 → 獨立第二次 Gemini call 當 verifier（**三態** approved/rejected/needs-more-evidence） |
| **寫入** | `.context-db/scripts/upsert-instinct.js` | approved → `instincts` 表（69 筆）+ dual-write `ledger.jsonl` 稽核；rejected 亦落否決池 |
| **注入** | `inject-budget.cjs` + `pre-prompt-rag.js` Layer 12 | 依採納分數階梯過濾後注入下個 prompt（**600** 字元預算，LIMIT 8）+ 寫 `injection-log.jsonl` |
| **常駐 agent（shadow · 2026-08-15）** | `scripts/ecc-gemini-agent.ps1` + `ensure-ecc-agent.ps1` + `.context-db/scripts/ecc-agent-tick.cjs` | guardian 範式常駐：感知（近 8 條 user prompt + git dirty）→ 三重閘門（hash 變 + cooldown 600s + 每日 60）→ Gemini 判情境 / 選條目 / 打標籤 → 寫 `agent-precompute.json` + `instinct-labels.jsonl`；Layer 12 只讀檔零 API 延遲，`PHYCOOL_INSTINCT_AGENT_CONSUME` 預設 off（injection-log 記 `agent` 對照欄）。生命週期 = 自癒啟動（prompt 觸發）/ idle 4h 自退；可觀測 = `/emergence` health 第 8 項（idle-aware 判定）。詳深度補全 §7.12.10 |
| **治理 UI** | DevConsole `/emergence`（4 池） | 直覺/觀察/否決/技能四池 HITL：👍👎/否決/還原/evolve 候選 |
| **演化偵測** | `ecc-evolve-detect.cjs`（readonly） | L2→L3 候選（skill ≥2 同域 / agent-hook ≥3 且 avg_conf ≥ 0.75）+ redundancy 對照；生成一律人工 Skill tool |
| **否決池** | `instincts_rejected` 表 | 否決紀錄（norm_key 對消 + reject_count 降權 + restore 還原）；**2026-08-13 起兼收 verifier 否決** |
| **權重衰減** | `ecc-apply-time-decay.cjs`（consolidate 結尾 · 自動） | 以 injection-log 回填 `last_seen` → ≥7 天未觀察扣 **−0.02**（上游規格）；冪等鎖 |
| **stale 偵測** | `ecc-detect-stale-instincts.cjs`（consolidator 結尾自動） | 路徑存在性 + 退場標記；**advisory 不自動否決**（HITL 紅線） |
| **效果量測（reward）** | `ecc-measure-instinct-efficacy.cjs`（consolidate 結尾 · 自動，readonly） | **兩個正交維度**：① 由 transcript 工具序列量**行為遵循率**（非注入成功率），treatment/control 由 injection-log 判定 ② **注入相關性**（2026-08-15）—— trigger 路徑 vs 該 session 實際碰過的檔案，回答「有沒有注入對對象」。兩者混談會錯誤歸因：情境不符必然造成 0 遵循 |
| **效果度量（Skill 層）** | `effect_metrics` 表 | 量測「升格 Skill 前後行為頻率」。**恆 0 筆是設計必然非缺陷** —— `skill_id NOT NULL` 綁 `generated_skills`，而後者受 HITL 紅線刻意永遠為空 |
| **升格 Skill** | `generated_skills` 表 | 高價值直覺群人工升格（受 HITL 紅線，恆 0 筆） |
| **配額報警** | `.claude/hooks/ecc-quota-alert.js`（SessionStart） | **Gemini API 配額耗盡**報警（讀 `ecc-alert.json`），非直覺數量配額 |
| **領域映射** | `ecc-domain-mapping.cjs` | 直覺歸類 domain/business/project_type；`pathToDomain()` 由 capture 與收割兩路徑共用 |
| **狀態檔** | `.context-db/ecc-state/` | gate 狀態 + run log + **injection-log.jsonl** + **time-decay-state.json**；另含軌道 β 的 10 個 `*-state.json` |
| **（正交）軌道 β** | `ecc-haiku-dispatch` Skill | 10 條 SUPREME rule dispatcher 基建。**零消費端** —— gate 已解除且 9 Story 全 done，成因是**漏排接線 Story**（判斷第三次定稿，見深度補全 §7.8），**不參與本迴路** |

### 7.2 ★ ECC 演化閉環

```
   AI 每次工具呼叫
        │
        ▼
   PostToolUse / PostToolUseFailure: observe-pattern.js ─並行寫─▶ pattern_observations（聚合）
        │  成敗看事件型別，非回應文字                            observations_queue（逐事件）
        │                                                        ＋失敗事件的 error_head
        ├─（補捉 1）ecc-harvest-transcript-errors.cjs：Edit/Write 工具層錯誤不觸發 hook，
        │           改由 transcript is_error 收割，格式對齊上行
        ├─（補捉 2）ecc-harvest-user-corrections.cjs：使用者口頭糾正同樣掛不到 hook
        │           （stdin 無 prompt 欄位），改讀 conversation_turns。附前一個 assistant
        │           turn 摘要，否則「不對阿」對 LLM 是零資訊。標 human-correction
        ▼
   Stop: ecc-emergence-gate.cjs（dual-gate 觸發器）
        │  未處理 ≥ 20 且距上次 ≥ 24h → detached spawn（實務約每日一輪）
        ▼
   ecc-consolidate-mvp.cjs（Gemini 蒸餾｜key×model 巢狀 fallback）
        │  候選 instinct（頻率型＋因果型）
        ▼
   獨立 Gemini verify（湧現判準＋P0 baseline 過濾）── 三態
        ├── approved            ─▶ upsert-instinct.js ─▶ instincts（69 筆）＋ ledger
        ├── rejected            ─▶ instincts_rejected（供 F6 去重，不再重複生成）
        └── needs-more-evidence ─▶ confidence −0.1 寫入，該輪 observations 完全不標記
             ※ processed 只標記本輪實際讀到的 id（此前全批標 ⇒ 未讀者靜默丟棄）
        │
        ▼
   pre-prompt-rag.js Layer 12 注入下次 prompt（600 字元預算）─▶ injection-log.jsonl
        │  階梯：score≥4 全視窗｜score 1-3 同 project_type｜source_session 一律
        │  project_type 四段判定（env → 本 session → 近 120 分鐘全域 → null）
        │  ◀─（2026-08-15）Gemini 常駐 agent 離線預計算 agent-precompute.json
        │     （判情境／選條目／打標籤；消費 flag 預設 off = shadow 只記對照欄）
        ▼
   AI 行為改變 ──▶ 新觀察 ──▶（循環）
        │
        ├─ 權重演化（已接 consolidate 排程，非人工）：
        │  ecc-apply-time-decay（−0.02/週）· ecc-detect-stale-instincts（advisory）
        │  ecc-measure-instinct-efficacy（reward：行為遵循率，treatment/control）
        │
        └─ 人工治理（DevConsole /emergence）：
           👍/👎（confidence ±）· 否決 → instincts_rejected（降權）· 還原 → 觀察池
           evolve 候選 → 人工 Skill(saas-to-skill)/hooks-mechanization 升格 L3
```

**設計精神**：規則不是人寫死的，是機器從自己的行為裡長出來的；驗證獨立於作者、採納分數由人與命中共同演化、沒用的直覺衰減淘汰。

> ⚠ **2026-08-13 誠實補述**：上游 ECC（`affaan-m/ecc`）**沒有 LLM verifier —— 驗證那一步是人做的**（README：「Users manually review and assign confidence scores before promotion」）。PhyCool 為求全自動把那個「人」換成了 LLM，這是虛構因果得以通過的結構性原因。使用者裁定維持全自動（C 路線）並持續優化判準/過濾/權重；**讓 C 成立的前提是 reward signal**，已於本次落地。詳深度補全 §7.12.3 / §7.12.5。

---

← [工作流 · Pipeline 與跨軌通訊](06-工作流-Pipeline與跨軌.md) · [總表](../00-開發環境架構清單.md) · [橫切機制](08-橫切機制.md) →
