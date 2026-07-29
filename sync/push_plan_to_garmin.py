#!/usr/bin/env python3
"""
Pushes generated plan_workouts (from the Cloudflare Worker backend) to
Garmin Connect: uploads the workout, then schedules it on the Garmin
Connect calendar for its date so it syncs to the watch on next sync --
the same mechanism Garmin Connect's own "send to device" uses.

The step JSON shape below was confirmed against a real workout already in
the account (synced in from TrainingPeaks) via garmin.get_workout_by_id() --
notably that Garmin uses stepType "rest" (not "recovery") for the jog/rest
between interval reps, and pace-zone targets are plain m/s values in
targetValueOne/targetValueTwo. See the Phase 2 plan for detail.

Env vars:
  PLAN_API_BASE           Worker base URL (default: http://localhost:8787)
  PLAN_API_SECRET         Bearer token for write endpoints
  PLAN_PUSH_LOOKAHEAD_DAYS  How many days ahead to push (default: 14)
  GARMIN_TOKENS_DIR / GARMIN_EMAIL / GARMIN_PASSWORD  (see sync_garmin.py)
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync_garmin import login  # noqa: E402  (reuse existing Garmin auth)

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

API_BASE = os.getenv("PLAN_API_BASE", "http://localhost:8787")
API_SECRET = os.getenv("PLAN_API_SECRET", "")
LOOKAHEAD_DAYS = int(os.getenv("PLAN_PUSH_LOOKAHEAD_DAYS", "14"))

SPORT_TYPE = {
    "run": {"sportTypeId": 1, "sportTypeKey": "running", "displayOrder": 1},
    "bike": {"sportTypeId": 2, "sportTypeKey": "cycling", "displayOrder": 2},
    "swim": {"sportTypeId": 4, "sportTypeKey": "swimming", "displayOrder": 3},
    "strength": {"sportTypeId": 5, "sportTypeKey": "strength_training", "displayOrder": 5},
}

# (stepTypeId, stepTypeKey) per our internal step "kind". "recovery" maps to
# Garmin's "rest" type to match the confirmed real-world example, not the
# "recovery" type garminconnect's own (less-verified) helper defaults to.
STEP_TYPE = {
    "warmup": (1, "warmup"),
    "cooldown": (2, "cooldown"),
    "interval": (3, "interval"),
    "steady": (3, "interval"),
    "recovery": (5, "rest"),
}


def _auth_headers():
    return {"Authorization": f"Bearer {API_SECRET}"}


def api_get(path, params=None):
    r = requests.get(f"{API_BASE}{path}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def api_patch(path, body):
    r = requests.patch(f"{API_BASE}{path}", json=body, headers=_auth_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def _end_condition(step):
    if step.get("duration_s") is not None:
        return (
            {"conditionTypeId": 2, "conditionTypeKey": "time", "displayOrder": 2, "displayable": True},
            float(step["duration_s"]),
        )
    if step.get("distance_m") is not None:
        return (
            {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True},
            float(step["distance_m"]),
        )
    return ({"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True}, None)


def _target(step, sport):
    """Bike power (power.zone), bike speed-fallback (speed.zone), or
    run/swim pace (pace.zone) -- distinguished by which field is set on the
    step plus the enclosing segment's sport."""
    if step.get("power_low_w") is not None and step.get("power_high_w") is not None:
        return (
            {"workoutTargetTypeId": 2, "workoutTargetTypeKey": "power.zone", "displayOrder": 2},
            float(step["power_low_w"]),
            float(step["power_high_w"]),
        )
    if step.get("pace_low_mps") is not None and step.get("pace_high_mps") is not None:
        if sport == "bike":
            target_type = {"workoutTargetTypeId": 5, "workoutTargetTypeKey": "speed.zone", "displayOrder": 5}
        else:
            target_type = {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone", "displayOrder": 6}
        return target_type, float(step["pace_low_mps"]), float(step["pace_high_mps"])
    return ({"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1}, None, None)


def _executable_step(step, step_order, sport):
    step_type_id, step_type_key = STEP_TYPE.get(step["kind"], (7, "other"))
    end_condition, end_condition_value = _end_condition(step)
    target_type, target_one, target_two = _target(step, sport)
    return {
        "type": "ExecutableStepDTO",
        "stepOrder": step_order,
        "stepType": {"stepTypeId": step_type_id, "stepTypeKey": step_type_key, "displayOrder": step_type_id},
        "endCondition": end_condition,
        "endConditionValue": end_condition_value,
        "targetType": target_type,
        "targetValueOne": target_one,
        "targetValueTwo": target_two,
    }


def _convert_steps(steps, order_counter, sport):
    """order_counter is a 1-element list used as a mutable shared counter
    so nested repeat groups keep unique, ascending stepOrder values."""
    result = []
    for step in steps:
        if step["kind"] == "repeat":
            order_counter[0] += 1
            this_order = order_counter[0]
            inner = _convert_steps(step["steps"], order_counter, sport)
            result.append(
                {
                    "type": "RepeatGroupDTO",
                    "stepOrder": this_order,
                    "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
                    "numberOfIterations": step["iterations"],
                    "workoutSteps": inner,
                    "endCondition": {
                        "conditionTypeId": 7,
                        "conditionTypeKey": "iterations",
                        "displayOrder": 7,
                        "displayable": False,
                    },
                    "endConditionValue": float(step["iterations"]),
                }
            )
        else:
            order_counter[0] += 1
            result.append(_executable_step(step, order_counter[0], sport))
    return result


def _estimate_duration_s(steps):
    total = 0
    for s in steps:
        if s["kind"] == "repeat":
            total += s["iterations"] * _estimate_duration_s(s["steps"])
        else:
            total += s.get("duration_s") or 0
    return total


def build_garmin_workout(plan_workout):
    sport = plan_workout.get("sport", "run")
    structure = plan_workout["structure"]
    if isinstance(structure, str):
        structure = json.loads(structure)

    label = plan_workout.get("description") or plan_workout["workout_type"].replace("_", " ").title()

    if sport == "brick" and isinstance(structure, dict) and "segments" in structure:
        segments = []
        total_duration = 0
        order_counter = [0]  # shared across all segments -- Garmin requires globally unique stepOrder
        for i, seg in enumerate(structure["segments"], start=1):
            seg_sport = seg["sport"]
            seg_sport_type = SPORT_TYPE.get(seg_sport, SPORT_TYPE["run"])
            seg_steps = _convert_steps(seg["steps"], order_counter, seg_sport)
            segments.append({"segmentOrder": i, "sportType": seg_sport_type, "workoutSteps": seg_steps})
            total_duration += _estimate_duration_s(seg["steps"])
        return {
            "workoutName": f"{label} ({plan_workout['date']})",
            "sportType": {"sportTypeId": 10, "sportTypeKey": "multi_sport", "displayOrder": 10},
            "estimatedDurationInSecs": int(total_duration),
            "workoutSegments": segments,
        }

    sport_type = SPORT_TYPE.get(sport, SPORT_TYPE["run"])
    order_counter = [0]
    workout_steps = _convert_steps(structure, order_counter, sport)
    duration_s = _estimate_duration_s(structure)
    return {
        "workoutName": f"{label} ({plan_workout['date']})",
        "sportType": sport_type,
        "estimatedDurationInSecs": int(duration_s),
        "workoutSegments": [
            {"segmentOrder": 1, "sportType": sport_type, "workoutSteps": workout_steps}
        ],
    }


def main():
    if not API_SECRET:
        print("PLAN_API_SECRET is not set.", file=sys.stderr)
        sys.exit(1)

    today = date.today()
    horizon = today + timedelta(days=LOOKAHEAD_DAYS)
    candidates = api_get(
        "/api/plan-workouts",
        params={"status": "planned", "after": today.isoformat(), "before": horizon.isoformat()},
    )
    pending = [w for w in candidates if w.get("structure") and json.loads(w["structure"])]

    if not pending:
        print("No workouts to push.")
        return

    garmin = login()
    for w in pending:
        try:
            workout_json = build_garmin_workout(w)
            result = garmin.upload_workout(workout_json)
            workout_id = result["workoutId"]
            garmin.schedule_workout(workout_id, w["date"])
            api_patch(
                f"/api/plan-workouts/{w['id']}",
                {
                    "garmin_workout_id": workout_id,
                    "status": "pushed",
                    "pushed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            print(f"Pushed workout {w['id']} ({w['date']}) -> Garmin workout {workout_id}")
        except Exception as e:
            print(f"Failed to push workout {w['id']} ({w['date']}): {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
