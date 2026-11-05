// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, explainUvIndex, getUvIndexHourly, getUvIndexToday } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const TOOL_INFO = [
  { name: 'get_uv_index_today', blurb: "Today's EPA UV Index forecast for a US ZIP code or city, with the EPA protection category, UV Alert flag, hourly peak and the hours when UV is 3 or higher." },
  { name: 'get_uv_index_hourly', blurb: 'Hour by hour EPA UV Index forecast in local time for a US ZIP code or city, with peak hour and protection window.' },
  { name: 'explain_uv_index', blurb: 'What a UV Index number means on the EPA scale and what sun protection EPA advises for it. Offline.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream EPA error'}: ${msg}` }] };
}

const where = {
  zip: z.string().max(10).optional().describe('US ZIP code, 5 digits, for example "33101". Use this or city plus state.'),
  city: z.string().max(60).optional().describe('US city name, for example "Phoenix". Needs state.'),
  state: z.string().max(2).optional().describe('Two-letter state code for the city, for example "AZ".'),
};

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Live US UV Index forecasts read at call time from the EPA Envirofacts UV Index service (data.epa.gov), produced daily by the National Weather Service. ' +
      'The UV Index changes every day with season, clouds and ozone; never answer today\'s UV Index from memory. Use get_uv_index_today for a ZIP code or city.',
  });

  server.registerTool('get_uv_index_today', {
    title: 'Get UV index today',
    description:
      "Today's UV Index forecast for a US ZIP code or city and state, read now from EPA (the NWS daily forecast). Returns the UV Index, the EPA category and sun protection advice, " +
      'whether a UV Alert is in effect, the hourly peak and the local hours when UV is 3 or higher. Your training data cannot know today\'s UV Index.',
    inputSchema: where,
    annotations: { title: 'UV index today', ...RO },
  }, async (a) => {
    try { return ok(await getUvIndexToday(fetchText, a) as any); } catch (e) { return fail(e); }
  });

  server.registerTool('get_uv_index_hourly', {
    title: 'Get hourly UV index forecast',
    description:
      'Hour by hour UV Index forecast for a US ZIP code or city and state, in the local time of that place, read now from EPA. Returns each hour with its EPA band, the peak hour and the window when UV is 3 or higher. ' +
      'Use it for "when is the sun strongest today" and "what time is safe to be outside" questions.',
    inputSchema: where,
    annotations: { title: 'Hourly UV index', ...RO },
  }, async (a) => {
    try { return ok(await getUvIndexHourly(fetchText, a) as any); } catch (e) { return fail(e); }
  });

  server.registerTool('explain_uv_index', {
    title: 'Explain a UV index value',
    description: 'What a UV Index number means on the EPA scale (0 to 2 Low, 3 to 7 Moderate to High, 8 and above Very High to Extreme) and the EPA sun protection advice for it, plus the NWS UV Alert rule. No network call.',
    inputSchema: { uv_index: z.number().min(0).max(25).describe('UV Index value, for example 7.') },
    annotations: { title: 'Explain UV index', ...RO, openWorldHint: false },
  }, async ({ uv_index }) => {
    try { return ok(explainUvIndex(uv_index) as any); } catch (e) { return fail(e); }
  });

  return server;
}
