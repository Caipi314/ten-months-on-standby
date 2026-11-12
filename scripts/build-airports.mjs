import fs from 'node:fs';
const [,, src, out] = process.argv;
const text = fs.readFileSync(src, 'utf8');
function parseLine(line) {
  const r = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { r.push(cur); cur = ''; } else cur += c;
  }
  r.push(cur); return r;
}
const lines = text.split('\n').filter(Boolean);
const h = parseLine(lines[0]); const ix = (k) => h.indexOf(k);
const rank = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const best = new Map();
for (const l of lines.slice(1)) {
  const f = parseLine(l);
  const iata = f[ix('iata_code')]; const type = f[ix('type')];
  if (!/^[A-Z]{3}$/.test(iata) || !rank[type]) continue;
  const sched = f[ix('scheduled_service')] === 'yes';
  if (!sched && type === 'small_airport') continue;
  const score = rank[type] * 2 + (sched ? 1 : 0);
  const row = [iata, f[ix('icao_code')] || f[ix('gps_code')] || '', f[ix('name')], f[ix('municipality')], f[ix('iso_country')], +(+f[ix('latitude_deg')]).toFixed(4), +(+f[ix('longitude_deg')]).toFixed(4), rank[type]];
  const prev = best.get(iata);
  if (!prev || prev.score < score) best.set(iata, { score, row });
}
const rows = [...best.values()].map(v => v.row).sort((a, b) => b[7] - a[7] || a[0].localeCompare(b[0]));
fs.writeFileSync(out, JSON.stringify(rows));
console.log(rows.length, 'airports');
