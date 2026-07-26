# Midnight Shuto

Midnight Shuto is a browser-based open-world arcade driving game set in a stylized Japanese city.
It is built with Three.js, TypeScript, Vite, and cannon-es.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The output in `dist/` uses relative paths and can be deployed directly to GitHub Pages.

## Deploy to GitHub Pages

Push the project to the `main` branch of a GitHub repository.
Open the repository's Settings, choose Pages, and set the source to GitHub Actions.
The included workflow builds and publishes `dist/` automatically on every push to `main`.

## Controls

- `WASD` or arrow keys: drive and steer
- `Space`: handbrake
- `E`: start a nearby mission
- `C`: change camera
- `M`: expand the map
- `R`: recover the car
- `Esc` or `P`: pause
- `F3`: developer telemetry

Gamepads are supported after the first button press.
