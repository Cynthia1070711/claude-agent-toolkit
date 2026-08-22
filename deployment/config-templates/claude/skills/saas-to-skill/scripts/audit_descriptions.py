#!/usr/bin/env python3
"""
Skill Description Trigger Audit Tool
One-shot audit: measures precision/recall of each skill's description as a trigger classifier.

Usage:
    python audit_descriptions.py --skill <skill-dir>
    python audit_descriptions.py --skills skill-a,skill-b,skill-c
    python audit_descriptions.py --all <skills-root-dir>
    python audit_descriptions.py --all <skills-root-dir> --json
    python audit_descriptions.py --all <skills-root-dir> --markdown
    python audit_descriptions.py --all <skills-root-dir> --json --output result.json
    python audit_descriptions.py --all <skills-root-dir> --threshold 0.25

# AC4: NO 5-iter loop, NO LLM auto-rewrite, NO SKILL.md modification
# This tool is read-only on SKILL.md files and produces reports only.
# Rewrite is deferred to saas-to-skill Mode B batch processing.
"""

import sys
import re
import io
import json
import math
from pathlib import Path

# Windows console encoding fix (mirrors quick_validate.py convention)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Default configuration
DEFAULT_THRESHOLD = 0.30
DEFAULT_OVERLAP_WEIGHT = 0.4
DEFAULT_COSINE_WEIGHT = 0.6
REPORT_FILTER_THRESHOLD = 0.70  # P or R < 70% → listed in report

# CR-FIX M1 (2026-05-09): suppress auto-gen template noise tokens that leak
# from probe templates ('how to use {kw}' / '{kw} not working' / etc.) into
# suggestion 補關鍵字 lists. These are NOT real description gaps — filtering
# yields more actionable rewrite suggestions.
SUGGESTION_STOP_WORDS = {
    # Auto-gen template fillers (from _autogen_probes templates)
    'how', 'to', 'use', 'using', 'not', 'working', 'implementation',
    'issue', 'problem', 'configuration', 'design', 'usage', 'example',
    'integration', 'debug', 'question',
    # Generic English stopwords commonly tokenized from queries
    'the', 'a', 'an', 'is', 'are', 'in', 'on', 'for', 'of', 'and', 'or',
    'with', 'by', 'from', 'this', 'that', 'it', 'be', 'as', 'at',
}


# ─── Frontmatter Parser (reused from quick_validate.py) ───────────────────────

def parse_frontmatter(text: str) -> dict:
    """Simple YAML frontmatter parser — no PyYAML dependency."""
    result = {}
    current_key = None
    multiline_value = []

    for line in text.split('\n'):
        if current_key and (line.startswith('  ') or line.startswith('\t')):
            multiline_value.append(line.strip())
            continue
        if current_key and multiline_value:
            result[current_key] = ' '.join(multiline_value)
            current_key = None
            multiline_value = []

        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue

        match = re.match(r'^([a-z][a-z0-9-]*)\s*:\s*(.*)', line)
        if match:
            key = match.group(1)
            value = match.group(2).strip()
            if value in ('>-', '>', '|', '|-'):
                current_key = key
                multiline_value = []
                continue
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
            if value.lower() == 'true':
                value = True
            elif value.lower() == 'false':
                value = False
            result[key] = value

    if current_key and multiline_value:
        result[current_key] = ' '.join(multiline_value)

    return result


def load_skill_description(skill_path: Path) -> tuple[str, str]:
    """
    Load skill description + triggers text from SKILL.md.
    Returns (description, triggers_text) or ('', '') if not found.
    """
    skill_md = skill_path / 'SKILL.md'
    if not skill_md.exists():
        return '', ''
    try:
        content = skill_md.read_text(encoding='utf-8')
    except Exception:
        return '', ''

    # CR-FIX H1 (2026-05-09): strip UTF-8 BOM (U+FEFF) so BOM-prefixed
    # SKILL.md (e.g., phycool-admin-module / -rbac / phycool-auth-identity)
    # are not falsely classified as skipped.
    if content.startswith('﻿'):
        content = content[1:]

    if not content.startswith('---'):
        return '', ''
    fm_match = re.match(r'^---\r?\n(.*?)\r?\n---', content, re.DOTALL)
    if not fm_match:
        return '', ''

    fm = parse_frontmatter(fm_match.group(1))
    description = str(fm.get('description', '')).strip()

    # Extract triggers from frontmatter list (yaml array under 'triggers:')
    frontmatter_text = fm_match.group(1)
    triggers_text = _extract_triggers_text(frontmatter_text)

    return description, triggers_text


def _extract_triggers_text(frontmatter_text: str) -> str:
    """Extract triggers list items as plain text from frontmatter."""
    lines = frontmatter_text.split('\n')
    triggers_start = None
    for i, line in enumerate(lines):
        if re.match(r'^triggers\s*:', line):
            triggers_start = i
            break
    if triggers_start is None:
        return ''

    items = []
    for line in lines[triggers_start + 1:]:
        if line and not line[0].isspace():
            break
        stripped = line.strip()
        if stripped.startswith('- '):
            item = stripped[2:].strip().strip('"\'')
            # Skip glob patterns — they're not semantic triggers
            if not item.startswith('glob:'):
                items.append(item)

    return ' '.join(items)


# ─── Tokenizer ────────────────────────────────────────────────────────────────

def tokenize(text: str) -> list:
    """
    Chinese-aware tokenizer:
    - Chinese: each character is a token (Unicode range 4E00-9FFF)
    - CamelCase: split at boundaries (ErrorCode → error, code; also keep whole term)
    - English: word boundary split (lowercase)
    """
    tokens = []
    # Chinese characters (each as separate token)
    for ch in re.findall(r'[一-鿿]', text):
        tokens.append(ch)
    # CamelCase: keep whole term (lowercase) + split into parts
    for camel in re.findall(r'\b[A-Z][a-zA-Z0-9]+(?:[A-Z][a-zA-Z0-9]*)*\b', text):
        tokens.append(camel.lower())
        # Also split CamelCase parts: ErrorCode → [error, code]
        parts = re.findall(r'[A-Z]?[a-z0-9]+|[A-Z]+(?=[A-Z]|$)', camel)
        tokens.extend(p.lower() for p in parts if len(p) > 1)
    # Lowercase English words (non-CamelCase), numbers, and identifiers
    text_lower = text.lower()
    tokens.extend(re.findall(r'[a-z][a-z0-9_/-]*', text_lower))
    return tokens


# ─── IDF Corpus Builder ───────────────────────────────────────────────────────

def build_idf(skill_descs: dict) -> dict:
    """
    Build IDF from all skill descriptions.
    skill_descs: {skill_name: (description, triggers_text)}
    Returns: {token: idf_score}
    """
    N = len(skill_descs)
    if N == 0:
        return {}

    doc_freq: dict = {}
    for desc, trig in skill_descs.values():
        combined = desc + ' ' + trig
        tokens = set(tokenize(combined))
        for t in tokens:
            doc_freq[t] = doc_freq.get(t, 0) + 1

    idf = {}
    for token, df in doc_freq.items():
        # Smoothed IDF: log((N+1)/(df+1)) + 1
        idf[token] = math.log((N + 1) / (df + 1)) + 1.0
    return idf


# ─── Scoring Engine ───────────────────────────────────────────────────────────

def overlap_ratio(query_tokens: list, desc_tokens: list) -> float:
    """Keyword overlap: proportion of query tokens present in description tokens."""
    if not query_tokens:
        return 0.0
    q_set = set(query_tokens)
    d_set = set(desc_tokens)
    return len(q_set & d_set) / len(q_set)


def tfidf_cosine(query_tokens: list, desc_tokens: list, idf: dict) -> float:
    """
    Manual TF-IDF cosine similarity (no sklearn/numpy).
    TF = term count / total tokens in doc.
    """
    def build_tfidf_vec(tokens: list) -> dict:
        if not tokens:
            return {}
        total = len(tokens)
        tf: dict = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        return {t: (count / total) * idf.get(t, 1.0) for t, count in tf.items()}

    q_vec = build_tfidf_vec(query_tokens)
    d_vec = build_tfidf_vec(desc_tokens)

    if not q_vec or not d_vec:
        return 0.0

    # Dot product
    dot = sum(q_vec.get(t, 0.0) * d_vec.get(t, 0.0) for t in q_vec)

    # Norms
    q_norm = math.sqrt(sum(v * v for v in q_vec.values()))
    d_norm = math.sqrt(sum(v * v for v in d_vec.values()))

    if q_norm == 0 or d_norm == 0:
        return 0.0
    return dot / (q_norm * d_norm)


def combined_score(
    query: str,
    desc_text: str,
    idf: dict,
    overlap_w: float = DEFAULT_OVERLAP_WEIGHT,
    cosine_w: float = DEFAULT_COSINE_WEIGHT,
) -> float:
    """Combined score: overlap_w * overlap + cosine_w * cosine."""
    qt = tokenize(query)
    dt = tokenize(desc_text)
    ov = overlap_ratio(qt, dt)
    cs = tfidf_cosine(qt, dt, idf)
    return overlap_w * ov + cosine_w * cs


# ─── Probe Loader ─────────────────────────────────────────────────────────────

def load_probes(
    probe_file: Path,
    skill_name: str,
    skills_root: Path,
    all_skill_descs: dict,
) -> dict:
    """
    Load probes for a skill.
    Priority: manual override in probe_file > auto-gen fallback.
    Returns: {'should_trigger': [...], 'near_miss': [...]}
    """
    # Try manual probes first
    if probe_file.exists():
        try:
            data = json.loads(probe_file.read_text(encoding='utf-8'))
            if skill_name in data:
                entry = data[skill_name]
                should = entry.get('should_trigger', [])
                near = entry.get('near_miss', [])
                if should and near:
                    return {'should_trigger': should, 'near_miss': near}
        except Exception:
            pass

    # Auto-gen fallback: extract triggers from SKILL.md
    return _autogen_probes(skill_name, skills_root, all_skill_descs)


def _extract_trigger_keywords(desc: str) -> list:
    """
    Extract keywords from description:
    1. "Triggers: X, Y, Z" format
    2. "Trigger keywords: X, Y, Z" format
    3. Fallback: CamelCase class names from description
    """
    # Match "Triggers: X, Y, Z" pattern (comma-separated)
    m = re.search(r'Triggers?\s*:\s*([^.]{10,})', desc, re.IGNORECASE)
    if m:
        parts = [p.strip().strip('"\'') for p in m.group(1).split(',')]
        result = [p for p in parts if len(p) > 2][:12]
        if result:
            return result
    # Fallback: "Trigger keywords: X, Y, Z"
    m = re.search(r'Trigger\s+keywords?\s*:\s*([^.]{10,})', desc, re.IGNORECASE)
    if m:
        parts = [p.strip().strip('"\'') for p in m.group(1).split(',')]
        result = [p for p in parts if len(p) > 2][:12]
        if result:
            return result
    # Fallback: extract CamelCase class names (likely technical trigger keywords)
    camel_terms = re.findall(r'\b[A-Z][a-zA-Z0-9]{3,}\b', desc)
    seen = set()
    unique = []
    for t in camel_terms:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    if unique:
        return unique[:10]
    return []


def _autogen_probes(
    skill_name: str,
    skills_root: Path,
    all_skill_descs: dict,
) -> dict:
    """
    Auto-generate probes from SKILL.md triggers.
    should_trigger: direct use of Triggers: keywords from description
    near_miss: triggers from same-domain neighbor skills
    """
    desc, trig = all_skill_descs.get(skill_name, ('', ''))

    # Priority: extract from description "Triggers:" section directly
    trigger_keywords = _extract_trigger_keywords(desc)

    if trigger_keywords:
        # Use trigger keywords directly + simple English templates for diversity
        should_trigger = []
        templates = [
            '{kw}',  # bare keyword (high overlap)
            '{kw} implementation',
            '{kw} issue',
            'how to use {kw}',
            '{kw} not working',
        ]
        for i, kw in enumerate(trigger_keywords[:8]):
            tmpl = templates[i % len(templates)]
            should_trigger.append(tmpl.format(kw=kw))
    else:
        # Fallback: tokenize description
        combined = desc + ' ' + trig
        stop = {'the', 'a', 'an', 'is', 'are', 'in', 'on', 'for', 'of', 'to', 'and', 'or',
                'use', 'when', 'triggers', 'trigger', 'keywords', 'use', 'with', 'by', 'from'}
        kw_tokens = [t for t in tokenize(combined)
                     if len(t) > 2 and t not in stop and not re.match(r'^\d+$', t)]
        seen_set = set()
        unique_kw = []
        for t in kw_tokens:
            if t not in seen_set:
                seen_set.add(t)
                unique_kw.append(t)
        top_kw = unique_kw[:8]

        templates = [
            '{kw} implementation issue',
            'how to implement {kw}',
            '{kw} integration problem',
            '{kw} not working',
            '{kw} configuration',
            'debug {kw} issue',
            '{kw} design question',
            '{kw} usage example',
        ]
        should_trigger = []
        for i, kw in enumerate(top_kw[:8]):
            tmpl = templates[i % len(templates)]
            should_trigger.append(tmpl.format(kw=kw))

    # Near-miss: find neighbor skills in same domain
    domain = _infer_domain(skill_name)
    near_miss = _neighbor_triggers(skill_name, domain, skills_root, all_skill_descs)

    return {
        'should_trigger': should_trigger[:10],
        'near_miss': near_miss[:10],
    }


def _infer_domain(skill_name: str) -> str:
    """Infer domain from skill name (aligns with auto-skill-detection.md Domain Profile)."""
    if any(x in skill_name for x in ['payment', 'invoice', 'remittance']):
        return 'payment'
    if any(x in skill_name for x in ['admin', 'rbac', 'dashboard']):
        return 'admin'
    if any(x in skill_name for x in ['zustand', 'type-canonical']):
        return 'state'
    if any(x in skill_name for x in ['design-system', 'tooltip', 'progress-animation']):
        return 'design'
    if any(x in skill_name for x in ['editor', 'floating-ui']):
        return 'editor'
    if any(x in skill_name for x in ['pdf', 'signalr', 'i18n', 'azure', 'e2e', 'testing', 'integration']):
        return 'infrastructure'
    return 'workflow'


DOMAIN_MAP = {
    'payment': ['phycool-payment-subscription', 'phycool-invoice-receipt', 'phycool-remittance-review'],
    'admin': ['phycool-admin-module', 'phycool-admin-account', 'phycool-admin-dashboard'],
    'state': ['phycool-zustand-patterns', 'phycool-type-canonical'],
    'design': ['phycool-design-system', 'phycool-tooltip', 'phycool-progress-animation'],
    'editor': ['phycool-editor-arch', 'phycool-editor-data-features', 'phycool-floating-ui'],
    'infrastructure': ['phycool-pdf-engine', 'phycool-signalr-realtime', 'phycool-i18n-seo',
                       'phycool-azure-infra', 'phycool-e2e-playwright', 'phycool-testing-patterns',
                       'phycool-integration-testing'],
}


def _neighbor_triggers(
    skill_name: str,
    domain: str,
    skills_root: Path,
    all_skill_descs: dict,
) -> list:
    """Get trigger-based near_miss from same-domain neighbor skills."""
    neighbors = [s for s in DOMAIN_MAP.get(domain, []) if s != skill_name]
    near_miss = []
    for neighbor in neighbors[:3]:
        n_desc, n_trig = all_skill_descs.get(neighbor, ('', ''))
        combined = n_desc + ' ' + n_trig
        tokens = [t for t in tokenize(combined)
                  if len(t) > 2 and not t.startswith('src') and not re.match(r'^\d+$', t)]
        seen = set()
        for t in tokens:
            if t not in seen:
                seen.add(t)
                if len(near_miss) < 10:
                    near_miss.append(f'{t} implementation')
    return near_miss[:8]


# ─── Metrics Calculator ───────────────────────────────────────────────────────

def calc_metrics(
    skill_name: str,
    desc: str,
    trig: str,
    probes: dict,
    idf: dict,
    threshold: float,
    manual_probe_skills: set | None = None,
) -> dict:
    """
    Run probes against skill description+triggers, compute P/R metrics.
    Returns metrics dict with TP/FP/FN/TN and sample queries.
    """
    desc_text = desc + ' ' + trig

    should_trigger = probes.get('should_trigger', [])
    near_miss = probes.get('near_miss', [])

    tp_queries = []  # should_trigger + predicted Y
    fn_queries = []  # should_trigger + predicted N (undertrigger)
    tn_queries = []  # near_miss + predicted N
    fp_queries = []  # near_miss + predicted Y (overtrigger)
    tp_scores = []
    fn_scores = []
    fp_scores = []

    for q in should_trigger:
        score = combined_score(q, desc_text, idf)
        if score > threshold:
            tp_queries.append({'query': q, 'score': round(score, 4)})
            tp_scores.append(score)
        else:
            fn_queries.append({'query': q, 'score': round(score, 4)})
            fn_scores.append(score)

    for q in near_miss:
        score = combined_score(q, desc_text, idf)
        if score > threshold:
            fp_queries.append({'query': q, 'score': round(score, 4)})
            fp_scores.append(score)
        else:
            tn_queries.append({'query': q, 'score': round(score, 4)})

    tp = len(tp_queries)
    fp = len(fp_queries)
    fn = len(fn_queries)
    tn = len(tn_queries)

    # P/R with div-by-zero guard (AC5: TP+FP=0 → P=1.0; TP+FN=0 → R=1.0)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0

    return {
        'skill': skill_name,
        'precision': round(precision, 4),
        'recall': round(recall, 4),
        'tp': tp,
        'fp': fp,
        'fn': fn,
        'tn': tn,
        'total_probes': len(should_trigger) + len(near_miss),
        'fn_samples': fn_queries[:5],   # top undertrigger examples
        'fp_samples': fp_queries[:5],   # top overtrigger examples
        'tp_samples': tp_queries[:3],
        'description_truncated': (desc[:200] + '...') if len(desc) > 200 else desc,
        # CR-FIX M2 (2026-05-09): use injected set instead of module-level
        # mutable global (_MANUAL_PROBE_SKILLS) — eliminates implicit shared
        # state, makes function pure (testable + reentrant)
        'probe_source': 'manual' if (manual_probe_skills and skill_name in manual_probe_skills) else 'auto-gen',
    }


# ─── Suggestion Generator ─────────────────────────────────────────────────────

def generate_suggestions(metrics: dict, desc: str) -> list:
    """
    Rule-based suggestion generator (NO LLM, NO auto-rewrite — AC4 guard).
    Returns list of suggestion strings.
    """
    suggestions = []
    precision = metrics['precision']
    recall = metrics['recall']

    # High FN (low recall) → missing keywords
    if recall < REPORT_FILTER_THRESHOLD:
        fn_queries = [item['query'] for item in metrics.get('fn_samples', [])]
        if fn_queries:
            missing_kw = []
            desc_tokens = set(tokenize(desc))
            for q in fn_queries[:3]:
                for t in tokenize(q):
                    # CR-FIX M1: filter SUGGESTION_STOP_WORDS to avoid
                    # template-noise tokens (how/use/not/working/...) being
                    # falsely surfaced as "missing keywords"
                    if (t not in desc_tokens
                            and len(t) > 2
                            and t not in SUGGESTION_STOP_WORDS):
                        missing_kw.append(t)
            if missing_kw:
                unique_kw = list(dict.fromkeys(missing_kw))[:5]
                suggestions.append(f'補關鍵字: {", ".join(unique_kw)}')
            suggestions.append('Recall 偏低 → undertrigger。建議加入常用觸發詞彙到 description Triggers 段落')

    # High FP (low precision) → over-broad terms
    if precision < REPORT_FILTER_THRESHOLD:
        fp_queries = [item['query'] for item in metrics.get('fp_samples', [])]
        if fp_queries:
            broad_kw = []
            for q in fp_queries[:3]:
                # CR-FIX M1: filter stopwords from FP broad-term suggestions
                tokens = [t for t in tokenize(q)
                          if len(t) > 2 and t not in SUGGESTION_STOP_WORDS]
                broad_kw.extend(tokens[:2])
            unique_broad = list(dict.fromkeys(broad_kw))[:3]
            if unique_broad:
                suggestions.append(f'刪過寬詞彙: {", ".join(unique_broad)} (造成 overtrigger)')
        suggestions.append('Precision 偏低 → overtrigger。建議縮窄 description 範圍，加 "Use when" 限定觸發條件')

    # CSO-3RD: first/second person pronoun check
    if re.search(r'\bI\b|\bI\'[a-z]+\b|\byou\b|\byour\b|\b我\b|\b你\b|\b妳\b', desc, re.IGNORECASE):
        suggestions.append('改 third-person: description 含第一/二人稱代詞 (I/you/我/你)')

    # CSO-USEWHEN: missing trigger prefix
    prefix = desc[:150]
    usewhen_pat = re.compile(r'Use\s+when|Triggers?\s*:|Use\s+for|觸發|當.*?時|何時', re.IGNORECASE)
    if not usewhen_pat.search(prefix):
        suggestions.append('加 "Use when" 開頭: description 前 150 字缺觸發條件說明')

    if not suggestions:
        suggestions.append('description 品質良好，無明顯改寫需求')

    return suggestions


# ─── Report Generator ─────────────────────────────────────────────────────────

def generate_markdown_report(all_metrics: list, threshold: float) -> str:
    """
    Generate 3-column Markdown report for skills with P or R < REPORT_FILTER_THRESHOLD.
    AC3 strict: current description / 失敗 query 範例 / 改寫建議
    """
    skipped = [m for m in all_metrics if m.get('skipped')]
    audited = [m for m in all_metrics if not m.get('skipped')]
    violations = [m for m in audited
                  if m['precision'] < REPORT_FILTER_THRESHOLD
                  or m['recall'] < REPORT_FILTER_THRESHOLD]
    passing = [m for m in audited
               if m['precision'] >= REPORT_FILTER_THRESHOLD
               and m['recall'] >= REPORT_FILTER_THRESHOLD]

    lines = [
        '# Skill Description Trigger Audit Report',
        '',
        f'**Generated**: 2026-05',
        f'**Total skills audited**: {len(all_metrics)}',
        f'**Scoring threshold**: {threshold}',
        f'**Report threshold**: P or R < {REPORT_FILTER_THRESHOLD * 100:.0f}%',
        '',
        '## Summary',
        '',
        f'| Category | Count |',
        f'|----------|-------|',
        f'| Violations (P or R < 70%) | {len(violations)} |',
        f'| Passing (P and R ≥ 70%) | {len(passing)} |',
        f'| Skipped (missing description) | {len(skipped)} |',
        f'| Total | {len(all_metrics)} |',
        '',
    ]

    if not violations:
        lines.append('*No violations found — all skills pass the 70% threshold.*')
        lines.append('')
    else:
        lines.append('## Top Violations')
        lines.append('')
        lines.append('Skills with Precision < 70% OR Recall < 70% (sorted by combined P+R ascending):')
        lines.append('')

        # Sort by P+R ascending (worst first)
        violations_sorted = sorted(violations, key=lambda m: m['precision'] + m['recall'])

        lines.append('| Skill | P | R | Issue |')
        lines.append('|-------|---|---|-------|')
        for m in violations_sorted:
            issue = []
            if m['precision'] < REPORT_FILTER_THRESHOLD:
                issue.append(f'overtrigger (P={m["precision"]:.2f})')
            if m['recall'] < REPORT_FILTER_THRESHOLD:
                issue.append(f'undertrigger (R={m["recall"]:.2f})')
            lines.append(f'| {m["skill"]} | {m["precision"]:.2f} | {m["recall"]:.2f} | {"; ".join(issue)} |')

        lines.append('')
        lines.append('## Detailed Analysis')
        lines.append('')
        lines.append('> **3-column format**: Current Description | Failed Query Examples | Rewrite Suggestions')
        lines.append('')

        for m in violations_sorted:
            lines.append(f'### {m["skill"]}')
            lines.append('')
            lines.append(f'**Metrics**: Precision={m["precision"]:.4f} | Recall={m["recall"]:.4f} | '
                         f'TP={m["tp"]} FP={m["fp"]} FN={m["fn"]} TN={m["tn"]} | '
                         f'Probes={m["total_probes"]} | Source={m["probe_source"]}')
            lines.append('')
            lines.append('| Column | Content |')
            lines.append('|--------|---------|')

            # Column 1: Current description (truncated)
            desc_display = m['description_truncated'].replace('\n', ' ').replace('|', '\\|')
            lines.append(f'| **Current Description** | {desc_display} |')

            # Column 2: Failed query examples (top-3 FN + top-3 FP)
            fn_ex = '; '.join([f'FN: {x["query"]} (score={x["score"]})' for x in m['fn_samples'][:3]])
            fp_ex = '; '.join([f'FP: {x["query"]} (score={x["score"]})' for x in m['fp_samples'][:3]])
            failed_ex = ' | '.join(filter(None, [fn_ex, fp_ex]))
            if not failed_ex:
                failed_ex = '(no failures)'
            lines.append(f'| **失敗 Query 範例** | {failed_ex} |')

            # Column 3: Suggestions
            suggestions = m.get('suggestions', ['(no suggestions)'])
            sugg_text = '; '.join(suggestions)
            lines.append(f'| **改寫建議** | {sugg_text} |')

            lines.append('')

    # Passing skills summary
    if passing:
        lines.append('## Passing Skills')
        lines.append('')
        lines.append('| Skill | Precision | Recall |')
        lines.append('|-------|-----------|--------|')
        for m in sorted(passing, key=lambda x: x['skill']):
            lines.append(f'| {m["skill"]} | {m["precision"]:.2f} | {m["recall"]:.2f} |')
        lines.append('')

    # Skipped skills
    if skipped:
        lines.append('## Skipped Skills')
        lines.append('')
        lines.append('| Skill | Reason |')
        lines.append('|-------|--------|')
        for m in skipped:
            lines.append(f'| {m["skill"]} | {m.get("skip_reason", "missing description")} |')
        lines.append('')

    lines.append('---')
    lines.append('')
    lines.append('*Report generated by `audit_descriptions.py`. '
                 'Rewrite suggestions are template-based approximations — '
                 'human review recommended before applying changes via saas-to-skill Mode B.*')

    return '\n'.join(lines)


# ─── Main Audit Runner ────────────────────────────────────────────────────────

def audit_skill(
    skill_path: Path,
    probe_file: Path,
    idf: dict,
    all_skill_descs: dict,
    threshold: float,
    manual_probe_skills: set | None = None,
) -> dict:
    """Audit a single skill. Returns metrics dict.

    CR-FIX M2 (2026-05-09): manual_probe_skills threaded through (was module-level global).
    """
    skill_name = skill_path.name
    desc, trig = all_skill_descs.get(skill_name, ('', ''))

    if not desc:
        return {
            'skill': skill_name,
            'skipped': True,
            'skip_reason': 'missing or empty description',
            'precision': 0.0,
            'recall': 0.0,
        }

    probes = load_probes(probe_file, skill_name, skill_path.parent, all_skill_descs)

    if not probes['should_trigger'] and not probes['near_miss']:
        return {
            'skill': skill_name,
            'skipped': True,
            'skip_reason': 'no probes available (auto-gen also failed)',
            'precision': 0.0,
            'recall': 0.0,
        }

    metrics = calc_metrics(skill_name, desc, trig, probes, idf, threshold, manual_probe_skills)
    metrics['suggestions'] = generate_suggestions(metrics, desc)
    return metrics


def load_all_skill_descs(skills_root: Path) -> dict:
    """Load all skill descriptions + triggers for IDF corpus building."""
    result = {}
    for skill_dir in skills_root.iterdir():
        if skill_dir.is_dir():
            desc, trig = load_skill_description(skill_dir)
            result[skill_dir.name] = (desc, trig)
    return result


def run_audit(
    skills_root: Path,
    probe_file: Path,
    skill_filter: list | None,
    threshold: float,
    output_json: bool,
    output_markdown: bool,
    output_path: Path | None,
) -> int:
    """Main audit runner. Returns exit code (0=success, 1=error)."""
    if not skills_root.exists():
        print(f'[ERROR] Skills root not found: {skills_root}', file=sys.stderr)
        return 1

    # Load all skill descriptions for IDF
    all_skill_descs = load_all_skill_descs(skills_root)

    # CR-FIX M2 (2026-05-09): manual_probe_skills as local var (was module global).
    # Threaded through audit_skill → calc_metrics for probe_source classification.
    manual_probe_skills: set = set()
    if probe_file.exists():
        try:
            probe_data = json.loads(probe_file.read_text(encoding='utf-8'))
            for k in probe_data:
                if not k.startswith('_'):
                    manual_probe_skills.add(k)
        except Exception:
            pass

    # Build IDF corpus
    idf = build_idf(all_skill_descs)

    # Select skills to audit
    if skill_filter:
        skill_dirs = [skills_root / s for s in skill_filter if (skills_root / s).is_dir()]
        missing = [s for s in skill_filter if not (skills_root / s).is_dir()]
        if missing:
            print(f'[WARN] Skills not found: {", ".join(missing)}', file=sys.stderr)
    else:
        skill_dirs = sorted([d for d in skills_root.iterdir() if d.is_dir()])

    # Run audit for each skill
    all_metrics = []
    for skill_dir in skill_dirs:
        metrics = audit_skill(skill_dir, probe_file, idf, all_skill_descs, threshold, manual_probe_skills)
        all_metrics.append(metrics)

        # Single-skill console output (AC1: 20 probe results + P/R)
        if skill_filter and len(skill_filter) == 1 and not output_json and not output_markdown:
            _print_single_skill_detail(metrics, skill_dir, probe_file, all_skill_descs, idf, threshold)

    violations = [m for m in all_metrics
                  if not m.get('skipped')
                  and (m['precision'] < REPORT_FILTER_THRESHOLD
                       or m['recall'] < REPORT_FILTER_THRESHOLD)]

    # Output handling
    if output_json:
        output_data = {
            'meta': {
                'threshold': threshold,
                'report_filter_threshold': REPORT_FILTER_THRESHOLD,
                'total_skills': len(all_metrics),
                'violations': len(violations),
                'skipped': sum(1 for m in all_metrics if m.get('skipped')),
            },
            'results': all_metrics,
        }
        json_str = json.dumps(output_data, ensure_ascii=False, indent=2)
        if output_path:
            output_path.write_text(json_str, encoding='utf-8')
            print(f'[OK] JSON output written to {output_path}', file=sys.stderr)
        else:
            print(json_str)

    elif output_markdown:
        md_str = generate_markdown_report(all_metrics, threshold)
        if output_path:
            output_path.write_text(md_str, encoding='utf-8')
            print(f'[OK] Markdown report written to {output_path}', file=sys.stderr)
        else:
            print(md_str)

    else:
        # Console summary
        total = len(all_metrics)
        skipped = sum(1 for m in all_metrics if m.get('skipped'))
        audited = total - skipped
        print(f'[AUDIT] {total} skills | Audited: {audited} | Violations: {len(violations)} | Skipped: {skipped}')
        print(f'[AUDIT] Threshold: {threshold} | Report filter: P or R < {REPORT_FILTER_THRESHOLD}')
        print()
        for m in all_metrics:
            if m.get('skipped'):
                print(f'  [SKIP] {m["skill"]}: {m.get("skip_reason", "")}')
            elif m['precision'] < REPORT_FILTER_THRESHOLD or m['recall'] < REPORT_FILTER_THRESHOLD:
                print(f'  [FAIL] {m["skill"]}: precision={m["precision"]:.2f} recall={m["recall"]:.2f}')
            else:
                print(f'  [PASS] {m["skill"]}: precision={m["precision"]:.2f} recall={m["recall"]:.2f}')

    return 0


def _print_single_skill_detail(
    metrics: dict,
    skill_dir: Path,
    probe_file: Path,
    all_skill_descs: dict,
    idf: dict,
    threshold: float,
) -> None:
    """Print detailed probe results for single-skill mode (AC1 compliance)."""
    skill_name = skill_dir.name
    desc, trig = all_skill_descs.get(skill_name, ('', ''))
    probes = load_probes(probe_file, skill_name, skill_dir.parent, all_skill_descs)
    desc_text = desc + ' ' + trig

    print(f'[SKILL] {skill_name}')
    print(f'[DESC] {desc[:100]}...' if len(desc) > 100 else f'[DESC] {desc}')
    print()
    print('--- should_trigger probes ---')
    for q in probes.get('should_trigger', []):
        score = combined_score(q, desc_text, idf)
        result = 'MATCH' if score > threshold else 'MISS'
        print(f'  [{result}] score={score:.4f} | {q}')

    print()
    print('--- near_miss probes ---')
    for q in probes.get('near_miss', []):
        score = combined_score(q, desc_text, idf)
        result = 'FP' if score > threshold else 'OK'
        print(f'  [{result}] score={score:.4f} | {q}')

    print()
    print(f'precision: {metrics["precision"]:.4f}')
    print(f'recall:    {metrics["recall"]:.4f}')
    print(f'TP={metrics["tp"]} FP={metrics["fp"]} FN={metrics["fn"]} TN={metrics["tn"]}')
    print(f'probe_source: {metrics["probe_source"]}')
    if metrics.get('suggestions'):
        print()
        print('suggestions:')
        for s in metrics['suggestions']:
            print(f'  - {s}')


# ─── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    # AC4: NO 5-iter loop, NO LLM auto-rewrite, NO SKILL.md modification
    args = sys.argv[1:]

    output_json = '--json' in args
    output_markdown = '--markdown' in args
    args = [a for a in args if a not in ('--json', '--markdown')]

    # --threshold <value>
    threshold = DEFAULT_THRESHOLD
    if '--threshold' in args:
        idx = args.index('--threshold')
        if idx + 1 < len(args):
            try:
                threshold = float(args[idx + 1])
                args.pop(idx + 1)
                args.pop(idx)
            except ValueError:
                print(f'[ERROR] Invalid threshold value', file=sys.stderr)
                sys.exit(1)

    # --output <path>
    output_path = None
    if '--output' in args:
        idx = args.index('--output')
        if idx + 1 < len(args):
            output_path = Path(args[idx + 1])
            args.pop(idx + 1)
            args.pop(idx)

    # Default probe file location
    script_dir = Path(__file__).parent.parent.parent.parent  # project root
    probe_file = script_dir / 'audit' / 'probes' / 'probe-templates.json'

    # Fallback: try relative to cwd
    if not probe_file.exists():
        probe_file = Path('audit/probes/probe-templates.json')

    # --all <skills-root>
    if args and args[0] == '--all':
        if len(args) < 2:
            print('Usage: python audit_descriptions.py --all <skills-root> [--json|--markdown]')
            sys.exit(1)
        skills_root = Path(args[1])
        sys.exit(run_audit(skills_root, probe_file, None, threshold, output_json, output_markdown, output_path))

    # --skill <skill-dir>
    if args and args[0] == '--skill':
        if len(args) < 2:
            print('Usage: python audit_descriptions.py --skill <skill-dir>')
            sys.exit(1)
        skill_path = Path(args[1])
        skills_root = skill_path.parent
        sys.exit(run_audit(skills_root, probe_file, [skill_path.name], threshold, output_json, output_markdown, output_path))

    # --skills skill-a,skill-b,...
    if args and args[0] == '--skills':
        if len(args) < 2:
            print('Usage: python audit_descriptions.py --skills skill-a,skill-b')
            sys.exit(1)
        skill_names = [s.strip() for s in args[1].split(',')]
        # Detect skills root: parent of first skill
        first = Path(skill_names[0])
        if first.exists():
            skills_root = first.parent
            skill_filter = [p.name for p in [Path(s) for s in skill_names]]
        else:
            # Relative names — use cwd as skills root fallback
            skills_root = Path('.claude/skills')
            if not skills_root.exists():
                skills_root = Path('.')
            skill_filter = skill_names
        sys.exit(run_audit(skills_root, probe_file, skill_filter, threshold, output_json, output_markdown, output_path))

    print('Usage:')
    print('  python audit_descriptions.py --skill <skill-dir>')
    print('  python audit_descriptions.py --skills skill-a,skill-b')
    print('  python audit_descriptions.py --all <skills-root-dir>')
    print('  python audit_descriptions.py --all <skills-root-dir> --json [--output file.json]')
    print('  python audit_descriptions.py --all <skills-root-dir> --markdown [--output file.md]')
    print('  python audit_descriptions.py --all <skills-root-dir> --threshold 0.25')
    sys.exit(1)


if __name__ == '__main__':
    main()
