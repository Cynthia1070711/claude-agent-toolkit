# XLSX(Excel Spreadsheet)Guide

> 蒸餾自 Anthropic skills-main xlsx SKILL.md

## 工作流選擇

| 任務 | 工具 |
|---|---|
| 讀取 / 分析(無公式) | pandas |
| 創建 / 編輯(有公式) | openpyxl |
| 公式重新計算 | LibreOffice 巨集(recalc.py) |
| 大型 / 複雜模型 | openpyxl + 結構化 module |

## 財務模型色彩標準(Iron Law)

| 色彩 | 語意 | openpyxl `Font` |
|---|---|---|
| 藍色 | 使用者輸入 | `Font(color='0000FF')` |
| 黑色 | 公式 / 計算 | `Font(color='000000')`(預設) |
| 綠色 | 工作表連結 | `Font(color='008000')` |
| 紅色 | 外部連結 | `Font(color='FF0000')` |
| 黃色背景 | 假設 / 可調參數 | `PatternFill(start_color='FFFF00', fill_type='solid')` |

任何審計者 / 同事可在 5 秒內辨識模型結構。

## 數字格式

| 類型 | format_code |
|---|---|
| 貨幣 | `'#,##0_);[Red](#,##0)'` 或 `'"NT$"#,##0'` |
| 百分比 | `'0.00%'` |
| 倍數 | `'0.00"x"'` |
| 年份 | `'0'` |
| 日期 | `'yyyy-mm-dd'` |
| 千分位 | `'#,##0'` |

## openpyxl 範例

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

wb = Workbook()
ws = wb.active

# Input(藍色)
ws['B2'] = 1000
ws['B2'].font = Font(color='0000FF')
ws['B2'].number_format = '#,##0'

# Assumption(黃底)
ws['B3'] = 0.5
ws['B3'].font = Font(color='0000FF')
ws['B3'].fill = PatternFill(start_color='FFFF00', fill_type='solid')
ws['B3'].number_format = '0%'

# Formula(黑色,預設)
ws['C2'] = '=B2*(1+B3)'

# Cross-sheet link(綠色)
ws['D2'] = "='Sheet2'!A1"
ws['D2'].font = Font(color='008000')

wb.save('model.xlsx')
```

## 公式重新計算

openpyxl 不執行公式 — 寫入後讀取仍是 string。需 LibreOffice 重算:

```bash
py scripts/xlsx/recalc.py input.xlsx output.xlsx
```

底層執行 LibreOffice Basic 巨集 `ThisComponent.calculateAll() + store()`。

## 讀取(pandas)

```python
import pandas as pd
df = pd.read_excel('input.xlsx', sheet_name='Sheet1')
sheets = pd.read_excel('input.xlsx', sheet_name=None)  # 全 sheet
```

## 條件式格式

```python
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule
rule = ColorScaleRule(start_type='min', start_color='FFFFFF',
                     mid_type='percentile', mid_value=50, mid_color='FFEB84',
                     end_type='max', end_color='63BE7B')
ws.conditional_formatting.add('B2:D10', rule)
```

## Common Pitfalls

- ❌ 寫入公式後立即讀回(openpyxl 不算)→ 必走 recalc.py
- ❌ 數字未設 number_format → 顯示 raw `1234567`
- ❌ Boolean 寫入後讀為 string `'TRUE'`(non-data_only mode)
- ❌ 日期不用 datetime 物件 → 顯示 serial number
- ❌ Merged cells 寫入非左上角 → 內容遺失
- ❌ 硬編碼數值 + 黑色字體 → 違反財務模型色彩標準
