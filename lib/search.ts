export function normalizeSearch(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function matchesSearch(query: string, ...values: unknown[]): boolean {
  const text = values.map(normalizeSearch).join(" ");
  const compact = values.map((value) => normalizeSearch(value).replace(/[^a-z0-9]/g, ""));
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every((term) =>
    text.includes(term) || (/[0-9]/.test(term) && compact.some((value) => value.includes(term.replace(/[^a-z0-9]/g, ""))))
  );
}
