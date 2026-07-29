#!/usr/bin/env python3
"""
Pulls daily steps, resting heart rate, sleep, and recent activities from
Garmin Connect and upserts them into JSON files under /data.

Auth strategy:
  - Tries to resume a cached session from GARMIN_TOKENS_DIR (default
    ~/.garmin_tokens). This is where garminconnect stores its session
    tokens, and it's what lets scheduled CI runs avoid logging in with
    a password (and hitting an MFA prompt) every 6 hours.
  - Falls back to an interactive email/password (+ MFA) login the
    first time, then saves the session to GARMIN_TOKENS_DIR so
    subsequent runs can resume it.

Env vars:
  GARMIN_EMAIL        Garmin Connect account email (only needed for the
                       first interactive login)
  GARMIN_PASSWORD     Garmin Connect account password (same as above)
  GARMIN_TOKENS_DIR   Where to store/read the cached session
                       (default: ~/.garmin_tokens)

Usage:
  python sync_garmin.py                 # sync last 7 days + recent activities
  python sync_garmin.py --days 30       # backfill a longer window
"""

import argparse
import contextlib
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

DAILY_SUMMARY_FILE = DATA_DIR / "daily_summary.json"
SLEEP_FILE = DATA_DIR / "sleep.json"
ACTIVITIES_FILE = DATA_DIR / "activities.json"

MAX_ROUTE_POINTS = 100


def get_tokenstore() -> str:
    return os.getenv("GARMIN_TOKENS_DIR", str(Path.home() / ".garmin_tokens"))


def get_mfa() -> str:
    return input("MFA code: ").strip()


def login() -> Garmin:
    """Resume a cached session from tokenstore if possible, otherwise fall
    back to an interactive email/password (+ MFA) login.

    tokenstore (from GARMIN_TOKENS_DIR) can be either a directory path
    (local runs) or the raw token JSON itself (CI runs, via a secret) —
    garminconnect tells these apart by string length (>512 chars = raw
    JSON), which we mirror below to decide whether it's safe to treat as
    a filesystem path.

    Note: garminconnect's own login(tokenstore) only auto-persists tokens
    for the plain (non-MFA) credential path, and skips profile loading
    entirely when return_on_mfa short-circuits it. So we explicitly dump
    the session and make sure the profile got loaded after every login,
    regardless of which path was taken.
    """
    tokenstore = get_tokenstore()
    is_path = len(tokenstore) <= 512
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")

    garmin = Garmin(email=email, password=password, return_on_mfa=True)

    try:
        result1, result2 = garmin.login(tokenstore)
    except GarminConnectAuthenticationError:
        if not email or not password:
            print(
                "No usable cached session, and GARMIN_EMAIL / GARMIN_PASSWORD "
                "are not set for a fresh login.",
                file=sys.stderr,
            )
            sys.exit(1)
        raise

    if result1 == "needs_mfa":
        mfa_code = get_mfa()
        garmin.resume_login(result2, mfa_code)

    session_desc = "inline session (CI secret)"
    if is_path:
        tokenstore_path = str(Path(tokenstore).expanduser().resolve())
        with contextlib.suppress(Exception):
            garmin.client.dump(tokenstore_path)
        session_desc = f"cached to {tokenstore_path}"

    if garmin.display_name is None:
        garmin._load_profile_and_settings()

    print(f"Logged in as {garmin.display_name}, session {session_desc}")
    return garmin


def load_json_list(path: Path) -> list:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        os.replace(tmp_path, path)
    except BaseException:
        Path(tmp_path).unlink(missing_ok=True)
        raise


def upsert_by_key(existing: list, new_items: list, key: str) -> list:
    by_key = {item[key]: item for item in existing}
    for item in new_items:
        by_key[item[key]] = item
    return sorted(by_key.values(), key=lambda x: x[key])


def downsample(points: list, max_points: int) -> list:
    """Evenly stride down to at most max_points, always keeping the last point.

    Garmin's maxPolylineSize query param doesn't reliably cap the response
    (observed 273 points back from a request for 20), so we downsample
    ourselves rather than trust it.
    """
    if len(points) <= max_points:
        return points
    stride = len(points) / max_points
    indices = sorted({int(i * stride) for i in range(max_points)})
    if indices[-1] != len(points) - 1:
        indices.append(len(points) - 1)
    return [points[i] for i in indices]


def fetch_daily_summary(garmin: Garmin, day: date) -> dict | None:
    cdate = day.isoformat()
    try:
        stats = garmin.get_stats(cdate)
    except (GarminConnectConnectionError, GarminConnectTooManyRequestsError) as e:
        print(f"  skipping {cdate} (stats): {e}")
        return None
    if not stats:
        return None
    return {
        "date": cdate,
        "totalSteps": stats.get("totalSteps"),
        "dailyStepGoal": stats.get("dailyStepGoal"),
        "restingHeartRate": stats.get("restingHeartRate"),
        "minHeartRate": stats.get("minHeartRate"),
        "maxHeartRate": stats.get("maxHeartRate"),
        "totalDistanceMeters": stats.get("totalDistanceMeters"),
        "totalKilocalories": stats.get("totalKilocalories"),
        "activeKilocalories": stats.get("activeKilocalories"),
        "floorsAscended": stats.get("floorsAscended"),
        "moderateIntensityMinutes": stats.get("moderateIntensityMinutes"),
        "vigorousIntensityMinutes": stats.get("vigorousIntensityMinutes"),
    }


def fetch_sleep(garmin: Garmin, day: date) -> dict | None:
    cdate = day.isoformat()
    try:
        sleep = garmin.get_sleep_data(cdate)
    except (GarminConnectConnectionError, GarminConnectTooManyRequestsError) as e:
        print(f"  skipping {cdate} (sleep): {e}")
        return None
    dto = (sleep or {}).get("dailySleepDTO") or {}
    if not dto.get("sleepTimeSeconds"):
        return None
    scores = dto.get("sleepScores") or {}
    overall_score = (scores.get("overall") or {}).get("value")
    return {
        "date": cdate,
        "sleepTimeSeconds": dto.get("sleepTimeSeconds"),
        "deepSleepSeconds": dto.get("deepSleepSeconds"),
        "lightSleepSeconds": dto.get("lightSleepSeconds"),
        "remSleepSeconds": dto.get("remSleepSeconds"),
        "awakeSleepSeconds": dto.get("awakeSleepSeconds"),
        "sleepStartTimestampGMT": dto.get("sleepStartTimestampGMT"),
        "sleepEndTimestampGMT": dto.get("sleepEndTimestampGMT"),
        "overallSleepScore": overall_score,
    }


def fetch_activity_route(garmin: Garmin, activity_id) -> list | None:
    """Return a downsampled [[lat, lon], ...] route, or None if the activity
    has no GPS track (indoor activities, strength training, etc.)."""
    try:
        details = garmin.get_activity_details(str(activity_id))
    except (GarminConnectConnectionError, GarminConnectTooManyRequestsError) as e:
        print(f"  skipping route for {activity_id}: {e}")
        return None
    poly = (details or {}).get("geoPolylineDTO") or {}
    points = poly.get("polyline") or []
    if not points:
        return None
    points = downsample(points, MAX_ROUTE_POINTS)
    route = [
        [p["lat"], p["lon"]]
        for p in points
        if p.get("lat") is not None and p.get("lon") is not None
    ]
    return route or None


def fetch_activities(garmin: Garmin, limit: int, existing_routes: dict) -> list:
    try:
        activities = garmin.get_activities(0, limit)
    except (GarminConnectConnectionError, GarminConnectTooManyRequestsError) as e:
        print(f"  skipping activities: {e}")
        return []
    result = []
    for act in activities or []:
        activity_id = act.get("activityId")
        if activity_id is None:
            continue

        route = existing_routes.get(activity_id)
        if route is None:
            route = fetch_activity_route(garmin, activity_id)

        result.append(
            {
                "activityId": activity_id,
                "activityName": act.get("activityName"),
                "activityType": (act.get("activityType") or {}).get("typeKey"),
                "startTimeLocal": act.get("startTimeLocal"),
                "durationSeconds": act.get("duration"),
                "distanceMeters": act.get("distance"),
                "calories": act.get("calories"),
                "averageHR": act.get("averageHR"),
                "maxHR": act.get("maxHR"),
                "elevationGainMeters": act.get("elevationGain"),
                "averageSpeedMps": act.get("averageSpeed"),
                "route": route,
            }
        )
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="How many trailing days of daily summary / sleep to (re)sync (default: 7)",
    )
    parser.add_argument(
        "--activities-limit",
        type=int,
        default=20,
        help="How many most-recent activities to fetch each run (default: 20)",
    )
    args = parser.parse_args()

    garmin = login()

    today = date.today()
    days = [today - timedelta(days=i) for i in range(args.days)]

    print(f"Syncing daily summary + sleep for {len(days)} day(s)...")
    new_daily = []
    new_sleep = []
    for day in days:
        summary = fetch_daily_summary(garmin, day)
        if summary:
            new_daily.append(summary)
        sleep = fetch_sleep(garmin, day)
        if sleep:
            new_sleep.append(sleep)

    print(f"Syncing last {args.activities_limit} activities...")
    existing_activities = load_json_list(ACTIVITIES_FILE)
    existing_routes = {
        a["activityId"]: a["route"]
        for a in existing_activities
        if a.get("route") is not None
    }
    new_activities = fetch_activities(garmin, args.activities_limit, existing_routes)

    daily_summary = upsert_by_key(load_json_list(DAILY_SUMMARY_FILE), new_daily, "date")
    sleep_data = upsert_by_key(load_json_list(SLEEP_FILE), new_sleep, "date")
    activities = upsert_by_key(existing_activities, new_activities, "activityId")
    activities.sort(key=lambda a: a.get("startTimeLocal") or "", reverse=True)

    atomic_write_json(DAILY_SUMMARY_FILE, daily_summary)
    atomic_write_json(SLEEP_FILE, sleep_data)
    atomic_write_json(ACTIVITIES_FILE, activities)

    print(
        f"Wrote {len(daily_summary)} daily summary rows, "
        f"{len(sleep_data)} sleep rows, {len(activities)} activities."
    )


if __name__ == "__main__":
    main()
