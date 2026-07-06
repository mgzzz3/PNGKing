# Copilot agent instructions for PNGKing

PNGKing is a privacy-first Vue 3 + Vite + TypeScript application for local image optimization in the browser.

## Working style

- Keep the UI and user-facing copy in Simplified Chinese unless the surrounding text is already English.
- Preserve the privacy boundary: image processing must stay client-side and must not upload user files to a server.
- Prefer small, focused pull requests that directly address the linked issue.
- Update or add Vitest coverage when changing utilities, stores, or image-processing behavior.
- For visible UI changes, include a short screenshot or describe why a screenshot could not be produced.

## Useful commands

Run these before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

`npm run check` combines lint, tests, type-checking, and production build.

## Project map

- `src/views/` contains route-level Vue views.
- `src/components/` contains reusable UI components.
- `src/stores/images.ts` owns imported image state and optimization workflow.
- `src/utils/imageOptimizer.ts` contains the browser-side optimization implementation.
- `src/utils/analytics.ts` defines analytics events; see `docs/analytics.md` before changing events.
- Product boundaries and acceptance criteria are documented in `docs/spec.md`.
