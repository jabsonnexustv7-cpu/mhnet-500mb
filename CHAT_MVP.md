# WebTurbo Chat MVP

Primeira versão testável de um checkout conversacional isolado da landing page publicada.

## Arquitetura encontrada

O repositório é um site estático publicado com Jekyll/GitHub Pages e não possuía `package.json`. A página de produção em `consultar-cobertura/index.html` inclui `coverage-base.html` e aplica ajustes por Liquid. A consulta existente usa:

- ViaCEP para preencher logradouro, bairro, cidade e UF;
- Cloud Run `consulta-cobertura-mhnet-br` para a decisão real de viabilidade FTTH;
- raio de 200 metros;
- uma segunda tentativa mínima (`cep`, `fachada`, `radius`) quando o motivo é `sem_ftth_no_raio`;
- seis planos definidos no frontend, com substituição de 500 por 600 Mega em Sorocaba e Votorantim;
- um endpoint separado do WebTurbo CRM para pré-vendas.

O laboratório não importa os scripts da página publicada. Assim, não carrega Pixel, Google Ads, CAPI, ManyChat, notificações, retenção, WhatsApp ou CRM real.

## Arquivos do MVP

- `consultar-cobertura/chat-lab.html`: laboratório isolado e sem indexação.
- `consultar-cobertura/chat/chat.css`: interface mobile-first.
- `consultar-cobertura/chat/config.js`: modos e endpoints.
- `consultar-cobertura/chat/state.js`: sessão, persistência e máquina de estados.
- `consultar-cobertura/chat/validators.js`: validações e normalizações.
- `consultar-cobertura/chat/parser.js`: interpretação local das mensagens.
- `consultar-cobertura/chat/plans.js`: planos reaproveitados e regra regional.
- `consultar-cobertura/chat/integrations.js`: ViaCEP, cobertura e adaptador CRM.
- `consultar-cobertura/chat/flow.js`: orquestração do fluxo.
- `consultar-cobertura/chat/ui.js`: renderização e eventos visuais.
- `consultar-cobertura/chat/app.js`: inicialização do laboratório.
- `consultar-cobertura/chat/tests/chat.test.mjs`: testes automatizados.
- `tools/chat-lab-server.mjs`: servidor HTTP local, incluindo acesso pela rede.
- `package.json`: comandos de teste e servidor, sem dependências externas.

## Máquina de estados

`WELCOME → CEP → NUMERO → COMPLEMENTO → CONSULTANDO_COBERTURA → COBERTURA_VIAVEL/COBERTURA_INVIAVEL → ESCOLHA_PLANO → NOME → CPF → DATA_NASCIMENTO → EMAIL → TELEFONE → CONFIRMACAO → FINALIZADO`

Transições de correção voltam para `CEP`, `NUMERO` ou `ESCOLHA_PLANO`. Transições não permitidas geram erro explícito.

## Como executar no Windows PowerShell

Não há dependências para instalar. É necessário Node.js 18 ou superior.

```powershell
cd "C:\Users\jabso\Documents\Codex\2026-08-21\files-pasted-by-the-user-quero\work\mhnet-500mb"
git switch feature/chat-ia-mvp
npm test
npm run chat:serve
```

Abra:

`http://localhost:4173/consultar-cobertura/chat-lab.html?debug=1`

O servidor mostra no terminal também a URL com o IP da máquina para teste em um celular na mesma rede Wi-Fi. Se o Windows Firewall perguntar, libere apenas para redes privadas.

## Modos de homologação

Os defaults ficam em `consultar-cobertura/chat/config.js` e podem ser sobrescritos na URL.

- Cobertura real (padrão): `?debug=1&coverage=real`
- Cobertura mock viável: `?debug=1&coverage=mock&mockCoverage=viavel`
- Cobertura mock inviável: `?debug=1&coverage=mock&mockCoverage=inviavel`
- Parser local (padrão): `chat=local`
- Estrutura OpenAI/proxy: `chat=openai`
- CRM: fixo em `mock` neste MVP.

Em `coverage=real`, uma indisponibilidade técnica do endpoint usa `mock-fallback` para manter o laboratório navegável. A origem efetiva aparece no painel de debug. Para impedir o fallback, use `coverageFallback=none`.

## Persistência

A sessão é salva em `localStorage` com a chave `webturbo-chat-mvp-v1`. Ao recarregar, a página oferece continuar o atendimento ou iniciar outro. O botão `Resetar sessão` aparece no painel aberto por `?debug=1`.

## CRM

O adaptador gera o mesmo conjunto principal de campos usado pelo formulário atual, incluindo dados pessoais, endereço, cobertura, plano, origem e identificador de evento. Em `crmMode = "mock"`:

- o payload completo é mantido na sessão e mostrado no debug;
- o console recebe uma cópia com CPF mascarado;
- `fetch` não é chamado;
- nenhuma pré-venda ou conversão é criada.

O caminho `crmMode = "real"` está separado no adaptador, mas não deve ser ativado sem revisão de segurança e autorização de produção.

## OpenAI

O modo padrão usa regras locais e não precisa de chave. O modo `openai` tenta um proxy seguro em `/api/chat/parse` e volta ao parser local se o proxy não existir. Não há chave no frontend. Uma versão futura deve implementar esse proxy no backend, ler `OPENAI_API_KEY` de variável de ambiente e devolver somente intenção/entidades; cobertura, preço, planos e aprovações continuam sendo definidos pelas APIs/regras do sistema.

## Roteiro manual

1. Abra o chat e informe `meu cep é 92120141`.
2. Informe `o número é 1186`.
3. Informe `não tenho complemento`.
4. Em modo mock viável, escolha um card ou escreva `quero o mais barato`.
5. Informe nome completo, CPF válido, nascimento, e-mail e telefone.
6. Confira o resumo e confirme.
7. Verifique `CRM MOCK`, o payload no debug e a ausência de requisição ao CRM na aba Network.
8. Recarregue durante o fluxo e teste `Continuar atendimento anterior`.
9. Use `Resetar sessão`.
10. Repita com `coverage=mock&mockCoverage=inviavel`.
11. Envie CEP e CPF inválidos e confirme que o estado não avança.

## Limitações atuais

- O ViaCEP pode retornar CEP geral sem rua/bairro; o MVP mantém o fluxo, mas uma segunda versão deve solicitar esses campos no chat.
- O proxy OpenAI ainda não foi implementado; o modo continua funcional por fallback local.
- Data de vencimento, referência e preferência de instalação não são coletadas e ficam vazias no payload.
- O mock de cobertura serve apenas para homologação e nunca deve ser tratado como decisão técnica real.
- O acesso pelo celular depende das regras do Windows Firewall e da rede permitir comunicação entre dispositivos.

## Checklist antes de produção

- Remover/segregar o painel de debug e revisar retenção de dados pessoais no `localStorage`.
- Implementar consentimento, política de privacidade e prazo de expiração da sessão.
- Validar o contrato da cobertura e o catálogo de planos com responsáveis comerciais.
- Implementar proxy OpenAI autenticado, rate limiting, moderação e observabilidade, se necessário.
- Habilitar CRM real apenas no backend, com idempotência, antifraude e auditoria.
- Adicionar testes E2E em dispositivos reais e navegadores suportados.
- Revisar acessibilidade, LGPD, segurança, eventos de conversão e consentimento antes de qualquer deploy.
- Homologar em ambiente separado e obter aprovação explícita antes de integrar à landing page.

## Recomendações para a versão 2

1. Solicitar rua/bairro quando o CEP for geral e permitir confirmação estruturada do endereço.
2. Buscar planos de uma fonte única versionada, em vez de manter dados no HTML.
3. Criar um backend de sessão para OpenAI e CRM, sem expor segredos.
4. Adicionar agendamento de instalação e vencimento ao diálogo.
5. Criar suíte E2E com cenários reais controlados de cobertura.
