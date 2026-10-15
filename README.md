# Curaçao Immunization Decision & Implementation Roadmap — prototype

A bilingual (Nederlands / English) web prototype that guides stakeholders — JGZ, the EPI manager, immunization and youth physicians, laboratories, clinicians, the vaccination committee and government decision-makers — through a transparent, evidence-informed process for assessing a preventive immunization strategy, recommending it, obtaining approval, and preparing implementation and surveillance.

RSV prevention in infants is seeded as the first case study. The platform is reusable: **Create roadmap** builds a new condition/target-population roadmap with the nine core steps, default tasks, the approval checklist and the implementation checklist, without code changes.

> **Prototype — not a production system.**
> All data lives only in the current browser (IndexedDB). There is **no synchronization** between users or computers, the demo sign-in is **not authentication**, and permission checks run in the browser only. Use aggregated and anonymized information only — **never patient-level or identifiable health data**. A discreet "Prototype" indicator in the header repeats this.

## Screenshots

Key screens (fictional sample data) are in [`docs/screenshots/`](docs/screenshots/), for example the [dashboard](docs/screenshots/01-dashboard-nl.png) and the [Step 3 matrix](docs/screenshots/04-step3-matrix.png).

## Running it

Requirements: Node.js 20+ (tested with Node 22).

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

| Command | Purpose |
|---|---|
| `npm test` | Vitest unit tests for domain rules and calculations |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build and server |

No paid service, cloud account or API key is needed. To start over, use **Settings → Prototype data → Restore demo data**.

### Trying the workflow

Use the demo-user switcher (top right) to act as different roles. Every identity is fictional and uses an `@example.org` address.

| Demo user | Roles | Try |
|---|---|---|
| Mila Voorbeeld | EPI manager · lead + task owner · primary contact | Dashboard, propose scores, deliberation records, route decision |
| Sara Voorbeeld | Head of JGZ · lead + reviewer | Review score proposals and durations |
| Ruben Voorbeeld | Immunization physician · task owner | My Tasks → complete "Contact PAHO" with dates 15‑09‑2026 → 14‑11‑2026, which triggers the outlier explanation |
| Nadia Voorbeeld | Youth physician · task owner | Has a pending Step 5 proposal |
| Jules Voorbeeld | Committee member · reviewer | Reviews proposals |
| Eva Voorbeeld | Head of GGD · approver | Approves scores, records approvals |
| Tom Voorbeeld | Laboratory · read-only (no email, vacant) | Read-only view; shows "missing email" in the coverage table |
| Alex Voorbeeld | Administrator | Settings, permissions, logged score overrides |

## Architecture

```
src/
  domain/      Pure TypeScript business logic (no React, no storage) — fully unit-tested
    types.ts         Data model: Roadmap, StepState, Task, DocumentMeta, ScoreProposal, DurationRecord, AuditEntry, Settings…
    stepTemplates.ts The nine core steps (kind, max score, optional, pathway) + implementation checklist
    config.ts        Default role permissions, outlier thresholds, approval rules, page size (6)
    actions.ts       Single reducer: validates permissions + workflow rules, applies the change, appends audit entries
    progress.ts      Applicability, normalized progress, current step, step status, estimates
    readiness.ts     Score scale, per-step maxima, score-3 prerequisites
    branching.ts     Public-health vs curative route, optional Step 6
    matrix.ts        Weighted scoring matrix
    durations.ts     Calendar-day durations, averages, benchmark selection, outlier check
    approvals.ts     Step 9 checklist and the implementation-phase gate
    permissions.ts   Role permissions, per-step restrictions, separation of duties
    insights.ts      Next action, outstanding tasks, step owner and estimates
    factory.ts/seed.ts  Roadmap creation from templates; fictional RSV seed data
  data/        Repository interface + IndexedDB implementation (idb-keyval), in-memory fallback
  state/       AppStateProvider: loads/persists state, dispatches domain actions, file storage helpers
  i18n/        nl.ts (default) and en.ts dictionaries, typed keys, provider, language preference
  components/  ui/ (accessible primitives on Radix), shell/, roadmap/, step/, tasks/, documents/
  app/         Next.js App Router pages
```

The UI never mutates state directly. Every change goes through `applyAction(state, action, actorId)` in `src/domain/actions.ts`. This is the seam for a real backend: the same validations would run server-side, and `Repository` (`src/data/repository.ts`) would be replaced by an API client.

Stack: Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn-style components on Radix UI primitives, Lucide icons, idb-keyval, Vitest. No charting library: the single duration-trend chart is plain HTML/CSS.

## Core rules (implemented in `src/domain`, covered by tests)

### Progress calculation (`progress.ts`)

```
progress = mean over APPLICABLE steps of (approved score ÷ step maximum)
```

- Only **approved** scores count; proposed or reviewed scores do not.
- Routine steps have maximum 2. The deliberation milestones (Steps 3 and 8) have maximum 3 ("Deliberated").
- Steps formally marked **not applicable** (with a recorded reason) are excluded: Steps 4–9 on the curative route, and Step 6 when it is deliberately skipped. A skipped optional step is never counted as unfinished.
- 100 % progress never marks a strategy as approved. Approval exists only as explicit Step 9 records.

The dashboard's "How is this calculated?" panel shows this formula and the per-step breakdown.

### Readiness workflow (`readiness.ts`, `permissions.ts`)

- Proposed → Reviewed → Approved. A reviewer or approver can return a proposal, with a mandatory reason.
- Separation of duties (configurable): the proposer cannot review, and the approver cannot be the proposer or the reviewer.
- Score 3 on Step 3 needs: meeting date (not in the future), confirmation the meeting took place, participants, a document in category *Meeting preparation*, a document in category *Meeting minutes*, and a recorded route decision.
- Score 3 on Step 8 additionally needs Step 3 approved at 3 and a recorded final selection.
- Prerequisites are checked **at approval**, so meetings and documents can always be recorded first (no circular dependency). Missing items are listed explicitly.
- Administrator overrides need a reason and are logged as `score.override`.

### Branching (`branching.ts`)

- **Public-health route:** at least one initially preferred option is required; work continues in Step 4.
- **Curative route:** a documented handover to SVB, pharmacies and clinicians (what was transferred and to whom) plus a reason. Steps 4–9 then become not applicable with that reason, and there is no implementation phase.
- Changing an established route requires a reason. Routine steps cannot be marked not applicable by hand.

### Weighted matrix (`matrix.ts`)

`weighted total = Σ(weight × score) ÷ Σ(weights of scored criteria)`. Criteria, weights and the scale are editable. The seeded criteria and scores are clearly labelled **fictional sample scores**. In Step 8 the highest-scoring option is highlighted, and choosing a different option requires a short explanation. The matrix supports deliberation but never replaces it.

### Durations and learning from delays (`durations.ts`)

- The unit is elapsed calendar days (end − start), or a clearly labelled manual entry for retrospective records.
- Averages use **accepted** records only; submitted, returned and cancelled records are excluded. Accepting a record updates both the person's average and the overall average for that task across roadmaps (they are derived, not stored).
- Benchmark: the person's own average for the same task (n ≥ 2), otherwise the overall average across roadmaps (labelled *provisional*), otherwise none. The first record never gets an invented baseline.
- A reason is required when `actual < 0.70 × average` or `actual > 1.30 × average` (thresholds configurable).
- This is for institutional learning only. There are no leaderboards, and ordinary users see only their own time records.

### Approval and implementation (`approvals.ts`)

- The Step 9 checklist tracks the advisory report, submission to GGD / sector director / SG, their decision, the letter to the Minister, feedback to the head of JGZ, Ministry of Finance approval (or "not required — within GMN budget", with a note), the budget year, and the request to the **GRC** as a separate review body.
- The implementation phase (*Implementatie, monitoring en surveillance*) is not a tenth step. It can only be activated once the configured requirements are recorded (default: leadership approval + finance resolved; configurable under Settings).

### Audit trail

Every action appends an entry with actor, timestamp, object, previous/new value and reason. The reducer has no action that edits or deletes audit entries.

## Localization

All interface text comes from `src/i18n/nl.ts` (default) and `src/i18n/en.ts`. The English dictionary is type-checked against the Dutch shape, and a unit test enforces key parity. The language switch is in the header and the choice is remembered in `localStorage`. User-entered content (task titles, summaries, rationales, custom step descriptions, matrix criteria) is stored in both languages (`LocalizedText`). The interface shows the current language and falls back to the other when one is empty.

## Data protection

The application is designed for aggregated results, anonymized information, reports, evidence summaries and governance documents. Every upload shows a warning and requires an explicit confirmation that no patient data is included. **A browser-side warning is not a sufficient privacy safeguard.** A real deployment needs server-side storage controls, access policies, retention rules and a DPIA.

## Known prototype limitations

- **Local only:** data is stored per browser (IndexedDB). Nothing is shared between users or devices, and clearing site data erases it.
- **No real authentication or authorization:** the demo-user switcher lets anyone act as anyone, and permissions are enforced in browser code only.
- **No tamper-proof audit:** the audit log is append-only in the domain logic, but anyone with access to the browser can alter local storage. Trustworthy history needs server-side, append-only storage.
- **File storage** is IndexedDB with a 15 MB per-file limit, with no virus scanning or server-side type validation.
- The seeded matrix scores, durations, documents and identities are **fictional**. They are not evidence, decisions or Curaçao performance data.
- Email uses `mailto:` links to the user's mail application; nothing is sent by the application.

## Recommended next steps towards production

1. Move `applyAction` behind an API (e.g. Next.js route handlers) and store state in PostgreSQL (e.g. Supabase or an approved institutional database), with row-level security per roadmap and role.
2. Replace the demo switcher with institutional SSO (e.g. Entra ID / OIDC) and map identity groups to application roles.
3. Store documents in access-controlled object storage, with malware scanning, server-side type checks and retention policies.
4. Make the audit log append-only server-side (database triggers, or a write-once table), with time-stamped, signed entries.
5. Complete a DPIA and data-governance review with GMN, and verify that only aggregated data is used.
6. Add end-to-end tests (Playwright) and a formal accessibility audit (WCAG 2.2 AA) with real users from JGZ and partner organizations.
7. Replace placeholder clinical, epidemiological, procurement and economic content with verified information through the roadmap itself.
