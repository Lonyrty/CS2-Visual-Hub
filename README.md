# CS2 Visual Hub

CS2 Visual Hub is a website plus a Windows desktop companion app. The website includes a visual-concept editor, crosshair builder, poster studio, gallery, user profiles, friends/chat, subscriptions and admin tools.

## Windows companion overlay

- Connects to `https://cs2-visual-hub-1.onrender.com` by default; set `CS2_VISUAL_HUB_URL` to override it.
- Press **F8** to show or hide the compact always-on-top companion panel.
- Press **Esc** to hide it.
- Sign in with the same account used on the website. The app has a dedicated Desktop Visual Lab rather than loading the homepage.
- The shared preset library is stored server-side; saved presets are available from both the website and the desktop app.
- To see the panel over CS2, run the game in **borderless windowed** mode. Some systems or exclusive-fullscreen configurations may place the game above ordinary desktop windows. This is a normal desktop overlay, not an injected game overlay.

## Build the Windows installer

Requirements: Windows, Node.js 22.x, npm.

1. Clone this repository.
2. Run `npm install`.
3. Run `npm run dist`.
4. The installer will be written to `release/CS2-Visual-Hub-Setup.exe`.

The desktop app requires an internet connection to reach the configured Hub service. It does not create a separate local Express server or local account database.

## Website on Render

Start command: `npm start`. The web service runs `server.js`. Keep deployment secrets in Render Environment, not in repository files. The visual preset API stores each user's presets in the same database used by the website.

## Current capabilities and limits

- Crosshair builder generates CS2 console commands and a downloadable `.cfg`; the user applies these in CS2 manually.
- Visual-concept editor previews weapon finish, environment, sky, lighting and viewmodel styles and exports JSON settings.
- Poster Studio exports editable SVG.
- Website and desktop app share a per-account cloud preset library.
- The app is a companion overlay, not a cheat. It does not inject into or modify the CS2 process. The visual skin/sky preview does not apply custom finishes or skyboxes to ordinary official matchmaking. Use Valve's official Workshop tools for actual custom content.

## Protecting accounts

Existing account/profile data and the `lonyrty` owner account are managed by the existing server database. These UI and preset changes do not edit profile fields or reset passwords. Never commit credentials, API keys, payment secrets, or production session secrets.
