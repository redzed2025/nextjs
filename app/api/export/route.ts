import { InvalidBoardError, exportFilename, parseBoardSpec } from "@/lib/board";
import { buildFigmaDocument } from "@/lib/figma-doc";
import { loadImages } from "@/lib/images";
import { layoutBoard } from "@/lib/layout";
import { renderBoardSvg } from "@/lib/svg";

type Format = "svg" | "figma";

/**
 * An export downloads every pin at full resolution before it can render, which
 * takes far longer than a platform's default function timeout allows.
 */
export const maxDuration = 60;

function parseFormat(value: unknown): Format {
  return value === "figma" ? "figma" : "svg";
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  let spec;
  try {
    spec = parseBoardSpec(payload.board);
  } catch (error) {
    if (error instanceof InvalidBoardError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const format = parseFormat(payload.format);

  // Fetching first gives the layout real aspect ratios for pins whose
  // dimensions Pinterest did not report.
  const loaded = await loadImages(spec.pins);
  const layout = layoutBoard({ ...spec, pins: loaded.pins });

  if (format === "svg") {
    const dataUris = new Map(
      [...loaded.payloads].map(([url, payload]) => [url, payload.dataUri] as const),
    );
    const svg = renderBoardSvg({ ...spec, pins: loaded.pins }, layout, dataUris);

    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(spec.title, "svg")}"`,
        "x-export-warnings": String(loaded.warnings.length),
      },
    });
  }

  const base64 = new Map(
    [...loaded.payloads].map(([url, payload]) => [url, payload.base64] as const),
  );
  const document = buildFigmaDocument({ ...spec, pins: loaded.pins }, layout, base64);

  return new Response(JSON.stringify({ ...document, warnings: loaded.warnings }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFilename(spec.title, "figma.json")}"`,
      "x-export-warnings": String(loaded.warnings.length),
    },
  });
}
