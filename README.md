# Mnemo

A personal study system for slide decks: PDF and PowerPoint (`.pptx`, `.ppt`, `.pps`, `.ppsx`). Each upload becomes a study plan: a slide-by-slide walkthrough with self-checks, spaced-repetition flashcards, quizzes, guided workbench practice, a concept map, topic summaries, document chat and voice practice.

## Study flow

The document dashboard recommends one next step from saved progress: walk through the deck, clear due flashcards, test with a quiz (aiming for 80%), then apply each topic in the workbench. The logic lives in `src/lib/study-plan.ts` and is served by `GET /api/documents/[id]/progress`.

- **Walkthrough** (`/learn/[id]`): the original slide beside a plain-language explanation that is generated automatically on first open, while the next slide is prepared in the background. Each slide ends with a self-check: answer from memory, reveal, then rate it _Got it_ or _Shaky_. Ratings are saved per slide, shaky slides can be filtered and revisited, and `?slide=N` links resume a position. Use ←/→ to move between slides.
- **Flashcards**: cards rated _Again_ return later in the same session before being rescheduled. Buttons preview the next interval. Press Space to flip and 1–4 to rate.
- **Quiz**: choose question types and length, answer with the keyboard (1–4, Enter), and retry the questions you missed, including those from your last saved attempt. Short answers ignore case, punctuation, articles and dashes; numeric answers accept units (`src/lib/quiz-grading.ts`, shared by client and server).

## Local setup

Use Node.js 22.13 or newer.

```sh
npm ci
cp .env.example .env.local
```

Set these **server-only** values in `.env.local`:

```dotenv
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_neon_postgres_connection_string
```

Optional model overrides are documented in [.env.example](.env.example). Text generation defaults to `gpt-6-luna`; transcription and narration use OpenAI audio models. One OpenAI key powers all AI features. No browser-side key or separate voice provider is required. Keep `.env.local` out of version control.

Once your Neon connection is available:

```sh
npm run db:migrate
npm run dev
```

The UI can run without secrets, and the production build does not require a database. Saving documents and generating material require both credentials. The library shows a connection error until the database is configured.

## Shared database isolation

Every persistent Mnemo object uses the literal `mnemo-` prefix, including tables, indexes, constraints, the migration ledger, and application-owned functions and triggers. Hyphens are quoted in SQL, for example `public."mnemo-documents"`.

- The migration creates only Mnemo tables; it does not reset, rename, import, drop, or alter another application's objects.
- No extension or database-wide configuration is changed.
- Migrations use a transaction and advisory lock. The `mnemo-migrations` ledger makes reruns safe.
- The runtime repository allowlists nine Mnemo tables and always qualifies them in `public`. Values are parameterized; unfiltered updates and deletes are rejected.
- Deleting a Mnemo document cascades only to Mnemo study material belonging to it.
- Uploads generate content before opening a short transaction. A failed save rolls back the document and all its materials.

Use a database role limited to the Mnemo tables for runtime access when sharing the database with other applications. The migration account needs permission to create the Mnemo objects in `public`. There is no automatic import from the previous database backend; existing data needs a separate, scoped export/import if required.

The initial schema is [db/001_mnemo.sql](db/001_mnemo.sql); [db/002_powerpoint_formats.sql](db/002_powerpoint_formats.sql) extends Mnemo’s file-type constraint for older presentations and slideshows. The migration runner applies pending numbered SQL files in order. Review it before applying it to a shared production database. The migration command never runs automatically during build or startup.

## Text model configuration

All text routes share `AI_TEXT_OPTIONS` from `src/lib/ai.ts`: document generation, concept maps, supplemental questions, workbench content and evaluation, chat, memory riffs, and streaming voice conversation text. Luna uses `reasoning_effort: 'none'` to preserve fast non-reasoning generation and support the existing sampling settings. Output budgets use `max_completion_tokens`. JSON responses and streaming remain on the Chat Completions endpoint.

Speech synthesis and transcription retain their separate `OPENAI_TTS_MODEL` and `OPENAI_TRANSCRIBE_MODEL` settings. Changing the text model does not change those audio models. Restart the local server after changing `.env.local`; update `OPENAI_MODEL` in the Vercel environment and redeploy for hosted instances.

See the [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) and [GPT-6 migration guidance](https://developers.openai.com/api/docs/guides/latest-model#migration-quickstart) for parameter compatibility.

## Upload and generation behavior

Choose Engineering (calculation practice) or Nursing (clinical reasoning and NCLEX-style questions), then add a PDF or PowerPoint file (`.pptx`, `.ppt`, `.pps`, or `.ppsx`). The 4 MB upload limit leaves headroom under Vercel's request size limit. Image-only and password-protected documents are not supported. Legacy `.ppt` and `.pps` slideshows are parsed in an isolated worker with time and memory limits. If unsupported shape formatting prevents a full parse, a text-only fallback resolves the active slides and their speaker notes without interpreting graphics or styling; encrypted documents and invalid record boundaries still fail. modern `.pptx` and `.ppsx` use the OOXML parser. No local Office or LibreOffice installation is required. Very large extracted text is limited to 400,000 characters before generation; the upload response includes `was_truncated` when this happens. Generation may take several minutes; keep the page open. Starting an upload opens a full-screen canvas animation (`src/components/generation/`) with live reading, generation, and saving stages streamed over NDJSON. Progress events carry real slide titles, word and slide counts, and concept names once the map is ready, so the screen shows actual content from the deck. Completed graph and practice material are reported independently. The screen opens the document dashboard immediately after saving succeeds, offers retry and library recovery on failure, and supports paused animations and reduced motion. The default JSON upload response remains available to other clients. Uploads are deduplicated by the prepared study text and study focus, independently of filename. Repeated uploads open the existing dashboard without generating again; simultaneous requests receive a conflict while the first generation is in progress. Atomic database leases prevent concurrent generation across server instances, and a unique index prevents duplicate saves. Leases are released on failure and expire after 15 minutes if a worker disappears. Migration 003 retains pre-existing duplicate documents and their study history, while showing the earliest copy in the library; direct links to the retained copies still work. Different study modes remain separate study sets. Migration 004 repairs JSON arrays that older versions stored as JSON strings, including retained duplicate documents, and adds array type constraints to graph, quiz, conversation, and workbench fields. It preserves record IDs, material, and study history. The upload route allows up to 300 seconds, subject to your hosting plan's limits.

Concept maps group nodes by topic with deterministic, non-overlapping placement. Search, filter by topic, zoom, pan, inspect definitions and connections, or switch to a readable list. Cross-links are optional so dense graphs stay useful. Use **Memory riffs** to pick 2–20 concepts (tap them, or _Select all_ for the current topic) and get a chain of ridiculous one-liners, one per concept, that share running gags so they hang together without quite making sense. Each line names its term and acts out what it does as an absurd image, leaning on well-known pop culture; the plain meaning sits underneath. Optional interests (remembered in the browser only) are worked into a few lines where they fit. Lines stream as they are written, technical vocabulary from the definitions is banned from the jokes, and skipped concepts get one more pass. Narration (`src/components/map/narrator.ts`) plays short sentence chunks with two-ahead prefetching and waits, rather than failing, if writing falls behind. The reading view follows the narrator, and a quiz mode blanks each term so you can name it from the joke. Closing a concept returns the map to the zoom and position you had before opening it. The generator uses source-supported relationships rather than forced node or edge quotas. Model output is validated before saving.

Generated workbench HTML is sanitized before rendering. AI-generated material can contain errors; verify it against your source, particularly clinical explanations and engineering calculations.

## Vercel

Import this Next.js project into Vercel, set `OPENAI_API_KEY` and the Neon pooled `DATABASE_URL` in the intended environment, and apply `npm run db:migrate` once with that connection locally or in a controlled release step. Do not expose either value with a `NEXT_PUBLIC_` prefix. Keep `sslmode=require` in the Neon connection string. The pool is capped at five connections per app instance and uses no prepared statements for compatibility with pooled connections.

This is a personal workspace: application-level sign-in and per-user document ownership are not implemented. Use Vercel deployment protection or equivalent private access before exposing a deployment with credentials. No external database has been provisioned by this cleanup.

## Checks and maintenance

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Tests use an isolated in-memory PostgreSQL engine. They check migration isolation with an unrelated sentinel table, parameterized CRUD, JSON storage, upserts, cascades, graph validation and collision-free deterministic placement, and HTML sanitization. They never connect to your database or call a paid API. Live model behavior and Neon connectivity still need verification after credentials are supplied.

The production dependency audit (`npm audit --omit=dev`) is clean. The full development audit still reports an upstream `braces` advisory through the Next.js lint toolchain; its suggested forced fix downgrades the framework lint configuration, so it has not been applied.

Run `npm run format` to apply the shared formatter. The core implementation is organized as follows:

- `src/lib/ai.ts`: lazy server-side OpenAI client and text model configuration.
- `src/lib/database.ts`: parameterized, namespace-restricted PostgreSQL repository.
- `src/lib/graph.ts`: graph validation and deterministic topic layout.
- `src/lib/generate-content.ts`: study content generation and normalization.
- `src/components/GraphClient.tsx`: interactive concept-map workspace.
- `src/app/api`: document, study, chat, voice, and generation routes.
- `src/styles/`: design tokens (light "paper" and dark "ink" themes), base and shared UI primitives, and one stylesheet per feature, imported from the root layout. There is no CSS framework.
- `src/components/learn/`: the slide walkthrough, explanation renderer and source viewer.
- `src/lib/study-plan.ts`: progress summary and next-step recommendation.

## Workbench learning sessions

The workbench uses a focused explanation and worked example, closed-note recall, new application scenarios, and reflection. Students commit an answer and confidence before seeing feedback. Explanations are evaluated for meaning against the saved reference; keyword overlap is never used to award correctness. Numeric and single-choice checks run locally on the server. Hints and reopened explanations are recorded as assisted practice. Missed or assisted questions return after intervening items, with at most two attempts per item per session.

Migration 005 adds only Mnemo-owned lesson fields and a session table. Checked answers, feedback, cursor, assistance, and review dates persist in PostgreSQL. Revision checks prevent an older tab from overwriting newer progress. A completed session is labeled as practice, not mastery. Topics with weak or assisted first attempts return after 10 minutes; strong independent sessions start at one day and double to a maximum of 30 days. These are simple scheduling defaults, not a validated personalized mastery model. The hub prioritizes unfinished work, then due reviews. Existing legacy progress is preserved without treating it as evidence of independent recall.

New lessons include topic-relevant source excerpts rather than only the beginning of the document. Concurrent lesson requests on one server share generation; the existing unique lesson key prevents duplicate stored lessons across servers. The learning approach draws on the [IES practice guide on instruction and study](https://ies.ed.gov/ncee/wwc/PracticeGuide/1); the application’s particular scoring thresholds and intervals are product choices. AI feedback can still be wrong, so compare it with the explanation and uploaded source.

## Immersive concept map

The map fills the viewport below navigation. Nodes form a stable constellation with varied spring distances and soft topic attraction; topic boxes are not drawn. A final rectangle collision pass keeps labels apart, including disconnected and cyclic graphs. Topic colors, search, list view, zoom controls, and a floating workbench link remain available. Selecting a concept opens a floating details panel and highlights its connections. Desktop opens an overview; narrow screens start closer to the central concept for readable exploration. Drag to pan, use the wheel or a two-finger pinch to zoom, or focus the canvas and use arrow keys, plus/minus, and 0 to recenter. Animation can be paused and respects reduced motion and tab visibility.

## Slide tutor

Open **Walkthrough**. A progress ring tracks slides you've got and shaky ones, the slide list shows real thumbnails, and finishing a deck gets a small celebration. Navigate the original slide/page alongside a beginner-friendly explanation, interactive step diagrams, term tables, analogies, and a self-check. Follow-up conversations are saved separately for each slide. Revisiting a slide reuses its explanation; request IDs and revision checks protect saved exchanges during retries and concurrent tabs. Generated visuals are teaching aids based on extracted text, rather than copies of source diagrams. Image-only slides need readable text or speaker notes for reliable explanations.

Migration 007 adds `mnemo-slide_progress` for walkthrough ratings; until it is applied, progress starts empty and ratings are not saved. Migration 006 adds only `mnemo-` tables for exact slide boundaries, original source files, explanations, and conversations. New uploads retain their source; reuploading an existing document adds its missing source/boundaries without regenerating its study material. Explicit `Slide N` markers can recover older PowerPoint boundaries. Older flattened PDF/PPTX uploads need the original reuploaded to recover page boundaries.

PDFs display in the browser's PDF viewer. PPTX/PPSX decks render inside a sandboxed, network-restricted frame using [pptx-renderer](https://github.com/aiden0z/pptx-renderer); fonts and complex PowerPoint effects may differ. Use **Attach PDF export** for a more faithful rendering. Export all slides, including hidden slides, in their original order. This attaches a visual source to the existing study document without creating another library entry. PDF exports are limited to 4 MB and validated for page count; the app cannot verify that an export is semantically identical to the original.

Legacy binary PPT/PPS decks are converted to PDF in-process with [reamkit](https://www.npmjs.com/package/reamkit) the first time their original slides are opened, and the PDF is cached in the database. Only public substitute font files are fetched (from jsDelivr); the deck itself never leaves the server. On a host with [LibreOffice](https://help.libreoffice.org/latest/en-US/text/shared/guide/pdf_params.html) installed, set `LIBREOFFICE_PATH` to its absolute executable path to use it instead. If conversion fails, the walkthrough shows the slide's text and offers to attach a PDF export. PDF pages and slide thumbnails are drawn in the browser with pdf.js; its worker is copied to `public/` by `predev`/`prebuild`. The isolated PPTX viewer is built by `predev`/`prebuild`; its generated public assets are not committed. Original source files are stored in the same PostgreSQL database as study material (base64 encoded, not encrypted by the application). The application retains its existing single-library access model; it does not add user authentication or private per-user libraries.
