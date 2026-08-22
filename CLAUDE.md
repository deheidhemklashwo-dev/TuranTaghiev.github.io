# CLAUDE.md

Instructions for Claude Code when working in this repository.

## Git workflow — mandatory (decided 2026-08-22)

Every content or code change goes through branch → PR → user approval → merge. No exceptions, with one narrow carve-out:

**The only exception:** a visible typo fix, single line, zero CSS/JS/structural change. Nothing else qualifies — not a new content entry, not a PDF, not a CSS value, not a metadata field, even if it looks small.

**Why this is a hard rule, not a guideline:** direct pushes to `main` (bypassing PR) caused real problems multiple times in this repo's history — a silent merge conflict when local work collided with a direct push, an `index.html` file getting renamed to `index 70.html` mid-push (sync tool side effect, caught only because the content was checked before trusting the filename), and changes landing on `main` with no pixel-diff/noise-floor verification at all. The instinct that a change is "small enough to skip the process" has been wrong every time it's been tried here. Treat that instinct as unreliable in this repo specifically.

**In practice, for Claude:**
- Before starting any edit, check `git status` and `git log origin/main..HEAD` / `git log HEAD..origin/main` to catch drift from direct pushes before assuming the working tree matches remote.
- Create a branch, commit, push, and hand the user a PR link. Do not merge — the user reviews and merges themselves.
- Verify with a pixel-diff + noise-floor comparison (headless Chrome screenshots, `System.Drawing` byte-diff via PowerShell) before calling a change done. Separate expected reflow/visual changes from unexplained ones.
- If a direct push to `main` is discovered (i.e., `main` has commits Claude didn't make), don't silently overwrite it — diff it against local work, report what's there, and reconcile before proceeding.
