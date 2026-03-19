# UI/UX Audit

Date: 2026-03-19

## Scope

Reviewed:

- Public routes on desktop and mobile: `/`, `/pricing`, `/login`, `/signup`, `/forgot-password`, `/support`, `/changelog`
- Protected-route entry behavior on desktop and mobile: `/recordings`, `/upload`, `/contacts`, `/files`, `/settings`
- Core layout and page components that shape the product experience

Artifacts captured during the audit:

- `tmp/ui-audit/results.json`
- `tmp/ui-audit/*.png`

## Executive Summary

The app already has a strong visual base. The best parts of the experience are the auth shell, the support page, and the overall card/spacing system. The main issues are not “make it prettier” issues. They are product-clarity and flow issues:

1. unauthenticated users get inconsistent experiences depending on which app route they hit
2. the marketing homepage is over-explained and sometimes reads like internal strategy notes instead of customer-facing copy
3. signed-in workspace pages put too much instructional chrome above the actual task area
4. mobile auth adds friction for users who need email/password
5. pricing is visually polished but still harder to compare than it should be, especially on mobile

## What Is Working Well

- The visual system is coherent across public and product surfaces: rounded cards, soft elevation, and restrained color accents feel consistent.
- The desktop auth shell is polished and trustworthy. It is one of the strongest screens in the app.
- The support page is clear, structured, and action-oriented. It is currently the best example of “explain just enough, then let the user act.”
- Pricing has a good hierarchy at a glance on desktop, with a clear featured plan and distinct tiers.

## Findings

### 1. P1: Unauthenticated route behavior is inconsistent and confusing

Different protected routes send the user into completely different experiences:

- `/recordings` shows a nearly blank page with a short login message
- `/upload`, `/contacts`, and `/settings` redirect into the full auth flow
- `/files` falls back to the public landing page instead of a protected-route response

This makes the product feel unpredictable. Users should not have to infer whether a route is private, semi-private, or a marketing page based on which path they opened.

Why this matters:

- it breaks trust in the information architecture
- it makes deep links feel unreliable
- it creates inconsistent expectations around login recovery

Recommendation:

- Use one unauthenticated pattern for all protected product routes.
- Best option: redirect to `/login` with a return URL and a short route-specific message.
- Use the same public/auth shell for every protected-route miss so the user always knows what happened and how to continue.

Evidence:

- `src/components/pages/recordings-page.tsx:401`
- `src/components/pages/upload-page.tsx:35`
- `src/components/pages/contacts-page.tsx:66`
- `src/app/files/page.tsx:151`
- `src/components/app-layout.tsx:121`
- `src/components/navigation/main-nav.tsx:21`
- `src/components/public-header.tsx:10`

### 2. P1: The homepage copy is too long and often sounds internal instead of customer-facing

The landing page has strong visual craft, but too much of the copy reads like internal positioning language:

- “The homepage now leads with the thing the product actually does best...”
- “The homepage now leads with the three promises the app should keep.”
- “The capability story is sharper when every box earns its place.”

This makes the page feel like a strategy memo presented to the user. The result is a long page with high cognitive load, especially on mobile where the page becomes extremely tall.

Why this matters:

- users need proof and outcomes, not commentary about messaging strategy
- dense explanatory sections delay the path to “what is this” and “why should I try it”
- mobile scanning gets much harder than it needs to be

Recommendation:

- Rewrite sections around user outcomes, proof, and concrete examples.
- Remove meta-commentary about the homepage itself.
- Cut overall landing-page length by about 25 to 35 percent.
- Keep one strong story arc: archive calls, find them later, export without chaos.

Evidence:

- `src/components/pages/landing-page.tsx:348`
- `src/components/pages/landing-page.tsx:449`
- `src/components/pages/landing-page.tsx:508`
- `src/components/pages/landing-page.tsx:639`

### 3. P2: Workspace pages spend too much vertical space on explanation before action

The signed-in tool pages follow a repeated pattern:

- hero card
- chips
- help tooltip
- quick-start popover
- secondary action buttons
- metrics/details area
- only then the main working surface

That is acceptable for a first-time experience, but it adds friction for repeat use and pushes the real task farther down. This is especially noticeable on upload, contacts, recordings, and file browser.

Why this matters:

- frequent users want immediate access to the working surface
- onboarding content competes with the primary task
- mobile users pay the biggest penalty

Recommendation:

- Keep the main page title and 1-2 key actions, but demote secondary help.
- Move “Quick start” into empty states or first-run states only.
- Collapse or remove top-level metrics unless they change the next user decision.
- On repeat-use pages, let the primary tool appear above the fold.

Evidence:

- `src/components/pages/upload-page.tsx:60`
- `src/components/pages/upload-page.tsx:67`
- `src/components/pages/upload-page.tsx:102`
- `src/components/pages/contacts-page.tsx:123`
- `src/components/pages/contacts-page.tsx:130`
- `src/components/pages/contacts-page.tsx:157`
- `src/components/pages/file-browser-page.tsx:55`
- `src/components/pages/file-browser-page.tsx:62`
- `src/components/pages/file-browser-page.tsx:87`
- `src/components/pages/recordings-page.tsx:409`
- `src/components/pages/recordings-page.tsx:436`
- `src/components/pages/recordings-page.tsx:455`

### 4. P2: Mobile login prioritizes Google well, but adds friction for email users

On mobile, email/password login is hidden behind a separate “Use email” toggle. That is efficient for a Google-first audience, but it slows down anyone returning with an existing email login. It also makes the screen feel unfinished when the alternate form is collapsed.

Why this matters:

- returning users with email credentials pay an extra interaction cost
- the collapsed panel reduces immediate affordance and confidence
- deep links from protected routes should feel fast and obvious

Recommendation:

- Keep Google as the primary button, but make email/password directly available below it.
- If keeping the collapse, auto-expand it when the user arrived from a protected route or has previously used email login.
- Keep the back action label explicit as “Back to site” on mobile too.

Evidence:

- `src/components/pages/login-page.tsx:23`
- `src/components/pages/login-page.tsx:98`
- `src/components/pages/login-page.tsx:139`
- `src/components/auth/auth-shell.tsx:64`

### 5. P2: Pricing is polished, but comparison still requires too much memory

The pricing page looks good, but comparing plans still relies on the user remembering differences across stacked cards and add-on blocks. This becomes more noticeable on mobile, where the cards turn into a long vertical sequence.

Why this matters:

- pricing decisions should minimize memory load
- mobile users cannot compare side-by-side
- mixed CTA wording (“Start free”, “Choose Standard”, “Start with Pro”, “Contact sales”) adds subtle decision friction

Recommendation:

- Normalize plan comparison rows around the same categories: storage, transcription, search, support, hosting.
- Add a compact comparison table or “compare differences” accordion below the cards.
- Use more consistent CTA semantics.
- Clarify what is included versus what is an add-on.

Evidence:

- `src/components/pricing-section.tsx:153`
- `src/components/pricing-section.tsx:172`
- `src/components/pricing-section.tsx:200`
- `src/components/pricing-section.tsx:220`

### 6. P3: “Coming soon” auth buttons create noise without adding value

Both login and signup show disabled Apple buttons. They occupy prominent space but do not help the user complete the task.

Why this matters:

- dead-end controls reduce confidence
- they compete with real auth choices
- they make the auth flow look less finished

Recommendation:

- Remove these buttons until the feature is available.
- If roadmap signaling matters, replace them with a short text note below the real actions.

Evidence:

- `src/components/pages/login-page.tsx:126`
- `src/components/pages/signup-page.tsx:123`

## Route Notes

### Strongest screens

- `/login` desktop
- `/support` desktop and mobile
- `/pricing` desktop

These are the best references for future refinement work because they are visually clear and easy to understand quickly.

### Weakest screens

- `/recordings` for unauthenticated users
- `/files` for unauthenticated users
- `/` on mobile due to length and copy density

## Recommended Sequence

### Quick wins

1. Unify unauthenticated handling for all protected routes.
2. Remove disabled “coming soon” auth buttons.
3. Rewrite meta homepage copy into direct customer language.

### Medium effort

1. Reduce workspace hero chrome on recordings, upload, contacts, and files.
2. Make mobile email login available without an extra reveal step.
3. Tighten pricing comparison and CTA consistency.

### Larger improvement

1. Rework the landing page into a shorter, proof-led story optimized for mobile scanning.

## Overall Assessment

The app does not need a full visual redesign. It needs tighter product communication and more consistent route behavior. Once auth gating, copy discipline, and top-of-page information density are cleaned up, the existing design system is strong enough to support a noticeably better user experience.
