import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { formatShortDate } from "../lib/format";

const STAGES = [
  { key: "deepHours", name: "Deep", color: "var(--series-1)" },
  { key: "lightHours", name: "Light", color: "var(--series-2)" },
  { key: "remHours", name: "REM", color: "var(--series-3)" },
  { key: "awakeHours", name: "Awake", color: "var(--series-4)" },
];

function renderLegend() {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        justifyContent: "center",
        marginTop: 8,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      {STAGES.map((s) => (
        <span
          key={s.key}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: s.color,
              display: "inline-block",
            }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export default function SleepChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={{ stroke: "var(--baseline)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}h`}
          width={36}
        />
        <Tooltip
          content={<ChartTooltip formatValue={(e) => `${e.value}h`} />}
          labelFormatter={formatShortDate}
        />
        <Legend content={renderLegend} />
        {STAGES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="sleep"
            fill={s.color}
            maxBarSize={24}
            radius={i === STAGES.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
