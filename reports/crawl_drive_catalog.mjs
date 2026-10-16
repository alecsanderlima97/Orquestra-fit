import fs from "node:fs/promises";

const roots = {
  ISOMETRIA: "1Kz50ngbToVCIhi2Ls2N9LjkIbGDB8NSpD",
  PAREDE: "1UG_22hlNqIZvC0K6PXY79abBSyM3Lx7S",
  PESO: "1bc9D_zg2dSCRmSQ_LLG9Qti4Ip2CtCdg",
  STEPS: "1dNyc7WgheoTfEaw7QLiDBQHaa1LePGY-",
  ALAVANCA: "1mgYcH7Y4SuESHHyjgXdA9iF5KhYkFOqo",
  "TRAÇÃO": "1NdcfzLqkVCIhi2Ls2N9LjkIbGDB8NSpD",
};

const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");

async function crawl(folderId, category, seen) {
  if (seen.has(folderId)) return [];
  seen.add(folderId);
  const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const source = await response.text();
  const items = [...source.matchAll(/<div class="rxUYqf"[^>]*aria-label="([^"]+)"[\s\S]*?data-id="([^"]+)"/g)];
  const output = [];
  for (const [, encodedLabel, itemId] of items) {
    const label = decode(encodedLabel);
    if (label.endsWith(" Folder Shared")) {
      const child = label.slice(0, -" Folder Shared".length);
      output.push(...await crawl(itemId, `${category}/${child}`, seen));
    } else if (label.endsWith(" Image Shared")) {
      output.push({
        profile: "masculino",
        package: "FUNCIONAL",
        category,
        name: label.slice(0, -" Image Shared".length),
        driveId: itemId,
      });
    }
  }
  return output;
}

const catalogPath = new URL("./catalogo-funcional-masculino.json", import.meta.url);
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const known = new Set(catalog.map((item) => item.driveId));
const seen = new Set();

for (const [category, folderId] of Object.entries(roots)) {
  try {
    const additions = await crawl(folderId, category, seen);
    const before = catalog.length;
    for (const item of additions) {
      if (!known.has(item.driveId)) {
        catalog.push(item);
        known.add(item.driveId);
      }
    }
    console.log(`${category}: +${catalog.length - before}`);
  } catch (error) {
    console.error(`${category}: erro: ${error.message}`);
  }
}

catalog.sort((a, b) => `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`, "pt-BR"));
await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Total: ${catalog.length}`);
