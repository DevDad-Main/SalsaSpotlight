<div align="center">

# SalsaSpotlight

**A fast, beautiful Spotlight-style launcher and floating desktop widgets for Windows 11.**

Press <kbd>Alt</kbd> + <kbd>Space</kbd> and search your whole PC. No admin rights needed.

</div>

---

## Features

- **Instant search** across apps, files and folders, with fuzzy matching and results that learn what you open most.
- **Acrylic glass UI** with rounded corners, smooth animations, your Windows light or dark theme and a custom accent colour.
- **Built-in extras:** calculator (`12*7+3`), web search, clipboard history (type `clip`), and commands such as Settings, Task Manager and Lock PC.
- **13 floating desktop widgets** that appear only when you are on the desktop:
  clock, world clock, weather, system monitor, PC specs (CPU, GPU, RAM, display), storage, calendar, day/year progress, timer, to-do, notes, frequent apps and clipboard.
- **Highly customizable:** hotkeys, theme, glass tint, widget opacity and size, per-widget options, search sources and search engine.
- **No admin needed.** Everything is stored per user in `%APPDATA%`.

## Install

Download the latest build from the [Releases](https://github.com/DevDad-Main/SalsaSpotlight/releases) page:

| File | Use it when |
| --- | --- |
| `SalsaSpotlight-Setup-x.y.z.exe` | You want a normal per-user install (no admin prompt). |
| `SalsaSpotlight-Portable-x.y.z.exe` | You want to run it from a folder or USB stick with no install. |

Node.js is **not** required. The app bundles everything it needs.

> Windows SmartScreen may warn about an unsigned app. Choose **More info > Run anyway**.

## Usage

| Action | How |
| --- | --- |
| Open or close | <kbd>Alt</kbd> + <kbd>Space</kbd> (falls back to <kbd>Ctrl</kbd> + <kbd>Space</kbd>) |
| Open result | <kbd>Enter</kbd> |
| Show in folder | <kbd>Ctrl</kbd> + <kbd>Enter</kbd> |
| Clipboard history | type `clip` |
| Toggle a widget | type `widget`, or use the tray menu |
| Peek widgets over windows | <kbd>Alt</kbd> + <kbd>W</kbd> |
| Settings | type `settings`, or tray icon > Settings |

## Widgets

Widgets show only while the desktop is in front (for example after <kbd>Win</kbd> + <kbd>D</kbd>). Change this in **Settings > Widgets** to *Always on top* or *Only when peeking*. Drag them anywhere; positions are remembered.

## Develop

```bash
npm install
npm start        # run from source
npm run dist     # build installer and portable exe into dist/
```

Built with Electron. Weather comes from [Open-Meteo](https://open-meteo.com) (no API key). Errors are logged to `%APPDATA%\spotlight-win\error.log`.

## License

MIT
