#!/bin/bash
# Claude Code Session Info Script
# Usage: bash show-session-info.sh
# Shows current Claude Code version, installed plugins, MCP servers, and config locations

echo "=== Claude Code Session Info ==="
echo ""

# Version
echo "Version:"
claude --version 2>/dev/null || echo "  claude CLI not found in PATH"
echo ""

# Config locations
echo "Config Locations:"
echo "  User settings:    ~/.claude/settings.json"
echo "  Project settings: .claude/settings.json"
echo "  Local settings:   .claude/settings.local.json"
echo "  Global state:     ~/.claude.json"
echo "  MCP config:       .mcp.json"
echo ""

# Check for CLAUDE.md
echo "CLAUDE.md Files:"
for f in CLAUDE.md .claude/CLAUDE.md ~/.claude/CLAUDE.md; do
  if [ -f "$f" ]; then
    lines=$(wc -l < "$f" 2>/dev/null)
    echo "  $f ($lines lines)"
  fi
done
echo ""

# Check for skills
echo "Project Skills:"
if [ -d ".claude/skills" ]; then
  for d in .claude/skills/*/; do
    if [ -f "${d}SKILL.md" ]; then
      name=$(basename "$d")
      echo "  /$(basename "$d")"
    fi
  done
else
  echo "  (none)"
fi
echo ""

# Check for agents
echo "Project Agents:"
if [ -d ".claude/agents" ]; then
  for f in .claude/agents/*.md; do
    [ -f "$f" ] && echo "  $(basename "$f" .md)"
  done
else
  echo "  (none)"
fi
echo ""

# Check MCP servers from .mcp.json
echo "Project MCP Servers (.mcp.json):"
if [ -f ".mcp.json" ]; then
  node -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('.mcp.json', 'utf8'));
      const servers = Object.keys(data.mcpServers || {});
      if (servers.length) servers.forEach(s => console.log('  ' + s));
      else console.log('  (none)');
    } catch(e) { console.log('  (parse error)'); }
  " 2>/dev/null || echo "  (node not available)"
else
  echo "  (no .mcp.json)"
fi
echo ""

# Check rules
echo "Project Rules (.claude/rules/):"
if [ -d ".claude/rules" ]; then
  for f in .claude/rules/*.md; do
    [ -f "$f" ] && echo "  $(basename "$f")"
  done
else
  echo "  (none)"
fi
echo ""

echo "=== End ==="
