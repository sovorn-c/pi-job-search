import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readTracker, type TrackerRow } from "./tracker.js";
import { resolveStatePath } from "./profile.js";

export type ReportStatus = "Active" | "Interview" | "Offer" | "Hired" | "Rejected/Closed";

export interface ReportRow {
  applicationKey: string;
  company: string;
  role: string;
  sector?: string;
  channel?: string;
  status: string;
  notes?: string;
  source?: string;
  url?: string;
  date?: string;
  [key: string]: string | undefined;
}

export interface ReportStats {
  total: number;
  status: Record<ReportStatus, number>;
  sectors: Record<string, number>;
  channels: Record<string, number>;
  funnel: { applied: number; interview: number; offer: number; hired: number; progressed: number };
  rejectionRate: number;
}

const STATUS_ORDER: ReportStatus[] = ["Active", "Interview", "Offer", "Hired", "Rejected/Closed"];
const COLORS: Record<ReportStatus, string> = { Active: "#3b82f6", Interview: "#f59e0b", Offer: "#8b5cf6", Hired: "#22c55e", "Rejected/Closed": "#ef4444" };

export function normalizeReportStatus(status: string): ReportStatus {
  const value = status.toLowerCase().replace(/[_\s]+/g, "-");
  if (value === "interview") return "Interview";
  if (value === "offer") return "Offer";
  if (value === "hired") return "Hired";
  if (["rejected", "no-response", "offer-declined", "interview-only", "withdrawn", "closed"].includes(value)) return "Rejected/Closed";
  return "Active";
}

export function computeReportStats(rows: ReportRow[]): ReportStats {
  const status = Object.fromEntries(STATUS_ORDER.map((key) => [key, 0])) as Record<ReportStatus, number>;
  const sectors: Record<string, number> = {};
  const channels: Record<string, number> = {};
  let interview = 0, offer = 0, hired = 0;
  for (const row of rows) {
    const bucket = normalizeReportStatus(row.status);
    status[bucket] += 1;
    if (row.sector?.trim()) sectors[row.sector.trim()] = (sectors[row.sector.trim()] ?? 0) + 1;
    if (row.channel?.trim()) channels[row.channel.trim()] = (channels[row.channel.trim()] ?? 0) + 1;
    if (["Interview", "Offer", "Hired"].includes(bucket)) interview += 1;
    if (["Offer", "Hired"].includes(bucket)) offer += 1;
    if (bucket === "Hired") hired += 1;
  }
  const resolved = rows.length - status.Active;
  return { total: rows.length, status, sectors, channels, funnel: { applied: rows.length, interview, offer, hired, progressed: interview }, rejectionRate: resolved ? Math.round((status["Rejected/Closed"] / resolved) * 100) : 0 };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function chartBars(title: string, values: Record<string, number>, color = "#3b82f6"): string {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const bars = entries.length ? entries.map(([label, value], index) => `<text x="0" y="${22 + index * 28}" class="chart-label">${escapeHtml(label)}</text><rect x="130" y="${10 + index * 28}" width="${Math.round((value / max) * 180)}" height="16" fill="${color}" rx="3"/><text x="320" y="${23 + index * 28}" class="chart-value">${value}</text>`).join("") : `<text x="0" y="24" class="chart-label">No data</text>`;
  return `<section class="chart-card"><h3>${escapeHtml(title)}</h3><svg role="img" aria-label="${escapeHtml(title)}" viewBox="0 0 350 ${Math.max(50, entries.length * 28 + 20)}">${bars}</svg></section>`;
}

function statusChart(stats: ReportStats): string {
  const total = Math.max(1, stats.total);
  let offset = 0;
  const circles = STATUS_ORDER.map((status) => {
    const length = (stats.status[status] / total) * 100;
    const circle = `<circle cx="60" cy="60" r="38" fill="none" stroke="${COLORS[status]}" stroke-width="18" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}"/>`;
    offset += length;
    return circle;
  }).join("");
  const label = STATUS_ORDER.map((status) => `${status} ${stats.status[status]}`).join(", ");
  return `<section class="chart-card"><h3>Status breakdown</h3><svg role="img" aria-label="${escapeHtml(`Status breakdown: ${label}`)}" viewBox="0 0 350 140"><g transform="rotate(-90 60 60)">${circles}</g><text x="120" y="24" class="chart-label">${escapeHtml(label)}</text></svg></section>`;
}

function tableRow(row: ReportRow): string {
  const status = normalizeReportStatus(row.status);
  const note = row.notes ?? "";
  const source = row.source ?? row.url ?? "";
  const sourceCell = /^https?:\/\//i.test(source) ? `<a href="${escapeHtml(source)}" rel="noreferrer">${escapeHtml(source)}</a>` : escapeHtml(source);
  const search = [row.company, row.role, row.sector].filter(Boolean).join(" ");
  const displayedNote = note.length > 80 ? `${note.slice(0, 77)}...` : note;
  return `<tr data-search="${escapeHtml(search)}" data-status="${escapeHtml(status)}" data-sector="${escapeHtml(row.sector ?? "")}"><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.company)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.sector)}</td><td>${escapeHtml(row.channel)}</td><td><span class="badge badge-${status.toLowerCase().replace(/[^a-z]+/g, "-")}">${escapeHtml(status)}</span></td><td title="${escapeHtml(note)}">${escapeHtml(displayedNote) || "—"}</td><td>${sourceCell || "—"}</td></tr>`;
}

export function renderDashboard(rows: ReportRow[], generatedAt = new Date().toISOString()): string {
  const stats = computeReportStats(rows);
  const sectors = Object.keys(stats.sectors).length ? stats.sectors : { "No sector": 0 };
  const channels = Object.keys(stats.channels).length ? stats.channels : { "No channel": 0 };
  const sectorOptions = Object.keys(stats.sectors).sort().map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`).join("");
  const statusCards = STATUS_ORDER.map((status) => `<div class="stat" style="border-color:${COLORS[status]}"><strong>${stats.status[status]}</strong><span>${escapeHtml(status)}</span></div>`).join("");
  const table = [...rows].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || a.company.localeCompare(b.company)).map(tableRow).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job Search Dashboard</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#172033;background:#f4f6fa}*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:1200px;margin:auto}header{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:20px}h1{margin:0;font-size:clamp(1.5rem,3vw,2.3rem)}.muted{color:#64748b}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.stat{background:#fff;border-left:4px solid;padding:16px;box-shadow:0 2px 8px #17203312}.stat strong{display:block;font-size:2rem}.stat span{color:#64748b}.charts{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:20px 0}.chart-card{background:#fff;padding:16px;box-shadow:0 2px 8px #17203312}.chart-card h3{margin:0 0 8px}.chart-card svg{width:100%;height:auto;min-height:80px}.chart-label{font-size:12px;fill:#334155}.chart-value{font-size:12px;fill:#172033}.controls{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0 10px}.controls input,.controls select{font:inherit;padding:9px;border:1px solid #cbd5e1;border-radius:6px;background:#fff}.table-wrap{overflow:auto;background:#fff}table{border-collapse:collapse;width:100%;min-width:850px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0}th{background:#eaf0f7}tbody tr:nth-child(even){background:#f8fafc}.badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:.8rem;background:#e2e8f0}.badge-active{background:#dbeafe}.badge-interview{background:#fef3c7}.badge-offer{background:#ede9fe}.badge-hired{background:#dcfce7}.badge-rejected-closed{background:#fee2e2}footer{margin-top:20px;color:#64748b;font-size:.85rem}@media(max-width:760px){body{padding:14px}.stats{grid-template-columns:repeat(2,1fr)}.charts{grid-template-columns:1fr}header{display:block}}
</style></head><body><main><header><h1>🔍 Job Search Dashboard</h1><span class="muted">Generated: ${escapeHtml(generatedAt)}</span></header><section class="stats"><div class="stat"><strong>${stats.total}</strong><span>Total</span></div>${statusCards}</section><section class="charts">${statusChart(stats)}${chartBars("By sector", sectors)}${chartBars("By channel", channels, "#8b5cf6")}${chartBars("Application funnel", { Applied: stats.funnel.applied, Interview: stats.funnel.interview, Offer: stats.funnel.offer, Hired: stats.funnel.hired }, "#22c55e")}</section><section class="controls"><input id="search" type="search" placeholder="Search company, role, sector" aria-label="Search applications"><select id="status-filter" aria-label="Filter by status"><option value="">All statuses</option>${STATUS_ORDER.map((status) => `<option>${escapeHtml(status)}</option>`).join("")}</select><select id="sector-filter" aria-label="Filter by sector"><option value="">All sectors</option>${sectorOptions}</select></section><div class="table-wrap"><table><thead><tr><th>Date</th><th>Company</th><th>Role</th><th>Sector</th><th>Channel</th><th>Status</th><th>Notes</th><th>Source</th></tr></thead><tbody id="applications">${table || `<tr><td colspan="8">No applications</td></tr>`}</tbody></table></div><footer>Generated locally · pi-job-search · ${escapeHtml(generatedAt)}</footer></main><script>window.addEventListener("DOMContentLoaded",()=>{const q=document.getElementById("search"),s=document.getElementById("status-filter"),c=document.getElementById("sector-filter");const apply=()=>{const term=q.value.toLowerCase(),status=s.value,sector=c.value;document.querySelectorAll("#applications tr[data-search]").forEach(row=>{const r=row;const match=(!term||r.dataset.search.toLowerCase().includes(term))&&(!status||r.dataset.status===status)&&(!sector||r.dataset.sector===sector);r.hidden=!match})};[q,s,c].forEach(el=>el.addEventListener("input",apply))});</script></body></html>`;
}

export async function readReportRows(cwd: string): Promise<ReportRow[]> {
  return (await readTracker(cwd)).map((row: TrackerRow) => row as ReportRow);
}

export async function generateHtmlReport(cwd: string, outputPath?: string): Promise<{ path: string; stats: ReportStats }> {
  const path = outputPath ? resolve(cwd, outputPath) : resolveStatePath(cwd, "reports/application-dashboard.html");
  const rows = await readReportRows(cwd);
  const stats = computeReportStats(rows);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, renderDashboard(rows), "utf8");
  return { path, stats };
}
