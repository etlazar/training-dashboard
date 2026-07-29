import { useEffect, useState } from "react";
import TrainingPlanIntake from "./TrainingPlanIntake";
import TrainingPlanView from "./TrainingPlanView";
import { fetchPlanWorkouts, fetchPlans } from "../lib/planApi";

export default function TrainingPlanCard() {
  const [status, setStatus] = useState("loading"); // loading | no-plan | has-plan | error
  const [workouts, setWorkouts] = useState([]);
  const [showIntake, setShowIntake] = useState(false);

  async function load() {
    setStatus("loading");
    try {
      const [active, draft] = await Promise.all([fetchPlans("active"), fetchPlans("draft")]);
      const plans = [...active, ...draft].sort((a, b) => b.id - a.id);
      if (plans.length === 0) {
        setStatus("no-plan");
        return;
      }
      const latest = plans[0];
      const planWorkouts = await fetchPlanWorkouts(latest.id);
      setWorkouts(planWorkouts);
      setStatus(planWorkouts.length > 0 ? "has-plan" : "pending-generation");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (status === "loading") return <p className="card-status">Loading…</p>;

  if (status === "error") {
    return (
      <p className="card-status">
        Couldn't reach the training-plan API. Make sure the backend is deployed and{" "}
        <code>VITE_PLAN_API_BASE</code> is set correctly.
      </p>
    );
  }

  if (status === "pending-generation") {
    return <p className="card-status">Plan created — workouts generate on the next scheduled run.</p>;
  }

  if (status === "has-plan") {
    return <TrainingPlanView workouts={workouts} />;
  }

  // no-plan
  if (!showIntake) {
    return (
      <div>
        <p className="card-status">No active training plan yet.</p>
        <button type="button" onClick={() => setShowIntake(true)}>
          Create a plan
        </button>
      </div>
    );
  }

  return <TrainingPlanIntake onPlanCreated={() => load()} />;
}
