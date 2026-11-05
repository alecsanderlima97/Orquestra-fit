import assert from "node:assert/strict";
import test from "node:test";
import { buildFitPortalSnapshot } from "../lib/portal-sync.js";

const document = (id, value) => ({ id, data: () => value });

test("Portal recebe e-mail do perfil quando falta no vínculo da academia", async () => {
  const members = [
    { id: "owner", role: "admin", active: true },
    { id: "teacher", role: "teacher", active: true },
    { id: "platform", role: "admin", active: true },
  ];
  const profiles = {
    owner: { name: "Graziellen", email: "graziellen@example.test" },
    teacher: { displayName: "Vinicius", email: "vinicius@example.test" },
    platform: { email: "orquestracs@gmail.com" },
  };
  const firestore = {
    collection(path) {
      if (path === "academies") return { get: async () => ({ docs: [document("academy", { name: "Dama de Ferro", ownerId: "owner", plan: "Pró", monthlyAmount: 350 })] }) };
      if (path === "academies/academy/members") return { get: async () => ({ docs: members.map((member) => document(member.id, member)) }) };
      throw new Error(`Coleção inesperada: ${path}`);
    },
    doc(path) { return { path }; },
    async getAll(...references) {
      return references.map((reference) => ({ data: () => profiles[reference.path.slice("users/".length)] }));
    },
  };

  const result = await buildFitPortalSnapshot(firestore);
  const client = result.payload.clients[0];

  assert.equal(client.owner.email, "graziellen@example.test");
  assert.deepEqual(client.users.map((user) => user.email), ["graziellen@example.test", "vinicius@example.test"]);
  assert.equal(client.users.some((user) => user.email === "orquestracs@gmail.com"), false);
});
