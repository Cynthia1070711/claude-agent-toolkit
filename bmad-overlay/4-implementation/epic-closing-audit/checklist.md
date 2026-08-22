# Epic Closing Audit Checklist

<critical>This checklist validates that the epic-closing-audit workflow produced a complete and actionable report.</critical>
<critical>Work through each section systematically before marking the audit as complete.</critical>

<checklist>

<section n="1" title="DB Schema Consistency Audit">

<check-item id="1.1">
<prompt>Latest migration date identified</prompt>
<action>Confirm latest .cs migration file timestamp was parsed correctly (format: YYYYMMDDHHMMSS)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.2">
<prompt>database-schema.md Last Updated date extracted</prompt>
<action>Confirm date found in first 15 lines of database-schema.md</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.3">
<prompt>Gap calculation correct and severity assigned</prompt>
<action>Verify: CRITICAL if gap > 14 days, WARNING if 7-14 days, OK if 0-7 days</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="1.4">
<prompt>New entities from epic extracted</prompt>
<action>Confirm scan of story File Lists for new Model/Migration/DbContext files</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<halt-condition>
<action if="migration files unreadable">HALT: "Cannot audit DB schema without access to Migrations directory"</action>
</halt-condition>

</section>

<section n="2" title="Documentation Staleness Scan">

<check-item id="2.1">
<prompt>Modified source files collected from all epic story File Lists</prompt>
<action>Verify Controllers, Services, Models, Program.cs changes were captured</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.2">
<prompt>All documentation files checked for Last Updated date</prompt>
<action>Verify scope: database-schema.md, architecture/*.md, technical-specs/*.md, project-context.md</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="2.3">
<prompt>Stale docs flagged with gap_days and affected_modules</prompt>
<action>Each stale doc entry has: path, last_updated, gap_days, affected_modules</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="3" title="Skill Coverage Analysis">

<check-item id="3.1">
<prompt>skills_list.md trigger keywords extracted per skill</prompt>
<action>Confirm keyword map built: skill_name → [keywords]</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.2">
<prompt>New patterns from epic file list collected</prompt>
<action>Verify new Services, Models, frontend patterns captured</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.3">
<prompt>Coverage percentage calculated correctly</prompt>
<action>Formula: covered_count / total_count * 100</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="3.4">
<prompt>Uncovered patterns listed clearly</prompt>
<action>Each uncovered pattern has: pattern_name, pattern_type, suggested_skill_topic</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="4" title="ADR Gap Assessment">

<check-item id="4.1">
<prompt>Existing ADR list loaded from docs/technical-decisions/</prompt>
<action>ADR count matches directory content</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="4.2">
<prompt>Epic architectural decisions identified</prompt>
<action>Scanned for: new DbSet, new interfaces, new middleware, new external integrations</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="4.3">
<prompt>Each decision matched against existing ADRs</prompt>
<action>COVERED or NEEDS_ADR classification for each decision</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="5" title="Fix Story Generation">

<check-item id="5.1">
<prompt>All actionable findings converted to TD story frameworks</prompt>
<action>Verify: DB CRITICAL → story, stale docs → stories, coverage &lt; 80% → story, missing ADRs → stories</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.2">
<prompt>Story files created in docs/implementation-artifacts/stories/epic-td/</prompt>
<action>Each generated story has Story 資訊 table + Story + AC + Tasks sections</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.3">
<prompt>sprint-status.yaml updated with new backlog stories</prompt>
<action>Each new story appears in sprint-status.yaml under epic-td section</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="5.4">
<prompt>Tracking files created for new stories</prompt>
<action>Each new story has a corresponding .track.md in docs/tracking/active/</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

<section n="6" title="Final Report Quality">

<check-item id="6.1">
<prompt>All 6 report sections filled (including Summary)</prompt>
<action>Verify report file has no placeholder text remaining</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.2">
<prompt>Health score calculated and reflects findings accurately</prompt>
<action>Score = 25 pts per clean category (DB/Docs/Skills/ADR)</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

<check-item id="6.3">
<prompt>Report saved to correct output path</prompt>
<action>File exists at: docs/implementation-artifacts/reviews/epic-{epic_id}/epic-{epic_id}-closing-audit-{date}.md</action>
<status>[ ] Done / [ ] N/A / [ ] Action-needed</status>
</check-item>

</section>

</checklist>

<execution-notes>
<note>This workflow is data-driven — results depend on story File List completeness</note>
<note>Semi-automatic: AI performs scanning, human validates architectural decision classification</note>
<note>Run at epic completion (all stories done), optionally at 50% and 75% milestones</note>
<note>Generated fix stories follow BMAD story template and enter backlog for create-story refinement</note>
</execution-notes>
