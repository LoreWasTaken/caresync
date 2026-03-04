# caresync

# Backlog

---

## Completed

- [x] **2. Fix bad requests from frontend to backend.**
  > **Resolved.** The API client (`frontend/src/shared/api/client.ts`) correctly handles all mutating-request requirements: CSRF token auto-injection via request interceptor (line 44), `withCredentials: true` for cookie transmission (line 12), automatic CSRF token renewal on 403 `ERR_BAD_CSRF_TOKEN` (line 62), and Bearer token attachment (line 36). All `express-validator` required fields are sent by `RegisterPage.tsx` and `LoginPage.tsx`. [`ad21faf`](https://github.com/ds-sv/caresync/commit/ad21faf7ea3d0b46661546ff502fa3c298b4fbd9)

- [x] **10. Review security and privacy.**
  > **Resolved.** Phase 1: GDPR Right to Erasure (Art. 17), ConsentLog with express-validator, CSRF double-submit cookie via `csrf-csrf`, 2FA TOTP (RFC 6238) with recovery codes, PII/Medical database segregation. Phase 2: SQLCipher AES-256 encryption at rest (`@journeyapps/sqlcipher`), IDOR/BOLA mitigation on all medical endpoints (userId-scoped queries returning 404), PHI/PII recursive log scrubber in Winston. Helmet, strict CORS whitelist, 4-tier rate limiting, input validation. 71 automated security tests (39 pentest + 32 WSTG) at 100% pass rate. Full OWASP ASVS v5.0 Level 3 verification report generated. [`87f8b36`](https://github.com/ds-sv/caresync/commit/87f8b36efe9a8e4ded41db952a91eb871575baf3)

- [x] **13. Fix frontend navbar: delay also increases for hover.**
  > **Resolved.** Hover delay timing in the showcase `Navbar.tsx` component was corrected. [`ad21faf`](https://github.com/ds-sv/caresync/commit/ad21faf7ea3d0b46661546ff502fa3c298b4fbd9)

- [x] **16. Verify backend routes, controllers, etc., for user auth, performance, rate limits, etc.**
  > **Resolved.** Full OWASP audit completed: `authMiddleware` enforced on every protected route, `express-rate-limit` at 4 tiers (global 200/15min, auth 10/15min, 2FA 5/15min, reports 20/60min), IDOR prevention with `where: { id, userId }` on all Medical DB endpoints, `express-validator` on all inputs, CSRF double-submit cookie, 2FA TOTP with brute-force protection. Verified by `pentest_phase1.js` (39/39) and `wstg_final_audit.js` (32/32). [`87f8b36`](https://github.com/ds-sv/caresync/commit/87f8b36efe9a8e4ded41db952a91eb871575baf3)

---

## Sprint 1: Frontend — Arquitetura Core & RBAC

> **Bloqueador:** O ToDo 20 (`DashboardLayout.tsx`) é pré-requisito arquitetural para todos os ToDos dos Sprints 1 e 2. Sem sidebar/nav e rotas nested, não é possível implementar nenhuma feature do dashboard.

- [x] **20. Criar `DashboardLayout.tsx` com sidebar e routing nested (BLOQUEADOR).**
  Criar `features/dashboard/layouts/DashboardLayout.tsx` com: sidebar de navegação responsíva (links diferenciados por role), header partilhado com notificações e logout, e `<Outlet />` para renderizar rotas filhas. Reestruturar `App.tsx` para converter `/app` numa rota-pai com rotas nested (`/app/dashboard`, `/app/medications`, `/app/schedule`, `/app/settings`, `/app/devices`, `/app/reports`). Descoberto na auditoria do ToDo 12 — o dashboard atual é uma página única sem navegação interna.
  > *Resolvido.* Criado `DashboardLayout.tsx` com sidebar responsiva (hamburger drawer mobile, fixed desktop), header com greeting/Bell/Logout, e `<Outlet />`. Links diferenciados por role (patient: Dashboard/Medications/Schedule/Devices/Reports; caregiver: Dashboard/Patients/Reports). `App.tsx` reestruturado com rotas nested sob `/app`. Código morto `DashboardHome.tsx` eliminado. [`e68de86 `](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

- [x] **12. Implementar dashboards separados para Patient e Caregiver (RBAC frontend).**
  Zero infraestrutura de RBAC existe no frontend. O `ProtectedRoute.tsx` apenas verifica `!!token`, ignora `user.role`. Criar `RoleBasedRoute.tsx` em `features/auth/components/` que leia `user.role` do `authStore` e redirecione para o dashboard correto. Criar `PatientDashboard.tsx` (medicações, schedule, adherence) e `CaregiverDashboard.tsx` (pacientes atribuídos, alertas). Rota `/app/dashboard` deve redirecionar automaticamente para `/app/patient` ou `/app/caregiver` baseado no role do utilizador autenticado.
  > *Resolvido.* Criado `RoleBasedRoute.tsx` (guarda RBAC que lê `user.role` do authStore e redireciona roles não autorizados). Criado `PatientDashboard.tsx` (extraído do antigo `DashboardHome`), `CaregiverDashboard.tsx` (stub com empty-state). `/app` index redireciona automaticamente para `/app/patient` ou `/app/caregiver` via `AppIndexRedirect` + `dashboardPathForRole()`. [`e68de86`](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

- [x] **18. Implementar auto-refresh do JWT no interceptor de 401 (`client.ts`).**
  O interceptor atual (linha 69-71) faz logout imediato quando recebe 401, sem tentar renovar o token. O backend suporta `POST /api/auth/refresh` via cookie HttpOnly, mas o frontend nunca o utiliza. Implementar: ao receber 401, tentar `POST /api/auth/refresh` primeiro; se falhar (refresh token expirado), aí sim fazer logout. Previne logouts abruptos quando o JWT access token expira durante uma sessão ativa. Ficheiro: `frontend/src/shared/api/client.ts:69`.
  > *Resolvido.* Interceptor de 401 agora tenta `POST /auth/refresh` antes de fazer logout. Refresh token viaja no cookie HttpOnly (`withCredentials: true`). Pedidos concorrentes com 401 são deduplicated (um único refresh em voo). URLs de auth (`/auth/login`, `/auth/register`, `/auth/refresh`) são excluídas para evitar loops infinitos. Token renovado é guardado no Zustand via `setState({ token })` e o pedido original é retried automaticamente. [`e68de86`](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

---

## Sprint 2: Frontend — Features & Integração API

- [x] **4. Construir o sistema completo de gestão de medicações (CRUD + state).**
  O ToDo original ("medication only appears in schedule") está mal formulado — a feature inteira não existe no frontend. O backend tem 8 endpoints prontos mas o frontend só faz `GET /medications?limit=5` com fallback para mock data hardcoded (Lisinopril, Metformin). Não existe formulário, lista, store, nem rotas. Implementar: (1) `medicationStore.ts` em Zustand com `fetchMedications()`, `addMedication()`, `updateMedication()`, `deleteMedication()`; (2) `MyMedicationsPage.tsx` em `/app/medications` com lista completa e CRUD; (3) `AddMedicationPage.tsx` em `/app/medications/add`; (4) `EditMedicationPage.tsx` em `/app/medications/:id/edit`; (5) Componentes reutilizáveis: `MedicationForm.tsx`, `MedicationCard.tsx`, `MedicationList.tsx`; (6) Fluxo pós-adição: `POST` → sucesso → `medicationStore.fetchMedications()` para sincronizar todas as vistas.
  > *Resolvido.* CRUD completo implementado: `medicationStore.ts` (Zustand com fetch/add/update/delete paginado), `MyMedicationsPage.tsx` (lista com empty-state, delete com confirmação), `AddMedicationPage.tsx` (formulário com todos os campos do modelo), `EditMedicationPage.tsx` (carrega via GET /:id, faz PUT). 3 rotas nested em App.tsx protegidas por `RoleBasedRoute(['patient'])`. Link "Medications" activado na sidebar. [`5eb25f0`](https://github.com/ds-sv/caresync/commit/5eb25f0436bf4d848b6ef67f67aef4dd50407391)

- [x] **3. Expandir a página de Settings com secções adicionais.**
  O `SecuritySettings.tsx` já está integrado no router (`/app/settings`) e acessível via sidebar (Sprint 1). Falta expandir com: edição de perfil (nome, email), toggle de tema (o `ThemeContext` já existe mas não tem UI nas Settings), e preferências de notificação.
  > *Resolvido.* Settings expandido com 4 secções: (1) **Profile** — edição de firstName/lastName via `PUT /auth/profile`, actualiza Zustand em tempo real; (2) **Appearance** — toggle Light/Dark/System com `useTheme()` do `ThemeContext`; (3) **Change Password** — mantido intacto; (4) **Danger Zone** — mantido intacto. Email mostrado como read-only (backend não suporta alteração). [`28546e3`](https://github.com/ds-sv/caresync/commit/28546e30df6a20c4f64bb2ace60b717144cda7a4)

- [x] **5. Implementar vista de calendário para doses agendadas.**
  A feature não existe — zero componentes de calendário, zero bibliotecas (`react-calendar`, `@fullcalendar`, `date-fns` ausentes do `package.json`). O backend tem `GET /api/medications/schedule` pronto. Instalar `@fullcalendar/react` (ou alternativa leve). Criar `SchedulePage.tsx` em `/app/schedule` consumindo o endpoint de schedule. Garantir que a vista mensal/semanal não necessite de scrollbar horizontal (o ToDo original).
  > *Resolvido.* `SchedulePage.tsx` criado com `@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/interaction`. Consome `GET /medications/schedule` (janela de 60 dias). Eventos coloridos por status (verde=taken, amarelo=late, vermelho=missed). Click num evento abre modal para registar toma (`POST /medications/adherence` com status taken/missed). Calendário auto-refresh após registo. [`inserir-hash-commit`](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

- [x] **6. Substituir mock data do dashboard por dados reais e gráficos interativos.**
  O `DashboardHome.tsx` tem apenas 2 cards: "Upcoming Doses" com fallback para mock data hardcoded, e "Weekly Adherence" com barras estáticas feitas de divs Tailwind com valores literais `[90, 85, 100, 100, 95, 80, 100]` (linha 107). Zero bibliotecas de gráficos instaladas. Instalar `recharts`. Substituir as barras hardcoded por `<BarChart>` consumindo `GET /api/medications/adherence/stats`. Adicionar cards de métricas (total de medicações ativas, taxa de aderência média, próxima dose, alertas pendentes). Eliminar todo o mock data.
  > *Resolvido.* `PatientDashboard.tsx` completamente reescrito: (1) **4 metric cards** — Active Medications, Adherence Rate, Doses Taken, Doses Missed (dados reais de `GET /medications` + `GET /medications/adherence/stats`); (2) **Upcoming Doses** — dados reais de `GET /medications?limit=5&status=active` com empty-state e link "Add medication"; (3) **Weekly Adherence chart** — `recharts` `<BarChart>` com cores condicionais (verde ≥90%, amarelo ≥70%, vermelho <70%) alimentado por `GET /medications/schedule`. Zero mock data. 3 chamadas API em paralelo via `Promise.allSettled`. [`28546e3`](https://github.com/ds-sv/caresync/commit/28546e30df6a20c4f64bb2ace60b717144cda7a4)

- [x] **7. Criar UI de gestão de dispositivos (web: QR code, mobile: NFC).**
  O backend já suporta registo sem Serial Number (`serialNumber` é opcional) e tem endpoint de assinatura criptográfica (`POST /api/devices/register-with-signature`). O frontend não tem absolutamente nada — zero componentes, zero páginas. Criar `DevicesPage.tsx` em `/app/devices` com lista de dispositivos do utilizador e botão "Link Device". Para a versão web, usar registo por QR code (`deviceId` + `publicKey`). Reservar implementação NFC (`@capacitor/nfc`) para build mobile futura.
  > *Resolvido.* `DevicesPage.tsx` criado com lista de dispositivos (`GET /devices`), botão "Link New Device" que abre modal e faz `POST /devices` com deviceId gerado por `crypto.randomUUID()` (simula scan QR), delete com confirmação (`DELETE /devices/:id`). Cards mostram connectionStatus, batteryLevel e lastSync. Empty-state e error handling incluídos. [`inserir-hash-commit`](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

- [x] **11. Criar UI de exportação de relatórios PDF.**
  O backend de PDF está completo (`EnhancedPdfService.js`, 570+ linhas: PDFKit, QR code de verificação, métricas, gráficos, proteção por password, assinaturas, SHA-256). O frontend não tem nenhum botão, página, ou referência a exportação. Criar `ReportsPage.tsx` em `/app/reports` com: date range picker (`startDate`/`endDate`), checkboxes para opções (`includeCharts`, `passwordProtect`), e botão "Download PDF" que chama `GET /api/reports/report/pdf` e faz download do blob. Adicionar link na sidebar do `DashboardLayout`.
  > *Resolvido.* `ReportsPage.tsx` criado com formulário de date range (default últimos 30 dias), checkboxes para `includeCharts` e `passwordProtect`, e botão "Download Report". Faz `GET /reports/report/pdf` com `responseType: 'blob'`, extrai filename do `Content-Disposition` header, e usa `URL.createObjectURL` + `<a>` invisível para forçar download. Error handling para blob responses. [`inserir-hash-commit`](https://github.com/ds-sv/caresync/commits/frontend-overhaul/)

---

## Sprint 3: UI, 3D & Acessibilidade

- [ ] **1. Suavizar o SVG de osciloscópio na `LandingPage.tsx`.**
  O SVG decorativo (linhas 310-319) tem dois paths: path `.oa` usa comandos `L` (linhas retas) criando cantos afiados (`L22,8L30,42L38,8L46,42`), enquanto path `.ob` já usa curvas de Bézier (`C`) e está suave. Converter o path `.oa` de comandos `M`/`L` para `C`/`S` (curvas cúbicas de Bézier). Adicionar `stroke-linecap="round"` e `stroke-linejoin="round"` a ambos os paths.

- [ ] **14. Criar sistema de navegação consistente (dashboard sidebar + componentes partilhados).**
  Existe 1 único `Navbar.tsx` usado apenas no showcase (via `ShowcaseLayout.tsx`). A `LandingPage` tem header inline diferente. O dashboard não tem navegação nenhuma. Extrair o logo para componente partilhado reutilizável. Criar `DashboardSidebar.tsx` para `/app/*` (ou integrar no `DashboardLayout` do ToDo 20). A navbar showcase pode manter-se separada (contexto diferente é válido). O "universal" implica consistência visual com reutilização de sub-componentes (logo, theme toggle), não necessariamente um único componente.

- [ ] **15. Implementar conteúdo 3D nas páginas placeholder do showcase.**
  Zero bibliotecas 3D instaladas (`three.js`, `@react-three/fiber`, `@react-three/drei` ausentes). As páginas `HardwareEvolutionPage.tsx` e `UnifiedTimelinePage.tsx` são placeholders "Work in Progress" com apenas ícone e texto. Instalar `@react-three/fiber` + `@react-three/drei`. Implementar: `HardwareEvolutionPage` (modelo 3D interativo do dispensador de medicação) e `UnifiedTimelinePage` (timeline 3D interativa do projeto). Integração com `ShowcaseLayout` já existe.

- [ ] **9. Implementar sistema de internacionalização (i18n).**
  Zero implementação atual: sem `react-i18next` no `package.json`, sem pasta `locales/`, sem chamadas `t()`, todas as strings hardcoded em inglês. Instalar `react-i18next` + `i18next`. Criar estrutura `frontend/src/locales/{en,pt}.json`. Extrair strings hardcoded dos 15+ componentes para chaves de tradução. Prioridade: auth pages e dashboard. **Nota:** Tarefa transversal que toca todos os componentes — recomenda-se fase dedicada, não misturada com feature work.

- [ ] **95. Rever traduções e adicionar mais línguas.**
  Depende do ToDo 9. Após a estrutura `i18next` estar montada, adicionar locales adicionais (`es.json`, `fr.json`). Rever a qualidade das traduções `pt.json` com falantes nativos. Adicionar language switcher na UI (Settings ou navbar).

- [ ] **97. Corrigir falhas de acessibilidade (WCAG 2.1 Level A).**
  Bases razoáveis (`<form>`, `<label htmlFor>`, `focus:ring-2`, `aria-hidden` em ícones decorativos, hierarquia de headings correta). Gaps críticos:
  - **97a (Alta, ~30min):** Adicionar `aria-label` a 15+ botões icon-only (Bell, Logout, Close, Theme toggles em `DashboardHome`, `Footer`, `SecurityDeepDivePage`, `SoftwareArchitecturePage`). Adicionar labels acessíveis ao role selector (Patient/Caregiver) no `RegisterPage.tsx`.
  - **97b (Média, ~1h):** Adicionar skip-to-content link em `AuthLayout`, `ShowcaseLayout` e `DashboardLayout`. Adicionar `aria-expanded` em 8+ painéis colapsáveis (`SecurityDeepDivePage`, `SoftwareArchitecturePage`). Implementar focus trap no menu mobile do `Navbar.tsx`.
  - **97c (Média, ~1h):** Auditar e ajustar contraste de `text-text-muted` (58+ instâncias, provavelmente falha WCAG AA 4.5:1 — pode precisar de alterar o tema Tailwind). Substituir `href="#"` por `<button>` no `Footer.tsx` (3 links). Adicionar `aria-current="page"` aos links de navegação ativos no `Navbar.tsx`.

---

## Sprint 4: Testes & Clean up

- [ ] **8. Configurar pipeline de testes e limpar scripts (Reformulado).**
  Os ficheiros em `backend/tests/` NÃO são lixo — são scripts de auditoria de segurança críticos (`pentest_phase1.js` com 39 testes, `wstg_final_audit.js` com 32 testes). NÃO apagar. Configurar `npm test` no backend `package.json` para os executar: `"test": "node tests/pentest_phase1.js && node tests/wstg_final_audit.js"`.

- [ ] **21. Configurar `npm test` no backend para executar os scripts de segurança.**
  O `package.json` do backend tem `"test": "echo \\"No tests configured\\" && exit 0"` (placeholder). Substituir por `"test": "node tests/pentest_phase1.js && node tests/wstg_final_audit.js"` para que `npm test` execute os 71 testes de segurança automaticamente. Adicionar script `"test:pentest"` e `"test:wstg"` para execução individual.

- [ ] **19. Substituir os 6 `console.error()` em produção por error handling adequado.**
  Ficheiros frontend com `console.error()` que poluem a consola em produção: `LoginPage.tsx:45`, `LoginPage.tsx:84`, `RegisterPage.tsx:47`, `ForgotPasswordPage.tsx:23`, `DashboardHome.tsx:40`. Backend: `enhancedPdfService.js:91`. Substituir por error handling adequado (toast notifications no frontend, `logger.error()` no backend) ou remover se o erro já é tratado pelo interceptor global.

- [ ] **22. Instalar Vitest + Testing Library no frontend para unit tests mínimos.**
  O frontend não tem nenhum framework de testes. Instalar `vitest` + `@testing-library/react` + `@testing-library/jest-dom`. Criar testes unitários mínimos para: `authStore.ts` (login/logout/isAuthenticated), `client.ts` (CSRF interceptor), `ProtectedRoute.tsx` (redirect quando não autenticado). Configurar `"test": "vitest"` no `package.json` do frontend.

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

