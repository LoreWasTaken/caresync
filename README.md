# caresync

# CareSync Development Roadmap

> **Last updated:** 2026-04-07 · **Branch:** `docs/unified-roadmap`
>
> Unified from: README backlog, `SPRINT_PLAN.md`, team Discord/WhatsApp notes.
> Items marked `[x]` are committed or in uncommitted working-tree changes. Items marked `[~]` are partially done.

---

## P0 — Core Engine (Bugs & Blockers)

> Production-blocking defects and foundational architecture. Do first.

- [x] **Calendar "Missed Dose" status bug** — `recordAdherence()` set `takenAt` even for missed doses, causing calendar to show yellow/green instead of red. Fixed in `medicationService.js` (3-file surgical fix). *(Sprint Plan 0.1)*
- [x] **SQLite ghost UNIQUE constraints** — Sequelize's `sync({ alter: true })` leaked standalone `UNIQUE` onto `medicationId` and `userId` in the `adherence` table via `belongsTo()` defaults and composite-index column leak. Fixed in `Adherence.js` (`unique: false` on all 3 composite-index columns) and `index.js` (explicit `foreignKey: { unique: false }` on all `belongsTo`/`hasMany`).
- [x] **Vercel SPA routing (404 on refresh)** — Created `frontend/vercel.json` with catch-all rewrite to `index.html`. *(Sprint Plan 0.2)*
- [x] **Frontend bad requests / CSRF** — API client handles CSRF auto-injection, 401 auto-refresh, cookie transmission. *(README #2)*
- [x] **JWT auto-refresh on 401** — Interceptor retries `POST /auth/refresh` before logout; concurrent 401s deduplicated. *(README #18)*

---

## P1 — Healthcare Features

> Core clinical features expected to work for patients and caregivers.

### Medication Management
- [x] **Full CRUD system** — `medicationStore.ts` (Zustand), `MyMedicationsPage`, `AddMedicationPage`, `EditMedicationPage`, 3 nested routes. *(README #4)*
- [x] **PRN (As-Needed / SOS) medication support** — Full-stack `isPRN` flag: model validation, `endDate` optional for PRN, calendar skips PRN meds, form UI toggle, prescription upload auto-detection.
- [x] **Inventory state machine** — `remainingQuantity` decrement on "taken", restore on "undo", depletion guard (`ConflictError`), atomic SQL transactions.
- [~] **Improve Add Medication form UX** *(Melhorar formulário de medicação)* — PRN toggle, frequency-aware validation, and prescription auto-fill done. Still pending: multi-step wizard, dosage input masks, medication auto-suggest. *(Sprint Plan 1.5 / Custom list #7)*

### Schedule & Adherence
- [x] **Calendar view** — `SchedulePage.tsx` with FullCalendar (daygrid + interaction), colour-coded status events, adherence recording modal. *(README #5)*
- [x] **Overdue status** — Past unrecorded doses now show as `"overdue"` (amber) instead of generic `"scheduled"`.
- [x] **Double-click race prevention** — `inFlightRef` synchronous lock + backend atomic transaction with `findOrCreate` inside SQL transaction.
- [x] **Stock/depletion awareness in Schedule** — `stockMap` fetched in parallel; modal refuses "Mark Taken" on depleted medication.
- [~] **Improve Schedule UI** *(Melhorar Schedule)* — Overdue status, 3-month window, stock awareness done. Still pending: daily agenda view as default, larger event blocks, clearer status labels. *(Sprint Plan 1.6 / Custom list #8)*

### SNS Prescription Parser
- [x] **Backend parser** *(Coisito do parser)* — `prescriptionParser.js` (418 lines): Portuguese vocabulary system, regex Fast Path, Ollama AI fallback, frequency→CareSync mapping, PDF extraction via `pdf-parse`.
- [x] **Frontend upload wizard** — `PrescriptionUploadWizard.tsx` with regex/AI engine selector, parsed medication preview, edit-before-import.
- [ ] **End-to-end integration polish** — Test with real SNS prescription PDFs, edge-case handling (multi-page, scanned images, handwritten notes). *(Sprint Plan 1.1 / Custom list #1)*

### Caregiver System
- [x] **RBAC routing** — `RoleBasedRoute.tsx`, automatic redirect to `/app/patient` or `/app/caregiver`. *(README #12)*
- [x] **Caregiver Dashboard** — Pending invitations (accept/decline), active patient cards with permissions, "View Schedule" navigation. *(Sprint Plan 1.3 / Custom list #10)*
- [ ] **Patient ↔ Caregiver invitation handshake** *(Convite paciente→cuidador)* — Patient Settings → "Invite Caregiver" UI, invitation code/email flow, backend invitation creation endpoint. Currently only caregiver-side accept/decline exists. *(Sprint Plan 1.2 / Custom list #10–11)*

### Devices
- [x] **Devices page UI** — `DevicesPage.tsx` with list, "Link New Device" modal, delete, connection/battery/sync cards. *(README #7)*
- [ ] **Real device pairing** *(Aquilo dos devices para dar ya)* — Wire QR code generation to `deviceService`, implement `device_invitations` acceptance flow, NFC for mobile (Capacitor). *(Sprint Plan 1.4 / Custom list #9)*

### Dashboards & Reports
- [x] **Patient Dashboard** — 4 metric cards (active meds, adherence rate, taken, missed), Recharts bar chart, real API data, `Promise.allSettled`. *(README #6)*
- [x] **PDF reports** — `ReportsPage.tsx` with date range, `includeCharts`/`passwordProtect` options, blob download. Backend: PDFKit, QR verification, SHA-256. *(README #11)*
- [x] **Settings page** — Profile edit, theme toggle (Light/Dark/System), password change, danger zone. *(README #3)*

---

## P2 — Design & UX (Showcase & Polish)

> Visual improvements, landing page, and showcase pages for presentation/demo.

- [ ] **Wave animation fix** *(Retificar a animação da landing page)* — Convert `.oa` SVG path from `M`/`L` (sharp corners) to `C`/`S` (Bézier curves), add `stroke-linecap="round"`. *(README #1 / Sprint Plan 2.1 / Custom list #2)*
- [ ] **"Inside CareSync" section redesign** — Replace `HScroll` horizontal scroll with vertical bento-grid layout. *(Sprint Plan 2.2 / Custom list #3)*
- [ ] **Hardware & Timeline pages + Team photos** *(Páginas de Hardware, Timeline, fotos da equipa)* — Create real content for placeholder showcase pages: PCB renders, sprint timeline, team photo grid. *(Sprint Plan 2.3 / Custom list #4)*
- [ ] **Security showcase polish** — Interactive security dashboard with ASVS coverage, test pass rates, architecture diagram. *(Sprint Plan 2.4 / Custom list #5)*
- [ ] **Replace "CS" icon with SVG logo** *(Substituir ícone "C" pelo logo oficial)* — Replace `<span>CS</span>` in sidebar + favicon with real CareSync logo. *(Sprint Plan 2.5 / Custom list #6)*
- [ ] **3D showcase content (three.js / R3F)** — Install `@react-three/fiber` + `@react-three/drei`. 3D pill dispenser on Hardware page, animated globe on Security page. *(README #15 / Sprint Plan 2.6)*
- [ ] **Consistent navigation system** — Audit all `/app/*` routes use `DashboardLayout`, unify mobile drawer, add breadcrumbs. *(README #14 / Sprint Plan 2.7)*

---

## P3 — Infrastructure & Tech Debt

> Quality, internationalization, accessibility, testing, deployment.

### Deployment
- [ ] **Vercel/Supabase migration** — Migrate from local SQLite to Supabase PostgreSQL for production. Update database config, connection strings, encryption strategy. *(Custom list #11)*

### Internationalization
- [ ] **i18n system (react-i18next)** — Install `react-i18next`, extract hardcoded strings to `locales/{en,pt}.json`, add language switcher. *(README #9, #95 / Sprint Plan 3.1)*

### Accessibility
- [ ] **WCAG 2.1 Level A fixes** — `aria-label` on 15+ icon-only buttons, skip-to-content links, `aria-expanded` on collapsibles, colour contrast audit for `text-text-muted`, replace `href="#"` with `<button>`, focus trap on mobile menu. *(README #97 / Sprint Plan 3.2)*

### Code Quality
- [ ] **Replace `console.error()` in production** — 7 frontend instances (`LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `CaregiverDashboard`) + 1 backend (`enhancedPdfService`). Replace with toast notifications / `logger.error()`. *(README #19 / Sprint Plan 3.3)*
- [ ] **Configure `npm test` in backend** — Replace placeholder with `"test": "node tests/pentest_phase1.js && node tests/wstg_final_audit.js"`. *(README #8, #21 / Sprint Plan 3.5)*
- [ ] **Frontend unit tests (Vitest)** — Install `vitest` + `@testing-library/react`. Smoke tests for auth, CRUD, RBAC routing. *(README #22 / Sprint Plan 3.4)*

### Security (Completed)
- [x] **Full OWASP security audit** — GDPR Art. 17, ConsentLog, CSRF, 2FA TOTP, PII/Medical DB segregation, SQLCipher AES-256, IDOR mitigation, Helmet, CORS, rate limiting, 71 automated tests (100% pass). *(README #10, #16)*

---//////////////////////////////////////////////////////////////////////////---

## 1. Overview

- Frontend stack: **Vite + React + TypeScript + Tailwind**.
- Backend stack: **Node.js + Express + Sequelize + SQLite**, running only on the developer machine.
- API communication is done via Axios, with the base URL controlled by the `VITE_API_URL` environment variable and a fallback to `http://localhost:5000/api`.

***

## 2. Environment Variables (`VITE_API_URL`)

Backend Behavior:

- **Local development**: if `VITE_API_URL` is not set, the frontend uses `http://localhost:5000/api`.
- **Production (Vercel)**: `VITE_API_URL` is set in the Vercel dashboard; the frontend uses that value as the API base URL.

Vite only exposes environment variables prefixed with `VITE_`, and they are accessed via `import.meta.env.VITE_*`.

***

## 3. Running Locally

### 3.1. Backend

From the project root:

```bash
cd backend
npm install
npm run dev                 # starts API at http://localhost:5000
```

Ensure CORS in the backend allows the frontend origin (`http://localhost:5173` or `http://localhost:3000` depending on your Vite dev server). The backend app already uses CORS with an origin list that can include these URLs.

### 3.2. Frontend

From the project root:

```bash
cd frontend
npm install
npm run dev                 # Vite dev server (default http://localhost:5173)
```

- Frontend dev server → calls `http://localhost:5000/api` (via `VITE_API_URL` fallback).
- Make sure both frontend and backend are running for API calls to succeed.

Optional: if you want to override the default, create a `.env` in `frontend`:

```env
VITE_API_URL=http://localhost:5000/api
```

***

## 4. Building Locally

The build script is:

```json
{
    "scripts": {
        "dev": "vite",
        "build": "tsc && vite build",
        "preview": "vite preview"
    }
}
```

To build and preview:

```bash
cd frontend
npm run build             # type-check (tsc) + production bundle (vite build)
npm run preview           # serves the built app (default http://localhost:4173)
```
