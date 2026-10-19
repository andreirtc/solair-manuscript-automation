import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIPv4 } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "../../../packages/contracts/index.ts";
import { AppError } from "./errors.ts";
import { Store, id, now } from "./store.ts";
import { extractDocument, readableText } from "./attachments.ts";
import { imageInfo } from "./images.ts";
import { sourceHash } from "./source-snapshots.ts";
import { httpsPublicUrl } from "./workbench.ts";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["192.88.99.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
export const publicAddress = (address: string) =>
  isIPv4(address) && !blocked.check(address, "ipv4");
export interface PublicDownload {
  bytes: Buffer;
  url: string;
  mime: string;
}
type Resolver = (
  host: string,
) => Promise<{ address: string; family: number }[]>;
const resolveHost: Resolver = (host) => lookup(host, { all: true, family: 4 });

/** No cookies, auth, arbitrary headers or proxy credentials. Pin a validated public IPv4 per hop. */
export async function publicDownload(
  url: string,
  maxBytes = 10 * 1024 * 1024,
  resolver = resolveHost,
): Promise<PublicDownload> {
  let next = httpsPublicUrl(url);
  const deadline = Date.now() + 25000;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const u = new URL(next);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      resolver(u.hostname),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppError(
                "SOURCE_DOWNLOAD_TIMEOUT",
                "The public source took too long to resolve. Upload a downloaded copy instead.",
                504,
              ),
            ),
          Math.max(1, deadline - Date.now()),
        );
      }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new AppError(
        "PRIVATE_SOURCE_ADDRESS",
        "That source resolves to a private/reserved address. Use a public publisher page or upload a copy.",
      );
    const address = addresses[0].address;
    const result = await new Promise<{
      status: number;
      location?: string;
      mime: string;
      bytes: Buffer;
    }>((resolve, reject) => {
      const req = request(
        u,
        {
          method: "GET",
          agent: false,
          family: 4,
          lookup: (_host, _options, callback) => callback(null, address, 4),
          headers: {
            "User-Agent": "SOLAIR-Source-Reader/1.0",
            Accept:
              "text/html,application/pdf,image/png,image/jpeg,text/plain;q=0.8",
            "Accept-Encoding": "identity",
          },
        },
        (res) => {
          const status = res.statusCode || 0,
            mime = String(res.headers["content-type"] || "")
              .split(";")[0]
              .trim()
              .toLowerCase();
          if ([301, 302, 303, 307, 308].includes(status)) {
            res.resume();
            resolve({
              status,
              location: res.headers.location,
              mime,
              bytes: Buffer.alloc(0),
            });
            return;
          }
          if (status !== 200) {
            res.resume();
            reject(
              new AppError(
                "SOURCE_DOWNLOAD_FAILED",
                `The public source returned HTTP ${status}. Download it manually and upload a copy.`,
                502,
              ),
            );
            return;
          }
          if (
            Number(res.headers["content-length"]) > maxBytes ||
            ![undefined, "identity"].includes(
              res.headers["content-encoding"] as any,
            )
          ) {
            res.destroy();
            reject(
              new AppError(
                "SOURCE_DOWNLOAD_LIMIT",
                "The public source is too large or uses an unsupported transfer encoding. Upload a smaller exported copy.",
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on("data", (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
              res.destroy(
                new AppError(
                  "SOURCE_DOWNLOAD_LIMIT",
                  "The public source exceeded the download limit. Upload a smaller copy.",
                ),
              );
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          res.on("error", reject);
          res.on("aborted", () =>
            reject(
              new AppError(
                "SOURCE_DOWNLOAD_FAILED",
                "The public source disconnected. Upload a copy or retry later.",
                502,
              ),
            ),
          );
          res.on("end", () =>
            resolve({ status, mime, bytes: Buffer.concat(chunks) }),
          );
        },
      );
      const timeout = setTimeout(
        () =>
          req.destroy(
            new AppError(
              "SOURCE_DOWNLOAD_TIMEOUT",
              "The public source took too long. Upload a downloaded copy instead.",
              504,
            ),
          ),
        Math.max(1, deadline - Date.now()),
      );
      req.on("close", () => clearTimeout(timeout));
      req.on("error", (e) =>
        reject(
          e instanceof AppError
            ? e
            : new AppError(
                "SOURCE_DOWNLOAD_FAILED",
                "The public source could not be downloaded. Upload a downloaded copy instead.",
                502,
              ),
        ),
      );
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.location || redirects === 3)
        throw new AppError(
          "SOURCE_REDIRECT_LIMIT",
          "The source has too many redirects. Use its final public publisher address.",
        );
      next = httpsPublicUrl(new URL(result.location, u).href);
      continue;
    }
    return { bytes: result.bytes, url: u.href, mime: result.mime };
  }
  throw new AppError(
    "SOURCE_DOWNLOAD_FAILED",
    "Could not download the public source.",
  );
}
const entities = (s: string) =>
  s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (v) => {
    const known: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&nbsp;": " ",
    };
    if (known[v]) return known[v];
    const n = v.startsWith("&#x")
      ? parseInt(v.slice(3, -1), 16)
      : parseInt(v.slice(2, -1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff
      ? String.fromCodePoint(n)
      : v;
  });
export function publicPage(html: string, base: string) {
  const title = entities(
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ||
      new URL(base).hostname,
  )
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, 200);
  const links = new Set<string>();
  for (const m of html.matchAll(
    /\b(?:src|href|data-src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
  )) {
    for (const value of entities(m[1] || m[2])
      .split(/,\s*/)
      .map((v) => v.trim().split(/\s+/)[0])) {
      try {
        links.add(httpsPublicUrl(new URL(value, base).href));
      } catch {}
    }
  }
  const text = entities(
    html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[^]*?-->/g, "")
      .replace(/<(?:\/p|\/div|\/li|\/tr|\/h[1-6]|br\s*\/?)[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[\t ]+/g, " ")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text, links };
}

export async function importPublicSource(
  store: Store,
  input: {
    pageUrl: string;
    imageUrl?: string;
    description?: string;
    locator?: string;
    attribution?: string;
    reuse?: string;
  },
  download = publicDownload,
): Promise<Source> {
  const page = await download(httpsPublicUrl(input.pageUrl)),
    pageIsHTML = /^(text\/html|application\/xhtml\+xml)$/.test(page.mime),
    parsed = pageIsHTML
      ? publicPage(page.bytes.toString("utf8"), page.url)
      : undefined;
  let asset = page;
  if (input.imageUrl) {
    const imageUrl = httpsPublicUrl(input.imageUrl);
    if (!parsed?.links.has(imageUrl))
      throw new AppError(
        "FIGURE_NOT_IN_SOURCE",
        "The image URL is not linked from the downloaded original page. Use the exact original image or extract/upload the cited PDF figure; nothing was imported.",
      );
    asset = await download(imageUrl);
  }
  let image: Source["image"];
  try {
    image = imageInfo(asset.bytes);
  } catch {
    throw new AppError(
      "INVALID_IMAGE",
      "Use a PNG/JPEG figure below 25 megapixels.",
    );
  }
  if (input.imageUrl && !image)
    throw new AppError(
      "UNSUPPORTED_SOURCE_FIGURE",
      "That link is not an original PNG/JPEG. Download/export the actual source figure and upload it; no image will be generated.",
    );
  let text = "",
    notice = "";
  if (!image) {
    if (asset.bytes.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
      const prepared = await extractDocument(asset.bytes, "pdf");
      text = prepared.text;
      notice = prepared.notice;
    } else if (parsed) {
      text = readableText(Buffer.from(parsed.text));
      notice =
        "Downloaded public-page text snapshot. Script-rendered content, images, equations and page layout are not inspected. Review the original alongside this text.";
    } else if (/^text\//.test(asset.mime)) {
      text = readableText(asset.bytes);
      notice =
        "Downloaded public UTF-8 text snapshot; no scientific validation.";
    } else
      throw new AppError(
        "UNSUPPORTED_PUBLIC_SOURCE",
        "Import a public HTML/PDF/text source or its original PNG/JPEG figure. Upload other file formats instead.",
      );
  }
  const sid = id(),
    createdAt = now(),
    dir = join(store.dir, "sources"),
    bytes = image ? asset.bytes : Buffer.from(text);
  const source: Source = {
    id: sid,
    name:
      (
        parsed?.title ||
        decodeURIComponent(
          new URL(page.url).pathname.split("/").pop() || "Public source",
        )
      ).slice(0, 180) + (image ? " — figure" : ""),
    origin: "upload",
    mime: image?.mime || "text/plain",
    image,
    preparedKind: image ? "image" : "text",
    preparedAt: createdAt,
    sha256: sourceHash(bytes),
    size: bytes.length,
    uploadSha256: sourceHash(asset.bytes),
    originalSize: asset.bytes.length,
    evidenceReviewed: false,
    status: "needs_mapping",
    createdAt,
    uploadedBy: store.actor(),
    description: input.description,
    extractionNotice: image
      ? "Original downloaded source bytes. The AI has not inspected the pixels; confirm the figure meaning, citation and reuse terms before review."
      : notice,
    provenance: {
      kind: "public_source",
      pageUrl: page.url,
      assetUrl: image ? asset.url : undefined,
      pageSha256: sourceHash(page.bytes),
      title: parsed?.title,
      locator: input.locator,
      attribution: input.attribution,
      reuse:
        input.reuse ||
        "Unknown — check publisher licence or permission before reproduction.",
      retrievedAt: createdAt,
    },
  };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(
      dir,
      sid + (image ? (image.mime === "image/png" ? ".png" : ".jpg") : ""),
    ),
    bytes,
    { mode: 0o600 },
  );
  writeFileSync(join(dir, sid + ".original"), asset.bytes, { mode: 0o600 });
  writeFileSync(join(dir, sid + ".source-page"), page.bytes, { mode: 0o600 });
  store.put("source", source);
  store.activity(
    "public_source_imported",
    `Saved ${source.name} with original-source provenance. Review is pending.`,
  );
  return source;
}
