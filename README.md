# Yoto Local

Download YouTube playlists as MP3s on your own computer, and send them to your Yoto player as
Make Your Own (MYO) playlists.

**App:** https://coxsm.github.io/yoto-local/

## How it works

```
https://coxsm.github.io/yoto-local/      the web app (installable PWA, hosted on GitHub Pages)
        │  fetch, on your machine only
        ▼
http://127.0.0.1:5174                    the Yoto Local companion (runs on your computer)
        ├─ yt-dlp + ffmpeg  →  ~/Music/YotoLocal
        ├─ library: artwork, audio playback
        └─ uploads albums to Yoto
```

A web page can't run yt-dlp or write to your Music folder, so the companion does that part. It
listens only on `127.0.0.1`, only accepts requests from the Yoto Local app, and requires a pairing
code that you enter once per browser.

Signing in to Yoto happens directly between your browser and Yoto; the companion only receives
your access token when you ask it to upload an album.

**Browser support:** Chrome, Edge and Firefox. Safari blocks secure pages from talking to
`127.0.0.1`, so it can't reach the companion.

## Running the companion

Requires [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/coxsm/yoto-local.git
cd yoto-local
npm install
npm start
```

The companion prints a **pairing code**. Open the app, enter the code, and you're ready. If
your browser asks whether the site may access devices on your local network, choose **Allow**.
That permission is what lets the page reach the companion.

### Start button (Windows)

Browsers can't run files on your computer, so the app uses a `yoto-local://` link instead:

1. When the companion isn't running, the app asks for the path to `start-companion.bat` (in the
   repo root; Shift + right-click it → **Copy as path**). The path is saved in your browser.
2. Click **Download launcher**, double-click `yoto-local-launcher.reg` and confirm. This registers
   `yoto-local://` for your Windows user only (no admin rights needed).
3. Click **Start companion**. The companion opens in a console window and the app connects.

The registered command always runs that exact batch file and ignores the rest of the link, so
other websites can't use it to run anything else. To remove it, delete
`HKEY_CURRENT_USER\Software\Classes\yoto-local` in Registry Editor.

### yt-dlp and ffmpeg

The companion looks for each tool in this order:

1. The `YTDLP_PATH` / `FFMPEG_PATH` environment variables
2. `companion/bin/<platform>/` (Windows builds are included in the repo)
3. Your `PATH`

On macOS or Linux, run `npm run fetch-ytdlp -w companion` to download the pinned yt-dlp, and
install ffmpeg with your package manager (`brew install ffmpeg`, `apt install ffmpeg`).

YouTube changes often, so keep yt-dlp current. The companion uses the Node.js runtime it runs on to
solve YouTube's JavaScript challenges; no extra runtime is needed.

### Configuration

| Variable              | Default                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `YOTO_LOCAL_LIBRARY`  | `~/Music/YotoLocal`                                                                    |
| `YOTO_LOCAL_PORT`     | `5174`                                                                                 |
| `YOTO_LOCAL_DATA_DIR` | `%APPDATA%` / `~/Library/Application Support` / `~/.config`, in `yoto-local-companion` |
| `YOTO_LOCAL_ORIGINS`  | Extra comma-separated origins allowed to use the companion (for forks)                 |

Sync status from the old Electron app is imported automatically the first time the companion runs.

## Development

```bash
npm install
npm run dev          # companion (tsx watch) + web app on http://localhost:5173
npm test             # companion unit tests
npm run lint
npm run typecheck
```

| Folder       | What it is                                                         |
| ------------ | ------------------------------------------------------------------ |
| `web/`       | React + Vite + Tailwind PWA, deployed to GitHub Pages              |
| `companion/` | Fastify server that runs yt-dlp, serves the library, syncs to Yoto |
| `shared/`    | API types used by both                                             |

### Yoto login redirect URIs

These must be listed as allowed callback URLs for the app in the Yoto developer dashboard:

- `http://localhost:5173/callback` for local development
- `https://coxsm.github.io/yoto-local/` for the hosted app

## Deployment

- **CI** (`.github/workflows/ci.yml`) runs format check, lint, typecheck, tests and builds on every
  push and pull request, plus a companion smoke test on Windows, macOS and Linux.
- **Pages** (`.github/workflows/pages.yml`) builds `web/` and deploys it on every push to `main`
  that touches the web app. Installed copies of the PWA show a "new version available" prompt.
