// Lazy-loads the vendored Chart.js and builds options from the theme tokens.
let loading = null;

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loading;
}

export function chartColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  const text = v('--muted');
  const grid = v('--grid');
  return {
    series: [v('--series-1'), v('--series-2'), v('--series-3'), v('--series-4')],
    accent: v('--accent'),
    text,
    grid,
    options: (extra = {}) => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: text, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: { padding: 10 },
        ...(extra.plugins || {}),
      },
      scales: {
        x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { color: grid }, ...(extra.x || {}) },
        y: { ticks: { color: text }, grid: { color: grid }, border: { display: false }, beginAtZero: extra.beginAtZero ?? false, ...(extra.y || {}) },
      },
      ...(extra.root || {}),
    }),
  };
}
