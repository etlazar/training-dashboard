CREATE TABLE races (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD
  race_type TEXT NOT NULL CHECK (race_type IN (
    'run_5k', 'run_10k', 'run_15k', 'run_10mile', 'run_half', 'run_marathon',
    'tri_sprint', 'tri_olympic', 'tri_70_3', 'tri_full'
  )),
  priority TEXT NOT NULL DEFAULT 'A' CHECK (priority IN ('A', 'B', 'C')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id INTEGER REFERENCES races(id),
  mode TEXT NOT NULL CHECK (mode IN ('race_goal', 'mileage_progression', 'general_fitness')),
  sport_scope TEXT NOT NULL CHECK (sport_scope IN ('run', 'triathlon')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  vdot REAL,
  fthr_run REAL,   -- m/s
  fthr_bike REAL,  -- watts
  fthr_swim_pace REAL, -- m/s
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE plan_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  date TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('base', 'build', 'peak', 'taper', 'race')),
  sport TEXT NOT NULL CHECK (sport IN ('run', 'bike', 'swim', 'strength', 'brick')),
  workout_type TEXT NOT NULL CHECK (workout_type IN (
    'easy', 'long', 'tempo', 'interval', 'repetition', 'recovery',
    'race_pace', 'brick', 'rest'
  )),
  description TEXT,
  structure TEXT, -- JSON-encoded step list
  garmin_workout_id INTEGER,
  pushed_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'pushed', 'completed', 'skipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plan_workouts_plan_id ON plan_workouts(plan_id);
CREATE INDEX idx_plan_workouts_date ON plan_workouts(date);
CREATE INDEX idx_plan_workouts_status ON plan_workouts(status);
