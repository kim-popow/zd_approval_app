# Zendesk Deployment Runbook

This project is a Zendesk Support app scaffold. Deploy from the `ticket_approvals` folder.

## Prerequisites

1. Node.js 18+
2. Zendesk CLI installed and authenticated

```bash
npm i -g @zendesk/zcli
zcli login
```

## Local Development

Use two terminals:

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run start
```

Then open Zendesk with `?zcli_apps=true`.

## Build and Validate

```bash
npm run clean
npm run build
npm run validate
```

`validate` includes a build artifact check for:
- `dist/manifest.json`
- `dist/assets/index.html`
- `dist/assets/main.js`
- `dist/assets/main.css`
- `dist/translations/en.json`

## Deploy Commands

Create app (first install in account):

```bash
npm run deploy:create
```

Update existing app:

```bash
npm run deploy:update
```

Alias for standard update flow:

```bash
npm run release
```

Package ZIP for manual upload:

```bash
npm run clean
npm run build
npm run package:app
```

## Environment Notes

- Source manifest is `src/manifest.json`.
- Build rewrites location URLs via `rollup/modifiers/manifest.js` using:
  - `.env.development` for local server (`http://localhost:3000/`)
  - `.env.production` for packaged app (`assets/index.html`)

## Recommended Release Checklist

1. Confirm branch is clean and up to date.
2. Run `npm run lint` and optionally `npm run test`.
3. Run `npm run release`.
4. Verify app behavior on a test ticket in Zendesk.
