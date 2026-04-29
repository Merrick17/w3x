import { tool } from "ai";
import { z } from "zod";
import { tavilySearch } from "@tavily/ai-sdk";

const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchUrlImpl(url: string, maxChars?: number, disableCache?: boolean) {
  const limit = maxChars || 5000;

  if (!disableCache) {
    const cached = cache.get(url);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { ...(cached.data as Record<string, unknown>), cached: true };
    }
  }

  let currentUrl = url;
  let redirectCount = 0;
  let response: Response;

  // Follow redirects manually to track the final URL
  while (true) {
    response = await fetch(currentUrl, {
      method: "GET",
      headers: { "User-Agent": "w3x-agent/2.0" },
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    if ([301, 302, 303, 307, 308].includes(response.status) && redirectCount < 5) {
      const location = response.headers.get("location");
      if (location) {
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;
        continue;
      }
    }
    break;
  }

  const html = await response.text();
  const markdown = htmlToMarkdown(html);

  const result = {
    status: response.status,
    ok: response.ok,
    finalUrl: currentUrl !== url ? currentUrl : undefined,
    redirects: redirectCount > 0 ? redirectCount : undefined,
    body: markdown.slice(0, limit),
    truncated: markdown.length > limit,
    cached: false,
  };

  // Cache successful responses
  if (response.ok) {
    cache.set(url, { data: result, ts: Date.now() });
  }

  return result;
}

export const webTools = {
  fetchUrl: tool({
    description:
      "Fetch content from a URL. Returns HTML converted to markdown text. Caches successful responses for 15 minutes.",
    inputSchema: z.object({
      url: z.string().describe("URL to fetch"),
      maxChars: z.number().optional().describe("Max response chars (default: 5000)"),
      disableCache: z.boolean().optional().describe("Bypass the 15-minute cache"),
    }),
    execute: async ({
      url,
      maxChars,
      disableCache,
    }: {
      url: string;
      maxChars?: number;
      disableCache?: boolean;
    }) => fetchUrlImpl(url, maxChars, disableCache),
  }),

  webFetch: tool({
    description:
      "Fetch content from a URL. Returns HTML converted to markdown text. Caches successful responses for 15 minutes. Follows redirects.",
    inputSchema: z.object({
      url: z.string().describe("URL to fetch"),
      maxChars: z.number().optional().describe("Max response chars (default: 5000)"),
      disableCache: z.boolean().optional().describe("Bypass the 15-minute cache"),
    }),
    execute: async ({
      url,
      maxChars,
      disableCache,
    }: {
      url: string;
      maxChars?: number;
      disableCache?: boolean;
    }) => fetchUrlImpl(url, maxChars, disableCache),
  }),

  webSearch: process.env.TAVILY_API_KEY
    ? tavilySearch()
    : tool({
        description: "Search the web. Requires TAVILY_API_KEY.",
        inputSchema: z.object({ query: z.string().describe("Search query") }),
        execute: async () => ({
          error: "Web search unavailable. Set TAVILY_API_KEY environment variable.",
        }),
      }),
};
