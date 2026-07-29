const RACE_TYPES = new Set([
  "run_5k", "run_10k", "run_15k", "run_10mile", "run_half", "run_marathon",
  "tri_sprint", "tri_olympic", "tri_70_3", "tri_full",
]);
const PRIORITIES = new Set(["A", "B", "C"]);
const PLAN_MODES = new Set(["race_goal", "mileage_progression", "general_fitness"]);
const SPORT_SCOPES = new Set(["run", "triathlon"]);

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
