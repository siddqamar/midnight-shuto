# Repository Guidelines

## Project Structure

Midnight Shuto is a Vite-powered Three.js browser game.

- `src/` contains the application and game code.
- `src/core/` coordinates the game loop, configuration, persistence, and shared types.
- `src/world/`, `src/vehicles/`, `src/traffic/`, and `src/missions/` contain the main gameplay systems.
- `src/ui/` contains the menu, HUD, panels, and player-facing controls.
- `src/audio/`, `src/camera/`, and `src/utils/` contain supporting systems.
- `public/` contains static files such as the manifest, service worker, and favicon.
- `scripts/e2e.mjs` contains the Playwright end-to-end test.
- `demo.gif` is the README gameplay preview.

## Development Commands

Use Node.js 22 or newer.

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run test:e2e
```

`npm run dev` starts the Vite development server.
`npm run build` runs TypeScript validation and creates the production bundle.
`npm run typecheck` runs TypeScript validation without bundling.
`npm run test:e2e` exercises driving, mission startup, screenshots, and offline reload behavior through Playwright.

## Coding Style and Naming

Use TypeScript with strict typing and two-space indentation.
Keep systems small and separated by responsibility, with gameplay logic in the relevant `src/` module.
Use `PascalCase` for classes and component-like modules, `camelCase` for variables and functions, and descriptive `UPPER_SNAKE_CASE` names for constant configuration when appropriate.
Prefer existing project patterns and avoid introducing a formatter or linter without first updating the project scripts.

## Testing Guidelines

Run `npm run typecheck` or `npm run build` for every code change.
Run `npm run test:e2e` for changes affecting controls, rendering, missions, persistence, or visible UI.
When UI behavior changes, include updated screenshots or a short visual description in the pull request.

## Commits and Pull Requests

Use concise, imperative commit subjects with a Conventional Commit prefix, such as `feat:`, `fix:`, or `docs:`.
Keep unrelated changes in separate commits.
Pull requests should explain the user-visible result, list verification commands, link an issue when one exists, and include screenshots or a recording for visual changes.

## Configuration and Safety

Do not commit generated `dist/` output, secrets, local save data, or dependency directories.
Keep browser-facing changes compatible with the existing Vite and service-worker setup.
