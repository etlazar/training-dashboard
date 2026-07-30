import { useEffect, useState } from "react";
import FoodLogForm from "./FoodLogForm";
import NutritionLog from "./NutritionLog";
import RaceNutritionPlan from "./RaceNutritionPlan";
import { fetchNutritionLogs } from "../lib/nutritionApi";

export default function NutritionCard() {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState("loading");

  function load() {
    const today = new Date().toISOString().slice(0, 10);
    fetchNutritionLogs(today)
      .then((data) => {
        setEntries(data);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="nutrition-card">
      <h3 className="plan-week-header">Today's Log</h3>
      {status === "error" ? (
        <p className="card-status">Couldn't reach the training-plan API.</p>
      ) : (
        <>
          <FoodLogForm onLogged={load} />
          {status === "ready" && <NutritionLog entries={entries} />}
        </>
      )}

      <h3 className="plan-week-header" style={{ marginTop: 16 }}>
        Race Nutrition Plan
      </h3>
      <RaceNutritionPlan />
    </div>
  );
}
