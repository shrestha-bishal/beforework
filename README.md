# Beforework

![Beforework logo](images/icon-wide.png)

Beforework is a private, local-first project management workspace for tasks, projects, calendars, and focus sessions. It runs as a static site and stores workspace data in a JSON file that you choose on your device.

<img width="1920" height="929" alt="image" src="https://github.com/user-attachments/assets/5f9ccf49-465d-4033-8d5d-6028ea58fb10" />
<img width="1920" height="929" alt="image" src="https://github.com/user-attachments/assets/93eeb39d-c039-41a9-8328-3ddbe1fb9ad7" />
<img width="1920" height="929" alt="image" src="https://github.com/user-attachments/assets/7c8b7297-72b1-4c3d-a762-8cb0bda64599" />
<img width="1920" height="983" alt="image" src="https://github.com/user-attachments/assets/d050db1f-d509-413e-a921-0296dfcc13c3" />

## Hosted version

If you do not want to host Beforework locally, use the hosted version at [beforework.netlify.app](https://beforework.netlify.app/).

Open it in Chrome or Edge, then create or connect a Beforework JSON file to start using the workspace.

Beforework is open source under the [MIT License](LICENSE). Contributions and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Project, folder, task, and group management
- List, table, board, and calendar views
- Tags, priorities, due dates, custom fields, and archived items
- Overview dashboard with workload and progress summaries
- Focus timer
- Optional Google Calendar synchronisation
- Import and export through the connected JSON workspace file

## Run locally

Beforework uses the File System Access API to open and save its workspace file. Open it from a Chromium-based browser through `localhost` or HTTPS rather than using a `file://` URL.

If Python is installed:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in Chrome or Edge and create a new workspace file, or open an existing Beforework JSON file.

## Deploy

This is a static site. Publish the repository root with any static hosting provider such as Netlify, GitHub Pages, or Cloudflare Pages. No build command or server runtime is required.

For production use, serve the site over HTTPS. Users still retain their data locally or in a synced folder such as OneDrive or Google Drive; the application does not upload workspace data to a project server.

## Google Calendar

Google Calendar is optional. Configure the Google OAuth client ID used by the application, then connect calendars from the **Integrations** page. Calendar synchronisation requires the relevant Google Calendar API and OAuth consent configuration.

## Data format and upgrades

Workspace files are versioned JSON documents. Each file includes a `schemaVersion` value so Beforework can recognise its data format. The current format is schema version 5.

When an older or unversioned file is opened or imported, Beforework applies its migrations in order until the file reaches the current version. Migrations add or reshape fields without deleting retired properties, which helps keep older files recoverable. The upgraded data is then saved back to the connected JSON file.

Before upgrading, Beforework automatically stores a pre-upgrade snapshot in the browser. If anything looks wrong after an upgrade, use **Settings > Storage & Data > Pre-upgrade backup** to restore it. This safety snapshot is browser-local; keep a normal exported JSON backup as well when making important changes.

New schema changes should add a new migration step rather than changing an existing one, so files from every earlier version can continue to upgrade safely.

## Project structure

- `index.html` - application shell
- `js/` - application logic, persistence, integrations, and view templates
- `pages/` - dashboard and settings page fragments
- `styles/app.css` - application styles
- `images/` - icons and image assets

## Funding & Sponsorship
Beforework is an open-source, local-first project maintained to give people a private and portable way to manage projects, tasks, and calendars. If you find it useful, sponsorship helps support ongoing maintenance, browser compatibility, accessibility, documentation, and new privacy-focused features.

### Support Beforework

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-Become%20a%20Sponsor-blueviolet?logo=githubsponsors&style=flat-square)](https://github.com/sponsors/shrestha-bishal)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20Developer-yellow?logo=buymeacoffee&style=flat-square)](https://www.buymeacoffee.com/shresthabishal)
[![Thanks.dev](https://img.shields.io/badge/Thanks.dev-Appreciate%20Open%20Source-29abe0?logo=github&style=flat-square)](https://thanks.dev/gh/shrestha-bishal)


## Licence

This project is available under the MIT License. See [LICENSE](LICENSE) for the full text.
