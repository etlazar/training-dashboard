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

const PACE_PER_KM_TYPES = new Set([
  "running",
  "trail_running",
  "treadmill_running",
  "walking",
  "hiking",
]);
const PACE_PER_100M_TYPES = new Set(["lap_swimming", "open_water_swimming"]);

function formatMinSec(secondsPerUnit) {
  if (!Number.isFinite(secondsPerUnit) || secondsPerUnit <= 0) return "-";
  const minutes = Math.floor(secondsPerUnit / 60);
  const seconds = Math.round(secondsPerUnit % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Returns { label, value } — pace (min/km, min/100m) for run/walk/swim,
 * speed (km/h) for everything else (cycling, rowing, etc). */
export function formatPaceOrSpeed(activityType, averageSpeedMps) {
  if (!averageSpeedMps || averageSpeedMps <= 0) {
    return { label: "Speed", value: "-" };
  }
  if (PACE_PER_KM_TYPES.has(activityType)) {
    const secondsPerKm = 1000 / averageSpeedMps;
    return { label: "Pace", value: `${formatMinSec(secondsPerKm)} /km` };
  }
  if (PACE_PER_100M_TYPES.has(activityType)) {
    const secondsPer100m = 100 / averageSpeedMps;
    return { label: "Pace", value: `${formatMinSec(secondsPer100m)} /100m` };
  }
  const kmh = averageSpeedMps * 3.6;
  return { label: "Speed", value: `${kmh.toFixed(1)} km/h` };
}
