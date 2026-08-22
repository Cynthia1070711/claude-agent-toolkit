# DOCX(Word Document)Guide

> 蒸餾自 Anthropic skills-main docx SKILL.md

## 工作流選擇

| 任務 | 工具 | 何時用 |
|---|---|---|
| **從零創建** | docx-js(Node)| 程序化生成,複雜版型 |
| **編輯既有** | Unpack XML → Edit → Repack | 細粒度修改,保留原格式 |
| **讀取 / 分析** | pandoc 或 python-docx | 提取內容 / 轉 markdown |
| **追蹤變更接受** | accept_changes.py(LibreOffice 驅動)| 多人協作後合併 |
| **格式轉換** | .doc → .docx 用 soffice | Legacy 文件升級 |

## 從零創建(docx-js)

```bash
npm install docx
```

```js
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType } from 'docx';
import * as fs from 'fs';

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 } } },   // A4 DXA(twentieths of a point)
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '報告標題', bold: true, size: 32 })],   // size in half-points
      }),
      new Paragraph({
        children: [new TextRun('內文段落...')],
      }),
      new Table({
        rows: [
          new TableRow({ children: [
            new TableCell({ width: { size: 2400, type: 'dxa' }, children: [new Paragraph('A1')] }),
            new TableCell({ width: { size: 2400, type: 'dxa' }, children: [new Paragraph('A2')] }),
          ]}),
        ],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => fs.writeFileSync('out.docx', buf));
```

### Critical Notes(來自 Anthropic docx SKILL.md)

- **Page size**: DXA 單位(1 DXA = 1/1440 inch);A4 = 11906 × 16838
- **Font size**: half-points(11pt = 22)
- **Table width**: 兩種模式(`dxa` 絕對 / `pct` 百分比 * 50)— **同表內必統一**,否則 Word 顯示異常
- **List numbering**: 用 `Numbering` config,避免直接寫「1.」「2.」(失去自動編號)
- **Style override**: section-level vs paragraph-level vs run-level 優先序;run > paragraph > section

## 編輯既有(Unpack XML 工作流)

`.docx` = ZIP 容器,內含:
```
word/
├── document.xml        ← 主內容
├── styles.xml          ← 樣式定義
├── numbering.xml       ← 編號定義
├── theme/theme1.xml
└── _rels/document.xml.rels
[Content_Types].xml
_rels/.rels
```

```bash
py scripts/docx/office/unpack.py input.docx ./unpacked/
# 編輯 unpacked/word/document.xml(XML 標準工具 lxml / etree)
py scripts/docx/office/pack.py ./unpacked/ output.docx
py scripts/docx/office/validate.py output.docx   # 對照 ISO-IEC 29500-4 XSD
```

### Common XML Operations

```python
from lxml import etree

# 命名空間
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

tree = etree.parse('word/document.xml')
root = tree.getroot()

# 找所有段落
for p in root.findall('.//w:p', NS):
    text = ''.join(t.text for t in p.findall('.//w:t', NS) if t.text)
    print(text)

# 新增段落
body = root.find('w:body', NS)
new_p = etree.SubElement(body, f'{{{NS["w"]}}}p')
new_r = etree.SubElement(new_p, f'{{{NS["w"]}}}r')
new_t = etree.SubElement(new_r, f'{{{NS["w"]}}}t')
new_t.text = '新增段落'

tree.write('word/document.xml', xml_declaration=True, encoding='UTF-8', standalone=True)
```

## 讀取 / 分析

### Option A: pandoc(快速轉 markdown / text)
```bash
pandoc input.docx -o output.md
pandoc input.docx -o output.txt
```

### Option B: python-docx(結構化讀取)
```python
from docx import Document
doc = Document('input.docx')
for para in doc.paragraphs:
    print(para.text)
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            print(cell.text)
```

## 追蹤變更接受(accept_changes.py)

```bash
py scripts/docx/accept_changes.py input-with-tracked-changes.docx output-clean.docx
```

底層: LibreOffice headless mode → 接受所有 tracked changes → 儲存。

## 格式轉換(.doc → .docx / .docx → .pdf)

```bash
# .doc → .docx
soffice --headless --convert-to docx --outdir ./out input.doc

# .docx → .pdf
soffice --headless --convert-to pdf --outdir ./out input.docx
```

## OOXML Schema 驗證

```bash
py scripts/docx/office/validate.py output.docx
```

對照 ISO-IEC 29500-4 完整 XSD(scripts/docx/office/schemas/ 內 20+ XSD 檔)。

## 常見陷阱

- ❌ 在文字中直接寫「1.」「2.」當編號 → 失去自動編號功能,改用 numbering definition
- ❌ 表格 width 混用 dxa + pct → Word 顯示異常,**同表必統一**
- ❌ 直接 Unicode subscript / superscript 字元 → 用 `<w:rPr><w:vertAlign w:val="subscript"/></w:rPr>`
- ❌ 改 XML 不重 validate → 可能損毀檔案,**必跑** validate.py
- ❌ 在 Linux / WSL 無 LibreOffice 環境跑 accept_changes.py → 需 install soffice
