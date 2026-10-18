# MPH recovery guide

How to get everything back if this chat, the website, a device or the database is lost. Nothing secret is written here: this repository is public.

## Where everything lives

| What | Where | Lost if |
|---|---|---|
| The app (code, design, locked books and courses) | GitHub, `yothamwolde2-dev/mph`, branch `main` | the GitHub account is deleted |
| The website | GitHub Pages, https://yothamwolde2-dev.github.io/mph/ | GitHub Pages is switched off |
| Your data: projects, tasks, plan, notes, reading and course progress | Supabase project `ibudcfsqsxjgxmngwrhk`, tables `mph_state` and `mph_doc_state` | the Supabase project is deleted |
| Daily copies of your workspace, 30 days | Supabase, `mph_doc_state` rows `snap:YYYY-MM-DD` | the Supabase project is deleted |
| Uploaded HTML documents | Supabase Storage, private bucket `mph-files` | the Supabase project is deleted |
| The content key that unlocks every book and course | Supabase, table `mph_keys` | the Supabase project is deleted and you kept no copy |
| Offline copy of the app | `MPH-standalone.html`, wherever you saved it | you delete it |
| Your own backups | `mph-backup-<date>.json` files from Settings | you delete them |

## Is Supabase backing up my data?

Supabase holds the live copy. Every change you make is saved there within about a second, from the Mac and the iPhone, and both devices merge their changes. That protects you against losing a device.

It is not a backup on its own: if something wrong is saved, the live copy is wrong too. The free plan has no automatic database backups. So MPH keeps its own:

1. Undo and redo for every change while you work.
2. A daily copy of the workspace inside the database, for 30 days. Settings, Data, Earlier versions. Bringing one back can be undone.
3. Your export files: Settings, Data, Backup, Export. Do this once a week and keep the file in iCloud Drive or Google Drive, next to `MPH-standalone.html`.

One more thing to know: a free Supabase project pauses after 7 days without use. MPH is used daily so this is unlikely; if it happens, open supabase.com, sign in, open the project and press Restore. Nothing is lost.

## Keep the content key safe (do this once)

Books and courses are locked so the public repository reveals nothing. The key that unlocks them is stored in your database and read only by your login. If the database were ever lost, the key would be lost with it, and the locked files could not be opened again.

Save a copy now: supabase.com, project `ibudcfsqsxjgxmngwrhk`, SQL Editor, run `select content_key from mph_keys;` and store the value in your password manager (iCloud Keychain Passwords or similar) as "MPH content key". Never put it in a file in the repository, an email or a chat you share.

## What to do when

**This chat is gone.** Nothing is lost. Start a new Claude session with the GitHub repository `yothamwolde2-dev/mph` and the Supabase connector, and say: "Continue MPH. Read CLAUDE.md first." `CLAUDE.md` is the full brief: how the app is built, the rules, the design rules, the content workflow and the roadmap. Claude reads the content key from Supabase itself.

**The website does not open.** Open `MPH-standalone.html` (double click on the Mac; on the iPhone open it from the Files app). Sign in as usual: your data comes from Supabase as always. Download a fresh copy from Settings, Data, Offline copy of MPH after each update.

**A change went wrong.** Undo (Cmd Z, or the arrow at the top). For older mistakes: Settings, Data, Earlier versions, choose a day. Or Settings, Data, Restore with an export file.

**The Supabase project is lost.** Create a new free project, run the SQL below in its SQL Editor, put the new project URL and publishable key into `CONFIG` in `js/store.js`, push, sign up with the same email, then Settings, Data, Restore with your latest export file. Put your saved content key into the new `mph_keys` table: `insert into mph_keys (user_id, content_key) values ('<your new user id>', '<the key>');`.

```sql
create table mph_state (user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade, data jsonb not null default '{}'::jsonb, rev integer not null default 1, updated_at timestamptz not null default now());
create table mph_doc_state (user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, doc_id text not null, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key (user_id, doc_id));
create table mph_keys (user_id uuid primary key references auth.users(id) on delete cascade, content_key text not null, created_at timestamptz not null default now());
alter table mph_state enable row level security;
alter table mph_doc_state enable row level security;
alter table mph_keys enable row level security;
create policy "mph_state own select" on mph_state for select using (auth.uid() = user_id);
create policy "mph_state own insert" on mph_state for insert with check (auth.uid() = user_id);
create policy "mph_state own update" on mph_state for update using (auth.uid() = user_id);
create policy "mph_state own delete" on mph_state for delete using (auth.uid() = user_id);
create policy "mph_doc_state own select" on mph_doc_state for select using (auth.uid() = user_id);
create policy "mph_doc_state own insert" on mph_doc_state for insert with check (auth.uid() = user_id);
create policy "mph_doc_state own update" on mph_doc_state for update using (auth.uid() = user_id);
create policy "mph_doc_state own delete" on mph_doc_state for delete using (auth.uid() = user_id);
create policy "mph_keys own select" on mph_keys for select using (auth.uid() = user_id);
insert into storage.buckets (id, name, public) values ('mph-files', 'mph-files', false);
create policy "mph files own" on storage.objects for all using (bucket_id = 'mph-files' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'mph-files' and (storage.foldername(name))[1] = auth.uid()::text);
```

**GitHub is lost.** The offline copy still runs everything. Any copy of the repository (a download of the ZIP from GitHub, kept with your backups) can be pushed to a new repository and published with GitHub Pages again.
