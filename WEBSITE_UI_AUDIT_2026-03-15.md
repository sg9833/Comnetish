# Comnetish Website UI / Frontend Audit

Date: 2026-03-15

Scope: Static/code audit of the Astro marketing site in `apps/website`, plus successful `pnpm build` and `pnpm typecheck` validation. This catches implementation and product-facing frontend issues, but it is not a pixel-perfect visual QA pass from a browser screenshot tool.

## Summary

The landing site builds successfully, but it has a number of production-readiness, UX, accessibility, and content/data issues. The biggest problems are that the primary CTAs are still hardcoded to localhost, the site config is still localhost-based, and several interactive pieces depend entirely on client-side JavaScript with weak failure states.

## Verified Issues

### 1. Primary CTAs and nav links are hardcoded to localhost

Severity: Critical

Affected locations:

- `apps/website/src/pages/index.astro:22`
- `apps/website/src/pages/providers.astro:17`
- `apps/website/src/pages/docs.astro:28`
- `apps/website/src/pages/docs.astro:39`
- `apps/website/src/layouts/MarketingLayout.astro:201`

Why this is a problem:

- The main conversion actions point to `http://localhost:3000` and `http://localhost:3002`.
- Outside your laptop, these flows break immediately.
- This also makes the site unsuitable for demo, staging, or production use.

### 2. Astro site URL is still configured as localhost

Severity: Critical

Affected location:

- `apps/website/astro.config.mjs:4`

Why this is a problem:

- The site config is `http://localhost:4321`.
- Any generated canonical/site-aware metadata will be wrong in non-local environments.
- It is a direct sign the website is not wired for public deployment.

### 3. Website environment contract is inconsistent with the repo documentation

Severity: High

Affected locations:

- `README.md:244`
- `apps/website/src/pages/index.astro:4`

Why this is a problem:

- The README says website env vars are `PUBLIC_SITE_URL` and `PUBLIC_CONSOLE_URL`.
- The homepage actually reads `PUBLIC_API_URL`.
- The CTA links do not use `PUBLIC_CONSOLE_URL` at all.
- This mismatch will cause incorrect setup and broken links when someone tries to deploy the site.

### 4. Live stats and waitlist submission fall back to localhost API

Severity: High

Affected locations:

- `apps/website/src/pages/index.astro:4`
- `apps/website/src/layouts/MarketingLayout.astro` client script for stats and waitlist

Why this is a problem:

- If `PUBLIC_API_URL` is unset, the site falls back to `http://localhost:3001`.
- On any shared or public deployment, stats and waitlist submission will fail unless this env var is always set correctly.
- Failure is easy to miss because the UI degrades quietly.

### 5. The page hides reveal-animated content until JavaScript runs

Severity: High

Affected locations:

- `apps/website/src/layouts/MarketingLayout.astro:158`
- `apps/website/src/layouts/MarketingLayout.astro:211`

Why this is a problem:

- `[data-reveal]` starts at `opacity: 0` and is only shown when the script adds the `in` class.
- If JavaScript fails, is delayed, or is disabled, large parts of the page remain hidden.
- This is a progressive-enhancement failure on core content.

### 6. The waitlist form has no non-JavaScript fallback

Severity: High

Affected location:

- `apps/website/src/pages/index.astro:174`

Why this is a problem:

- The form has no `action` and no `method`.
- Submission only works through the client-side script.
- If the script fails, the form becomes a dead UI element.

### 7. The stats label says “Deployments Today” but the code displays total deployments

Severity: High

Affected locations:

- `apps/website/src/pages/index.astro` stats copy
- `apps/website/src/layouts/MarketingLayout.astro:257`

Why this is a problem:

- The UI promises a daily metric.
- The script reads `platformPayload?.data?.totalDeployments`.
- That is a content/data mismatch and makes the homepage numerically misleading.

### 8. Error states for live stats are too silent and too weak

Severity: Medium

Affected locations:

- `apps/website/src/layouts/MarketingLayout.astro:257`
- `apps/website/src/layouts/MarketingLayout.astro:271`

Why this is a problem:

- Failed requests collapse to `—` with no explanation.
- There is no loading state, stale-data indicator, or retry feedback.
- Polling runs every 30 seconds, but failures are invisible to the user.

### 9. The waitlist form allows repeated submits and has weak validation

Severity: Medium

Affected locations:

- `apps/website/src/layouts/MarketingLayout.astro:300`
- `apps/website/src/layouts/MarketingLayout.astro:307`

Why this is a problem:

- Validation is only `value.includes('@')`.
- There is no pending state.
- The submit button is never disabled during the request.
- Users can double-submit or get low-quality validation feedback.

### 10. Keyboard focus styling is missing for links, buttons, and inputs

Severity: Medium

Affected location:

- `apps/website/src/layouts/MarketingLayout.astro`

Why this is a problem:

- The shared styles define hover treatments, but there are no `:focus` or `:focus-visible` styles for interactive controls.
- Keyboard users do not get a strong visual indication of current focus.
- This is both an accessibility and usability issue.

### 11. The navigation is not properly adapted for small screens

Severity: Medium

Affected locations:

- `apps/website/src/layouts/MarketingLayout.astro:99`
- `apps/website/src/layouts/MarketingLayout.astro:197`

Why this is a problem:

- The header wraps at smaller widths, but the nav remains a single inline-flex row with fixed gaps.
- There is no compact nav, hamburger, or explicit wrap behavior for the nav links.
- On narrower mobile widths, the header is likely to feel cramped or overflow.

### 12. The pricing table forces horizontal scrolling on mobile

Severity: Medium

Affected location:

- `apps/website/src/pages/index.astro:317`

Why this is a problem:

- The table has `min-width: 700px`.
- On phones, users must scroll horizontally to read a core sales comparison.
- For a landing page, this is a weak mobile presentation for one of the main proof points.

### 13. Reduced-motion support is incomplete

Severity: Medium

Affected locations:

- `apps/website/src/pages/index.astro:485`
- `apps/website/src/layouts/MarketingLayout.astro`
- `apps/website/src/pages/index.astro` hero/how-it-works animation styles

Why this is a problem:

- The particle canvas checks `prefers-reduced-motion`.
- The reveal transitions and bobbing icon animation do not appear to be disabled for reduced-motion users.
- Motion-sensitive users still get animated UI behavior in other parts of the page.

### 14. Metadata is too thin for a public marketing site

Severity: Medium

Affected location:

- `apps/website/src/layouts/MarketingLayout.astro` head section

Why this is a problem:

- The layout includes only basic title/description and font preconnects.
- There is no canonical URL.
- There are no Open Graph tags.
- There are no Twitter card tags.
- There is no favicon definition.
- There is no theme-color metadata.

### 15. Calculator output updates are not announced accessibly

Severity: Medium

Affected locations:

- `apps/website/src/pages/index.astro` calculator section
- `apps/website/src/pages/providers.astro` calculator section
- `apps/website/src/layouts/MarketingLayout.astro` calculator script

Why this is a problem:

- The displayed CPU, RAM, CNT, and USD values change dynamically.
- There is no `aria-live` region or other accessible announcement mechanism for those updates.
- Screen reader users may not get meaningful feedback while adjusting sliders.

### 16. The pricing comparison has no source or calculation notes

Severity: Low

Affected location:

- `apps/website/src/pages/index.astro` pricing comparison table

Why this is a problem:

- The site presents precise savings claims against AWS.
- There is no region, date, instance-type mapping, or pricing methodology shown.
- Even if the numbers are directionally right, the presentation feels unsupported.

### 17. The docs page is too shallow to function as real documentation

Severity: Low

Affected location:

- `apps/website/src/pages/docs.astro`

Why this is a problem:

- The page is mostly a short quickstart and a few shell commands.
- For a visitor arriving from the landing page, it does not answer common questions about architecture, pricing model, provider requirements, networking, billing, or troubleshooting.
- As a result, the “Docs” route behaves more like a teaser page than usable documentation.

## Notes

- `pnpm build` succeeds for `apps/website`.
- `pnpm typecheck` succeeds for `apps/website`.
- That means the main problems are frontend quality and product wiring issues, not compiler errors.

## Recommended Fix Order

1. Remove localhost URLs and replace them with env-driven public URLs.
2. Align the website env var contract with the README and the rest of the repo.
3. Fix progressive enhancement problems for reveal animations and the waitlist form.
4. Correct misleading stats copy and improve stats/waitlist error handling.
5. Improve mobile navigation, focus states, metadata, and reduced-motion coverage.
