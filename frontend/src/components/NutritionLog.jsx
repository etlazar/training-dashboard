function sum(entries, key) {
  return entries.reduce((s, e) => s + (e[key] || 0), 0);
}

export default function NutritionLog({ entries }) {
  if (entries.length === 0) {
    return <p className="card-status">No food logged today yet.</p>;
  }

  const totals = {
    calories: sum(entries, "calories"),
    protein_g: sum(entries, "protein_g"),
    carbs_g: sum(entries, "carbs_g"),
    fat_g: sum(entries, "fat_g"),
  };

  return (
    <div className="nutrition-log">
      <div className="nutrition-totals-row">
        <div className="activity-stat">
          <p className="stat-label">Calories</p>
          <p className="stat-value">{Math.round(totals.calories)}</p>
        </div>
        <div className="activity-stat">
          <p className="stat-label">Protein</p>
          <p className="stat-value">{Math.round(totals.protein_g)} g</p>
        </div>
        <div className="activity-stat">
          <p className="stat-label">Carbs</p>
          <p className="stat-value">{Math.round(totals.carbs_g)} g</p>
        </div>
        <div className="activity-stat">
          <p className="stat-label">Fat</p>
          <p className="stat-value">{Math.round(totals.fat_g)} g</p>
        </div>
      </div>
      <ul className="nutrition-entries">
        {entries.map((e) => (
          <li key={e.id} className="nutrition-entry-row">
            <span className="nutrition-entry-time">{e.time || ""}</span>
            <span className="nutrition-entry-name">
              {e.food_name} <span className="card-status">({e.quantity_g}g)</span>
            </span>
            <span className="nutrition-entry-cal">{Math.round(e.calories)} kcal</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
