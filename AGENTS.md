# Repository Guidelines

## Project Structure & Module Organization
The app uses the Next.js App Router with UI screens in `src/app/page.tsx` and layout scaffolding in `src/app/layout.tsx`.
REST-facing routes live under `src/app/api/*/route.ts` (with subfolders for bus line metadata), and client logic is separated into `src/components` (UI), `src/hooks` (stateful logic), `src/lib/validation.ts`, and shared shapes in `src/types`.
Static assets, fonts, and icons live in `public/`, while styling is centralized in `src/app/globals.css`, `tailwind.config.ts`, and `postcss.config.mjs`.

## Build, Test, and Development Commands
- `npm run dev` – start the Next.js development server with hot reload.
- `npm run build` – create the optimized production build; use this before shipping.
- `npm start` – run the production build locally.
- `npm run lint` – run ESLint with the Next.js config; treat warnings as actionable.
- `npm run lint:fix` – auto-fix lint and formatting issues when possible.

## Coding Style & Naming Conventions
Use TypeScript everywhere; export shared interfaces from `src/types` rather than redefining them.
Follow the established 2-space indentation, single quotes, and trailing commas as seen in existing modules.
Name React components with PascalCase, hooks with the `useSomething` pattern, and constants in SCREAMING_SNAKE_CASE (e.g. `POLLING_INTERVAL`).
Keep Tailwind utility classes readable by grouping related concerns (layout, spacing, color) on separate lines when needed.

## Testing Guidelines
We do not yet ship an automated test suite; contributions should add focused tests alongside new logic (e.g. `Component.test.tsx` next to the source or under `src/__tests__`).
Prefer `next/jest` plus React Testing Library for component behavior and mock network calls to `src/app/api`.
If tests are not practical, document the manual steps you executed (inputs, expected outputs, screenshots) in the pull request.

## Commit & Pull Request Guidelines
Match the conventional commit style already in history (`fix: …`, `feat: …`, `chore: …`) and keep messages in the imperative mood.
Each PR should describe the problem, solution, and validation, link any tracked issues, and include screenshots or clips for UI-visible changes.
Run `npm run lint` (and any added tests) before requesting review, note remaining risks, and call out any follow-up work explicitly.

## Security & Configuration Tips
Secrets live in `.env.local`; copy from `.env.local.example` and never commit the file.
When adding new environment toggles, document them in `README.md` and guard server routes against missing keys or rate limits.
