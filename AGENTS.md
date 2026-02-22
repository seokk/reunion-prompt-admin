# Repository Guidelines

## Project Structure & Module Organization

- `app/`: Next.js App Router pages and layouts (`app/layout.tsx`, `app/page.tsx`).
- `lib/`: Shared runtime utilities (Firebase and DB helpers in `lib/firebase.ts`, `lib/db.ts`).
- `public/`: Static assets served directly by Next.js.
- `styles/`: Legacy/global styles; active app-wide styles also exist in `app/globals.css`.
- `scripts/`: Utility scripts (for example `scripts/test-db.ts`).
- `functions/`: Firebase Cloud Functions TypeScript project with its own `package.json`.
- Root config files: `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `firebase.json`, `config.yml`.

## Build, Test, and Development Commands

- `npm install`: Install root dependencies.
- `npm run dev`: Start Next.js locally on default port using Webpack (explicitly required because `next.config.js` contains a custom `webpack` section).
- `npm run build`: Production build with Webpack.
- `npm run start`: Serve the production build.
- `npm run test:db`: Run the database connectivity script via `ts-node`.
- `cd functions && npm install && npm run build` (if available): Install/build Firebase Functions separately.

## Coding Style & Naming Conventions

- Language: TypeScript/TSX for app and functions code.
- Indentation: 2 spaces in TS/JS/JSON files (match existing files).
- React components: `PascalCase`; route files follow Next.js conventions (`page.tsx`, `layout.tsx`).
- Utilities/modules: `camelCase` file names or short lowercase names under `lib/`.
- Prefer small, focused modules; keep framework config changes isolated to config files.

## Testing Guidelines

- No full test framework is configured yet; current validation is script-based (`npm run test:db`).
- Add new tests near the feature or under a future `tests/` folder, and document execution commands in `package.json`.
- For DB/Firebase changes, include a reproducible verification step in the PR description.

## Commit & Pull Request Guidelines

- Commit messages should be short, imperative, and specific (example: `Add Firebase session helper`).
- Keep commits scoped to one change set (UI, config, or backend logic).
- PRs should include: purpose, key changes, local verification steps, and screenshots for UI changes.
- Link related issues/tasks and call out config or environment variable changes explicitly.

## Security & Configuration Tips

- Do not commit secrets or service account credentials.
- Keep environment-specific values in local env files or Firebase configuration, not in source.
- Review `next.config.js` and `firebase.json` changes carefully; they affect deployment/runtime behavior.
