#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * generate-db-schema-doc.cjs — PhyCool SaaS DB schema 生成式文檔工具
 * ============================================================================
 * 資料源 (Source of Truth):
 *   src/YourApp/Web/Data/Migrations/ApplicationDbContextModelSnapshot.cs
 *   ^ EF Core fluent-API model snapshot — 描述 PhyCool SaaS 的 Microsoft SQL Server
 *     (Azure SQL) schema。對齊 database-schema.md L12 自標 SSoT。
 *
 *   ⚠ 本工具「絕不」讀取 .context-db/phycool.db —— 那是開發環境 Context Memory
 *     的 SQLite,與 SaaS 業務 schema 完全無關 (其 cheatsheet 為
 *     .claude/skills/phycool-context-memory/references/db-schema.md,另一檔)。
 *     pipeline_notes 曾誤指該檔,create-story AC-2 已糾正,dev 階段嚴禁讀取。
 *
 * 用途:
 *   解析 ModelSnapshot fluent API,提取每個 entity 的
 *     table / schema / columns(name/type/maxLength/nullable) / PK / indexes / FK,
 *   輸出 table-per-entity markdown,按 dbo / Identity / Commerce / System schema 分組。
 *   (格式對齊既有 database-schema.md §2 + phycool-sqlserver references/schema-inventory.md)
 *
 * CLI:
 *   node scripts/generate-db-schema-doc.cjs                 # markdown → stdout
 *   node scripts/generate-db-schema-doc.cjs --out out.md    # markdown → 檔案
 *   node scripts/generate-db-schema-doc.cjs --json          # 結構化 JSON → stdout (供交叉校驗)
 *   node scripts/generate-db-schema-doc.cjs --summary       # 只印統計
 *   node scripts/generate-db-schema-doc.cjs --snapshot <p>  # 覆寫資料源路徑
 *
 * Story: doc-database-schema-v5 (T1/T2/T3 · AC-2)
 * ============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

// --- 預設資料源 (相對本 script 向上一層 = repo root) ---
const DEFAULT_SNAPSHOT = path.join(
  __dirname,
  '..',
  'src',
  'PhyCool.Platform',
  'PhyCool.Web',
  'Data',
  'Migrations',
  'ApplicationDbContextModelSnapshot.cs'
);

// EF Core fluent-API 中以 value type 出現 (snapshot 不寫 nullable 包裝者預設 NOT NULL)。
// reference type (string / byte[] / 其他類別) 預設 nullable,除非 .IsRequired()。
const VALUE_TYPES = new Set([
  'int', 'long', 'short', 'byte', 'sbyte', 'uint', 'ulong', 'ushort',
  'bool', 'char', 'double', 'float', 'decimal',
  'Guid', 'DateTime', 'DateTimeOffset', 'TimeSpan', 'DateOnly', 'TimeOnly',
]);

// schema 顯示順序 (對齊 database-schema.md §1.2 分類)
const SCHEMA_ORDER = ['dbo', 'Identity', 'Commerce', 'System'];

// ============================================================================
// 低階解析器 (brace / paren / string aware) — EF snapshot 是規則化輸出,
// 但 ToTable(..., t => { t.HasCheckConstraint("...", "[Col] IN (...)"); }) 的
// lambda 內含 ';' 與 '()' ,因此必須 depth-aware,不能單純 split(';').
// ============================================================================

/** 從 openIdx 指向的 '{' 找對應的 '}' (處理字串字面值與 escape)。回傳 '}' 的 index。 */
function findMatchingBrace(src, openIdx) {
  let depth = 0;
  let inStr = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 把 entity block body 切成 top-level statements (depth-aware,以 ';' 分隔)。 */
function splitStatements(body) {
  const out = [];
  let cur = '';
  let dParen = 0;
  let dBrace = 0;
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      cur += c;
      if (c === '\\') { i++; if (i < body.length) cur += body[i]; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; cur += c; continue; }
    if (c === '(') dParen++;
    else if (c === ')') dParen--;
    else if (c === '{') dBrace++;
    else if (c === '}') dBrace--;
    if (c === ';' && dParen === 0 && dBrace === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** 抽出所有頂層 modelBuilder.Entity("FQN", b => { ... }) block。 */
function extractEntityBlocks(src) {
  const blocks = [];
  const re = /modelBuilder\.Entity\("([^"]+)",\s*b\s*=>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const fqn = m[1];
    let i = re.lastIndex;
    while (i < src.length && src[i] !== '{') i++;
    if (i >= src.length) break;
    const end = findMatchingBrace(src, i);
    if (end < 0) break;
    blocks.push({ fqn, body: src.slice(i + 1, end) });
    re.lastIndex = end;
  }
  return blocks;
}

/** 從 quoted 列表字串 (如 `"A", "B"`) 取出所有字面值。 */
function extractQuoted(s) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[1]);
  return out;
}

// ============================================================================
// statement 級解析
// ============================================================================

/** 解析 b.Property<T>("Name")....。回傳 column 物件,非 property statement 回傳 null。 */
function parseProperty(stmt) {
  const head = stmt.match(/^b\.Property<([^>]+)>\("([^"]+)"\)/);
  if (!head) return null;
  const rawType = head[1].trim();
  const name = head[2];

  const colType = (stmt.match(/\.HasColumnType\("([^"]+)"\)/) || [])[1] || null;
  const maxLenM = stmt.match(/\.HasMaxLength\((\d+)\)/);
  const maxLength = maxLenM ? parseInt(maxLenM[1], 10) : null;
  const isRequired = /\.IsRequired\(\)/.test(stmt);
  const valueGenerated = /\.ValueGeneratedOnAdd\(\)/.test(stmt);
  const concurrency = /\.IsConcurrencyToken\(\)/.test(stmt);
  const rowVersion = /\.IsRowVersion\(\)/.test(stmt);
  const defM = stmt.match(/\.HasDefaultValueSql\("([^"]*)"\)/)
    || stmt.match(/\.HasDefaultValue\(([^)]*)\)/);
  const defaultVal = defM ? defM[1] : null;

  // nullable 判定 (EF Core 語意)
  const isNullableType = rawType.endsWith('?');
  const baseType = rawType.replace(/\?$/, '');
  let nullable;
  if (isNullableType) {
    nullable = true;
  } else if (isRequired) {
    nullable = false;
  } else if (VALUE_TYPES.has(baseType)) {
    nullable = false; // value type 預設 NOT NULL
  } else {
    nullable = true; // reference type 無 IsRequired → nullable
  }

  return {
    name,
    clrType: rawType,
    sqlType: colType,
    maxLength,
    nullable,
    valueGenerated,
    concurrency,
    rowVersion,
    defaultVal,
    isIdentity: false, // 後續由 UseIdentityColumn statement 補標
  };
}

/** 解析 b.HasKey("A", "B")。回傳 PK column 名陣列,非 HasKey 回傳 null。 */
function parsePrimaryKey(stmt) {
  if (!/^b\.HasKey\(/.test(stmt)) return null;
  return extractQuoted(stmt);
}

/** 解析 b.HasIndex(...)。回傳 index 物件,非 HasIndex 回傳 null。 */
function parseIndex(stmt) {
  if (!/^b\.HasIndex\(/.test(stmt)) return null;
  // HasIndex 的 column 在第一個 () 內 (具名 index: HasIndex(new[]{"A","B"}, "IxName") 也涵蓋)
  const headM = stmt.match(/^b\.HasIndex\(([^)]*)\)/);
  const cols = headM ? extractQuoted(headM[1]) : [];
  // 具名 index 第二參數 (非 new[] 形態時) 會被一併抓進 cols;以 HasDatabaseName 為準較可靠
  const dbName = (stmt.match(/\.HasDatabaseName\("([^"]+)"\)/) || [])[1] || null;
  const unique = /\.IsUnique\(\)/.test(stmt);
  const filter = (stmt.match(/\.HasFilter\("((?:[^"\\]|\\.)*)"\)/) || [])[1] || null;
  return { cols, unique, filter, dbName, include: [] };
}

/**
 * 解析 b.ToTable("Name", schema)。回傳 {table, schema},非 ToTable 回傳 null。
 * 涵蓋四種 schema 寫法:
 *   1. (string)null          → dbo
 *   2. null (裸,有 lambda 第三參數時 EF 輸出此形態) → dbo
 *   3. "SchemaName"          → 指定 schema
 *   4. 單參數 b.ToTable("Name") → dbo
 */
function parseToTable(stmt) {
  const m = stmt.match(/^b\.ToTable\("([^"]+)"\s*,\s*(\(string\)null|null|"([^"]+)")/);
  if (!m) {
    // 單參數 b.ToTable("Name") (sharing table / 無 schema) — 視為 dbo
    const single = stmt.match(/^b\.ToTable\("([^"]+)"\)/);
    if (single) return { table: single[1], schema: 'dbo' };
    return null;
  }
  const table = m[1];
  const isNullSchema = m[2] === '(string)null' || m[2] === 'null';
  const schema = isNullSchema ? 'dbo' : m[3];
  return { table, schema };
}

/** 解析 relationship 區 b.HasOne("Target", ...).HasForeignKey("Col")...。回傳 FK 物件或 null。 */
function parseForeignKey(stmt) {
  if (!/^b\.HasOne\(/.test(stmt)) return null;
  const targetM = stmt.match(/^b\.HasOne\("([^"]+)"/);
  // HasForeignKey 形態:1:N = ("Col") 單參數(欄位名);1:1 = ("DependentEntityFQN", "Col")
  // 第一參數為 dependent entity FQN(含 '.');複合 = ("ColA", "ColB")。取所有 quoted 參數,
  // 過濾掉含 '.' 的 FQN(EF 1:1 snapshot 形態),其餘為 FK 欄位 — 修正 1:1 關係 FK 漏抓
  // (Invoice.OrderId / ProductFeature.ProductId / ProjectData.ProjectId 等,CR-F2)。
  const fkArgsM = stmt.match(/\.HasForeignKey\(([^)]*)\)/);
  const fkCols = fkArgsM ? extractQuoted(fkArgsM[1]).filter((q) => !q.includes('.')) : [];
  const principalM = stmt.match(/\.HasPrincipalKey\("([^"]+)"\)/);
  const onDelete = (stmt.match(/\.OnDelete\(DeleteBehavior\.(\w+)\)/) || [])[1] || null;
  const required = /\.IsRequired\(\)/.test(stmt);
  return {
    target: targetM ? targetM[1] : null,
    column: fkCols.length ? fkCols.join(', ') : (principalM ? principalM[1] : null),
    onDelete,
    required,
  };
}

/** 解析 IncludeProperties(b.HasIndex("A"), new[] { "B", "C" }) → {anchorCols, includeCols}。 */
function parseIncludeProperties(stmt) {
  if (!/IncludeProperties\(/.test(stmt)) return null;
  const anchorM = stmt.match(/HasIndex\(([^)]*)\)/);
  const anchorCols = anchorM ? extractQuoted(anchorM[1]) : [];
  const arrM = stmt.match(/new\[\]\s*\{([^}]*)\}/);
  const includeCols = arrM ? extractQuoted(arrM[1]) : [];
  return { anchorCols, includeCols };
}

// ============================================================================
// 高階模型組裝
// ============================================================================

function shortName(fqn) {
  // Microsoft.AspNetCore.Identity.IdentityUserToken<string> → IdentityUserToken<string>
  // PhyCool.Web.Models.ApplicationUser → ApplicationUser
  const parts = fqn.split('.');
  return parts[parts.length - 1];
}

/** 解析整份 snapshot → entity map (FQN → entity)。 */
function buildModel(src) {
  const blocks = extractEntityBlocks(src);
  const entitiesByFqn = new Map();
  let entityOccurrences = 0;

  for (const { fqn, body } of blocks) {
    entityOccurrences++;
    let ent = entitiesByFqn.get(fqn);
    if (!ent) {
      ent = {
        fqn,
        name: shortName(fqn),
        table: null,
        schema: null,
        columns: [],
        columnIndex: new Map(),
        primaryKey: [],
        indexes: [],
        foreignKeys: [],
        blockCount: 0,
      };
      entitiesByFqn.set(fqn, ent);
    }
    ent.blockCount++;

    const stmts = splitStatements(body);
    for (const stmt of stmts) {
      // 定義區
      const prop = parseProperty(stmt);
      if (prop) {
        if (!ent.columnIndex.has(prop.name)) {
          ent.columns.push(prop);
          ent.columnIndex.set(prop.name, prop);
        }
        continue;
      }
      const inc = parseIncludeProperties(stmt);
      if (inc) {
        // 套用 include 至對應 index (匹配 anchorCols)
        const tgt = ent.indexes.find((ix) =>
          ix.cols.length === inc.anchorCols.length
          && ix.cols.every((c, i) => c === inc.anchorCols[i]));
        if (tgt) tgt.include = inc.includeCols;
        continue;
      }
      if (/UseIdentityColumn\(/.test(stmt)) {
        const idM = stmt.match(/Property<[^>]+>\("([^"]+)"\)/);
        if (idM && ent.columnIndex.has(idM[1])) {
          ent.columnIndex.get(idM[1]).isIdentity = true;
        }
        continue;
      }
      const pk = parsePrimaryKey(stmt);
      if (pk) { ent.primaryKey = pk; continue; }
      const ix = parseIndex(stmt);
      if (ix) { ent.indexes.push(ix); continue; }
      const tt = parseToTable(stmt);
      if (tt) { ent.table = tt.table; ent.schema = tt.schema; continue; }
      // relationship 區
      const fk = parseForeignKey(stmt);
      if (fk && fk.column) { ent.foreignKeys.push(fk); continue; }
    }
  }

  // PK ⇒ NOT NULL:SQL Server PRIMARY KEY 隱含 NOT NULL。EF snapshot 對 string(reference
  // type)PK 不寫 .IsRequired(),parseProperty 預設判 nullable=true 會誤標 PK 為 NULL。
  // 此處以 SQL 不變量校正(PK 成員一律 NOT NULL),對齊實際 migration 生成的 schema(CR-F1)。
  for (const ent of entitiesByFqn.values()) {
    if (!ent.primaryKey.length) continue;
    const pkSet = new Set(ent.primaryKey);
    for (const col of ent.columns) {
      if (pkSet.has(col.name)) col.nullable = false;
    }
  }

  return { entitiesByFqn, entityOccurrences };
}

// ============================================================================
// Markdown 輸出
// ============================================================================

function colTypeDisplay(col) {
  if (col.sqlType) return col.sqlType;
  if (col.clrType) return `(${col.clrType})`;
  return '—';
}

function renderTableSection(ent, h4 = '####') {
  const pkSet = new Set(ent.primaryKey);
  const fkByCol = new Map();
  for (const fk of ent.foreignKeys) {
    if (fk.column) fkByCol.set(fk.column, fk);
  }
  const lines = [];
  lines.push(`${h4} \`${ent.schema}.${ent.table}\` (${ent.name})`);
  lines.push('');
  lines.push('| 欄位 | 型別 | MaxLen | Null | Key |');
  lines.push('|------|------|:------:|:----:|:---:|');
  for (const col of ent.columns) {
    const keyTags = [];
    if (pkSet.has(col.name)) keyTags.push('PK');
    if (fkByCol.has(col.name)) keyTags.push('FK');
    if (col.isIdentity) keyTags.push('IDENTITY');
    const maxLen = col.maxLength != null ? String(col.maxLength) : '';
    const nullTag = col.nullable ? 'NULL' : 'NOT NULL';
    lines.push(
      `| ${col.name} | ${colTypeDisplay(col)} | ${maxLen} | ${nullTag} | ${keyTags.join(' ')} |`
    );
  }
  lines.push('');

  // PK 摘要
  if (ent.primaryKey.length) {
    lines.push(`- **PK**: (${ent.primaryKey.join(', ')})`);
  }
  // Index 摘要
  for (const ix of ent.indexes) {
    const parts = [];
    parts.push(`(${ix.cols.join(', ')})`);
    if (ix.unique) parts.push('UNIQUE');
    if (ix.dbName) parts.push(`name=${ix.dbName}`);
    if (ix.include && ix.include.length) parts.push(`INCLUDE(${ix.include.join(', ')})`);
    if (ix.filter) parts.push(`FILTER: ${ix.filter}`);
    lines.push(`- **Index**: ${parts.join(' ')}`);
  }
  // FK 摘要
  for (const fk of ent.foreignKeys) {
    const tgt = shortName(fk.target || '');
    const od = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
    lines.push(`- **FK**: ${fk.column} → ${tgt}${od}`);
  }
  lines.push('');
  return lines.join('\n');
}

function groupBySchema(entities) {
  const groups = new Map();
  for (const ent of entities) {
    if (!ent.table) continue; // 無 ToTable → 非獨立 table (理論上不應發生)
    const s = ent.schema || 'dbo';
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(ent);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.table.localeCompare(b.table));
  }
  return groups;
}

function renderMarkdown(model, { embed = false } = {}) {
  // embed=true: 供嵌入 database-schema.md generated-region,heading 降一級
  const H1 = embed ? '##' : '#';
  const H2 = embed ? '###' : '##';
  const H4 = embed ? '####' : '###';
  const entities = [...model.entitiesByFqn.values()];
  const tableEntities = entities.filter((e) => e.table);
  const groups = groupBySchema(tableEntities);

  const out = [];
  out.push('<!-- AUTO-GENERATED — DO NOT EDIT BY HAND -->');
  out.push('<!-- 生成式來源: scripts/generate-db-schema-doc.cjs ← ApplicationDbContextModelSnapshot.cs -->');
  out.push(`<!-- 重生指令: node scripts/generate-db-schema-doc.cjs -->`);
  out.push('');
  out.push(`${H1} ApplicationDbContext Schema Inventory (machine-generated)`);
  out.push('');
  out.push('> **資料源 (SSoT)**: `src/YourApp/Web/Data/Migrations/ApplicationDbContextModelSnapshot.cs`');
  out.push('> (EF Core fluent-API · Microsoft SQL Server / Azure SQL · **非** `.context-db/phycool.db`)');
  out.push('> **重生指令**: `node scripts/generate-db-schema-doc.cjs`');
  out.push('');

  // 統計
  const schemaCounts = SCHEMA_ORDER
    .map((s) => `${s}: ${(groups.get(s) || []).length}`)
    .concat(
      [...groups.keys()]
        .filter((s) => !SCHEMA_ORDER.includes(s))
        .map((s) => `${s}: ${groups.get(s).length}`)
    );
  out.push(`${H2} 統計 (Statistics)`);
  out.push('');
  out.push(`- \`modelBuilder.Entity(\` 出現數: **${model.entityOccurrences}** (定義區 + relationship 區,對齊 \`grep -c "modelBuilder.Entity("\`)`);
  out.push(`- distinct entities (tables): **${tableEntities.length}**`);
  out.push(`- 每 schema 表數: ${schemaCounts.join(' · ')}`);
  out.push('');

  const orderedSchemas = SCHEMA_ORDER
    .filter((s) => groups.has(s))
    .concat([...groups.keys()].filter((s) => !SCHEMA_ORDER.includes(s)));

  for (const s of orderedSchemas) {
    const list = groups.get(s);
    out.push(`${H2} ${s} Schema (${list.length} tables)`);
    out.push('');
    for (const ent of list) {
      out.push(renderTableSection(ent, H4));
    }
  }

  return out.join('\n');
}

function buildJson(model) {
  const entities = [...model.entitiesByFqn.values()].filter((e) => e.table);
  return {
    source: 'ApplicationDbContextModelSnapshot.cs',
    entityOccurrences: model.entityOccurrences,
    tableCount: entities.length,
    tables: entities.map((e) => ({
      entity: e.name,
      fqn: e.fqn,
      schema: e.schema,
      table: e.table,
      primaryKey: e.primaryKey,
      columns: e.columns.map((c) => ({
        name: c.name,
        sqlType: c.sqlType,
        clrType: c.clrType,
        maxLength: c.maxLength,
        nullable: c.nullable,
        identity: c.isIdentity,
      })),
      indexes: e.indexes.map((ix) => ({
        cols: ix.cols, unique: ix.unique, dbName: ix.dbName, include: ix.include, filter: ix.filter,
      })),
      foreignKeys: e.foreignKeys.map((fk) => ({
        column: fk.column, target: shortName(fk.target || ''), onDelete: fk.onDelete,
      })),
    })),
  };
}

// ============================================================================
// generated-region 注入 (AC-3 — 把 machine-generated schema 寫進 database-schema.md
// 的 BEGIN/END marker 之間,讓「生成式治本」閉環:schema 變更後重跑即同步文檔)
// ============================================================================

const GEN_BEGIN = '<!-- BEGIN GENERATED SCHEMA — generate-db-schema-doc.cjs (DO NOT EDIT THIS REGION) -->';
const GEN_END = '<!-- END GENERATED SCHEMA -->';

function injectIntoDoc(docPath, generated) {
  if (!fs.existsSync(docPath)) {
    console.error(`[ERROR] 找不到目標文檔: ${docPath}`);
    process.exit(1);
  }
  // normalize BOM (marker 偵測穩健;CRLF 不影響 indexOf,寫回保留原行尾風格)
  const raw = fs.readFileSync(docPath, 'utf8').replace(/^﻿/, '');
  const bi = raw.indexOf(GEN_BEGIN);
  const ei = raw.indexOf(GEN_END);
  if (bi < 0 || ei < 0) {
    console.error('[ERROR] 目標文檔缺 generated-region marker。請先在文檔加入下列兩行包夾的區段:');
    console.error(`  ${GEN_BEGIN}`);
    console.error(`  ${GEN_END}`);
    process.exit(1);
  }
  if (ei < bi) {
    console.error('[ERROR] END marker 出現在 BEGIN marker 之前,marker 順序錯誤');
    process.exit(1);
  }
  // 保留原檔行尾風格 (database-schema.md = CRLF),避免 mixed line ending git 噪音
  const isCRLF = /\r\n/.test(raw);
  const EOL = isCRLF ? '\r\n' : '\n';
  const gen = isCRLF ? generated.replace(/\n/g, '\r\n') : generated;
  const before = raw.slice(0, bi + GEN_BEGIN.length);
  const after = raw.slice(ei);
  const newDoc = `${before}${EOL}${EOL}${gen}${EOL}${EOL}${after}`;
  fs.writeFileSync(docPath, newDoc, 'utf8'); // .md = UTF-8 No-BOM (Node 預設)
  return true;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(argv) {
  const args = { out: null, json: false, summary: false, embed: false, inject: null, snapshot: DEFAULT_SNAPSHOT };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--summary') args.summary = true;
    else if (a === '--embed') args.embed = true;
    else if (a === '--inject') args.inject = argv[++i];
    else if (a === '--snapshot') args.snapshot = argv[++i];
    else if (a === '--help' || a === '-h') { args.help = true; }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scripts/generate-db-schema-doc.cjs [options]');
    console.log('  (no option)        markdown → stdout (standalone, # H1)');
    console.log('  --out <path>       markdown → 檔案');
    console.log('  --embed            markdown 降一級 heading (供嵌入文檔 generated-region)');
    console.log('  --inject <doc>     將 generated schema 注入 <doc> 的 BEGIN/END marker 之間');
    console.log('  --json             結構化 JSON → stdout (供交叉校驗)');
    console.log('  --summary          只印統計 (entity 數 / 各 schema 表數)');
    console.log('  --snapshot <path>  覆寫資料源 (預設 ApplicationDbContextModelSnapshot.cs)');
    process.exit(0);
  }

  if (!fs.existsSync(args.snapshot)) {
    console.error(`[ERROR] 找不到資料源: ${args.snapshot}`);
    console.error('        本工具資料源 = ApplicationDbContextModelSnapshot.cs (非 .context-db/phycool.db)');
    process.exit(1);
  }

  const src = fs.readFileSync(args.snapshot, 'utf8');
  const model = buildModel(src);
  const tableEntities = [...model.entitiesByFqn.values()].filter((e) => e.table);

  if (args.summary) {
    const groups = groupBySchema(tableEntities);
    console.error(`modelBuilder.Entity( occurrences: ${model.entityOccurrences}`);
    console.error(`distinct entities (tables): ${tableEntities.length}`);
    for (const s of SCHEMA_ORDER) {
      console.error(`  ${s}: ${(groups.get(s) || []).length}`);
    }
    process.exit(0);
  }

  if (args.inject) {
    const generated = renderMarkdown(model, { embed: true });
    injectIntoDoc(args.inject, generated);
    console.error(`[OK] 已注入 generated-region 至 ${args.inject} (${tableEntities.length} tables, ${model.entityOccurrences} entity occurrences)`);
    process.exit(0);
  }

  let output;
  if (args.json) {
    output = JSON.stringify(buildJson(model), null, 2);
  } else {
    output = renderMarkdown(model, { embed: args.embed });
  }

  if (args.out) {
    fs.writeFileSync(args.out, output, 'utf8');
    console.error(`[OK] 已寫入 ${args.out} (${tableEntities.length} tables, ${model.entityOccurrences} entity occurrences)`);
  } else {
    process.stdout.write(output + '\n');
  }
}

main();
