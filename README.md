# Beforework

![Beforework logo](images/icon-wide.png)

Beforework is a serverless local-first project management workspace for projects, tasks, calendars, and focus sessions. Work across List, Table, Board, and Calendar views, and add custom fields, comments, checklists, reminders, and multiple file attachments to items. The static app stores workspace data in folders you choose on your device rather than any server. Optional Google Calendar integration connects to Google separately.

<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/d1246eb5-1276-4001-b1c7-254cc3c01815" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/ce98605e-02e2-4dea-a043-6bd452bb8ac5" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/4c1f8c79-466b-453f-a492-fbc421f0c7a5" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/d5e9bf2a-0cdc-4fb2-8d67-c0b5d541963f" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/69d4a958-970b-4690-8baf-7d7eb675e5c4" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/93efcddc-bbab-400a-81c5-2a2c1e70f861" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/5e930139-3644-414e-86e8-fcfe576fc497" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/0d3e7a7a-4cb2-45d2-9a2f-dfb15a8d751c" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/61c114d3-da65-4f30-8f70-15172d15af00" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/143a1b17-8a70-4777-9e0d-cb250ed2b051" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/c5f8a1fe-10cd-4cf9-85ac-430966c88c57" />



## Hosted version

If you do not want to host Beforework locally, use the hosted version at [beforework.netlify.app](https://beforework.netlify.app/).

Open it in Chrome or Edge, then choose a workspace root folder. Beforework creates each workspace as a separate child folder inside that root. Existing single-file JSON workspaces can still be opened and copied into the folder format.

Beforework is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Personal and non-commercial use are permitted. Offering Beforework, or a modified or hosted version of it, as a product or service to third parties requires permission. Contributions and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Projects, folders, groups, tasks, and standalone calendar items
- List, table, board, and calendar views
- Custom fields for text, dates, checkboxes, priority, single- and multi-selects, URLs, email addresses, and numbers
- Tags, subtasks, comments, activity history, archiving, recurring schedules, and reminders
- Multiple file attachments per item in folder workspaces
- Drag-and-drop data-column ordering saved independently for List and Table views
- CSV export of the current filtered List or Table view, in visible column and row order
- CSV import with column mapping and preview into an existing or new project. It supports task titles, descriptions, due dates, priority, status/groups, and tags; select the date format used by the CSV (`DD/MM/YYYY`, `MM/DD/YYYY`, or `YYYY-MM-DD`).
- Searchable overview statistics, workload and progress summaries, and a focus timer
- Keyboard shortcuts and a command palette for common actions
- Browser notifications for reminders and tasks due today while the app is open
- Optional Google Calendar integration
- Folder-based JSON workspaces with legacy single-file JSON import and migration support

## Run locally

Beforework uses the File System Access API to open and save a workspace root and its child workspaces. Open it from a Chromium-based browser through `localhost` or HTTPS rather than using a `file://` URL.

If Python is installed:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> in Chrome or Edge and create a workspace folder, open an existing folder workspace, or connect an older single-file JSON workspace.

Local hosting starts with an empty workspace by default. To explore a sample workspace without building anything locally, visit the [Beforework demo](https://beforework-demo.netlify.app/).

For development, if you need to run the demo data locally, build and serve the generated site with demo mode enabled:

```powershell
$env:BEFOREWORK_MODE = "demo"
node scripts/build-site.js
python -m http.server 8000 --directory dist
```

The production build minifies JavaScript, CSS, and HTML in `dist`; source files remain readable and unchanged. On macOS or Linux, run the build with `BEFOREWORK_MODE=demo node scripts/build-site.js`, then serve `dist` with a static file server.

## Deploy

This is a static site. Netlify installs the build dependencies, runs `npm run build`, and publishes `dist`. The build minifies JavaScript, CSS, and HTML in the deploy output without changing source files. Set the site environment variable `BEFOREWORK_MODE` to `demo` to seed new workspaces with sample projects, calendar items, checkbox/URL/Email/Number/Multi-select fields, and a downloadable project-notes attachment. The default is `clean`, which starts with an empty workspace.

To host both versions, connect the same repository and branch to two Netlify sites. Leave `BEFOREWORK_MODE` unset (or set it to `clean`) for `beforework.netlify.app`, and set it to `demo` for `beforework-demo.netlify.app`. Changes to an existing workspace file are unaffected by this setting.

The source config defaults to `clean`. The build script writes the selected mode into `dist/js/config/site-config.js` without changing the source config.

For production use, serve the site over HTTPS. Users still retain their data locally or in a synced folder such as OneDrive or Google Drive; the application does not upload workspace data to a project server.

## Google Calendar

Google Calendar is optional. Configure the Google OAuth client ID used by the application, then connect calendars from the **Integrations** page. Calendar synchronisation requires the relevant Google Calendar API and OAuth consent configuration.

## Data format and upgrades

Workspace data is stored in JSON shards inside a folder. `manifest.json` stores workspace metadata and maps project IDs to separate project JSON files; calendar entries live in their own JSON shard. Each workspace carries a `schemaVersion` value. Projects can have an optional description and project-level milestones with optional due dates; tasks can be linked to milestones to track checkpoint progress. Existing single-file workspace JSON remains supported and can be opened or migrated into a folder workspace. List and Table column arrangements are saved per project and view.

Item attachments are stored as separate files under the workspace's `attachments/` directory, with multiple attachments supported per project or calendar item. Attachments require a folder workspace; they are not embedded in legacy single-file JSON. Browser recovery snapshots contain workspace JSON and attachment metadata, not the attachment file contents. The demo workspace includes a downloadable plain-text project-notes attachment. CSV exports contain the current filtered rows and visible columns; values are escaped for CSV and spreadsheet formula safety.

When an older or unversioned workspace is opened or imported, Beforework validates its structure and applies migrations in order until it reaches the current schema. Future schema versions and malformed project, group, or item data are rejected before they can replace the active workspace. Migrations add or reshape fields without deleting retired properties, which helps keep older data recoverable.

Beforework keeps up to eight rolling recovery snapshots, with a 64 MB total storage limit, in the browser's IndexedDB. It captures the previous workspace before a write at most once every 30 minutes, and creates additional snapshots before imports, restores, file conflicts, and workspace switches with unsaved changes. In **Settings > Storage & Data**, retained snapshots can be restored or exported. Pre-upgrade snapshots remain available separately.

Recovery snapshots are local to the current browser profile, do not sync with the workspace file, and may be removed if browser site data is cleared. Export a JSON copy or keep the workspace file in a synced folder for portable recovery. Before each save, Beforework compares the connected file with the revision it last read or wrote. If the file changed elsewhere, choose to load the external version (the tab's version is snapshotted) or overwrite it (both versions are snapshotted); canceling leaves the tab's changes in memory without overwriting the file. Settings shows save progress or failure and offers a retry.

Imports are validated and confirmed before replacing the active workspace. Before import or restore, the current in-memory workspace is snapshotted; if a snapshot cannot be saved, the replacement is blocked.

New schema changes should add a new migration step rather than changing an existing one, so files from every earlier version can continue to upgrade safely.

## Project structure

- `index.html` - application shell
- `js/app.js` - application behavior, rendering, column controls, and CSV export
- `js/services/storage/` - local workspace persistence and attachments
- `js/services/reminders/` - in-app reminder scheduling and notifications
- `js/ui/` - shared UI components and HTML template loading
- `js/config/` - build-generated runtime configuration
- `js/demo/` - demo workspace data and attachments
- `js/models/` and `js/views/` - overview details, settings, and milestone views
- `js/services/google-calendar/` - optional Google Calendar integration
- `js/commands/` - workspace-specific command definitions
- `js/core/` - workspace schema migrations and data-version compatibility
- `js/core/` - workspace validation and schema migrations
- `pages/` - HTML templates for application views and dialogs
- `styles/app.css` - application styles
- `images/` - icons and image assets
- `scripts/build-site.js` - static production build and minification
- `tests/` - Node.js regression tests

## Funding & Sponsorship
Beforework is a source-available, local-first project maintained to give people a private and portable way to manage projects, tasks, and calendars. If you find it useful, sponsorship helps support ongoing maintenance, browser compatibility, accessibility, documentation, and new privacy-focused features.

### Support Beforework

[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-Become%20a%20Sponsor-blueviolet?logo=githubsponsors&style=flat-square)](https://github.com/sponsors/shrestha-bishal)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20Developer-yellow?logo=buymeacoffee&style=flat-square)](https://www.buymeacoffee.com/shresthabishal)
[![Thanks.dev](https://img.shields.io/badge/Thanks.dev-Appreciate%20Open%20Source-29abe0?logo=github&style=flat-square)](https://thanks.dev/gh/shrestha-bishal)


## License

Beforework is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE).

The source is public and you're free to use, modify, and
distribute it for personal or noncommercial purposes. Commercial
use - including offering Beforework, or a modified or hosted
version of it, as a product or service - is not permitted
without a separate agreement with the Licensor.

Contributions and bug reports are welcome; see
[CONTRIBUTING.md](CONTRIBUTING.md).
