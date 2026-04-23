export type ChartTheme = {
  text: string;
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  palette: string[];
  buckets: {
    current: string;
    d1_30: string;
    d31_60: string;
    d61_90: string;
    d90p: string;
  };
};

const lightTheme: ChartTheme = {
  text: '#0f172a',
  axis: '#64748b',
  grid: '#e2e8f0',
  tooltipBg: '#ffffff',
  tooltipBorder: '#cbd5e1',
  palette: ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#a855f7'],
  buckets: {
    current: '#22c55e',
    d1_30: '#f59e0b',
    d31_60: '#fb923c',
    d61_90: '#f97316',
    d90p: '#ef4444',
  },
};

const darkTheme: ChartTheme = {
  text: '#e2e8f0',
  axis: '#94a3b8',
  grid: '#334155',
  tooltipBg: '#0f172a',
  tooltipBorder: '#334155',
  palette: ['#818cf8', '#34d399', '#fbbf24', '#fb7185', '#38bdf8', '#c084fc'],
  buckets: {
    current: '#4ade80',
    d1_30: '#fbbf24',
    d31_60: '#fb923c',
    d61_90: '#f97316',
    d90p: '#f87171',
  },
};

export function getChartTheme(): ChartTheme {
  if (typeof document === 'undefined') return lightTheme;
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? darkTheme : lightTheme;
}
