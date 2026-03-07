## 因應Claude Code CLI的Token減量策略，制定多AGENT協作策略

**各AGENT使用說明**`C:\Users\Alan\Desktop\Projects\MyProject-MVP\claude token減量策略研究分析\各AGENT使用說明` (多協作模式需要詳細了解各AGENT的環境配置(憲章、skills、MCP、鉤子等相關使用方式來分析如何銜接)
**web端claude code 多agent協作策略** `C:\Users\Alan\Desktop\Projects\MyProject-MVP\claude token減量策略研究分析\web_claude多agnet協作策略.md` (可參考分析)
**TRS-13、TRS-14** `C:\Users\Alan\Desktop\Projects\MyProject-MVP\claude token減量策略研究分析\stories\TRS-13-multi-engine-sop.md`、`C:\Users\Alan\Desktop\Projects\MyProject-MVP\claude token減量策略研究分析\stories\TRS-14-gemini-cli-workflow-optimization.md` (重新規劃)

## 多項協作策略，因為是使用google 的antigravity IDE，該IDE工具就有提供agent LLM模組(gemini 3.1 Pro (hight)、Gemin 3.1 pro (low)、gemini 3 flash、Claude sonnet 4.6(Thinking)、Claude Opus 4.6(Thinking)、GPT-OSS 120B(Medium)。所以：
1.Claude code 可做主線任務(create、review、party、sm)等較複雜深入的問題任務。
2.antigravity 內建的claude opus 4.6(thinking)也可以進行補助主線任務、E2E測試任務。
3.Gemini cli pro gemini-3.1-pro-preview  則做其較繁瑣的更新追蹤文檔、dev、或是UIUX設計圖檔生成等任務。
4.Rovodev cli 則可做非主線任務，例如commit message、或其他任務。

## 任務：
1.claude code、gemini cli、antigravity、Rovodev agent都有各自的憲章，而gemini cli跟antigravity的專案憲章是使用同一個。skills、mcp、rules都各自為政，所以該如何設計協作策略?
2.針對claude code的token減量策略，因為claude code是開發主要agent，其他AGENT都是輔助，所以TRS主要都是依照CLAUDE來進行TOKEN減量優化，那其他AGENT進行開發時該如何銜接呢?
3.為了專案協作任務能銜接正確，也避免各agent降智問題，需要考慮是否可以制定一個SOP讓其他AGENT進行開發時能依照SOP執行對接任務?

