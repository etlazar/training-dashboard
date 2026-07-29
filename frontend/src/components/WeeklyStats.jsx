function activityDate(a) {
  return new Date((a.startTimeLocal || "").replace(" ", "T"));
}

function sumWindow(activities, startDaysAgo, endDaysAgo) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - startDaysAgo);
  const end = new Date(now);
  end.setDate(end.getDate() - endDaysAgo);

  const inWindow = activities.filter((a) => {
    const d = activityDate(a);
    return d >= start && d < end;
  });

  return {
    count: inWindow.length,
    distanceMeters: inWindow.reduce((s, a) => s + (a.distanceMeters || 0), 0),
    durationSeconds: inWindow.reduce((s, a) => s + (a.durationSeconds || 0), 0),
    elevationMeters: inWindow.reduce(
      (s, a) => s + (a.elevationGainMeters || 0),
      0,
    ),
  };
}

function formatDeltaPct(current, previous) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "even with last week";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs last week`;
}

function Tile({ label, value, delta }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {delta && <p className="stat-delta">{delta}</p>}
    </div>
  );
}

export default function WeeklyStats({ activities }) {
  const thisWeek = sumWindow(activities, 7, 0);
  const lastWeek = sumWindow(activities, 14, 7);

  return (
    <div className="stat-tile-row">
      <Tile
        label="Distance (7d)"
        value={`${(thisWeek.distanceMeters / 1000).toFixed(1)} km`}
        delta={formatDeltaPct(thisWeek.distanceMeters, lastWeek.distanceMeters)}
      />
      <Tile
        label="Time (7d)"
        value={`${(thisWeek.durationSeconds / 3600).toFixed(1)} h`}
        delta={formatDeltaPct(thisWeek.durationSeconds, lastWeek.durationSeconds)}
      />
      <Tile
        label="Elevation (7d)"
        value={`${Math.round(thisWeek.elevationMeters)} m`}
        delta={formatDeltaPct(thisWeek.elevationMeters, lastWeek.elevationMeters)}
      />
      <Tile label="Activities (7d)" value={thisWeek.count} />
    </div>
  );
}
