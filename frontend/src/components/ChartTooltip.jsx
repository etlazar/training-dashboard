export default function ChartTooltip({ active, payload, label, formatValue }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((entry) => (
        <div className="tooltip-row" key={entry.dataKey}>
          <span
            className="tooltip-swatch"
            style={{ background: entry.color }}
          />
          <span>
            {entry.name}: {formatValue ? formatValue(entry) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
