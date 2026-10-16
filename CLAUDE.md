# MPH, My Personal Hub

Read this before changing anything. It is the brief for every upgrade.

## What MPH is

A personal app for Yotham, used on an M1 Mac and an iPhone. It brings projects, tasks, weekly goals, learning and an HTML document reader into one place. It is installed from the browser as a home screen app (no App Store, no build step). Running cost must stay at zero.

## How it is built

* Plain HTML, CSS and JavaScript modules. No framework and no build step, so any file can be edited and pushed directly.
* Hosting: GitHub Pages from the `main` branch root.
* Data: Supabase project `ibudcfsqsxjgxmngwrhk` (free tier), login by email and password.
  * `mph_state`: one row per person, `data` holds the whole workspace as JSON, `rev` is a revision number used so two devices never silently overwrite each other.
  * `mph_doc_state`: saved progress for each uploaded HTML document (`doc_id`, `data`).
  * Storage bucket `mph-files` (private): uploaded HTML files at `<user id>/<doc id>.html`.
  * Row level security on all of it: each person reads and writes only their own rows and folder.
  * The old Work Portfolio table `portfolio` is read only from MPH (Settings, Data, Import).

## Files

* `index.html` app entry, `manifest.webmanifest` and `sw.js` make it installable and open offline.
* `css/app.css` all styling and design tokens (dark and light themes).
* `js/core.js` helpers: dates, ids, icons, project tree logic, statuses.
* `js/store.js` login, workspace state, undo and redo, saving, syncing, document files.
* `js/views.js` every screen as a function returning markup.
* `js/reader.js` the HTML reader: injects a small script into each document (storage and position bridge), bookmarks, highlights, contents, search, text size. Talks to the document only by postMessage.
* `js/app.js` routing, the action handlers (`A` for clicks, `C` for field changes), dialogs, menus and the reader.
* `js/supabase.js` the Supabase client library (v2.45.4), kept local.

## Rules for changes

* Every change to the workspace goes through `mutate(fn, key)` so it can be undone. Use `touch(fn)` only for things that should not be undoable (for example "last opened").
* Click actions use `data-act="name"` and live in `A`; field changes use `data-chg="name"` and live in `C`; Enter in a field uses `data-enter="name"`.
* New home widgets: add to `WIDGETS` in `store.js` and a renderer in `W` in `views.js`.
* New screens: add a view function, a route in `render()` and an entry in `NAV`.
* Bump `CONFIG.version`, every `?v=` query (index.html, the imports in js files, sw.js) and the cache name in `sw.js` on every release so devices pick up the new version. Add a line to `CHANGELOG.md`.

## Design rules (from Yotham, always apply)

* Mansen visual identity: Jet Black `#000000` dominant, Dark Green `#39B44A` as accent only, White, Dark Grey `#333333`, Light Grey `#E6E6E6`. Deep green `#1B6E27` for the gradient end and almost done.
* Headings: Power Grotesk when installed on the device, otherwise Montserrat 800 to 900, uppercase, tight tracking. Body: Montserrat.
* Never green text on black at small sizes. Green marks, points and highlights.
* No dashes used as decoration or punctuation in interface text, and no horizontal rules or divider lines for decoration. Separate with space and type instead.
* Premium, clean, uncluttered, generous negative space. Unique and consistent.
* Status colours are Yotham's own five: Next grey, In Progress blue, Revision red, Almost Done deep green, Done green.

## Roadmap

1. Foundation (0.1): Home, Projects, Tasks, Week, Learning, Library with HTML reader, Settings, undo and redo, sync. Done.
2. Planner (0.2): calendar month and week views, reminders with notifications on iPhone and Mac, recurring tasks, Trash with restore.
3. Reports (0.3): weekly and monthly report for the boss as a designed PDF, choose scope and add comments.
4. Learning (0.4): course pages for Chinese, German, Afaan Oromo, International Business, AI and Prompting, with progress per course.
5. Later: per item records in the database for live merging between devices, uploading the Power Grotesk font, search across everything.
