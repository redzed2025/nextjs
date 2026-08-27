import { fetchImage } from "@/lib/images";
import { UnsafeUrlError } from "@/lib/net";

/**
 * Proxies Pinterest images for the in-browser preview. Pinterest's CDN is
 * inconsistent about hotlinking, so serving through the same guarded fetch the
 * exporter uses keeps the preview and the export consistent. Defaults to the
 * `preview` size tier; pass `quality=full` for the export-resolution bytes.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = params.get("url");
  if (!target) {
    return Response.json({ error: "Missing ?url." }, { status: 400 });
  }
  const quality = params.get("quality") === "full" ? "full" : "preview";

  try {
    const image = await fetchImage(target, quality);
    return new Response(image.bytes as BodyInit, {
      headers: {
        "content-type": image.contentType,
        "content-length": String(image.bytes.byteLength),
        "cache-control": "public, max-age=86400, immutable",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not fetch the image." },
      { status: 502 },
    );
  }
}
