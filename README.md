<p align="center">
  <img src="app-icon.png" alt="Luna Ultra Desktop" width="160" height="160" />
</p>

<h1 align="center">Luna Ultra Desktop</h1>

<p align="center">
  A desktop companion for the <strong>Insta360 Luna Ultra</strong> camera.
</p>

<p align="center">
  Built with <a href="https://v2.tauri.app/">Tauri 2</a> · <a href="https://nuxt.com/">Nuxt 4</a> · <a href="https://ui.nuxt.com/">Nuxt UI</a> · <a href="https://threejs.org/">Three.js</a>
</p>

Connect over Wi-Fi to browse the camera's media library, batch-download photos and videos with the official Luna Ultra watermark, delete files, and explore the camera as an interactive 3D model. Ships as a native desktop app for macOS, Windows, and Linux with signed auto-updates.

<p align="center">
  <img src="screenshots/02-gallery.png" alt="Gallery" width="49%" />
  <img src="screenshots/01-connect.png" alt="Connect" width="49%" />
</p>

## Features

- **Real camera connection** — pairs with the Luna Ultra over its Wi-Fi network using the camera's own TCP control protocol and HTTP media index. No mock data.
- **Gallery** — date-grouped grid with photo/video filtering, three thumbnail sizes, and a full-screen preview with metadata and keyboard navigation.
- **Multi-select** — click to toggle, shift-click for ranges, per-day select, and select-all. A floating action bar drives downloads and deletes.
- **Downloads** — a background queue with per-file progress, streamed straight from the camera to your Downloads folder.
- **Official watermark** — applies the genuine Insta360 Luna Ultra watermark asset to photos on download, placed per the camera's real aspect-ratio layout table.
- **Delete** — removes files from camera storage over the control channel (permanent, with a confirmation step).
- **3D showpiece** — the camera rendered from its hi-fi 3D scan with orbit controls, in black or white to match the app theme.
- **Two colorways** — Arctic (light) and Midnight (dark), matching the camera's finishes.
- **Auto-updates** — signed delta updates delivered from GitHub Releases.

## Screenshots

**Connect & 3D showpiece** — pair the camera and inspect it as a hi-fi 3D model.

![Connect and 3D model](screenshots/01-connect.png)

| Gallery | Multi-select |
| --- | --- |
| ![Gallery](screenshots/02-gallery.png) | ![Selection](screenshots/03-selection.png) |

| Download + watermark | Full-screen preview |
| --- | --- |
| ![Download](screenshots/04-download-watermark.png) | ![Preview](screenshots/05-preview.png) |

| Downloads queue | Light theme (Arctic) |
| --- | --- |
| ![Downloads](screenshots/06-downloads.png) | ![Light theme](screenshots/07-gallery-light.png) |

## Installing

Download the installer for your platform from the [latest release](https://github.com/Ripwords/luna-ultra-desktop/releases/latest).

### macOS — "'Luna Ultra Desktop' is damaged and can't be opened"

The app is signed with an ad-hoc key but is **not** yet notarized by Apple, so macOS Gatekeeper quarantines it on download and shows this message. The app isn't actually damaged. Drag it to **Applications**, then clear the quarantine attribute in Terminal:

```bash
xattr -cr "/Applications/Luna Ultra Desktop.app"
```

Then open it normally (or right-click → Open the first time). If you kept the app somewhere other than Applications, point the command at that path instead — for example:

```bash
xattr -cr ~/Downloads/"Luna Ultra Desktop.app"
```

- `xattr -cr` clears **all** extended attributes recursively, which removes the `com.apple.quarantine` flag that triggers the error.
- To remove only the quarantine flag: `xattr -dr com.apple.quarantine "/Applications/Luna Ultra Desktop.app"`.

> The permanent fix is Apple Developer ID signing + notarization (requires a paid Apple Developer account). Once set up, this manual step goes away — see [Releases & auto-updates](#releases--auto-updates).

## How it connects

The Luna Ultra exposes two services on its Wi-Fi network (default gateway `192.168.42.1`):

- **TCP control (port 6666)** — a UCD2-framed binary protocol used for the auth handshake, device info, and delete commands. A live control session also unlocks the HTTP media index.
- **HTTP (port 80)** — an autoindex-style listing of the camera's storage, plus `Range`-capable file downloads.

The control protocol is implemented in Rust (`src-tauri/src/luna.rs`) and exposed to the frontend as Tauri commands; the HTTP index is parsed on the frontend (`app/utils/lunaIndex.ts`). This protocol was reconstructed from the open-source [`diamondfsd/luna-ai-cut`](https://github.com/diamondfsd/luna-ai-cut) project, which also ships the mock camera server vendored here under `luna_mock_server/`.

## Project layout

```
app/                     Nuxt frontend (pages, components, composables, utils)
  composables/useCamera  Connection lifecycle, auto-reconnect
  composables/useGallery Selection, filtering, delete
  composables/useDownloads  Download queue + watermark compositing
  composables/useUpdater Auto-update checker
  utils/lunaClient.ts    Bridge to the Rust commands + HTTP listing
  utils/lunaIndex.ts     Camera HTTP index parser
  utils/watermark*.ts    Official watermark placement engine
src-tauri/src/luna.rs    Luna Ultra TCP control protocol (Rust)
luna_mock_server/        Camera emulator for development and tests
tests/                   Vitest unit tests
screenshots/             Product screenshots
```

## Development

Requires [Bun](https://bun.sh/), [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
bun install

# Run the full desktop app (Tauri + Nuxt)
bun run dev

# Run just the web frontend in a browser (camera control is unavailable here)
bun run ui:dev
```

> Camera control requires the desktop app — a browser cannot open the raw TCP socket. In `bun run ui:dev` the Connect screen shows a notice explaining this.

### Testing against the mock camera

The vendored `luna_mock_server/` emulates the real Luna Ultra protocol. Point it at a folder of media and connect the app to it:

```bash
node luna_mock_server/server.mjs \
  --root /path/to/media --host 127.0.0.1 --http-port 18080 --tcp-port 6666
```

Then launch `bun run dev` and connect to `127.0.0.1:18080` from the Connect screen.

### Quality checks

```bash
bun x vitest run                                   # frontend unit tests
bun run typecheck                                  # Nuxt/vue-tsc
bun run lint                                       # oxlint
cargo test --manifest-path src-tauri/Cargo.toml    # Rust protocol + integration tests
```

## Building

```bash
bun run build
```

Bundles land in `src-tauri/target/release/bundle/`.

## Releases & auto-updates

Cutting a release is one command:

```bash
bun run release
```

This uses [`changelogen`](https://github.com/unjs/changelogen) to determine the next version from your [Conventional Commits](https://www.conventionalcommits.org/), update `CHANGELOG.md`, sync that version into `package.json`, `src-tauri/tauri.conf.json`, and `Cargo.toml`, then commit, tag, and push. (Force a specific bump with `bun run release -- --patch` / `--minor` / `--major`.)

Pushing the tag triggers `.github/workflows/release.yml`, which:

1. Opens a **single** GitHub Release with notes generated by `changelogen` (the previous duplicate-release problem is solved by creating the release once, up front).
2. Builds and signs bundles for macOS (Apple Silicon + Intel), Windows, and Linux with [`tauri-action`](https://github.com/tauri-apps/tauri-action), uploading each to that one release along with the `latest.json` update manifest.
3. Publishes the release once every platform succeeds (a failed platform leaves it as a draft for inspection).

The app checks for updates on launch and hourly, showing an install prompt in the sidebar when one is available (`app/composables/useUpdater.ts`).

> To preview the notes for the next release without cutting it, run `bun run changelog` (writes `CHANGELOG.md`).

### One-time setup

1. **Updater endpoint.** In `src-tauri/tauri.conf.json` the endpoint must point at your repo (already set to `Ripwords/luna-ultra-desktop`):

   ```json
   "endpoints": ["https://github.com/<owner>/luna-ultra-desktop/releases/latest/download/latest.json"]
   ```

2. **Signing keys.** A keypair has already been generated. The public key is committed in `tauri.conf.json`; the private key is in `src-tauri/luna-ultra-updater.key` and is git-ignored. Add it as a repository secret (the key has no password, so only the first is required):

   - `TAURI_SIGNING_PRIVATE_KEY` — the full contents of `src-tauri/luna-ultra-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — omit for a passwordless key

   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY < src-tauri/luna-ultra-updater.key
   ```

   To rotate the key, run `bun x tauri signer generate -w src-tauri/luna-ultra-updater.key` and paste the new public key into `tauri.conf.json`.

   > **Keep the private key safe.** If it is lost, existing installs can no longer verify updates.

## Credits

Camera protocol and the official watermark assets are derived from [`diamondfsd/luna-ai-cut`](https://github.com/diamondfsd/luna-ai-cut). Insta360 and Luna Ultra are trademarks of their respective owners; this is an unofficial companion app.
