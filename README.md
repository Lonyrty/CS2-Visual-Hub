# CS2 Visual Hub

CS2 Visual Hub is a community visual gallery and poster creator, with a Windows companion overlay. It is not a cheat and does not inject into or modify Counter-Strike 2.

## Windows overlay

- **F8** toggles the overlay window.
- **Esc** hides it.
- The window is borderless and stays on top of other windows.
- This is a separate desktop overlay, not an interface injected into the CS2 process. Some games using exclusive fullscreen or anti-cheat policies may prevent overlays from appearing; use borderless-window mode if needed.

## Build the Windows installer

Requirements: Windows, Node.js 22.x, npm.

1. Clone this repository.
2. Run `npm install`.
3. Configure the server environment in a local `.env` file. Keep secrets private; never commit `.env` to GitHub.
4. Run `npm run dist`.
5. The installer will be written to `release/CS2-Visual-Hub-Setup.exe`.

The desktop app currently starts the local Express server at `http://127.0.0.1:3000`, so its environment must be configured before first launch. Set a unique `SESSION_SECRET` and `OWNER_PASSWORD`. Stripe can be left unconfigured if payment is not needed.

## Website on Render

Start command: `npm start`. The web service runs `server.js`. Keep deployment secrets in Render Environment, not in repository files.

## Current capabilities

- Neon visual gallery with style filters.
- Poster creator with editable title, subtitle, accent color, background, and SVG export.
- User profiles, player search, friends/chat, subscription and admin interfaces, subject to backend configuration.

## Security notes

- Never commit credentials, API keys, payment secrets, or production session secrets.
- Do not package a local `.env` file in the installer.
