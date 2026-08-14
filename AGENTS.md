# Project Memory

This repo is a PC-only entry for the 看山 coding challenge.

## Hard constraints

- PC only. Do not spend time on mobile or responsive multi-device support.
- Keep the MVP minimal and shippable. Prefer simple, direct implementations over broad abstraction.
- Use local SQLite for persistence.
- Do not add OAuth.
- Deploy to a cloud service, but keep the app compatible with local SQLite read/write.
- Use a Python backend because the user's prior cloud deployment can reuse Python service setup.
- The real Zhihu CLI integration for P0 is `search zhihu`.
- Do not implement real publishing. Sharing/publishing CTAs may link to the Zhihu main site.
- Do not connect a real AI service for now. Use prewritten content, while UI may include AI-like thinking/loading presentation.
- Use only the current `看山三视图/` assets. If extra images are needed, provide Image-to-Image prompts for the user to generate.
- Polish for an immersive detective-agency/file-desk feeling. This should be a boutique MVP, not a rough wireframe.
- Default PC QA targets: 1440x900 primary, 1366x768 compatible.
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
- Read `AGENTS.md`, then the product spec, then the technical spec before major development work.

## Current implementation status

- The PC-only MVP is implemented with React/Vite, FastAPI, and SQLite.
- The complete P01-P07 path is playable, including T01-T05, evidence/puzzle unlocks, hard-rule reasoning, assisted close, report, and share draft.
- The official `zhihu-cli 0.3.0` integration is limited to `search zhihu`; explicit demo fallback is available.
- Production build is served by FastAPI at port 8000 after `pnpm build`.
- Browser QA passed at 1440x900 and 1366x768 with no horizontal overflow.
- `public/assets/kanshan/kanshan-cutout.png` is a local chroma-key cutout derived from the supplied green-screen three-view asset; it is not a generated image.
