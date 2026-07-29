export function formatShortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function secondsToHoursLabel(seconds) {
  if (seconds == null) return "-";
  const hours = seconds / 3600;
  return `${hours.toFixed(1)}h`;
}

export function secondsToHoursNumber(seconds) {
  if (seconds == null) return 0;
  return Math.round((seconds / 3600) * 100) / 100;
}

export function formatDuration(seconds) {
  if (seconds == null) return "-";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatDistanceKm(meters) {
  if (meters == null) return "-";
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatActivityType(typeKey) {
  if (!typeKey) return "Activity";
  return typeKey
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatActivityDate(startTimeLocal) {
  if (!startTimeLocal) return "-";
  const d = new Date(startTimeLocal.replace(" ", "T"));
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
