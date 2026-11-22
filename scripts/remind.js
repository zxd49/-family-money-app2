// 超24小时未审批自动提醒（GitHub Actions 每小时运行）
// 读 Supabase money_apps，筛 status=pending 且 created_ts 超24小时的记录，
// Bark 提醒审批方，并把 reminded 置 true 避免每小时重复轰炸。
const SUPABASE_URL = "https://gqvybdpgrfudiyvfqohr.supabase.co";
const SUPABASE_KEY = "sb_publishable_TefJ6DXfsTaZDByxIv5Fmw_wTFPdjE9";
const TABLE = "money_apps";
const BARK_WIFE = "aawoZvMBUWvPZKyiWZ3bD3"; // 老婆手机（审批方）
const THRESHOLD_MS = 24 * 60 * 60 * 1000;

function parseCnTime(s) {
  if (!s) return NaN;
  const m = String(s).match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[ \t]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(+y, +mo - 1, +d, +h, +mi, +(se || 0)).getTime();
}

async function bark(key, title, body) {
  const r = await fetch(`https://api.day.app/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, group: "经费审批" }),
  });
  console.log(`[BARK] ${title} -> HTTP ${r.status}`);
}

async function markReminded(id) {
  const h = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`, {
    method: "PATCH", headers: h, body: JSON.stringify({ reminded: true }),
  });
}

async function main() {
  const h = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=id,amount,category,note,status,created_at,created_ts,reminded`, { headers: h });
  if (!r.ok) throw new Error("GET " + r.status);
  const rows = await r.json();
  const now = Date.now();
  const pending = rows.filter(x => x.status === "pending");
  console.log(`共 ${rows.length} 条，待审批 ${pending.length} 条`);

  for (const x of pending) {
    if (x.reminded === true) continue;
    let ts = Number(x.created_ts);
    if (!ts || isNaN(ts)) ts = parseCnTime(x.created_at);
    if (isNaN(ts)) { console.log(`跳过 id=${x.id} 时间无法解析: ${x.created_at}`); continue; }
    if (now - ts < THRESHOLD_MS) continue;
    await bark(
      BARK_WIFE,
      "经费申请待审批（超24小时）",
      `用途：${x.category}\n金额：¥${Number(x.amount).toFixed(2)}\n事由：${x.note || "（未填写）"}\n已等待超过24小时，请尽快审批`
    );
    await markReminded(x.id);
  }
  console.log("done");
}

main().catch(e => { console.error(e); process.exit(1); });
