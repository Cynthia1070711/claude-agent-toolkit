# PDF Guide(通用 PDF)

> 蒸餾自 Anthropic skills-main pdf SKILL.md
> **邊界**: PhyCool PCPT 列印業務 → **必走 phycool-pdf-engine**

## 工具選擇

| 任務 | 工具 |
|---|---|
| 讀取 / 提取文字 | pypdf / pdfplumber / pdftotext |
| 提取表格 | pdfplumber(DataFrame) |
| 合併 / 分割 | pypdf / qpdf CLI |
| OCR 掃描 PDF | pytesseract + pdf2image |
| 創建 PDF | reportlab(canvas / Platypus) |
| 表單填充 | scripts/pdf/fill_fillable_fields.py |
| 加密 | pypdf encrypt API |
| 浮水印 / 旋轉 | pypdf |
| PDF → 圖像 | pdftoppm / pdf2image |

## pypdf 讀取

```python
from pypdf import PdfReader
reader = PdfReader('input.pdf')
for page in reader.pages:
    print(page.extract_text())
```

## pdfplumber(表格 + 座標)

```python
import pdfplumber
import pandas as pd

with pdfplumber.open('input.pdf') as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            df = pd.DataFrame(table[1:], columns=table[0])
```

## 合併 / 分割

```python
from pypdf import PdfWriter, PdfReader

# 合併
writer = PdfWriter()
for f in ['a.pdf', 'b.pdf']:
    writer.append(f)
writer.write('merged.pdf')

# 分割每頁
reader = PdfReader('input.pdf')
for i, page in enumerate(reader.pages):
    w = PdfWriter()
    w.add_page(page)
    w.write(f'page_{i+1}.pdf')
```

或 qpdf CLI:
```bash
qpdf input.pdf --pages . 1-5 -- output.pdf
qpdf --split-pages input.pdf out_%d.pdf
```

## OCR 掃描 PDF

```python
from pdf2image import convert_from_path
import pytesseract

images = convert_from_path('scanned.pdf', dpi=300)
text = ''
for img in images:
    text += pytesseract.image_to_string(img, lang='chi_tra+eng')
```

依賴: Poppler + Tesseract + chi_tra 語言包。

## 創建(reportlab)

### canvas 底層
```python
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

pdfmetrics.registerFont(TTFont('NotoSansTC', 'NotoSansTC-Regular.ttf'))

c = canvas.Canvas('output.pdf', pagesize=A4)
c.setFont('NotoSansTC', 24)
c.drawString(72, 800, '中文標題')
c.showPage()
c.save()
```

### Platypus 高階
```python
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate('output.pdf')
styles = getSampleStyleSheet()
story = [
    Paragraph('Title', styles['Heading1']),
    Table([['A1', 'B1'], ['A2', 'B2']]),
]
doc.build(story)
```

### Critical Note
- ❌ Unicode subscript / superscript 字元 → 用 `<sub>` / `<super>` tag in Paragraph
- ✅ 中文必先 registerFont

## 表單填充

```bash
# 1. 提取結構
py scripts/pdf/extract_form_field_info.py input.pdf

# 2. 填值
py scripts/pdf/fill_fillable_fields.py input.pdf output.pdf --values values.json

# 3. 標註式(無 fillable field 的 PDF)
py scripts/pdf/fill_pdf_form_with_annotations.py input.pdf output.pdf --annotations ann.json

# 4. 驗證
py scripts/pdf/check_fillable_fields.py output.pdf
py scripts/pdf/check_bounding_boxes.py output.pdf
```

## 加密 / 浮水印 / 旋轉

```python
from pypdf import PdfReader, PdfWriter

# 加密
reader = PdfReader('input.pdf')
writer = PdfWriter(clone_from=reader)
writer.encrypt(user_password='view', owner_password='edit', use_128bit=True)
writer.write('encrypted.pdf')

# 浮水印
content = PdfReader('content.pdf')
watermark = PdfReader('watermark.pdf').pages[0]
writer = PdfWriter()
for page in content.pages:
    page.merge_page(watermark)
    writer.add_page(page)
writer.write('watermarked.pdf')

# 旋轉
reader = PdfReader('input.pdf')
writer = PdfWriter()
for page in reader.pages:
    page.rotate(90)
    writer.add_page(page)
writer.write('rotated.pdf')
```

## PDF → 圖像

```bash
pdftoppm -jpeg -r 200 input.pdf out
```

```python
from pdf2image import convert_from_path
images = convert_from_path('input.pdf', dpi=200, fmt='jpeg')
```

## Boundary 提醒

**Iron Law**: PhyCool 業務 PDF(三角桌牌 / Cut Stack / Triangular Tent / 雙面列印 / 列印序列)→ **必走 phycool-pdf-engine**(QuestPDF + C#),**禁** office-tools/pdf。

office-tools/pdf 涵蓋: 公文 PDF / 表單填充 / OCR 提取 / 合併分割 / 浮水印 / 內部運維文檔。

## Common Pitfalls

- ❌ 中文字體未 register reportlab → 中文顯示空白
- ❌ Tesseract 無 chi_tra 語言包 → OCR 出亂碼
- ❌ pdf2image 無 Poppler → ImportError
- ❌ Unicode subscript 字元 reportlab 渲染方框 → 改用 tag
- ❌ Encrypted PDF 未先 decrypt 就 extract → 失敗
- ❌ 觸發 PhyCool 列印業務仍用 office-tools/pdf → 違反 boundary
