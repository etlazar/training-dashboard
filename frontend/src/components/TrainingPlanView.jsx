import { formatShortDate } from "../lib/format";

const PHASE_LABELS = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
  race: "Race",
};

function groupByWeek(workouts) {
  const weeks = new Map();
  for (const w of workouts) {
    const d = new Date(`${w.date}T00:00:00`);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(w);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function StatusDot({ status }) {
  const color =
    status === "pushed"
      ? "var(--series-3)"
      : status === "completed"
        ? "var(--text-muted)"
        : "var(--series-1)";
  return (
    <span
      title={status}
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        marginRight: 6,
      }}
    />
  );
}

export default function TrainingPlanView({ workouts }) {
  if (workouts.length === 0) {
    return <p className="card-status">No workouts generated yet.</p>;
  }

  const weeks = groupByWeek(workouts);

  return (
    <div className="plan-view">
      {weeks.map(([weekStart, weekWorkouts]) => (
        <div key={weekStart} className="plan-week">
          <h3 className="plan-week-header">Week of {formatShortDate(weekStart)}</h3>
          <div className="plan-week-rows">
            {weekWorkouts.map((w) => (
              <div key={w.id} className="plan-workout-row">
                <span className="plan-workout-date">{formatShortDate(w.date)}</span>
                <span className="plan-phase-badge">{PHASE_LABELS[w.phase] || w.phase}</span>
                <span className="plan-workout-sport">{w.sport}</span>
                <span className="plan-workout-desc">
                  <StatusDot status={w.status} />
                  {w.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
