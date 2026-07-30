CREATE TABLE nutrition_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,   -- YYYY-MM-DD
  time TEXT,            -- HH:MM, optional
  food_name TEXT NOT NULL,
  fdc_id INTEGER,        -- USDA FoodData Central id, nullable
  quantity_g REAL NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nutrition_logs_date ON nutrition_logs(date);

CREATE TABLE nutrition_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id INTEGER NOT NULL REFERENCES races(id),
  body_weight_kg REAL NOT NULL,
  carb_load_days INTEGER NOT NULL,
  carb_load_g_per_kg REAL NOT NULL,
  race_day_carbs_g_per_hour REAL NOT NULL,
  race_day_fluid_ml_per_hour REAL NOT NULL,
  race_day_sodium_mg_per_hour REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nutrition_plans_race_id ON nutrition_plans(race_id);
