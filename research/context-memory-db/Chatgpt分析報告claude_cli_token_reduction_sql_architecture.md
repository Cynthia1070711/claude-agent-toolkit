# Claude CLI Token 減量策略與 Microsoft SQL Server 向量檢索架構研究

## 1. 為什麼需要 Token 減量

大型語言模型（LLM）在處理 CLI
任務時往往需要處理大量程式碼與輸入內容，容易超出上下文視窗（context
window）的限制。\
大型專案可能包含數萬到數十萬行程式碼，如果一次將整個專案內容傳給模型，會耗費大量
token 並提高成本。

問題包含：

-   Token 成本過高
-   Context window 限制
-   AI 回覆精準度下降
-   大型專案上下文難以管理

因此需要 **Context Reduction Strategy（上下文減量策略）**。

------------------------------------------------------------------------

# 2. Claude CLI 如何讀取上下文

Claude CLI 主要透過以下方式讀取專案上下文：

### 1. 專案文件注入

`CLAUDE.md`

Claude CLI 在啟動專案時會自動讀取該檔案並注入到 prompt context。

用途：

-   專案架構說明
-   開發規範
-   API 說明
-   技術架構

------------------------------------------------------------------------

### 2. Hook / MCP Plugin

Claude CLI 支援 **UserPromptSubmit Hook**

流程：

User Prompt\
↓\
Hook Trigger\
↓\
自訂程式執行\
↓\
注入額外 context\
↓\
Claude 推理

用途：

-   動態程式碼檢索
-   文件搜尋
-   DB Query

------------------------------------------------------------------------

# 3. Token 減量策略比較

  策略              說明                   Token消耗   效果
  ----------------- ---------------------- ----------- --------
  整檔上傳          直接上傳完整程式碼     極高        低效率
  Chunk-based       固定大小切塊           中          普通
  Symbol-level      以方法/類別切塊        低          高
  Retrieval-based   語意搜尋最相關程式碼   最低        最佳

最佳策略通常是

**Symbol + Vector Retrieval + Dependency Graph**

------------------------------------------------------------------------

# 4. Roslyn AST 建立 Symbol 切塊

使用 Roslyn 解析 C# 專案：

流程：

1 載入 Solution\
2 建立 Compilation\
3 解析 SyntaxTree\
4 取得 SemanticModel\
5 取得 Symbol

示例：

``` csharp
foreach (var classNode in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
{
    var classSymbol = semanticModel.GetDeclaredSymbol(classNode);

    foreach (var methodNode in classNode.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        var methodSymbol = semanticModel.GetDeclaredSymbol(methodNode);
    }
}
```

每個

-   class
-   method
-   interface

都可以成為 **Context Unit**。

------------------------------------------------------------------------

# 5. Code Embedding 向量化

使用 Embedding API 將程式碼轉為向量。

### OpenAI

``` csharp
var response = await openAI.Embeddings.CreateAsync(
    model: "text-embedding-ada-002",
    input: codeText
);
```

### Azure SQL 內建

``` sql
DECLARE @vector VECTOR(1536);

SET @vector =
AI_GENERATE_EMBEDDINGS(
N'public class UserService { }',
USE MODEL 'text-embedding-ada-002'
);
```

------------------------------------------------------------------------

# 6. SQL Server 儲存向量

SQL Server 2025 支援

**VECTOR datatype**

``` sql
CREATE TABLE Symbols
(
Id INT PRIMARY KEY,
Name NVARCHAR(200),
Code NVARCHAR(MAX),
Embedding VECTOR(1536)
)
```

------------------------------------------------------------------------

### 相似度搜尋

``` sql
SELECT TOP 10 *
FROM Symbols
ORDER BY VECTOR_DISTANCE('cosine', @queryVector, Embedding)
```

------------------------------------------------------------------------

# 7. 建立 Symbol Graph

為了建立程式碼依賴關係。

表結構：

``` sql
CREATE TABLE SymbolDependency
(
SourceId INT,
TargetId INT,
RelationType NVARCHAR(50)
)
```

關係類型：

-   calls
-   inherits
-   implements
-   uses

------------------------------------------------------------------------

# 8. 查詢流程

完整流程：

User Prompt

↓

Embedding Query

↓

SQL Vector Search

↓

Top N Symbols

↓

Graph Dependency Expand

↓

Context Merge

↓

Claude CLI Prompt

------------------------------------------------------------------------

# 9. Claude CLI 整合架構

Hook流程：

    User Prompt
        │
        ▼
    Hook Trigger
        │
        ▼
    Embedding Query
        │
        ▼
    SQL Vector Search
        │
        ▼
    Symbol Graph Expand
        │
        ▼
    Context Builder
        │
        ▼
    Claude CLI

------------------------------------------------------------------------

# 10. 最佳架構

完整 AI Coding 架構：

    Roslyn AST Parser
            │
            ▼
    Symbol Extractor
            │
            ▼
    Embedding Generator
            │
            ▼
    SQL Server Vector DB
            │
            ▼
    Semantic Search
            │
            ▼
    Dependency Graph
            │
            ▼
    Context Builder
            │
            ▼
    Claude CLI

------------------------------------------------------------------------

# 11. Token 節省效果

  方法          Token量
  ------------- ---------
  整檔專案      50K+
  Chunk         30K
  Symbol        20K
  RAG + Graph   10K以下

節省可達

**70%\~90% Token**

------------------------------------------------------------------------

# 12. 結論

最佳 CLI Token 減量架構：

**Roslyn AST + Embedding + SQL Vector DB + Symbol Graph + Retrieval**

優勢：

-   Token 大幅降低
-   回覆精準度提高
-   適合大型專案
-   可完全自建

適用環境：

-   C#
-   ASP.NET Core
-   SQL Server
-   Claude CLI
