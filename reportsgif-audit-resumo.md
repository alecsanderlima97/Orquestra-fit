# Auditoria da biblioteca de GIFs

Gerado em 24/09/2026 a partir do catálogo versionado e dos vínculos revisados no projeto.

## Catálogo global

- 3.935 GIFs catalogados
- 1.647 masculinos
- 2.058 femininos
- 230 gerais/neutros, mantidos fora dos grupos masculino e feminino
- 1.647 arquivos masculinos presentes no pacote local; a cobertura do manifesto masculino está completa
- O catálogo feminino foi conferido contra as pastas originais compartilhadas no Google Drive e mantém os links dos arquivos-fonte para importação sob demanda

## Biblioteca-base do projeto

- 126 exercícios na lista-base
- 90 com vínculo automático revisado
- 36 sem vínculo automático, aguardando revisão

## Biblioteca atual da academia

A tela autenticada da academia mostrou 89 movimentos com GIF e 38 aguardando revisão (127 registros). Essa contagem é a referência viva do Firestore e pode diferir da lista-base porque a academia possui exercícios criados/editados separadamente.

## Arquivos

- `catalogo-gifs-completo.csv`: todos os GIFs, perfil, equipamento, grupo muscular e caminho.
- `biblioteca-exercicios-vinculos.csv`: exercícios-base e o GIF revisado ou indicação de revisão manual.

Os itens do catálogo não são gravados no Firestore automaticamente. Eles só passam a ficar disponíveis para uso quando forem escolhidos em um exercício ou importados pelo desenvolvedor no Firebase Storage.

Os CSVs são relatórios locais de conferência; eles não alteram o Firebase.
