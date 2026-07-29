import {
  formatActivityDate,
  formatActivityType,
  formatDistanceKm,
  formatDuration,
} from "../lib/format";

export default function ActivitiesTable({ activities }) {
  if (activities.length === 0) {
    return <p className="card-status">No activities synced yet.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="activities-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Activity</th>
            <th>Type</th>
            <th className="numeric">Distance</th>
            <th className="numeric">Duration</th>
            <th className="numeric">Avg HR</th>
            <th className="numeric">Calories</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((a) => (
            <tr key={a.activityId}>
              <td>{formatActivityDate(a.startTimeLocal)}</td>
              <td>{a.activityName || "Untitled"}</td>
              <td>{formatActivityType(a.activityType)}</td>
              <td className="numeric">{formatDistanceKm(a.distanceMeters)}</td>
              <td className="numeric">{formatDuration(a.durationSeconds)}</td>
              <td className="numeric">
                {a.averageHR != null ? Math.round(a.averageHR) : "-"}
              </td>
              <td className="numeric">
                {a.calories != null ? Math.round(a.calories) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
