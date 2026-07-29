export default function Card({ title, wide = false, children }) {
  return (
    <div className={`card${wide ? " card-wide" : ""}`}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
