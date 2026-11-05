export const REPO = 'uv-index-today-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const EPA_API = 'https://data.epa.gov/dmapservice';
export const SCALE_PAGE = 'https://www.epa.gov/sunsafety/uv-index-scale-0';
export const ALERT_PAGE = 'https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/uv_alert.shtml';
export const SERVICE_PAGE = 'https://www.epa.gov/enviro/web-services#uvindex';
export class InputError extends Error {
}
export class UpstreamError extends Error {
}
export const more = () => `${SITE}/servers/?${UTM}`;
// ---------------------------------------------------------------- location
export const STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
    'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'PR', 'VI', 'GU', 'AS', 'MP',
]);
export function resolveLocation(a) {
    const zip = a.zip?.trim();
    if (zip) {
        const m = /^(\d{5})(?:-\d{4})?$/.exec(zip);
        if (!m)
            throw new InputError(`"${a.zip}" is not a US ZIP code. Use 5 digits, for example 33101.`);
        return { kind: 'zip', zip: m[1] };
    }
    const city = a.city?.trim();
    const state = a.state?.trim().toUpperCase();
    if (city && state) {
        if (!STATE_CODES.has(state))
            throw new InputError(`"${a.state}" is not a two-letter US state code. Use for example FL or AZ.`);
        if (!/^[A-Za-z .'-]{2,60}$/.test(city))
            throw new InputError(`"${a.city}" does not look like a US city name.`);
        return { kind: 'city', city, state };
    }
    throw new InputError('Give a 5-digit ZIP code, or a city plus a two-letter state code.');
}
export function apiUrl(table, loc) {
    const where = loc.kind === 'zip' ? `ZIP/${loc.zip}` : `CITY/${encodeURIComponent(loc.city)}/STATE/${loc.state}`;
    return `${EPA_API}/getEnvirofacts${table}/${where}/JSON`;
}
const describe = (loc) => (loc.kind === 'zip' ? `ZIP ${loc.zip}` : `${loc.city}, ${loc.state}`);
/** EPA UV Index scale (epa.gov/sunsafety/uv-index-scale-0), same three action bands as WHO. */
export function bandFor(uv) {
    if (!Number.isFinite(uv) || uv < 0)
        throw new InputError('UV index must be a number 0 or higher.');
    if (uv < 3)
        return { band: 'low', label: 'Low (0 to 2)', protection: 'No protection needed', advice: 'You can safely stay outside using minimal sun protection.' };
    if (uv < 8) {
        return {
            band: 'moderate_to_high', label: 'Moderate to High (3 to 7)', protection: 'Protection needed',
            advice: 'Seek shade during late morning through mid-afternoon. When outside, apply broad-spectrum SPF 15 or higher sunscreen, and wear protective clothing, a wide-brimmed hat and sunglasses.',
        };
    }
    return {
        band: 'very_high_to_extreme', label: 'Very High to Extreme (8 and above)', protection: 'Extra protection needed',
        advice: 'Be careful outside, especially from late morning through mid-afternoon. If your shadow is shorter than you, seek shade, wear protective clothing, a wide-brimmed hat and sunglasses, and apply broad-spectrum SPF 15 or higher sunscreen.',
    };
}
// ---------------------------------------------------------------- parsing
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n) => String(n).padStart(2, '0');
/** "Nov/05/2026" -> "2026-11-05" */
export function parseEpaDate(s) {
    const m = /^([A-Za-z]{3})\/(\d{2})\/(\d{4})$/.exec(s.trim());
    if (!m || !MONTHS[m[1].toUpperCase()])
        throw new UpstreamError(`unexpected EPA date "${s}"`);
    return `${m[3]}-${pad(MONTHS[m[1].toUpperCase()])}-${m[2]}`;
}
/** "Nov/05/2026 01 PM" -> { date: "2026-11-05", hour: 13, label: "1 PM" } (local time of the place). */
export function parseEpaDateTime(s) {
    const m = /^(\S+)\s+(\d{1,2})\s*(AM|PM)$/i.exec(s.trim());
    if (!m)
        throw new UpstreamError(`unexpected EPA date and time "${s}"`);
    const h12 = Number(m[2]);
    const pm = m[3].toUpperCase() === 'PM';
    const hour = (h12 % 12) + (pm ? 12 : 0);
    return { date: parseEpaDate(m[1]), hour, label: `${h12} ${pm ? 'PM' : 'AM'}` };
}
function parseJson(body, loc) {
    let j;
    try {
        j = JSON.parse(body);
    }
    catch {
        throw new UpstreamError('EPA returned a response that is not JSON');
    }
    if (j && !Array.isArray(j) && j.error) {
        throw new InputError(`EPA has no UV Index forecast for ${describe(loc)}. Check the ZIP code, or try the nearest larger city with its state code.`);
    }
    if (!Array.isArray(j) || j.length === 0) {
        throw new InputError(`EPA has no UV Index forecast for ${describe(loc)} right now. Check the ZIP code, or try the nearest larger city with its state code.`);
    }
    return j;
}
export function parseDaily(body, loc) {
    const r = parseJson(body, loc)[0];
    const uv = Number(r.UV_INDEX ?? r.UV_VALUE);
    if (!Number.isFinite(uv))
        throw new UpstreamError('EPA daily record has no UV index value');
    return {
        date: parseEpaDate(String(r.DATE)), uv_index: uv, uv_alert: String(r.UV_ALERT) === '1',
        city: r.CITY ?? null, state: r.STATE ?? null, zip: r.ZIP_CODE ?? r.ZIP ?? null,
    };
}
export function parseHourly(body, loc) {
    const rows = parseJson(body, loc).slice().sort((a, b) => Number(a.ORDER) - Number(b.ORDER));
    const hours = rows.map((r) => {
        const t = parseEpaDateTime(String(r.DATE_TIME));
        const uv = Number(r.UV_VALUE);
        return { date: t.date, hour: t.hour, time: t.label, uv_index: uv, band: bandFor(uv).band };
    });
    return { city: rows[0].CITY ?? null, state: rows[0].STATE ?? null, hours };
}
/** Peak hour and the first-to-last hour window where the forecast is 3 or more (EPA: protection needed). */
export function summarizeHours(hours) {
    if (!hours.length)
        return { peak: null, protection_window: null, hours_at_or_above_3: 0 };
    let peak = hours[0];
    for (const h of hours)
        if (h.uv_index > peak.uv_index)
            peak = h;
    const over = hours.filter((h) => h.uv_index >= 3);
    return {
        peak: { time: peak.time, hour: peak.hour, uv_index: peak.uv_index },
        protection_window: over.length ? { from: over[0].time, to: over.at(-1).time } : null,
        hours_at_or_above_3: over.length,
    };
}
// ---------------------------------------------------------------- tools
const place = (city, state, loc) => city && state ? `${city}, ${state}${loc.kind === 'zip' ? ` (ZIP ${loc.zip})` : ''}` : describe(loc);
export async function getUvIndexToday(fetchText, a, nowMs = Date.now()) {
    const loc = resolveLocation(a);
    const dailyUrl = apiUrl('UVDAILY', loc);
    const hourlyUrl = apiUrl('UVHOURLY', loc);
    const d = parseDaily(await fetchText(dailyUrl, { cacheTtl: 1800 }), loc);
    let hourly = null;
    let hourlyNote = null;
    try {
        hourly = parseHourly(await fetchText(hourlyUrl, { cacheTtl: 1800 }), loc);
    }
    catch (e) {
        hourlyNote = `Hourly forecast unavailable: ${e.message}`;
    }
    const hours = hourly ? hourly.hours.filter((h) => h.date === d.date) : [];
    const s = summarizeHours(hours);
    const b = bandFor(d.uv_index);
    const where = place(d.city, d.state, loc);
    const parts = [
        `EPA UV Index forecast for ${where} on ${d.date} is ${d.uv_index}, ${b.label}. ${b.protection}.`,
        s.peak ? `The hourly forecast peaks at ${s.peak.uv_index} at ${s.peak.time} local time${s.protection_window ? `, and is 3 or higher from ${s.protection_window.from} to ${s.protection_window.to}` : ', and stays below 3 all day'}.` : '',
        d.uv_alert ? 'A UV Alert is in effect, meaning UV is forecast to be unusually high for this place and time of year.' : 'No UV Alert is in effect.',
    ].filter(Boolean);
    return {
        summary: parts.join(' '),
        location: { query: describe(loc), city: d.city, state: d.state, zip: d.zip },
        date: d.date,
        uv_index: d.uv_index,
        category: b.label,
        protection: b.protection,
        advice: b.advice,
        uv_alert: d.uv_alert,
        hourly_peak: s.peak,
        protection_window_local: s.protection_window,
        hours_at_or_above_3: s.hours_at_or_above_3,
        hourly_note: hourlyNote,
        as_of: new Date(nowMs).toISOString(),
        source: dailyUrl,
        scale_source: SCALE_PAGE,
        more: more(),
    };
}
export async function getUvIndexHourly(fetchText, a, nowMs = Date.now()) {
    const loc = resolveLocation(a);
    const url = apiUrl('UVHOURLY', loc);
    const h = parseHourly(await fetchText(url, { cacheTtl: 1800 }), loc);
    const s = summarizeHours(h.hours);
    const where = place(h.city, h.state, loc);
    const date = h.hours[0]?.date ?? null;
    return {
        summary: `Hourly EPA UV Index forecast for ${where} on ${date}, ${h.hours.length} hours in local time. ` +
            (s.peak ? `Peak ${s.peak.uv_index} at ${s.peak.time}. ` : '') +
            (s.protection_window ? `UV is 3 or higher, where EPA says protection is needed, from ${s.protection_window.from} to ${s.protection_window.to}.` : 'UV stays below 3 all day.'),
        location: { query: describe(loc), city: h.city, state: h.state },
        date,
        hours: h.hours,
        peak: s.peak,
        protection_window_local: s.protection_window,
        hours_at_or_above_3: s.hours_at_or_above_3,
        as_of: new Date(nowMs).toISOString(),
        source: url,
        scale_source: SCALE_PAGE,
        more: more(),
    };
}
export function explainUvIndex(uv) {
    const b = bandFor(uv);
    return {
        summary: `A UV Index of ${uv} is ${b.label} on the EPA scale. ${b.protection}. ${b.advice}`,
        uv_index: uv,
        category: b.label,
        band: b.band,
        protection: b.protection,
        advice: b.advice,
        scale: [
            { range: '0 to 2', label: 'Low', protection: 'No protection needed' },
            { range: '3 to 7', label: 'Moderate to High', protection: 'Protection needed' },
            { range: '8 and above', label: 'Very High to Extreme', protection: 'Extra protection needed' },
        ],
        uv_alert_rule: 'NWS and EPA issue a UV Alert when the forecast is 6 or more and more than one standard deviation above the normal UV Index for that place and day.',
        as_of: '2026-11-05',
        source: SCALE_PAGE,
        alert_source: ALERT_PAGE,
        more: more(),
    };
}
