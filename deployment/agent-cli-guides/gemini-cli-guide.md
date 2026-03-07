# **Gemini CLI 深度研究與系統架構報告：邁向自律型軟體工程的終端機革命**

## **核心系統導入與架構基礎哲學**

在當今軟體工程領域，將生成式人工智慧（Generative AI）無縫整合至開發者的日常工作區已成為提升生產力的關鍵。Gemini CLI 並非僅是一個將語言模型（LLM）封裝進命令列介面（CLI）的簡單終端機工具，而是一個具備深度環境感知、高度可擴展性且遵循嚴謹安全規範的系統層級整合平台 1。該系統的核心架構設計旨在消弭「編寫程式碼」、「執行系統指令」與「AI 推理」之間的壁壘，透過 Node.js 環境實現跨平台的全域部署，並透過 @google/gemini-cli 套件將強大的 Gemini 模型算力直接引入開發者的本機檔案系統 1。

從初始化與部署的維度來看，系統展現了針對企業與個人開發者的雙向適應性。安裝完成後，系統嚴格區分了個人帳戶與企業帳戶的存取與認證機制，這種分離不僅是為了計費與配額管理，更是為後續的資料隱私、權限控管與「Token 快取」（Token Caching）等進階機制奠定了底層基礎 1。系統的整體文件架構與導覽設計反映了其工程化思維，將功能劃分為入門引導、進階特性（如代理技能、模型上下文協議、鉤子）、組態管理與開發者資源等維度 1。這種結構暗示了使用者角色的典範轉移：開發者不再僅是輸入提示詞的「指令操作者」，而是轉變為設計與約束 AI 行為的「工作流架構師」。

## **憲規矩陣與組態管理：形塑代理行為的底層邏輯**

在探討具體功能之前，必須深入剖析 Gemini CLI 的「憲規」（Constitutional Rules）與組態管理機制。在人工智慧代理的語境中，憲規指的是約束、引導與限制模型行為的底層指令矩陣、權限邊界以及安全策略。Gemini CLI 採用了高度分層且嚴格的組態覆蓋機制，確保系統行為既具備全域的一致性，又能動態適應特定專案的微觀需求。

### **階層式上下文與 GEMINI.md**

系統的行為指引主要透過 GEMINI.md 檔案來實現，這是一種被稱為「階層式上下文記憶體統」（Hierarchical Instructional Context）的創新設計 3。這種機制的設計哲學在於消除傳統提示詞工程中頻繁且冗餘的背景脈絡輸入，轉而依賴持久化、結構化的文檔。此記憶架構分為三個主要維度：全域上下文、環境/工作區上下文以及即時（JIT）上下文 4。全域上下文儲存於使用者的根目錄（\~/.gemini/GEMINI.md）中，負責定義跨專案通用的開發者偏好、系統級別的預設提示詞覆蓋（System Prompt Override）與基礎風格；專案上下文則位於具體專案的根目錄或其父目錄中，提供針對該專案架構（例如指定使用 React 搭配 Vite、測試框架要求等）的具體規範；即時上下文則在模型透過工具存取特定本機目錄時，自動向上掃描並動態載入至信任的根目錄 3。

這種階層設計的深層意涵在於，模型在每次對話初始化時，會自動串聯這些分散的 Markdown 檔案，形成一個龐大且精確的系統提示詞 3。開發者可以透過 /init 指令，讓系統自動分析當前目錄結構並生成量身定制的 GEMINI.md 檔案，極大化地降低了制定專案憲規的門檻 2。同時，系統提供了 /memory 指令群（如 show、refresh、add）讓開發者即時檢視或強制重載這些被串聯的原始文字，這為除錯「代理為何忽略特定架構規則」提供了透明的內部視角 2。

### **安全策略、動態防護與檔案過濾**

除了行為指引，安全與權限控制是系統憲規的另一核心支柱。在處理本機檔案與系統環境變數時，Gemini CLI 展現了極高的企業級防護標準。系統內建了環境變數的自動遮蔽（Automatic Redaction）機制，預設情況下，任何名稱包含 TOKEN、SECRET、PASSWORD、CREDENTIAL 或 KEY 等敏感字眼的變數，以及其值符合已知金鑰特徵（如 RSA 私鑰、API 憑證）的資料，都會在模型存取環境或與外部系統通訊時遭到靜默遮蔽 3。若需共享特定變數，開發者必須在組態檔中進行顯式覆蓋宣告，這種「預設拒絕、顯式允許」的設計原則，有效防堵了第三方擴充導致的資料外洩 6。

更進一步，系統引入了實驗性的 LLM 動態安全策略生成功能（如 advanced.autoConfigureMemory），此功能利用語言模型本身來動態分析使用者的提示詞，並即時生成與強制執行針對工具使用的安全策略，為防止意外操作提供了額外的動態防護層 3。在檔案系統層面，系統允許透過 context.fileFiltering.customIgnoreFilePaths 設定超越 .geminiignore 與 .gitignore 優先級的自訂忽略路徑，並支援 context.fileFiltering.enableFuzzySearch 進行模糊搜尋，確保代理在建構上下文時不會誤讀敏感或龐大的編譯輸出檔 3。

為了應對不同維度的組態需求，系統遵循嚴格的設定覆蓋邏輯：

| 優先層級 (低至高) | 組態來源 | 檔案路徑或設定方式 | 架構意義與應用場景 |
| :---- | :---- | :---- | :---- |
| 1 | 應用程式預設值 | 系統核心硬編碼 | 維持系統運作的最低防線與預設參數 3。 |
| 2 | 系統預設檔 | /etc/gemini-cli/system-defaults.json 等 | 作業系統層級的基線設定，確保底層穩定 3。 |
| 3 | 使用者全域設定 | \~/.gemini/settings.json | 單一使用者的跨專案偏好與個人化 UI/佈景主題設定 3。 |
| 4 | 專案特定設定 | .gemini/settings.json | 針對單一專案庫的嚴格規範，隨版控共享 3。 |
| 5 | 系統強制覆蓋 | /etc/gemini-cli/settings.json | 企業 IT 部門統一派發的強制合規性規範 3。 |
| 6 | 環境變數 | .env 檔案或終端機 $VAR | 支援執行期間的動態憑證注入與 CI/CD 佈署 3。 |
| 7 | 命令列參數 | 啟動時帶入的旗標 (如 \--model) | 具備最高優先順序，覆蓋所有底層配置以應對單次任務 3。 |

## **代理技能（Agent Skills）：漸進式專業知識的封裝與調度**

在處理極度複雜的軟體工程任務時，單一且龐大的系統提示詞往往會導致上下文視窗（Context Window）的超載，進而稀釋模型的注意力、降低推理品質並劇增運算成本。為解決此瓶頸，Gemini CLI 引入了「代理技能」（Agent Skills）架構，這是一種基於開放標準的專業知識與程序工作流封裝機制 2。

### **漸進式揭露架構與生命週期**

與常駐記憶體的 GEMINI.md 全域上下文不同，代理技能採用了「漸進式揭露」（Progressive Disclosure）的架構設計。每個技能本質上是一個獨立的資料夾，內部包含了定義技能中繼資料的 SKILL.md 檔案，以及相關的腳本目錄（scripts/）、參考文件（references/）與靜態資產（assets/） 2。在 CLI 會話的初始化階段，系統僅會掃描並載入已啟用技能的「名稱」與「描述」至系統提示詞中，而絕對不會載入其實際主體內容 2。這種精簡的元資料注入極大地節省了初始的 Token 消耗，同時賦予了模型對可用工具的廣泛認知。

當使用者提出的需求與某個技能的描述高度契合時（例如要求代理「審查遠端 PR」或「進行資安稽核」），模型會自主決策並呼叫內建的 activate\_skill 工具 8。此工具一旦被觸發，介面會向使用者發出包含技能名稱、目的與即將存取路徑的確認請求；獲准後，系統才會將 SKILL.md 的完整 Markdown 主體內容以及該技能目錄下的資源路徑注入到當前的對話歷史中，並賦予代理讀取這些特定資產的檔案系統權限 2。一旦技能被啟動，其內含的專家級程序邏輯（Specialized logic）與特定標準將在該次對話的剩餘生命週期中持續引導代理的行為，確保多步驟任務能夠遵循嚴謹的標準作業程序被一致性地執行 2。

### **技能發現層級與管理機制**

技能的發現機制被精心劃分為三個具有明確優先順序的層級，以支援從個人創新到企業標準化的不同應用場景：

| 發現層級 | 預設儲存路徑 | 覆蓋優先順序 | 系統架構意義與適用情境 |
| :---- | :---- | :---- | :---- |
| 工作區技能 (Workspace) | .gemini/skills/ 或 .agents/skills/ | 最高 (第一順位) | 這些技能通常被提交至版本控制系統中，確保整個開發團隊在處理特定專案時，共享完全一致的工作流與審查標準 2。 |
| 使用者技能 (User) | \~/.gemini/skills/ 或 \~/.agents/skills/ | 中等 (第二順位) | 儲存於開發者的個人根目錄，提供跨專案的個人生產力自動化腳本，不受特定專案庫的環境限制 2。 |
| 擴充套件技能 (Extension) | 擴充套件的內部安裝路徑 | 最低 (第三順位) | 透過安裝第三方或官方擴充套件所帶入的通用型社群技能，用於快速賦能代理處理常見的開源框架任務 2。 |

若存在同名技能，系統將嚴格遵循上述「工作區 \> 使用者 \> 擴充套件」的優先順序進行覆蓋。開發者可透過互動式會話指令（如 /skills list、/skills disable \<name\>、/skills enable \<name\>）即時管理這些能力模組的啟用狀態，或者利用終端機命令 gemini skills link 從本地目錄建立符號連結（Symlink）來匯入開發中的技能，展現了系統極高的擴充性與除錯便利性 2。

## **模型上下文協議（MCP）：無邊界感知與操作架構**

Gemini CLI 的基礎能力受限於其內建的檔案讀寫與終端機執行工具。然而，透過深度整合「模型上下文協議」（Model Context Protocol, MCP），系統架構完成了一次質的飛躍，從封閉的本機代理演化為能夠與廣泛外部系統、資料庫、雲端 API 甚至專有微服務互動的超級節點 6。MCP 伺服器扮演了 LLM 與外部世界之間的標準化橋樑，使代理能夠動態發掘新工具、讀取遠端資源，並接收結構化的回應 6。

### **核心整合架構的雙層設計**

系統對 MCP 的支援並非簡單的 API 呼叫，而是建構在核心套件（packages/core/src/tools/）中的高階雙層架構之上：

1. **發現層（Discovery Layer, mcp-client.ts）**：此層負責基礎架構的連線與協議握手。由 discoverMcpTools() 函式進行編排，它首先讀取組態檔中 mcpServers 的矩陣配置，並根據設定建立適當的傳輸通道。在連線建立後，系統會透過 MCP 協定拉取伺服器所宣告的工具定義與資源綱要。為確保與 Gemini API 的嚴格相容性，發現層會對這些外部綱要進行深度的消毒（Sanitization）與驗證，最後整合衝突解決機制，將這些工具無縫註冊到系統的全域工具登錄檔中 6。
2. **執行層（Execution Layer, mcp-tool.ts）**：當代理的推理引擎決定使用被發現的外部工具時，執行層便會介入。每個 MCP 工具在系統內部被安全封裝為 DiscoveredMCPTool 實例。此實例不僅負責處理參數的傳遞，更關鍵的是它承擔了安全確認邏輯。它會評估伺服器的信任設定檔（Trust settings），決定是否需要中斷自動化流程以獲取使用者的顯式授權。在執行完畢後，它妥善管理連線狀態，並將伺服器返回的原始負載轉換為 LLM 能夠理解的語意結構 6。

### **傳輸機制與組態佈署策略**

MCP 的強大彈性體現在其支援的多樣化傳輸機制與精細的組態參數上。開發者需在 settings.json 的 mcpServers 區塊中定義伺服器配置 6：

| 傳輸機制類型 | 組態關鍵字 | 運作原理與系統整合場景 |
| :---- | :---- | :---- |
| 標準輸入輸出 (Stdio) | command, args, cwd | 透過生成子處理程序（Subprocess）並利用 stdin/stdout 進行通訊。最適用於本機運行的 Docker 容器伺服器（如 mcp-server-milvus 或 GitHub MCP）或本機可執行的 Node.js/Python 腳本 2。 |
| 伺服器傳送事件 (SSE) | url | 連線至支援 Server-Sent Events 的遠端端點。適用於需要維持長連線以接收非同步更新的雲端服務或企業內部中介軟體 2。 |
| 串流 HTTP (Streamable) | httpUrl | 利用 HTTP 串流技術進行雙向資料交換。適用於基於標準 Web 協定構建的分散式遠端微服務架構 2。 |

在全域組態管理上，系統允許透過 mcp.allowed 與 mcp.excluded 來嚴格管控哪些伺服器被允許連線。針對單一伺服器，開發者可設定 includeTools 或 excludeTools 陣列，精確過濾模型可見的工具範圍，其中排除名單享有較高的解析優先權 6。

以設定 GitHub MCP 伺服器為例，開發者需建立 Docker 執行環境，並申請具備讀取 Metadata/Contents 與讀寫 Issues/PRs 權限的細緻個人存取權杖（PAT）。在組態中，使用 docker run 作為啟動命令，並利用 env 屬性將本機的 GITHUB\_PERSONAL\_ACCESS\_TOKEN 安全地映射至容器內，確保憑證不會硬編碼於 JSON 檔案中 2。設定完成後，開發者可直接以自然語言命令代理「列出某儲存庫中開啟的 PR」，代理便會自主辨識意圖並呼叫對應的 MCP 工具 2。系統同時提供了 /mcp auth（處理 OAuth 授權）、/mcp desc（檢視工具綱要）與 /mcp refresh（強制重載工具定義）等指令來完善管理生命週期 2。透過擴充套件畫廊（Extension Gallery），開發者更可一鍵導入如 Google Drive、Postman API、Exa Web Search 等無數外部整合能力 11。

## **鉤子（Hooks）：生命週期攔截與防禦性編程**

如果說 MCP 擴展了代理的操作邊界，那麼「鉤子」（Hooks）系統則賦予了開發者在微觀層面對代理運作生命週期進行攔截、審計與改造的終極控制權 2。鉤子系統允許開發者編寫自訂邏輯，在 Gemini CLI 執行特定核心事件時自動觸發，這不僅是自動化的延伸，更是防禦性編程（Defensive Programming）在 AI 代理系統中的具體實踐。

在系統組態層面，鉤子主要透過 settings.json 中的 hooks 物件進行定義與管理 3。系統目前開放了兩個關鍵的非同步攔截點：

1. **hooks.BeforeTool**：這是一個陣列組態，定義了在代理正式呼叫任何工具（包含高風險的本機 Shell 命令與外部 MCP 工具）之前必須執行的掛鉤邏輯 3。其核心商業價值在於「風險阻斷與合規性驗證」。開發者可以利用它來攔截特定的 API 呼叫、根據企業安全合規性動態驗證即將傳遞的工具參數，甚至在偵測到潛在的破壞性操作（如異常的資料庫 Drop 指令）時，直接修改參數或強制阻擋該次工具執行 3。
2. **hooks.AfterTool**：此陣列定義了在工具執行完畢、但其結果尚未回傳給 LLM 之前的攔截邏輯 3。此階段的鉤子主要用於「結果後處理與鏈式觸發」。例如，開發者可編寫腳本過濾輸出中可能包含的伺服器實體路徑或機密日誌資料，將雜亂的執行結果格式化以節省 Token，或者根據工具的回傳失敗狀態（Exit Code），自動觸發其他補救性的網路請求或後續工作流（Follow-up actions） 3。

為了提供完整的可視性與控制權，系統組態允許透過 hooksConfig.notifications 參數啟用視覺化指示器，讓開發者在終端機中明確知曉當前是否有背景鉤子正在靜默執行 7。同時，若在除錯過程中遇到無限迴圈或需進行純淨環境測試，開發者可利用 /hooks disable-all 指令瞬間切斷所有掛鉤的干預，並可隨時利用 /hooks enable-all 恢復，而無需繁瑣地修改深層設定檔 2。

## **自動化工作流與子代理機制：邁向自律型工程系統**

Gemini CLI 的最高階應用，在於透過系統提供的多維度工具，建構出能夠在無人干預或極少人為干預下獨立運行的自動化工作流（Automated Workflows）。這標誌著系統從被動的「智慧對話框」徹底進化為具備規劃與執行能力的「自律型工程系統」 1。

### **終端機指令整合與自主修復迴圈**

系統提供了兩種深度的 Shell 整合模式，打破了 AI 與作業系統之間的隔閡。第一種是透過前綴符號 \! 發送單次指令（如 \!ls \-la 或 \!git status），這種「穿透式」指令能讓開發者在不干擾 AI 對話上下文的前提下，快速擷取系統狀態，其標準輸出預設對 AI 不可見，除非開發者主動將其作為後續提示詞的基礎 2。第二種則是持久化的「Shell 模式」（透過輸入單一 \! 並按下 Enter 啟動），在此模式下，系統變數 GEMINI\_CLI=1 會被設定，所有的輸入皆被視為原生系統（Bash/Zsh/PowerShell）指令執行，直到開發者按下 Esc 或輸入 exit 退出 2。

更具革命性的是，代理本身被賦予了呼叫 run\_shell\_command 工具的能力。這催生了一種被稱為「自主工程師」（Autonomous Engineer）的迭代修復迴圈。在典型的自動化情境（例如「執行單元測試並修復任何錯誤」）中，工作流呈現出高度自律的循環：首先，代理主動呼叫工具執行測試指令（如 npm test）；若遭遇失敗，代理會自主捕捉並解析標準錯誤輸出（stderr）；接著，利用 read\_file 工具深究出錯的原始碼檔案；隨後，使用 replace 或 write\_file 進行程式碼邏輯修正；最終再次觸發測試指令驗證修復成果 13。此一閉環流程徹底改變了除錯的典範，將開發者從瑣碎的語法修正中解放出來。

### **無頭模式（Headless Mode）與 CI/CD 深度整合**

為了將這種自動化推理能力延伸至企業級的持續整合與部署（CI/CD）管線中，系統完整支援「無頭模式」（Headless Mode）。此模式允許開發者拋棄互動式終端介面，將資料透過標準輸入（管道符號 |）直接傳遞給 Gemini CLI，並要求代理產出特定格式（如純粹的結構化 JSON 或 XML）的輸出，以供後續的 Shell 腳本或其他自動化工具消費處理 14。

在實際的企業應用中，這種能力被廣泛用於問題追蹤（Issue Triage）與拉取請求（Pull Request）的自動化管理 15。例如，透過內建的 /setup-github 指令，系統能自動配置 GitHub Actions 工作流 2。這些工作流（例如 .github/workflows/release-manual.yml）可以設定為在夜間批次執行或由特定的 Git 事件觸發，代理將在背景自主提取 PR 內容、執行代理技能中的程式碼審查標準、編譯專案、自動推進版本號，並最終產出格式化的發布說明（Release Notes）發布至 NPM 或容器註冊表 15。這證明了系統具備接管成熟軟體發佈生命週期的強大潛力。

### **子代理（Subagents）與分散式任務處理架構**

在處理極端複雜、跨領域的架構任務時，單一代理的推理深度、Token 限制與工具集合往往會面臨瓶頸。為此，Gemini CLI 引入了實驗性的「子代理」（Subagents）架構 2。子代理是被設計為解決特定領域問題的微型專家模型，它們在主代理的會話之外獨立運行，擁有自己的系統提示詞、人格特質與被嚴格限縮的專屬工具集 2。此功能需在 settings.json 中設定 "experimental": { "enableAgents": true } 方可啟用 2。

開發者可以在專案級別（.gemini/agents/\*.md）或使用者級別（\~/.gemini/agents/\*.md）透過 YAML 前置資料自訂子代理。設定檔涵蓋了代理名稱、描述（供主代理判斷何時調用）、允許的工具清單（tools）、指定的底層模型（如 gemini-2.5-pro）、溫度參數（temperature，範圍 0.0 \- 2.0）、最大對話輪數限制（max\_turns）以及執行超時限制（timeout\_mins） 2。系統同時內建了多種專家代理，例如專職處理複雜依賴關係分析與反向工程的「程式碼庫調查員」（codebase\_investigator）、CLI 自身的技術支援專家（cli\_help），以及負責任務路由的總管（generalist\_agent） 2。

子代理架構的核心優勢在於「上下文隔離」與「YOLO 模式」的高效執行。當主代理將子任務委派給子代理時，雙方的探討在獨立的對話迴圈中進行，完成後僅將精煉的結論回傳，這大幅減少了主會話歷史中的 Token 污染與浪費 2。更關鍵的是，子代理預設運行於 YOLO（You Only Look Once）模式下，意味著它們在執行強大的檔案寫入或系統命令時，不需要使用者的逐次授權確認，極大化了背景自動化執行的流暢度 2。此外，系統也正在發展遠端子代理（Remote Subagents）功能，透過 Agent-to-Agent (A2A) 協議，未來的任務委派將不再侷限於本機處理器，而是能跨越網路邊界，調度雲端或其他實體環境下的專用代理群集 2。

## **模型特性、路由策略與進階防護機制**

Gemini CLI 的卓越表現，同樣依賴於對底層 LLM 引擎的精細控制，以及一系列為防範 AI 幻覺與破壞性操作而量身打造的進階特性。

### **模型選擇、智慧路由與 Token 快取**

系統提供了極具彈性的模型選擇與路由機制。透過啟動旗標 \--model 或互動式指令 /model（其提供 Auto、Manual 選擇介面），開發者可以即時切換背後驅動的推理引擎 2。

| 路由模式 | 核心邏輯與架構意義 | 典型驅動模型系列 |
| :---- | :---- | :---- |
| Auto (自動路由) | 系統預設且推薦的智慧配置。路由器會根據使用者提示詞的複雜性動態切換模型。對於涉及底層架構設計的高難度任務呼叫強大模型，而針對簡單的文字格式轉換或單行修正則採用高速模型，從而在推理能力、延遲與成本間取得完美平衡 2。 | gemini-3-pro-preview / gemini-3-flash-preview 或 gemini-2.5-pro / gemini-2.5-flash 2 |
| Manual Pro (手動專業版) | 強制將所有推理請求路由至擁有最高深度與多步規劃能力的模型。適用於面對極其複雜的除錯、跨檔案重構或需要高度創意的演算法生成任務 2。 | Pro 系列 |
| Manual Flash (手動閃電版) | 強制路由至低延遲模型。當任務需求單純（如將 JSON 物件轉換為 YAML 字串），且極度追求即時回饋與 API 成本管控時的理想選擇 2。 | Flash 或 Flash-Lite 系列 |

值得注意的是，主會話的模型設定並不能強制覆蓋子代理（Subagents）在 YAML 中宣告的特定模型偏好，這種設計確保了各領域專家始終運行在最適合其任務性質的引擎上 2。

針對使用 API 金鑰（包含標準 Gemini API 與 Vertex AI）進行認證的使用者，系統會在底層自動啟用強大的「Token 快取」（Token Caching）技術 2。此技術藉由在後續 API 請求中重複利用先前已處理過的系統指令、技能文檔與龐大的對話上下文資料，不僅顯著降低了回應延遲，更大幅削減了整體的營運成本。開發者可透過 /stats 指令即時監控會話統計、配額消耗、快取命中率與節省的 Token 數量 2。然而，受限於底層 Code Assist API 的架構限制，目前使用 OAuth 認證的 Google 個人或企業帳戶暫不支援此快取機制 2。

### **安全防護：沙箱隔離與計畫模式**

在賦予代理本機寫入權限的同時，Gemini CLI 建立了多層次的防禦縱深。首先是作業系統層級的「沙箱隔離」（Sandboxing）。在 macOS 環境中，系統深度整合了作業系統原生的 Seatbelt 防護機制（sandbox-exec），透過設定 SEATBELT\_PROFILE 環境變數，開發者可套用不同嚴格等級的安全設定檔 2：

| 沙箱設定檔 (Seatbelt Profile) | 寫入權限邊界 | 網路存取權限 | 核心防護目標與適用場景 |
| :---- | :---- | :---- | :---- |
| permissive-open (預設) | 嚴格限制寫入操作必須發生在當前專案目錄之內。 | 允許常規存取。 | 作為基準防護，防止代理誤刪或修改專案外的系統核心檔案 2。 |
| permissive-proxied | 限制於專案目錄內。 | 強制透過代理伺服器。 | 結合本機檔案保護與企業內部網路流量管控 2。 |
| restrictive-open | 極度嚴格的讀寫管控。 | 允許常規存取。 | 針對處理高度敏感或不可逆專案時的縱深防禦 2。 |
| strict-proxied | 全面限制讀寫操作。 | 強制透過代理伺服器。 | 在零信任架構下的極端隔離測試環境 2。 |

若代理的操作違反了沙箱邊界，系統會直接在底層拋出「Operation not permitted」錯誤中斷流程。對於 Windows 或 Linux 系統，Gemini CLI 則提供基於 Docker 或 Podman 的容器化沙箱方案，允許透過 SANDBOX\_FLAGS 注入自訂的安全參數（如 \--security-opt label=disable）來實現跨平台的行程隔離 2。

另一個極具突破性的架構級安全特性是「計畫模式」（Plan Mode），這項實驗性功能需透過修改 settings.json（設定 experimental.plan 為 true）或 /settings 介面啟用 2。啟動後（透過 /plan、Shift+Tab 輪替或啟動旗標 \--approval-mode=plan），代理將被強制剝奪所有會改變專案狀態的工具存取權，僅保留唯讀分析（如 read\_file、grep\_search、唯讀的 MCP 資源）、使用者詢問（ask\_user）以及在受控臨時目錄（\~/.gemini/tmp/\<project\>/\<session-id\>/plans/）中寫入 Markdown 計畫書的權限 2。

在計畫模式的嚴謹工作流中，代理必須先深入探勘程式碼庫，針對複雜任務（如架構重構）提出至少兩種可行的實作策略，並透過 ask\_user 總結呈報給開發者選擇。待計畫草案撰寫完成後，透過 exit\_plan\_mode 工具提出最終審核，開發者核准（Approve）後方可退出計畫模式，開始實質性的程式碼變更；若不滿意，則選擇迭代（Iterate）要求代理修正計畫 2。此模式徹底根絕了 AI 盲目修改程式碼所引發的災難性後果。若需客製化計畫模式的工具限制，開發者可在 \~/.gemini/policies/ 中建立優先級為 100 的自訂規則 2。

### **容錯與狀態管理：自動檢查點與時光倒流**

軟體開發是一個充滿試錯與迭代的過程，Gemini CLI 為此建構了完美的狀態管理機制。「自動檢查點」（Automatic Checkpointing）功能會在代理每次試圖使用 write\_file 或 replace 等破壞性檔案修改工具，並獲得使用者批准的瞬間，自動在背景觸發 2。

系統會在開發者家目錄下為該專案建立專屬的「影子 Git 儲存庫」（Linux/macOS 預設為 \~/.gemini/history/\<project\_hash\>），並進行一次靜默的 Commit，精確捕捉變更前一刻的所有專案檔案狀態 2。同時，將對話歷史與即將執行的工具呼叫負載序列化儲存為 JSON，存放於專案暫存目錄（如 \~/.gemini/tmp/\<project\_hash\>/checkpoints） 2。這種與專案主版控完全脫鉤的設計，確保了工作區的純淨。若 AI 變更未達預期，開發者只需使用 /restore 指令，系統便會列出包含時間戳記與修改檔案名稱的檢查點清單。選定後，系統便會瞬間將專案檔案、會話上下文與介面狀態原子化地還原至工具執行前的那一秒，並重新給出當初的工具執行提示，賦予開發者無限次安全重試的權利 2。

與之相輔相成的是「時光倒流」（Rewind）功能。透過輸入 /rewind 或連續按下兩次 Esc 鍵，介面將展開一個互動式的歷史時間軸 2。開發者可以使用上下方向鍵預覽歷史中的每一次互動節點與涉及的檔案變更數量。選定節點後，系統提供三個破壞性的復原選項：僅退回對話歷史（保留實體檔案變更，但需手動告知模型檔案已變更）、僅撤銷程式碼變更（保留對話探討過程），或是兩者同時倒轉 2。這賦予了開發者在邏輯岔路口重新引導模型思考方向的強大能力。值得注意的是，倒轉機制具備跨越會話壓縮點（Compression points）重建歷史的深層能力，但其僅能撤銷 AI 工具引發的變更，無法干預開發者使用 Shell 工具（\!）或手動編輯的內容 2。

## **終端機介面與指令參考大全**

Gemini CLI 提供了一套極其豐富的 Slash 命令集（/）與輸入快捷鍵，用於提供對 CLI 介面、會話管理、工作區組態與模型互動的元級別（Meta-level）控制 2。

### **核心 Slash 命令集**

| 指令分類 | 指令與子命令 | 參數與使用說明 | 系統功能解析 |
| :---- | :---- | :---- | :---- |
| **會話管理** | /chat save \<tag\> | 手動儲存當前會話進度。 | 檢查點預設儲存於 \~/.gemini/tmp/\<project\_hash\>/ (Linux/macOS) 或 C:\\Users\\\<User\>\\.gemini\\tmp\\\<project\_hash\>\\ (Windows) 2。 |
|  | /chat resume \<tag\> | 載入指定的會話標籤。 | 恢復專案範圍內的歷史對話上下文 2。 |
|  | /chat list / delete | 無參數 / \<tag\> | 列出或刪除已儲存的會話標籤 2。 |
|  | /chat share \[file\] | 匯出為 Markdown/JSON。 | 將對話日誌匯出供外部審查 2。 |
|  | /chat debug | 無參數 | 將最近一次發送給模型的 API 請求以原始 JSON 負載匯出，極度有助於除錯 2。 |
|  | /resume | 無參數 | 開啟互動式會話瀏覽器，支援按日期或訊息數排序、全文搜尋與過濾自動儲存的會話 2。 |
|  | /compress | 無參數 | 對龐大的當前對話歷史進行語意摘要替換，以節省未來請求的 Token 消耗 2。 |
|  | /clear | 無參數 | 清除終端機畫面與可見的捲動緩衝區（同快捷鍵 Ctrl+L） 2。 |
| **工作區與配置** | /directory (或 /dir) | add \<path\> / show | 管理工作區目錄。支援絕對、相對與家目錄路徑；在嚴格的沙箱設定檔下 add 會被禁用 2。 |
|  | /init | 無參數 | 分析當前目錄結構，自動生成高度客製化的 GEMINI.md 專案上下文檔案 2。 |
|  | /commands reload | 無參數 | 無需重啟 CLI 即可熱重載（Hot-reload）定義於 .toml 檔案中的自訂斜線指令（包含使用者層級、專案層級與擴充套件） 2。 |
|  | /settings | 無參數 | 開啟互動式設定編輯器，提供視覺化的 settings.json 修改介面 2。 |
|  | /permissions trust | \[\<path\>\] | 管理資料夾信任邊界與權限邏輯 2。 |
| **整合與擴充** | /extensions | install, list, update 等 | 管理包含 MCP、主題、提示詞庫、子代理等元件的擴充套件。可從 Git 儲存庫 URL（如 https://github.com/gemini-cli-extensions/...）直接安裝 2。 |
|  | /mcp | list, auth, desc, refresh | 管理 MCP 伺服器狀態，處理 OAuth 流程，檢視工具詳細綱要，或重新查詢伺服器能力 2。 |
|  | /skills | list, enable, disable, link | 即時啟用或阻斷代理技能，支援從本地開發目錄建立符號連結 2。 |
|  | /hooks | enable-all, disable-all | 全域開關生命週期攔截鉤子，另有 list/show 檢視當前掛載狀態 2。 |
|  | /ide | status, install, enable | 管理與 VS Code 等編輯器的通訊伴侶（Companion）擴充套件狀態 2。 |
| **介面與工具** | /theme | 無參數 | 開啟主題選擇對話框。支援內建的 Dracula、Solarized 等，以及定義於 settings.json 中 customThemes 區塊的客製化 CSS 顏色代碼 2。 |
|  | /vim | 無參數 | 啟用 Vim 輸入模式，大幅改變鍵盤導覽邏輯（詳見後述） 2。 |
|  | /copy | 無參數 | 將最後一次的 CLI 輸出複製到系統剪貼簿（自動呼叫 xclip/pbcopy/OSC 52） 2。 |
|  | /tools | desc / nodesc | 列出當前模型可用的所有內建與外部工具，可切換是否顯示詳細綱要描述 2。 |
|  | /shells (或 /bashes) | 無參數 | 切換背景 Shell 檢視畫面，用於管理與監控被代理發送到背景執行的長效處理程序 2。 |

### **高階輸入模式與注入快捷鍵**

除了指令之外，系統提供了專為工程師設計的高效輸入機制。當透過 /vim 啟用 Vim 模式後，終端機輸入框將支援完整的 NORMAL 與 INSERT 模式切換。在 NORMAL 模式下，開發者可以使用傳統的 h, j, k, l 進行游標導覽，利用 w, b, e 進行單字跳躍，或使用 0, $, ^, G, gg 進行行級別跳躍。編輯操作支援 x（刪除字元）、dd（刪除整行）、cw（更改單字），甚至支援加上次數前綴的複合操作（如 3h 或 10G）以及重複上一步指令（.），此偏好會被持久化儲存於設定檔中 2。一般模式下，也支援 Alt+z / Cmd+z（復原）與 Shift+Alt+Z（重做）等標準快捷鍵 2。

為了精確控制上下文注入，系統提供了 @（At 命令）機制。開發者可以在提示詞中輸入 @\<路徑\> 來強制系統遞迴讀取並注入特定檔案或目錄的內容至當前請求中 2。此機制內建了 Git 感知過濾功能，會自動排除 node\_modules 或 .git 等龐大且無關的目錄（支援反斜線跳脫空白字元），且若單獨輸入 @ 則會將其作為普通字元傳遞給模型 2。

### **IDE 整合與原生差異比對**

為了解決純終端機介面在檢視大規模程式碼變更時的局限性，Gemini CLI 提供了革命性的 IDE 整合（IDE Integration），完美支援 Antigravity、Visual Studio Code 及其開源分支（需透過 Open VSX Registry 安裝） 2。

整合的核心價值在於建立雙向的「上下文感知」。一旦透過 /ide enable 啟動，CLI 便能感知編輯器內的活躍狀態，包含游標的精確位置、反白選取的文字區塊（最高支援 16KB 上下文，超載則自動截斷），甚至是近期在工作區內頻繁存取的前 10 個本機檔案 2。這些隱性資料會被無縫注入系統提示詞中，使代理的回答具備驚人的針對性。

更重要的是，當代理提議修改程式碼時，IDE 整合觸發了「原生差異比對」（Native Diffing）機制。變更不會在終端機中以難以閱讀的純文字 Patch 草草帶過，而是直接在編輯器的原生比較檢視器（Diff Viewer）中渲染。開發者可以直接在 GUI 中審閱邏輯、手動微調，最後透過點擊標題列圖示、使用快捷鍵（Cmd+S 或 Ctrl+S），或在 CLI 中回應 yes 來接受變更 2。若使用 Docker 進行開發，CLI 會嘗試透過 host.docker.internal 尋找 IDE 伺服器；若自動偵測失效，開發者亦可透過設定 GEMINI\_CLI\_IDE\_PID 環境變數來手動綁定處理程序 ID 2。這種無縫融合終端機強大自動化指令與 GUI 直覺操作的設計，展現了極致的開發者體驗。

## **結論與未來展望**

綜上所述，Gemini CLI 早已超越了傳統「命令列工具」或「AI 輔助外掛」的狹隘定義，成為一個具備深度環境感知、嚴謹安全規範與高度自動化潛能的架構級開發平台。透過 GEMINI.md 構建的階層式憲規矩陣，確保了代理行為的領域專業性與企業合規性；代理技能（Agent Skills）的漸進式揭露架構，在極致節省運算資源的同時，實現了複雜知識與標準作業程序的模組化封裝。而模型上下文協議（MCP）與生命週期鉤子（Hooks）機制的引入，更徹底打破了系統的封閉性，讓代理具備了讀寫外部微服務世界與受控攔截防禦的強大能力。

結合其獨創的實驗性計畫模式、基於影子 Git 儲存庫的自動檢查點無痛容錯機制、以及驅動自我修復閉環的子代理與 Shell 穿透技術，Gemini CLI 正在實質性地重塑軟體工程的工作流典範。開發者的角色正以前所未有的速度，從「逐行撰寫與除錯程式碼的勞動者」，昇華為「配置參數、定義邊界與審核邏輯架構的系統指揮官」。這份深度架構解析不僅是一份技術操作手冊，更是企業架構師與個人開發者在迎接自律型 AI 輔助開發時代的一份戰略部署藍圖。透過深諳並善用上述底層機制與安全策略的每個細節，使用者將能在確保絕對專案安全與高度流程可控的前提下，全面釋放生成式人工智慧在軟體生命週期中的終極生產力。

#### **引用的著作**

1. Gemini CLI documentation, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/](https://geminicli.com/docs/)
2. CLI commands | Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/reference/commands/](https://geminicli.com/docs/reference/commands/)
3. Gemini CLI configuration, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/reference/configuration/](https://geminicli.com/docs/reference/configuration/)
4. Provide context with GEMINI.md files - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/gemini-md/](https://geminicli.com/docs/cli/gemini-md/)
5. Manage context and memory - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/tutorials/memory-management/](https://geminicli.com/docs/cli/tutorials/memory-management/)
6. MCP servers with the Gemini CLI | Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/tools/mcp-server/](https://geminicli.com/docs/tools/mcp-server/)
7. Gemini CLI settings (`/settings` command), 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/settings/](https://geminicli.com/docs/cli/settings/)
8. Agent Skills - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/skills/](https://geminicli.com/docs/cli/skills/)
9. Creating Agent Skills - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/creating-skills/](https://geminicli.com/docs/cli/creating-skills/)
10. Activate skill tool (`activate_skill`) - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/tools/activate-skill/](https://geminicli.com/docs/tools/activate-skill/)
11. Browse Extensions - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/extensions/](https://geminicli.com/extensions/)
12. Build Gemini CLI extensions, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/extensions/writing-extensions/](https://geminicli.com/docs/extensions/writing-extensions/)
13. Execute shell commands - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/tutorials/shell-commands/](https://geminicli.com/docs/cli/tutorials/shell-commands/)
14. Automate tasks with headless mode - Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/cli/tutorials/automation/](https://geminicli.com/docs/cli/tutorials/automation/)
15. Automation and triage processes | Gemini CLI, 檢索日期：2月 25, 2026， [https://geminicli.com/docs/issue-and-pr-automation/](https://geminicli.com/docs/issue-and-pr-automation/)

---

## 附錄：Gemini CLI Hooks 完整 JSON Schema 參考

> 以下內容整合自 Gemini CLI Hooks JSON Schema 技術文件，提供完整的 Hook 事件類型、JSON Schema 定義與實際範例。

---

# Gemini CLI Hooks 完整技術文件

> **版本**：v0.26.0+ 已預設啟用（最新穩定版 v0.29.5，2026/02/19）
> **來源**：[geminicli.com/docs/hooks/reference](https://geminicli.com/docs/hooks/reference/)

---

## 一、核心通訊機制（Golden Rule）

Hooks 透過標準 I/O 與 CLI 溝通：

| 管道 | 用途 |
|------|------|
| **stdin** | CLI → Hook，傳入 JSON 輸入 |
| **stdout** | Hook → CLI，必須只輸出最終 JSON，禁止任何純文字 |
| **stderr** | 僅供 Debug / Log，CLI 不解析 |

**Exit Codes：**
- `0` → 成功，解析 stdout JSON
- `2` → 系統封鎖，以 stderr 作為拒絕原因
- `其他` → 警告，CLI 繼續執行但顯示警告

---

## 二、支援的 Hook 類型（完整列表）

### 🔧 Tool Hooks（工具攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeTool` | 工具執行前 | ✅ 可 deny/block |
| `AfterTool` | 工具執行後 | ✅ 可隱藏結果 |

### 🤖 Agent Hooks（代理攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeAgent` | 使用者送出 prompt 後、代理規劃前 | ✅ 可 deny 整個 turn |
| `AfterAgent` | 代理產生最終回應後 | ✅ 可拒絕並強制重試 |

### 🧠 Model Hooks（LLM 層攔截）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `BeforeModel` | 送出 LLM 請求前 | ✅ 可修改 model/temperature，或注入合成回應 |
| `BeforeToolSelection` | LLM 決定呼叫哪些工具前 | ⚠️ 只能篩選工具，不支援 deny/continue |
| `AfterModel` | 收到 LLM 每個 chunk 後 | ✅ 可即時修改/過濾 PII |

### 🔄 Lifecycle & System Hooks（生命週期）

| 事件 | 觸發時機 | 能否封鎖 |
|------|----------|----------|
| `SessionStart` | 啟動、resume、/clear | ❌ 僅 Advisory |
| `SessionEnd` | 退出或清除 session | ❌ CLI 不等待 |
| `Notification` | 系統警示（如工具權限請求） | ❌ 僅觀察用 |
| `PreCompress` | 壓縮 token 歷史前 | ❌ 非同步，無法封鎖 |

---

## 三、JSON Schema

### 設定檔結構（`settings.json`）

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": "run_shell_command",
        "sequential": true,
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/security-check.js",
            "name": "SecurityCheck",
            "timeout": 5000,
            "description": "防止執行危險指令"
          }
        ]
      }
    ]
  }
}
```

### Hook Definition Schema

```json
{
  "matcher":    "string（regex 或完整名稱）",
  "sequential": "boolean（true=順序執行, false=平行執行）",
  "hooks":      "array（Hook Config 陣列）"
}
```

### Hook Configuration Schema

```json
{
  "type":        "command（目前唯一支援）",
  "command":     "string（shell 指令）",
  "name":        "string（可選，友好名稱）",
  "timeout":     "number（ms，預設 60000）",
  "description": "string（可選，說明）"
}
```

### Base Input Schema（所有 hooks 共用）

```json
{
  "session_id":       "string",
  "transcript_path":  "string",
  "cwd":              "string",
  "hook_event_name":  "string（例如 BeforeTool）",
  "timestamp":        "string（ISO 8601）"
}
```

### Common Output Fields（通用輸出欄位）

```json
{
  "systemMessage":  "string（顯示給使用者）",
  "suppressOutput": "boolean（隱藏 log/telemetry）",
  "continue":       "boolean（false = 立即停止整個代理迴圈）",
  "stopReason":     "string（continue=false 時的訊息）",
  "decision":       "allow | deny | block",
  "reason":         "string（deny 時的說明）"
}
```

---

## 四、各事件的 hookSpecificOutput

| 事件 | hookSpecificOutput 欄位 | 說明 |
|------|------------------------|------|
| `BeforeTool` | `tool_input` | 覆寫模型產生的工具參數 |
| `AfterTool` | `additionalContext` | 附加文字給代理<br>`tailToolCallRequest: {name, args}` → 串接另一工具 |
| `BeforeAgent` | `additionalContext` | 附加文字到此 turn 的 prompt |
| `AfterAgent` | `clearContext` (boolean) | 清除 LLM 記憶但保留 UI |
| `BeforeModel` | `llm_request` → 覆寫請求<br>`llm_response` → 合成回應（跳過 LLM） | 可完全攔截 LLM 呼叫 |
| `BeforeToolSelection` | `toolConfig.mode` (AUTO/ANY/NONE)<br>`toolConfig.allowedFunctionNames` | 白名單合集策略 |
| `AfterModel` | `llm_response` | 替換當前 chunk |
| `SessionStart` | `additionalContext` | 互動模式注入歷史；非互動則前置到 prompt |

---

## 五、Stable Model API（LLM 層 Schema）

```json
// LLMRequest
{
  "model": "string",
  "messages": [
    { "role": "user | model | system", "content": "string" }
  ],
  "config": { "temperature": 0.7 },
  "toolConfig": { "mode": "AUTO", "allowedFunctionNames": [] }
}

// LLMResponse
{
  "candidates": [
    {
      "content": { "role": "model", "parts": ["string"] },
      "finishReason": "string"
    }
  ],
  "usageMetadata": { "totalTokenCount": 1234 }
}
```

---

## 六、實際範例

### 範例 1：BeforeTool — 防止 API Key 寫入程式碼（Bash）

```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')

if echo "$CONTENT" | grep -qE "(sk-|AIza|AKIA)[A-Za-z0-9]{20,}"; then
  echo '{"decision":"deny","reason":"偵測到 API Key，拒絕寫入！"}'
else
  echo '{"decision":"allow"}'
fi
```

### 範例 2：BeforeToolSelection — 動態篩選可用工具（Node.js）

```javascript
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const prompt = input.llm_request.messages.at(-1)?.content || '';

let allowed;
if (prompt.includes('file') || prompt.includes('檔案')) {
  allowed = ['read_file', 'write_file', 'list_directory'];
} else {
  allowed = ['run_shell_command', 'web_fetch'];
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    toolConfig: {
      mode: 'ANY',
      allowedFunctionNames: allowed
    }
  }
}));
```

### 範例 3：AfterAgent — 驗證回應品質並強制重試

```javascript
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const response = input.prompt_response || '';

if (response.length < 50 || response.includes('我不確定')) {
  console.log(JSON.stringify({
    decision: 'deny',
    reason: '回應品質不符，請提供更詳細的說明並確認資訊正確性。'
  }));
} else {
  console.log(JSON.stringify({ decision: 'allow' }));
}
```

### 範例 4：SessionStart — 載入專案 Memory

```javascript
const fs = require('fs');
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));

let context = '';
try {
  context = fs.readFileSync(`${process.env.GEMINI_PROJECT_DIR}/.gemini/memory.md`, 'utf8');
} catch (e) {
  process.stderr.write('No memory file found\n');
}

console.log(JSON.stringify({
  hookSpecificOutput: { additionalContext: context },
  systemMessage: '✅ 專案 Memory 已載入'
}));
```

---

## 七、環境變數（Hooks 執行時可用）

| 變數 | 說明 |
|------|------|
| `GEMINI_PROJECT_DIR` | 專案根目錄絕對路徑 |
| `GEMINI_SESSION_ID` | 當前 session 唯一 ID |
| `GEMINI_CWD` | 當前工作目錄 |
| `CLAUDE_PROJECT_DIR` | 相容別名（同 GEMINI_PROJECT_DIR） |

---

## 八、Matcher 規則（工具匹配）

| 模式 | 範例 | 說明 |
|------|------|------|
| 精確匹配 | `run_shell_command` | 只匹配此工具 |
| Regex | `read_.*` | 匹配所有讀取工具 |
| MCP 工具 | `mcp__github__list_prs` | MCP server 命名格式 |
| 全部 | `.*` 或 `*` | 匹配所有工具 |

---

## 九、安全注意事項

⚠️ **Hooks 以當前使用者權限執行任意程式碼。**

- 專案層級 hooks（`.gemini/settings.json`）風險最高，開啟不信任專案時特別警慎
- CLI 會對專案 hooks 建立指紋，若 `name` 或 `command` 變更（例如 git pull 後），視為新的未信任 hook，執行前會警告
- 預設 timeout：60 秒；建議快速 hooks 設更短的 timeout（如 5000ms）
- 絕對不要在 stdout 混入非 JSON 輸出
