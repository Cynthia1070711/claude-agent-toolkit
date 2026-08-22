# Khoj 3 純邏輯蒸餾 — RecursiveCharacterTextSplitter + hashed_value MD5 dedup + DateFilter

> **建立**: 2026-05-22(Stage α Phase 3 · Q4 提前 α 授權)
> **來源**: khoj-master(Khoj AI 個人助理開源專案)
> **License 策略**: 整包 REJECT(AGPL-3.0 viral)· 純邏輯蒸餾 algorithm idea(non-copyrightable)
> **對應 ADR**: [ADR-KHOJ-CHUNKING-001](../../../../docs/technical-decisions/ADR-KHOJ-CHUNKING-001-khoj-3-pure-logic-distillation.md)
> **目的**: 為 PhyCool Context Memory DB chunking / dedup / date filter 提供未來改進方向(Stage β/γ 落地)

---

## §A · RecursiveCharacterTextSplitter 階層式切塊

### Source(algorithm idea level only)

`khoj-master/src/khoj/processor/content/text_to_entries.py` L72-75:
```python
# Source: Khoj AGPL-3.0(idea reference,non-copyrightable)
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=max_tokens,
    separators=["\n\n", "\n", "!", "?", ".", " ", "\t", ""],
    keep_separator=True,
)
```

### Algorithm

依優先級階層嘗試 separator:
1. `\n\n`(雙換行,段落邊界)— 最理想
2. `\n`(單換行,軟段落)
3. `!` / `?` / `.`(句末標點)
4. ` `(空白,單字邊界)
5. `\t`(Tab)
6. `""`(字元級硬切)— 最後手段

### PhyCool 現況 vs 改進方向

| 項目 | 現況 | 改進方向 |
|:----|:----|:----|
| 切塊工具 | `incremental-embed.js` 簡單字元數切塊 | 階層 separator |
| zh-TW 標點 | 未對齊 | `["\n\n", "\n", "。", "!", "?", ",", "、", " ", "\t", ""]` |
| 段落保留 | 不保證 | `keep_separator=true` 保留段落邊界 |

⚠️ **繁中標點**: PhyCool 為 zh-TW 專案,separator 必含繁中標點(對齊 `traditional-chinese-discipline.md` CRITICAL)。

---

## §B · hashed_value MD5 Chunk-Level Dedup Pattern

### Source(algorithm idea level only)

`khoj-master/src/khoj/processor/content/text_to_entries.py` L172-220:
```python
# Source: Khoj AGPL-3.0(idea reference,non-copyrightable)
# L172-175: query 既存 hashes(set 差集計算)
existing_entries = DbEntry.objects.filter(
    user=user, hashed_value__in=hashes_for_file, file_type=file_type
)
existing_entry_hashes = set([entry.hashed_value for entry in existing_entries])
hashes_to_process |= hashes_for_file - existing_entry_hashes

# L220: 寫入新 entry
hashed_value=entry_hash

# L254: 刪除已不存在的 chunks
EntryAdapters.delete_entry_by_hash(user, hashed_values=list(to_delete_entry_hashes))
```

### Algorithm

Chunk-level dedup 三步驟:
1. **新文件進來** → 計算所有 chunks 的 MD5/SHA-1 hash
2. **SQL `WHERE hashed_value IN (...)` 查既存** → set 差集得「真正新增」chunks
3. **新 hash → embed + insert / 既存 hash → skip / 既存但已不在當前 = 已刪除 → delete**

### PhyCool 現況 vs 改進方向

| 項目 | 現況 | 改進方向 |
|:----|:----|:----|
| dedup 級別 | file-level(`embedding_queue.processed`) | chunk-level(`content_hash` per chunk) |
| 重 embed | 小幅 edit 整 file re-embed | 只 embed 真正新增的 chunks |
| 既存欄位 | `symbol_embeddings.content_hash` 已部分對齊 | 擴展到 `context_entries` 入庫流程 |

⚠️ **PRAGMA verify first**: 改 schema 前必 `PRAGMA table_info('context_entries')` verify 既有欄位(對齊 `context-memory.md` §DB Schema-First Mandate)。

---

## §C · DateFilter — `dt:"yesterday"` 自然語言語法

### Source(algorithm idea level only)

`khoj-master/src/khoj/search_filter/date_filter.py` L18-120:
```python
# Source: Khoj AGPL-3.0(idea reference,non-copyrightable)
class DateFilter(BaseFilter):
    # query syntax: dt>="yesterday" / dt<"tomorrow" / dt:"2 years ago"
    date_regex = r"dt([:><=]{1,2})[\"'](.*?)[\"']"

    def compile_date_regexes(self):
        # 22 regex 涵蓋 structured + natural dates
        # structured: 2024-04-01 / 01/04/2024 / 01.04.2024
        # natural: 1st April 2024 / Apr 1, 2024 / January 2024
        ...

    def get_filter_terms(self, query):
        return [f"dt{item[0]}'{item[1]}'" for item in re.findall(self.date_regex, query)]
```

### Algorithm

支援 query syntax: `dt>="yesterday"` / `dt<"tomorrow"` / `dt:"2 years ago"`:
1. **Regex 偵測** `dt([:><=]{1,2})["'](...)["']` query
2. **dateparser** 解析自然語言日期(yesterday / 2 weeks ago)
3. **22 strptime 格式** 涵蓋 structured + natural dates(支援多 locale)
4. **應用 date range filter** 到 search results

### PhyCool 現況 vs 改進方向

| 項目 | 現況 | 改進方向 |
|:----|:----|:----|
| date 參數 | `search_context({timestamp_from, timestamp_to})` ISO8601 string | natural language(「昨天」「上週」「2 個月前」) |
| zh-TW 支援 | 無 | `dateparser` 支援 zh-Hant locale |
| query syntax | 程式碼參數 | `dt:"昨天"` 內嵌語法 |

⚠️ **UTC+8 對齊**: PhyCool timestamp 為 UTC+8(對齊 `constitutional-standard.md` §Timestamp Mandate),解析「昨天」必走 `Asia/Taipei` timezone。

---

## License Compliance

| 項目 | 內容 |
|:----|:----|
| **來源 License** | AGPL-3.0(viral copyleft) |
| **整包採用** | ❌ REJECT(法務風險) |
| **蒸餾範圍** | algorithm idea level(non-copyrightable) |
| **PhyCool 實作** | Node.js + SQL 重新實作,**0 line code 直接 copy** |
| **驗證** | 上述 §A §B §C 章節僅以 Python pseudocode 註解「Source: ...」說明算法靈感,實作走 PhyCool 重寫 |

完整法務分析見 [ADR-KHOJ-CHUNKING-001](../../../../docs/technical-decisions/ADR-KHOJ-CHUNKING-001-khoj-3-pure-logic-distillation.md)。

---

## 後續 Stage β/γ 落地路線

| Stage | 動作 | 預估複雜度 |
|:----:|:----|:----:|
| β | §A zh-TW 階層切塊 → `incremental-embed.js` | M |
| β | §B chunk-level MD5 dedup → `context_entries` 入庫 | M |
| γ | §C natural language date parser → `search_context` | S |

對齊 Q4 提前 α 授權:本 reference 為 Stage α deliverable(知識蒸餾),實作落地 defer 至 β/γ。
