# Beforework

![Beforework logo](images/icon-wide.png)

Beforework is a serverless local-first project management workspace for projects, tasks, calendars, and focus sessions. Work across List, Table, Board, Calendar, Roadmap, Milestone, and Documents views, and add custom fields, comments, checklists, reminders, and multiple file attachments to items. The static app stores workspace data in folders you choose on your device rather than any server. Optional Google Calendar integration connects to Google separately.

<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/862e17a2-819a-4f01-8b42-610d091cc6b4" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/e2ee615f-49be-499d-a08a-98fdd8076060" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/548eceba-7651-40b1-9760-5b6829368b9b" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/0811863d-c0c7-4cdb-9530-14af50cbd777" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/8414df83-2e04-417b-b6e2-76c9665f54b4" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/311f354a-5253-4170-8d6d-3d831775bd0f" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/fefa80a7-62f9-4d66-8a29-d9309ad4508e" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/2050d222-c15d-4eab-b481-236ec00923b9" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/5e25a81f-7f90-4978-80fe-5e3196156ae2" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/deb28c9e-3e18-4157-8ca2-5fe2caa32d65" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/091a2221-76fb-4e50-a506-908d02dbad3c" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/6deedb91-95bc-4d05-83b5-a302ac569850" />
<img width="1906" height="956" alt="image" src="https://github.com/user-attachments/assets/cf2fe95b-7a07-4174-95d2-3c14f2ca4765" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/7277a77a-91dc-43eb-a0ac-b21013743a89" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/02e354ef-d1f5-4741-9940-e108506ce7a5" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/92be0e2f-1fbb-422b-abcb-8bdbaa4e4efe" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/94a3c656-8f80-411d-8584-56e3701005e8" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/427e3641-9aec-4584-b0a8-ebccd54e1364" />
<img width="1920" height="993" alt="image" src="https://github.com/user-attachments/assets/958a94e6-e1bc-497e-a856-55fd9f35e1a3" />


## Hosted version

If you do not want to host Beforework locally, use the hosted version at [beforework.netlify.app](https://beforework.netlify.app/).

Open it in Chrome or Edge, then choose a workspace root folder. Beforework creates each workspace as a separate child folder inside that root. Existing single-file JSON workspaces can still be opened and copied into the folder format.

Beforework is source-available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Personal and non-commercial use are permitted. Offering Beforework, or a modified or hosted version of it, as a product or service to third parties requires permission. Contributions and bug reports are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Projects and folders with project-owned tasks that can be organised into optional groups; pin frequently used projects to the top of the sidebar, and use workflow templates for starter groups
- Markdown-formatted task descriptions and comments with a live preview; existing text stays compatible and raw HTML is disabled
- Project Documents view for named Markdown briefs and notes, with in-app writing and preview, a starter project brief, and `.md` export
- List, table, board, calendar, roadmap, milestone, and Documents views with per-project view configuration
- Workspace and project roadmaps with task duration bars from optional start dates to task dates, plus milestone markers
- Start date, due date, custom date, and other fields for text, checkboxes, priority, single- and multi-selects, relations to other project items, URLs, email addresses, numbers, and optional Location and Schedule controls
- Optional Tags fields with colored tags, filters, bulk tagging, and tag pills across project views; remove the field to hide tags without deleting their data. Existing projects are migrated with Tags enabled to preserve their current behavior. Also includes subtasks, comments, activity history, archiving, recurring schedules, and reminders; add a Schedule field to show date/time, reminder, and recurrence controls on items
- Multiple file attachments per item in folder workspaces, plus project and calendar item attachments
- Drag-and-drop data-column ordering saved independently for List and Table views
- CSV export of the current filtered List or Table view, in visible column and row order
- CSV import with column mapping and preview into an existing or new project. It supports task titles, descriptions, due dates, priority, status/groups, and tags when the project has a Tags field; select the date format used by the CSV (`DD/MM/YYYY`, `MM/DD/YYYY`, or `YYYY-MM-DD`).
- Searchable overview statistics, workload and progress summaries, and a focus timer
- Hide individual projects and their activity from the Overview dashboard without removing them from the workspace
- Keyboard shortcuts, a command palette, and quick actions for common workspace tasks
- Browser notifications for reminders and tasks due today while the app is open
- Optional Google Calendar integration and dedicated Integrations / Support pages
- Folder-based JSON workspaces with automatic recovery snapshots, file conflict checks, import/restore validation, and legacy single-file JSON import and migration support

## Run locally

Beforework uses the File System Access API to open and save a workspace root and its child workspaces. Open it from a Chromium-based browser through `localhost` or HTTPS rather than using a `file://` URL.

Custom field types are registered from individual modules in `js/core/fields/types/`. Each module owns its catalog metadata and any type-specific filtering, value normalisation, sorting, and export behavior; add new modules to the field script list in `index.html`.

For local source development, install the dependencies and start the development server:

```bash
npm ci
npm run dev
```

The development server generates the local icon assets automatically and serves the source app at <http://localhost:8000/>. The generated icon files are ignored by Git.

Local hosting starts with an empty workspace by default. The hosted [Beforework demo](https://beforework-demo.netlify.app/) opens directly into sample data without asking for folder access. Demo edits are saved only in that browser; use **Reset demo** to restore the sample workspace or **Use your own workspace** to open the regular folder-backed app.

To test the generated production bundle, build it and start the preview server:

```powershell
$env:BEFOREWORK_MODE = "demo"
npm run build
npm run preview
```

The production preview serves the built `dist` directory at <http://localhost:8000/>; it does not rebuild the site, so run `npm run build` first. To preview the default clean workspace locally, omit the `BEFOREWORK_MODE` environment variable before building. The ordered imports in `js/manifest.js` are the application script manifest. `js/dev-loader.js` loads those files sequentially as classic scripts for local source development, preserving the shared declarations expected by the app. The production build combines the same ordered files into one minified `js/app.min.js`, and minifies CSS and HTML in `dist`; source files remain readable and unchanged. Lazy-loaded view modules remain separate.

## Deploy

This is a static site. Netlify installs the build dependencies, runs `npm run build`, and publishes `dist`. The build reads the JavaScript import manifest, bundles and minifies startup scripts, and minifies CSS and HTML in the deploy output without changing source files. Set the site environment variable `BEFOREWORK_MODE` to `demo` to open a browser-local sample workspace with Markdown documents across its projects, shared workspace guides, related items, custom fields, reminders, focus sessions, milestones, multiple project and calendar views, and downloadable attachments. The default is `clean`, which opens the folder-backed workspace setup flow.

Demo workspace data is stored in browser local storage, and demo attachments are stored in IndexedDB. Neither is uploaded to a server or connected to a user's folder workspace. The demo site provides **Reset demo** to restore its sample data. The regular site retains the local-first folder workspace flow.

To host both versions, connect the same repository and branch to two Netlify sites. Leave `BEFOREWORK_MODE` unset (or set it to `clean`) for `beforework.netlify.app`, and set it to `demo` for `beforework-demo.netlify.app`. Existing folder workspaces are unaffected by this setting.

The source config defaults to `clean`. The build script writes the selected mode into `dist/js/config/site-config.js` without changing the source config.

For production use, serve the site over HTTPS. Users still retain their data locally or in a synced folder such as OneDrive or Google Drive; the application does not upload workspace data to a project server.

## Google Calendar

Google Calendar is optional. Configure the Google OAuth client ID used by the application, then connect calendars from the **Integrations** page. Calendar synchronisation requires the Google Calendar API and OAuth consent configuration. The integration can also import tasks from all Google Tasks lists into the Calendar view; this is one-way (Google Tasks to Beforework), with a colored source-list badge. Enable the Google Tasks API and add the Google Tasks read-only OAuth scope to the consent configuration.

## Data format and upgrades

Workspace data is stored in JSON shards inside a folder. `manifest.json` stores workspace metadata and maps project IDs to separate project JSON files; calendar entries live in their own JSON shard. Each workspace carries a `schemaVersion` value. Projects can have an optional description, project-level milestones with optional due dates, and Markdown documents stored with the project; tasks can be linked to milestones to track checkpoint progress. Existing single-file workspace JSON remains supported and can be opened or migrated into a folder workspace. List and Table column arrangements are saved per project and view.

Item attachments are stored as separate files under the workspace's `attachments/` directory, with multiple attachments supported per project or calendar item. Attachments require a folder workspace; they are not embedded in legacy single-file JSON. Browser recovery snapshots contain workspace JSON and attachment metadata, not the attachment file contents. The demo workspace includes a downloadable plain-text project-notes attachment. CSV exports contain the current filtered rows and visible columns; values are escaped for CSV and spreadsheet formula safety.

Beforework also keeps up to eight rolling recovery snapshots in IndexedDB, with a 64 MB total storage limit. The app saves a pre-write snapshot at most once every 30 minutes and creates additional snapshots before imports, restores, file conflicts, and workspace switches with unsaved changes. In **Settings > Storage & Data**, retained snapshots can be restored or exported. Pre-upgrade snapshots remain available separately. This makes recovery and validation safer when upgrading older data or resolving file changes from another process.

When an older or unversioned workspace is opened or imported, Beforework validates its structure and applies migrations in order until it reaches the current schema. Future schema versions and malformed project, group, or item data are rejected before they can replace the active workspace. Migrations add or reshape fields without deleting retired properties, which helps keep older data recoverable.

Recovery snapshots are local to the current browser profile, do not sync with the workspace file, and may be removed if browser site data is cleared. Export a JSON copy or keep the workspace file in a synced folder for portable recovery. Before each save, Beforework compares the connected file with the revision it last read or wrote. If the file changed elsewhere, choose to load the external version (the tab's version is snapshotted) or overwrite it (both versions are snapshotted); canceling leaves the tab's changes in memory without overwriting the file. Settings shows save progress or failure and offers a retry.

Imports are validated and confirmed before replacing the active workspace. Before import or restore, the current in-memory workspace is snapshotted; if a snapshot cannot be saved, the replacement is blocked.

New schema changes should add a new migration step rather than changing an existing one, so files from every earlier version can continue to upgrade safely.

## Project structure

- `index.html` - application shell
- `js/app.js` - application behavior, rendering, column controls, and CSV export
- `js/services/storage/` - local workspace persistence and attachments
- `js/services/reminders/` - in-app reminder scheduling and notifications
- `js/ui/` - shared UI components, appearance preferences, and HTML template loading
- `js/vendor/` - locally bundled icon runtime and generated icon data
- `licenses/` - third-party license texts and notices; the app's PolyForm license remains in the repository root
- `js/features/` - cohesive application features, including recurrence rules
- `js/helpers/` - shared date/time and HTML escaping utilities
- `js/config/` - build-generated runtime configuration
- `js/demo/` - demo workspace data and attachments
- `js/models/` and `js/views/` - application models and view modules
- `js/services/google-calendar/` - optional Google Calendar integration
- `js/commands/` - workspace-specific command definitions
- `js/core/` - workspace validation, schema migrations, and data-version compatibility
- `pages/` - HTML templates for application views, dialogs, and features
- `styles/manifest.css` - stylesheet entry point, importing shared and feature-specific styles
- `images/` - icons and image assets
- `scripts/build-site.js` - static production build and minification
- `scripts/build-icon-data.js` - regenerate pinned local icon data and search index
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
