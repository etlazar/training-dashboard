const RACE_TYPES = new Set([
  "run_5k", "run_10k", "run_15k", "run_10mile", "run_half", "run_marathon",
  "tri_sprint", "tri_olympic", "tri_70_3", "tri_full",
]);
const PRIORITIES = new Set(["A", "B", "C"]);
const PLAN_MODES = new Set(["race_goal", "mileage_progression", "general_fitness"]);
const SPORT_SCOPES = new Set(["run", "triathlon"]);

// Race-day nutrition targets by race type. Original synthesis of standard,
// widely-published sports-nutrition guidance (ACSM/ISSN position stands,
// IOC nutrition consensus, Jeukendrup's carbohydrate-oxidation research) --
// general guidance, not personalized/medical advice.
const NUTRITION_TARGETS_BY_RACE_TYPE = {
  run_5k: { carb_load_days: 0, carb_load_g_per_kg: 0, race_day_carbs_g_per_hour: 0, race_day_fluid_ml_per_hour: 600, race_day_sodium_mg_per_hour: null },
  run_10k: { carb_load_days: 0, carb_load_g_per_kg: 0, race_day_carbs_g_per_hour: 20, race_day_fluid_ml_per_hour: 600, race_day_sodium_mg_per_hour: null },
  tri_sprint: { carb_load_days: 0, carb_load_g_per_kg: 0, race_day_carbs_g_per_hour: 20, race_day_fluid_ml_per_hour: 600, race_day_sodium_mg_per_hour: null },
  run_15k: { carb_load_days: 1, carb_load_g_per_kg: 7, race_day_carbs_g_per_hour: 40, race_day_fluid_ml_per_hour: 650, race_day_sodium_mg_per_hour: 350 },
  run_10mile: { carb_load_days: 1, carb_load_g_per_kg: 7.5, race_day_carbs_g_per_hour: 45, race_day_fluid_ml_per_hour: 650, race_day_sodium_mg_per_hour: 400 },
  tri_olympic: { carb_load_days: 1, carb_load_g_per_kg: 8, race_day_carbs_g_per_hour: 50, race_day_fluid_ml_per_hour: 650, race_day_sodium_mg_per_hour: 400 },
  run_half: { carb_load_days: 1, carb_load_g_per_kg: 8, race_day_carbs_g_per_hour: 55, race_day_fluid_ml_per_hour: 700, race_day_sodium_mg_per_hour: 450 },
  tri_70_3: { carb_load_days: 2, carb_load_g_per_kg: 10, race_day_carbs_g_per_hour: 75, race_day_fluid_ml_per_hour: 700, race_day_sodium_mg_per_hour: 500 },
  run_marathon: { carb_load_days: 3, carb_load_g_per_kg: 11, race_day_carbs_g_per_hour: 75, race_day_fluid_ml_per_hour: 700, race_day_sodium_mg_per_hour: 500 },
  tri_full: { carb_load_days: 3, carb_load_g_per_kg: 12, race_day_carbs_g_per_hour: 90, race_day_fluid_ml_per_hour: 750, race_day_sodium_mg_per_hour: 600 },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

function requireAuth(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token && env.WRITE_SECRET && token === env.WRITE_SECRET;
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function handleRaces(request, env, url) {
  if (request.method === "GET") {
    const hasPlan = url.searchParams.get("has_plan");
    let query = `SELECT r.* FROM races r`;
    if (hasPlan === "false") {
      query += ` LEFT JOIN plans p ON p.race_id = r.id WHERE p.id IS NULL`;
    }
    query += ` ORDER BY r.date ASC`;
    const { results } = await env.DB.prepare(query).all();
    return json(results, 200, env);
  }

  if (request.method === "POST") {
    if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);
    const body = await request.json();
    if (!body.name || !isValidDate(body.date) || !RACE_TYPES.has(body.race_type)) {
      return json({ error: "invalid race payload" }, 400, env);
    }
    const priority = PRIORITIES.has(body.priority) ? body.priority : "A";
    const { meta } = await env.DB.prepare(
      `INSERT INTO races (name, date, race_type, priority) VALUES (?, ?, ?, ?)`,
    )
      .bind(body.name, body.date, body.race_type, priority)
      .run();
    return json({ id: meta.last_row_id }, 201, env);
  }

  return json({ error: "method not allowed" }, 405, env);
}

async function handlePlans(request, env, url) {
  if (request.method === "GET") {
    const status = url.searchParams.get("status");
    let query = `SELECT * FROM plans`;
    const binds = [];
    if (status) {
      query += ` WHERE status = ?`;
      binds.push(status);
    }
    query += ` ORDER BY start_date ASC`;
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results, 200, env);
  }

  if (request.method === "POST") {
    if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);
    const body = await request.json();
    if (
      !PLAN_MODES.has(body.mode) ||
      !SPORT_SCOPES.has(body.sport_scope) ||
      !isValidDate(body.start_date) ||
      !isValidDate(body.end_date)
    ) {
      return json({ error: "invalid plan payload" }, 400, env);
    }
    const { meta } = await env.DB.prepare(
      `INSERT INTO plans
        (race_id, mode, sport_scope, start_date, end_date, vdot, fthr_run, fthr_bike, fthr_swim_pace,
         recent_race_distance_m, recent_race_time_s, current_weekly_km,
         bike_test_avg_power, bike_test_avg_speed_mps, run_test_avg_pace_mps, swim_test_pace_mps,
         status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        body.race_id ?? null,
        body.mode,
        body.sport_scope,
        body.start_date,
        body.end_date,
        body.vdot ?? null,
        body.fthr_run ?? null,
        body.fthr_bike ?? null,
        body.fthr_swim_pace ?? null,
        body.recent_race_distance_m ?? null,
        body.recent_race_time_s ?? null,
        body.current_weekly_km ?? null,
        body.bike_test_avg_power ?? null,
        body.bike_test_avg_speed_mps ?? null,
        body.run_test_avg_pace_mps ?? null,
        body.swim_test_pace_mps ?? null,
        body.status || "draft",
      )
      .run();
    return json({ id: meta.last_row_id }, 201, env);
  }

  return json({ error: "method not allowed" }, 405, env);
}

async function handlePlanWorkouts(request, env, url) {
  if (request.method === "GET") {
    const planId = url.searchParams.get("plan_id");
    const status = url.searchParams.get("status");
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    const clauses = [];
    const binds = [];
    if (planId) {
      clauses.push("plan_id = ?");
      binds.push(planId);
    }
    if (status) {
      clauses.push("status = ?");
      binds.push(status);
    }
    if (before) {
      clauses.push("date <= ?");
      binds.push(before);
    }
    if (after) {
      clauses.push("date >= ?");
      binds.push(after);
    }
    let query = `SELECT * FROM plan_workouts`;
    if (clauses.length) query += ` WHERE ${clauses.join(" AND ")}`;
    query += ` ORDER BY date ASC`;
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results, 200, env);
  }

  return json({ error: "method not allowed" }, 405, env);
}

async function handlePlanWorkoutsBulk(request, env) {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, env);
  if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);

  const body = await request.json();
  const workouts = Array.isArray(body.workouts) ? body.workouts : [];
  if (workouts.length === 0) return json({ error: "no workouts provided" }, 400, env);

  const stmt = env.DB.prepare(
    `INSERT INTO plan_workouts
      (plan_id, date, phase, sport, workout_type, description, structure, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')`,
  );
  const batch = workouts.map((w) =>
    stmt.bind(
      w.plan_id,
      w.date,
      w.phase,
      w.sport,
      w.workout_type,
      w.description ?? null,
      JSON.stringify(w.structure ?? []),
    ),
  );
  await env.DB.batch(batch);
  return json({ inserted: workouts.length }, 201, env);
}

async function handlePlanPatch(request, env, id) {
  if (request.method !== "PATCH") return json({ error: "method not allowed" }, 405, env);
  if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);

  const body = await request.json();
  const patchable = ["vdot", "fthr_run", "fthr_bike", "fthr_swim_pace", "status"];
  const fields = [];
  const binds = [];
  for (const key of patchable) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      binds.push(body[key]);
    }
  }
  if (fields.length === 0) return json({ error: "no fields to update" }, 400, env);

  binds.push(id);
  await env.DB.prepare(`UPDATE plans SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return json({ ok: true }, 200, env);
}

async function handlePlanWorkoutPatch(request, env, id) {
  if (request.method !== "PATCH") return json({ error: "method not allowed" }, 405, env);
  if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);

  const body = await request.json();
  const fields = [];
  const binds = [];
  if (body.garmin_workout_id !== undefined) {
    fields.push("garmin_workout_id = ?");
    binds.push(body.garmin_workout_id);
  }
  if (body.status !== undefined) {
    fields.push("status = ?");
    binds.push(body.status);
  }
  if (body.pushed_at !== undefined) {
    fields.push("pushed_at = ?");
    binds.push(body.pushed_at);
  }
  if (fields.length === 0) return json({ error: "no fields to update" }, 400, env);

  binds.push(id);
  await env.DB.prepare(`UPDATE plan_workouts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();
  return json({ ok: true }, 200, env);
}

// USDA FoodData Central nutrient IDs (standard, documented by USDA).
const USDA_NUTRIENT_IDS = { calories: 1008, protein: 1003, carbs: 1005, fat: 1004 };

async function handleFoodSearch(request, env, url) {
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, env);
  const q = url.searchParams.get("q");
  if (!q || q.trim().length < 2) return json([], 200, env);
  if (!env.USDA_API_KEY) return json({ error: "USDA_API_KEY not configured" }, 500, env);

  const usdaUrl =
    `https://api.nal.usda.gov/fdc/v1/foods/search` +
    `?api_key=${encodeURIComponent(env.USDA_API_KEY)}` +
    `&query=${encodeURIComponent(q)}&pageSize=10`;

  const res = await fetch(usdaUrl);
  if (!res.ok) return json({ error: `USDA search failed: ${res.status}` }, 502, env);
  const data = await res.json();

  const nutrientValue = (food, id) =>
    food.foodNutrients?.find((n) => n.nutrientId === id)?.value ?? null;

  const results = (data.foods || []).map((f) => ({
    fdc_id: f.fdcId,
    name: f.description,
    calories_per_100g: nutrientValue(f, USDA_NUTRIENT_IDS.calories),
    protein_g_per_100g: nutrientValue(f, USDA_NUTRIENT_IDS.protein),
    carbs_g_per_100g: nutrientValue(f, USDA_NUTRIENT_IDS.carbs),
    fat_g_per_100g: nutrientValue(f, USDA_NUTRIENT_IDS.fat),
  }));
  return json(results, 200, env);
}

async function handleNutritionLogs(request, env, url) {
  if (request.method === "GET") {
    const date = url.searchParams.get("date");
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    const clauses = [];
    const binds = [];
    if (date) {
      clauses.push("date = ?");
      binds.push(date);
    }
    if (after) {
      clauses.push("date >= ?");
      binds.push(after);
    }
    if (before) {
      clauses.push("date <= ?");
      binds.push(before);
    }
    let query = `SELECT * FROM nutrition_logs`;
    if (clauses.length) query += ` WHERE ${clauses.join(" AND ")}`;
    query += ` ORDER BY date DESC, time DESC`;
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results, 200, env);
  }

  if (request.method === "POST") {
    if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);
    const body = await request.json();
    if (!isValidDate(body.date) || !body.food_name || !body.quantity_g || body.calories == null) {
      return json({ error: "invalid nutrition log payload" }, 400, env);
    }
    const { meta } = await env.DB.prepare(
      `INSERT INTO nutrition_logs (date, time, food_name, fdc_id, quantity_g, calories, protein_g, carbs_g, fat_g)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        body.date,
        body.time ?? null,
        body.food_name,
        body.fdc_id ?? null,
        body.quantity_g,
        body.calories,
        body.protein_g ?? null,
        body.carbs_g ?? null,
        body.fat_g ?? null,
      )
      .run();
    return json({ id: meta.last_row_id }, 201, env);
  }

  return json({ error: "method not allowed" }, 405, env);
}

async function handleNutritionPlans(request, env, url) {
  if (request.method === "GET") {
    const raceId = url.searchParams.get("race_id");
    let query = `SELECT * FROM nutrition_plans`;
    const binds = [];
    if (raceId) {
      query += ` WHERE race_id = ?`;
      binds.push(raceId);
    }
    query += ` ORDER BY created_at DESC`;
    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results, 200, env);
  }

  if (request.method === "POST") {
    if (!requireAuth(request, env)) return json({ error: "unauthorized" }, 401, env);
    const body = await request.json();
    if (!body.race_id || !body.body_weight_kg) {
      return json({ error: "race_id and body_weight_kg are required" }, 400, env);
    }
    const race = await env.DB.prepare(`SELECT race_type FROM races WHERE id = ?`).bind(body.race_id).first();
    if (!race) return json({ error: "race not found" }, 404, env);

    const targets = NUTRITION_TARGETS_BY_RACE_TYPE[race.race_type];
    if (!targets) return json({ error: "unknown race_type" }, 400, env);

    const { meta } = await env.DB.prepare(
      `INSERT INTO nutrition_plans
        (race_id, body_weight_kg, carb_load_days, carb_load_g_per_kg,
         race_day_carbs_g_per_hour, race_day_fluid_ml_per_hour, race_day_sodium_mg_per_hour, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        body.race_id,
        body.body_weight_kg,
        targets.carb_load_days,
        targets.carb_load_g_per_kg,
        targets.race_day_carbs_g_per_hour,
        targets.race_day_fluid_ml_per_hour,
        targets.race_day_sodium_mg_per_hour,
        body.notes ?? null,
      )
      .run();
    return json({ id: meta.last_row_id, race_id: body.race_id, body_weight_kg: body.body_weight_kg, ...targets }, 201, env);
  }

  return json({ error: "method not allowed" }, 405, env);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/races") return await handleRaces(request, env, url);
      if (path === "/api/plans") return await handlePlans(request, env, url);
      if (path === "/api/plan-workouts") return await handlePlanWorkouts(request, env, url);
      if (path === "/api/plan-workouts/bulk") return await handlePlanWorkoutsBulk(request, env);
      if (path === "/api/food-search") return await handleFoodSearch(request, env, url);
      if (path === "/api/nutrition-logs") return await handleNutritionLogs(request, env, url);
      if (path === "/api/nutrition-plans") return await handleNutritionPlans(request, env, url);

      const workoutPatchMatch = path.match(/^\/api\/plan-workouts\/(\d+)$/);
      if (workoutPatchMatch) return await handlePlanWorkoutPatch(request, env, workoutPatchMatch[1]);

      const planPatchMatch = path.match(/^\/api\/plans\/(\d+)$/);
      if (planPatchMatch) return await handlePlanPatch(request, env, planPatchMatch[1]);

      return json({ error: "not found" }, 404, env);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500, env);
    }
  },
};
