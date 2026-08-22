#!/usr/bin/env python3
"""
Skill 驗證工具 - 檢查 skill 格式是否正確（無外部依賴）

用法：
    python quick_validate.py <skill-directory>
    python quick_validate.py --all <skills-root-dir>
    python quick_validate.py --all <skills-root-dir> --json
    python quick_validate.py --json <skill-directory>

Rules:
    SKILL-01: SKILL.md 必須存在
    SKILL-02: name 必填且屬性合法
    SKILL-03: description 必填
    SKILL-04: name 格式（kebab-case，PhyCool 不要求 bmad- prefix）
    SKILL-05: name 必須與目錄名相符（kebab-case 目錄才強制）
    SKILL-06: description 長度（20-1024 chars）
    SKILL-07: SKILL.md 必須有 body content
    WF-01:    非 SKILL.md 的 .md 檔不得有 name frontmatter
    WF-02:    非 SKILL.md 的 .md 檔不得有 description frontmatter
    SEQ-02:   不得含有時間估算表達式
    PC-01:    version 欄位必填（PhyCool 規範）
    PC-02:    updated 欄位必填（PhyCool 規範）
    PC-03:    phycool-* SaaS Skill 建議設定 watches（PhyCool 規範）
    VAL-01:   model 值域驗證（sonnet/opus/haiku 或 claude- 開頭）
    VAL-02:   effort 值域驗證（low/medium/high/max）
    VAL-03:   context 值域驗證（僅 fork）
    VAL-04:   shell 值域驗證（bash/powershell）
    TODO:     不得有未完成 TODO 標記
    FILE-REF: 引用的 references/scripts/assets 檔案必須存在
    WATCHES-01: watches 欄位結構驗證（每項必須有非空 glob）
    DESC-TRIGGER: description 觸發品質驗證（應含觸發條件說明）
    TB-LEVEL:    description 字數符合 Token Budget 分級限制（getting-started 150 / frequently-loaded 200 / general 500）
    CSO-USEWHEN: description 前 150 字含觸發開頭詞（Use when / Triggers: / 觸發 / 當...時）
    CSO-3RD:     description 用第三人稱（避免 'I' / 'you' / '我' / '你' 等第一/二人稱代詞）
    CSO-ANTI-SUMMARY: description 不摘要 workflow body（避免「步驟 N」/「Phase N」/「Step N」）
"""

import sys
import re
import io
import json
from pathlib import Path

# Windows console 編碼修正
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 允許的 Frontmatter 屬性
# - 官方: Claude Code v2.1.85 官方 Skill Frontmatter 欄位
# - PhyCool: version, updated, watches, author, created
# - 第三方相容: homepage, license, metadata
ALLOWED_PROPERTIES = {
    # Claude Code 官方屬性
    'name', 'description', 'argument-hint', 'disable-model-invocation',
    'user-invocable', 'allowed-tools', 'model', 'effort', 'context',
    'agent', 'hooks', 'shell',
    # PhyCool 必填屬性（PC-01, PC-02）
    'version', 'updated',
    # PhyCool 擴展屬性（skill staleness detection, sync tracking, metadata）
    'watches', 'author', 'created', 'last-synced-epic', 'last-synced-date',
    'last_synced_epic', 'last_synced_date',
    'last-synced-story', 'last_synced_story',  # Stage α/β 蒸餾範式 audit trail (2026-05-23 Stage β β-2)
    # 第三方 Skill 相容屬性（ECPay 等外部來源 / superpowers MIT distillation / ADR-EXTERNAL-001/002 範式）
    'homepage', 'license', 'metadata', 'source',
    # saas-to-skill v3 / skill-builder v3 擴展屬性（Epic SE 新增）
    'domain', 'triggers',
}

# SEQ-02: 時間估算 pattern（regex）
TIME_ESTIMATE_PATTERNS = [
    re.compile(r'takes?\s+\d+\s*min', re.IGNORECASE),
    re.compile(r'~\s*\d+\s*min', re.IGNORECASE),
    re.compile(r'estimated\s+time', re.IGNORECASE),
    re.compile(r'\bETA\b'),
]

# DESC-TRIGGER: description 觸發品質指標（任一匹配 = 有觸發說明）
DESC_TRIGGER_PATTERNS = [
    re.compile(r'\bTriggers?\s*:', re.IGNORECASE),          # "Triggers:" / "Trigger keywords:"
    re.compile(r'\bTrigger\s+keywords?\s*:', re.IGNORECASE),
    re.compile(r'\bUse\s+when\b', re.IGNORECASE),           # "Use when..."
    re.compile(r'\bUse\s+for\b', re.IGNORECASE),            # "Use for:"
    re.compile(r'\bWhen\s+(the\s+)?user\b', re.IGNORECASE), # "When user..."
    re.compile(r'觸發'),                                     # 中文「觸發」
    re.compile(r'何時'),                                     # 中文「何時」
    re.compile(r'當.*?時'),                                  # 中文「當...時」
]

# ── CSO-USEWHEN: description 前 150 字必含觸發開頭詞 ──
CSO_USEWHEN_PATTERNS = [
    re.compile(r'\bUse\s+when\b', re.IGNORECASE),
    re.compile(r'\bTriggers?\s*:', re.IGNORECASE),
    re.compile(r'\bTrigger\s+keywords?\s*:', re.IGNORECASE),
    re.compile(r'\bUse\s+for\b', re.IGNORECASE),
    re.compile(r'觸發'),
    re.compile(r'當.*?時'),
    re.compile(r'何時'),
]

# ── CSO-3RD: 第一/二人稱代詞 pattern（WARN if matched）──
CSO_PERSON_PATTERN = re.compile(
    r'\bI\b|\bI\'[a-z]+\b|\byou\b|\byour\b|\b我\b|\b你\b|\b妳\b',
    re.IGNORECASE
)

# ── CSO-ANTI-SUMMARY: workflow 摘要 pattern（WARN if matched）──
CSO_ANTI_SUMMARY_PATTERNS = [
    re.compile(r'步驟\s*[0-9]'),
    re.compile(r'Phase\s+[0-9]', re.IGNORECASE),
    re.compile(r'Step\s+[0-9]', re.IGNORECASE),
    re.compile(r'第\s*[0-9一二三四五六七八九十]+\s*步'),
]


def parse_frontmatter(text: str) -> dict:
    """
    簡易 YAML frontmatter 解析（僅處理頂層 key: value，不需 PyYAML）。
    支援多行 >-/>/|/|- 指示符與縮排連續行。
    """
    result = {}
    current_key = None
    multiline_value = []

    for line in text.split('\n'):
        # 多行值繼續（以空格開頭且有當前 key）
        if current_key and (line.startswith('  ') or line.startswith('\t')):
            multiline_value.append(line.strip())
            continue

        # 儲存前一個多行值
        if current_key and multiline_value:
            result[current_key] = ' '.join(multiline_value)
            current_key = None
            multiline_value = []

        # 跳過空行和註解
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue

        # 解析 key: value
        match = re.match(r'^([a-z][a-z0-9-]*)\s*:\s*(.*)', line)
        if match:
            key = match.group(1)
            value = match.group(2).strip()

            # 處理 >- 或 | 多行指示符
            if value in ('>-', '>', '|', '|-'):
                current_key = key
                multiline_value = []
                continue

            # 移除引號
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]

            # 布林值轉換
            if value.lower() == 'true':
                value = True
            elif value.lower() == 'false':
                value = False

            result[key] = value

    # 處理最後一個多行值
    if current_key and multiline_value:
        result[current_key] = ' '.join(multiline_value)

    return result


def _rule(rule_id: str, passed: bool, message: str) -> dict:
    """建立 pass/fail 規則結果"""
    return {"id": rule_id, "status": "pass" if passed else "fail", "message": message}


def _warn(rule_id: str, message: str) -> dict:
    """建立 warn 級別規則結果"""
    return {"id": rule_id, "status": "warn", "message": message}


def _info(rule_id: str, message: str) -> dict:
    """建立 info 級別規則結果（不影響 pass/fail/warn 計算）"""
    return {"id": rule_id, "status": "pass", "message": f"[INFO] {message}"}


def _parse_watches_items(frontmatter_text: str) -> list[dict] | None:
    """
    從 frontmatter 文字解析 watches YAML list。
    回傳 None  = 無 watches 欄位
    回傳 []    = watches 存在但清單為空
    回傳 list  = 已解析的項目清單，每項為 dict（含 glob 等 key）
    """
    lines = frontmatter_text.split('\n')
    watches_start = None
    for i, line in enumerate(lines):
        if re.match(r'^watches\s*:', line):
            watches_start = i
            break

    if watches_start is None:
        return None

    items: list[dict] = []
    current_item: dict | None = None

    for line in lines[watches_start + 1:]:
        # 結束條件：行首非空白，代表 watches block 結束
        if line and not line[0].isspace():
            break
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('- '):
            # 新增清單項目
            if current_item is not None:
                items.append(current_item)
            current_item = {}
            prop = stripped[2:]  # 移除 "- "
            m = re.match(r'^([a-z][a-z0-9_-]*)\s*:\s*(.*)', prop)
            if m:
                val = m.group(2).strip().strip('"\'')
                current_item[m.group(1)] = val
        elif current_item is not None:
            # 同一項目的額外屬性（縮排行）
            m = re.match(r'^([a-z][a-z0-9_-]*)\s*:\s*(.*)', stripped)
            if m:
                val = m.group(2).strip().strip('"\'')
                current_item[m.group(1)] = val

    if current_item is not None:
        items.append(current_item)

    return items


def _classify_token_budget(
    frontmatter: dict, skill_path: Path, watches_present: bool
) -> tuple[str, int, str]:
    """
    根據 frontmatter 屬性自動判定 Token Budget 等級與字元上限。
    回傳 (level, char_limit, reason)
      - getting-started: 150 字元
      - frequently-loaded: 200 字元
      - general: 500 字元

    Heuristic（對齊 dev_notes TB-LEVEL 分級判定）：
      1. name 含 'getting-started' → getting-started / 150
      2. phycool-* + watches 存在 → frequently-loaded / 200（常駐高頻載入）
      3. disable-model-invocation=true + user-invocable=false → general / 500（零常駐成本）
      4. 其他預設 → general / 500
    """
    name = skill_path.name
    if 'getting-started' in name.lower():
        return ('getting-started', 150, 'name 含 getting-started')
    if watches_present and name.startswith('phycool-'):
        return ('frequently-loaded', 200, 'phycool-* + watches 存在 → 高頻常駐載入')
    dmi = frontmatter.get('disable-model-invocation', False)
    ui = frontmatter.get('user-invocable', True)
    if dmi is True and ui is False:
        return ('general', 500, 'disable-model-invocation=true + user-invocable=false → 零常駐成本')
    return ('general', 500, '預設 general')


def validate_skill(skill_path: str | Path) -> list[dict]:
    """
    驗證 skill 格式，回傳規則結果清單。
    每個結果: {"id": "SKILL-XX", "status": "pass"|"fail"|"warn", "message": "..."}
    """
    skill_path = Path(skill_path)
    results = []

    # ─── SKILL-01: SKILL.md 必須存在 ───
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        results.append(_rule("SKILL-01", False, "找不到 SKILL.md"))
        return results  # 無法繼續後續檢查

    results.append(_rule("SKILL-01", True, "SKILL.md 存在"))

    # 讀取內容
    try:
        content = skill_md.read_text(encoding='utf-8')
    except Exception as e:
        results.append(_rule("SKILL-01", False, f"無法讀取 SKILL.md: {e}"))
        return results

    # PC-LINE: 行數警告（PhyCool 建議 ≤ 500 行，超過為 WARN 非 FAIL）
    line_count = len(content.splitlines())
    if line_count > 500:
        results.append(_warn("PC-LINE",
            f"SKILL.md 超過建議 500 行（目前 {line_count} 行），建議拆分 references/ 子文件"))

    # ─── 解析 Frontmatter ───
    if not content.startswith('---'):
        results.append(_rule("SKILL-02", False, "找不到 YAML frontmatter（需以 --- 開頭）"))
        return results

    fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not fm_match:
        results.append(_rule("SKILL-02", False, "Frontmatter 格式錯誤（需以 --- 結束）"))
        return results

    frontmatter_text = fm_match.group(1)
    frontmatter = parse_frontmatter(frontmatter_text)
    if not frontmatter:
        results.append(_rule("SKILL-02", False, "Frontmatter 解析失敗或為空"))
        return results

    # ─── 未知屬性檢查 ───
    top_keys = set(frontmatter.keys())
    unknown_keys = top_keys - ALLOWED_PROPERTIES
    if unknown_keys:
        results.append(_rule("SKILL-02", False,
            f"未知屬性: {', '.join(sorted(unknown_keys))}。"
            f"允許的屬性: {', '.join(sorted(ALLOWED_PROPERTIES))}"))
    else:
        results.append(_rule("SKILL-02", True, "Frontmatter 屬性全部合法"))

    # ─── SKILL-02: name 必填 ───
    if 'name' not in frontmatter:
        results.append(_rule("SKILL-02", False, "缺少必填欄位 'name'"))

    # ─── SKILL-03: description 必填 ───
    if 'description' not in frontmatter:
        results.append(_rule("SKILL-03", False, "缺少必填欄位 'description'"))
    else:
        results.append(_rule("SKILL-03", True, "description 欄位存在"))

    # ─── SKILL-04: name 格式（PhyCool 適配：kebab-case，不要求 bmad- prefix）───
    name = str(frontmatter.get('name', '')).strip()
    if name:
        if not re.match(r'^[a-z0-9-]+$', name):
            results.append(_rule("SKILL-04", False,
                f"name '{name}' 必須是 kebab-case（僅限小寫字母、數字、連字號）"))
        elif name.startswith('-') or name.endswith('-') or '--' in name:
            results.append(_rule("SKILL-04", False,
                f"name '{name}' 不能以連字號開頭/結尾，也不能有連續連字號"))
        elif len(name) > 64:
            results.append(_rule("SKILL-04", False,
                f"name 太長（{len(name)} 字元），最多 64 字元"))
        else:
            results.append(_rule("SKILL-04", True, f"name '{name}' 格式正確"))

    # ─── SKILL-05: name 必須與目錄名相符 ───
    # PhyCool 適配：若目錄名含大寫字母或非 kebab-case 字元（如第三方 Skill），跳過此規則
    dir_name = skill_path.name
    if re.match(r'^[a-z0-9-]+$', dir_name):
        # 目錄名是合法 kebab-case：強制要求 name 匹配
        if name and name != dir_name:
            results.append(_rule("SKILL-05", False,
                f"name '{name}' 與目錄名 '{dir_name}' 不符"))
        elif name:
            results.append(_rule("SKILL-05", True, f"name 與目錄名相符：'{dir_name}'"))
    else:
        # 目錄名含非 kebab 字元（如 ECPay-API-Skill-master）：SKILL-05 N/A
        results.append(_info("SKILL-05",
            f"目錄名 '{dir_name}' 含非 kebab-case 字元，SKILL-05 跳過（第三方 Skill 相容）"))

    # ─── SKILL-06: description 長度（20 ≤ len ≤ 1024）───
    description = str(frontmatter.get('description', '')).strip()
    if description:
        desc_len = len(description)
        if desc_len < 20:
            results.append(_warn("SKILL-06",
                f"description 僅 {desc_len} 字元，建議至少 20 字元"))
        elif desc_len > 1024:
            results.append(_rule("SKILL-06", False,
                f"description 超過 1024 字元（目前 {desc_len} 字元）"))
        else:
            results.append(_rule("SKILL-06", True,
                f"description 長度合法（{desc_len} 字元）"))

    # ─── SKILL-07: SKILL.md 必須有非空 body content ───
    body = content[fm_match.end():]
    if not body.strip():
        results.append(_rule("SKILL-07", False,
            "SKILL.md frontmatter 後沒有 body content"))
    else:
        results.append(_rule("SKILL-07", True, "SKILL.md 有 body content"))

    # ─── PC-01: version 必填（PhyCool 規範）───
    if 'version' not in frontmatter:
        results.append(_rule("PC-01", False, "缺少 PhyCool 必填欄位 'version'"))
    else:
        results.append(_rule("PC-01", True,
            f"version 欄位存在：{frontmatter['version']}"))

    # ─── PC-02: updated 必填（PhyCool 規範）───
    if 'updated' not in frontmatter:
        results.append(_rule("PC-02", False, "缺少 PhyCool 必填欄位 'updated'"))
    else:
        results.append(_rule("PC-02", True,
            f"updated 欄位存在：{frontmatter['updated']}"))

    # ─── PC-03: phycool-* SaaS Skill 建議設定 watches ───
    if skill_path.name.startswith('phycool-'):
        watches_items_pc03 = _parse_watches_items(frontmatter_text)
        if watches_items_pc03 is None:
            results.append(_warn("PC-03",
                "phycool-* SaaS Skill 建議設定 watches 欄位以偵測過期"
                "（非強制，純工具型 phycool-* 可忽略）"))
        else:
            results.append(_rule("PC-03", True, "phycool-* Skill 已設定 watches 欄位"))

    # ─── VAL-01: model 值域驗證 ───
    _VALID_MODEL_SHORTS = {'sonnet', 'opus', 'haiku'}
    if 'model' in frontmatter:
        model_val = str(frontmatter['model']).strip()
        if model_val not in _VALID_MODEL_SHORTS and not model_val.startswith('claude-'):
            results.append(_warn("VAL-01",
                f"model 值 '{model_val}' 不在合法值域。"
                f"合法值：sonnet / opus / haiku 或 claude- 開頭的完整 model ID"))
        else:
            results.append(_rule("VAL-01", True, f"model 值域合法：{model_val}"))

    # ─── VAL-02: effort 值域驗證 ───
    _VALID_EFFORT = {'low', 'medium', 'high', 'max'}
    if 'effort' in frontmatter:
        effort_val = str(frontmatter['effort']).strip()
        if effort_val not in _VALID_EFFORT:
            results.append(_warn("VAL-02",
                f"effort 值 '{effort_val}' 不在合法值域。"
                f"合法值：low / medium / high / max"))
        else:
            results.append(_rule("VAL-02", True, f"effort 值域合法：{effort_val}"))

    # ─── VAL-03: context 值域驗證（僅允許 fork）───
    if 'context' in frontmatter:
        context_val = str(frontmatter['context']).strip()
        if context_val != 'fork':
            results.append(_rule("VAL-03", False,
                f"context 值 '{context_val}' 不合法。唯一合法值為 fork"))
        else:
            results.append(_rule("VAL-03", True, f"context 值域合法：{context_val}"))

    # ─── VAL-04: shell 值域驗證 ───
    _VALID_SHELL = {'bash', 'powershell'}
    if 'shell' in frontmatter:
        shell_val = str(frontmatter['shell']).strip()
        if shell_val not in _VALID_SHELL:
            results.append(_warn("VAL-04",
                f"shell 值 '{shell_val}' 不在合法值域。"
                f"合法值：bash / powershell"))
        else:
            results.append(_rule("VAL-04", True, f"shell 值域合法：{shell_val}"))

    # ─── TODO 標記檢查 ───
    if '[TODO:' in content or '[TODO]' in content:
        results.append(_rule("TODO", False, "SKILL.md 中仍有未完成的 TODO 項目"))
    else:
        results.append(_rule("TODO", True, "無 TODO 標記"))

    # ─── FILE-REF: 檔案引用檢查（排除 fenced code block 內的連結）───
    body_no_code = re.sub(r'```.*?```', '', body, flags=re.DOTALL)
    body_no_code = re.sub(r'`[^`]+`', '', body_no_code)
    link_pattern = re.findall(
        r'\[.*?\]\(((?:references|scripts|assets)/[^)]+)\)', body_no_code)
    missing_files = [ref for ref in link_pattern
                     if not (skill_path / ref).exists()]
    if missing_files:
        results.append(_rule("FILE-REF", False,
            f"引用的檔案不存在: {', '.join(missing_files)}"))
    else:
        results.append(_rule("FILE-REF", True, "所有檔案引用存在"))

    # ─── WF-01 / WF-02: 非 SKILL.md 的根目錄 .md 檔不得有 name/description frontmatter ───
    # PhyCool 適配：只掃描 skill 根目錄的 .md 檔，不包含 references/scripts/assets 等子目錄
    # 理由：PhyCool references/*.md 是合法的參考文件，允許自有 frontmatter
    wf01_issues = []
    wf02_issues = []
    for md_file in skill_path.glob('*.md'):
        if md_file.name == 'SKILL.md':
            continue
        try:
            other_content = md_file.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        if not other_content.startswith('---'):
            continue
        other_fm_match = re.match(r'^---\n(.*?)\n---', other_content, re.DOTALL)
        if not other_fm_match:
            continue
        other_fm = parse_frontmatter(other_fm_match.group(1))
        if not other_fm:
            continue
        rel = str(md_file.relative_to(skill_path))
        if 'name' in other_fm:
            wf01_issues.append(rel)
        if 'description' in other_fm:
            wf02_issues.append(rel)

    if wf01_issues:
        results.append(_rule("WF-01", False,
            f"以下非 SKILL.md 檔案含有 name 欄位: {', '.join(wf01_issues)}"))
    else:
        results.append(_rule("WF-01", True,
            "無非 SKILL.md 的 .md 檔含有 name 欄位"))

    if wf02_issues:
        results.append(_rule("WF-02", False,
            f"以下非 SKILL.md 檔案含有 description 欄位: {', '.join(wf02_issues)}"))
    else:
        results.append(_rule("WF-02", True,
            "無非 SKILL.md 的 .md 檔含有 description 欄位"))

    # ─── SEQ-02: 時間估算 pattern（掃描所有 .md 檔）───
    seq2_hits = []
    for md_file in skill_path.rglob('*.md'):
        try:
            md_content = md_file.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        for pattern in TIME_ESTIMATE_PATTERNS:
            if pattern.search(md_content):
                seq2_hits.append(str(md_file.relative_to(skill_path)))
                break

    if seq2_hits:
        results.append(_warn("SEQ-02",
            f"含有時間估算表達式: {', '.join(seq2_hits)}"))
    else:
        results.append(_rule("SEQ-02", True, "無時間估算表達式"))

    # ─── WATCHES-01: watches 欄位結構驗證 ───
    watches_items = _parse_watches_items(frontmatter_text)
    if watches_items is None:
        # watches 欄位不存在 → 跳過（選填欄位）
        results.append(_info("WATCHES-01", "watches 欄位不存在（選填，跳過驗證）"))
    elif len(watches_items) == 0:
        # watches 欄位存在但清單為空
        results.append(_warn("WATCHES-01",
            "watches 欄位存在但清單為空，建議加入至少一個 glob 路徑"))
    else:
        invalid_items = [
            i for i, item in enumerate(watches_items, start=1)
            if not item.get('glob', '').strip()
        ]
        if invalid_items:
            results.append(_rule("WATCHES-01", False,
                f"watches 第 {', '.join(str(i) for i in invalid_items)} 項缺少非空 glob 欄位"))
        else:
            results.append(_rule("WATCHES-01", True,
                f"watches 結構合法（共 {len(watches_items)} 項，每項均有 glob）"))

    # ─── DESC-TRIGGER: description 觸發品質驗證 ───
    if description:
        has_trigger = any(p.search(description) for p in DESC_TRIGGER_PATTERNS)
        if has_trigger:
            results.append(_rule("DESC-TRIGGER", True,
                "description 含有觸發條件說明"))
        else:
            results.append(_warn("DESC-TRIGGER",
                "description 未含觸發條件說明（建議加入 'Triggers:'、'Use when...' 或"
                " '觸發關鍵字：' 以提升 Claude 自動載入準確率）"))

    # ─── CSO + TB-LEVEL 新規則（SKL-02 Token Budget + CSO Lint）───
    if description:
        # 定位 description 欄位的行號（供 file:line 訊息使用）
        desc_line_num = next(
            (i for i, ln in enumerate(content.splitlines(), start=1)
             if re.match(r'^description\s*:', ln)), 3)

        # ── TB-LEVEL: Token Budget 分級 ──
        watches_present_tb = _parse_watches_items(frontmatter_text) is not None
        budget_level, char_limit, budget_reason = _classify_token_budget(
            frontmatter, skill_path, watches_present_tb)
        desc_len_tb = len(description)
        if desc_len_tb > char_limit:
            results.append(_warn("TB-LEVEL",
                f"SKILL.md:{desc_line_num} description 超 {budget_level} budget"
                f"（{desc_len_tb} 字元 > {char_limit} 字元限制）\n"
                f"  - 違規類型: Token Budget 超限（{budget_level} ≤ {char_limit} 字元）\n"
                f"  - 判定依據: {budget_reason}\n"
                f"  - 改寫建議: 縮減 description 至 {char_limit} 字元以內，詳細觸發說明移至 SKILL.md body"))
        else:
            results.append(_rule("TB-LEVEL", True,
                f"TB-LEVEL pass: {budget_level} budget（{char_limit} 字元限制，目前 {desc_len_tb} 字元）"))

        # ── CSO-USEWHEN: description 前 150 字含觸發開頭詞 ──
        prefix_150 = description[:150]
        if any(p.search(prefix_150) for p in CSO_USEWHEN_PATTERNS):
            results.append(_rule("CSO-USEWHEN", True,
                "description 前 150 字含觸發開頭詞（符合 CSO 第 2 原則）"))
        else:
            snippet = description[:80].replace('\n', ' ')
            results.append(_warn("CSO-USEWHEN",
                f"SKILL.md:{desc_line_num} description 前 150 字缺觸發開頭詞\n"
                f"  - 違規類型: CSO 第 2 原則（\"Use when\" / \"Triggers:\" / 「觸發」 開頭）\n"
                f"  - 當前開頭: \"{snippet}...\"\n"
                f"  - 改寫建議: 改為 \"Use when ...\" 或以 \"Triggers: 關鍵字1, 關鍵字2\" 開頭"))

        # ── CSO-3RD: description 禁第一/二人稱代詞 ──
        person_match = CSO_PERSON_PATTERN.search(description)
        if person_match:
            results.append(_warn("CSO-3RD",
                f"SKILL.md:{desc_line_num} description 含第一/二人稱代詞\n"
                f"  - 違規類型: CSO 第 1 原則（third-person，禁用 I/you/我/你）\n"
                f"  - 命中詞: \"{person_match.group(0)}\"\n"
                f"  - 改寫建議: 改用第三人稱描述（如 'Processes...' / '處理...' 而非 'I process...'）"))
        else:
            results.append(_rule("CSO-3RD", True,
                "CSO-3RD pass: description 未含第一/二人稱代詞"))

        # ── CSO-ANTI-SUMMARY: description 不得摘要 workflow body ──
        anti_summary_hit = next(
            (p for p in CSO_ANTI_SUMMARY_PATTERNS if p.search(description)), None)
        if anti_summary_hit:
            matched_text = anti_summary_hit.search(description).group(0)
            results.append(_warn("CSO-ANTI-SUMMARY",
                f"SKILL.md:{desc_line_num} description 含 workflow 摘要模式\n"
                f"  - 違規類型: CSO 第 3 原則（description 不摘要 workflow body）\n"
                f"  - 命中文字: \"{matched_text}\"\n"
                f"  - 改寫建議: 移除步驟列舉，改為說明觸發時機（\"Use when...\"）而非執行細節"))
        else:
            results.append(_rule("CSO-ANTI-SUMMARY", True,
                "CSO-ANTI-SUMMARY pass: description 未含 workflow 摘要模式"))

    return results


def _calc_skill_status(rule_results: list[dict]) -> str:
    """根據規則結果計算整體 skill 狀態"""
    statuses = [r['status'] for r in rule_results]
    if 'fail' in statuses:
        return 'fail'
    if 'warn' in statuses:
        return 'warn'
    return 'pass'


def validate_skill_legacy(skill_path: str | Path) -> tuple[bool, str]:
    """
    向後相容介面：回傳 (bool, str) tuple。
    保留舊版行為，單一 skill 驗證用。
    """
    results = validate_skill(skill_path)
    failures = [r for r in results if r['status'] == 'fail']
    warnings = [r for r in results if r['status'] == 'warn']

    if failures:
        msgs = [f"[FAIL] {r['id']}: {r['message']}" for r in failures]
        if warnings:
            msgs += [f"[WARN] {r['id']}: {r['message']}" for r in warnings]
        return False, '\n'.join(msgs)

    result_msg = "[PASS] Skill 格式正確！"
    if warnings:
        result_msg += '\n' + '\n'.join(
            [f"[WARN] {r['id']}: {r['message']}" for r in warnings])
    return True, result_msg


def run_all(skills_root: str | Path, output_json: bool = False) -> int:
    """
    批次驗證所有 skill 子目錄。
    回傳 exit code: 0=全 pass, 1=有 fail。
    """
    skills_root = Path(skills_root)
    if not skills_root.exists():
        print(f"[ERROR] 找不到目錄: {skills_root}")
        return 1

    all_results = []
    total = pass_count = fail_count = warn_count = 0

    skill_dirs = sorted([d for d in skills_root.iterdir() if d.is_dir()])
    for skill_dir in skill_dirs:
        rule_results = validate_skill(skill_dir)
        status = _calc_skill_status(rule_results)
        total += 1
        if status == 'pass':
            pass_count += 1
        elif status == 'fail':
            fail_count += 1
        else:
            warn_count += 1
        all_results.append({
            "skill": skill_dir.name,
            "status": status,
            "rules": rule_results
        })

    summary = {
        "total": total,
        "pass": pass_count,
        "fail": fail_count,
        "warn": warn_count
    }

    if output_json:
        print(json.dumps(
            {"summary": summary, "results": all_results},
            ensure_ascii=False, indent=2))
    else:
        print(f"[SKILL-VALIDATE] 共 {total} 個 Skill | "
              f"✅ {pass_count} Pass | ❌ {fail_count} Fail | ⚠️  {warn_count} Warn")
        for r in all_results:
            if r['status'] != 'pass':
                print(f"\n  [{r['status'].upper()}] {r['skill']}")
                for rule in r['rules']:
                    if rule['status'] == 'fail':
                        print(f"    ❌ {rule['id']}: {rule['message']}")
                    elif rule['status'] == 'warn':
                        print(f"    ⚠️  {rule['id']}: {rule['message']}")

    return 0 if fail_count == 0 else 1


def main():
    args = sys.argv[1:]

    # 解析 --json flag
    output_json = '--json' in args
    if output_json:
        args = [a for a in args if a != '--json']

    # --all <dir> 模式：批次驗證
    if args and args[0] == '--all':
        if len(args) < 2:
            print("用法: python quick_validate.py --all <skills-root-dir> [--json]")
            sys.exit(1)
        sys.exit(run_all(args[1], output_json))

    # 單一 skill 模式
    if not args:
        print("用法: python quick_validate.py <skill-directory>")
        print("      python quick_validate.py --all <skills-root-dir> [--json]")
        sys.exit(1)

    skill_path = args[0]
    if not Path(skill_path).exists():
        print(f"[ERROR] 找不到目錄: {skill_path}")
        sys.exit(1)

    if output_json:
        rule_results = validate_skill(skill_path)
        status = _calc_skill_status(rule_results)
        result = {
            "summary": {
                "total": 1,
                "pass": 1 if status == 'pass' else 0,
                "fail": 1 if status == 'fail' else 0,
                "warn": 1 if status == 'warn' else 0
            },
            "results": [{
                "skill": Path(skill_path).name,
                "status": status,
                "rules": rule_results
            }]
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if status != 'fail' else 1)
    else:
        print(f"[CHECK] 驗證 Skill: {skill_path}\n")
        valid, message = validate_skill_legacy(skill_path)
        print(message)
        sys.exit(0 if valid else 1)


if __name__ == "__main__":
    main()
