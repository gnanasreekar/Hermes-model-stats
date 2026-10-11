import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

router = APIRouter()

HERMES_HOME = Path(os.environ.get('HERMES_HOME') or (Path.home() / '.hermes')).expanduser()
DB_PATH = HERMES_HOME / 'state.db'

RATES = {
    'gemini-3.5-flash-lite': (0.075, 0.30, 0.01875),
    'gemini/gemini-3.5-flash-lite': (0.075, 0.30, 0.01875),
    'gemini-3.1-flash-lite': (0.075, 0.30, 0.01875),
    'gemini/gemini-3.1-flash-lite': (0.075, 0.30, 0.01875),
    'gemini-3.8-flash': (0.15, 0.60, 0.0375),
    'google-antigravity/gemini-3.8-flash': (0.15, 0.60, 0.0375),
    'gemini-3.6-flash': (0.15, 0.60, 0.0375),
    'google-antigravity/gemini-3.6-flash': (0.15, 0.60, 0.0375),
    'gemini-3.6-flash-medium': (0.30, 1.20, 0.075),
    'gemini-3.7-flash': (0.15, 0.60, 0.0375),
    'gemini-3.1-pro': (1.25, 5.00, 0.3125),
    'google-antigravity/gemini-3.1-pro': (1.25, 5.00, 0.3125),
    'google-antigravity/claude-opus-4-6': (15.00, 75.00, 3.75),
    'cerebras/qwen-3.8-27b': (0.20, 0.60, 0.05),
    'gpt-6-luna': (2.00, 8.00, 0.50),
    'gpt-5.6-luna': (2.00, 8.00, 0.50),
}

PROVIDER_NAMES = {
    'antigravity': 'Google Antigravity',
    'gemini': 'Google Gemini API',
    'openai-codex': 'OpenAI Codex',
    'openrouter': 'OpenRouter',
    'bifrost': 'Bifrost Proxy',
    'bifrost-3.1': 'Bifrost 3.1',
    'custom': 'Custom Endpoint',
    'lms': 'LM Studio',
    'lmstudio': 'LM Studio',
    'llamacpp': 'llama.cpp',
    'moa': 'Mixture of Agents',
    'nous': 'Nous Portal',
}

def calc_cost(model_name: str, in_tok: int, out_tok: int, cache_tok: int, est_cost: float, act_cost: float):
    if act_cost > 0:
        return act_cost, act_cost
    if est_cost > 0:
        market = est_cost
    else:
        clean_model = (model_name or '').lower()
        rate = None
        for k, v in RATES.items():
            if k in clean_model:
                rate = v
                break
        if rate:
            market = ((in_tok / 1_000_000) * rate[0] +
                      (out_tok / 1_000_000) * rate[1] +
                      (cache_tok / 1_000_000) * rate[2])
        else:
            market = 0.0
    return est_cost, market

def get_db():
    return sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)

def query_telemetry(time_range: str = "24h") -> Dict[str, Any]:
    now = time.time()
    range_map = {
        "1h": 3600,
        "24h": 86400,
        "1d": 86400,
        "7d": 7 * 86400,
        "1w": 7 * 86400,
        "30d": 30 * 86400,
        "1m": 30 * 86400,
        "all": 365 * 86400,
    }
    normalized_range = "24h"
    if time_range in ["1h", "24h", "1d", "7d", "1w", "30d", "1m", "all"]:
        if time_range in ["24h", "1d"]: normalized_range = "24h"
        elif time_range in ["7d", "1w"]: normalized_range = "7d"
        elif time_range in ["30d", "1m"]: normalized_range = "30d"
        elif time_range == "1h": normalized_range = "1h"
        elif time_range == "all": normalized_range = "all"

    sec = range_map.get(normalized_range, 86400)
    cutoff = now - sec if normalized_range != "all" else 0.0

    if not DB_PATH.exists():
        return {"error": "state.db not found", "range": normalized_range}

    conn = get_db()
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # 1. Multi-range instant overview summary
    multi_ranges = {"1h": 3600, "24h": 86400, "7d": 7*86400, "30d": 30*86400, "all": 365*86400}
    all_ranges_summary = {}
    for rk, rsec in multi_ranges.items():
        rcut = now - rsec if rk != "all" else 0.0
        c.execute("""
            SELECT
                SUM(api_call_count) as reqs,
                SUM(input_tokens) as in_tok,
                SUM(output_tokens) as out_tok,
                SUM(cache_read_tokens) as cache_tok,
                SUM(reasoning_tokens) as reas_tok,
                SUM(estimated_cost_usd) as est,
                SUM(actual_cost_usd) as act,
                COUNT(DISTINCT session_id) as sess
            FROM session_model_usage
            WHERE last_seen >= ?
        """, (rcut,))
        rrow = c.fetchone()
        in_t = rrow["in_tok"] or 0
        out_t = rrow["out_tok"] or 0
        c_tok = rrow["cache_tok"] or 0
        all_ranges_summary[rk] = {
            "requests": rrow["reqs"] or 0,
            "input_tokens": in_t,
            "output_tokens": out_t,
            "total_tokens": in_t + out_t,
            "cache_read_tokens": c_tok,
            "reasoning_tokens": rrow["reas_tok"] or 0,
            "cost": round(rrow["act"] or rrow["est"] or 0.0, 4),
            "sessions": rrow["sess"] or 0,
            "cache_hit_rate": round((c_tok / max(1, in_t + c_tok)) * 100, 1)
        }

    # 2. Detailed usage in current selected range
    c.execute("""
        SELECT
            u.session_id,
            u.model,
            COALESCE(NULLIF(u.billing_provider, ""), s.billing_provider, "unknown") as provider,
            COALESCE(NULLIF(u.task, ""), "chat") as task,
            u.api_call_count,
            u.input_tokens,
            u.output_tokens,
            u.cache_read_tokens,
            u.cache_write_tokens,
            u.reasoning_tokens,
            u.estimated_cost_usd,
            u.actual_cost_usd,
            u.first_seen,
            u.last_seen,
            s.title
        FROM session_model_usage u
        LEFT JOIN sessions s ON u.session_id = s.id
        WHERE u.last_seen >= ?
        ORDER BY u.last_seen DESC
    """, (cutoff,))
    usage_rows = [dict(r) for r in c.fetchall()]

    # 3. Message activities in selected range
    c.execute("""
        SELECT
            role,
            tool_name,
            timestamp
        FROM messages
        WHERE timestamp >= ?
    """, (cutoff,))
    msg_rows = [dict(r) for r in c.fetchall()]
    conn.close()

    total_api_calls = sum(r['api_call_count'] for r in usage_rows)
    total_in_tokens = sum(r['input_tokens'] for r in usage_rows)
    total_out_tokens = sum(r['output_tokens'] for r in usage_rows)
    total_cache_read = sum(r['cache_read_tokens'] for r in usage_rows)
    total_cache_write = sum(r['cache_write_tokens'] for r in usage_rows)
    total_reasoning = sum(r['reasoning_tokens'] for r in usage_rows)
    total_est_cost = sum(r['estimated_cost_usd'] for r in usage_rows)
    total_act_cost = sum(r['actual_cost_usd'] for r in usage_rows)

    total_market_value = 0.0
    for r in usage_rows:
        _, mkt = calc_cost(r['model'], r['input_tokens'], r['output_tokens'], r['cache_read_tokens'], r['estimated_cost_usd'], r['actual_cost_usd'])
        r['market_cost'] = mkt
        total_market_value += mkt

    user_requests = sum(1 for m in msg_rows if m['role'] == 'user')
    assistant_turns = sum(1 for m in msg_rows if m['role'] == 'assistant')
    tool_calls_count = sum(1 for m in msg_rows if m['role'] == 'tool')

    # Tool breakdown
    tools_counter = {}
    for m in msg_rows:
        if m['role'] == 'tool' and m['tool_name']:
            tname = m['tool_name']
            tools_counter[tname] = tools_counter.get(tname, 0) + 1

    breakdown_by_tool = [
        {
            "name": tname,
            "calls": cnt,
            "pct": round((cnt / max(1, tool_calls_count)) * 100, 1)
        }
        for tname, cnt in sorted(tools_counter.items(), key=lambda x: x[1], reverse=True)
    ]

    # Models breakdown
    models_map = {}
    for r in usage_rows:
        mname = r['model']
        if mname not in models_map:
            friendly = mname.split('/')[-1] if '/' in mname else mname
            models_map[mname] = {
                "model": mname,
                "friendly_name": friendly,
                "provider": r['provider'],
                "calls": 0,
                "in_tokens": 0,
                "out_tokens": 0,
                "cache_read_tokens": 0,
                "reasoning_tokens": 0,
                "total_tokens": 0,
                "cost": 0.0,
                "market_cost": 0.0,
            }
        item = models_map[mname]
        item['calls'] += r['api_call_count']
        item['in_tokens'] += r['input_tokens']
        item['out_tokens'] += r['output_tokens']
        item['cache_read_tokens'] += r['cache_read_tokens']
        item['reasoning_tokens'] += r['reasoning_tokens']
        item['total_tokens'] += r['input_tokens'] + r['output_tokens']
        item['cost'] += r['actual_cost_usd'] or r['estimated_cost_usd']
        item['market_cost'] += r['market_cost']

    breakdown_by_model = sorted(models_map.values(), key=lambda x: x['total_tokens'], reverse=True)
    tot_tok = max(1, total_in_tokens + total_out_tokens)
    for m in breakdown_by_model:
        m['pct_tokens'] = round((m['total_tokens'] / tot_tok) * 100, 1)
        m['cost'] = round(m['cost'], 4)
        m['market_cost'] = round(m['market_cost'], 4)

    # Providers breakdown
    providers_map = {}
    for r in usage_rows:
        pkey = r['provider']
        if pkey not in providers_map:
            providers_map[pkey] = {
                "provider": pkey,
                "label": PROVIDER_NAMES.get(pkey, pkey.title()),
                "calls": 0,
                "in_tokens": 0,
                "out_tokens": 0,
                "cache_read_tokens": 0,
                "reasoning_tokens": 0,
                "total_tokens": 0,
                "cost": 0.0,
                "market_cost": 0.0,
                "models": set(),
            }
        pitem = providers_map[pkey]
        pitem['calls'] += r['api_call_count']
        pitem['in_tokens'] += r['input_tokens']
        pitem['out_tokens'] += r['output_tokens']
        pitem['cache_read_tokens'] += r['cache_read_tokens']
        pitem['reasoning_tokens'] += r['reasoning_tokens']
        pitem['total_tokens'] += r['input_tokens'] + r['output_tokens']
        pitem['cost'] += r['actual_cost_usd'] or r['estimated_cost_usd']
        pitem['market_cost'] += r['market_cost']
        pitem['models'].add(r['model'])

    breakdown_by_provider = []
    for p in sorted(providers_map.values(), key=lambda x: x['total_tokens'], reverse=True):
        p['models_count'] = len(p['models'])
        p['models_list'] = sorted(list(p['models']))
        del p['models']
        p['pct_tokens'] = round((p['total_tokens'] / tot_tok) * 100, 1)
        p['cost'] = round(p['cost'], 4)
        p['market_cost'] = round(p['market_cost'], 4)
        breakdown_by_provider.append(p)

    # Time series Histogram buckets
    if normalized_range == "1h":
        bucket_count = 12
        bucket_size = 300  # 5 min
    elif normalized_range == "24h":
        bucket_count = 24
        bucket_size = 3600  # 1 hour
    elif normalized_range == "7d":
        bucket_count = 14
        bucket_size = 43200  # 12 hours
    elif normalized_range == "30d":
        bucket_count = 30
        bucket_size = 86400  # 1 day
    else:  # all
        bucket_count = 30
        earliest = usage_rows[-1]['first_seen'] if usage_rows and usage_rows[-1]['first_seen'] else (now - 30 * 86400)
        bucket_size = max(86400, int((now - earliest) / 30))

    start_bucket_time = now - (bucket_count * bucket_size)
    buckets = []
    for i in range(bucket_count):
        b_start = start_bucket_time + i * bucket_size
        dt = datetime.fromtimestamp(b_start, tz=timezone.utc)
        if bucket_size < 3600:
            lbl = dt.strftime("%H:%M")
        elif bucket_size <= 86400:
            lbl = dt.strftime("%b %d %H:00") if bucket_size == 3600 else dt.strftime("%b %d")
        else:
            lbl = dt.strftime("%b %d")
        buckets.append({
            "timestamp": b_start,
            "label": lbl,
            "requests": 0,
            "in_tokens": 0,
            "out_tokens": 0,
            "cache_read_tokens": 0,
            "cost": 0.0,
            "tool_calls": 0,
        })

    for r in usage_rows:
        t = r['last_seen']
        if t and t >= start_bucket_time:
            idx = int((t - start_bucket_time) // bucket_size)
            if 0 <= idx < bucket_count:
                buckets[idx]['requests'] += r['api_call_count']
                buckets[idx]['in_tokens'] += r['input_tokens']
                buckets[idx]['out_tokens'] += r['output_tokens']
                buckets[idx]['cache_read_tokens'] += r['cache_read_tokens']
                buckets[idx]['cost'] += r['market_cost']

    for m in msg_rows:
        if m['role'] == 'tool':
            t = m['timestamp']
            if t and t >= start_bucket_time:
                idx = int((t - start_bucket_time) // bucket_size)
                if 0 <= idx < bucket_count:
                    buckets[idx]['tool_calls'] += 1

    for b in buckets:
        b['cost'] = round(b['cost'], 4)

    # Recent requests log table (up to 40)
    recent = []
    for r in usage_rows[:40]:
        diff = int(now - (r['last_seen'] or now))
        if diff < 60:
            ago = f"{diff}s ago"
        elif diff < 3600:
            ago = f"{diff // 60}m ago"
        elif diff < 86400:
            ago = f"{diff // 3600}h ago"
        else:
            ago = f"{diff // 86400}d ago"

        friendly_m = r['model'].split('/')[-1] if '/' in r['model'] else r['model']
        recent.append({
            "session_id": r['session_id'],
            "title": r['title'] or "Untitled Session",
            "model": friendly_m,
            "full_model": r['model'],
            "provider": PROVIDER_NAMES.get(r['provider'], r['provider']),
            "task": r['task'] or "chat",
            "calls": r['api_call_count'],
            "in_tokens": r['input_tokens'],
            "out_tokens": r['output_tokens'],
            "cache_read": r['cache_read_tokens'],
            "reasoning": r['reasoning_tokens'],
            "total_tokens": r['input_tokens'] + r['output_tokens'],
            "cost": round(r['actual_cost_usd'] or r['estimated_cost_usd'], 4),
            "market_cost": round(r['market_cost'], 4),
            "last_seen": r['last_seen'],
            "time_ago": ago,
        })

    cache_total = total_in_tokens + total_cache_read
    cache_hit_rate = round((total_cache_read / cache_total) * 100, 1) if cache_total > 0 else 0.0

    return {
        "range": normalized_range,
        "summary": {
            "total_requests": total_api_calls,
            "user_prompts": user_requests,
            "assistant_turns": assistant_turns,
            "tool_calls": tool_calls_count,
            "total_tokens": total_in_tokens + total_out_tokens,
            "input_tokens": total_in_tokens,
            "output_tokens": total_out_tokens,
            "cache_read_tokens": total_cache_read,
            "cache_write_tokens": total_cache_write,
            "reasoning_tokens": total_reasoning,
            "direct_cost": round(total_act_cost or total_est_cost, 4),
            "market_value": round(total_market_value, 4),
            "avg_tokens_per_call": int((total_in_tokens + total_out_tokens) / max(1, total_api_calls)),
            "cache_hit_rate": cache_hit_rate,
            "models_count": len(breakdown_by_model),
            "providers_count": len(breakdown_by_provider),
            "sessions_count": len(set(r['session_id'] for r in usage_rows)),
        },
        "all_ranges_summary": all_ranges_summary,
        "histogram": buckets,
        "models": breakdown_by_model,
        "providers": breakdown_by_provider,
        "tools": breakdown_by_tool,
        "recent_requests": recent,
        "generated_at": now
    }

@router.get('/stats')
def get_stats(range: str = Query("24h")):
    data = query_telemetry(range)
    return JSONResponse(data)

@router.get('/summary')
def get_summary():
    data = query_telemetry("24h")
    return JSONResponse({
        "all_ranges": data.get("all_ranges_summary", {}),
        "current_24h": data.get("summary", {})
    })

@router.get('/health')
def get_health():
    return JSONResponse({"status": "ok", "db_exists": DB_PATH.exists()})
