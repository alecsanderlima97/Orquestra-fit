import fs from "node:fs/promises";

const root = "1I-slUhuIp6Bz-bZoYGLirvTnzrio73Pw";
const itemsRegex = /aria-label="([^"]+)"[\s\S]{0,2000}?data-id="([^"]+)"/g;
const decode = (value) => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");

async function crawl(folderId, category, seen) {
  if (seen.has(folderId)) return [];
  seen.add(folderId);
  const response = await fetch(`https://drive.google.com/drive/folders/${folderId}`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const source = await response.text();
  const output = [];
  for (const [, encodedLabel, id] of source.matchAll(itemsRegex)) {
    const label = decode(encodedLabel);
    if (label.includes("More actions")) continue;
    if (label.endsWith(" Shared folder")) {
      output.push(...await crawl(id, `${category}/${label.slice(0, -" Shared folder".length)}`, seen));
    } else if (label.endsWith(" Image Shared")) {
      output.push({ profile: "feminino", package: "FUNCIONAL", category, name: label.slice(0, -" Image Shared".length), driveId: id });
    }
  }
  return output;
}

const catalog = await crawl(root, "FUNCIONAL", new Set());
catalog.sort((a, b) => `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`, "pt-BR"));
await fs.writeFile("reports/catalogo-funcional-feminino.json", `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Total feminino funcional: ${catalog.length}`);
