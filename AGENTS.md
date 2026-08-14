# Project Memory

This repo contains the implemented V2 experience and the deliverable V3 experience with full-featured desktop and portrait mobile support.

## Hard constraints

- V3 must support desktop and portrait phones with feature parity. Do not target tablets or landscape layouts.
- Keep the MVP minimal and shippable. Prefer simple, direct implementations over broad abstraction.
- Use local SQLite for persistence.
- Do not add OAuth.
- Deploy to a cloud service, but keep the app compatible with local SQLite read/write.
- Use a Python backend because the user's prior cloud deployment can reuse Python service setup.
- V2 currently uses `search zhihu`; V3 may additionally use the official `answer` command for constrained recap and assistant flows.
- Do not implement real publishing. Sharing/publishing CTAs may link to the Zhihu main site.
- V3 may use official Zhihu Direct Answer through `zhihu-cli answer`, but reviewed facts, sources, evidence eligibility, scoring, and medical boundaries must remain server-controlled, with a complete template fallback.
- Use only the current `看山三视图/` assets. If extra images are needed, provide Image-to-Image prompts for the user to generate.
- Polish for an immersive detective-agency/file-desk feeling. This should be a boutique MVP, not a rough wireframe.
- V3 QA targets: desktop 1440x900 primary and 1366x768 compatible; portrait mobile 390x844 primary and 375x812 compatible.
- Treat the attached PDF activity brief as the source of contest rules.

## Contest rules to remember

- The project must use 看山-related elements.
- The project must connect to at least one Zhihu Open Platform CLI capability.
- The demo must be runnable and experienceable.
- Keep the work original and compliant.

## Repo / delivery rules

- Commit local SQLite data, local images, and other static files needed for the demo.
- Keep local and submitted environments aligned as much as possible.
- Prefer simple, reproducible local setup.
- Start with demo seed data, and provide a content-fill template for humans to replace sources/excerpts/facts later.
- The user will initialize git after local development is complete.

## Evaluation notes

- Reward useful interaction, clear experience, and natural use of 看山 elements.
- Demo smoothness matters more than feature breadth.
- The official activity PDF is: `/Users/zhihu/Downloads/看山coding挑战赛｜全员活动说明.pdf`

## Local reference docs

- Product interaction spec text: `docs/product-interaction-spec-v1.0.md`
- Original product DOCX: `docs/source/看山侦探事务所_活动产品交互方案_V1.0.docx`
- Technical spec: `docs/technical-spec.md`
- V3 technical design: `docs/v3.0-technical-design.md`
- Read `AGENTS.md`, then the product spec, then the technical spec before major development work.

## Current implementation status

- The PC-only MVP is implemented with React/Vite, FastAPI, and SQLite.
- The complete P01-P07 path is playable, including T01-T05, evidence/puzzle unlocks, hard-rule reasoning, assisted close, report, and share draft.
- The official `zhihu-cli 0.3.0` integration is limited to `search zhihu`; explicit demo fallback is available.
- The production Docker image installs the official Linux `zhihu-cli 0.3.0` at `/usr/local/bin/zhihu-cli` with SHA-256 verification. Sealos must provide `ZHIHU_ACCESS_SECRET` as an environment variable; never commit it.
- Production build is served by FastAPI at port 8000 after `pnpm build`.
- Browser QA passed at 1440x900 and 1366x768 with no horizontal overflow.
- `public/assets/kanshan/kanshan-cutout.png` is a local chroma-key cutout derived from the supplied green-screen three-view asset; it is not a generated image.
- The user-generated Image2 art is integrated into the playable flow: `kanshan-agency-hero.png` (home), `investigation-desk-bg.png` (desk), `case001-evidence-photo.png` (brief), and `case001-truth-puzzle.png` (3x3 puzzle).
- `kanshan-detective-poses.png` is the original transparent four-pose sheet. Its runtime crops are `kanshan-pose-search.png`, `kanshan-pose-read.png`, `kanshan-pose-think.png`, and `kanshan-pose-close.png`; keep the source sheet and all four crops in git.
- The generated-art integration was visually verified through home, brief, desk, search loading, unlocked puzzle, reasoning/report surfaces at both PC QA targets.
- V2.0 adds a reference-inspired custom commission creation screen with configurable case options and `zhihu-cli` quick search, a default-on Zhihu question handoff (copy + open Zhihu, user confirms), a default-on T04 handoff to Zhihu Pin, task-aligned evidence context, and the invariant that an S grade requires all five tasks and displays 9/9 puzzle pieces.
- V2.0 product and acceptance details live in `docs/v2.0-iteration.md`.
- V3.0 replaces the five-task puzzle loop with CASE 001 `失踪的45分钟`: initial vote, seven investigation rounds, immutable per-round votes, recap companion bubbles, a persistent case board, and a structured final accusation. The technical design is `docs/v3.0-technical-design.md`; the complete V3 flow is implemented under `src/v3/` and `server/v3.py`.
- V3.0 supports desktop and portrait mobile browsers with full feature parity. R1/R7 use real `search zhihu`; recap and R5 use real `answer`. Fixed facts, reviewed sources, evidence eligibility, scoring, and medical boundaries remain server-controlled with explicit template fallback.
- V3 mobile scope is normal browsers, not a Zhihu App WebView. Original Zhihu pages open in a new tab after progress is saved; returning must restore run, round, page step, query, source state, and scroll position.
