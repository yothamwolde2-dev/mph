# Changelog

## 0.1.3, 16 October 2026

* Reader: the document area is pinned to the full space, fixing the black screen in Safari.
* Reader: reading progress follows one scroll area, so the percentage no longer jumps.
* Works offline: the app opens with your saved login, every document downloads in the background after sign in, document progress is kept on the device and synced when the connection returns.

## 0.1.2, 16 October 2026

* Much faster: the app opens from the copy kept on the device and updates itself in the background.
* Documents download once and then open instantly from the device.
* Screen redraws are combined, the page fade plays only when you change page, and saving status no longer redraws the screen.
* Saving to the device happens in the background so taps never wait.

## 0.1.1, 16 October 2026

* New reader tools: resume where you left off, bookmarks with notes, highlights with notes, contents, search inside the document, text size, reading progress on every tile, focus mode.
* Uploading HTML now works in Safari on Mac and iPhone (the file picker is attached to the page).
* The upload dialog keeps what you typed when the app refreshes in the background.
* New collections must be named; uploads default to your first existing collection.
* Home shows how to install MPH as an app until it runs as one.
* Background sync no longer redraws the screen when nothing changed.

## 0.1.0 Foundation, 16 October 2026

* Private login, workspace saved to Supabase and kept on the device for offline use.
* Home with greeting, key figures, quick add and five customizable sections.
* Projects carried over from the Work Portfolio with unlimited levels, five statuses, automatic progress, notes, reminders, due dates, priority and the Brand identity template.
* Tasks, Week with goals and reflection.
* Learning and Library: upload HTML documents, organize into courses and collections, read them inside the app with progress saved per document.
* Undo and redo for every change, kept across reloads.
* Black and light themes, installable on iPhone and Mac.
