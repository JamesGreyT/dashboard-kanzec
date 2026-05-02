import Plot from 'react-plotly.js'
import type { Layout, Config, Data } from 'plotly.js'
import { useTheme } from '@/context/ThemeContext'

interface Props {
  data: Data[]
  layout?: Partial<Layout>
  config?: Partial<Config>
  className?: string
  /** Override the theme detection from `useTheme()`. */
  dark?: boolean
}

const TOKENS = {
  light: {
    bg: '#FAF8F5',       // page canvas
    paper: '#FFFFFF',    // chart paper
    font: '#2C2418',
    grid: '#E6DFD3',
    hoverBg: '#FFFFFF',
    hoverBorder: '#D4A843',
    hoverFont: '#2C2418',
  },
  dark: {
    bg: '#0F0F17',
    paper: '#111118',
    font: '#E8E4DD',
    grid: '#1E1E2E',
    hoverBg: '#1A1A28',
    hoverBorder: '#D4A843',
    hoverFont: '#E8E4DD',
  },
} as const

export const ALMANAC_PALETTE = {
  light: ['#B8922E', '#1E8A5E', '#5B5FD6', '#C94E8A', '#2A8EC5'],
  dark: ['#D4A843', '#34D399', '#818CF8', '#F472B6', '#38BDF8'],
} as const

/**
 * Almanac-themed wrapper around react-plotly.js. All charts use:
 *  - warm-paper background in light mode, near-black violet in dark
 *  - DM Sans 11px body font
 *  - gold (#D4A843) hover-label border
 *  - hairline grid in --color-border
 *
 * Layout overrides merge over the base, but `paper_bgcolor` / `plot_bgcolor`
 * / `font` always win — chart-by-chart background overrides break the page
 * unity.
 */
export default function PlotlyChart({ data, layout = {}, config = {}, className = '', dark }: Props) {
  const ctx = useTheme()
  const isDark = dark ?? ctx.isDark
  const t = TOKENS[isDark ? 'dark' : 'light']

  const baseLayout: Partial<Layout> = {
    ...layout,
    paper_bgcolor: t.paper,
    plot_bgcolor: t.bg,
    font: { color: t.font, family: "'DM Sans', system-ui, sans-serif", size: 11 },
    margin: { t: 24, r: 12, b: 40, l: 56, ...(layout.margin ?? {}) },
    xaxis: {
      gridcolor: t.grid,
      zerolinecolor: t.grid,
      linecolor: t.grid,
      color: t.font,
      gridwidth: 1,
      automargin: true,
      ...(layout.xaxis ?? {}),
    },
    yaxis: {
      gridcolor: t.grid,
      zerolinecolor: t.grid,
      linecolor: t.grid,
      color: t.font,
      gridwidth: 1,
      automargin: true,
      ...(layout.yaxis ?? {}),
    },
    legend: {
      bgcolor: 'transparent',
      font: { color: t.font, size: 10 },
      ...(layout.legend ?? {}),
    },
    hoverlabel: {
      bgcolor: t.hoverBg,
      bordercolor: t.hoverBorder,
      font: { family: "'DM Sans', system-ui", color: t.hoverFont, size: 12 },
      ...(layout.hoverlabel ?? {}),
    },
  }

  return (
    <Plot
      data={data}
      layout={baseLayout}
      config={{
        responsive: true,
        displayModeBar: false,
        scrollZoom: false,
        ...config,
      }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
      className={className}
    />
  )
}
