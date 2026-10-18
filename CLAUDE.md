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
* `css/app.css` all styling and design tokens (dark and light themes). Everything is inside `@layer app` so a web book's own styles always win inside the book; the few rules after the layer reach into books on purpose (ribbons, flash).
* `js/core.js` helpers: dates, ids, icons, project tree logic, statuses.
* `js/store.js` login, workspace state, undo and redo, saving, syncing, document files.
* `js/views.js` Home, Projects, Library uploads, Settings, the shell (menu) and login, as functions returning markup.
* `js/plan.js` the Plan page (month focus `mgoals[YYYY-MM]`, Big 3 `goals[week]`, tasks, days, review `review[week]`), the Home widgets Today, Calendar and Notes, task menus and drag and drop. Tasks: `{id, x, d (day or empty), wk (week key when planned for the week without a day), star, done, at, src (project item id)}`.
* `js/reader.js` the HTML reader: injects a small script into each document (storage and position bridge), bookmarks, highlights, contents, search, text size. Talks to the document only by postMessage.
* `js/content.js` unlocks private content (courses, books) with the key from `mph_keys`, caches it, and stores course and book progress through `mph_doc_state` (keys `lang:<id>`, `book:<id>`).
* `js/lang.js` Languages: course catalog, flashcards with spaced repetition (read, listen, recall, grammar), dialogs with device speech, listening drills, grammar, words.
* `js/book.js` the book reader for everything in the Library: contents, bookmarks (ribbons), resume to the paragraph, highlights, search. Two kinds of book: study books built from data (Corporate Management) and web books (see below). Also the Library shelf and the Home "Continue reading" list.
* `js/webrun.js` runs a web book: the document keeps its own design and interactive tools, inside one element MPH keeps alive. Its script runs in a sandbox (`with` scope): document queries stay inside the book, its storage is saved in the book progress (`ls`, synced), in-book links scroll the book, timers and key presses pause when the book is off screen.
* `tools/webbook.py` converts a self contained HTML document into a web book: scopes its CSS to `.wb-<id>`, hides its own navigation chrome, keeps its script, extracts section text for search.
* `content/*.bin` private content, locked with AES-256-GCM. `content/_sources.bin` is the locked source material.
* `tools/build_content.py` builds and locks content; `tools/unpack_sources.py` unlocks the sources.
* `js/app.js` routing, the action handlers (`A` for clicks, `C` for field changes), dialogs, menus and the reader.
* `js/supabase.js` the Supabase client library (v2.45.4), kept local.

## Rules for changes

* Every change to the workspace goes through `mutate(fn, key)` so it can be undone. Use `touch(fn)` only for things that should not be undoable (for example "last opened").
* Click actions use `data-act="name"` and live in `A`; field changes use `data-chg="name"` and live in `C`; Enter in a field uses `data-enter="name"`.
* New home widgets: add to `WIDGETS` in `store.js` and a renderer in `W` in `views.js`.
* New screens: add a view function, a route in `render()` and an entry in `NAV` (and `TABS` for the iPhone tab bar, five at most).
* Never use a minus sign or dash as an icon for delete; use `trash`.
* Bump `CONFIG.version`, every `?v=` query (index.html, the imports in js files, sw.js) and the cache name in `sw.js` on every release so devices pick up the new version. Add a line to `CHANGELOG.md`.

## Private content workflow (how Yotham's documents get into MPH)

Yotham does not upload documents in the app for courses and books. He sends them to Claude, and Claude integrates them:

1. Get the key: run SQL `select content_key from mph_keys` on Supabase project `ibudcfsqsxjgxmngwrhk`. Never write the key into the repository or any public file.
2. Unlock the existing sources: `MPH_KEY=<key> python3 tools/unpack_sources.py /tmp/mph-src`.
3. Add or convert the new material into that folder (study book data as JSON, language levels as the text formats used for HSK 3: words `h|p|pos|m|topic|ex|exp|exe`, dialogs and passages with `# 中文|English` headings and `?question|English|opt;opt;opt;opt|answer`, grammar `# title|pattern|meaning|how|mistake`).
4. Extend `build_content.py` if a new course or book is added (catalog entry in `index`), then run `MPH_KEY=<key> python3 tools/build_content.py /tmp/mph-src`. Bump the item's `v` when its content changes.
5. Commit only the `.bin` files and code. Never commit the unlocked sources.

Library documents (finished HTML documents with their own design, like the Coffee manual and the Dahua proposal): save the file into the sources folder as `<id>.html`, add a small function next to `coffee()` and `dahua()` in `build_content.py` (title, subtitle, the selector of its sections, how to read each section's title, and the selectors of the document's own navigation to hide), add it to `books` in the index with `kind: 'web'` and a `tone` for its cover (`green`, `coffee`, `light`), then build. Test it in Playwright on desktop and phone sizes: bookmarks, resume, contents, search, and its interactive tools.

Library courses in five levels (series): each subject is one file `sr_<id>.py` in the sources folder, written with the helpers in `sr_lib.py` (`ch()` for chapters, `g()` glossary, `case()`, `sim()`, `ex()`, `tpl()`). The file defines `SERIES` (title, tone, mark, scope, the five levels with `book` ids, `locked` and `unlock`) and one dict per open level, `L1`, `L2` and so on. `all_series()` in `build_content.py` finds the files and builds `book-<id>-<n>.bin` for every open level that has an `L<n>`. To open a new level: write `L<n>`, remove `locked` from that level, add its bin to `SHELL` in `sw.js`, build. Open now: International Business, Project Management, Finance, IT and AI, levels 1 and 2. Every level must go deeper than the one before, with case studies and exercises; level 5 is expert.

Progress sync: book and course progress is merged between devices (`mergeProg` in core.js): lists with ids are joined, removals are kept in `gone`, entries with a time (`at`, `seen`) keep the newest. Give anything new that is saved in progress an `id` and an `at` so it merges correctly.

Content is private: the repository is public, so anything unencrypted in it is public. Locked files are unreadable without the key, which only Yotham's login can read.

Languages: Chinese has HSK 2 and HSK 3 open, HSK 4 and HSK 5 locked (open them when Yotham finishes HSK 3 and sends material). German A1 open (A2, B1 locked), Afaan Oromo Level 1 open (Level 2 locked), both written as text files `de_a1_*.txt`, `om_l1_*.txt` and built by `textlevel()`. A language's `ui` in the index sets labels, voice and `noaudio` (Afaan Oromo has no device voice).

## Design rules (from Yotham, always apply)

* Mansen visual identity: Jet Black `#000000` dominant, Dark Green `#39B44A` as accent only, White, Dark Grey `#333333`, Light Grey `#E6E6E6`. Deep green `#1B6E27` for the gradient end and almost done.
* Headings: Power Grotesk when installed on the device, otherwise Montserrat 800 to 900, uppercase, tight tracking. Body: Montserrat.
* Never green text on black at small sizes. Green marks, points and highlights.
* No dashes used as decoration or punctuation in interface text, and no horizontal rules or divider lines for decoration. Separate with space and type instead.
* Premium, clean, uncluttered, generous negative space. Unique and consistent.
* Status colours are Yotham's own five: Next grey, In Progress blue, Revision red, Almost Done deep green, Done green.

## Roadmap

1. Foundation (0.1): Home, Projects, Tasks, Week, Learning, Library with HTML reader, Settings, undo and redo, sync. Done.
2. Planner: reminders with notifications on iPhone and Mac, recurring tasks, Trash with restore (still to do).
3. Reports (0.3): weekly and monthly report for the boss as a designed PDF, choose scope and add comments.
4. Learning (0.2, done): native Languages app (Chinese HSK 2 and 3) and native study book reader (Corporate Management Book 1), private locked content, offline.
5. Plan (0.4, done): Plan page with month, week and day cascade, Home calendar and notes, lighter Projects with priority badges and add to tasks.
6. Library (0.3, done): Library shelf with covers, Coffee manual and Dahua proposal as web books, bookmarks and resume synced and merged between Mac and iPhone, automatic updates.
7. Next for Learning: HSK 4 and 5 when unlocked, German A2, Afaan Oromo Level 2, the Financial Engineering roadmap (Linear Algebra and Python first, exercises for every video) and an interactive AI course.
9. Library series (0.6, done): five subjects in five levels, levels 1 and 2 written; levels 3 to 5 next.
8. Later: per item records in the database for live merging between devices, uploading the Power Grotesk font, search across everything.
