# Ativação do Firebase

1. Crie o projeto Firebase do Orquestra Fit e adicione o aplicativo Web.
2. Ative Authentication com E-mail/Senha.
3. Crie um banco Firestore em produção e aplique `firestore.rules`.
4. Copie `.env.example` para `.env.local` e preencha as chaves públicas do aplicativo Web.
5. Configure `NEXT_PUBLIC_DEVELOPER_EMAIL` com o e-mail do desenvolvedor e crie esse usuário em Authentication > Users. No primeiro acesso, ele cria somente um ambiente de testes identificado.
6. Para uma academia cliente, crie outro usuário em Authentication > Users. No primeiro acesso, esse usuário cria a própria academia, sem compartilhar dados com o ambiente de testes.

Dados de cada academia devem ficar exclusivamente abaixo de `academies/{academyId}`. O perfil global `users/{uid}` serve apenas para localizar as academias das quais a pessoa participa.

Não registre fotos biométricas, vetores faciais ou credenciais de catraca no Firestore. A integração facial deve tratar somente identificadores e o status de autorização, após validação do equipamento.
