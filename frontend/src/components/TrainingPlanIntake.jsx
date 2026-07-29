import { useState } from "react";
import { createPlan, createRace } from "../lib/planApi";

const RUN_RACE_TYPES = [
  { value: "run_5k", label: "5K" },
  { value: "run_10k", label: "10K" },
  { value: "run_15k", label: "15K" },
  { value: "run_10mile", label: "10 Mile" },
  { value: "run_half", label: "Half Marathon" },
  { value: "run_marathon", label: "Marathon" },
];

const TRI_RACE_TYPES = [
  { value: "tri_sprint", label: "Sprint Triathlon" },
  { value: "tri_olympic", label: "Olympic Triathlon" },
  { value: "tri_70_3", label: "70.3 (Half Ironman)" },
  { value: "tri_full", label: "Full Ironman" },
];

function addWeeks(dateStr, weeks) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export default function TrainingPlanIntake({ onPlanCreated }) {
  const [mode, setMode] = useState("race_goal");
  const [sportScope, setSportScope] = useState("run");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [raceName, setRaceName] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceType, setRaceType] = useState(RUN_RACE_TYPES[0].value);
  const [priority, setPriority] = useState("A");

  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [durationWeeks, setDurationWeeks] = useState(12);
  const [currentWeeklyVolume, setCurrentWeeklyVolume] = useState(sportScope === "run" ? 20 : 6);

  // Running intake
  const [recentRaceDistanceM, setRecentRaceDistanceM] = useState(5000);
  const [recentRaceTimeS, setRecentRaceTimeS] = useState(1500);

  // Triathlon intake
  const [bikeTestAvgSpeed, setBikeTestAvgSpeed] = useState(8);
  const [runTestAvgPace, setRunTestAvgPace] = useState(3.0);
  const [swimTest1000mTimeS, setSwimTest1000mTimeS] = useState(1200);

  const raceTypes = sportScope === "run" ? RUN_RACE_TYPES : TRI_RACE_TYPES;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let raceId = null;
      let endDate = addWeeks(startDate, durationWeeks);

      if (mode === "race_goal") {
        const race = await createRace({
          name: raceName,
          date: raceDate,
          race_type: raceType,
          priority,
        });
        raceId = race.id;
        endDate = raceDate;
      }

      const planPayload = {
        race_id: raceId,
        mode,
        sport_scope: sportScope,
        start_date: startDate,
        end_date: endDate,
        current_weekly_km: Number(currentWeeklyVolume),
      };

      if (sportScope === "run") {
        planPayload.recent_race_distance_m = Number(recentRaceDistanceM);
        planPayload.recent_race_time_s = Number(recentRaceTimeS);
      } else {
        planPayload.bike_test_avg_speed_mps = Number(bikeTestAvgSpeed);
        planPayload.run_test_avg_pace_mps = Number(runTestAvgPace);
        planPayload.swim_test_pace_mps = 1000 / Number(swimTest1000mTimeS);
      }

      const plan = await createPlan(planPayload);
      onPlanCreated(plan.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="plan-intake-form">
      <div className="form-row">
        <label>
          Plan type
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="race_goal">Race goal</option>
            <option value="mileage_progression">Build weekly mileage</option>
            <option value="general_fitness">General fitness</option>
          </select>
        </label>
        <label>
          Sport
          <select
            value={sportScope}
            onChange={(e) => {
              setSportScope(e.target.value);
              setRaceType(e.target.value === "run" ? RUN_RACE_TYPES[0].value : TRI_RACE_TYPES[0].value);
            }}
          >
            <option value="run">Running</option>
            <option value="triathlon">Triathlon</option>
          </select>
        </label>
      </div>

      {mode === "race_goal" ? (
        <div className="form-row">
          <label>
            Race name
            <input value={raceName} onChange={(e) => setRaceName(e.target.value)} required />
          </label>
          <label>
            Race date
            <input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} required />
          </label>
          <label>
            Distance
            <select value={raceType} onChange={(e) => setRaceType(e.target.value)}>
              {raceTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="A">A (goal race)</option>
              <option value="B">B</option>
              <option value="C">C (tune-up)</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="form-row">
          <label>
            Plan length (weeks)
            <input
              type="number"
              min="4"
              max="52"
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      <div className="form-row">
        <label>
          Plan start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </label>
        <label>
          Current weekly {sportScope === "run" ? "volume (km)" : "training (hours)"}
          <input
            type="number"
            step="0.5"
            value={currentWeeklyVolume}
            onChange={(e) => setCurrentWeeklyVolume(e.target.value)}
          />
        </label>
      </div>

      {sportScope === "run" ? (
        <div className="form-row">
          <label>
            Recent race distance (m)
            <input
              type="number"
              value={recentRaceDistanceM}
              onChange={(e) => setRecentRaceDistanceM(e.target.value)}
            />
          </label>
          <label>
            Recent race time (seconds)
            <input type="number" value={recentRaceTimeS} onChange={(e) => setRecentRaceTimeS(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="form-row">
          <label>
            Bike 20-min test avg speed (m/s)
            <input
              type="number"
              step="0.1"
              value={bikeTestAvgSpeed}
              onChange={(e) => setBikeTestAvgSpeed(e.target.value)}
            />
          </label>
          <label>
            Run 20-min test avg pace (m/s)
            <input type="number" step="0.1" value={runTestAvgPace} onChange={(e) => setRunTestAvgPace(e.target.value)} />
          </label>
          <label>
            Swim 1000m time trial (seconds)
            <input
              type="number"
              value={swimTest1000mTimeS}
              onChange={(e) => setSwimTest1000mTimeS(e.target.value)}
            />
          </label>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create plan"}
      </button>
      <p className="card-status">
        Generation runs on the next scheduled sync (every 2 hours) — or trigger the "plan" workflow manually.
      </p>
    </form>
  );
}
