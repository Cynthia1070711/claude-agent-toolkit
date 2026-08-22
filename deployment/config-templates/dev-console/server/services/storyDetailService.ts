// ============================================================
// storyDetailService.ts — Story 詳情 + Markdown 檔案讀取
// DVS-06 AC-5: 路徑遍歷防護 + 檔案讀取
// 路徑遍歷防護：path.resolve + startsWith(PROJECT_ROOT)
// ============================================================
import fs from 'fs';
import path from 'path';
import { getDb } from '../db.js';
import { config } from '../config.js';

// ── 型別定義 ──────────────────────────────────────────────────

export interface StoryDetailRecord {
  story_id: string;
  epic_id: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  complexity: string | null;
  source_file: string | null;
}

export interface StoryContentResult {
  content: string | null;
  error?: string;
  story: StoryDetailRecord | null;
}

// ── 路徑遍歷防護 ──────────────────────────────────────────────

function isSafePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const projectRoot = path.resolve(config.projectRoot);
  return resolved.startsWith(projectRoot + path.sep) || resolved.startsWith(projectRoot);
}

// ── .md Section Parser ───────────────────────────────────────
// 解析 Markdown 檔案的 `## Section` 段落,回傳該段落內容(含子標題)。
// 用於 DB-first fallback — 當 DB 欄位為 NULL/空時,嘗試從 .md 對應段落讀取。
//
// 已知對應表:
//   ## Story                → user_story
//   ## Background           → background
//   ## Acceptance Criteria  → acceptance_criteria
//   ## Tasks / Subtasks     → tasks
//   ## Implementation Approach → implementation_approach
//   ## Testing Strategy     → testing_strategy
//   ## Dev Notes            → dev_notes
//   ## Required Skills      → required_skills
//   ## Definition of Done   → (附加至 dev_notes)
//   ## Rollback Plan        → (附加至 dev_notes)

export function parseMdSection(mdContent: string, sectionHeading: string): string | null {
  if (!mdContent) return null;

  // Match `## <heading>` (case-insensitive, allows trailing punctuation)
  // Section ends at next `## ` (H2) or EOF
  const escapedHeading = sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`,
    'mi',
  );
  const match = mdContent.match(regex);
  if (!match || !match[1]) return null;

  const body = match[1].trim();
  return body || null;
}

/** 取得 DB 欄位或 .md fallback,回傳 { content, source }. */
function resolveField(
  dbValue: string | null,
  mdContent: string | null,
  mdSection: string,
): { content: string | null; source: 'db' | 'md' | 'empty' } {
  if (dbValue && dbValue.trim() !== '') {
    return { content: dbValue, source: 'db' };
  }
  if (mdContent) {
    const parsed = parseMdSection(mdContent, mdSection);
    if (parsed) return { content: parsed, source: 'md' };
  }
  return { content: null, source: 'empty' };
}

// ── DB-first Story 內容組裝 ──────────────────────────────────

interface DbFirstRow {
  story_type: string | null;
  dependencies: string | null;
  tags: string | null;
  user_story: string | null;
  background: string | null;
  acceptance_criteria: string | null;
  tasks: string | null;
  affected_files: string | null;
  file_list: string | null;
  dev_notes: string | null;
  required_skills: string | null;
  implementation_approach: string | null;
  testing_strategy: string | null;
  sdd_spec: string | null;
  dev_agent: string | null;
  review_agent: string | null;
  create_agent: string | null;
  created_at: string | null;
  updated_at: string | null;
  cr_score: number | null;
  test_count: number | null;
  discovery_source: string | null;
  started_at: string | null;
  completed_at: string | null;
  create_started_at: string | null;
  create_completed_at: string | null;
  review_started_at: string | null;
  review_completed_at: string | null;
  cr_issues_total: number | null;
  cr_issues_fixed: number | null;
  cr_issues_deferred: number | null;
  cr_summary: string | null;
  pipeline_notes: string | null;
}

// 嘗試解析 JSON，失敗時返回原始文字
function tryParseJsonOrRaw(text: string, formatter: (items: unknown[]) => string[]): string[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return formatter(parsed);
  } catch { /* fallback */ }
  return [text];
}

function buildDbFirstContent(
  db: ReturnType<typeof getDb>,
  storyId: string,
  story: StoryDetailRecord,
): StoryContentResult {
  if (!db) return { content: null, error: 'DB_NOT_CONNECTED', story };

  let row: DbFirstRow | undefined;
  try {
    row = db
      .prepare(
        `SELECT story_type, dependencies, tags, user_story, background,
                acceptance_criteria, tasks, affected_files, file_list,
                dev_notes, required_skills, implementation_approach, testing_strategy,
                sdd_spec, dev_agent, review_agent, create_agent,
                created_at, updated_at, cr_score, test_count, discovery_source,
                started_at, completed_at, create_started_at, create_completed_at,
                review_started_at, review_completed_at,
                cr_issues_total, cr_issues_fixed, cr_issues_deferred, cr_summary,
                pipeline_notes
         FROM stories WHERE story_id = ?`,
      )
      .get(storyId) as DbFirstRow | undefined;
  } catch {
    return { content: null, error: 'DB_ERROR', story };
  }

  if (!row) return { content: null, error: 'STORY_NOT_FOUND', story };

  const sections: string[] = [];

  // ── Story 資訊表（對齊 template.md）──
  sections.push(`# ${story.story_id}: ${story.title}`);
  sections.push('');
  sections.push('## Story 資訊');
  sections.push('');
  sections.push('| 欄位 | 值 |');
  sections.push('|------|-----|');
  sections.push(`| **Story ID** | ${story.story_id} |`);
  sections.push(`| **Epic** | ${story.epic_id ?? '—'} |`);
  sections.push(`| **優先級** | ${story.priority ?? '—'} |`);
  sections.push(`| **類型** | ${row.story_type ?? '—'} |`);
  sections.push(`| **複雜度** | ${story.complexity ?? '—'} |`);
  sections.push(`| **狀態** | ${story.status ?? '—'} |`);
  if (row.sdd_spec) sections.push(`| **SDD Spec** | ${row.sdd_spec} |`);
  if (row.dependencies) sections.push(`| **依賴** | ${row.dependencies} |`);
  if (row.discovery_source) sections.push(`| **來源** | ${row.discovery_source} |`);
  sections.push(`| **建立日期** | ${row.created_at ?? '—'} |`);
  sections.push(`| **更新日期** | ${row.updated_at ?? '—'} |`);
  if (row.create_agent) sections.push(`| **Create Agent** | ${row.create_agent} |`);
  if (row.create_completed_at) sections.push(`| **Create 完成時間** | ${row.create_completed_at} |`);
  if (row.dev_agent) sections.push(`| **DEV Agent** | ${row.dev_agent} |`);
  if (row.started_at) sections.push(`| **DEV 開始時間** | ${row.started_at} |`);
  if (row.completed_at) sections.push(`| **DEV 完成時間** | ${row.completed_at} |`);
  if (row.review_agent) sections.push(`| **Review Agent** | ${row.review_agent} |`);
  if (row.review_completed_at) sections.push(`| **Review 完成時間** | ${row.review_completed_at} |`);
  if (row.cr_score !== null) sections.push(`| **CR Score** | ${row.cr_score} |`);
  if (row.test_count !== null) sections.push(`| **Test Count** | ${row.test_count} |`);
  if (row.cr_issues_total !== null) {
    sections.push(`| **CR Issues** | ${row.cr_issues_fixed ?? 0} fixed / ${row.cr_issues_deferred ?? 0} deferred / ${row.cr_issues_total} total |`);
  }
  if (row.tags) sections.push(`| **Tags** | ${row.tags} |`);

  // ── Story ──
  if (row.user_story) {
    sections.push('', '---', '', '## Story', '', row.user_story);
  }

  // ── Background ──
  if (row.background) {
    sections.push('', '---', '', '## Background', '', row.background);
  }

  // ── Acceptance Criteria ──
  if (row.acceptance_criteria) {
    sections.push('', '---', '', '## Acceptance Criteria', '');
    const acLines = tryParseJsonOrRaw(row.acceptance_criteria, (items) => {
      const result: string[] = [];
      for (const ac of items) {
        if (typeof ac === 'string') {
          result.push(`- ${ac}`);
        } else if (typeof ac === 'object' && ac !== null) {
          const obj = ac as Record<string, string>;
          if (obj.id && obj.title) {
            const verify = obj.verifies ? ` [Verifies: ${obj.verifies}]` : '';
            result.push(`### ${obj.id}: ${obj.title}${verify}`);
            if (obj.given) result.push(`- **Given** ${obj.given}`);
            if (obj.when) result.push(`- **When** ${obj.when}`);
            if (obj.then) result.push(`- **Then** ${obj.then}`);
            result.push('');
          } else if (obj.id && obj.description) {
            result.push(`- **${obj.id}**: ${obj.description}`);
          }
        }
      }
      return result;
    });
    sections.push(...acLines);
  }

  // ── Tasks / Subtasks ──
  if (row.tasks) {
    sections.push('', '---', '', '## Tasks / Subtasks', '');
    const taskLines = tryParseJsonOrRaw(row.tasks, (items) =>
      items.map(t => {
        if (typeof t === 'string') return `- [ ] ${t}`;
        const obj = t as Record<string, string>;
        return `- [ ] ${obj.title || obj.description || JSON.stringify(t)}`;
      }),
    );
    sections.push(...taskLines);
  }

  // ── Pipeline Notes (READ-ONLY) ──
  if (row.pipeline_notes) {
    sections.push('', '---', '', '## ⚠️ Pipeline Notes (READ-ONLY)', '', row.pipeline_notes);
  }

  // ── Dev Notes ──
  if (row.dev_notes) {
    sections.push('', '---', '', '## Dev Notes', '', row.dev_notes);
  }

  // ── SDD Spec 參考（M/L/XL 複雜度自動顯示）──
  if (row.sdd_spec) {
    sections.push('', '---', '', '## SDD Spec 參考', '');
    sections.push(`\`${row.sdd_spec}\``);
    sections.push('');
    sections.push('> dev-story / code-review 前必須閱讀此 Spec，內含 Business Rules (BR-XXX) 驅動 TDD 與 VSDD 驗證。');
  }

  // ── Required Skills ──
  if (row.required_skills) {
    sections.push('', '---', '', '## Required Skills', '', row.required_skills);
  }

  // ── Implementation Approach ──
  if (row.implementation_approach) {
    sections.push('', '---', '', '## Implementation Approach', '', row.implementation_approach);
  }

  // ── Testing Strategy ──
  if (row.testing_strategy) {
    sections.push('', '---', '', '## Testing Strategy', '', row.testing_strategy);
  }

  // ── File List ──
  if (row.file_list) {
    sections.push('', '---', '', '## File List', '');
    sections.push(row.file_list);
  }

  // ── Affected Files（fallback，file_list 優先）──
  if (!row.file_list && row.affected_files) {
    sections.push('', '---', '', '## Affected Files', '');
    const fileLines = tryParseJsonOrRaw(row.affected_files, (items) =>
      items.map(f => `- \`${f}\``),
    );
    sections.push(...fileLines);
  }

  // ── CR Summary ──
  if (row.cr_summary) {
    sections.push('', '---', '', '## CR Summary', '', row.cr_summary);
  }

  return { content: sections.join('\n'), story };
}

// ── 結構化 Story 詳情（供前端卡片渲染）──────────────────────

export interface StructuredStoryDetail {
  // 基本資訊
  story_id: string;
  epic_id: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  complexity: string | null;
  story_type: string | null;
  tags: string | null;
  sdd_spec: string | null;
  dependencies: string | null;
  discovery_source: string | null;
  // 時間軸
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  create_started_at: string | null;
  create_completed_at: string | null;
  review_started_at: string | null;
  review_completed_at: string | null;
  // 代理
  dev_agent: string | null;
  review_agent: string | null;
  create_agent: string | null;
  // CR 結果
  cr_score: number | null;
  test_count: number | null;
  cr_issues_total: number | null;
  cr_issues_fixed: number | null;
  cr_issues_deferred: number | null;
  cr_summary: string | null;
  // 報告內容（affected_files 指向的 MD 檔）
  report_content: string | null;
  report_path: string | null;
  // 內容區塊
  user_story: string | null;
  background: string | null;
  acceptance_criteria: string | null;
  tasks: string | null;
  dev_notes: string | null;
  required_skills: string | null;
  implementation_approach: string | null;
  testing_strategy: string | null;
  file_list: string | null;
  affected_files: string | null;
  pipeline_notes: string | null;
  // 來源類型
  source_type: 'db' | 'file' | 'hybrid';
  markdown_content: string | null; // 若 file-based 或 fallback 需要,存整個 .md 內容
  // Per-section source annotation (hybrid resolution — DB 優先,fallback .md)
  // 可能的 key: user_story / background / acceptance_criteria / tasks /
  //             dev_notes / required_skills / implementation_approach /
  //             testing_strategy / file_list
  // value: 'db' = 從 DB 欄位讀取 / 'md' = 從 .md 檔案 fallback / 'empty' = 兩者皆無
  section_sources: Record<string, 'db' | 'md' | 'empty'>;
}

export function getStructuredStoryDetail(storyId: string): StructuredStoryDetail | null {
  const db = getDb();
  if (!db) return null;

  try {
    const row = db.prepare(
      `SELECT story_id, epic_id, title, status, priority, complexity, source_file,
              story_type, dependencies, tags, user_story, background,
              acceptance_criteria, tasks, affected_files, file_list,
              dev_notes, required_skills, implementation_approach, testing_strategy,
              sdd_spec, dev_agent, review_agent, create_agent,
              created_at, updated_at, cr_score, test_count, discovery_source,
              started_at, completed_at, create_started_at, create_completed_at,
              review_started_at, review_completed_at,
              cr_issues_total, cr_issues_fixed, cr_issues_deferred, cr_summary,
              pipeline_notes
       FROM stories WHERE story_id = ?`,
    ).get(storyId) as (StoryDetailRecord & DbFirstRow & { source_file: string | null }) | undefined;

    if (!row) return null;

    // ── Hybrid resolution ─────────────────────────────────────
    // 一律嘗試讀取 source_file(無論 db-first 或 file-based),供 per-section fallback 用
    let markdownContent: string | null = null;
    if (row.source_file && !row.source_file.startsWith('context-db://') && row.source_file !== 'db-first') {
      const resolvedPath = path.isAbsolute(row.source_file)
        ? path.resolve(row.source_file)
        : path.resolve(config.projectRoot, row.source_file);
      if (isSafePath(resolvedPath) && fs.existsSync(resolvedPath)) {
        try { markdownContent = fs.readFileSync(resolvedPath, 'utf-8'); } catch { /* ignore */ }
      }
    }

    // 每個欄位 hybrid 解析:DB 優先,空則 fallback .md section
    const userStoryR  = resolveField(row.user_story,  markdownContent, 'Story');
    const backgroundR = resolveField(row.background, markdownContent, 'Background');
    const acR         = resolveField(row.acceptance_criteria, markdownContent, 'Acceptance Criteria');
    const tasksR      = resolveField(row.tasks, markdownContent, 'Tasks / Subtasks');
    const devNotesR   = resolveField(row.dev_notes, markdownContent, 'Dev Notes');
    const skillsR     = resolveField(row.required_skills, markdownContent, 'Required Skills');
    const approachR   = resolveField(row.implementation_approach, markdownContent, 'Implementation Approach');
    const testingR    = resolveField(row.testing_strategy, markdownContent, 'Testing Strategy');
    const fileListR   = resolveField(row.file_list, markdownContent, 'File List');

    const sectionSources: Record<string, 'db' | 'md' | 'empty'> = {
      user_story: userStoryR.source,
      background: backgroundR.source,
      acceptance_criteria: acR.source,
      tasks: tasksR.source,
      dev_notes: devNotesR.source,
      required_skills: skillsR.source,
      implementation_approach: approachR.source,
      testing_strategy: testingR.source,
      file_list: fileListR.source,
    };

    // source_type 綜合判定:
    //   'db'     — 所有區塊皆從 DB (或 empty)
    //   'file'   — 所有非 empty 區塊皆從 .md
    //   'hybrid' — 混合
    const nonEmptySources = Object.values(sectionSources).filter(s => s !== 'empty');
    const hasDb = nonEmptySources.some(s => s === 'db');
    const hasMd = nonEmptySources.some(s => s === 'md');
    const sourceType: 'db' | 'file' | 'hybrid' =
      hasDb && hasMd ? 'hybrid' : hasMd ? 'file' : 'db';

    // DB-first story:讀取 affected_files 指向的報告 MD 檔
    // (僅當 source_file 為 db-first 且 affected_files 指向 .md 時)
    const isDbFirst = !row.source_file || row.source_file.startsWith('context-db://') || row.source_file === 'db-first';
    let reportContent: string | null = null;
    let reportPath: string | null = null;
    if (isDbFirst && row.affected_files) {
      // affected_files 可能是單一路徑或 JSON array
      const filePath = row.affected_files.startsWith('[')
        ? (() => { try { return JSON.parse(row.affected_files!)[0]; } catch { return row.affected_files; } })()
        : row.affected_files;
      if (filePath && filePath.endsWith('.md')) {
        const resolvedReport = path.isAbsolute(filePath)
          ? path.resolve(filePath)
          : path.resolve(config.projectRoot, filePath);
        if (isSafePath(resolvedReport) && fs.existsSync(resolvedReport)) {
          try {
            reportContent = fs.readFileSync(resolvedReport, 'utf-8');
            reportPath = filePath;
          } catch { /* ignore */ }
        }
      }
    }

    return {
      story_id: row.story_id,
      epic_id: row.epic_id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      complexity: row.complexity,
      story_type: row.story_type,
      tags: row.tags,
      sdd_spec: row.sdd_spec,
      dependencies: row.dependencies,
      discovery_source: row.discovery_source,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      create_started_at: row.create_started_at,
      create_completed_at: row.create_completed_at,
      review_started_at: row.review_started_at,
      review_completed_at: row.review_completed_at,
      dev_agent: row.dev_agent,
      review_agent: row.review_agent,
      create_agent: row.create_agent,
      cr_score: row.cr_score,
      test_count: row.test_count,
      cr_issues_total: row.cr_issues_total,
      cr_issues_fixed: row.cr_issues_fixed,
      cr_issues_deferred: row.cr_issues_deferred,
      cr_summary: row.cr_summary,
      // Hybrid-resolved content (DB preferred, .md fallback)
      user_story: userStoryR.content,
      background: backgroundR.content,
      acceptance_criteria: acR.content,
      tasks: tasksR.content,
      dev_notes: devNotesR.content,
      required_skills: skillsR.content,
      implementation_approach: approachR.content,
      testing_strategy: testingR.content,
      file_list: fileListR.content,
      affected_files: row.affected_files,
      pipeline_notes: row.pipeline_notes,
      source_type: sourceType,
      markdown_content: markdownContent,
      section_sources: sectionSources,
      report_content: reportContent,
      report_path: reportPath,
    };
  } catch {
    return null;
  }
}

// ── 主要查詢（舊 Markdown 組裝，保留相容）─────────────────────

export function getStoryContent(storyId: string): StoryContentResult {
  const db = getDb();
  if (!db) {
    return { content: null, error: 'DB_NOT_CONNECTED', story: null };
  }

  // 查詢 stories 表
  let row: StoryDetailRecord | undefined;
  try {
    row = db
      .prepare(
        `SELECT story_id, epic_id, title, status, priority, complexity, source_file
         FROM stories
         WHERE story_id = ?`,
      )
      .get(storyId) as StoryDetailRecord | undefined;
  } catch {
    return { content: null, error: 'DB_ERROR', story: null };
  }

  if (!row) {
    return { content: null, error: 'STORY_NOT_FOUND', story: null };
  }

  const story: StoryDetailRecord = row;

  // DB-first Story：source_file 為空或以 context-db:// 開頭 → 從 DB 欄位組裝
  if (!story.source_file || story.source_file.startsWith('context-db://') || story.source_file === 'db-first') {
    return buildDbFirstContent(db, storyId, story);
  }

  // 相對路徑 → 接上 projectRoot
  const resolvedPath = path.isAbsolute(story.source_file)
    ? path.resolve(story.source_file)
    : path.resolve(config.projectRoot, story.source_file);

  // 路徑遍歷防護
  if (!isSafePath(resolvedPath)) {
    return { content: null, error: 'PATH_TRAVERSAL_BLOCKED', story };
  }

  // 讀取檔案
  if (!fs.existsSync(resolvedPath)) {
    return { content: null, error: 'FILE_NOT_FOUND', story };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return { content, story };
  } catch {
    return { content: null, error: 'FILE_READ_ERROR', story };
  }
}
