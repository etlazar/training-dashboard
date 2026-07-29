#!/usr/bin/env python3
"""
Generates training-plan workouts for draft plans stored in the Cloudflare
Worker backend, and posts the generated workouts back.

Methodology synthesis (see the Phase 2 plan for full detail — not
reproduced from any of the source books verbatim):

  - Running pace zones use the published Daniels-Gilbert oxygen-cost/
    velocity and %VO2max-vs-duration regression equations (Daniels &
    Gilbert, "Oxygen Power," 1979) to compute VDOT from a recent race
    result, then derive Easy/Marathon/Threshold/Interval/Repetition paces
    as fixed fractions of VDOT (ZONE_PCT_VDOT below) — an original,
    reasonable approximation for this project, not the book's own table.
  - Phase structure (Base -> Build -> Peak -> Taper -> Race), the
    A/B/C-priority -> taper-length mapping, and the "hold volume ~3 weeks
    then step up, with a cutback week every 3rd-4th week" progression rule
    all converge across Daniels, Pfitzinger & Latter, and Friel.
  - Workout-type emphasis (short races lean interval/repetition, long
    races lean tempo/progression-long-runs) follows Pfitzinger's
    distance-based guidance.

Triathlon is not yet implemented in this pass (running only) — plans with
sport_scope='triathlon' are skipped with a log message.

Env vars:
  PLAN_API_BASE     Worker base URL (default: http://localhost:8787)
  PLAN_API_SECRET   Bearer token for write endpoints
"""

import math
import os
import sys
from datetime import date, timedelta

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

API_BASE = os.getenv("PLAN_API_BASE", "http://localhost:8787")
API_SECRET = os.getenv("PLAN_API_SECRET", "")

SHORT_RACES = {"run_5k", "run_10k"}
LONG_RACES = {"run_15k", "run_10mile", "run_half", "run_marathon"}
TAPER_DAYS = {"A": 14, "B": 7, "C": 4}

# Fraction of VDOT each training zone targets. Original approximation for
# this project (see module docstring) -- not the book's exact table.
ZONE_PCT_VDOT = {"E": 0.70, "M": 0.82, "T": 0.88, "I": 0.98, "R": 1.05}


def _auth_headers():
    return {"Authorization": f"Bearer {API_SECRET}"}


def api_get(path, params=None):
    r = requests.get(f"{API_BASE}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def api_post(path, body):
    r = requests.post(f"{API_BASE}{path}", json=body, headers=_auth_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def api_patch(path, body):
    r = requests.patch(f"{API_BASE}{path}", json=body, headers=_auth_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------------------
# VDOT / pace zones
# ---------------------------------------------------------------------------


def compute_vdot(distance_m: float, time_s: float) -> float:
    velocity = distance_m / (time_s / 60)  # m/min
    t = time_s / 60  # minutes
    vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity**2
    pct_max = 0.8 + 0.1894393 * math.exp(-0.012778 * t) + 0.2989558 * math.exp(-0.1932605 * t)
    return vo2 / pct_max


def _velocity_for_vo2(vo2: float) -> float:
    """Invert the oxygen-cost/velocity equation: solve for m/min given a target VO2."""
    a, b, c = 0.000104, 0.182258, -(4.60 + vo2)
    return (-b + math.sqrt(b**2 - 4 * a * c)) / (2 * a)


def vdot_paces_mps(vdot: float) -> dict:
    """Returns {zone: pace in meters/second} for E/M/T/I/R."""
    paces = {}
    for zone, pct in ZONE_PCT_VDOT.items():
        target_vo2 = vdot * pct
        velocity_m_per_min = _velocity_for_vo2(target_vo2)
        paces[zone] = velocity_m_per_min / 60
    return paces


# ---------------------------------------------------------------------------
# Phase structure
# ---------------------------------------------------------------------------


def compute_phases(start_date: date, race_date: date, priority: str) -> list:
    total_days = (race_date - start_date).days
    taper_days = min(TAPER_DAYS.get(priority, 14), max(total_days - 14, 4))
    remaining = total_days - taper_days

    if remaining < 14:
        base_days = 0
        build_days = max(remaining - 7, 0)
        peak_days = remaining - build_days
    else:
        base_days = round(remaining * 0.45)
        build_days = round(remaining * 0.35)
        peak_days = remaining - base_days - build_days

    phases = []
    cursor = start_date
    for name, length in [
        ("base", base_days),
        ("build", build_days),
        ("peak", peak_days),
        ("taper", taper_days),
    ]:
        if length <= 0:
            continue
        phase_start = cursor
        phase_end = cursor + timedelta(days=length - 1)
        phases.append({"name": name, "start": phase_start, "end": phase_end})
        cursor = phase_end + timedelta(days=1)
    phases.append({"name": "race", "start": race_date, "end": race_date})
    return phases


# ---------------------------------------------------------------------------
# Weekly volume progression
# ---------------------------------------------------------------------------


def weekly_volume_progression(num_weeks: int, start_km: float) -> list:
    """Hold volume for ~3 weeks, step up ~10%, cutback every 4th week."""
    volumes = []
    base = max(start_km, 5.0)
    for week_idx in range(num_weeks):
        pos = week_idx % 4
        if pos == 0 and week_idx > 0:
            base *= 1.10
        volumes.append(base * 0.75 if pos == 3 else base)
    return volumes


# ---------------------------------------------------------------------------
# Workout step builders (Garmin-shaped: warmup/cooldown/steady/interval/
# recovery/repeat, duration- or distance-based, optional pace range)
# ---------------------------------------------------------------------------


def _pace_range(mps, spread=0.03):
    if mps is None:
        return None, None
    return round(mps * (1 - spread), 3), round(mps * (1 + spread), 3)


def step_steady(duration_s=None, distance_m=None, pace_mps=None, spread=0.04):
    low, high = _pace_range(pace_mps, spread)
    return {
        "kind": "steady",
        "duration_s": duration_s,
        "distance_m": distance_m,
        "pace_low_mps": low,
        "pace_high_mps": high,
    }


def step_warmup(duration_s, pace_mps):
    low, high = _pace_range(pace_mps, spread=0.06)
    return {"kind": "warmup", "duration_s": duration_s, "pace_low_mps": low, "pace_high_mps": high}


def step_cooldown(duration_s, pace_mps):
    low, high = _pace_range(pace_mps, spread=0.06)
    return {"kind": "cooldown", "duration_s": duration_s, "pace_low_mps": low, "pace_high_mps": high}


def step_interval(duration_s=None, distance_m=None, pace_mps=None):
    low, high = _pace_range(pace_mps, spread=0.02)
    return {
        "kind": "interval",
        "duration_s": duration_s,
        "distance_m": distance_m,
        "pace_low_mps": low,
        "pace_high_mps": high,
    }


def step_recovery(duration_s, pace_mps):
    low, high = _pace_range(pace_mps, spread=0.10)
    return {"kind": "recovery", "duration_s": duration_s, "pace_low_mps": low, "pace_high_mps": high}


def step_repeat(iterations, steps):
    return {"kind": "repeat", "iterations": iterations, "steps": steps}


def build_easy(duration_s, paces):
    return [step_steady(duration_s=duration_s, pace_mps=paces["E"])]


def build_long(duration_s, paces, progression=False):
    if not progression:
        return [step_steady(duration_s=duration_s, pace_mps=paces["E"])]
    easy_part = duration_s * 0.75
    quick_part = duration_s * 0.25
    return [
        step_steady(duration_s=easy_part, pace_mps=paces["E"]),
        step_steady(duration_s=quick_part, pace_mps=paces["M"]),
    ]


def build_tempo(paces, tempo_minutes=20):
    return [
        step_warmup(600, paces["E"]),
        step_steady(duration_s=tempo_minutes * 60, pace_mps=paces["T"]),
        step_cooldown(600, paces["E"]),
    ]


def build_interval(paces, reps, work_s, recovery_s):
    return [
        step_warmup(900, paces["E"]),
        step_repeat(
            reps,
            [step_interval(duration_s=work_s, pace_mps=paces["I"]), step_recovery(duration_s=recovery_s, pace_mps=paces["E"])],
        ),
        step_cooldown(600, paces["E"]),
    ]


def build_repetition(paces, reps=8, work_s=60, recovery_s=120):
    return [
        step_warmup(900, paces["E"]),
        step_repeat(
            reps,
            [step_interval(duration_s=work_s, pace_mps=paces["R"]), step_recovery(duration_s=recovery_s, pace_mps=paces["E"])],
        ),
        step_cooldown(600, paces["E"]),
    ]


def _build_workout(workout_type, paces, long_run_km, easy_km, race_type, progression_long_run):
    if workout_type == "rest":
        return [], "Rest day"
    if workout_type == "easy":
        duration_s = easy_km * 1000 / paces["E"]
        return build_easy(duration_s, paces), f"{easy_km:.1f} km easy"
    if workout_type == "long":
        duration_s = long_run_km * 1000 / paces["E"]
        structure = build_long(duration_s, paces, progression=progression_long_run)
        label = "progression long run" if progression_long_run else "long run"
        return structure, f"{long_run_km:.1f} km {label}"
    if workout_type == "tempo":
        return build_tempo(paces), "Warm-up + 20 min @ threshold pace + cool-down"
    if workout_type == "interval":
        if race_type in SHORT_RACES:
            reps, work_s, recovery_s = 6, 180, 120
        else:
            reps, work_s, recovery_s = 5, 300, 180
        return build_interval(paces, reps, work_s, recovery_s), f"{reps} x {work_s // 60} min @ interval pace"
    if workout_type == "repetition":
        return build_repetition(paces), "8 x 60s @ repetition pace w/ jog recovery"
    return [], "Rest day"


def week_template(phase_name, race_type):
    """[(weekday 0=Mon..6=Sun, workout_type), ...] for one 7-day week."""
    if phase_name == "base":
        return [(0, "rest"), (1, "easy"), (2, "easy"), (3, "easy"), (4, "easy"), (5, "easy"), (6, "long")]
    if phase_name == "build":
        if race_type in SHORT_RACES:
            return [(0, "rest"), (1, "interval"), (2, "easy"), (3, "repetition"), (4, "easy"), (5, "easy"), (6, "long")]
        return [(0, "rest"), (1, "tempo"), (2, "easy"), (3, "interval"), (4, "easy"), (5, "easy"), (6, "long")]
    if phase_name == "peak":
        if race_type in SHORT_RACES:
            return [(0, "rest"), (1, "interval"), (2, "easy"), (3, "easy"), (4, "repetition"), (5, "easy"), (6, "long")]
        return [(0, "rest"), (1, "tempo"), (2, "easy"), (3, "easy"), (4, "interval"), (5, "easy"), (6, "long")]
    if phase_name == "taper":
        return [(0, "rest"), (1, "easy"), (2, "tempo"), (3, "easy"), (4, "rest"), (5, "easy"), (6, "easy")]
    return [(i, "rest") for i in range(7)]


# ---------------------------------------------------------------------------
# Triathlon: FTHR/FTPa/FTPo zones + multi-sport week templates
# ---------------------------------------------------------------------------

# Original 5-zone percentage-of-threshold scheme for this project --
# deliberately not Friel's specific 7-zone (1/2/3/4/5a/5b/5c) breakdown,
# since his exact cutoffs are a table graphic in the book, not extracted.
# The underlying *protocol* (20-min test minus 5% for bike/run threshold,
# 1000m time-trial pace for swim) is standard across the endurance-
# coaching industry, not exclusive to any one book.
TRI_ZONE_PCT = {"recovery": 0.65, "aerobic": 0.78, "tempo": 0.90, "threshold": 1.00, "vo2max": 1.12}

TRI_RACE_TYPES = {"tri_sprint", "tri_olympic", "tri_70_3", "tri_full"}
TRI_SHORT = {"tri_sprint", "tri_olympic"}


def compute_bike_threshold(avg_power=None, avg_speed_mps=None):
    """Returns ("power", watts) or ("speed", m/s) -- 20-min-test-minus-5%."""
    if avg_power:
        return ("power", avg_power * 0.95)
    return ("speed", (avg_speed_mps or 8.0) * 0.95)


def compute_run_threshold_tri(avg_pace_mps):
    return (avg_pace_mps or 3.0) * 0.95


def compute_swim_threshold(pace_mps):
    """pace_mps is the plan's swim_test_pace_mps column -- 1000m/time_s,
    computed by the intake form before it's stored (see schema)."""
    return pace_mps if pace_mps else (1000.0 / 1200.0)  # default: 20 min / 1000m


def weekly_sport_hours(total_hours, weak_sport=None):
    """Default ~10% swim / 50% bike / 40% run, shifted ~10% toward the
    weakest sport if given (Friel's baseline split, generalized)."""
    split = {"swim": 0.10, "bike": 0.50, "run": 0.40}
    if weak_sport in split:
        boost = 0.10
        split[weak_sport] += boost
        for s in split:
            if s != weak_sport:
                split[s] -= boost / (len(split) - 1)
    return {sport: total_hours * pct for sport, pct in split.items()}


def _bike_step(duration_s, threshold, zone, kind="steady", spread=0.05):
    metric_kind, value = threshold
    target = value * TRI_ZONE_PCT[zone]
    low, high = target * (1 - spread), target * (1 + spread)
    step = {"kind": kind, "duration_s": duration_s, "distance_m": None}
    if metric_kind == "power":
        step["power_low_w"] = round(low, 1)
        step["power_high_w"] = round(high, 1)
        step["pace_low_mps"] = None
        step["pace_high_mps"] = None
    else:
        step["pace_low_mps"] = round(low, 3)
        step["pace_high_mps"] = round(high, 3)
    return step


def build_swim_steady(duration_s, threshold_pace_mps, zone="aerobic"):
    return [step_steady(duration_s=duration_s, pace_mps=threshold_pace_mps * TRI_ZONE_PCT[zone])]


def build_run_steady_tri(duration_s, threshold_pace_mps, zone="aerobic"):
    return [step_steady(duration_s=duration_s, pace_mps=threshold_pace_mps * TRI_ZONE_PCT[zone])]


def build_bike_steady(duration_s, threshold, zone="aerobic"):
    return [_bike_step(duration_s, threshold, zone)]


def build_bike_interval(threshold, reps=5, work_s=240, recovery_s=180):
    return [
        _bike_step(600, threshold, "aerobic", kind="warmup"),
        step_repeat(
            reps,
            [_bike_step(work_s, threshold, "vo2max", kind="interval"), _bike_step(recovery_s, threshold, "recovery", kind="recovery")],
        ),
        _bike_step(600, threshold, "aerobic", kind="cooldown"),
    ]


def build_run_tempo_tri(threshold_pace_mps, tempo_minutes=20):
    return [
        step_warmup(600, threshold_pace_mps * TRI_ZONE_PCT["aerobic"]),
        step_steady(duration_s=tempo_minutes * 60, pace_mps=threshold_pace_mps * TRI_ZONE_PCT["tempo"]),
        step_cooldown(600, threshold_pace_mps * TRI_ZONE_PCT["aerobic"]),
    ]


def tri_week_template(phase_name):
    """[(weekday, sport|None, workout_type), ...]. sport=None means rest.
    workout_type here is the DB enum (easy|long|tempo|interval|...) -- note
    this is distinct from the *zone* names in TRI_ZONE_PCT ("aerobic" etc),
    which _build_tri_workout maps to independently below."""
    if phase_name == "base":
        return [
            (0, None, "rest"),
            (1, "swim", "easy"),
            (2, "bike", "easy"),
            (3, "run", "easy"),
            (4, "swim", "easy"),
            (5, "bike", "long"),
            (6, "run", "long"),
        ]
    if phase_name in ("build", "peak"):
        return [
            (0, None, "rest"),
            (1, "swim", "tempo"),
            (2, "bike", "interval"),
            (3, "run", "tempo"),
            (4, "swim", "easy"),
            (5, "brick", "brick"),
            (6, "run", "long"),
        ]
    if phase_name == "taper":
        return [
            (0, None, "rest"),
            (1, "swim", "easy"),
            (2, "bike", "tempo"),
            (3, "run", "easy"),
            (4, None, "rest"),
            (5, "bike", "easy"),
            (6, "run", "easy"),
        ]
    return [(i, None, "rest") for i in range(7)]


def _build_tri_workout(sport, workout_type, hours_per_session, thresholds):
    swim_pace, run_pace, bike_threshold = thresholds
    if sport is None or workout_type == "rest":
        return "run", "rest", [], "Rest day"

    if sport == "brick":
        bike_s = hours_per_session["bike"] * 3600 * 0.7
        run_s = hours_per_session["run"] * 3600 * 0.4
        segments = [
            {"sport": "bike", "steps": build_bike_steady(bike_s, bike_threshold, "tempo")},
            {"sport": "run", "steps": build_run_steady_tri(run_s, run_pace, "aerobic")},
        ]
        return "brick", "brick", {"segments": segments}, "Brick: bike + transition run"

    duration_s = hours_per_session.get(sport, 0.5) * 3600
    if sport == "swim":
        zone = "tempo" if workout_type == "tempo" else "aerobic"
        return sport, workout_type, build_swim_steady(duration_s, swim_pace, zone), f"Swim {workout_type}"
    if sport == "run":
        if workout_type == "tempo":
            return sport, workout_type, build_run_tempo_tri(run_pace), "Run: warm-up + 20 min tempo + cool-down"
        zone = "aerobic"
        return sport, workout_type, build_run_steady_tri(duration_s, run_pace, zone), f"Run {workout_type}"
    if sport == "bike":
        if workout_type == "interval":
            return sport, workout_type, build_bike_interval(bike_threshold), "Bike: 5 x 4 min @ VO2max w/ recovery"
        zone = "tempo" if workout_type == "tempo" else "aerobic"
        return sport, workout_type, build_bike_steady(duration_s, bike_threshold, zone), f"Bike {workout_type}"
    return sport, workout_type, [], workout_type


def generate_triathlon_race_plan(race_type, start_date, race_date, priority, thresholds, current_weekly_hours, weak_sport=None):
    phases = [p for p in compute_phases(start_date, race_date, priority) if p["name"] != "race"]
    phase_for_date = _phase_for_each_date(phases)

    plan_start_monday = start_date - timedelta(days=start_date.weekday())
    total_weeks = max(((race_date - plan_start_monday).days // 7) + 1, 1)
    hour_progression = weekly_volume_progression(total_weeks, current_weekly_hours)

    workouts = []
    for week_idx in range(total_weeks):
        week_monday = plan_start_monday + timedelta(days=7 * week_idx)
        mid_day = week_monday + timedelta(days=3)
        phase_name = phase_for_date.get(mid_day, phase_for_date.get(week_monday, "taper"))

        total_hours = hour_progression[week_idx]
        if phase_name == "taper":
            total_hours = hour_progression[min(week_idx, len(hour_progression) - 1)] * 0.6

        sport_hours = weekly_sport_hours(total_hours, weak_sport)
        template = tri_week_template(phase_name)
        session_counts = {"swim": 0, "bike": 0, "run": 0}
        for _, sport, wt in template:
            if sport in session_counts:
                session_counts[sport] += 1
            elif sport == "brick":
                session_counts["bike"] += 1
                session_counts["run"] += 1
        hours_per_session = {
            s: sport_hours[s] / max(session_counts[s], 1) for s in ("swim", "bike", "run")
        }

        for day_offset, sport, workout_type in template:
            day = week_monday + timedelta(days=day_offset)
            if day < start_date or day >= race_date:
                continue
            phase_of_day = phase_for_date.get(day, phase_name)
            actual_sport, wt, structure, description = _build_tri_workout(
                sport, workout_type, hours_per_session, thresholds
            )
            workouts.append(
                {
                    "date": day.isoformat(),
                    "phase": phase_of_day,
                    "sport": actual_sport,
                    "workout_type": "rest" if wt == "rest" else wt,
                    "description": description,
                    "structure": structure,
                }
            )

    workouts.append(
        {
            "date": race_date.isoformat(),
            "phase": "race",
            "sport": "brick",
            "workout_type": "race_pace",
            "description": "Race day",
            "structure": [],
        }
    )
    return workouts


def generate_tri_mileage_or_fitness_plan(mode, start_date, end_date, thresholds, current_weekly_hours, weak_sport=None):
    plan_start_monday = start_date - timedelta(days=start_date.weekday())
    total_weeks = max(((end_date - plan_start_monday).days // 7) + 1, 1)

    if mode == "mileage_progression":
        hour_progression = weekly_volume_progression(total_weeks, current_weekly_hours)
    else:
        hour_progression = [
            current_weekly_hours * (0.75 if i % 4 == 3 else 1.0) for i in range(total_weeks)
        ]

    workouts = []
    for week_idx in range(total_weeks):
        week_monday = plan_start_monday + timedelta(days=7 * week_idx)
        sport_hours = weekly_sport_hours(hour_progression[week_idx], weak_sport)
        template = tri_week_template("base")
        session_counts = {"swim": 0, "bike": 0, "run": 0}
        for _, sport, _ in template:
            if sport in session_counts:
                session_counts[sport] += 1
        hours_per_session = {s: sport_hours[s] / max(session_counts[s], 1) for s in ("swim", "bike", "run")}

        for day_offset, sport, workout_type in template:
            day = week_monday + timedelta(days=day_offset)
            if day < start_date or day > end_date:
                continue
            actual_sport, wt, structure, description = _build_tri_workout(sport, workout_type, hours_per_session, thresholds)
            workouts.append(
                {
                    "date": day.isoformat(),
                    "phase": "base",
                    "sport": actual_sport,
                    "workout_type": "rest" if wt == "rest" else wt,
                    "description": description,
                    "structure": structure,
                }
            )
    return workouts


# ---------------------------------------------------------------------------
# Top-level generation
# ---------------------------------------------------------------------------


def _phase_for_each_date(phases):
    phase_for_date = {}
    for p in phases:
        d = p["start"]
        while d <= p["end"]:
            phase_for_date[d] = p["name"]
            d += timedelta(days=1)
    return phase_for_date


def generate_running_race_plan(race_type, start_date, race_date, priority, vdot, current_weekly_km):
    paces = vdot_paces_mps(vdot)
    phases = [p for p in compute_phases(start_date, race_date, priority) if p["name"] != "race"]
    phase_for_date = _phase_for_each_date(phases)

    plan_start_monday = start_date - timedelta(days=start_date.weekday())
    total_weeks = max(((race_date - plan_start_monday).days // 7) + 1, 1)
    volumes = weekly_volume_progression(total_weeks, current_weekly_km)

    workouts = []
    for week_idx in range(total_weeks):
        week_monday = plan_start_monday + timedelta(days=7 * week_idx)
        mid_day = week_monday + timedelta(days=3)
        phase_name = phase_for_date.get(mid_day, phase_for_date.get(week_monday, "taper"))

        weekly_km = volumes[week_idx]
        if phase_name == "taper":
            # Reduce volume progressively through taper rather than following
            # the raw build progression (Pfitzinger's ~20-30%+ reduction).
            weekly_km = volumes[min(week_idx, len(volumes) - 1)] * 0.6

        long_run_km = min(weekly_km * 0.28, weekly_km * 0.5)
        remaining_km = max(weekly_km - long_run_km, 0)
        template = week_template(phase_name, race_type)
        num_easy_days = sum(1 for _, wt in template if wt == "easy")
        easy_km_each = remaining_km / max(num_easy_days, 1)
        progression_long_run = phase_name in ("build", "peak") and race_type in LONG_RACES

        for day_offset, workout_type in template:
            day = week_monday + timedelta(days=day_offset)
            if day < start_date or day >= race_date:
                continue
            phase_of_day = phase_for_date.get(day, phase_name)
            structure, description = _build_workout(
                workout_type, paces, long_run_km, easy_km_each, race_type, progression_long_run
            )
            workouts.append(
                {
                    "date": day.isoformat(),
                    "phase": phase_of_day,
                    "sport": "run",
                    "workout_type": "rest" if workout_type == "rest" else workout_type,
                    "description": description,
                    "structure": structure,
                }
            )

    workouts.append(
        {
            "date": race_date.isoformat(),
            "phase": "race",
            "sport": "run",
            "workout_type": "race_pace",
            "description": "Race day",
            "structure": [],
        }
    )
    return workouts


def generate_mileage_or_fitness_plan(mode, start_date, end_date, vdot, current_weekly_km):
    paces = vdot_paces_mps(vdot)
    plan_start_monday = start_date - timedelta(days=start_date.weekday())
    total_weeks = max(((end_date - plan_start_monday).days // 7) + 1, 1)

    if mode == "mileage_progression":
        volumes = weekly_volume_progression(total_weeks, current_weekly_km)
    else:  # general_fitness: hold steady, cutback for variety only
        volumes = [
            current_weekly_km * (0.75 if i % 4 == 3 else 1.0) for i in range(total_weeks)
        ]

    template = [(0, "rest"), (1, "easy"), (2, "easy"), (3, "easy"), (4, "easy"), (5, "easy"), (6, "long")]
    workouts = []
    for week_idx in range(total_weeks):
        week_monday = plan_start_monday + timedelta(days=7 * week_idx)
        weekly_km = volumes[week_idx]
        long_run_km = min(weekly_km * 0.28, weekly_km * 0.5)
        remaining_km = max(weekly_km - long_run_km, 0)
        easy_km_each = remaining_km / 5

        for day_offset, workout_type in template:
            day = week_monday + timedelta(days=day_offset)
            if day < start_date or day > end_date:
                continue
            structure, description = _build_workout(
                workout_type, paces, long_run_km, easy_km_each, race_type=None, progression_long_run=False
            )
            workouts.append(
                {
                    "date": day.isoformat(),
                    "phase": "base",
                    "sport": "run",
                    "workout_type": "rest" if workout_type == "rest" else workout_type,
                    "description": description,
                    "structure": structure,
                }
            )
    return workouts


DEFAULT_VDOT = 38.0  # conservative recreational-runner fallback if no recent race time given


def _process_running_plan(plan):
    start = date.fromisoformat(plan["start_date"])
    current_weekly_km = plan.get("current_weekly_km") or 20.0
    have_test = plan.get("recent_race_distance_m") and plan.get("recent_race_time_s")
    vdot = (
        compute_vdot(plan["recent_race_distance_m"], plan["recent_race_time_s"]) if have_test else DEFAULT_VDOT
    )

    if plan["mode"] == "race_goal":
        races = api_get("/api/races")
        race = next((r for r in races if r["id"] == plan["race_id"]), None)
        if not race:
            print(f"Plan {plan['id']}: race {plan['race_id']} not found, skipping")
            return
        race_date = date.fromisoformat(race["date"])
        workouts = generate_running_race_plan(
            race["race_type"], start, race_date, race["priority"], vdot, current_weekly_km
        )
    else:
        end = date.fromisoformat(plan["end_date"])
        workouts = generate_mileage_or_fitness_plan(plan["mode"], start, end, vdot, current_weekly_km)

    for w in workouts:
        w["plan_id"] = plan["id"]
    api_post("/api/plan-workouts/bulk", {"workouts": workouts})
    api_patch(f"/api/plans/{plan['id']}", {"vdot": round(vdot, 1), "status": "active"})
    print(f"Plan {plan['id']}: generated {len(workouts)} running workouts (VDOT {vdot:.1f})")


def _process_triathlon_plan(plan):
    start = date.fromisoformat(plan["start_date"])
    current_weekly_hours = plan.get("current_weekly_km") or 8.0  # hours, for triathlon plans (see schema note)

    bike_threshold = compute_bike_threshold(plan.get("bike_test_avg_power"), plan.get("bike_test_avg_speed_mps"))
    run_pace = compute_run_threshold_tri(plan.get("run_test_avg_pace_mps"))
    swim_pace = compute_swim_threshold(plan.get("swim_test_pace_mps"))
    thresholds = (swim_pace, run_pace, bike_threshold)

    if plan["mode"] == "race_goal":
        races = api_get("/api/races")
        race = next((r for r in races if r["id"] == plan["race_id"]), None)
        if not race:
            print(f"Plan {plan['id']}: race {plan['race_id']} not found, skipping")
            return
        race_date = date.fromisoformat(race["date"])
        workouts = generate_triathlon_race_plan(
            race["race_type"], start, race_date, race["priority"], thresholds, current_weekly_hours
        )
    else:
        end = date.fromisoformat(plan["end_date"])
        workouts = generate_tri_mileage_or_fitness_plan(plan["mode"], start, end, thresholds, current_weekly_hours)

    for w in workouts:
        w["plan_id"] = plan["id"]
    api_post("/api/plan-workouts/bulk", {"workouts": workouts})
    api_patch(f"/api/plans/{plan['id']}", {"fthr_run": round(run_pace, 3), "status": "active"})
    print(f"Plan {plan['id']}: generated {len(workouts)} triathlon workouts")


def process_plan(plan):
    if plan["sport_scope"] == "triathlon":
        _process_triathlon_plan(plan)
    else:
        _process_running_plan(plan)


def main():
    if not API_SECRET:
        print("PLAN_API_SECRET is not set.", file=sys.stderr)
        sys.exit(1)

    draft_plans = api_get("/api/plans", params={"status": "draft"})
    if not draft_plans:
        print("No draft plans to generate.")
        return
    for plan in draft_plans:
        process_plan(plan)


if __name__ == "__main__":
    main()
