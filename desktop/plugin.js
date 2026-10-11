import { Badge, Button, Codicon, host, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, Tip } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useMemo, useState } from 'react'

const ID = 'hermes-model-stats'
const ROUTE = '/model-stats'
const cx = (...v) => v.filter(Boolean).join(' ')

const fmtTokens = n => {
  n = Number(n || 0)
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return n.toLocaleString()
}

const fmtMoney = n => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNumber = n => Number(n || 0).toLocaleString()

function KpiCard({ label, value, subtext, badge, icon, accentColor }) {
  return jsxs('div', {
    className: 'flex flex-col justify-between rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/20 p-4 transition-all hover:border-(--ui-accent)/50',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between gap-2',
        children: [
          jsx('span', { className: 'text-xs font-medium text-(--ui-text-secondary)', children: label }),
          badge ? jsx('span', { className: 'rounded px-1.5 py-0.5 text-[0.625rem] font-semibold bg-(--ui-bg-muted) text-(--ui-accent)', children: badge }) : null,
          icon ? jsx(Codicon, { name: icon, className: 'text-(--ui-text-tertiary)' }) : null
        ]
      }),
      jsxs('div', {
        className: 'my-2',
        children: [
          jsx('div', { className: 'text-2xl font-bold tracking-tight', style: accentColor ? { color: accentColor } : undefined, children: value }),
          subtext ? jsx('div', { className: 'mt-1 text-xs text-(--ui-text-tertiary)', children: subtext }) : null
        ]
      })
    ]
  })
}

function VolumeHistogram({ buckets, metric, label, unit, color }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  if (!buckets || buckets.length === 0) return null

  const values = buckets.map(b => Number(b[metric] || 0))
  const maxVal = Math.max(...values, 1)
  const barWidth = 100 / buckets.length

  const hoveredBucket = hoverIdx !== null ? buckets[hoverIdx] : null

  return jsxs('div', {
    className: 'rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/15 p-3',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between border-b border-(--ui-stroke-secondary)/60 pb-2',
        children: [
          jsxs('div', {
            children: [
              jsx('div', { className: 'text-xs font-semibold tracking-tight', children: label }),
              jsx('div', {
                className: 'text-[0.6875rem] text-(--ui-text-tertiary)',
                children: hoveredBucket
                  ? `${hoveredBucket.label}: ${fmtNumber(hoveredBucket[metric])} ${unit || ''}`
                  : `Hover bar for details · Peak: ${fmtTokens(maxVal)}`
              })
            ]
          }),
          hoveredBucket ? jsx(Badge, { children: `${hoveredBucket.label}` }) : null
        ]
      }),
      jsx('div', {
        className: 'relative mt-2 h-20 w-full',
        children: jsxs('svg', {
          viewBox: '0 0 100 100',
          preserveAspectRatio: 'none',
          className: 'h-full w-full overflow-visible',
          children: [
            // Background grid lines
            [25, 50, 75].map(y => jsx('line', {
              x1: 0,
              y1: y,
              x2: 100,
              y2: y,
              stroke: 'var(--ui-stroke-secondary)',
              strokeDasharray: '2,2',
              strokeWidth: 0.5,
              opacity: 0.35
            }, y)),
            // Bars
            buckets.map((b, i) => {
              const val = Number(b[metric] || 0)
              const heightPct = Math.max(3, (val / maxVal) * 92)
              const x = i * barWidth + barWidth * 0.1
              const w = barWidth * 0.8
              const y = 100 - heightPct
              const isHovered = hoverIdx === i
              return jsx('rect', {
                x: `${x}%`,
                y: `${y}%`,
                width: `${w}%`,
                height: `${heightPct}%`,
                rx: 1,
                fill: isHovered ? 'var(--ui-accent)' : (color || 'var(--ui-accent)'),
                opacity: isHovered ? 1.0 : 0.75,
                className: 'cursor-pointer transition-all hover:opacity-100',
                onMouseEnter: () => setHoverIdx(i),
                onMouseLeave: () => setHoverIdx(null)
              }, i)
            })
          ]
        })
      }),
      jsxs('div', {
        className: 'mt-1.5 flex justify-between text-[0.625rem] font-mono text-(--ui-text-quaternary)',
        children: [
          jsx('span', { children: buckets[0]?.label || '' }),
          jsx('span', { children: buckets[Math.floor(buckets.length / 2)]?.label || '' }),
          jsx('span', { children: buckets[buckets.length - 1]?.label || '' })
        ]
      })
    ]
  })
}

function HermesModelStatsPage({ loadData }) {
  const [data, setData] = useState(null)
  const [selectedRange, setSelectedRange] = useState('24h')
  const [tab, setTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchStats = (rangeKey) => {
    setLoading(true)
    setErrorMsg('')
    Promise.resolve()
      .then(() => loadData(rangeKey))
      .then(res => {
        if (res && res.summary) {
          setData(res)
        } else if (res && res.error) {
          throw new Error(res.error)
        }
      })
      .catch(err => {
        setErrorMsg(err?.message || 'Failed to load live telemetry')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchStats(selectedRange)
  }, [selectedRange])

  const summary = data?.summary || {}
  const allRanges = data?.all_ranges_summary || {}
  const models = data?.models || []
  const providers = data?.providers || []
  const tools = data?.tools || []
  const recentLogs = data?.recent_requests || []
  const histogram = data?.histogram || []

  const filteredModels = useMemo(() => {
    if (!query) return models
    const q = query.toLowerCase()
    return models.filter(m => (m.model || '').toLowerCase().includes(q) || (m.provider || '').toLowerCase().includes(q))
  }, [models, query])

  const filteredTools = useMemo(() => {
    if (!query) return tools
    const q = query.toLowerCase()
    return tools.filter(t => (t.name || '').toLowerCase().includes(q))
  }, [tools, query])

  const filteredLogs = useMemo(() => {
    if (!query) return recentLogs
    const q = query.toLowerCase()
    return recentLogs.filter(l =>
      (l.title || '').toLowerCase().includes(q) ||
      (l.model || '').toLowerCase().includes(q) ||
      (l.provider || '').toLowerCase().includes(q) ||
      (l.task || '').toLowerCase().includes(q)
    )
  }, [recentLogs, query])

  const timeRanges = [
    { key: '1h', label: '1 Hour' },
    { key: '24h', label: '24 Hours' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: 'all', label: 'All Time' }
  ]

  const navTabs = [
    { key: 'overview', label: 'Overview', icon: 'dashboard' },
    { key: 'models', label: `Models (${models.length})`, icon: 'symbol-class' },
    { key: 'providers', label: `Providers (${providers.length})`, icon: 'server-process' },
    { key: 'tools', label: `Tools & MCP (${tools.length})`, icon: 'tools' },
    { key: 'logs', label: `Request Logs (${recentLogs.length})`, icon: 'output' }
  ]

  return jsxs('main', {
    className: 'h-full overflow-y-auto text-foreground',
    children: [
      jsxs('div', {
        className: 'mx-auto max-w-7xl space-y-6 p-4 md:p-8',
        children: [
          // Hermes Model Stats header
          jsxs('header', {
            className: 'flex flex-wrap items-center justify-between gap-4 border-b border-(--ui-stroke-secondary) pb-5',
            children: [
              jsxs('div', {
                className: 'flex items-center gap-3',
                children: [
                  jsx('div', {
                    className: 'flex h-11 w-11 items-center justify-center rounded-xl bg-(--ui-accent)/15 text-(--ui-accent) border border-(--ui-accent)/30',
                    children: jsx(Codicon, { name: 'radio-tower', className: 'text-2xl' })
                  }),
                  jsxs('div', {
                    children: [
                      jsxs('div', {
                        className: 'flex items-center gap-2',
                        children: [
                          jsx('h1', { className: 'text-2xl font-bold tracking-tight', children: 'Hermes Model Stats' }),
                          jsx(Badge, { children: 'AI Telemetry' }),
                          loading ? jsx(Codicon, { name: 'loading', className: 'animate-spin text-xs text-(--ui-accent)' }) : null
                        ]
                      }),
                      jsx('p', {
                        className: 'text-xs text-(--ui-text-secondary)',
                        children: 'Live AI request volume, token throughput, reasoning tokens, costs, and tool telemetry'
                      })
                    ]
                  })
                ]
              }),
              // Time Range Selector & Refresh
              jsxs('div', {
                className: 'flex flex-wrap items-center gap-2',
                children: [
                  jsx('div', {
                    className: 'flex rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/30 p-1',
                    children: timeRanges.map(tr => jsx('button', {
                      type: 'button',
                      onClick: () => setSelectedRange(tr.key),
                      className: cx(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                        selectedRange === tr.key
                          ? 'bg-(--ui-accent) text-white shadow-sm'
                          : 'text-(--ui-text-secondary) hover:text-foreground hover:bg-(--ui-bg-muted)'
                      ),
                      children: tr.label
                    }, tr.key))
                  }),
                  jsx(Button, {
                    size: 'sm',
                    variant: 'secondary',
                    onClick: () => fetchStats(selectedRange),
                    children: jsxs('span', {
                      className: 'flex items-center gap-1.5',
                      children: [
                        jsx(Codicon, { name: 'refresh', className: loading ? 'animate-spin' : '' }),
                        'Refresh'
                      ]
                    })
                  })
                ]
              })
            ]
          }),

          // Quick Multi-Range Horizon Ribbon
          Object.keys(allRanges).length > 0 ? jsx('div', {
            className: 'grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/10 p-3',
            children: [
              { k: '1h', l: 'Past 1 Hour' },
              { k: '24h', l: 'Past 24 Hours' },
              { k: '7d', l: 'Past 7 Days' },
              { k: '30d', l: 'Past 30 Days' }
            ].map(item => {
              const rData = allRanges[item.k] || {}
              const isSelected = selectedRange === item.k
              return jsxs('button', {
                type: 'button',
                key: item.k,
                onClick: () => setSelectedRange(item.k),
                className: cx(
                  'flex flex-col text-left rounded-lg p-2 transition-all',
                  isSelected ? 'bg-(--ui-accent)/10 border border-(--ui-accent)/40' : 'hover:bg-(--ui-bg-muted)/50'
                ),
                children: [
                  jsxs('div', {
                    className: 'flex items-center justify-between text-[0.6875rem] text-(--ui-text-tertiary)',
                    children: [
                      jsx('span', { className: 'font-medium', children: item.l }),
                      isSelected ? jsx('span', { className: 'h-1.5 w-1.5 rounded-full bg-(--ui-accent)' }) : null
                    ]
                  }),
                  jsxs('div', {
                    className: 'mt-1 flex items-baseline gap-2',
                    children: [
                      jsx('span', { className: 'font-mono text-sm font-bold', children: fmtNumber(rData.requests || 0) + ' reqs' }),
                      jsx('span', { className: 'font-mono text-xs text-(--ui-text-secondary)', children: fmtTokens(rData.total_tokens || 0) + ' tok' })
                    ]
                  }),
                  jsx('div', {
                    className: 'text-[0.625rem] text-(--ui-text-tertiary)',
                    children: `${fmtTokens(rData.cache_read_tokens || 0)} cached · $${(rData.cost || 0).toFixed(2)}`
                  })
                ]
              })
            })
          }) : null,

          // Error banner if any
          errorMsg ? jsx('div', {
            className: 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300',
            children: `Live telemetry unavailable: ${errorMsg}.`,
          }) : null,

          // KPI Metrics Grid
          jsxs('section', {
            className: 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5',
            children: [
              jsx(KpiCard, {
                label: 'AI REQUESTS',
                value: fmtNumber(summary.total_requests),
                subtext: `${fmtNumber(summary.user_prompts)} prompts · ${fmtNumber(summary.assistant_turns)} turns`,
                badge: selectedRange.toUpperCase(),
                icon: 'pulse'
              }),
              jsx(KpiCard, {
                label: 'TOTAL TOKENS',
                value: fmtTokens(summary.total_tokens),
                subtext: `${fmtTokens(summary.input_tokens)} in · ${fmtTokens(summary.output_tokens)} out`,
                badge: `${fmtTokens(summary.cache_read_tokens)} cached`,
                icon: 'symbol-keyword'
              }),
              jsx(KpiCard, {
                label: 'CACHE HIT EFFICIENCY',
                value: `${summary.cache_hit_rate || 0}%`,
                subtext: `${fmtTokens(summary.cache_read_tokens)} prompt cache read`,
                badge: 'Cost Saver',
                icon: 'zap'
              }),
              jsx(KpiCard, {
                label: 'REASONING & THINKING',
                value: fmtTokens(summary.reasoning_tokens),
                subtext: `Avg ${fmtTokens(summary.avg_tokens_per_call)} tok / request`,
                badge: 'CoT Tokens',
                icon: 'lightbulb'
              }),
              jsx(KpiCard, {
                label: 'TOOL & MCP CALLS',
                value: fmtNumber(summary.tool_calls),
                subtext: `Across ${tools.length} distinct system tools`,
                badge: `$${(summary.direct_cost || 0).toFixed(2)} spent`,
                icon: 'tools'
              })
            ]
          }),

          // Navigation Tabs & Search Toolbar (placed directly above tables/breakdowns)
          jsxs('div', {
            className: 'flex flex-wrap items-center justify-between gap-3 border-b border-(--ui-stroke-secondary) pb-3',
            children: [
              jsx('div', {
                className: 'flex flex-wrap gap-1',
                children: navTabs.map(t => jsx('button', {
                  type: 'button',
                  onClick: () => setTab(t.key),
                  className: cx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    tab === t.key
                      ? 'bg-(--ui-bg-muted) text-(--ui-accent) border border-(--ui-accent)/30'
                      : 'text-(--ui-text-secondary) hover:text-foreground hover:bg-(--ui-bg-muted)/40'
                  ),
                  children: [
                    jsx(Codicon, { name: t.icon }),
                    t.label
                  ]
                }, t.key))
              }),
              jsx('input', {
                type: 'search',
                value: query,
                onChange: e => setQuery(e.target.value),
                placeholder: `Filter ${tab}…`,
                className: 'w-full max-w-xs rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/20 px-3 py-1.5 text-xs outline-none focus:border-(--ui-accent)'
              })
            ]
          }),

          // TAB CONTENT: OVERVIEW
          tab === 'overview' ? jsxs('div', {
            className: 'grid grid-cols-1 gap-6 lg:grid-cols-2',
            children: [
              // Top Models in Overview
              jsxs('div', {
                className: 'rounded-xl border border-(--ui-stroke-secondary) p-4 space-y-3',
                children: [
                  jsxs('div', {
                    className: 'flex items-center justify-between',
                    children: [
                      jsx('h3', { className: 'text-sm font-semibold', children: 'Top Models' }),
                      jsx('button', {
                        type: 'button',
                        onClick: () => setTab('models'),
                        className: 'text-xs text-(--ui-accent) hover:underline',
                        children: 'View all →'
                      })
                    ]
                  }),
                  jsx('div', {
                    className: 'space-y-2',
                    children: models.slice(0, 5).map(m => jsxs('div', {
                      key: m.model,
                      className: 'flex items-center justify-between rounded-lg border border-(--ui-stroke-secondary)/60 p-2.5 text-xs',
                      children: [
                        jsxs('div', {
                          className: 'min-w-0 pr-2',
                          children: [
                            jsx('div', { className: 'truncate font-semibold', children: m.friendly_name }),
                            jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary)', children: m.provider })
                          ]
                        }),
                        jsxs('div', {
                          className: 'flex items-center gap-4 text-right font-mono',
                          children: [
                            jsxs('div', {
                              children: [
                                jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Calls' }),
                                jsx('div', { className: 'font-semibold', children: fmtNumber(m.calls) })
                              ]
                            }),
                            jsxs('div', {
                              children: [
                                jsx('div', { className: 'text-(--ui-text-tertiary)', children: 'Tokens' }),
                                jsx('div', { className: 'font-semibold text-(--ui-accent)', children: fmtTokens(m.total_tokens) })
                              ]
                            })
                          ]
                        })
                      ]
                    }))
                  })
                ]
              }),

              // Top Tools in Overview
              jsxs('div', {
                className: 'rounded-xl border border-(--ui-stroke-secondary) p-4 space-y-3',
                children: [
                  jsxs('div', {
                    className: 'flex items-center justify-between',
                    children: [
                      jsx('h3', { className: 'text-sm font-semibold', children: 'Top Tools & MCP' }),
                      jsx('button', {
                        type: 'button',
                        onClick: () => setTab('tools'),
                        className: 'text-xs text-(--ui-accent) hover:underline',
                        children: 'View all →'
                      })
                    ]
                  }),
                  jsx('div', {
                    className: 'space-y-2',
                    children: tools.slice(0, 5).map(t => jsxs('div', {
                      key: t.name,
                      className: 'flex items-center justify-between rounded-lg border border-(--ui-stroke-secondary)/60 p-2.5 text-xs',
                      children: [
                        jsxs('div', {
                          className: 'flex items-center gap-2',
                          children: [
                            jsx(Codicon, { name: 'terminal', className: 'text-(--ui-text-tertiary)' }),
                            jsx('span', { className: 'font-mono font-medium', children: t.name })
                          ]
                        }),
                        jsxs('div', {
                          className: 'flex items-center gap-2 font-mono',
                          children: [
                            jsx('span', { className: 'text-xs font-semibold', children: fmtNumber(t.calls) + ' calls' }),
                            jsx(Badge, { children: `${t.pct}%` })
                          ]
                        })
                      ]
                    }))
                  })
                ]
              })
            ]
          }) : null,

          // TAB CONTENT: MODELS
          tab === 'models' ? jsx('div', {
            className: 'overflow-x-auto rounded-xl border border-(--ui-stroke-secondary)',
            children: jsxs('table', {
              className: 'w-full text-left text-xs',
              children: [
                jsx('thead', {
                  className: 'border-b border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/40 text-[0.6875rem] uppercase text-(--ui-text-tertiary)',
                  children: jsxs('tr', {
                    children: [
                      jsx('th', { className: 'p-3', children: 'Model' }),
                      jsx('th', { className: 'p-3', children: 'Provider' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Calls' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Input Tokens' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Output Tokens' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Reasoning' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Cache Read' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Total Tokens' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Share' })
                    ]
                  })
                }),
                jsx('tbody', {
                  className: 'divide-y divide-(--ui-stroke-secondary)/60 font-mono',
                  children: filteredModels.map(m => jsxs('tr', {
                    key: m.model,
                    className: 'transition-colors hover:bg-(--ui-bg-muted)/30',
                    children: [
                      jsxs('td', {
                        className: 'p-3 font-sans',
                        children: [
                          jsx('div', { className: 'font-semibold text-foreground', children: m.friendly_name }),
                          jsx('div', { className: 'text-[0.625rem] text-(--ui-text-tertiary) truncate max-w-xs', children: m.model })
                        ]
                      }),
                      jsx('td', {
                        className: 'p-3 font-sans',
                        children: jsx(Badge, { children: m.provider })
                      }),
                      jsx('td', { className: 'p-3 text-right font-semibold', children: fmtNumber(m.calls) }),
                      jsx('td', { className: 'p-3 text-right text-(--ui-text-secondary)', children: fmtTokens(m.in_tokens) }),
                      jsx('td', { className: 'p-3 text-right text-(--ui-text-secondary)', children: fmtTokens(m.out_tokens) }),
                      jsx('td', { className: 'p-3 text-right text-purple-400', children: fmtTokens(m.reasoning_tokens) }),
                      jsx('td', { className: 'p-3 text-right text-emerald-400', children: fmtTokens(m.cache_read_tokens) }),
                      jsx('td', { className: 'p-3 text-right font-bold text-(--ui-accent)', children: fmtTokens(m.total_tokens) }),
                      jsx('td', { className: 'p-3 text-right font-sans', children: `${m.pct_tokens || 0}%` })
                    ]
                  }))
                })
              ]
            })
          }) : null,

          // TAB CONTENT: PROVIDERS
          tab === 'providers' ? jsx('div', {
            className: 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3',
            children: providers.map(p => jsxs('div', {
              key: p.provider,
              className: 'rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/20 p-5 space-y-3',
              children: [
                jsxs('div', {
                  className: 'flex items-center justify-between',
                  children: [
                    jsxs('div', {
                      children: [
                        jsx('h3', { className: 'font-bold text-sm', children: p.label || p.provider }),
                        jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary) font-mono', children: p.provider })
                      ]
                    }),
                    jsx(Badge, { children: `${p.pct_tokens || 0}% traffic` })
                  ]
                }),
                jsxs('div', {
                  className: 'grid grid-cols-2 gap-2 border-y border-(--ui-stroke-secondary)/60 py-3 font-mono text-xs',
                  children: [
                    jsxs('div', {
                      children: [
                        jsx('div', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: 'TOTAL TOKENS' }),
                        jsx('div', { className: 'font-bold text-(--ui-accent)', children: fmtTokens(p.total_tokens) })
                      ]
                    }),
                    jsxs('div', {
                      children: [
                        jsx('div', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: 'API CALLS' }),
                        jsx('div', { className: 'font-bold', children: fmtNumber(p.calls) })
                      ]
                    }),
                    jsxs('div', {
                      children: [
                        jsx('div', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: 'INPUT TOKENS' }),
                        jsx('div', { children: fmtTokens(p.in_tokens) })
                      ]
                    }),
                    jsxs('div', {
                      children: [
                        jsx('div', { className: 'text-[0.625rem] text-(--ui-text-tertiary)', children: 'OUTPUT TOKENS' }),
                        jsx('div', { children: fmtTokens(p.out_tokens) })
                      ]
                    })
                  ]
                }),
                jsxs('div', {
                  className: 'text-xs',
                  children: [
                    jsx('div', { className: 'text-[0.6875rem] text-(--ui-text-tertiary) mb-1', children: `Active Models (${p.models_count}):` }),
                    jsx('div', {
                      className: 'flex flex-wrap gap-1',
                      children: (p.models_list || []).map(m => jsx('span', {
                        key: m,
                        className: 'rounded bg-(--ui-bg-muted) px-2 py-0.5 text-[0.625rem] font-mono text-(--ui-text-secondary)',
                        children: m.split('/').pop()
                      }))
                    })
                  ]
                })
              ]
            }))
          }) : null,

          // TAB CONTENT: TOOLS & MCP
          tab === 'tools' ? jsx('div', {
            className: 'space-y-3',
            children: [
              jsx('div', {
                className: 'text-xs text-(--ui-text-secondary)',
                children: `Showing ${filteredTools.length} tools executed in this period.`
              }),
              jsx('div', {
                className: 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3',
                children: filteredTools.map(t => jsxs('div', {
                  key: t.name,
                  className: 'flex flex-col justify-between rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/20 p-3.5',
                  children: [
                    jsxs('div', {
                      className: 'flex items-center justify-between',
                      children: [
                        jsx('span', { className: 'font-mono text-xs font-semibold text-(--ui-accent)', children: t.name }),
                        jsx(Badge, { children: `${t.pct}%` })
                      ]
                    }),
                    jsxs('div', {
                      className: 'mt-3 flex items-baseline justify-between font-mono text-xs',
                      children: [
                        jsx('span', { className: 'text-(--ui-text-tertiary)', children: 'Executions' }),
                        jsx('span', { className: 'font-bold text-foreground', children: fmtNumber(t.calls) })
                      ]
                    }),
                    jsx('div', {
                      className: 'mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--ui-stroke-secondary)',
                      children: jsx('div', {
                        className: 'h-full bg-(--ui-accent)',
                        style: { width: `${Math.min(100, t.pct)}%` }
                      })
                    })
                  ]
                }))
              })
            ]
          }) : null,

          // TAB CONTENT: REQUEST LOGS
          tab === 'logs' ? jsx('div', {
            className: 'overflow-x-auto rounded-xl border border-(--ui-stroke-secondary)',
            children: jsxs('table', {
              className: 'w-full text-left text-xs',
              children: [
                jsx('thead', {
                  className: 'border-b border-(--ui-stroke-secondary) bg-(--ui-bg-muted)/40 text-[0.6875rem] uppercase text-(--ui-text-tertiary)',
                  children: jsxs('tr', {
                    children: [
                      jsx('th', { className: 'p-3', children: 'Time' }),
                      jsx('th', { className: 'p-3', children: 'Session / Title' }),
                      jsx('th', { className: 'p-3', children: 'Model' }),
                      jsx('th', { className: 'p-3', children: 'Provider' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Calls' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Input Tokens' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Output Tokens' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Cached Read' }),
                      jsx('th', { className: 'p-3 text-right', children: 'Cost' })
                    ]
                  })
                }),
                jsx('tbody', {
                  className: 'divide-y divide-(--ui-stroke-secondary)/60 font-mono',
                  children: filteredLogs.map((l, idx) => jsxs('tr', {
                    key: `${l.session_id}-${l.full_model}-${idx}`,
                    className: 'transition-colors hover:bg-(--ui-bg-muted)/30',
                    children: [
                      jsx('td', { className: 'p-3 text-(--ui-text-tertiary) whitespace-nowrap', children: l.time_ago }),
                      jsxs('td', {
                        className: 'p-3 font-sans min-w-[160px] max-w-xs',
                        children: [
                          jsx('div', { className: 'font-semibold text-foreground truncate', children: l.title }),
                          jsx('div', { className: 'font-mono text-[0.625rem] text-(--ui-text-tertiary) truncate', children: l.session_id })
                        ]
                      }),
                      jsx('td', {
                        className: 'p-3 font-sans',
                        children: jsx('span', { className: 'font-semibold', children: l.model })
                      }),
                      jsx('td', {
                        className: 'p-3 font-sans',
                        children: jsx(Badge, { children: l.provider })
                      }),
                      jsx('td', { className: 'p-3 text-right font-semibold', children: fmtNumber(l.calls) }),
                      jsx('td', { className: 'p-3 text-right text-(--ui-text-secondary)', children: fmtTokens(l.in_tokens) }),
                      jsx('td', { className: 'p-3 text-right text-(--ui-text-secondary)', children: fmtTokens(l.out_tokens) }),
                      jsx('td', { className: 'p-3 text-right text-emerald-400', children: fmtTokens(l.cache_read) }),
                      jsx('td', { className: 'p-3 text-right font-semibold text-(--ui-accent)', children: fmtMoney(l.cost) })
                    ]
                  }))
                })
              ]
            })
          }) : null,

          // COMPACT TIMELINE HISTOGRAMS (Placed at the bottom of the page)
          jsxs('section', {
            className: 'grid grid-cols-1 gap-3 lg:grid-cols-2 pt-2 border-t border-(--ui-stroke-secondary)/60',
            children: [
              jsx(VolumeHistogram, {
                buckets: histogram,
                metric: 'requests',
                label: `Request Volume Timeline (${selectedRange.toUpperCase()})`,
                unit: 'requests',
                color: 'var(--ui-accent)'
              }),
              jsx(VolumeHistogram, {
                buckets: histogram,
                metric: 'in_tokens',
                label: `Token Throughput Timeline (${selectedRange.toUpperCase()})`,
                unit: 'prompt tokens',
                color: '#38bdf8'
              })
            ]
          })
        ]
      })
    ]
  })
}

function ModelStatsChip({ loadSummary }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let active = true
    Promise.resolve()
      .then(() => loadSummary())
      .then(data => {
        if (active) setStats(data?.current_24h || null)
      })
      .catch(() => {})
    return () => { active = false }
  }, [loadSummary])

  return jsx(Tip, {
    label: 'Open Hermes Model Stats Dashboard',
    children: jsxs('button', {
      type: 'button',
      onClick: () => host.navigate(ROUTE),
      className: 'inline-flex h-full items-center gap-1.5 px-2 text-[0.6875rem] text-(--ui-text-secondary) hover:text-foreground hover:bg-(--ui-bg-muted) transition-colors',
      children: [
        jsx(Codicon, { name: 'graph-line', className: 'text-(--ui-accent)' }),
        jsx('span', { className: 'font-semibold', children: 'AI Stats:' }),
        jsx('span', { className: 'font-mono', children: stats ? `${fmtTokens(stats.total_tokens || 0)} tok` : 'Stats' })
      ]
    })
  })
}

export default {
  id: ID,
  name: 'Hermes Model Stats',
  description: 'Cross-provider AI requests, tokens, costs, and tool telemetry for Hermes across 1h, 24h, 7d, 30d, all-time.',
  register(ctx) {
    const loadSummary = () => ctx.rest('/summary', { timeoutMs: 30000 })

    ctx.i18n.register({
      en: {
        title: 'Hermes Model Stats',
        nav: 'Hermes Model Stats'
      }
    })

    ctx.register({
      id: 'hermes-model-stats-page',
      area: ROUTES_AREA,
      data: { path: ROUTE },
      render: () => jsx(HermesModelStatsPage, {
        loadData: (r = '24h') => ctx.rest(`/stats?range=${r}`, { timeoutMs: 30000 })
      })
    })

    ctx.register({
      id: 'hermes-model-stats-nav',
      area: SIDEBAR_NAV_AREA,
      order: 86,
      data: {
        path: ROUTE,
        label: 'Hermes Model Stats',
        codicon: 'graph-line'
      },
      render: () => null
    })

    ctx.register({
      id: 'hermes-model-stats-cmd',
      area: PALETTE_AREA,
      data: {
        id: 'open-hermes-model-stats',
        label: 'Open Hermes Model Stats',
        detail: 'View requests, tokens, histograms across 1h, 24h, 7d, 30d, all-time',
        run: () => host.navigate(ROUTE)
      }
    })

    ctx.register({
      id: 'hermes-model-stats-chip',
      area: 'statusBar.right',
      order: 145,
      render: () => jsx(ModelStatsChip, { loadSummary })
    })
  }
}
