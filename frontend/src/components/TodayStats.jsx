import { formatShortDate } from "../lib/format";

export default function TodayStats({ dailySummary, sleep }) {
  const latestDaily = dailySummary[dailySummary.length - 1];
  const latestSleep = sleep[sleep.length - 1];

  if (!latestDaily && !latestSleep) {
    return <p className="card-status">No recent data synced yet.</p>;
  }

  const sleepTotalHours = latestSleep
    ? latestSleep.deepHours + latestSleep.lightHours + latestSleep.remHours + latestSleep.awakeHours
    : null;

  return (
    <div className="stat-tile-row">
      <div className="stat-tile">
        <p className="stat-label">
          Steps {latestDaily ? `(${formatShortDate(latestDaily.date)})` : ""}
        </p>
        <p className="stat-value">{latestDaily?.totalSteps?.toLocaleString() ?? "-"}</p>
        {latestDaily?.dailyStepGoal && (
          <p className="stat-delta">of {latestDaily.dailyStepGoal.toLocaleString()} goal</p>
        )}
      </div>
      <div className="stat-tile">
        <p className="stat-label">Resting HR</p>
        <p className="stat-value">
          {latestDaily?.restingHeartRate != null ? `${latestDaily.restingHeartRate} bpm` : "-"}
        </p>
      </div>
      <div className="stat-tile">
        <p className="stat-label">Sleep last night</p>
        <p className="stat-value">{sleepTotalHours != null ? `${sleepTotalHours.toFixed(1)}h` : "-"}</p>
        {latestSleep?.overallSleepScore != null && (
          <p className="stat-delta">Score {latestSleep.overallSleepScore}</p>
        )}
      </div>
      <div className="stat-tile">
        <p className="stat-label">Calories</p>
        <p className="stat-value">
          {latestDaily?.totalKilocalories != null ? Math.round(latestDaily.totalKilocalories) : "-"}
        </p>
      </div>
    </div>
  );
}
