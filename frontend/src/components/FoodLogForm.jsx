import { useEffect, useRef, useState } from "react";
import { createNutritionLog, searchFood } from "../lib/nutritionApi";

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function scale(perHundred, quantityG) {
  if (perHundred == null) return null;
  return Math.round(((perHundred * quantityG) / 100) * 10) / 10;
}

export default function FoodLogForm({ onLogged }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [quantityG, setQuantityG] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const hits = await searchFood(query.trim());
        setResults(hits);
      } catch (err) {
        console.error(err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await createNutritionLog({
        date: new Date().toISOString().slice(0, 10),
        time: nowHHMM(),
        food_name: selected.name,
        fdc_id: selected.fdc_id,
        quantity_g: Number(quantityG),
        calories: scale(selected.calories_per_100g, quantityG) ?? 0,
        protein_g: scale(selected.protein_g_per_100g, quantityG),
        carbs_g: scale(selected.carbs_g_per_100g, quantityG),
        fat_g: scale(selected.fat_g_per_100g, quantityG),
      });
      setQuery("");
      setResults([]);
      setSelected(null);
      setQuantityG(100);
      onLogged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="food-log-form">
      <input
        type="text"
        placeholder="Search a food (e.g. banana, chicken breast)…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
      />
      {searching && <p className="card-status">Searching…</p>}
      {!selected && results.length > 0 && (
        <ul className="food-search-results">
          {results.map((r) => (
            <li key={r.fdc_id}>
              <button type="button" onClick={() => setSelected(r)}>
                {r.name}
                <span className="food-result-cal">
                  {r.calories_per_100g != null ? `${Math.round(r.calories_per_100g)} kcal/100g` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="food-selected-row">
          <span>{selected.name}</span>
          <label>
            grams
            <input
              type="number"
              min="1"
              value={quantityG}
              onChange={(e) => setQuantityG(e.target.value)}
              style={{ width: 70 }}
            />
          </label>
          <span className="card-status">
            {scale(selected.calories_per_100g, quantityG) ?? "-"} kcal
          </span>
          <button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add"}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
