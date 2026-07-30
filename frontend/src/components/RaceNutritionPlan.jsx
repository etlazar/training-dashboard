import { useEffect, useState } from "react";
import { fetchRaces } from "../lib/planApi";
import { createNutritionPlan, fetchNutritionPlans } from "../lib/nutritionApi";

export default function RaceNutritionPlan() {
  const [races, setRaces] = useState([]);
  const [raceId, setRaceId] = useState("");
  const [bodyWeightKg, setBodyWeightKg] = useState(70);
  const [plan, setPlan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRaces()
      .then((r) => {
        setRaces(r);
        if (r.length > 0) setRaceId(String(r[0].id));
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!raceId) return;
    fetchNutritionPlans(raceId)
      .then((plans) => setPlan(plans[0] || null))
      .catch((err) => console.error(err));
  }, [raceId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await createNutritionPlan({
        race_id: Number(raceId),
        body_weight_kg: Number(bodyWeightKg),
      });
      setPlan(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (races.length === 0) {
    return (
      <p className="card-status">
        No races yet — create one from the Training Plan card first, then come back here.
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="form-row">
        <label>
          Race
          <select value={raceId} onChange={(e) => setRaceId(e.target.value)}>
            {races.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.date})
              </option>
            ))}
          </select>
        </label>
        <label>
          Body weight (kg)
          <input
            type="number"
            step="0.5"
            value={bodyWeightKg}
            onChange={(e) => setBodyWeightKg(e.target.value)}
          />
        </label>
        <button type="submit" disabled={submitting} style={{ alignSelf: "flex-end" }}>
          {submitting ? "Calculating…" : "Calculate plan"}
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}

      {plan && (
        <div className="nutrition-plan-result">
          <p className="card-status">
            General guidance from standard published sports-nutrition
            consensus — not personalized or medical advice.
          </p>
          <div className="nutrition-totals-row">
            <div className="activity-stat">
              <p className="stat-label">Carb-load</p>
              <p className="stat-value">
                {plan.carb_load_days > 0
                  ? `${plan.carb_load_days}d @ ${plan.carb_load_g_per_kg} g/kg`
                  : "Not needed"}
              </p>
            </div>
            <div className="activity-stat">
              <p className="stat-label">Race-day carbs</p>
              <p className="stat-value">{plan.race_day_carbs_g_per_hour} g/hr</p>
            </div>
            <div className="activity-stat">
              <p className="stat-label">Fluid</p>
              <p className="stat-value">{plan.race_day_fluid_ml_per_hour} ml/hr</p>
            </div>
            <div className="activity-stat">
              <p className="stat-label">Sodium</p>
              <p className="stat-value">
                {plan.race_day_sodium_mg_per_hour ? `${plan.race_day_sodium_mg_per_hour} mg/hr` : "-"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
