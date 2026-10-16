const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const firebaseToolsRoot = "C:/Users/alecs/AppData/Roaming/npm/node_modules/firebase-tools/lib";
const auth = require(`${firebaseToolsRoot}/auth.js`);
const api = require(`${firebaseToolsRoot}/apiv2.js`);
const bucket = "orquestra-fit.firebasestorage.app";
const catalog = require("./catalogo-funcional-masculino.json");
const reviewDir = path.join(__dirname, "gif-review");

const reviewed = [
  "Bodyweight-Squat-(male)_Thighs-FRONT-POV__converted.gif",
  "Bodyweight-Forward-Lunge-(Smaller-Stance-Upright-Torso)_Thighs__converted.gif",
  "Dynamic-Chest-Stretch-(male)_Chest_converted.gif",
  "Double-Lean-Back-Quadriceps-Stretch_Thighs__converted.gif",
  "Full-Squat-Mobility_Thighs__converted.gif",
  "Stationary-Bike-Run-(version-4)_Cardio_converted.gif",
  "Walking-on-Treadmill_Cardio_converted.gif",
  "Alternate-Oblique-Crunch_Waist__converted.gif",
  "Burpee_Cardio-FIX__converted.gif",
  "Battling-Ropes_converted.gif",
  "Walking-on-Stepmill_Cardio_converted.gif",
  "Arm-Circles_Shoulders_converted.gif",
  "Ankle-Circles_Calves__converted.gif",
  "Low-Lunge-to-Hamstring-Stretch-(male)_Stretching__converted.gif",
  "Bent-Leg-Kickback-(kneeling)-(male)_Hips-FIX__converted.gif",
  "Assault-Bike-Run_Cardio__converted.gif",
  "Crouching-Heel-Back-Calf-Stretch_Calves__converted.gif",
];

async function upload(token, item) {
  const objectName = `gif-library/FUNCIONAL/${item.category}/${item.name}`;
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`;
  const existing = await fetch(metadataUrl, { headers: { authorization: `Bearer ${token}` } });
  if (existing.ok) return { status: "existing", objectName };
  if (existing.status !== 404) throw new Error(`consulta ${existing.status}: ${await existing.text()}`);

  const gif = fs.readFileSync(path.join(reviewDir, item.name));
  if (!gif.subarray(0, 6).toString("ascii").startsWith("GIF8")) throw new Error("arquivo não é GIF válido");
  const boundary = `orquestra_fit_${crypto.randomUUID()}`;
  const metadata = {
    name: objectName,
    contentType: "image/gif",
    metadata: {
      firebaseStorageDownloadTokens: crypto.randomUUID(),
      source: "orquestra-fit-reviewed-functional-library",
      originalPath: `FUNCIONAL/${item.category}/${item.name}`,
    },
  };
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: image/gif\r\n\r\n`),
    gif,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/related; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body,
  });
  if (!response.ok) throw new Error(`envio ${response.status}: ${await response.text()}`);
  return { status: "uploaded", objectName };
}

(async () => {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI sem sessão autenticada");
  api.setRefreshToken(account.tokens.refresh_token);
  const token = await api.getAccessToken();
  let uploaded = 0;
  let existing = 0;
  for (const name of reviewed) {
    const item = catalog.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`catálogo sem ${name}`);
    const result = await upload(token, item);
    if (result.status === "uploaded") uploaded += 1;
    else existing += 1;
    console.log(`${result.status === "uploaded" ? "ENVIADO" : "EXISTENTE"}: FUNCIONAL/${item.category}/${name}`);
  }
  console.log(`Concluído: ${uploaded} enviados, ${existing} existentes, 0 falhas.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
