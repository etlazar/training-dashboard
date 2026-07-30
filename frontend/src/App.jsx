import { useEffect, useState } from "react";
import Card from "./components/Card";
import StepsChart from "./components/StepsChart";
import RestingHRChart from "./components/RestingHRChart";
import SleepChart from "./components/SleepChart";
import ActivityFeed from "./components/ActivityFeed";
import WeeklyStats from "./components/WeeklyStats";
import TodayStats from "./components/TodayStats";
import TrainingPlanCard from "./components/TrainingPlanCard";
import NutritionCard from "./components/NutritionCard";
import { fetchActivities, fetchDailySummary, fetchSleep } from "./lib/api";
import { secondsToHoursNumber } from "./lib/format";

const TABS = [
  { id: "today", label: "Today" },
  { id: "history", label: "History" },
  { id: "activities", label: "Activities" },
];

function App() {
  const [dailySummary, setDailySummary] = useState([]);
  const [sleep, setSleep] = useState([]);
  const [activities, setActivities] = useState([]);
  const [status, setStatus] = useState("loading");
  const [activeTab, setActiveTab] = useState("today");

  useEffect(() => {
    Promise.all([fetchDailySummary(), fetchSleep(), fetchActivities()])
      .then(([daily, sleepData, activityData]) => {
        setDailySummary(daily);
        setSleep(
          sleepData.map((n) => ({
            date: n.date,
            deepHours: secondsToHoursNumber(n.deepSleepSeconds),
            lightHours: secondsToHoursNumber(n.lightSleepSeconds),
            remHours: secondsToHoursNumber(n.remSleepSeconds),
            awakeHours: secondsToHoursNumber(n.awakeSleepSeconds),
            overallSleepScore: n.overallSleepScore,
          })),
        );
        setActivities(activityData);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
  }, []);

  return (
    <>
      <header className="dashboard-header">
        <h1>Training Dashboard</h1>
        <p>Synced from Garmin Connect</p>
      </header>

      {status === "loading" && <p className="card-status">Loading data…</p>}
      {status === "error" && (
        <p className="card-status">
          Couldn't load data. Make sure /data/*.json has been synced (see
          README).
        </p>
      )}

      {status === "ready" && (
        <>
          <nav className="tab-nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab-button${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {activeTab === "today" && (
            <>
              <TodayStats dailySummary={dailySummary} sleep={sleep} />
              <WeeklyStats activities={activities} />
              <div className="dashboard-grid">
                <Card title="Training Plan" wide>
                  <TrainingPlanCard />
                </Card>
                <Card title="Nutrition" wide>
                  <NutritionCard />
                </Card>
              </div>
            </>
          )}

          {activeTab === "history" && (
            <div className="dashboard-grid">
              <Card title="Steps">
                <StepsChart data={dailySummary} />
              </Card>
              <Card title="Resting Heart Rate">
                <RestingHRChart data={dailySummary} />
              </Card>
              <Card title="Sleep Stages" wide>
                <SleepChart data={sleep} />
              </Card>
            </div>
          )}

          {activeTab === "activities" && (
            <div className="dashboard-grid">
              <Card title="Recent Activities" wide>
                <ActivityFeed activities={activities} />
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default App;
