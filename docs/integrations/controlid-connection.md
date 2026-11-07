# Conexão Control iD — Orquestra Fit

## Perfil descoberto

- Equipamento: Control iD iDFace
- Firmware observado: `8.2.6`
- Endereço local observado: `http://192.168.1.201`
- Porta web: `80`
- Estado da rede: painel web acessível e autenticado
- Estado da integração: **preparada, ainda não ativada para autorização de entrada**

O endereço `192.168.1.201` é privado da rede da academia. Ele não pode ser acessado diretamente pela Vercel. O computador que ficará ligado à catraca deverá executar o gateway local da integração e estar na mesma rede do equipamento.

## O que já foi validado

1. O computador alcança a catraca pela rede local.
2. A interface web Control iD responde na porta 80.
3. O painel autenticado exibe o dispositivo como iDFace.
4. O relatório de acessos foi consultado sem alterar configurações.

## O que ainda não foi ativado

- Não há sincronização de alunos com usuários/faces da catraca.
- Não há autorização de entrada baseada em mensalidade ou limite semanal.
- Não há comando de abertura enviado pelo Orquestra Fit.
- O modo Standalone/Online não foi alterado.

## Preparação no computador dedicado

Use o arquivo `config/controlid-device.template.json` como referência para criar a configuração local do gateway. O arquivo local deve conter somente o endereço e as opções do equipamento. Usuário e senha devem ser fornecidos por variáveis protegidas do computador, nunca commitados no GitHub, Firestore ou frontend.

Variáveis esperadas para o gateway futuro:

```text
CONTROLID_DEVICE_URL=http://192.168.1.201
CONTROLID_DEVICE_PORT=80
CONTROLID_DEVICE_MODE=unknown
CONTROLID_DEVICE_LOGIN=(somente no computador local)
CONTROLID_DEVICE_PASSWORD=(somente no computador local)
```

## Teste rápido no computador conectado

Depois de copiar o projeto e configurar o perfil local, execute:

```powershell
npm run controlid:check
```

Esse comando somente verifica se o equipamento responde e se a interface é Control iD. Para consultar informações autenticadas do dispositivo, informe as credenciais apenas na sessão local do computador e execute:

```powershell
npm run controlid:info
```

Para vincular este computador à academia, abra **Configurações → Conexão com a
catraca** no Orquestra Fit, gere o código temporário e execute no computador
local:

```powershell
npm run controlid:pair
```

O código expira em 15 minutos, é de uso único e não é salvo no repositório. O
pareamento registra somente a academia, o gateway e o endereço privado do
equipamento; a senha permanece no computador local. Nenhum comando de abertura,
bloqueio, cadastro facial ou mudança de modo é habilitado por essa etapa.

O gateway atual é de diagnóstico e pareamento. Ele não abre, bloqueia, cadastra usuários nem altera o modo de operação.

Antes de ativar o controle de acesso, será necessário definir a política de contingência: o que fazer quando a internet ou o gateway estiver indisponível. Essa decisão deve ser aprovada antes de qualquer comando de abertura ou bloqueio.

## Referências

- [API Control iD](https://www.controlid.com.br/docs/access-api-pt/)
- [Login da API](https://www.controlid.com.br/docs/access-api-pt/primeiros-passos/realizar-login/)
- [Modos de operação](https://www.controlid.com.br/docs/access-api-pt/modos-de-operacao/introducao-aos-modos-de-operacao/)
