# Beforework

![Beforework logo](images/icon-wide.png)

Beforework is a private, local-first project management workspace for tasks, projects, calendars, and focus sessions. It runs as a static site and stores workspace data in a JSON file that you choose on your device.

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

## Project structure

- `index.html` - application shell
- `js/` - application logic, persistence, integrations, and view templates
- `pages/` - dashboard and settings page fragments
- `styles/app.css` - application styles
- `images/` - icons and image assets

## Licence

This project is available under the MIT License. See [LICENSE](LICENSE) for the full text.
