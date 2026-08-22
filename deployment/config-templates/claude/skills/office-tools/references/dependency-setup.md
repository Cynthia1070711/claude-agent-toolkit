# Dependency Setup(Windows 11 + PowerShell)

> Lazy graft 模式: 真正觸發特定工具時才 install 對應依賴,避免預先全裝。

## 1. Python venv(共用)

```powershell
py --version          # 預期 ≥ 3.10
py -m venv .venv-office
.\.venv-office\Scripts\Activate.ps1
```

## 2. DOCX

```powershell
pip install python-docx
npm install -g docx          # 創建用
choco install pandoc         # 轉換用
choco install libreoffice-fresh   # accept_changes
```

## 3. XLSX

```powershell
pip install openpyxl pandas
choco install libreoffice-fresh   # formula recalc
```

## 4. PPTX

```powershell
pip install python-pptx "markitdown[all]" Pillow
npm install -g pptxgenjs
choco install poppler             # PDF → image
choco install libreoffice-fresh   # pptx → pdf
```

## 5. PDF

```powershell
pip install pypdf pdfplumber reportlab pdf2image pytesseract Pillow
choco install poppler
choco install qpdf
choco install tesseract

# 繁中語言包(chi_tra.traineddata)
# 下載至 C:\Program Files\Tesseract-OCR\tessdata\
# https://github.com/tesseract-ocr/tessdata/raw/main/chi_tra.traineddata

# 驗證
tesseract --list-langs   # 預期看到 chi_tra
```

## 6. reportlab 中文字體(Noto Sans TC)

```powershell
# 下載 Noto Sans TC TTF
# https://fonts.google.com/noto/specimen/Noto+Sans+TC
# 放至 .\fonts\NotoSansTC-Regular.ttf
```

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('NotoSansTC', 'fonts/NotoSansTC-Regular.ttf'))
```

## 7. 環境驗證 SOP

```powershell
$checks = @(
    @{Name='Python'; Cmd='py --version'},
    @{Name='LibreOffice'; Cmd='soffice --version'},
    @{Name='Poppler'; Cmd='pdftoppm -v'},
    @{Name='Tesseract'; Cmd='tesseract --version'},
    @{Name='Node'; Cmd='node --version'},
    @{Name='pandoc'; Cmd='pandoc --version'},
    @{Name='qpdf'; Cmd='qpdf --version'}
)
foreach ($c in $checks) {
    try {
        $output = Invoke-Expression $c.Cmd 2>&1
        Write-Host "OK $($c.Name): $($output[0])" -ForegroundColor Green
    } catch {
        Write-Host "MISSING $($c.Name)" -ForegroundColor Red
    }
}
```

## 8. Chocolatey 安裝(若未裝)

```powershell
# 系統管理員身分
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

## 9. Iron Laws

- ❌ 預先 install 全部 7 工具(YAGNI)
- ✅ 真正觸發 specific tool 時才 install
- ❌ 不檢查依賴就執行 scripts(silent fail 風險)
- ✅ 觸發前先跑 §7 驗證 SOP
- ✅ venv 隔離(不污染 system Python)
- ❌ install 至 system Python
