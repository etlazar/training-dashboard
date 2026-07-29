-- Raw intake inputs the Python generator needs to compute VDOT / zones and
-- volume progression. Nullable — only used transiently while a plan is in
-- 'draft' status; the generator reads these once, computes vdot/fthr_* on
-- the plan row, and flips status to 'active'.
ALTER TABLE plans ADD COLUMN recent_race_distance_m REAL;
ALTER TABLE plans ADD COLUMN recent_race_time_s REAL;
ALTER TABLE plans ADD COLUMN current_weekly_km REAL;
ALTER TABLE plans ADD COLUMN bike_test_avg_power REAL;      -- watts, 20-min test
ALTER TABLE plans ADD COLUMN bike_test_avg_speed_mps REAL;  -- fallback if no power meter
ALTER TABLE plans ADD COLUMN run_test_avg_pace_mps REAL;    -- 20-min test, triathlon FTPa
ALTER TABLE plans ADD COLUMN swim_test_pace_mps REAL;       -- 1000m time trial
