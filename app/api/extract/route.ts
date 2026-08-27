import { extractFromUrls, parseUrlList } from "@/lib/pinterest";
import { LIMITS } from "@/lib/board";

/** Cap on URLs per request so one paste cannot fan out into hundreds of fetches. */
const MAX_URLS = 20;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const input =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).urls : undefined;

  if (typeof input !== "string" || input.trim().length === 0) {
    return Response.json({ error: "Paste at least one Pinterest URL." }, { status: 400 });
  }

  const urls = parseUrlList(input);
  if (urls.length === 0) {
    return Response.json({ error: "Paste at least one Pinterest URL." }, { status: 400 });
  }

  const warnings: string[] = [];
  const limited = urls.slice(0, MAX_URLS);
  if (urls.length > limited.length) {
    warnings.push(`Only the first ${MAX_URLS} URLs were processed.`);
  }

  const result = await extractFromUrls(limited);
  const pins = result.pins.slice(0, LIMITS.pins[1]);
  if (result.pins.length > pins.length) {
    warnings.push(`Found ${result.pins.length} images; kept the first ${pins.length}.`);
  }

  return Response.json({
    boardTitle: result.boardTitle,
    pins,
    warnings: [...result.warnings, ...warnings],
  });
}
