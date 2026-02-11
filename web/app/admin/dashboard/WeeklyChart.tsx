'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface WeeklyChartProps {
  data: Array<{ day: string; scripts: number; posted: number }>;
}

export default function WeeklyChart({ data }: WeeklyChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="day"
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={{ stroke: '#3f3f46' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#71717a', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#a1a1aa' }}
        />
        <Line
          type="monotone"
          dataKey="scripts"
          stroke="#2dd4bf"
          strokeWidth={2}
          dot={{ r: 3, fill: '#2dd4bf' }}
          name="Created"
        />
        <Line
          type="monotone"
          dataKey="posted"
          stroke="#34d399"
          strokeWidth={2}
          dot={{ r: 3, fill: '#34d399' }}
          name="Posted"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
