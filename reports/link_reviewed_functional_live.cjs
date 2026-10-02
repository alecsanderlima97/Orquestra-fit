const fs = require("node:fs");
const path = require("node:path");
const base = "C:/Users/alecs/AppData/Roaming/npm/node_modules/firebase-tools/lib";
const auth = require(`${base}/auth.js`);
const api = require(`${base}/apiv2.js`);

const project = "orquestra-fit";
const bucket = "orquestra-fit.firebasestorage.app";
const academyId = "RtfBsasHQA6NM0ttC6AO";
const reviewed = {
  "agachamento com peso corporal": "FUNCIONAL/PESO CORPORAL/PERNA/Bodyweight-Squat-(male)_Thighs-FRONT-POV__converted.gif",
  "avanco com peso corporal": "FUNCIONAL/PESO CORPORAL/PERNA/Bodyweight-Forward-Lunge-(Smaller-Stance-Upright-Torso)_Thighs__converted.gif",
  "alongamento de peitoral": "FUNCIONAL/ALONGAMENTO/Dynamic-Chest-Stretch-(male)_Chest_converted.gif",
  "alongamento de quadriceps": "FUNCIONAL/ALONGAMENTO/Double-Lean-Back-Quadriceps-Stretch_Thighs__converted.gif",
  "mobilidade de quadril": "FUNCIONAL/MOBILIDADE/QUADRIL/Full-Squat-Mobility_Thighs__converted.gif",
  "bicicleta ergometrica": "FUNCIONAL/CARDIO/Stationary-Bike-Run-(version-4)_Cardio_converted.gif",
  "esteira": "FUNCIONAL/CARDIO/Walking-on-Treadmill_Cardio_converted.gif",
  "abdominal obliquo": "FUNCIONAL/ABDOMINAIS/Alternate-Oblique-Crunch_Waist__converted.gif",
  "burpee": "FUNCIONAL/PESO CORPORAL/BURPEE/Burpee_Cardio-FIX__converted.gif",
  "corda naval": "FUNCIONAL/CORDA NAVAL/Battling-Ropes_converted.gif",
  "escada ergometrica": "FUNCIONAL/CARDIO/Walking-on-Stepmill_Cardio_converted.gif",
  "mobilidade de ombros": "FUNCIONAL/MOBILIDADE/OMBRO/Arm-Circles_Shoulders_converted.gif",
  "mobilidade de tornozelo": "FUNCIONAL/MOBILIDADE/TORNOZELO/Ankle-Circles_Calves__converted.gif",
  "alongamento de posteriores": "FUNCIONAL/MOBILIDADE/QUADRIL/Low-Lunge-to-Hamstring-Stretch-(male)_Stretching__converted.gif",
  "alongamento de panturrilha": "FUNCIONAL/ALONGAMENTO/Crouching-Heel-Back-Calf-Stretch_Calves__converted.gif",
  "gluteo quatro apoios": "FUNCIONAL/PESO CORPORAL/PERNA/Bent-Leg-Kickback-(kneeling)-(male)_Hips-FIX__converted.gif",
  "air bike": "FUNCIONAL/CARDIO/Assault-Bike-Run_Cardio__converted.gif",
};

const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const field = (document, key) => document.fields?.[key]?.stringValue || "";

(async () => {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("Firebase CLI sem sessão autenticada");
  api.setRefreshToken(account.tokens.refresh_token);
  const token = await api.getAccessToken();
  const headers = { authorization: `Bearer ${token}` };
  const listUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/academies/${academyId}/exercises?pageSize=1000`;
  const listResponse = await fetch(listUrl, { headers });
  if (!listResponse.ok) throw new Error(`Firestore ${listResponse.status}: ${await listResponse.text()}`);
  const documents = (await listResponse.json()).documents || [];
  const backups = path.join(__dirname, "live-backups", `functional-links-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(backups, { recursive: true });
  let linked = 0;
  let already = 0;
  let absent = 0;
  for (const [exerciseKey, relativePath] of Object.entries(reviewed)) {
    const document = documents.find((candidate) => normalize(field(candidate, "name")) === exerciseKey);
    if (!document) { absent += 1; console.log(`AUSENTE: ${exerciseKey}`); continue; }
    if (field(document, "gifMaleUrl") || field(document, "gifUrl")) { already += 1; console.log(`JÁ VINCULADO: ${field(document, "name")}`); continue; }
    const objectName = `gif-library/${relativePath}`;
    const encodedObject = encodeURIComponent(objectName);
    const metadataResponse = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedObject}`, { headers });
    if (!metadataResponse.ok) throw new Error(`Storage sem ${relativePath}`);
    const metadata = await metadataResponse.json();
    const downloadToken = metadata.metadata?.firebaseStorageDownloadTokens;
    if (!downloadToken) throw new Error(`Storage sem token de download: ${relativePath}`);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedObject}?alt=media&token=${downloadToken}`;
    const id = document.name.split("/").pop();
    fs.writeFileSync(path.join(backups, `${id}.json`), JSON.stringify(document, null, 2));
    const masks = ["gifUrl", "gifPath", "gifMaleUrl", "gifMalePath", "gifLinkedFrom", "updatedAt", "updatedBy"];
    const patchUrl = `${document.name.replace("projects/", "https://firestore.googleapis.com/v1/projects/")}?${masks.map((name) => `updateMask.fieldPaths=${encodeURIComponent(name)}`).join("&")}`;
    const body = { fields: {
      gifUrl: { stringValue: downloadUrl },
      gifPath: { stringValue: objectName },
      gifMaleUrl: { stringValue: downloadUrl },
      gifMalePath: { stringValue: objectName },
      gifLinkedFrom: { stringValue: "global-library-reviewed" },
      updatedAt: { timestampValue: new Date().toISOString() },
      updatedBy: { stringValue: "orquestracs-development" },
    }};
    const patchResponse = await fetch(patchUrl, { method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!patchResponse.ok) throw new Error(`Falha ao vincular ${exerciseKey}: ${patchResponse.status} ${await patchResponse.text()}`);
    linked += 1;
    console.log(`VINCULADO: ${field(document, "name")}`);
  }
  console.log(`Concluído: ${linked} vinculados, ${already} já vinculados, ${absent} ausentes. Backup: ${backups}`);
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
