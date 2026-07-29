import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTooltip from "./ChartTooltip";
import { formatShortDate } from "../lib/format";

export default function StepsChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--gridline)"
          strokeDasharray="0"
        />
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
          tickFormatter={(v) => v.toLocaleString()}
          width={48}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatValue={(e) => `${e.value.toLocaleString()} steps`}
            />
          }
          labelFormatter={formatShortDate}
        />
        <Line
          type="monotone"
          dataKey="totalSteps"
          name="Steps"
          stroke="var(--series-1)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
