// Fixtures: EPA Envirofacts UV Index payloads saved 2026-11-05 for Miami (ZIP 33101), Washington (ZIP 20050)
// and Phoenix, AZ (city query), plus the EPA "location could not be located" error. Expected values are read
// off the saved payloads by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  resolveLocation, apiUrl, bandFor, parseEpaDate, parseEpaDateTime, parseDaily, parseHourly, summarizeHours,
  getUvIndexToday, getUvIndexHourly, explainUvIndex, InputError, UpstreamError, UTM,
} from '../dist/core.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const fake = (over = {}) => async (url) => {
  for (const [k, v] of Object.entries(over)) if (url.includes(k)) { if (v instanceof Error) throw v; return v; }
  if (url.endsWith('UVDAILY/ZIP/33101/JSON')) return fx('daily-zip-33101.json');
  if (url.endsWith('UVHOURLY/ZIP/33101/JSON')) return fx('hourly-zip-33101.json');
  if (url.endsWith('UVDAILY/ZIP/20050/JSON')) return fx('daily-zip-20050.json');
  if (url.endsWith('UVHOURLY/ZIP/20050/JSON')) return fx('hourly-zip-20050.json');
  if (url.endsWith('UVDAILY/CITY/Phoenix/STATE/AZ/JSON')) return fx('daily-city-phoenix-az.json');
  if (url.endsWith('UVHOURLY/CITY/Phoenix/STATE/AZ/JSON')) return fx('hourly-city-phoenix-az.json');
  if (url.includes('/ZIP/00000/')) return fx('error-zip-00000.json');
  throw new Error('unexpected url ' + url);
};
const loc33101 = { kind: 'zip', zip: '33101' };

test('location: ZIP, ZIP+4, city and state; bad input rejected', () => {
  assert.deepEqual(resolveLocation({ zip: '33101' }), loc33101);
  assert.deepEqual(resolveLocation({ zip: '33101-1234' }), loc33101);
  assert.deepEqual(resolveLocation({ city: 'Phoenix', state: 'az' }), { kind: 'city', city: 'Phoenix', state: 'AZ' });
  assert.throws(() => resolveLocation({ zip: '3310' }), InputError);
  assert.throws(() => resolveLocation({ city: 'Phoenix', state: 'ZZ' }), InputError);
  assert.throws(() => resolveLocation({ city: 'Phoenix' }), InputError);
});
test('API URLs match the EPA documented form', () => {
  assert.equal(apiUrl('UVDAILY', loc33101), 'https://data.epa.gov/dmapservice/getEnvirofactsUVDAILY/ZIP/33101/JSON');
  assert.equal(apiUrl('UVHOURLY', { kind: 'city', city: 'Salt Lake City', state: 'UT' }), 'https://data.epa.gov/dmapservice/getEnvirofactsUVHOURLY/CITY/Salt%20Lake%20City/STATE/UT/JSON');
});
test('EPA scale bands: 0 to 2 low, 3 to 7 moderate to high, 8 and above very high to extreme', () => {
  assert.equal(bandFor(0).band, 'low'); assert.equal(bandFor(2).band, 'low'); assert.equal(bandFor(2.9).band, 'low');
  assert.equal(bandFor(3).band, 'moderate_to_high'); assert.equal(bandFor(7).band, 'moderate_to_high');
  assert.equal(bandFor(8).band, 'very_high_to_extreme'); assert.equal(bandFor(11).band, 'very_high_to_extreme');
  assert.throws(() => bandFor(-1), InputError);
});
test('EPA dates: "Nov/05/2026" and 12-hour clock to 24-hour', () => {
  assert.equal(parseEpaDate('Nov/05/2026'), '2026-11-05');
  assert.deepEqual(parseEpaDateTime('Nov/05/2026 01 PM'), { date: '2026-11-05', hour: 13, label: '1 PM' });
  assert.equal(parseEpaDateTime('Nov/05/2026 12 PM').hour, 12);
  assert.equal(parseEpaDateTime('Jan/01/2027 12 AM').hour, 0);
  assert.throws(() => parseEpaDate('2026-11-05'), UpstreamError);
});
test('daily parse: Miami 33101 is 5 on 2026-11-05, no alert', () => {
  const d = parseDaily(fx('daily-zip-33101.json'), loc33101);
  assert.equal(d.uv_index, 5); assert.equal(d.uv_alert, false); assert.equal(d.date, '2026-11-05'); assert.equal(d.city, 'Miami');
});
test('daily parse: UV_ALERT "1" is read as an alert', () => {
  const body = JSON.stringify([{ ZIP_CODE: '85001', CITY: 'Phoenix', STATE: 'AZ', UV_INDEX: '11', UV_ALERT: '1', DATE: 'Jun/20/2026' }]);
  const d = parseDaily(body, { kind: 'zip', zip: '85001' });
  assert.equal(d.uv_alert, true); assert.equal(d.uv_index, 11); assert.equal(d.date, '2026-06-20');
});
test('hourly parse: Miami 12 hours from 7 AM, peak 6 at 1 PM, 3 or more from 10 AM to 3 PM (6 hours)', () => {
  const h = parseHourly(fx('hourly-zip-33101.json'), loc33101);
  assert.equal(h.hours.length, 12); assert.equal(h.hours[0].time, '7 AM');
  const s = summarizeHours(h.hours);
  assert.deepEqual(s.peak, { time: '1 PM', hour: 13, uv_index: 6 });
  assert.deepEqual(s.protection_window, { from: '10 AM', to: '3 PM' }); assert.equal(s.hours_at_or_above_3, 6);
});
test('hourly parse: Washington 20050 peaks at 2 and never reaches 3', () => {
  const s = summarizeHours(parseHourly(fx('hourly-zip-20050.json'), { kind: 'zip', zip: '20050' }).hours);
  assert.equal(s.peak.uv_index, 2); assert.equal(s.peak.time, '10 AM'); assert.equal(s.protection_window, null); assert.equal(s.hours_at_or_above_3, 0);
});
test('EPA error payload and empty array become a clear input error', () => {
  assert.throws(() => parseHourly(fx('error-zip-00000.json'), { kind: 'zip', zip: '00000' }), /no UV Index forecast for ZIP 00000/);
  assert.throws(() => parseDaily('[]', loc33101), InputError);
  assert.throws(() => parseDaily('<html>', loc33101), UpstreamError);
});
test('get_uv_index_today: Miami 5, Moderate to High, hourly peak 6, window, source and more links', async () => {
  const r = await getUvIndexToday(fake(), { zip: '33101' }, Date.parse('2026-11-05T15:00:00Z'));
  assert.equal(r.uv_index, 5); assert.equal(r.category, 'Moderate to High (3 to 7)'); assert.equal(r.uv_alert, false);
  assert.equal(r.hourly_peak.uv_index, 6); assert.deepEqual(r.protection_window_local, { from: '10 AM', to: '3 PM' });
  assert.equal(r.source, 'https://data.epa.gov/dmapservice/getEnvirofactsUVDAILY/ZIP/33101/JSON');
  assert.ok(r.more.includes(UTM)); assert.equal(r.as_of, '2026-11-05T15:00:00.000Z');
  assert.match(r.summary, /Miami, FL \(ZIP 33101\) on 2026-11-05 is 5/);
});
test('get_uv_index_today: hourly failure still returns the daily value with a note', async () => {
  const r = await getUvIndexToday(fake({ 'UVHOURLY/ZIP/33101': new Error('HTTP 503') }), { zip: '33101' });
  assert.equal(r.uv_index, 5); assert.equal(r.hourly_peak, null); assert.match(r.hourly_note, /HTTP 503/);
});
test('get_uv_index_hourly: Phoenix city query, peak 4 at 11 AM, 4 hours at 3 or more', async () => {
  const r = await getUvIndexHourly(fake(), { city: 'Phoenix', state: 'AZ' });
  assert.equal(r.hours.length, 10); assert.equal(r.peak.uv_index, 4); assert.equal(r.peak.time, '11 AM');
  assert.deepEqual(r.protection_window_local, { from: '11 AM', to: '2 PM' }); assert.equal(r.hours_at_or_above_3, 4);
});
test('explain_uv_index: 7 and 9', () => {
  assert.equal(explainUvIndex(7).protection, 'Protection needed');
  assert.equal(explainUvIndex(9).category, 'Very High to Extreme (8 and above)');
  assert.equal(explainUvIndex(1).band, 'low');
});
test('stdio: initialize, tools/list and an offline tools/call over JSON-RPC', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  const init = await got(1);
  assert.equal(init.result.serverInfo.name, 'uv-index-today-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  const list = await got(2);
  assert.deepEqual(list.result.tools.map((t) => t.name), ['get_uv_index_today', 'get_uv_index_hourly', 'explain_uv_index']);
  send({ id: 3, method: 'tools/call', params: { name: 'explain_uv_index', arguments: { uv_index: 8 } } });
  const call = await got(3);
  assert.equal(call.result.structuredContent.band, 'very_high_to_extreme');
  child.kill();
});
