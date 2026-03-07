# **Google Antigravity 架構解析與高階實踐：代理式開發平台精簡重點使用手冊**

## **平台演進與核心哲學：從輔助編碼到代理優先**

軟體工程領域正經歷一場深遠的範式轉移。傳統的整合開發環境（IDE）長期以來將開發者定位為程式碼的唯一產出者，其內建的人工智慧工具大多僅限於提供靜態的語法分析與行級自動補全。然而，Google Antigravity 的問世標誌著「代理優先（Agent-First）」時代的正式到來。Antigravity 並非僅僅是一個附加了聊天介面的文字編輯器，而是一個徹底重構的次世代代理式開發平台 1。在這種全新架構下，系統預設人工智慧不再是被動的輔助工具，而是具備自主規劃、執行、驗證與迭代能力的獨立行動者（Autonomous Actor）；開發者的角色也隨之從單純的「程式碼撰寫者」躍升為「系統架構師」與「代理管理者」，負責編排與指揮多個非同步運作的數位勞動力 2。

Antigravity 平台的核心架構旨在消除開發過程中的認知切換成本。該平台跨越 macOS、Windows 與特定 Linux 發行版，並透過多視窗（Multi-window）介面無縫整合了三大核心表面，為代理提供了一個全方位的操作環境 4。

首先，是具備人工智慧輔助的傳統「編輯器（Editor）」表面。該表面保留了開發者熟悉的全功能 IDE 體驗，包含了智慧自動補全（Tab completions）、依賴項匯入建議，以及支援自然語言內聯指令（Inline commands）的互動模式，讓開發者在需要手動微調程式碼時，依然能維持極高的生產力 4。

其次，是專為編排與監控代理而設計的「代理管理員（Agent Manager）」視窗。這是 Antigravity 實現代理優先體驗的任務控制中心（Mission Control）。在此介面中，開發者可以指派多個非同步的本機代理在不同的工作區內平行運作，執行諸如重現錯誤、生成測試案例或實作背景修復等耗時任務，而無需同步等待 4。

最後，是革命性的「瀏覽器（Browser）」表面。Antigravity 內建的瀏覽器代理能夠自主致動（Actuate）網頁介面，執行諸如儀表板資料讀取、原始碼管理（SCM）操作或端到端的使用者介面測試 5。透過這三大表面的深度協同，代理能夠獨立完成過去需要人類在多個工具間反覆切換才能完成的複雜任務，例如編寫新功能的 UI 程式碼、在終端機啟動本機伺服器，並直接透過瀏覽器驗證該元件是否按預期運作 4。

## **信任基礎與驗證機制：工件（Artifacts）的運用**

將關鍵開發任務委派給自主代理，首要面臨的挑戰便是「信任」。傳統的代理系統通常只會輸出一長串難以閱讀的原始工具呼叫日誌（Raw tool calls），這使得開發者在驗證邏輯時感到極度疲憊 4。Antigravity 透過引入「工件（Artifacts）」機制徹底解決了這個可解釋性問題 5。

在 Antigravity 的定義中，工件是代理在執行任務過程中，為了推進工作或向人類報告成果而生成的有形、結構化交付物 5。代理透過生成工件來向使用者證明其理解當前任務，並且正在嚴謹地驗證其工作成果 8。這種機制將審查層級從底層的日誌抽離，提升到了任務導向的高階視角。

下表詳細列出了 Antigravity 代理在運作過程中所生成的核心工件類型及其在驗證流程中的作用：

| 工件類型 (Artifact Type) | 生成時機與核心機制 | 驗證價值與開發者互動方式 |
| :---- | :---- | :---- |
| **任務清單 (Task Lists)** | 在代理進入規劃模式並開始編寫程式碼之前生成。代理會預先將複雜任務拆解為結構化的執行步驟。 | 允許開發者在代理動手前審查其邏輯路徑，確保大方向無誤。 |
| **實作計畫 (Implementation Plan)** | 在架構設計階段生成。詳細記錄代理打算如何在現有程式碼庫中修改或新增架構以達成目標。 | 提供系統級的視角，防止代理做出破壞現有解耦邏輯的架構更動。 |
| **演練指南 (Walkthrough)** | 在任務實作完成後生成。包含所有變更的簡明總結以及如何測試這些變更的具體指引。 | 作為最終的交付報告，開發者可直接透過閱讀指南了解模組變更的全貌。 |
| **程式碼差異 (Code Diffs)** | 伴隨每次程式碼修改即時生成。展示修改前後的行級對比。 | 提供最細粒度的技術審查。開發者若對變更不滿意，可隨時在聊天介面中選擇「撤銷至此步驟 (Undo changes up to this point)」。 |
| **螢幕截圖與錄影 (Screenshots & Recordings)** | 由瀏覽器代理在執行 UI 測試前後擷取。記錄網頁介面的視覺狀態或驗證流程的動態畫面。 | 實現視覺化驗證。開發者可直接在截圖上留下類似文件註解的回饋（例如「將藍色主題改為橘色」），代理會在不中斷流程的情況下動態整合此回饋。 |

上述工件機制資料來源：4。

透過這些工件，開發者得以在宏觀與微觀層面上隨時監控代理的行為。若開發者在審查工件時發現任何偏差，可以直接在工件上留下回饋意見，代理會無縫地將這些意見納入其執行流中並進行修正，從而建立起人機協作間的堅實信任 4。

## **智慧引擎矩陣與推論特性：多模型支援與深度思考**

作為一個開放且具備高度適應性的平台，Antigravity 並未將開發者鎖定在單一的人工智慧模型生態系中。相反地，它提供了一個靈活的模型選擇矩陣（Model Optionality），允許開發者根據任務的複雜度、運算成本以及特定語言的表現，動態切換底層的推論引擎 4。

### **支援的模型生態系與變體**

目前，Antigravity 平台預設整合了 Google 自身的尖端模型，並全面支援 Anthropic 的 Claude 系列與 OpenAI 的 GPT-OSS 系統 4。這種多模型架構確保了企業能夠利用不同模型在特定領域的專長。

根據社群與平台的實務測試資料，不同的模型在架構與表現上各有千秋。在 Google 的生態系中，平台提供了 antigravity-gemini-3-pro（具備 low 與 high 兩種變體）以及 antigravity-gemini-3-flash（具備 minimal、low、medium、high 四種變體），以涵蓋從輕量級快速回應到高強度推理的各種需求 9。在第三方模型方面，平台支援了 antigravity-claude-sonnet-4-6（及其 thinking 變體）以及 antigravity-claude-opus-4-5-thinking 9。

實務應用上的反饋顯示，Claude Sonnet 4.5 在純粹的程式碼生成、重構與遵循嚴格指令方面表現出極高的精準度與穩定性，特別適合用於日常的大規模程式碼撰寫 10。相對而言，Gemini 3 Pro 在戰略性互動、多步驟規劃，以及作為除錯器（Debugger）排查隱蔽系統錯誤時，展現出更優越的整體大局觀 10。然而，也有部分開發者指出，Gemini 模型在推理第一原理問題時表現優異，但在處理網路上缺乏常見範例的冷門技術堆疊時，其指令遵循能力偶爾會顯得過於主動而偏離預期 12。

### **推論模式：規劃、快速與深度思考**

為了最佳化資源配置與回應延遲，Antigravity 內建了多種運作模式。對於簡單、局部性的任務（例如重新命名變數或執行基礎 Bash 指令），代理會採用「快速模式（Fast Mode）」，直接生成並執行任務，大幅縮短等待時間 6。當面臨需要深入研究或協作開發的複雜專案時，代理會自動切換至「規劃模式（Planning Mode）」。在規劃模式下，代理會先停下來思考，將工作組織成任務群組，並產出詳盡的實作計畫工件，確保後續執行的架構合理性 6。

此外，針對極度複雜的邏輯難題與科學運算，Gemini 3 Pro 模型特別引入了「深度思考（Deep Think）」切換開關 14。當啟動此模式時，模型會被指示分配大量的額外運算資源，透過平行的假設探索（Parallel hypothesis exploration）與迭代反思來解決問題 14。這種機制類似於進行隨機抽樣後從多個節點進行梯度下降，使得模型能夠在複雜的架構審查中意外觸發「頓悟（A-ha moment）」，進而找出正確的路徑 13。

據效能評估資料顯示，深度思考模式在 Humanity's Last Exam 基準測試中（無工具輔助）達到了 41% 的驚人成績，並在 ARC-AGI-2 測試中（包含程式碼執行）達到了史無前例的 45.1% 15。儘管在深度思考模式下，模型可能需要耗費數分鐘才能給出最終回應，但對於排查底層記憶體錯誤、進行全域安全性審計或一站式審查大型 Rust 程式碼庫等高價值任務而言，這種延遲是完全值得的 15。

## **系統指令與行為邊界：憲規 (Constitution) 與規則 (Rules)**

在代理優先的開發環境中，開發者最常遭遇的痛點是「提示詞疲勞」。在傳統的大型語言模型聊天介面中，開發者必須反覆申明基礎的上下文條件，例如「我使用的是 Python 3.9」、「請使用 snake\_case 命名法」或「絕對不要使用 jQuery」 2。為了讓工具變得真正高效，Antigravity 導入了強大的「規則（Rules）」系統，實質上為代理建立了一部不可違背的「憲規（Constitution）」 2。

### **規則的哲學與氛圍工程 (Vibe Engineering)**

規則本質上是代理的「系統指令」，也是其「始終開啟的人格特質（Always-on personality traits）」 2。與需要手動觸發的提示詞不同，規則是被動且持續存在的指導方針；代理在生成任何程式碼、規劃任何步驟或執行任何測試之前，都必須強制讀取並將這些規則納入考量 2。

這種機制的引入促成了所謂的「氛圍工程（Vibe Engineering）」。開發者只需在對話中提供自然語言的意圖（Vibe），而 Antigravity 代理則負責處理結構化的工程嚴謹性 3。因為有著底層規則的約束，代理不會再像吃角子老虎機一樣給出隨機、風格迥異的程式碼，而是會產出完全對齊開發者意圖與團隊規範的專業架構 2。

### **規則的雙層作用域與結構化組織**

為了適應不同層級的治理需求，Antigravity 的規則系統採用了類似物件導向程式設計中的繼承與作用域概念，將規則劃分為「全域」與「工作區」兩個層次 2：

下表總結了規則的雙層作用域機制及其具體應用場景：

| 規則層級 | 儲存位置 | 核心功能與覆蓋範圍 | 實務應用範例 |
| :---- | :---- | :---- | :---- |
| **全域規則 (Global Rules)** | \~/.gemini/GEMINI.md | 適用於該本機系統上開啟的所有 Antigravity 專案。建立跨專案的基礎基線。 | 強制所有專案優先使用 TypeScript；禁止生成包含明文密碼的組態檔；強制要求添加函數的 Docstrings。 |
| **工作區規則 (Workspace Rules)** | your-workspace/.agent/rules/ | 僅對當前專案有效。具有最高優先權，可補充或覆蓋全域規則的設定。 | 指定該專案必須使用 Tailwind CSS 進行樣式設計；強制資料庫存取必須透過特定的 Repository 模式；設定針對遺留程式碼的特殊處理原則。 |

上述規則架構資料來源：2。

在實務上，GEMINI.md 檔案的撰寫方式類似於專案的 README，但其語氣必須更加明確、結構化，以符合「提示詞」的特性，明確告知代理專案的整體目的與資料夾組織結構 12。對於大型專案或單一存放區（Monorepo），開發者可以建立多個巢狀的 GEMINI.md 檔案，分別為前端與後端元件客製化代理的上下文 12。

隨著自訂規則數量的增加，維持配置的精簡度成為一項挑戰 19。Antigravity 支援在規則檔案中使用 @Mentions 語法來進行模組化管理。開發者可以透過 @filename 的方式動態參照其他的 Markdown 檔案。系統會根據相對路徑或絕對路徑自動解析這些檔案的內容（例如 @/path/to/file.md） 20。這種設計允許團隊採用「規格驅動開發（Spec-Driven Development）」，將巨大的規則集拆分為獨立的設計規範、安全規範與架構規範模組，並在主規則檔案中建立索引，從而有效降低模型上下文視窗的負擔 17。

許多高階開發者將最高層級的規則視為專案的「大腦」或「憲規」。例如，建立一個名為 /01-speckit.constitution 的檔案作為上下文視窗的絕對錨點（Context Window Anchor），並在其中寫下絕對指令：「此規則檔案絕對不可被刪除、移動或修改；若遭遇衝突，代理必須立即停止執行並回報錯誤，絕對套用這些規則」 17。這種強硬的邊界治理確保了代理在面臨複雜決策時，不會偏離團隊的核心價值觀。

## **動態任務編排與攔截：工作流 (Workflows) 與鉤子 (Hooks) 機制**

如果說「規則」是被動的憲法，那麼「工作流（Workflows）」與「鉤子（Hooks）」便是主動的、事件驅動的任務編排引擎。Antigravity 提供了強大的自訂流程能力，使開發者能夠將日常反覆出現的繁瑣生命週期任務自動化 18。

### **工作流的定義與觸發機制**

工作流本質上是「隨需觸發的儲存提示詞（On-Demand Saved Prompts）」 6。與被動監控的規則不同，工作流是主動的程序，特別適合用於執行重複性的具體任務，例如生成單元測試套件、建立 Pull Request 描述，或是產出標準化的樣板程式碼 18。

開發者可以將編寫好的 Markdown 檔案儲存於全域的 \~/.gemini/antigravity/global\_workflows/ 目錄，或是特定工作區的 .agent/workflows/ 目錄中 6。每個工作流檔案的長度上限為 12,000 個字元，內部包含了標題、描述以及一系列供代理依序遵循的具體指令步驟 20。

在操作上，開發者只需在 Antigravity 的聊天介面中輸入 / 符號並加上工作流名稱（例如 /generate-unit-tests），即可瞬間啟動該程序 2。一旦被觸發，代理便會依序處理工作流中定義的每個步驟，執行操作或生成指定的回應 20。

### **工作流的組合性與進階指令矩陣**

工作流機制最具突破性的特點在於其「可組合性（Composability）」。一個工作流內部可以包含呼叫其他工作流的指令。例如，開發者可以在 /workflow-1 的步驟中寫入「呼叫 /workflow-2」與「呼叫 /workflow-3」 20。這種設計使得開發者能夠像撰寫模組化函式一樣，建構出極度複雜且層次分明的自動化生命週期任務 20。

在專業的敏捷開發團隊中，高階架構師經常建立一整套工作流指令矩陣，將其作為聊天介面中的 Slash 指令來觸發複雜的代理序列 24。實務上的經典案例包括：

* /onboard：指示代理遞迴掃描整個儲存庫結構，建立本機依賴項索引，並確保當前狀態符合 GEMINI.md 的全域標準 24。  
* /refactor：要求代理執行全面的架構審計，揪出違反 SOLID 或 DRY 原則的程式碼，並產出模組化的實作計畫以重組解耦邏輯 24。  
* /test：自動化端到端測試，指示代理生成全面的測試套件，在沙盒終端機中執行它們，並針對任何偵測到的失敗啟動自我修復循環 24。  
* /ui-check：派遣瀏覽器子代理，自動驗證應用程式在各種斷點（Breakpoints）下的 UX 完整性，並擷取狀態工件（錄影與截圖）供視覺驗證 24。

### **模擬鉤子 (Hooks) 的事件攔截**

在現代軟體工程中，鉤子（Hooks）被廣泛用於在特定生命週期事件（如提交程式碼或修改結構描述）發生前後攔截並執行邏輯。雖然 Antigravity 在架構上並未提供傳統意義的靜態事件鉤子 API，但平台極具彈性的設計允許開發者透過巧妙結合工作流與規則，實現強大的「類鉤子（Hook-like）」行為 22。

實現這種事件攔截的策略分為兩種途徑： 其一，透過工作流定義生命週期任務。開發者可以在自訂的工作流程序中寫明前提條件，引導代理完成特定任務序列，例如「在每次重構完成後，強制執行測試套件」或「在更新資料庫 Schema 後，自動生成對應的文件」 22。 其二，透過 .agent/rules/ 設定行為約束。開發者可以編寫一條強制規則，規定「每當代理修改了特定目錄下的檔案時，必須立刻觸發特定的驗證檢查」 22。這種基於規則的隱式攔截，賦予了平台極高的自動化彈性，確保開發者無需手動介入，代理便能自動補全關聯性的驗證與維護任務。

## **語義觸發的擴充框架：技能 (Skills) 系統深度解析**

為了解決傳統系統提示詞在處理複雜外部操作與本機指令時的侷限性，Antigravity 引入了「技能（Skills）」系統。技能是一種輕量級、開放格式的擴充框架，賦予人工智慧代理與本機檔案系統、終端機環境以及外部 API 進行深度且精準互動的能力 1。

### **技能的解剖學與目錄結構**

與單純的提示詞不同，一個標準的 Antigravity 技能是一個由多個檔案組成的微型軟體模組。技能被放置於 .agent/skills/\<skill-name\>/ 目錄下（工作區範圍）或全域目錄中，其核心架構包含三個主要元件 2：

1. **SKILL.md（大腦與核心）：** 這是技能的必要檔案。它包含了決定技能何時被啟動的 YAML 詮釋資料（Metadata），以及指導代理如何執行該任務的 Markdown 邏輯指令 1。  
2. **scripts/ 目錄（動態執行能力）：** 這是一個選用的強大資料夾，用於存放 Python、Bash 或 Node.js 腳本。這使得技能的邊界超越了純文字生成，代理可以透過執行這些腳本來查詢本機資料庫、解析輸出日誌，甚至進行系統整合 6。  
3. **resources/ 與 assets/ 目錄（靜態資源）：** 用於存放技能在執行期間可能需要參考的範本、文件片段或設定檔 6。例如，一個名為 license-header-adder 的技能可以讀取 resources/HEADER.txt，並指示代理在建立新檔案時自動加上標準的企業授權宣告 2。

### **嚴格的 YAML 標頭與語義觸發機制**

技能系統之所以有別於傳統的系統指令，關鍵在於其獨特的「語義觸發（Semantic Triggering）」與「按需載入（On-Demand）」機制 25。如果將所有操作邏輯都塞入全域規則中，會導致模型上下文視窗極度臃腫，進而引發「認知飽和」與人工智慧幻覺 25。技能系統透過在 SKILL.md 頂部定義嚴格的 YAML 標頭來精準控制載入時機 1。

該 YAML 標頭受到嚴格的格式規範約束：

* **name 欄位：** 長度限制為 64 個字元，僅允許使用小寫字母、數字與連字號，並且必須採用動名詞形式（Gerund form），例如 testing-code 或 managing-databases。名稱中嚴禁出現特定競爭模型的名稱（例如禁止包含 "claude" 或 "anthropic"） 28。  
* **description 欄位：** 這是觸發技能的靈魂所在。長度限制為 1024 個字元，必須以第三人稱撰寫，且必須精準包含觸發該技能的語義關鍵字 25。例如：「提取 PDF 文字。當使用者提及文件處理或 PDF 檔案時觸發此技能」 28。

當使用者在聊天介面輸入自然語言要求時，Antigravity 會即時分析語意。只有當使用者的意圖與某個技能的 YAML description 高度吻合時，系統才會動態將該技能的 Markdown 主體指令注入代理的上下文視窗中 25。這種架構顯著提高了任務的可靠性，減少了無關資訊的干擾，並使開發者能夠將深奧的「部落知識（Tribal Knowledge）」直接自動化編碼到儲存庫中 25。

### **技能主體撰寫與企業級認知模式**

在 SKILL.md 的 Markdown 主體中，開發者必須提供明確的目標（Goal）、步驟指令（Instructions）、約束條件（Constraints）以及用於指導模型效能的少樣本提示範例（Examples） 2。約束條件特別重要，例如在開發「資料庫檢查員」技能時，可以明確宣告「嚴重警告：僅允許執行 SELECT 語句，絕對不允許執行 DELETE 查詢」，從而為代理的操作劃定安全紅線 2。

在企業應用層面，高階架構師經常將多個技能組合成複雜的「認知模式（Cognitive Patterns）」。例如，建構一個包含「偵察兵（The Scout）」、「評論家（The Critic）」與「圖書管理員（The Librarian）」技能的矩陣，讓代理不僅能編寫程式碼，還能主動審計漏洞並歸檔文件 29。此外，社群中甚至出現了如「58 技能聚合包（58-Skill Antigravity Aggregator）」這類開源專案，將零散的技能集中為單一函式庫，賦予代理從安全審計、自動模式（Loki Mode）、高階工程重構到產品增長分析（如 RICE 優先順序框架）的全端虛擬團隊能力 30。

## **突破上下文飽和限制：模型上下文協定 (MCP) 整合實務**

儘管 Antigravity 的本機代理在檔案系統的感知與程式碼生成上表現卓越，但其效能始終受限於它所能「看到」的資訊邊界。在過去的 AI 程式設計助手世代，開發者經常面臨所謂的「認知飽和（Context Saturation）」瓶頸 1。雖然尖端模型如 Gemini 3.1 Pro 擁有極大的上下文視窗，但若開發者盲目地將整個企業程式碼庫、龐大的資料庫結構描述、陳舊的文件與無關的 API 回應日誌全部貼入提示詞中，不僅會嚴重拖垮推理速度、增加算力成本，更會導致模型產生幻覺，降低輸出品管 31。

為了解決本機代理缺乏對外部集中式企業系統感知能力的問題，Antigravity 在其框架中深度整合了「模型上下文協定（Model Context Protocol, MCP）」 1。

### **MCP 的核心機制與價值**

MCP 被業界普遍譽為「人工智慧的 USB-C 介面」 33。它是一個標準化的開源通訊協定，扮演著 Antigravity IDE 與開發者廣泛的外部工具鏈之間的通用翻譯器與安全橋樑 32。透過 MCP，開發者不再需要手動複製貼上日誌或結構描述；相反，代理能夠動態地、自主地在執行邏輯確實需要時，直接從遠端伺服器精準提取細微的上下文資訊 31。

MCP 在 Antigravity 中為代理解鎖了兩大維度的能力：

1. **上下文資源擷取 (Context Resources)：** 代理能夠即時讀取外部資料以完善其建議。例如，當開發者要求編寫一段複雜的 SQL 查詢時，代理會自動透過 MCP 探查連線的 PostgreSQL (AlloyDB) 或 Supabase 資料庫，即時獲取正確的資料表與欄位名稱 32。在除錯時，代理亦能直接拉取來自 Netlify 或 Heroku 的最新建置日誌進行分析 32。  
2. **自訂工具執行 (Custom Tools)：** MCP 允許代理安全地執行由連接伺服器定義的特定操作。例如，代理可以在發現程式碼中的 TODO 標籤後，自主觸發「在 Linear 系統中建立對應的 Issue」，或是搜尋 Notion 內部文件以獲取認證模式的最佳實踐 32。

### **商店整合與企業級自訂配置**

為了降低使用門檻，Antigravity 提供了一個完全 UI 驅動的內建「MCP 商店（MCP Store）」 32。開發者只需點擊編輯器側邊欄代理面板頂部的 ... 下拉選單，進入 MCP 商店，即可瀏覽並一鍵安裝各種預先建置的伺服器 32。商店內包含了 Google Data Cloud 服務（如 AlloyDB、BigQuery、Spanner、Cloud SQL 與 Looker），以及廣受歡迎的第三方開發工具如 Postman、Linear 與 Snyk Studio 33。在設定連線時，平台展現了極高的企業安全標準，支援使用身分識別與存取權管理（IAM）憑證進行驗證，確保機密資訊被安全儲存，不會暴露在原始的聊天視窗中 33。

對於需要連接內部專有系統或進行高階「氛圍編碼（Vibe Coding）」的專家使用者，Antigravity 亦支援無縫整合自訂的 MCP 伺服器 32。開發者只需在 MCP 商店中點擊「管理 MCP 伺服器（Manage MCP Servers）」並選擇「檢視原始配置（View raw config）」，即可直接修改 mcp\_config.json 檔案 32。高階實踐中，開發者常配置的自訂伺服器包括：「Context-7」用於即時同步技術堆疊的最新官方文件；「Sequential Thinking」用於賦予代理動態的結構化問題解決框架；以及基於 Qdrant 的檢索伺服器，用於儲存並調用歷史專案中驗證過的高品質程式碼片段 37。此外，甚至有測試自動化工具（如 TestSprite）提供 MCP 伺服器，讓代理能從程式碼生成一路全自動執行到端到端測試驗證 39。

## **自適應演化與工程複利：永久記憶與知識庫 (Knowledge Items)**

在代理深度參與日常開發後，確保代理在跨專案、跨會話之間維持一致的開發風格與架構決策變得至關重要。傳統的「規則」與「技能」檔案雖然強制性強，但屬於靜態配置，需要手動維護，難以隨著開發者編碼習慣的自然演變而自動進化 40。為此，Antigravity 引入了被稱為「知識庫（Knowledge Base）」或「永久記憶（Permanent Memory）」的自適應系統 40。

### **知識項目的生成與作用機制**

「知識項目（Knowledge Item）」是 Antigravity 永久記憶系統的核心儲存單位。它是一組針對特定主題的關聯資訊集合，內部包含了精確描述該主題的標題與摘要，以及一系列提供深度背景資訊的工件 41。這些工件可能包含自動生成的模組文件、成功的程式碼範例，或是對開發者歷史指令的持久化記憶 41。

這套系統的運作方式完全潛伏於背景之中。當開發者與代理進行對話、組織檔案架構、或反覆使用特定的 API 命名模式時，Antigravity 會自動分析這些互動脈絡，提取出重要的洞察與模式，並利用這些資訊動態建立全新的知識項目或更新現有項目 40。換言之，知識系統並不是在被動地模仿開發者，而是在主動地分析、組織並系統化開發者的獨特風格，將其轉化為可重複使用的智能儲備 42。

在後續的任何開發會話中，所有知識項目的摘要都會隨時向代理開放 41。一旦代理的語義引擎識別出某個歷史知識項目與當前的任務高度相關，它便會自動主動「研究」該知識項目內儲存的工件，並將最適用的架構設計、測試解析模式與風格偏好無縫應用於當前的回應中 41。開發者可以隨時在 Agent Manager 的「知識視圖（Knowledge View）」中檢視與管理這些自動生成的項目 41。

### **永久記憶的複利效應與限制**

知識項目相對於傳統靜態範本的巨大優勢，在於其創造的「槓桿效應」 40。靜態範本需要持續的手動維護，而知識項目則會隨著開發者技術的成熟與專案的推進自動同步演進 40。透過共用相同的永久記憶庫，所有非同步運作的代理都能夠理解並遵循統一的架構標準，這大幅減少了因為設計不一致所導致的重工（Rework），使得每一次的新專案建置都比前一次更加迅速且精準，形成一種強大的工程複利效應 40。

然而，這項技術在當前版本中仍有改進空間。部分資深工程師反饋指出，在某些複雜場景下，內部知識庫系統的更新頻率可能不如預期，代理偶爾仍會重複相同的錯誤 21。作為替代方案，一些高階使用者選擇透過設定檔（如 mcp\_config.json）連接 Notion 等外部資料庫作為 MCP 伺服器，並在 GEMINI.md 規則中強制代理在規劃或編碼前，必須先搜尋並引用 Notion 知識庫內的條目，以確保企業知識的絕對單一真相來源（Source of Truth） 21。

## **企業級存取控制與代理安全架構**

賦予人工智慧代理存取終端機命令列、讀寫本機檔案系統以及自主操作網頁瀏覽器的廣泛權限，必然伴隨著嚴峻的網路安全與營運風險 43。若缺乏妥善的邊界治理，代理可能會因為錯誤的推理或惡意的提示詞注入（Prompt Injection）而執行破壞性指令。為此，Antigravity 將資訊安全防護與細粒度的存取控制直接內建於 IDE 的核心架構中，採用了多層次、可自訂的安全護欄機制 6。

### **終端機執行的三段式控制模式**

針對代理在系統終端機中執行 Shell 腳本與命令列指令的權限，平台提供了三種不同層級的防護模式，讓開發者能夠在「自動化速度」與「系統安全性」之間取得符合自身風險承受度的最佳平衡：

| 終端機執行模式 | 安全機制與運作邏輯描述 | 建議適用場景 |
| :---- | :---- | :---- |
| **關閉 (Off)** | 最高安全層級。代理被絕對禁止自動執行任何終端機命令。除非命令被開發者明確列於可配置的「允許清單（Allow list）」中，否則每一次的操作皆須由人類手動點擊授權。 | 處理極度敏感的企業核心程式碼庫、生產環境的組態管理，或處理未經驗證的第三方套件時。 |
| **自動 (Auto)** | 智慧動態層級。系統賦予代理自主判斷的權力。代理會基於內建的安全模型評估指令風險，對於無害指令會自動執行，遇到潛在破壞性或不可逆的操作時，將主動暫停並請求人類許可。 | 大多數日常開發場景、一般性新功能的迭代、常規除錯與單元測試流程。 |
| **渦輪 (Turbo)** | 最高自動化層級。解除大部分限制，代理將始終自動執行所有終端機命令。唯一的防線是開發者可配置的「拒絕清單（Deny list）」，系統會攔截清單上的明文破壞性指令（如 rm \-rf 等）。 | 概念驗證（PoC）原型開發、完全沙盒化或隔離的虛擬測試環境中進行的大規模自動化重構。 |

上述機制資料來源：2。

### **瀏覽器代理的安全隔離與名單治理**

Antigravity 內建的瀏覽器子代理具備在網頁上點擊、輸入、甚至執行 DOM 抓取的強大能力 5。在平台的「嚴格模式（Strict Mode）」下，代理與外部網站的所有互動，包含自動執行「讀取 URL（Read URL）」工具或渲染 Markdown 外部圖片，皆受到極其嚴格的兩層式安全系統監控 43。

第一層是基於伺服器端的「拒絕清單（Denylist）」。該清單由 Google Superroot 的 BadUrlsChecker 服務動態維護並強制執行 45。每當瀏覽器代理嘗試導覽至新的網址時，系統都會透過遠端程序呼叫（RPC）即時比對伺服器端的惡意網址庫；值得注意的是，若伺服器因故無法連線，系統將採取「預設拒絕（Denied by default）」的防禦性姿態，直接封鎖存取 45。拒絕清單擁有絕對的最高優先權，開發者無法手動將拒絕清單上的網域加入允許清單 45。

第二層是基於本機端的「允許清單（Allowlist）」。在初始狀態下，為了極大化安全性，允許清單內僅預設開放 localhost 供本地端伺服器測試使用 45。當開發者或代理嘗試存取允許清單以外的任何外部 URL 時，系統會強制阻擋並彈出提示視窗；只有在開發者主動審查並點擊「永遠允許（always allow）」按鈕後，該網域才會被加入允許清單，從分解鎖代理讀取該網頁內容並與之互動的權限 45。這套嚴密的雙層防禦機制，確保了即使代理接收到惡意的外部指令，也無法將開發者的本機機密資料外洩至未經授權的外部網域。

此外，為了提升瀏覽器代理的操作流暢度，Antigravity 還提供了一個專屬的 Chrome 擴充功能 46。該擴充功能允許開發者直接從獨立的 Chrome 瀏覽器視窗中取消當前的代理對話、將焦點切換回 IDE，從而實現人類與瀏覽器代理之間的無縫平行協作 46。

## **結論與企業級導入高階實踐建議**

Google Antigravity 透過將強大的多模型推論矩陣（包含 Gemini 3 Pro 的深度思考與 Claude Sonnet 4.5 的精準編碼能力）、基於 YAML 嚴格語義觸發的技能擴充系統、消除認知飽和瓶頸的模型上下文協定（MCP），以及具備自適應演化能力的永久知識庫深度融合，成功將傳統的文字編輯器昇華為一個高度自動化的代理控制平面。其引入的工件驗證機制與多表面（編輯器、管理員、瀏覽器）非同步操作能力，使得代理不再受限於單純的程式碼補全，而是能夠自主策劃並執行端到端的複雜軟體工程生命週期任務。

對於考慮全面導入 Antigravity 平台的企業技術團隊而言，成功的關鍵不僅僅是安裝軟體，更在於必須重新建構團隊的開發工作流程與治理框架。強烈建議企業優先制定專屬的「憲規（Constitution）」，並將其部署於全域的 GEMINI.md 檔案中，以確保所有虛擬代理的行為皆符合組織的技術堆疊規範與安全合規要求。同時，架構團隊應逐步將資深工程師的「部落知識」萃取並轉化為標準化的 YAML 技能模組與 / 觸發的工作流，再透過配置 IAM 驗證的客製化 MCP 伺服器，安全地賦予代理對企業專有資料庫與問題追蹤系統的深層感知能力。唯有將人工智慧視為協同運作的虛擬工程團隊，並輔以嚴密的終端機執行與瀏覽器名單安全控制策略，企業方能在此次代理優先的技術浪潮中，實現開發效率與軟體品質的指數型躍升。

#### **引用的著作**

1. Tutorial : Getting Started with Google Antigravity Skills \- Medium, 檢索日期：2月 25, 2026， [https://medium.com/google-cloud/tutorial-getting-started-with-antigravity-skills-864041811e0d](https://medium.com/google-cloud/tutorial-getting-started-with-antigravity-skills-864041811e0d)  
2. Tutorial : Getting Started with Google Antigravity | by Romin Irani \- Medium, 檢索日期：2月 25, 2026， [https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2](https://medium.com/google-cloud/tutorial-getting-started-with-google-antigravity-b5cc74c103c2)  
3. Vibe Engineering with Antrigravity | by Leon Nicholls \- Medium, 檢索日期：2月 25, 2026， [https://leonnicholls.medium.com/vibe-engineering-with-antrigravity-3aaa6ec5b7f5](https://leonnicholls.medium.com/vibe-engineering-with-antrigravity-3aaa6ec5b7f5)  
4. Build with Google Antigravity, our new agentic development platform, 檢索日期：2月 25, 2026， [https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)  
5. Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/home](https://antigravity.google/docs/home)  
6. Getting Started with Google Antigravity, 檢索日期：2月 25, 2026， [https://codelabs.developers.google.com/getting-started-google-antigravity](https://codelabs.developers.google.com/getting-started-google-antigravity)  
7. Google Antigravity Editor — Tips & Tricks | by Mete Atamel | Google Cloud \- Community, 檢索日期：2月 25, 2026， [https://medium.com/google-cloud/google-antigravity-editor-tips-tricks-cffde820aa5c](https://medium.com/google-cloud/google-antigravity-editor-tips-tricks-cffde820aa5c)  
8. Introducing Google Antigravity, a New Era in AI-Assisted Software Development, 檢索日期：2月 25, 2026， [https://antigravity.google/blog/introducing-google-antigravity](https://antigravity.google/blog/introducing-google-antigravity)  
9. oh-my-opencode/docs/guide/installation.md at dev \- GitHub, 檢索日期：2月 25, 2026， [https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/guide/installation.md](https://github.com/code-yeongyu/oh-my-opencode/blob/dev/docs/guide/installation.md)  
10. Claude Code-Sonnet 4.5 \>\>\>\>\>\>\> Gemini 3.0 Pro \- Antigravity : r/ClaudeAI \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/ClaudeAI/comments/1p3suco/claude\_codesonnet\_45\_gemini\_30\_pro\_antigravity/](https://www.reddit.com/r/ClaudeAI/comments/1p3suco/claude_codesonnet_45_gemini_30_pro_antigravity/)  
11. Gemini 3 is not as good as everyone is saying, and I believe bot spam/marketing funds were used to promote it. Chatgpt is significantly better in terms of uinderstanding instructions. : r/ChatGPTPro \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/ChatGPTPro/comments/1p4r9xn/gemini\_3\_is\_not\_as\_good\_as\_everyone\_is\_saying\_and/](https://www.reddit.com/r/ChatGPTPro/comments/1p4r9xn/gemini_3_is_not_as_good_as_everyone_is_saying_and/)  
12. Proactiveness considered harmful? A guide to customise the Gemini CLI to suit your coding style | by Daniela Petruzalek | Google Cloud \- Medium, 檢索日期：2月 25, 2026， [https://medium.com/google-cloud/proactiveness-considered-harmful-a-guide-to-customise-the-gemini-cli-to-suit-your-coding-style-b23c9b605058](https://medium.com/google-cloud/proactiveness-considered-harmful-a-guide-to-customise-the-gemini-cli-to-suit-your-coding-style-b23c9b605058)  
13. Gemini 3.1 Pro \- Hacker News, 檢索日期：2月 25, 2026， [https://news.ycombinator.com/item?id=47074735](https://news.ycombinator.com/item?id=47074735)  
14. Gemini 3.0 vs GPT-5.1 vs Claude 4.5 vs Grok 4.1: AI Model Comparison \- Clarifai, 檢索日期：2月 25, 2026， [https://www.clarifai.com/blog/gemini-3.0-vs-other-models](https://www.clarifai.com/blog/gemini-3.0-vs-other-models)  
15. An AI December to Remember | Shelly Palmer, 檢索日期：2月 25, 2026， [https://shellypalmer.com/2025/12/an-ai-december-to-remember/](https://shellypalmer.com/2025/12/an-ai-december-to-remember/)  
16. Quick run through of Google's new code editor Antigravity with Gemini 3 Pro\! \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/ChatGPTCoding/comments/1p0j576/quick\_run\_through\_of\_googles\_new\_code\_editor/](https://www.reddit.com/r/ChatGPTCoding/comments/1p0j576/quick_run_through_of_googles_new_code_editor/)  
17. Spec-Kit: Antigravity Skills & Workflows \- GitHub, 檢索日期：2月 25, 2026， [https://github.com/compnew2006/Spec-Kit-Antigravity-Skills](https://github.com/compnew2006/Spec-Kit-Antigravity-Skills)  
18. How to Set Up Google Antigravity on macOS & Windows (2026) \- iTecs, 檢索日期：2月 25, 2026， [https://itecsonline.com/post/antigravity-setup-guide](https://itecsonline.com/post/antigravity-setup-guide)  
19. How are you all organizing your Rules to avoid "Context Fatigue"? \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/GoogleAntigravityIDE/comments/1qr8s70/how\_are\_you\_all\_organizing\_your\_rules\_to\_avoid/](https://www.reddit.com/r/GoogleAntigravityIDE/comments/1qr8s70/how_are_you_all_organizing_your_rules_to_avoid/)  
20. Rules / Workflows \- Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/rules-workflows](https://antigravity.google/docs/rules-workflows)  
21. Technical Feedback: 3 Weeks with Antigravity (Agent Rules, Win11 Stability, and MCP), 檢索日期：2月 25, 2026， [https://discuss.ai.google.dev/t/technical-feedback-3-weeks-with-antigravity-agent-rules-win11-stability-and-mcp/116440](https://discuss.ai.google.dev/t/technical-feedback-3-weeks-with-antigravity-agent-rules-win11-stability-and-mcp/116440)  
22. Hooks in Antigravity \- Google AI Developers Forum, 檢索日期：2月 25, 2026， [https://discuss.ai.google.dev/t/hooks-in-antigravity/120458](https://discuss.ai.google.dev/t/hooks-in-antigravity/120458)  
23. Customize Google Antigravity with rules and workflows \- Mete Atamel, 檢索日期：2月 25, 2026， [https://atamel.dev/posts/2025/11-25\_customize\_antigravity\_rules\_workflows/](https://atamel.dev/posts/2025/11-25_customize_antigravity_rules_workflows/)  
24. Share your best Google Antigravity Skills, Rules & Workflows. : r/google\_antigravity \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/google\_antigravity/comments/1r3hlis/share\_your\_best\_google\_antigravity\_skills\_rules/](https://www.reddit.com/r/google_antigravity/comments/1r3hlis/share_your_best_google_antigravity_skills_rules/)  
25. What are Google Antigravity Skills? Build 24/7 AI Agents | VERTU, 檢索日期：2月 25, 2026， [https://vertu.com/lifestyle/mastering-google-antigravity-skills-the-ultimate-guide-to-extending-agentic-ai-in-2026/](https://vertu.com/lifestyle/mastering-google-antigravity-skills-the-ultimate-guide-to-extending-agentic-ai-in-2026/)  
26. Sample Google Antigravity Skills \- GitHub, 檢索日期：2月 25, 2026， [https://github.com/rominirani/antigravity-skills](https://github.com/rominirani/antigravity-skills)  
27. Authoring Google Antigravity Skills, 檢索日期：2月 25, 2026， [https://codelabs.developers.google.com/getting-started-with-antigravity-skills](https://codelabs.developers.google.com/getting-started-with-antigravity-skills)  
28. creating-skills | Skills Marketplace \- LobeHub, 檢索日期：2月 25, 2026， [https://lobehub.com/skills/jchavezar-vertex-ai-samples-creating-skills](https://lobehub.com/skills/jchavezar-vertex-ai-samples-creating-skills)  
29. Beyond Tool Use: Implementing “Cognitive Patterns” with Google Antigravity Skills \- Medium, 檢索日期：2月 25, 2026， [https://medium.com/google-cloud/beyond-tool-use-implementing-cognitive-patterns-with-google-antigravity-skills-16404dd35d99](https://medium.com/google-cloud/beyond-tool-use-implementing-cognitive-patterns-with-google-antigravity-skills-16404dd35d99)  
30. 58-Skill Antigravity Aggregator: Boost Your AI IDE Agent | VERTU, 檢索日期：2月 25, 2026， [https://vertu.com/lifestyle/the-58-skill-power-pack-for-google-antigravity-transforming-ai-into-a-full-stack-team/](https://vertu.com/lifestyle/the-58-skill-power-pack-for-google-antigravity-transforming-ai-into-a-full-stack-team/)  
31. Google Antigravity Agent Manager Explained: Deep Dive \- Arjan KC, 檢索日期：2月 25, 2026， [https://www.arjankc.com.np/blog/google-antigravity-agent-manager-explained/](https://www.arjankc.com.np/blog/google-antigravity-agent-manager-explained/)  
32. Antigravity Editor: MCP Integration, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/mcp](https://antigravity.google/docs/mcp)  
33. Connect Google Antigravity IDE to Google's Data Cloud services, 檢索日期：2月 25, 2026， [https://cloud.google.com/blog/products/data-analytics/connect-google-antigravity-ide-to-googles-data-cloud-services](https://cloud.google.com/blog/products/data-analytics/connect-google-antigravity-ide-to-googles-data-cloud-services)  
34. Google Workspace Developer Tools, 檢索日期：2月 25, 2026， [https://developers.google.com/workspace/guides/developer-tools](https://developers.google.com/workspace/guides/developer-tools)  
35. Google Antigravity \+ Firebase MCP is INSANE\! \- Lilys AI, 檢索日期：2月 25, 2026， [https://lilys.ai/en/notes/openai-agent-builder-20260208/google-antigravity-firebase-mcp-insane](https://lilys.ai/en/notes/openai-agent-builder-20260208/google-antigravity-firebase-mcp-insane)  
36. How to Add MCP Servers to Google's Antigravity IDE \- YouTube, 檢索日期：2月 25, 2026， [https://www.youtube.com/watch?v=TwRPGmBKIY0](https://www.youtube.com/watch?v=TwRPGmBKIY0)  
37. Google Antigravity: How to add custom MCP server to improve Vibe Coding \- Medium, 檢索日期：2月 25, 2026， [https://medium.com/google-developer-experts/google-antigravity-custom-mcp-server-integration-to-improve-vibe-coding-f92ddbc1c22d](https://medium.com/google-developer-experts/google-antigravity-custom-mcp-server-integration-to-improve-vibe-coding-f92ddbc1c22d)  
38. 檢索日期：2月 25, 2026， [https://cloud.google.com/blog/products/data-analytics/connect-google-antigravity-ide-to-googles-data-cloud-services\#:\~:text=With%20Model%20Context%20Protocol%20(MCP,all%20within%20your%20development%20workflow.](https://cloud.google.com/blog/products/data-analytics/connect-google-antigravity-ide-to-googles-data-cloud-services#:~:text=With%20Model%20Context%20Protocol%20\(MCP,all%20within%20your%20development%20workflow.)  
39. TestSprite MCP Server \+ Google AntiGravity \= Autonomous E2E Testing (No Code Required\!), 檢索日期：2月 25, 2026， [https://www.youtube.com/watch?v=ijMUgokpsqE](https://www.youtube.com/watch?v=ijMUgokpsqE)  
40. Antigravity Permanent Memory: Makes Every Build Faster Than the Last \- Reddit, 檢索日期：2月 25, 2026， [https://www.reddit.com/r/AISEOInsider/comments/1r326wf/antigravity\_permanent\_memory\_makes\_every\_build/](https://www.reddit.com/r/AISEOInsider/comments/1r326wf/antigravity_permanent_memory_makes_every_build/)  
41. Knowledge \- Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/knowledge](https://antigravity.google/docs/knowledge)  
42. The Antigravity Permanent Memory Breakthrough Reshaping AI Automation, 檢索日期：2月 25, 2026， [https://juliangoldie.com/antigravity-permanent-memory/](https://juliangoldie.com/antigravity-permanent-memory/)  
43. Strict Mode \- Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/strict-mode](https://antigravity.google/docs/strict-mode)  
44. Antigravity: Google's New Agent-First IDE. How It Compares to Cursor and Kiro (Deep-dive, pros/cons, and what developers should know) \- Abdullah Grewal, 檢索日期：2月 25, 2026， [https://buzzgrewal.medium.com/antigravity-googles-new-agent-first-ide-how-it-compares-to-cursor-and-kiro-deep-dive-a0dc249e4b5d](https://buzzgrewal.medium.com/antigravity-googles-new-agent-first-ide-how-it-compares-to-cursor-and-kiro-deep-dive-a0dc249e4b5d)  
45. Allowlist / Denylist \- Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/allowlist-denylist](https://antigravity.google/docs/allowlist-denylist)  
46. Chrome Extension \- Google Antigravity Documentation, 檢索日期：2月 25, 2026， [https://antigravity.google/docs/chrome-extension](https://antigravity.google/docs/chrome-extension)