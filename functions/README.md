# Funções seguras de senha

Estas funções usam o Firebase Admin SDK. Elas são a única parte autorizada a
redefinir a senha de outro usuário e a marcar uma conta para troca obrigatória.

Antes de publicar, instale as dependências dentro desta pasta e confirme que o
projeto Firebase possui Cloud Functions habilitado. Em seguida, publique as
funções e as regras juntas:

```powershell
npm install
firebase deploy --only functions,firestore:rules
```

Nenhuma senha é gravada no Firestore ou nos logs de auditoria.
