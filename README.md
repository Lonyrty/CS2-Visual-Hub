# CS2 Visual Hub

CS2 Visual Hub is a website plus a Windows desktop companion app. The desktop app opens its dedicated **Desktop Visual Lab** at `/desktop.html` on the shared cloud service, so the website and app use the same server-side accounts and preset library. It does not create a separate local owner account or local copy of the app database.

## Windows desktop app

- The app connects to `https://cs2-visual-hub-1.onrender.com` by default.
- Optional override: set `CS2_VISUAL_HUB_URL` in the environment before starting the app.
- Press **F8** to show or hide the app window.
- Sign in with the same account used on the website.
- Visual presets are saved to the shared server and can be listed, loaded, and deleted from the desktop app.
- The app is a separate desktop window; it does not inject into the CS2 process. Some games using exclusive fullscreen or anti-cheat policies may prevent overlays from appearing; use borderless-window mode if needed.

## Build the Windows installer

Requirements: Windows, Node.js 22.x, npm.

1. Clone this repository.
2. Run `npm install`.
3. Run `npm run dist`.
4. The installer will be written to `release/CS2-Visual-Hub-Setup.exe`.

The app requires an internet connection to reach the configured Hub service. It no longer starts a second local Express server or creates a separate local account database.

## Website on Render

Start command: `npm start`. The web service runs `server.js`. Keep deployment secrets in Render Environment, not in repository files. The desktop preset API stores each user's presets in the same SQLite database used by the website.

## Current capabilities and limitations

- Website visual gallery, poster creator, profiles, player search, friends/chat, subscriptions and admin interfaces, subject to backend configuration.
- Desktop Visual Lab with crosshair tuning, CFG export, JSON export, and cloud-synced visual preset save/load/delete.
- The preview for skins/sky/lighting is illustrative. Presets do not automatically change weapon finishes, skyboxes, or other assets in standard CS2 matchmaking. The app is not a cheat and does not inject into or modify Counter-Strike 2.

## Security notes

- Never commit credentials, API keys, payment secrets, or production session secrets.
- Do not package a local `.env` file in the installer.
