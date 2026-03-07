2. Claude CLI 如何讀取上下文（Project Context Packing）

Claude CLI（Claude Code）提供多種讀取上下文的機制。一方面，它支援在專案根目錄放置 CLAUDE.md 等文件，並自動在每次開啟專案時將該檔案內容注入上下文。例如，使用者可以用 CLI 工具（如開源的 ctx）生成包含專案描述、架構圖和核心文件摘要的 CLAUDE.md，讓 Claude 在處理任務時自動獲得這些資訊。另一方面，Claude Code 提供 Hook/Plugin 機制（MCP），例如 Claude Context 這類 MCP 外掛允許在對話生命週期的關鍵時機點（如 UserPromptSubmit）自動執行自定義命令或程式碼，並將結果作為額外提示注入給模型。例如，可以建立一個 UserPromptSubmit hook，在使用者輸入問題前觸發檢索流程，取回相關程式碼片段並附加到提示中。透過這些機制，Claude CLI 能夠靈活地「打包」專案上下文，並在需要時動態擴充模型的視野，避免一次性傳遞過多資料。

3. Token 減量主流策略比較

整檔上傳 (Upload entire file)： 最簡單粗暴的方式是將整個檔案內容直接傳給 LLM，讓模型「瀏覽」所有程式碼。這雖能保證模型看到完整上下文，但極度浪費 token。對於大型檔案或多檔案，經常會超出 context 視窗限制，導致結果截斷或失效。該策略適用於小型程式碼片段，但不適合大型專案。

Chunk-Based（固定大小切塊）： 將程式碼檔案根據固定行數或 token 數拆分為多個切塊 (chunks)，逐一或有選擇地傳送。這種方式需開發者自行決定切塊邏輯，例如每 500 行為一塊，或按功能區隔拆分。好處是單次輸送的 token 減少，但缺點是相關上下文可能被切斷，且需要手動或程式邏輯判斷選哪幾塊最重要。一般而言，Chunk-Based 比純粹整檔傳遞更有效。

符號級別 (Symbol-Level) 切塊： 基於語法或邏輯單元（如類別、方法、介面）拆分程式碼。使用工具（如 Roslyn）識別出方法、類別等結構，將它們作為更精細的「塊」。此策略保留了程式碼的自然邏輯單元，避免在不恰當的地方截斷。研究與實踐中，將類別或函式作為上下文單位往往能更精準地提供必要資訊。例如，可只給模型目標方法及其所屬類別，避免帶入整個檔案的其他無關程式碼。

檢索為主 (Retrieval-Based/RAG)： 透過向量檢索 (semantic search) 動態挑選相關程式碼片段，再將這些精選的片段傳入模型。具體而言，先對專案程式碼做分塊與嵌入索引；當使用者提出問題時，將問題或關鍵詞轉成向量，在資料庫中搜尋與之語意相似的程式碼塊，並僅將最相關的結果注入上下文。這種 Retrieval-Augmented Generation (RAG) 策略被證實能有效減少模型的令牌用量，同時保持上下文質量。實例：查找「用戶認證邏輯」可檢索 AuthController、UserModel 等關鍵代碼，而無需載入整個專案。

綜合比較：整檔上傳最費令牌，Chunk 與 Symbol 切塊是靜態拆解，Retrieval-Based 則是動態精選。後兩者與語義檢索結合能大幅降低 token，並提高答覆精準度。

4. 在 C# / ASP.NET 專案中以 Roslyn AST 建立符號切塊

使用 Roslyn 編譯器平台，可程式化地分析 C# 專案並提取程式碼符號（類別、方法、介面等）。基本流程如下：

載入專案/解決方案：透過 MSBuildWorkspace 打開 .sln 或 .csproj，獲得 Solution 與 Project 物件。

產生編譯 (Compilation)：對每個專案呼叫 GetCompilationAsync()，生成包含所有程式碼的 Compilation 物件，該物件包含完整的語法樹與符號資訊。

遍歷語法樹 (SyntaxTree)：對每個 compilation.SyntaxTrees，使用 GetRoot() 取得根節點，然後呼叫 DescendantNodes() 遍歷子節點。透過 OfType<MethodDeclarationSyntax>()、OfType<ClassDeclarationSyntax>() 等篩選出方法和類別宣告。

取得語意模型 (SemanticModel)：對於每棵 SyntaxTree，使用 compilation.GetSemanticModel(syntaxTree) 取得 SemanticModel。此模型可解析每個語法節點的語意符號。

收集符號資料：例如，對每個 MethodDeclarationSyntax 或 ClassDeclarationSyntax 節點，用 semanticModel.GetDeclaredSymbol(node) 獲取對應的 IMethodSymbol 或 INamedTypeSymbol。這些符號物件包含名稱、參數、回傳型別、所屬類別等資訊。也可以用 semanticModel.GetTypeInfo(node) 取得使用到的型別資訊，或用 SymbolFinder.FindReferencesAsync 查找符號間的呼叫關係。

構造程式碼片段：將每個符號的原始程式碼（如方法體與其註解）作為一個「程式碼切塊」。可借助 Roslyn 的 ToString() 或 .GetText() 取得對應的程式碼文字，加上 XML 註解等，形成自包含的片段。

Roslyn 的 Syntax API 提供了完整的程式結構表示：每個檔案被解析為一顆不可變的語法樹，根節點（CompilationUnit）包含所有 using、namespace、類別、方法等節點。這使得找出所有方法與類別成為可能。例如，以下程式碼示例顯示如何用 Roslyn 遍歷一個類別的所有方法並取得其符號信息：

var compilation = project.GetCompilationAsync().Result;
var semantic = compilation.GetSemanticModel(syntaxTree);
foreach (var classNode in syntaxTree.GetRoot().DescendantNodes().OfType<ClassDeclarationSyntax>())
{
    var classSymbol = semantic.GetDeclaredSymbol(classNode);
    // 提取類別內的所有方法
    foreach (var methodNode in classNode.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        var methodSymbol = semantic.GetDeclaredSymbol(methodNode);
        // methodSymbol.Name、參數、回傳型別等資訊可用
    }
}

透過這種方式，可以程式化地收集專案中所有類別、方法、介面，並將它們切割成各自的上下文單元，供後續檢索與向量化之用。

5. 將程式碼切塊與註解轉換為向量表示

取得各符號片段後，需要將它們轉換為向量以便語義檢索。常見做法是使用嵌入模型（Embedding API）：

OpenAI Embedding API：使用 OpenAI 提供的 /embeddings 端點。只要將程式碼片段（含注釋和文件字串）作為純文本傳入，就能獲得對應的向量表示。OpenAI 的詞嵌入模型（如 text-embedding-ada-002 或專門的 code-search-xxx）會將文本和程式碼映射到高維空間。例如：

var input = new EmbeddingInput { Input = codeString, Model = "text-embedding-ada-002" };
var response = await openAIClient.GetEmbeddingsAsync(input);
var vector = response.Data[0].Embedding;

這樣 codeString 中的語義資訊（變數、註解、方法名稱等）就被編碼成 vector。

Azure OpenAI Embedded in SQL：如果使用 Azure SQL Server 2025，可直接在資料庫內部調用 AI_GENERATE_EMBEDDINGS 函數，將文本轉為向量。例如：

DECLARE @embedding VECTOR(1536) = AI_GENERATE_EMBEDDINGS(N'public class User { ... }', USE MODEL 'text-embedding-ada-002');

此函數輸入程式碼片段字串並返回長度為 1536 的浮點向量。得出向量後，即可存入資料庫。

無論使用何種 API，最後會得到每個程式碼切塊的向量表示。這些向量理論上會將語義相似的程式碼片段映射到相近的位置，以便後續比較和檢索。

6. 在 Microsoft SQL Server 儲存與檢索向量

將向量嵌入存進資料庫並實現相似度查詢是核心任務。SQL Server 2025 引入了原生 VECTOR 資料型別和相關函式，專為嵌入與向量檢索優化。具體流程：

表結構：可以建立一張表（或使用圖資料庫節點表），包含符號 ID、名稱、程式碼片段、以及向量欄位。例如：

CREATE TABLE Symbols (
  Id INT PRIMARY KEY,
  Name NVARCHAR(200),
  Code NVARCHAR(MAX),
  Embedding VECTOR(1536)
);

其中 Embedding VECTOR(1536) 為長度 1536 的向量欄位。也可附加儲存註釋或檔案路徑等資訊。

插入嵌入向量：透過 AI_GENERATE_EMBEDDINGS 或應用程式計算後的向量，以 INSERT 語句加入資料表。若使用單一精度浮點（float32），向量效能最佳。

索引與相似度查詢：SQL Server 提供向量索引和 VECTOR_DISTANCE 函式來執行近鄰搜索。例如，要查找與向量 @qv 最相似的前 10 條符號，可執行：

DECLARE @qv VECTOR(1536) = AI_GENERATE_EMBEDDINGS(N'authentication logic', USE MODEL 'text-embedding-ada-002');
SELECT TOP(10) Id, Name, Code,
       VECTOR_DISTANCE('cosine', @qv, Embedding) AS dist
  FROM Symbols
 ORDER BY dist ASC;

以上語句計算向量距離（此處使用餘弦距離），並取最相近的條目。若未使用原生向量型別，也可將向量以字串或陣列形式儲存，並在查詢時利用自訂 CLR 函式或表值函式計算相似度，但效能不及內建型別。

分頁與批次處理：面對百萬級符號表，可結合向量索引與分頁技術，或者利用 SQL Server 新增的近似最近鄰演算法，以支援大規模檢索。

簡而言之，SQL Server 2025 的向量支援允許直接在 DB 層執行高效能的語意相似度查詢，無需依賴外部向量庫。例如，Microsoft 官方說明指出：「一旦產生了嵌入向量，就可以儲存到 SQL Server，並執行檢索查詢以找到類似資料」。

7. 建立程式碼符號圖（Symbol Graph）

為了捕捉程式碼內部的邏輯依賴關係，可構建一個符號圖，將方法、類別等符號視為圖的節點，並用邊表示它們之間的依賴（如方法呼叫、類別繼承、介面實作等）。在 SQL Server 中，可有兩種方式：

自訂鄰接表 (Adjacency List)：建立一張邏輯關係表，例如 SymbolDependencies(SourceId, TargetId, RelationType)，其中 SourceId 和 TargetId 參照前述 Symbols.Id，RelationType 表示關係類型（如「呼叫」、「繼承」等）。每當 Roslyn 探測到一個方法 A 呼叫方法 B，就插入 (A, B, 'calls')。這樣即可用 JOIN 查詢出一個符號的直接依賴。若需展開多層依賴，可迭代或使用遞迴 CTE。

SQL Graph 節點/邊表：SQL Server 的圖形資料庫功能允許直接建立節點表與邊表。例如：

CREATE TABLE SymbolNode (Id INT PRIMARY KEY, Name NVARCHAR(100)) AS NODE;
CREATE TABLE CallsEdge (SourceId BIGINT, TargetId BIGINT) AS EDGE;

其中 SymbolNode 儲存所有符號（Node），CallsEdge 儲存方法呼叫關係（Edge）。使用 MATCH 子句即可便捷地查詢圖路徑。公式文件提到：「節點表代表圖中的實體，邊表代表圖中的關係。節點表中每個節點有自動生成的 $node_id，邊表連接兩個節點」。這種方式更像圖形數據庫，但底層仍是關聯表，也是一種可選方案。

符號圖可以在查詢時展開依賴，例如同時檢索方法 A 及其呼叫的 B、繼承的 C 等相關符號，有助於提供完整的上下文。例如，若檢索到某方法符號，可用圖遍歷找到它直接依賴的其他方法或類別，將這些程式碼一起返回給 LLM。此結構化表示能補充純粹語意檢索的不足，確保模型獲得連貫的程式碼片段。

8. 查詢流程設計

完整的檢索查詢流程可設計為以下步驟，確保使用者問題能映射到最相關的程式碼上下文：

問題預處理與向量化：使用者輸入關鍵字或自然語句（例如「如何處理付款」），首先清理語言並送入嵌入模型，將問題轉換為向量表示。

向量檢索：使用產生的查詢向量在 Symbols 表中進行相似度搜索。執行類似前述的 SELECT ... ORDER BY VECTOR_DISTANCE(...) 操作，返回前 N 個最匹配的符號片段。這些符號代表與問題在語義上最相關的程式碼單元。

符號圖擴展：對上述候選符號，利用符號圖找到其依賴的相關符號。例如，若取回了方法 A，則查詢所有 (A -> B) 的邊，取回 B 代表的方法實作；或若有類別繼承關係，也一併抓取父類別或介面。這一步可用 SQL JOIN 或圖查詢連續執行，將深度限制在兩到三層以避免爆炸式結果。

聚合上下文：將檢索到的符號的程式碼文本、註解以及其依賴符號的程式碼合併，整理成一個「最相關上下文」集合。可依優先度排序，將最匹配的片段置前。目的是只提供給 LLM 完整且聚焦的背景資訊，盡量排除雜訊。Slaneo 團隊的實驗指出，混合圖＋向量檢索可只提供 ~30K 個 tokens 的代碼，而已能回答複雜問題。

回傳結果：將這些代碼片段作為補充提示，連同原始問題一起發送給 Claude CLI。此時模型收到精簡後的上下文，能直接在本地檢視的相關程式碼上生成回答，而無需遍歷整個專案文件。

9. 與 Claude CLI 的整合（Hook/Plugin 或 Prompt Builder）

在 Claude Code CLI 中，可採用 Hook 或 MCP 外掛機制將檢索結果注入對話。具體做法包括：

使用 UserPromptSubmit Hook：註冊一個在使用者輸入提交前觸發的 Hook。此 Hook 程式（可是 Python、Node.js、Shell Script 等）讀取當前輸入的提示內容，執行上述檢索流程（呼叫 Azure OpenAI 生成查詢向量、連線 SQL 執行向量檢索和圖查詢），得到相關程式碼片段。然後將這些片段作為 additionalContext 字段返回給 Claude，直接附加到 prompt 中。正如官方文件所述，UserPromptSubmit Hook 可以「在使用者提交提示時觸發，可增加額外上下文」，正符合此用例。

生成 CLAUDE.md / Prompt Builder：另一種方式是在檔案系統中動態生成或更新 CLAUDE.md（或 .claude/context.md），將檢索到的程式碼片段寫入該檔案。Claude Code 在下一次處理時會自動加載這些上下文。或使用 Prompt Builder 功能，在使用者交互前將程式碼片段附加到輸入提示中。這種方法較為被動，但對於某些工作流程也可行。

MCP Plugin：開發一個 Claude Model Context Protocol (MCP) 伺服器插件，專門提供程式碼檢索服務，並在 model 使用過程中被調用。正如 Claude Context 插件所示，它便可「將整個程式碼庫作為上下文」並提供語意檢索功能。開發者可以參考其架構，在本地或企業環境中實現類似功能，與 Claude CLI 無縫整合。

整體而言，透過 Hook 或 Plugin 方式，可將檢索到的精簡上下文注入 Claude CLI，確保每次模型執行時能獲得最精準的程式碼資訊，達到減少 token 耗用、提升答案品質的目的。

10. 整體架構圖 + 流程示意圖

圖：檢索增強生成（RAG）上下文架構示意圖，其中向量檢索與圖結構共同提供專案相關代碼上下文。※圖中各部分示意 RAG 檢索（左）與提示生成（右）的流程。

以上圖示整體流程：使用者問題先透過 Embedding 模型轉為向量（左上），在 SQL 資料庫中進行語意檢索找到相關符號（左中），並展開符號圖查找依賴（左下）。獲得的程式碼片段作為附加提示送往 Claude LLM（右），以精簡且相關的上下文生成回答。整個架構依賴 Roslyn 解析符號、OpenAI/Azure 產生嵌入、SQL Server 儲存+檢索向量，以及 Hook/Plugin 機制與 Claude CLI 整合，從而實現高效率的程式碼輔助開發方案