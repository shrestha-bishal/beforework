# Beforework

![Beforework logo](images/icon-wide.png)

Beforework is a private, local-first project management workspace for tasks, projects, calendars, and focus sessions. It runs as a static site and stores workspace data in a JSON file that you choose on your device.

<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/f27b347e-af08-4e8b-a335-67ca0cd799f7" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/1ee74fc4-b7cf-4a70-9efc-f57958458c94" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/2a5d4e85-39f1-459f-b748-6ed21bce22a4" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/27fc4a37-6195-4407-8996-f38a0786ce48" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/6bedd4ba-bccd-49b7-9e32-fbd587ee5a6b" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/e1c32c8a-a80c-40dc-8814-1c7e9475f69f" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/1c8fba5f-0b4a-46f0-aaf3-db3c60306493" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/38ba3c75-6ef6-40ba-83d4-bc2c01029470" />


## Hosted version

If you do not want to host Beforework locally, use the hosted version at [beforework.netlify.app](https://beforework.netlify.app/).

Open it in Chrome or Edge, then create or connect a Beforework JSON file to start using the workspace.

Beforework is open source under the [MIT License](LICENSE). Contributions and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Project, folder, task, and group management
- Duplicate projects, project tasks, and standalone calendar items
- List, table, board, and calendar views
- Tags, priorities, due dates, custom fields, and archived items
- Overview dashboard with workload and progress summaries
- Focus timer
- Browser notifications for scheduled reminders and due-today tasks while the app is open
- Optional Google Calendar synchronisation
- Import and export through the connected JSON workspace file

## Run locally

Beforework uses the File System Access API to open and save its workspace file. Open it from a Chromium-based browser through `localhost` or HTTPS rather than using a `file://` URL.

If Python is installed:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in Chrome or Edge and create a new workspace file, or open an existing Beforework JSON file.

Local hosting starts with an empty workspace by default. To explore the sample workspace without building anything locally, visit the [Beforework demo](https://beforework-demo.netlify.app/).

For development, if you need to run the demo data locally, build and serve the generated site with demo mode enabled:

```powershell
$env:BEFOREWORK_MODE = "demo"
node scripts/build-site.js
python -m http.server 8000 --directory dist
```

On macOS or Linux, run the build with `BEFOREWORK_MODE=demo node scripts/build-site.js`, then serve `dist` with a static file server.

## Deploy

This is a static site. Netlify runs `node scripts/build-site.js` and publishes `dist`. Set the site environment variable `BEFOREWORK_MODE` to `demo` to seed new workspace files with sample projects and calendar items. The default is `clean`, which creates an empty workspace.

To host both versions, connect the same repository and branch to two Netlify sites. Leave `BEFOREWORK_MODE` unset (or set it to `clean`) for `beforework.netlify.app`, and set it to `demo` for `beforework-demo.netlify.app`. Changes to an existing workspace file are unaffected by this setting.

The source config defaults to `clean`. The build script writes the selected mode into `dist/js/site-config.js` without changing the source config.

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
- `js/demo-seeder.js` - sample personal and professional workspace data
- `js/schema-migration.js` - versioned upgrades and pre-upgrade backups for workspace files
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
