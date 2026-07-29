import ActivityCard from "./ActivityCard";

export default function ActivityFeed({ activities }) {
  if (activities.length === 0) {
    return <p className="card-status">No activities synced yet.</p>;
  }

  return (
    <div className="activity-feed">
      {activities.map((a) => (
        <ActivityCard key={a.activityId} activity={a} />
      ))}
    </div>
  );
}
