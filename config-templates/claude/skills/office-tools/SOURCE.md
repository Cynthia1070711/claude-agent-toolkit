# Office Tools — Scripts Source & License Attribution

> `scripts/` 4 子目錄(docx / xlsx / pptx / pdf)完整複製自 **Anthropic skills-main** (`claude token減量策略研究分析/工作流/web-ui-ux/skills-main/skills/{docx,xlsx,pptx,pdf}/scripts/`),**直接使用不重造輪子**。

## License

| 來源 | License |
|---|---|
| Anthropic skills-main `docx/` / `xlsx/` / `pptx/` / `pdf/` | **Proprietary**(Complete terms in LICENSE.txt at toolkit root) |
| ISO-IEC 29500-4:2016 XSD schemas(`scripts/{docx,pptx,xlsx}/office/schemas/ISO-IEC29500-4_2016/`)| **ISO/IEC** 公開規範,XSD 由 Anthropic 整理打包 |
| ECMA-376 OPC schemas(`scripts/{docx,pptx,xlsx}/office/schemas/ecma/fouth-edition/`)| **ECMA International** 公開規範 |
| Microsoft WML extensions(`scripts/{docx,pptx,xlsx}/office/schemas/microsoft/`)| **Microsoft** Open Specification Promise(OSP)|

**Iron Law**: Anthropic skills-main 為官方範本,建議**僅作內部蒸餾學習** + **執行用途**,不直接以原樣對外發布 toolkit 內容。

## Scripts 結構與用途

### `scripts/docx/`
- `accept_changes.py` — LibreOffice 驅動接受 track changes
- `comment.py` — 加 comment 至 .docx
- `office/unpack.py` / `pack.py` — OOXML ZIP 解打包
- `office/soffice.py` — LibreOffice headless 包裝(AF_UNIX socket detect + LD_PRELOAD shim)
- `office/validate.py` — OOXML XSD schema 驗證
- `office/helpers/merge_runs.py` / `simplify_redlines.py` — XML 操作 helpers
- `office/validators/` — base / docx / pptx / redlining validator
- `office/schemas/ISO-IEC29500-4_2016/` — **20+ 個 ISO 標準 XSD**(dml-* / shared-* / pml / sml / vml-* / wml)
- `office/schemas/ecma/fouth-edition/` — OPC contentTypes / coreProperties / digSig / relationships
- `office/schemas/microsoft/` — wml-2010 ~ 2018 / wml-cex / wml-cid / wml-sdtdatahash / wml-symex
- `office/schemas/mce/mc.xsd` — Markup Compatibility extensions
- `templates/` — comments.xml / commentsExtended / commentsExtensible / commentsIds / people.xml

### `scripts/xlsx/`
- `recalc.py` — LibreOffice Basic 巨集驅動公式重算
- `office/` — 共用 soffice / pack / unpack / validate / helpers / schemas(同 docx)

### `scripts/pptx/`
- `add_slide.py` — Unpack 後 slide 插入
- `clean.py` — 移除殘留 / 無用 XML 標籤
- `thumbnail.py` — PIL + 幻燈片網格視覺化(visual QA loop 用)
- `office/` — 共用(同 docx)

### `scripts/pdf/`(8 個 .py)
- `check_bounding_boxes.py` — bbox 驗證
- `check_fillable_fields.py` — 表單欄位驗證
- `convert_pdf_to_images.py` — PDF → JPEG/PNG
- `create_validation_image.py` — 視覺驗證圖
- `extract_form_field_info.py` — 提取 fillable form 結構
- `extract_form_structure.py` — 提取完整 form 結構
- `fill_fillable_fields.py` — 表單欄位自動填充
- `fill_pdf_form_with_annotations.py` — 標註式填充(無 fillable field 的 PDF)

## 使用紀律

### 黑盒原則(來自 Anthropic webapp-testing 哲學)
- ✅ `--help` first 看用法
- ✅ 直接 Black-box 呼叫,不讀 source(scripts 規模大,污染 context)
- ❌ 預先 ingest scripts source 至 context(浪費 token)

### Iron Laws
- ✅ 觸發前先跑 `references/dependency-setup.md` § 環境驗證 SOP
- ✅ Python venv 隔離(`.venv-office`)
- ❌ install 至 system Python
- ❌ 改 OOXML XML 不重 validate.py(可能損毀檔案)
- ❌ 觸發 PhyCool PCPT 列印業務仍用 office-tools/pdf(必走 phycool-pdf-engine)

## 後續維護

當 Anthropic 更新 skills-main 時,重新複製:
```powershell
$SRC = "claude token減量策略研究分析/工作流/web-ui-ux/skills-main/skills"
$DST = ".claude/skills/office-tools/scripts"
Remove-Item $DST -Recurse -Force
Copy-Item "$SRC/docx/scripts" "$DST/docx" -Recurse
# ... 同上 xlsx / pptx / pdf
```

更新後跑 `references/dependency-setup.md` § 環境驗證 SOP 確認相容性。
