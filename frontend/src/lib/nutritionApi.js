const PLAN_API_BASE = import.meta.env.VITE_PLAN_API_BASE || "http://localhost:8787";
const TOKEN_KEY = "planApiToken"; // shared with lib/planApi.js -- same backend, same token

function getAuthToken() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = window.prompt(
      "Enter the training-plan write token (set up once by whoever configured this dashboard; stored only in this browser):",
    );
    if (token) localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

async function apiGet(path) {
  const res = await fetch(`${PLAN_API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiWrite(method, path, body) {
  const token = getAuthToken();
  const res = await fetch(`${PLAN_API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `${method} ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const searchFood = (query) => apiGet(`/api/food-search?q=${encodeURIComponent(query)}`);
export const fetchNutritionLogs = (date) => apiGet(`/api/nutrition-logs${date ? `?date=${date}` : ""}`);
export const createNutritionLog = (log) => apiWrite("POST", "/api/nutrition-logs", log);

export const fetchNutritionPlans = (raceId) =>
  apiGet(`/api/nutrition-plans${raceId ? `?race_id=${raceId}` : ""}`);
export const createNutritionPlan = (plan) => apiWrite("POST", "/api/nutrition-plans", plan);
