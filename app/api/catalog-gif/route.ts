import femaleCatalog from "@/public/gif-catalog-feminine.json";

type CatalogGif = {
  id: string;
  url: string;
};

const catalogById = new Map((femaleCatalog as CatalogGif[]).map((item) => [item.id, item]));

/**
 * Entrega somente GIFs conhecidos do catálogo feminino pelo mesmo domínio do
 * Orquestra Fit. Isso evita o bloqueio de imagem que alguns navegadores fazem
 * com o endereço de download do Google Drive, sem transformar a rota em proxy
 * aberto nem duplicar todo o acervo no Storage antes de ele ser utilizado.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const item = catalogById.get(id);

  if (!item) return new Response("GIF não encontrado.", { status: 404 });

  try {
    const upstream = await fetch(item.url, {
      headers: { Accept: "image/gif,image/*;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      cache: "force-cache",
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    const contentLength = Number(upstream.headers.get("content-length") ?? 0);

    if (!upstream.ok || !upstream.body || !contentType.toLocaleLowerCase().includes("image/gif") || contentLength > 25 * 1024 * 1024) {
      return new Response("A fonte deste GIF não está disponível.", { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    });
  } catch {
    return new Response("Não foi possível carregar este GIF.", { status: 502 });
  }
}
