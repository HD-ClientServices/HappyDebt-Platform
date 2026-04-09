# Local copy of Anthropic skills

This folder holds **vendored copies** of the Anthropic skills that this
project depends on. They live in the repo so that any context that
doesn't have the skills installed locally can still find the content:

- **Claude Code sessions on CI** (GitHub Actions, Vercel build hooks,
  any automated pipeline) — they don't have access to the user's
  `~/Library/Application Support/Claude/...` directory.
- **A new contributor cloning the repo** — they would otherwise need
  to install each skill manually before their Claude Code sessions
  know about them.
- **Code review / search** — treating the skill knowledge as part of
  the repo means it shows up in grep, GitHub search, and diff history
  alongside the code that uses it.

## Skills vendored here

| Skill | Source | Why this project needs it |
|---|---|---|
| `ghl-api` | Anthropic skills plugin | Reference for GoHighLevel API v2 endpoints, auth flows, webhook payloads, and request/response shapes. Used anywhere the platform touches `/api/pipeline/*` or `/api/webhooks/ghl-call`. |
| `ghl-call-recordings` | Anthropic skills plugin | Hard-won knowledge on how GHL stores and serves call recordings, the `?index=` gotcha for live-transferred calls, n8n OOM patterns, and the Deepgram-vs-Whisper decision that shaped `lib/deepgram/client.ts` and the transcription cascade in `lib/pipeline/process-call.ts`. |

Both skills were read by Claude Code during the original design
sessions for this project, and their recommendations are already
reflected in the code (e.g. Deepgram Nova-3 with `language=multi` as
the primary transcriber, the closer-first fallback pattern for
recording downloads).

## Original location

The authoritative copies live in the user's local Claude skills
plugin directory:

```
~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/.../skills/
```

If you update a skill in its original location and want the repo
copy to stay in sync, re-copy it from there. A simple helper:

```bash
SKILLS_SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/4841afef-b8c9-4d76-bb4c-ba59e9d63af9/f44accbc-4ab2-46fd-8845-f611d159c755/skills"

cp -r "$SKILLS_SRC/ghl-api" docs/skills/
cp -r "$SKILLS_SRC/ghl-call-recordings" docs/skills/
```

The UUID path segments in the source will differ between machines —
if you're a new contributor, your path is
`~/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/<uuid>/<uuid>/skills/`.

## How Claude Code uses these copies

The top-level `CLAUDE.md` has a "Skills that apply to this project"
section that references these files directly. Any Claude Code
session (local or CI) that loads the project's `CLAUDE.md` will
see the references and can open the files on demand.

## Do NOT modify

Treat these as read-only. If you want to extend the knowledge base
for this project, add a new file under `docs/` (not under
`docs/skills/`) so it's clear what's project-specific vs vendored
from upstream.
