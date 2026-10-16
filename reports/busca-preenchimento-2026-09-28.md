# Busca e preenchimento — 28/09/2026

Implementado:
- Busca sem acentos e sem pontuação em documentos/telefones.
- Alunos e professores: nome, e-mail, CPF e telefone.
- Estoque: nome, categoria, fornecedor, código de barras, marca, modelo e série.
- Treinos do aluno: nome, programa e letra; modelos publicados: nome/programa e aluno do modelo.
- GIFs: nome, equipamento e músculo com normalização de acentos.
- Financeiro: busca existente ampliada para valor e data formatados.
- Perfil do gestor: razão social e endereço opcional; consulta de CNPJ e CEP ao sair do campo, com botão para repetir. Preserva campos preenchidos e exige salvar o perfil.
- Máscara CNPJ aceita letras; CEP tem máscara e teclado numérico. CPF não é enviado para consulta externa.

Validação:
- Três testes de busca passaram.
- Build e TypeScript passaram.
- ViaCEP respondeu HTTP 200 ao CEP público de exemplo.
- BrasilAPI respondeu 403; substituída por Minha Receita, que respondeu HTTP 200 com razão social/endereço e CORS permitido ao CNPJ público de exemplo.
- Provedores: https://viacep.com.br/ e https://docs.minhareceita.org/.

Limites:
- Consultas externas podem falhar; preenchimento manual continua disponível.
- Não foram criados filtros de intervalo para kg/km nem alteradas prescrições de exercícios. Controles de unidades e máscaras já existentes foram mantidos.
- Não foi testado salvamento de dados reais de perfil nem alteradas regras do Firestore. A validação com conta real permanece necessária.
