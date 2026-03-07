# **GitHub Copilot CLI 企業級代理架構與進階開發實務深度解析手冊**

隨著人工智慧技術在軟體工程領域的快速演進，開發工具正經歷從單純的語法自動補全（Autocomplete）向具備高度自主性與上下文感知能力的代理型人工智慧（Agentic AI）典範轉移。GitHub Copilot CLI 在 2026 年的全面正式上市（General Availability），標誌著命令列介面（CLI）已從傳統的指令輸入終端，徹底蛻變為能夠自主規劃、平行執行、跨會話記憶以及深度整合企業內部系統的智慧開發中樞 1。

本深度解析手冊旨在為企業級軟體架構師、DevOps 工程師與進階開發團隊提供一份詳盡的技術藍圖。內容將全面解構 GitHub Copilot CLI 的底層運作機制，涵蓋從基礎模型（AI Models）的動態調度、規格驅動開發（Spec-Driven Development, SDD）的憲規（Constitution）定義，到高階擴充架構，包含代理技能（Agent Skills）、模型上下文協定（Model Context Protocol, MCP）以及生命週期鉤子（Lifecycle Hooks）等關鍵組件的建置與配置 1。此外，本手冊亦將深入探討代理記憶系統（Agentic Memory）如何重塑專案知識的傳承 4，並詳述如何在此架構下落實測試驅動開發（TDD）與行為驅動開發（BDD）的自動化工作流 5。

## **第一章：基礎模型矩陣與上下文演算機制**

GitHub Copilot CLI 的核心大腦由多重頂尖大型語言模型（LLM）構成。為了適應不同複雜度、延遲要求與企業成本控制的開發場景，2026 年的架構更新賦予了開發者在終端機內動態切換底層模型的極大彈性 7。

### **支援的模型生態與特性定位**

Copilot CLI 整合了來自 OpenAI、Anthropic 與 Google 的先進基礎模型。系統管理員可透過組織層級的策略（Policies）管控模型的可用性，而開發者則可透過 /model 互動式指令或 \--model 命令列參數進行無縫切換 7。若使用者選擇了被策略禁用的模型，CLI 現在支援直接在終端機內提示並引導啟用，消除了切換至網頁端設定的摩擦 7。

下表系統化地梳理了目前 Copilot CLI 支援的核心模型矩陣及其技術特性：

| 模型名稱 | 供應商 | 核心架構定位與最佳實務場景 | 延遲與成本效益分析 |
| :---- | :---- | :---- | :---- |
| **Claude Sonnet 4.6** | Anthropic | 作為 Copilot CLI 的預設模型，在程式碼理解、重構與日常多步驟開發中展現出卓越的平衡性 8。 | 綜合效能最佳，適用於多數代理任務。 |
| **Claude Opus 4.6** | Anthropic | 具備極深的推理與邏輯演算能力，專為極端複雜的架構決策、困難的非同步錯誤除錯與大型代理鏈（Agentic Chains）設計 9。 | 高智慧密度，但伴隨較高的運算延遲與成本。 |
| **GPT-5.2** | OpenAI | 提供強大的跨文件程式碼分析與邏輯推演，適合進行整體專案語言遷移或處理複雜的終端機腳本自動化 9。 | 高效能分析，需特定的策略啟用授權。 |
| **GPT-5 mini** | OpenAI | 被歸類為「0x 模型（0x Models）」，包含在標準訂閱中且不消耗付費方案的進階請求（Premium Requests）額度 7。 | 極低延遲，具備極高的成本效益，適合快速查詢。 |
| **GPT-4.1** | OpenAI | 同樣屬於「0x 模型」，針對基礎的終端機指令解釋、簡短的程式碼片段生成進行了深度最佳化 7。 | 低延遲，適合重複性的基礎開發協助。 |
| **Gemini 2.5 Pro** | Google | 擅長處理多模態輸入與超長上下文視窗，當開發者需要代理程式同時參閱大量伺服器日誌與架構文件時表現優異 9。 | 專精於大容量上下文資料的吸收與關聯分析。 |
| **GPT-5.3-Codex** | OpenAI | 專注於程式碼生成的特化模型家族，在演算法實作、特定框架的語法轉換與邊界條件處理上具備極高精準度 9。 | 程式碼語法特化，適合嚴格的邏輯生成。 |

在終端機體驗的優化上，Copilot CLI 引入了 Ctrl+T 快捷鍵，允許開發者在支援的模型（如具備深度思考能力的模型）生成回應時，即時切換並檢視模型的「內部推理過程（Reasoning Visibility）」7。這項特性大幅提升了 AI 決策的透明度，使工程師能夠在模型走入錯誤邏輯分支前及時阻斷並修正。

### **自動上下文壓縮與令牌管理**

在長時間的開發會話中，傳統的對話視窗往往會因為達到模型的令牌（Token）上限而崩潰或遺忘關鍵資訊。Copilot CLI 針對此痛點實作了「自動上下文壓縮（Auto-compaction）」技術 1。當終端機內的對話歷史與載入的程式碼上下文接近令牌限制的 95% 時，CLI 會在背景啟動一個獨立的演算程序，將早期的對話歷史與非活躍的程式碼片段壓縮為高密度的語義摘要 1。

這項背景壓縮技術確保了工作會話可以近乎無限期地延續，不會因為上下文溢出而強迫開發者重啟會話。此外，開發者掌握著完全的上下文控制權。透過輸入 /context 指令，CLI 會在終端機渲染出視覺化的令牌使用量明細表，精確顯示系統提示詞、載入的檔案、MCP 伺服器資料與對話歷史各自佔用的比例 7。若需即時釋放資源，開發者亦可使用 /compact 指令手動觸發壓縮機制，維持最敏捷的反應速度 7。

## **第二章：代理互動工作流與終端機指令集**

GitHub Copilot CLI 的設計哲學在於將終端機從一個單向的指令接收器，轉變為一個具備自主協作能力的虛擬工程團隊。透過精細的模式切換與指令委派，開發者可以精確控制 AI 的自主性邊界 1。

### **核心執行模式：計畫與自動駕駛**

CLI 提供了雙軌制的執行模式，以應對不同風險等級的任務。預設狀態下，CLI 處於「問答與執行模式（Ask/Execute Mode）」，模型會針對提示詞給出直接的回應或單一指令建議。

然而，面對牽涉多個檔案修改或系統配置的複雜任務時，開發者可按下 Shift \+ Tab 切換至「計畫模式（Plan Mode）」1。在計畫模式中，Copilot 會暫停任何程式碼的生成或檔案的修改。相反地，它會啟動一個規劃循環：首先對開發者的需求進行深度語義分析，接著主動提出釐清問題（Clarifying Questions）以補足模糊的邊界條件與範圍，最後在終端機中輸出一個結構化的 Markdown 實作計畫清單 1。這個流程確保了在任何破壞性變更發生前，人類工程師與 AI 代理對架構決策已達成絕對的共識。待計畫獲得批准後，Copilot 才會開始依序執行清單上的項目 1。

對於高度信任的成熟工作流或低風險的本地環境，開發者可以啟用「自動駕駛模式（Autopilot Mode）」或使用 \--allow-all / \--yolo 參數 1。在此模式下，Copilot 獲得了端到端的自主權，能夠連續執行 Shell 指令、讀寫檔案並根據測試錯誤日誌進行自我迭代修正，直到任務徹底完成，中途無需等待人為的逐項批准 1。

### **高階工作流與任務委派指令**

為支援企業級的並行開發與嚴謹的程式碼審查，CLI 內建了一系列以斜線 / 開頭的控制指令，這些指令構成了現代代理工作流的骨幹：

* **/delegate \<prompt\>（背景委派）**：此指令徹底改變了非同步工作的形態。開發者可以將耗時的任務（例如全面性的單元測試生成或舊版 API 的重構）透過 /delegate 或在提示詞前加上 & 符號，委派給託管於雲端的 Copilot Coding Agent 處理 1。本地終端機將立即被釋放以進行其他工作。當雲端代理完成修改後，會自動建立包含變更的草稿拉取請求（Draft PR），並在終端機回傳檢閱連結 13。  
* **/fleet（代理艦隊平行處理）**：面對極端複雜或需要多方驗證的架構難題，開發者可使用 /fleet 指令。此機制會將同一項任務平行分發給多個子代理（Subagents）—甚至可跨越不同的底層模型—進行同步演算，最終收斂並綜合出一個最具決策參考價值的結果，大幅降低單一模型的幻覺風險 1。  
* **/review（高訊號程式碼審查）**：呼叫特化的 Code Review 代理，針對當前 Git 中暫存（Staged）或未暫存的變更進行深度分析。與傳統靜態分析工具不同，此代理專注於揪出深層邏輯缺陷與架構不一致，提供具備高訊號雜訊比（High signal-to-noise ratio）的審查意見，避免瑣碎的語法警告淹沒關鍵問題 1。  
* **/diff（視覺化差異比對）**：在 AI 代理完成一系列檔案修改後，開發者可執行 /diff。CLI 會在終端機內整合 Git 的分頁器（Pager），渲染出帶有行內語法高亮（Intra-line syntax highlighting）的差異對照表。開發者可以精確檢視代理程式所做的每一處微小修改，並針對特定行號添加結構化回饋意見，甚至一鍵還原（Undo）特定變更 1。

透過這些指令的串聯，開發者不再只是程式碼的撰寫者，而是轉變為指揮與調度 AI 代理艦隊的系統架構總監。

## **第三章：規格驅動開發 (SDD) 與專案憲規**

在 AI 輔助軟體工程的實務中，業界觀察到一種被稱為「隨興編碼（Vibe Coding）」的反模式：開發者依賴模糊的提示詞，讓 AI 快速生成原型，隨後陷入無止盡的錯誤修復與上下文補充循環中，最終導致系統架構崩塌與技術債的劇增 16。

為了解決此一系統性問題，GitHub 提出了規格驅動開發（Spec-Driven Development, SDD）方法論，並透過開源的 Spec Kit 工具集與 Copilot CLI 進行深度融合 16。SDD 的核心哲學是將「規格（Specifications）」提升為軟體開發生命週期中的首要且可執行的產出物。開發者必須在撰寫任何程式碼之前，先明確定義架構意圖、業務規則與約束條件，讓 AI 代理在一個具有嚴格護欄的確定性環境中運作 3。

### **專案憲規 (Constitution) 的定義與結構**

SDD 工作流的地基建立於一份名為「憲規（Constitution）」的檔案之上。這份通常儲存於 .specify/memory/constitution.md 的 Markdown 文件，確立了專案中不可妥協的治理原則（Non-negotiable principles）與工程規範 16。憲規不僅是給人類開發者閱讀的指南，更是直接載入 AI 代理上下文的強制性約束條款。

一份企業級的 constitution.md 通常包含以下核心模組，以下提供一個針對現代微服務架構的實作範例與分析：

# **專案架構與開發憲規 (Project Constitution)**

## **核心架構原則 (Core Architectural Principles)**

1. **函式庫優先架構 (Library-First Architecture)**  
   所有的業務邏輯與領域模型必須先封裝為獨立、可重用的函式庫模組。嚴禁將核心演算法直接耦合於 API 路由處理常式或前端視圖元件中。  
2. **命令列介面授權 (CLI Interface Mandate)**  
   每一個核心函式庫都必須暴露出對應的 CLI 介面，且必須支援透過標準輸入/輸出 (stdin/stdout) 進行 JSON 格式的結構化資料交換，以確保系統具備極高的可觀察性與可測試性。  
3. **反對過度抽象 (Anti-Abstraction & Framework Trust)**  
   信任並直接利用底層框架 (如 Express.js 或 React) 的原生能力。禁止為了「未來的擴充性」而過早引入不必要的封裝層、轉接器 (Adapters) 或過度設計的介面。

## **基礎設施與技術堆疊約束**

* **資料庫互動**：全面採用 Prisma ORM 進行資料庫操作。系統層級禁止撰寫原生 SQL 字串，防範注入攻擊風險。  
* **錯誤處理一致性**：業務邏輯層的異常必須被拋出並由全域中介軟體 (Global Error Middleware) 統一捕捉與格式化，禁止在單一路由內隱藏 try-catch 區塊。

## **實作前檢查閘道 (Pre-Implementation Gates)**

在生成任何技術計畫 (plan.md) 之前，代理程式必須進行自我驗證：

* \[ \] **簡潔性閘道**：目前的設計是否引入了超過三個新的目錄層級？  
* \[ \] **整合測試閘道**：是否已明確定義了與外部服務互動的 API 契約 (Contracts)？

**架構分析**： 這份憲規透過強制性的語氣確立了設計邊界 20。例如「函式庫優先架構」迫使 AI 模型在生成程式碼時，必須先建構底層邏輯，這大幅提升了程式碼的模組化程度 20。「反對過度抽象」條款則是針對 LLM 經常出現的「過度工程化（Over-engineering）」傾向所設置的煞車機制 20。最關鍵的是「實作前檢查閘道」，它利用 Markdown 的核取方塊機制，將抽象的原則轉化為具體的檢查清單，強迫 Copilot CLI 的規畫代理在給出最終方案前進行邏輯收斂與合規性確認 20。

另一個具體的產業範例是微軟發布的 Azure Spec-Kit 憲規（azure-constitution.md）。該憲規嚴格規範了雲端基礎設施的開發模式，例如強制要求使用受管理的識別（Managed Identity）與 Key Vault 進行無憑證的驗證模式，並規定必須使用 Azure Verified Modules 撰寫 Bicep 基礎設施即程式碼（IaC）範本 21。透過將這些雲端最佳實踐寫入憲規，企業可確保所有由 AI 生成的基礎設施配置從第一天起就符合資安與合規標準。

### **Spec Kit 指令驅動的 SDD 工作流**

在整合了 Spec Kit 的 Copilot CLI 環境中，SDD 的實踐被解構為五個具備嚴格順序性的斜線指令，形成一個不斷推進的自動化迴圈 22：

1. **/speckit.constitution**：在專案初期執行，引導開發者與 AI 互動，建立或迭代上述的專案治理原則與測試標準 23。  
2. **/speckit.specify**：將人類的自然語言需求轉化為結構化的規格文件（spec.md）。此階段嚴格限制僅討論「做什麼（What）」與「為何而做（Why）」，包含使用者故事、驗收標準與非功能性需求，禁止討論任何技術實作細節 23。  
3. **/speckit.plan**：AI 代理根據已核准的規格與憲規的約束，結合專案現有的技術堆疊，生成詳盡的技術實作計畫（plan.md）。這包含了資料庫綱要設計、API 路由端點、依賴套件選擇與架構藍圖（How）23。  
4. **/speckit.tasks**：代理將龐大的實作計畫拆解為一份名為 tasks.md 的 Markdown 任務清單。清單中明確定義了每個微小任務的相依性、可平行處理的標記，以及對應的測試要求 23。  
5. **/speckit.implement**：最後的執行階段。Copilot CLI 會讀取任務清單，按照依賴順序自主編寫程式碼、生成測試並執行驗證。在這個階段，開發者從「語法生產者」轉變為「意圖設計者與結果驗證者」23。

這種方法論確保了 AI 生成的每一個字元，都是基於經過人類嚴格審查的架構藍圖與規格所產生，從根本上消除了幻覺與架構偏移的風險。

## **第四章：擴充智慧能力：Agent Skills (代理技能)**

為了讓 Copilot CLI 能夠處理高度專業化、重複性高且包含多個步驟的領域特定任務，GitHub 實作了基於開放標準的 Agent Skills（代理技能）架構 25。與主要用於設定全局編碼偏好與格式規範的「自訂指令（Custom Instructions）」不同，技能是一種封裝了特定工作流邏輯、腳本工具與輔助參考資源的獨立能力模組 25。

### **技能的儲存與漸進式載入架構**

技能具有高度的跨平台可攜性，遵循相同的開放標準，這意味著一個定義良好的技能可以在 VS Code 內的 Copilot Chat、雲端的 Copilot Coding Agent 以及本地的 Copilot CLI 之間無縫共用 28。在檔案系統層級，專案特定的技能儲存於 .github/skills/\<skill-name\>/ 目錄下，而個人全域技能則存放於 \~/.copilot/skills/\<skill-name\>/ 中 25。

為了最大化模型上下文視窗的利用效率，Copilot CLI 採用了精巧的「漸進式載入（Progressive Loading）」機制來處理技能，分為三個層次 28：

1. **技能發現層（Level 1）**：CLI 啟動時，僅會掃描並載入所有技能目錄下 SKILL.md 檔案的 YAML 前置資料（包含名稱與描述）。這使得系統可以維持數百個技能而幾乎不佔用任何 Token 資源 28。  
2. **指令載入層（Level 2）**：當使用者的自然語言提示詞在語義上與某個技能的描述高度吻合，或者使用者明確使用 / 呼叫該技能時，CLI 才會將該 SKILL.md 的主體內容（具體的操作指南）注入到當前的上下文中 25。  
3. **資源存取層（Level 3）**：技能目錄下所綑綁（Bundled）的任何外部資源，例如 Bash 腳本、Python 驗證工具、資料庫綱要範本或龐大的 API 參考文件，只有在 AI 代理執行到技能指南中的特定步驟，並判斷確實需要存取時，才會被動態讀取並載入 28。

### **SKILL.md 實作與 DevOps 自動化範例**

一個標準的代理技能目錄包含一個必須的 SKILL.md 檔案，以及可選的 scripts/ 或 references/ 等輔助目錄。以下展示一個專為 DevOps 團隊設計的「基礎設施部署與安全掃描」技能範例：

## ---

**name: infra-secure-deployment description: 當使用者要求將基礎設施部署至生產環境、執行 Terraform 變更，或需要進行雲端資源的安全稽核時觸發此技能。 license: Apache-2.0**

# **基礎設施安全部署標準作業程序 (SOP)**

身為負責生產環境的 DevOps 代理程式，當你需要執行任何 IaC (Infrastructure as Code) 變更時，必須嚴格遵守以下多階段工作流。禁止跳過任何驗證步驟。

## **階段一：靜態安全掃描 (SAST)**

1. 在套用任何變更前，必須先針對 terraform/ 目錄執行靜態安全分析。  
2. 呼叫隨附的驗證腳本：執行 bash./scripts/run-tfsec.sh。  
3. 如果腳本回傳任何 CRITICAL 或 HIGH 級別的漏洞，立即終止工作流，並將漏洞報告摘要給使用者，提供修復建議。

## **階段二：資源變更預覽**

1. 確保目前處於正確的雲端工作區 (Workspace)。  
2. 執行 terraform plan \-out=tfplan。  
3. 讀取並分析計畫結果，以表格形式向使用者列出即將「新增」、「修改」與「銷毀 (Destroy)」的資源清單。  
4. 特別標註任何涉及資料庫或負載平衡器的破壞性變更。  
5. 暫停執行，詢問使用者：「是否確認上述變更並繼續部署？」

## **階段三：自動化部署與健康檢查**

1. 獲得明確批准後，執行 terraform apply "tfplan"。  
2. 部署完成後，查閱 references/health-check-endpoints.json 中的端點定義，並使用 curl 驗證核心服務的 HTTP 狀態碼是否回傳 200。

## **邊界條件與限制 (Constraints)**

* **絕對禁止**在終端機輸出或保存檔中明碼列印任何以 AWS\_ 或 AZURE\_ 開頭的環境變數與存取憑證。  
* 若部署失敗，必須主動提供回滾 (Rollback) 的指令建議。

**架構分析與註釋**： 這個 DevOps 技能完美體現了將人類營運知識「資產化」的過程 30。YAML 前置資料中的 description 確保了當開發者輸入「請幫我把最新的網路架構更新到正式機」時，Copilot CLI 能夠精準辨識意圖並主動喚醒此技能 25。 在「階段一」中，技能並未要求 LLM 自己去理解如何安裝與配置安全掃描工具，而是直接指示代理呼叫綑綁在目錄中的 ./scripts/run-tfsec.sh 腳本 28。這種「結合外部確定性腳本與 AI 非確定性推理」的混合架構，大幅提升了工作流的可靠性與執行速度。「階段二」則展示了技能如何強制設定人類介入的檢查點（Human-in-the-loop），確保破壞性操作必須經過授權。透過這種標準化的技能配置，企業能夠確保所有開發者—無論資歷深淺—在執行敏感任務時，AI 輔助的流程都能保持絕對的一致性與安全性 30。

在 CLI 內部，開發者可使用 /skills list 檢視所有已安裝的技能，使用 /skills add 新增路徑，或透過 /skills 互動式介面動態啟用或禁用特定技能 25。

## **第五章：模型上下文協定 (Model Context Protocol, MCP) 整合實務**

如果代理技能（Agent Skills）是賦予 Copilot 執行特定流程的「知識大腦」，那麼模型上下文協定（Model Context Protocol, MCP）就是賦予 AI 感知與操作外部世界的「感官與雙手」31。MCP 是一種由 Anthropic 推出的開放標準通訊協定，它定義了大型語言模型如何安全地、標準化地連接至外部資料來源、企業內部 API、關聯式資料庫或專有系統 32。

### **MCP 伺服器架構與內建能力**

GitHub Copilot CLI 出廠即預先配置了原生的 GitHub MCP 伺服器 32。這意味著開發者無需任何額外設定，即可在終端機中直接使用自然語言查詢 GitHub Issues、總結特定 Pull Request 的審查意見、分析儲存庫的標籤活動，甚至是讀取 Copilot Spaces 中預先定義的專案上下文 7。這種深度整合徹底消除了開發者在終端機與瀏覽器之間頻繁切換（Context hunting）的摩擦 15。

對於客製化的整合需求，Copilot CLI 支援透過 \~/.copilot/mcp-config.json 檔案（全域設定）或專案內的 .vscode/mcp.json（工作區設定）來配置第三方的 MCP 伺服器 32。MCP 伺服器支援兩種主要的傳輸協定：

1. **Local (STDIO)**：這是在本機環境中最常見且推薦的模式。Copilot CLI 會在背景生成一個獨立的子處理程序（如透過 Node.js 或 Python），並透過標準輸入/輸出（stdin/stdout）流進行通訊 32。這種模式延遲極低，適用於需要存取本機檔案系統或執行本機命令的工具。  
2. **Remote (HTTP/SSE)**：連接至遠端託管的 MCP 伺服器。這對於企業環境特別重要，企業可以建立一個集中式的 MCP 伺服器來處理內部機密資料庫的查詢，並透過 HTTP 標頭（Headers）進行存取控制與驗證 32。

### **mcp-config.json 企業級配置範例與註釋**

以下是一個典型的企業級 mcp-config.json 配置檔，展示了如何同時整合本地瀏覽器自動化測試工具（Playwright）與遠端微軟雲端基礎設施管理服務（Azure）：

JSON

{  
  "mcpServers": {  
    "playwright-e2e-automation": {  
      "type": "local",  
      "command": "npx",  
      "args": \[  
        "-y",  
        "@playwright/mcp@latest"  
      \],  
      "env": {  
        "DEBUG": "pw:api",  
        "PLAYWRIGHT\_BROWSERS\_PATH": "0"  
      },  
      "tools": \["\*"\]  
    },  
    "azure-cloud-operations": {  
      "type": "local",  
      "command": "npx",  
      "args": \[  
        "-y",  
        "@azure/mcp@latest",  
        "server",  
        "start"  
      \],  
      "tools": \[  
        "list\_resource\_groups",  
        "get\_vm\_status",  
        "analyze\_app\_insights\_logs"  
      \]  
    },  
    "internal-knowledge-base": {  
      "type": "http",  
      "url": "https://mcp.internal.corp/context",  
      "headers": {  
        "X-CORP-API-KEY": "YOUR-SECURE-TOKEN"  
      },  
      "tools": \["\*"\]  
    }  
  }  
}

**架構分析與安全性註釋**： 在這個配置中，定義了三個職責分明的 MCP 伺服器。 第一個 playwright-e2e-automation 展示了強大的本地端工具賦能。透過載入 Playwright 的 MCP 伺服器，Copilot CLI 獲得了直接控制本地瀏覽器的能力 32。開發者可以指示代理程式：「開啟本地端的 3000 埠，導航至登入頁面，模擬使用者輸入並驗證錯誤訊息是否正確顯示」，AI 將透過 MCP 伺服器提供的介面執行實際的 UI 互動與狀態捕捉。

第二個 azure-cloud-operations 展示了與雲端平台的整合 36。透過使用 @azure/mcp，CLI 可以獲取真實的雲端資源狀態。此處最為關鍵的是安全設計：有別於 Playwright 伺服器使用 tools: \["\*"\] 開放所有能力，Azure 伺服器的 tools 陣列被嚴格限制為三個唯讀的查詢工具（如 list\_resource\_groups）32。這種基於最小權限原則（Principle of Least Privilege）的工具級別存取控制（Tool-level Access Control），確保了即使 AI 模型發生幻覺或遭到提示詞注入攻擊，也絕對無法執行如刪除虛擬機或變更網路安全群組等破壞性操作。

第三個 internal-knowledge-base 則示範了如何透過 HTTP 傳輸模式連接企業私有的遠端知識庫，並透過 headers 傳遞驗證憑證，實現企業內部文件與開發對話的無縫接軌 32。

開發者可以在 CLI 中使用 /mcp show 檢視所有已掛載伺服器的健康狀態，或使用 /mcp disable \<server-name\> 動態隔離暫時不需要的工具來源 32。

## **第六章：生命週期鉤子 (Hooks) 與零信任安全攔截**

當 AI 代理獲得了執行命令列腳本、修改原始碼檔案以及呼叫外部 MCP 工具的強大能力時，確保這些自動化操作不會對系統造成損害便成為首要任務。GitHub Copilot CLI 實作了一套靈活且強大的「生命週期鉤子（Lifecycle Hooks）」系統，允許系統管理員在代理程式執行任務的各個關鍵節點，強制安插自訂的 Shell 腳本，從而實現細粒度的安全稽核、行為攔截與工作流自動化 37。

### **Hooks 的觸發事件與 JSON 負載架構**

鉤子的設定檔通常位於儲存庫的 .github/hooks/hooks.json 中 37。Copilot CLI 支援多個精確的觸發節點，每個節點都會透過標準輸入（stdin）向掛載的腳本傳遞一個包含執行期上下文的 JSON 負載（Payload）37：

* **sessionStart 與 sessionEnd**：分別於代理會話啟動與終止時觸發。sessionStart 常用於檢驗專案狀態或初始化依賴環境（如啟動 Docker 容器）；而 sessionEnd 則負責清理臨時檔案、發送通知（如 Slack 訊息），或將會話日誌歸檔 38。  
* **userPromptSubmitted**：在開發者送出提示詞的瞬間觸發。此鉤子對於企業合規性至關重要，可用於將所有的輸入指令同步寫入企業級的稽核日誌資料庫中，確保 AI 工具的使用具有完全的可追溯性 38。  
* **preToolUse**：這是整個系統中權限最高、防禦能力最強的鉤子。它在 AI 代理企圖執行任何工具（如 bash 終端機執行、edit 檔案修改、create 檔案建立）之前同步觸發 38。腳本可以動態解析工具的參數，並決定回傳「允許（allow）」或「拒絕（deny）」的 JSON 決策，從而構成一道堅實的應用程式防火牆。  
* **postToolUse**：在工具執行完成後觸發，無論該次執行是成功或失敗。這非常適合用來自動觸發程式碼格式化工具（如 Prettier）、執行語法檢查（Linter），或是將工具執行的效能指標（如執行時間、失敗率）寫入統計儀表板 38。  
* **errorOccurred**：專門用於捕捉代理執行期間發生的未預期錯誤，協助開發團隊追蹤並分析錯誤模式 38。

### **preToolUse 安全防護攔截器實作**

為了展示零信任架構（Zero Trust Architecture）在 AI 開發環境中的具體實踐，以下提供一個高階的 preToolUse 攔截器實作。該實作旨在防止代理程式意外執行具破壞性的系統指令，或修改非授權目錄下的檔案。

**第一部分：配置 hooks.json**

JSON

{  
  "version": 1,  
  "hooks": {  
    "preToolUse":,  
    "postToolUse":  
  }  
}

**第二部分：實作 zero-trust-guard.sh 攔截邏輯**

Bash

\#\!/bin/bash  
\# 啟用 Bash 嚴格模式，確保任何子指令失敗或變數未定義時腳本立即中斷  
set \-euo pipefail

\# 讀取 Copilot CLI 透過標準輸入 (stdin) 傳送過來的 JSON 上下文負載  
INPUT=$(cat)

\# 運用 jq 工具精確提取即將執行的工具名稱與其參數  
TOOL\_NAME=$(echo "$INPUT" | jq \-r '.toolName')  
TOOL\_ARGS=$(echo "$INPUT" | jq \-r '.toolArgs')

\# \==========================================  
\# 防禦層一：阻斷終端機破壞性指令 (Bash Tool)  
\# \==========================================  
if; then  
  \# 解析出預備執行的具體指令字串  
  COMMAND\_STR=$(echo "$TOOL\_ARGS" | jq \-r '.command')  
    
  \# 使用正規表示式掃描指令字串中是否包含高風險特徵  
  if echo "$COMMAND\_STR" | grep \-iqE "rm \-rf /|rm \-rf \\.|DROP TABLE|truncate|chmod 777|chown root"; then  
    \# 若偵測到高風險操作，向標準輸出 (stdout) 列印拒絕決策的 JSON  
    \# permissionDecisionReason 的內容將被傳回給 AI 模型，促使其理解錯誤並重新思考  
    echo '{"permissionDecision":"deny","permissionDecisionReason":"系統安全守衛攔截：嚴禁 AI 代理執行具破壞性的高風險系統指令、提權操作或資料庫結構刪除。"}'  
    exit 0  
  fi  
fi

\# \==========================================  
\# 防禦層二：限制檔案修改邊界 (Edit/Create Tool)  
\# \==========================================  
if\]; then  
  \# 解析出目標檔案的路徑  
  PATH\_ARG=$(echo "$TOOL\_ARGS" | jq \-r '.path')  
    
  \# 實施目錄沙盒隔離 (Sandboxing)：僅允許修改原始碼、測試與文件目錄  
  \# 嚴禁修改諸如.github/workflows/ 或基礎設施配置檔  
  if\]; then  
    echo '{"permissionDecision":"deny","permissionDecisionReason":"架構權限限制：目前會話中，AI 代理僅被授權於 src/、tests/ 或 docs/ 目錄下新增或修改檔案。請勿更動 CI/CD 配置或系統核心檔。"}'  
    exit 0  
  fi  
fi

\# 若通過上述所有防禦層的檢驗，則放行該次工具呼叫  
echo '{"permissionDecision":"allow"}'

**腳本邏輯與機制深度解析**： 這個防禦腳本充分利用了 preToolUse 鉤子的同步阻塞（Synchronous blocking）特性 37。當 Copilot 決策引擎準備呼叫 bash 工具執行命令時，它必須等待此腳本的執行結果。腳本接收到的 $INPUT 是一個包含 timestamp、cwd、toolName 與序列化後的 toolArgs 的完整 JSON 結構 38。 腳本的第一道防線針對 bash 終端機工具，透過正則表達式攔截如 rm \-rf / 或權限變更指令 chmod 777。第二道防線則針對 edit 與 create 工具實施了微型沙盒（Sandboxing）管控，確保代理程式不會因幻覺而去篡改如 .github/workflows/ 下的 CI/CD 敏感管線設定檔 38。 當腳本回傳 {"permissionDecision":"deny"} 時，Copilot CLI 不僅會立即中止該工具的執行，還會將 permissionDecisionReason 中的具體原因回饋給 LLM。這種閉環回饋機制非常關鍵，它能讓 AI 代理意識到其路徑被封鎖的原因，進而調整策略，嘗試使用其他安全的工具或方法來達成目標，而非單純的系統崩潰 38。

## **第七章：跨代理記憶系統 (Agentic Memory System)**

傳統 AI 編碼輔助工具最大的限制在於其「無狀態性（Statelessness）」。每次開啟新的終端機對話或處理新的問題，開發者都必須不厭其煩地重新向 AI 闡述專案的命名慣例、資料庫連線模式、特定的設計模式以及團隊偏好。為了突破這一效率瓶頸，GitHub 開發了具備高度持久性的跨代理記憶系統（Cross-agent Memory System）4。

### **記憶的建立與動態驗證機制**

Copilot Memory 是儲存於儲存庫級別（Repository-level）的動態知識庫 4。當開發者在終端機中使用 CLI、在編輯器中利用 Coding Agent 實作功能，或透過 Code Review 代理檢查拉取請求時，系統會在背景以非干擾的方式分析這些互動過程，從中萃取出高價值的隱性知識（例如：特定 API 的呼叫順序、日誌記錄的客製化格式、前端元件的狀態管理模式），並將其轉化為顯性記憶保存下來 4。

軟體專案是不斷迭代的，因此「確保記憶不過期」是架構設計上的巨大挑戰。Copilot 的解決方案是「即時驗證（Just-in-Time Verification）」與「強制引用（Citations）」。每一筆被儲存的記憶都必須附帶確切的程式碼檔案路徑與行號引用 4。當 Copilot CLI 開啟新會話並擷取到相關記憶準備注入 LLM 的上下文時，系統會先執行輕量級的讀取操作，比對當前工作分支的狀態。如果發現被引用的程式碼區塊已被大幅重構或刪除，系統將判定該記憶失效並予以拋棄，同時促使模型在後續互動中學習並儲存更新後的架構邏輯 4。

### **跨代理知識共享與隱私邊界**

記憶系統最顯著的價值在於跨代理的知識共享。例如，當 **Copilot Code Review** 代理在審查某個資深工程師的 PR 時，學習並記錄了一條規則：「本專案的所有錯誤日誌必須使用 Winston 套件，且格式必須包含時間戳記與專屬的錯誤代碼」。數天後，當一位新進開發者在終端機使用 **Copilot CLI** 建立新的微服務時，CLI 會主動檢索到這條記憶，並在生成服務骨架時自動套用正確的 Winston 日誌格式，完全不需人為的介入或預先提示 4。

在安全與隱私的管控上，記憶系統採取了極為嚴格的作用域隔離（Scoping）。記憶完全綁定於產生它的單一儲存庫。只有具備該儲存庫寫入權限（Write permissions）的貢獻者在進行有效操作時才能觸發記憶的生成；相對地，也只有具備讀取權限（Read permissions）的使用者才能在任務中受惠於這些記憶。這確保了企業的核心商業邏輯與專有架構模式，絕對不會發生跨儲存庫或跨組織的洩漏風險 4。

## **第八章：測試驅動 (TDD) 的自動化實踐架構**

測試驅動開發（Test-Driven Development, TDD）強調「紅-綠-重構（Red-Green-Refactor）」的短週期循環。這種嚴格的先寫測試、後寫實作的方法論，能夠有效地為 AI 代理建立起確定性的防護欄，防止模型產生看似語法正確卻存在深層邏輯漏洞的程式碼 5。

### **利用自訂代理 (Custom Agents) 建立 TDD 迴圈**

要在 Copilot CLI 中實現流暢的 TDD 工作流，最佳實踐是利用系統提供的「自訂代理（Custom Agents）」機制。開發者可以在 .github/agents/ 目錄下建立具有特定專長與行為邊界的多個虛擬代理，並透過「移交（Handoffs）」配置將它們串聯成一個完整的自動化軟體生產管線 5。

以下解構 TDD 三個階段的代理配置策略：

1. **紅燈代理（TDD-red.agent.md）**：  
   此代理的唯一職責是將需求轉化為「會驗證失敗的自動化測試（Failing tests）」。為了確保它不會越俎代庖，配置中必須嚴格限縮其工具權限。  
   * **允許工具**：僅開放 read、search 以及針對 tests/ 目錄的 edit 權限。  
   * **移交設定 (Handoffs)**：當代理完成測試編寫並透過 execute 工具確認測試確實失敗後，觸發移交機制給實作代理。

YAML  
name: TDD Red Agent  
description: 專注於撰寫失敗的單元與整合測試，嚴禁實作應用程式碼。  
handoffs:  
  \- label: "移交實作"  
    agent: TDD-green  
    prompt: "針對剛才撰寫且驗證失敗的測試，請實作滿足條件的最簡程式碼。"

2. **綠燈代理（TDD-green.agent.md）**：  
   此代理扮演純粹的實作者角色。它的目標是以最快速度、最少程式碼量讓紅燈代理寫下的測試由紅轉綠。  
   * **核心行為**：代理在修改應用程式碼（如 src/ 目錄）後，必須自動執行測試命令（如 npm test 或 pytest）。若測試未通過，它會自主擷取錯誤追蹤日誌（Stack trace）進行分析並反覆修正，直到終端機亮起綠燈為止 5。完成後，移交給重構代理。  
3. **重構代理（TDD-refactor.agent.md）**： 當功能已經滿足測試條件，重構代理會接手審視剛才的「最簡實作」。它的職責是在絕對不改變程式外部行為的前提下，優化程式碼的可讀性、消除重複邏輯（遵守 DRY 原則）並統一變數命名 5。  
   * **驗證機制**：每次重構動作完成後，代理必須再次執行測試套件，確保優化過程沒有破壞現有邏輯。確認無誤後，將控制權交還給開發者，或重啟紅燈代理進入下一個功能的開發迭代 5。

### **CLI 操作實務**

在終端機中，開發者可以透過精確的指令啟動此流程，大幅減少樣板程式碼的編寫勞動：

Bash

\# 指定啟動紅燈代理，並給予具體的業務規格要求  
copilot \--agent=TDD-red \--prompt "為訂單處理模組撰寫單元測試。需求包含：當訂單金額大於 1000 元時必須自動套用 9 折優惠；若庫存不足必須拋出 InsufficientStockException。需包含正常結帳流程與上述邊界條件的錯誤測試。"

代理接收指令後將自動生成完善的測試用例。得益於自訂代理的移交機制，系統會在每個階段的轉換點暫停，讓開發者檢視測試是否涵蓋了真實意圖，並決定是否授權進入實作或重構階段。這確保了開發者始終握有架構的控制權。

## **第九章：行為驅動開發 (BDD) 的全端自動化整合**

行為驅動開發（Behavior-Driven Development, BDD）是 TDD 的進階演化，其核心目的在於透過使用自然語言（如 Gherkin 語法的 Given-When-Then 結構）撰寫情境，藉此彌合非技術的業務端需求（Product Owners）與技術端實作之間的語義鴻溝 29。Copilot CLI 透過串聯 Agent Skills 與外部的 MCP 伺服器，能夠建構出令人驚豔的端到端 BDD 自動化工作流 6。

### **建構 BDD 特化的代理技能 (Agent Skill)**

為了標準化 BDD 的轉換流程，開發團隊可以建立一個專門負責解析需求與生成架構的技能，例如在 .github/skills/bdd-automation-flow/SKILL.md 中進行定義 29：

## ---

**name: bdd-automation-flow description: 當使用者提供業務需求 (Business Requirements)、User Story，或要求建立端到端 (E2E) 測試時觸發此技能。將需求轉換為 Gherkin 格式並生成 Playwright 自動化綁定。**

# **BDD 端到端自動化生成規範**

當接收到新的業務需求時，請依序執行以下精密的工作流：

1. **領域語言解析**：分析提供的需求，釐清核心業務規則與潛在的邊界條件。  
2. **Gherkin 特徵檔生成**：使用標準的 Given, When, Then, And, But 關鍵字撰寫 .feature 檔案。必須包含至少一個成功路徑 (Happy path) 以及兩個對應異常操作的場景 (Scenarios)。  
3. **現有步驟比對**：利用 MCP 工具搜尋專案中既有的 Step Definitions (如 tests/steps/)，盡可能重複使用已實作的步驟，避免程式碼冗餘。  
4. **自動化綁定生成 (Playwright)**：對於未被實作的新步驟，使用 TypeScript 與 Playwright 框架生成對應的測試定義碼。  
   * 參閱附帶的架構範本：references/playwright-step-template.ts。  
   * 利用 MCP 的 web\_fetch 或瀏覽器檢查工具，獲取目標頁面的真實 DOM 結構，以選擇最穩健的定位器 (Locators，如 data-testid)。

### **結合 MCP 驅動的 BDD 實戰迴圈**

這個技能的真正威力在於它如何與 MCP 伺服器交互作用，徹底自動化測試的準備工作 6。

1. **需求自動攝取 (Issue Tracking MCP)**：  
   開發者不需手動複製貼上規格，只需在 CLI 輸入：請透過 GitHub MCP 伺服器讀取 Issue \#405 的 Acceptance Criteria，並透過 bdd-automation-flow 技能為其建立測試場景。  
   代理程式會自動發送 API 請求抓取 Issue 內容，解析後在專案中建立結構化的 user\_checkout.feature 檔案。  
2. **情境與程式碼的智慧綁定 (Browser/E2E MCP)**： 當處理到 Given I am on the checkout page 或 When I enter an invalid credit card 這些 Gherkin 步驟時，若專案中掛載了如 Playwright MCP 伺服器 35，Copilot CLI 可以主動向該伺服器發送指令以獲取應用程式當前的 DOM 狀態 6。代理會據此生成高度精確的 TypeScript 測試程式碼，例如自動找出正確的輸入框選擇器並填入測試資料，完成從「純文字業務情境」到「可執行自動化測試腳本」的無縫轉換 6。

這種深度整合將傳統上需要產品經理、QA 測試工程師與前端開發者頻繁開會與切換上下文的繁冗過程，濃縮為在終端機內與 AI 的一場連貫對話。人類專注於確認 Gherkin 情境是否精確反映了商業價值，而 Copilot CLI 則包辦了所有底層的程式碼綁定與環境交互勞動。

## **第十章：企業導入策略與總結**

GitHub Copilot CLI 的正式推出，不僅僅是命令列工具的升級，更代表著軟體開發從「人工手動撰寫」向「人類監督、AI 自主執行」架構的根本性轉變。終端機不再只是一個被動接受單行指令的視窗，而是成為了管理與調度虛擬 AI 工程團隊的中控台。

為了在企業環境中發揮這套架構的最大潛力，同時避免失控的自動化帶來的技術風險，開發團隊在導入時應嚴格落實以下實務策略：

1. **強制實施規格驅動 (Spec-Driven Development)**：徹底屏棄無紀律的提示詞編碼。將 constitution.md 納入專案的標準初始化流程，透過定義嚴謹的架構邊界與實作前檢查閘道，確保模型產出的每一行程式碼都符合長期的可維護性標準。  
2. **組織隱性知識的資產化 (Skills Engineering)**：將團隊長期積累的 DevOps 部署流程、特定框架的效能調校指南以及故障排除清單，全面封裝為版本控制的 Agent Skills (SKILL.md)。這不僅指導了 AI 代理，也變相完成了團隊知識庫的標準化。  
3. **貫徹零信任安全攔截 (Zero-Trust Hooks)**：絕對不可輕忽 AI 代理在本地環境中擁有執行權限的風險。必須善用 hooks.json 中的 preToolUse 生命週期鉤子，透過 Bash 或 Python 腳本對代理企圖執行的終端機命令與檔案寫入路徑實施嚴格的正則掃描與微型沙盒隔離，從系統層面阻絕幻覺（Hallucination）或提示詞注入造成的毀滅性操作。  
4. **極大化上下文感知 (MCP Integration)**：積極配置 mcp-config.json，將 AI 的感知能力從靜態程式碼延伸至動態的雲端資源（如 Azure MCP）、本地自動化工具（如 Playwright MCP）與企業內部的專有 API。透過精細的工具權限（Tools allowed list）管控，在賦能與安全之間取得平衡。  
5. **常態化 AI 驅動的測試迴圈 (Automated TDD/BDD)**：利用自訂代理的移交機制（Handoffs），建立紅綠重構的自動化管線；並透過技能與 MCP 的結合，自動將業務端的 Gherkin 規格轉化為自動化測試碼。讓 AI 成為測試覆蓋率的守護者。

總結而言，GitHub Copilot CLI 的架構設計提供了一個無與倫比的自動化執行平台。企業的工程重心應從「如何教導 AI 寫出特定語法」，戰略性地轉移至「如何設計嚴密的系統規格、工作流技能與安全驗證閘道，以精準指揮 AI 代理艦隊的運作」，方能在這波代理型 AI 的浪潮中，確保軟體產品的創新速度與工程品質達到完美的平衡。

#### **引用的著作**

1. GitHub Copilot CLI is now generally available \- GitHub Changelog, 檢索日期：3月 4, 2026， [https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/)  
2. GitHub Copilot CLI Reaches General Availability, Bringing Agentic Coding to the Terminal, 檢索日期：3月 4, 2026， [https://visualstudiomagazine.com/articles/2026/03/02/github-copilot-cli-reaches-general-availability-bringing-agentic-coding-to-the-terminal.aspx](https://visualstudiomagazine.com/articles/2026/03/02/github-copilot-cli-reaches-general-availability-bringing-agentic-coding-to-the-terminal.aspx)  
3. Spec-driven development: Using Markdown as a programming language when building with AI \- The GitHub Blog, 檢索日期：3月 4, 2026， [https://github.blog/ai-and-ml/generative-ai/spec-driven-development-using-markdown-as-a-programming-language-when-building-with-ai/](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-using-markdown-as-a-programming-language-when-building-with-ai/)  
4. Building an agentic memory system for GitHub Copilot, 檢索日期：3月 4, 2026， [https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/](https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/)  
5. Set up a test-driven development flow in VS Code, 檢索日期：3月 4, 2026， [https://code.visualstudio.com/docs/copilot/guides/test-driven-development-guide](https://code.visualstudio.com/docs/copilot/guides/test-driven-development-guide)  
6. Wopee-io/BDD-Copilot-with-Playwright \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/Wopee-io/BDD-Copilot-with-Playwright](https://github.com/Wopee-io/BDD-Copilot-with-Playwright)  
7. GitHub Copilot CLI: Enhanced agents, context management, and new ways to install, 檢索日期：3月 4, 2026， [https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/](https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/)  
8. GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://github.com/github/copilot-cli](https://github.com/github/copilot-cli)  
9. Supported AI models in GitHub Copilot, 檢索日期：3月 4, 2026， [https://docs.github.com/copilot/reference/ai-models/supported-models](https://docs.github.com/copilot/reference/ai-models/supported-models)  
10. GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/copilot-cli](https://docs.github.com/en/copilot/how-tos/copilot-cli)  
11. About GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/copilot/concepts/agents/about-copilot-cli](https://docs.github.com/copilot/concepts/agents/about-copilot-cli)  
12. Using GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli)  
13. A cheat sheet to slash commands in GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://github.blog/ai-and-ml/github-copilot/a-cheat-sheet-to-slash-commands-in-github-copilot-cli/](https://github.blog/ai-and-ml/github-copilot/a-cheat-sheet-to-slash-commands-in-github-copilot-cli/)  
14. GitHub Copilot CLI Custom Agents: Building Your Command-Line AI Assistant \- Jimmy Song, 檢索日期：3月 4, 2026， [https://jimmysong.io/blog/github-copilot-cli-custom-agents/](https://jimmysong.io/blog/github-copilot-cli-custom-agents/)  
15. GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://github.com/features/copilot/cli](https://github.com/features/copilot/cli)  
16. Spec-Driven Development: Stop Vibe Coding and Start Shipping ..., 檢索日期：3月 4, 2026， [https://medium.com/ngconf/spec-driven-development-stop-vibe-coding-c42a1f948b26](https://medium.com/ngconf/spec-driven-development-stop-vibe-coding-c42a1f948b26)  
17. Spec-driven development with AI: Get started with a new open source toolkit \- The GitHub Blog, 檢索日期：3月 4, 2026， [https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)  
18. Diving Into Spec-Driven Development With GitHub Spec Kit \- Microsoft for Developers, 檢索日期：3月 4, 2026， [https://developer.microsoft.com/blog/spec-driven-development-spec-kit](https://developer.microsoft.com/blog/spec-driven-development-spec-kit)  
19. Inside Spec-Driven Development: What GitHub's Spec Kit Makes Possible for AI-assisted Engineering \- EPAM, 檢索日期：3月 4, 2026， [https://www.epam.com/insights/ai/blogs/inside-spec-driven-development-what-githubspec-kit-makes-possible-for-ai-engineering](https://www.epam.com/insights/ai/blogs/inside-spec-driven-development-what-githubspec-kit-makes-possible-for-ai-engineering)  
20. spec-kit/spec-driven.md at main \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/github/spec-kit/blob/main/spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md)  
21. Azure-Samples/azure-speckit-constitution \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/Azure-Samples/azure-speckit-constitution](https://github.com/Azure-Samples/azure-speckit-constitution)  
22. Spec-Driven Development with GitHub Spec Kit \+ Copilot in VS Code (New \+ Existing Projects) | by Vamshi Rapolu | Medium, 檢索日期：3月 4, 2026， [https://medium.com/@vamshi.rapolu/spec-driven-development-with-github-spec-kit-copilot-in-vs-code-new-existing-projects-2531d10bd61d](https://medium.com/@vamshi.rapolu/spec-driven-development-with-github-spec-kit-copilot-in-vs-code-new-existing-projects-2531d10bd61d)  
23. GitHub \- github/spec-kit: Toolkit to help you get started with Spec-Driven Development, 檢索日期：3月 4, 2026， [https://github.com/github/spec-kit](https://github.com/github/spec-kit)  
24. Why Spec-Driven Development Is the Antidote to Vibe Coding \- Medium, 檢索日期：3月 4, 2026， [https://medium.com/@rupeshit/why-spec-driven-development-is-the-antidote-to-vibe-coding-516200fe51cc](https://medium.com/@rupeshit/why-spec-driven-development-is-the-antidote-to-vibe-coding-516200fe51cc)  
25. Creating agent skills for GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills)  
26. Let it Cook \- Agent Skills aka Skills.md in VS Code \- YouTube, 檢索日期：3月 4, 2026， [https://www.youtube.com/watch?v=rIrxkB-02P0](https://www.youtube.com/watch?v=rIrxkB-02P0)  
27. The complete guide to Agent Skills \- YouTube, 檢索日期：3月 4, 2026， [https://www.youtube.com/watch?v=fabAI1OKKww](https://www.youtube.com/watch?v=fabAI1OKKww)  
28. Use Agent Skills in VS Code, 檢索日期：3月 4, 2026， [https://code.visualstudio.com/docs/copilot/customization/agent-skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)  
29. GitHub Copilot Instructions vs Prompts vs Custom Agents vs Skills vs ..., 檢索日期：3月 4, 2026， [https://dev.to/pwd9000/github-copilot-instructions-vs-prompts-vs-custom-agents-vs-skills-vs-x-vs-why-339l](https://dev.to/pwd9000/github-copilot-instructions-vs-prompts-vs-custom-agents-vs-skills-vs-x-vs-why-339l)  
30. 3 Principles for Designing Agent Skills \- Block Engineering Blog, 檢索日期：3月 4, 2026， [https://engineering.block.xyz/blog/3-principles-for-designing-agent-skills](https://engineering.block.xyz/blog/3-principles-for-designing-agent-skills)  
31. Configuring model context protocol in the GitHub Copilot CLI | demo \- YouTube, 檢索日期：3月 4, 2026， [https://www.youtube.com/watch?v=O73egpvWcpY](https://www.youtube.com/watch?v=O73egpvWcpY)  
32. Adding MCP servers for GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)  
33. Using the GitHub MCP Server, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server)  
34. Add and manage MCP servers in VS Code, 檢索日期：3月 4, 2026， [https://code.visualstudio.com/docs/copilot/customization/mcp-servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)  
35. microsoft/playwright-mcp \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)  
36. Quickstart: Integrate Azure MCP Server with GitHub Copilot CLI \- Microsoft Learn, 檢索日期：3月 4, 2026， [https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/how-to/github-copilot-cli](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/how-to/github-copilot-cli)  
37. Using hooks with GitHub Copilot CLI, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)  
38. Hooks configuration \- GitHub Docs, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/reference/hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)  
39. About hooks \- GitHub Docs, 檢索日期：3月 4, 2026， [https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks)  
40. Claude Code Guide \- Setup, Commands, workflows, agents, skills & tips-n-tricks \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/zebbern/claude-code-guide](https://github.com/zebbern/claude-code-guide)  
41. About agentic memory for GitHub Copilot, 檢索日期：3月 4, 2026， [https://docs.github.com/copilot/concepts/agents/copilot-memory](https://docs.github.com/copilot/concepts/agents/copilot-memory)  
42. Accelerate test-driven development with AI \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/readme/guides/github-copilot-automattic](https://github.com/readme/guides/github-copilot-automattic)  
43. cucumber/vignettes/bdd.qmd at main \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/jakubsob/cucumber/blob/main/vignettes/bdd.qmd](https://github.com/jakubsob/cucumber/blob/main/vignettes/bdd.qmd)  
44. cucumber/godog: Cucumber for golang \- GitHub, 檢索日期：3月 4, 2026， [https://github.com/cucumber/godog](https://github.com/cucumber/godog)  
45. bdd-feature-generator \- Skill | Smithery, 檢索日期：3月 4, 2026， [https://smithery.ai/skills/GabiHert/bdd-feature-generator](https://smithery.ai/skills/GabiHert/bdd-feature-generator)  
46. Extending GitHub Copilot coding agent with the Model Context Protocol (MCP), 檢索日期：3月 4, 2026， [https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp)