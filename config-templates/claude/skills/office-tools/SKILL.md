---
name: office-tools
version: 1.0.0
updated: 2026-05-19
description: "Office document generation toolkit — docx (Word), xlsx (Excel), pptx (PowerPoint), pdf (general non-printing). Lazy graft mode: SKILL.md + references always-on lightweight, Python scripts on-demand install (LibreOffice + Poppler + Tesseract + openpyxl + pypdf + python-docx + pptxgenjs). Triggers: docx, xlsx, pptx, pdf, Word document, Excel spreadsheet, PowerPoint presentation, 文檔生成, 報表, 簡報, 表單填充, OCR, python-docx, openpyxl, pypdf, reportlab, pdfplumber, pptxgenjs, docx-js, markitdown, LibreOffice recalc, financial model color standard, visual QA loop, OOXML, OPC, ISO-IEC 29500. Boundary: PhyCool 列印業務 PDF (PCPT) 走 phycool-pdf-engine, 此 skill 涵蓋通用 office 文檔生成。"
---

# Office Tools

通用 Office 文檔生成 toolkit(docx / xlsx / pptx / pdf),蒸餾自 Anthropic skills-main 4 個 Office skill。

## Lazy Graft 紀律

**Iron Law**: 此 skill 採 lazy graft 模式:
- ✅ SKILL.md + references 純文檔,**不需** Python 依賴
- ✅ scripts/ 不執行不安裝套件
- ✅ 真正觸發特定工具時才 install 對應依賴(走 `references/dependency-setup.md`)

## 4 工具索引

| 觸發詞 | 工具 | Reference | 依賴 |
|---|---|---|---|
| docx / Word / .docx / 公文 / 報告 | **DOCX** | `references/docx-guide.md` | docx-js(npm)/ python-docx / pandoc / LibreOffice |
| xlsx / Excel / .xlsx / 試算表 / 財務模型 | **XLSX** | `references/xlsx-guide.md` | openpyxl / pandas / LibreOffice(formula recalc) |
| pptx / PowerPoint / .pptx / 簡報 / slide | **PPTX** | `references/pptx-guide.md` | pptxgenjs(npm)/ markitdown / Pillow / Poppler |
| pdf / 表單填充 / OCR / pypdf / reportlab | **PDF** | `references/pdf-guide.md` | pypdf / pdfplumber / reportlab / pytesseract / qpdf |

## 共用依賴檢查 SOP

觸發任一 office 工具前先驗證環境:

```powershell
# Python venv
py --version          # 預期 ≥ 3.10
py -m venv .venv
.venv\Scripts\Activate.ps1

# LibreOffice(docx track changes / xlsx formula recalc / pptx PDF 轉換)
soffice --version    # 預期 ≥ 7.0,若無 → choco install libreoffice

# Poppler(PDF → image,pdftoppm / pdftotext / pdfimages)
pdftoppm -v          # 若無 → choco install poppler

# Tesseract(OCR for scanned PDF)
tesseract --version  # 若無 → choco install tesseract

# Node.js(docx-js / pptxgenjs)
node --version       # 預期 ≥ 18
```

詳細安裝步驟見 `references/dependency-setup.md`。

## 蒸餾靈魂(always-on)

### XLSX 財務模型色彩標準(蒸餾自 xlsx SKILL.md)

| 色彩 | 語意 |
|---|---|
| **藍色** | 使用者輸入(input cells) |
| **黑色** | 公式 / 計算結果 |
| **綠色** | 跨工作表連結 / link to other sheet |
| **紅色** | 外部連結 / external workbook link |
| **黃色背景** | 假設值 / assumption cells |

**Iron Law**:
- ❌ 硬編碼數值 + 黑色字體 → 看不出輸入 vs 計算
- ✅ 一律遵循色彩語意 → 任何審計者快速辨識結構

### PPTX Visual QA Loop(蒸餾自 pptx SKILL.md)

```
1. Generate(pptxgenjs / 編輯 OOXML)
   ↓
2. 轉圖像(thumbnail.py + Poppler pdftoppm)
   ↓
3. Subagent 視覺檢查(用 Task tool 啟動 fresh subagent)
   ↓
4. 識別問題(重疊 / 溢位 / 對齊 / 對比)
   ↓
5. 修復 → 重驗(至少 1 次完整 cycle)
```

## 與 phycool-pdf-engine 邊界

| 範圍 | 該用 |
|---|---|
| PhyCool PCPT 列印業務(三角桌牌 / 雙面列印 / Cut Stack) | **phycool-pdf-engine** |
| 通用 PDF 生成 / 表單填充 / OCR / 合併 / 分割 / 浮水印 | **office-tools/references/pdf-guide.md** |
| Word 公文 / 報告 / 履歷 | **office-tools/references/docx-guide.md** |
| Excel 財務模型 / 數據匯出 / 報表 | **office-tools/references/xlsx-guide.md** |
| PowerPoint 簡報 / pitch deck | **office-tools/references/pptx-guide.md** |

**Iron Law**: 觸發 PhyCool 業務 PDF(三角桌牌 / Triangular Tent / Cut Stack / 列印序列)→ **必走 phycool-pdf-engine**,**禁用** office-tools/pdf。

## FORBIDDEN

- ❌ 預先 install 全部 Python 套件(YAGNI;真正觸發才 install)
- ❌ 不檢查依賴就執行 scripts(必先跑 §共用依賴檢查 SOP)
- ❌ XLSX 硬編碼數值 + 黑色字體(違反財務模型色彩標準)
- ❌ PPTX 跳過 visual QA loop(至少 1 次完整 cycle)
- ❌ 觸發 PhyCool 業務 PDF 仍走 office-tools/pdf(必走 phycool-pdf-engine)

## scripts/ 結構(完整複製自 Anthropic skills-main)

```
scripts/
├── docx/                accept_changes.py + comment.py + office/(unpack/pack/soffice/validate + helpers + schemas + validators)
├── xlsx/                recalc.py + office/(共用)
├── pptx/                add_slide.py + clean.py + thumbnail.py + office/(共用)
└── pdf/                 8 個 .py(check / convert / extract / fill / validation_image)
```

scripts/ 內容為 **純檔案**,不執行不消耗 token,真正觸發時用 PowerShell 呼叫(`& py scripts/xlsx/recalc.py file.xlsx`)。
