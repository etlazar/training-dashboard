const base = import.meta.env.BASE_URL;

async function fetchJson(path) {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status}`);
  }
  return res.json();
}

export const fetchDailySummary = () => fetchJson("data/daily_summary.json");
export const fetchSleep = () => fetchJson("data/sleep.json");
export const fetchActivities = () => fetchJson("data/activities.json");
