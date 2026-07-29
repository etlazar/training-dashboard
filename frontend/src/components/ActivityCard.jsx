import RouteMap from "./RouteMap";
import {
  formatActivityDate,
  formatActivityType,
  formatDistanceKm,
  formatDuration,
  formatPaceOrSpeed,
} from "../lib/format";

export default function ActivityCard({ activity }) {
  const pace = formatPaceOrSpeed(activity.activityType, activity.averageSpeedMps);

  return (
    <div className="activity-card">
      <RouteMap route={activity.route} />
      <div className="activity-card-body">
        <div className="activity-card-header">
          <div>
            <p className="activity-card-title">
              {activity.activityName || "Untitled"}
            </p>
            <p className="activity-card-meta">
              {formatActivityType(activity.activityType)}
            </p>
          </div>
          <span className="activity-card-date">
            {formatActivityDate(activity.startTimeLocal)}
          </span>
        </div>
        <div className="activity-stat-row">
          <div className="activity-stat">
            <p className="stat-label">Distance</p>
            <p className="stat-value">
              {formatDistanceKm(activity.distanceMeters)}
            </p>
          </div>
          <div className="activity-stat">
            <p className="stat-label">Duration</p>
            <p className="stat-value">
              {formatDuration(activity.durationSeconds)}
            </p>
          </div>
          <div className="activity-stat">
            <p className="stat-label">{pace.label}</p>
            <p className="stat-value">{pace.value}</p>
          </div>
          <div className="activity-stat">
            <p className="stat-label">Avg HR</p>
            <p className="stat-value">
              {activity.averageHR != null ? Math.round(activity.averageHR) : "-"}
            </p>
          </div>
          <div className="activity-stat">
            <p className="stat-label">Elevation</p>
            <p className="stat-value">
              {activity.elevationGainMeters != null
                ? `${Math.round(activity.elevationGainMeters)} m`
                : "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
