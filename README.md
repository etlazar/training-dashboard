# Training Dashboard

A personal Garmin health dashboard: a Python script syncs Garmin Connect
data into JSON files, GitHub Actions keeps that data fresh on a schedule,
and a React (Vite + Recharts) frontend renders it, hosted on GitHub Pages.

## Status

- [x] Repo structure
- [x] Python sync script (`sync/sync_garmin.py`) — confirmed against real data
- [x] Scheduled GitHub Actions sync workflow (`.github/workflows/sync.yml`)
- [x] React/Recharts dashboard frontend (`frontend/`) — built and smoke-tested
- [x] GitHub Pages deployment (`.github/workflows/deploy.yml`)
- [x] Strava-style redesign + route maps
- [ ] Training plan (race-goal plans, mileage progression, push to Garmin)
- [ ] Nutrition tracking + race nutrition plans

## 1. Run the sync script locally

```bash
cd sync
python -m venv .venv
.venv\Scripts\activate        # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your Garmin Connect credentials:

```
GARMIN_EMAIL=you@example.com
GARMIN_PASSWORD=your-garmin-password
```

Then run:

```bash
python sync_garmin.py
```

The first run logs in with your email/password (and will prompt for an
MFA code if your account has it enabled), then caches the session under
`~/.garmin_tokens` so subsequent runs don't need your password again.
It writes/updates:

- `data/daily_summary.json` — steps, resting HR, calories, etc. per day
- `data/sleep.json` — sleep stage breakdown per night
- `data/activities.json` — your most recent activities

By default it (re)syncs the last 7 days (to catch late-arriving Garmin
corrections) and the last 20 activities. Use `--days 30` to backfill more
history the first time.

**Confirm the JSON files look right before moving on** — check that the
field values match what you see in Garmin Connect, since Garmin's API
responses can vary slightly by account/device.

## 2. Scheduled sync (GitHub Actions)

`.github/workflows/sync.yml` runs the sync script every 2 hours (and on
manual `workflow_dispatch`), then commits/pushes any changed files under
`data/` back to the repo using
[git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action)
(no-op if nothing changed).

Since Garmin's login can require an MFA code, the workflow authenticates
with a **cached session** instead of your password, so it never needs to
do an interactive login. Set it up once:

1. Push this repo to GitHub (if you haven't already).
2. Get the contents of your locally cached session file:
   ```bash
   cat ~/.garmin_tokens/garmin_tokens.json
   ```
   (On Windows: `type %USERPROFILE%\.garmin_tokens\garmin_tokens.json`)
3. Create a repo secret named `GARMIN_TOKENS_JSON` with that exact JSON
   as the value:
   ```bash
   gh secret set GARMIN_TOKENS_JSON < ~/.garmin_tokens/garmin_tokens.json
   ```
   Treat this like a password — anyone with it can read your Garmin
   account data. Don't paste it anywhere else, and never commit it to
   the repo.
4. (Optional) Also set `GARMIN_EMAIL` / `GARMIN_PASSWORD` secrets as a
   fallback for if the cached session ever expires. If you skip this,
   the workflow just fails clearly when the session needs refreshing —
   at which point you repeat step 2-3 with a fresh local run.

Then trigger the workflow manually once from the Actions tab (or
`gh workflow run sync.yml`) to confirm it runs end-to-end before waiting
for the schedule.

## 3. Frontend dashboard

`frontend/` is a Vite + React app using [Recharts](https://recharts.org/) and
[react-leaflet](https://react-leaflet.js.org/) (OpenStreetMap tiles, no API
key needed):

- Weekly stat tiles (distance/time/elevation/activity count, with a delta
  vs. the prior week)
- Line chart of daily steps
- Line chart of resting heart rate
- Stacked bar chart of sleep stages (deep/light/REM/awake)
- Strava-style activity feed: a route map per activity (when GPS data
  exists) plus distance/duration/pace-or-speed/avg HR/elevation

The color palette is led by Strava's accent orange (`#FC4C02`), validated
for colorblind-safety and contrast with the dataviz skill's
`validate_palette.js`. Route GPS polylines are synced by
`sync/sync_garmin.py` (downsampled to ~100 points per activity, cached on
`data/activities.json` so they're only fetched once per activity, never
re-fetched on later runs).

It fetches `data/*.json` at runtime (not bundled at build time), so the
same build always reflects whatever is currently in `/data`. A
`predev`/`prebuild` npm hook (`frontend/scripts/copy-data.mjs`) copies
the repo's `/data` folder into `frontend/public/data` automatically —
you never need to do this by hand.

Run it locally:

```bash
cd frontend
npm install
npm run dev
```

`npm run build` produces `frontend/dist`, ready to be served as static
files. The Vite `base` in `frontend/vite.config.js` is set to
`/training-dashboard/` to match the GitHub Pages URL below — update it
if you rename the repo.

## 4. GitHub Pages deployment

`.github/workflows/deploy.yml` builds the frontend and deploys
`frontend/dist` to GitHub Pages on every push to `main` (including the
automatic commits from the sync workflow), using GitHub's native Pages
Actions (no extra secrets needed).

One-time setup after pushing to GitHub:

1. Go to the repo's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or run `gh workflow run deploy.yml`) and check the
   **Actions** tab for the run. Once it succeeds, the dashboard is live
   at `https://<your-username>.github.io/training-dashboard/`.

Since the sync workflow commits data updates to `main` every 2 hours,
each of those commits will also trigger a redeploy — the dashboard
stays current automatically.

## Planned next: training plan + nutrition

Two bigger features are planned but not yet built:

- **Training plan**: race-goal periodized plans, weekly-mileage progression,
  and general-fitness templates, pushed to Garmin Connect via
  `garminconnect`'s typed workout builders (confirmed working —
  `upload_running_workout`/etc. + `schedule_workout(id, date)` puts a
  workout on your Garmin Connect calendar for automatic sync to the watch).
  The actual plan-generation logic will be based on training-methodology
  books to be provided.
- **Nutrition tracking**: daily logging + race nutrition plans.

Both need a small serverless backend (recommended: Cloudflare Workers + D1)
since — unlike the read-only Garmin data above — this is user-entered data
that needs frequent writes a static GitHub Pages site can't accept. That
backend's design is a separate planning pass once the above specifics are
settled.
