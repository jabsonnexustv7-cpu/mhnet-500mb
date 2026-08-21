# WebTurbo Chat MVP

Primeira versão testável de um checkout conversacional isolado da landing page publicada.

## Arquitetura encontrada

O repositório é um site estático publicado com Jekyll/GitHub Pages e não possuía `package.json`. A página de produção em `consultar-cobertura/index.html` inclui `coverage-base.html` e aplica ajustes por Liquid. A consulta existente usa:

- ViaCEP para preencher logradouro, bairro, cidade e UF;
- Cloud Run `consulta-cobertura-mhnet-br` para a decisão real de viabilidade FTTH;
- raio de 200 metros;
- uma segunda tentativa mínima (`cep`, `fachada`, `radius`) quando o motivo é `sem_ftth_no_raio`;
- três ofertas promocionais prioritárias (300, 500 e 700 Mega) e um catálogo adicional de seis planos, com substituição de 500 por 600 Mega em Sorocaba e Votorantim;
- um endpoint separado do WebTurbo CRM para pré-vendas.

O laboratório não importa o JavaScript monolítico da página publicada. As integrações necessárias foram isoladas em adaptadores: CRM real, Meta Pixel `Lead`, GA4, conversões do Google Ads, pós-venda no WhatsApp e assistência opcional pela OpenAI Responses API. CAPI, ManyChat, notificações de cobertura e retenção continuam fora do laboratório.

## Arquivos do MVP

- `consultar-cobertura/chat-lab.html`: laboratório isolado e sem indexação.
- `consultar-cobertura/chat/chat.css`: interface mobile-first.
- `consultar-cobertura/chat/config.js`: modos e endpoints.
- `consultar-cobertura/chat/billing.js`: vencimentos, data mínima e cálculo proporcional reaproveitado.
- `consultar-cobertura/chat/state.js`: sessão, persistência e máquina de estados.
- `consultar-cobertura/chat/validators.js`: validações e normalizações.
- `consultar-cobertura/chat/parser.js`: interpretação local das mensagens.
- `consultar-cobertura/chat/message-router.js`: decisão local, mensagem mista, comandos e remoção de dados sensíveis.
- `consultar-cobertura/chat/ai-service.js`: cliente do endpoint local de assistência.
- `consultar-cobertura/chat/ai-schema.js`: contrato estruturado da resposta da IA.
- `consultar-cobertura/chat/knowledge.js`: conhecimento comercial estável e retomadas determinísticas.
- `consultar-cobertura/chat/plans.js`: três ofertas promocionais, catálogo adicional reaproveitado e regra regional.
- `consultar-cobertura/chat/integrations.js`: ViaCEP, cobertura e adaptador CRM.
- `consultar-cobertura/chat/tracking.js`: atribuição e eventos Meta/Google equivalentes ao fluxo atual.
- `consultar-cobertura/chat/whatsapp.js`: mensagem e redirecionamento pós-venda.
- `consultar-cobertura/chat/flow.js`: orquestração do fluxo.
- `consultar-cobertura/chat/ui.js`: renderização e eventos visuais.
- `consultar-cobertura/chat/app.js`: inicialização do laboratório.
- `consultar-cobertura/chat/tests/*.test.mjs`: testes do fluxo, router, privacidade e backend OpenAI.
- `tools/chat-lab-server.mjs`: servidor HTTP local, acesso pela rede, endpoint de IA e proxy do CRM.
- `tools/chat-ai/system-prompt.mjs`: regras rígidas e isoladas do assistente comercial.
- `tools/chat-ai/openai-assist.mjs`: validação server-side e integração com `POST /v1/responses`.
- `tools/chat-ai/smoke-test.mjs`: teste real opcional, bloqueado sem flag explícita.
- `.env.example`: nomes das variáveis, sem credenciais.
- `package.json`: comandos de teste e servidor, sem dependências externas.

## Máquina de estados

`WELCOME → CEP → NUMERO → COMPLEMENTO → CONSULTANDO_COBERTURA → COBERTURA_VIAVEL/COBERTURA_INVIAVEL → ESCOLHA_PLANO → NOME → CPF → DATA_NASCIMENTO → EMAIL → TELEFONE → TELEFONE_SECUNDARIO → VENCIMENTO → DATA_INSTALACAO → TURNO_INSTALACAO → CONFIRMACAO → FINALIZADO`

O segundo contato é obrigatório e deve ser diferente do principal. Os vencimentos disponíveis são `05`, `10`, `15`, `20` e `25`; a data de instalação começa em amanhã e os turnos disponíveis são `Manhã` e `Tarde`, iguais ao formulário normal.

`step` e `flowStep` permanecem sob autoridade determinística. Durante uma dúvida, `conversationMode` muda temporariamente de `FLOW` para `AI_HELP` e volta para `FLOW` sem aceitar alteração de etapa sugerida pela IA. O comando `voltar` usa transições permitidas e o catálogo adicional oferece `Voltar às promoções`.

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
- Parser local sempre ativo; assistência desligada (padrão): `ai=off`
- Assistência OpenAI para dúvidas/objeções: `ai=openai`
- CRM real (padrão): `crm=real`
- Conversões reais (padrão): `conversions=real`
- Redirecionamento real para WhatsApp (padrão): `whatsapp=real`
- Modo totalmente seguro, sem CRM, conversões ou redirecionamento: `safe=1`

Em `coverage=real`, uma indisponibilidade técnica do endpoint usa `mock-fallback` para manter o laboratório navegável. A origem efetiva aparece no painel de debug. Para impedir o fallback, use `coverageFallback=none`.

Por segurança, uma cobertura `mock` ou `mock-fallback` nunca pode gerar pré-venda nem eventos de conversão reais. Para exercitar o fluxo sem efeitos externos, combine `coverage=mock` com `safe=1`. Para criar a pré-venda, use `coverage=real` e confirme no debug que a origem da cobertura é `real`.

## Persistência

A sessão é salva em `localStorage` com a chave `webturbo-chat-mvp-v4`. Ao recarregar, a página oferece continuar o atendimento ou iniciar outro. O botão `Resetar sessão` aparece no painel aberto por `?debug=1`.

## CRM

O adaptador gera o mesmo conjunto principal de campos usado pelo formulário atual, incluindo dados pessoais, endereço, cobertura, plano, origem e identificador de evento. O modo padrão é `crmMode = "real"`: ao confirmar, o chat faz POST em `/api/chat/crm`; o servidor local encaminha o corpo sem alterações ao endpoint atual de pré-vendas. Esse proxy é necessário porque o Cloud Run não autoriza o preflight CORS originado por `localhost`.

Depois da confirmação do CRM, o fluxo:

- registra `enviou_formulario_easy` no GA4;
- envia a conversão final do Google Ads quando a atribuição salva é Google;
- mostra a mensagem existente de cadastro recebido;
- inicia a contagem de 3 segundos;
- registra a conversão de WhatsApp e abre a mensagem `Acabei de concluir um pedido de internet, meu CPF: ...`;
- mantém um botão manual “Continuar no WhatsApp” caso o navegador bloqueie o encaminhamento.

O evento `Lead` do Meta Pixel ocorre após os dois contatos válidos, no mesmo ponto do fluxo normal. Para testes sem efeitos reais, use `safe=1`. Nesse modo:

- o payload completo é mantido na sessão e mostrado no debug;
- o console recebe uma cópia com CPF mascarado;
- `fetch` não é chamado;
- nenhuma pré-venda ou conversão é criada.

O painel de debug sempre informa os modos efetivos de CRM, conversões e WhatsApp.

## OpenAI

O parser local continua sendo executado primeiro. A OpenAI só é chamada para perguntas, objeções, ajuda, mensagens não reconhecidas e a parte interrogativa de uma mensagem mista. CEP, CPF, e-mail, telefone, nascimento, seleções de plano e comandos conhecidos não dependem da API.

O frontend chama `POST /api/chat/assist` com:

```json
{
  "sessionId": "...",
  "step": "CPF",
  "message": "a instalação é grátis?",
  "context": {
    "cidade": "Canoas",
    "uf": "RS",
    "coverageStatus": "VIAVEL",
    "selectedPlan": "FIBRA 500MB (Combate)",
    "selectedPlanValue": 89.9,
    "availablePlans": []
  }
}
```

CPF, telefone, e-mail, nascimento e CEP são removidos no router e novamente no servidor. O endpoint valida tamanho, JSON, `step` e catálogo; depois usa a Responses API com `store: false`, limite de saída e JSON Schema. O retorno tem `type`, `answer`, `resumeFlow`, `resumeStep`, `systemAction` e `handoffSuggested`. `resumeStep` divergente é rejeitado e nenhuma `systemAction` é executada diretamente.

### Configuração

Copie `.env.example` para `.env` e preencha no servidor local:

```dotenv
OPENAI_API_KEY=sua_chave_somente_no_backend
OPENAI_MODEL=modelo_disponivel_na_sua_conta
```

Não existe modelo comercial fixo no frontend. Se a chave ou o modelo estiver ausente, o endpoint retorna `OPENAI_NOT_CONFIGURED` e o chat usa uma resposta amigável sem quebrar o fluxo. A chave não entra no HTML, módulos do navegador, payload, debug ou logs.

URL segura com assistência habilitada:

`http://localhost:4173/consultar-cobertura/chat-lab.html?debug=1&safe=1&coverage=mock&ai=openai`

O smoke test real nunca roda no `npm test`. Para autorizá-lo explicitamente no PowerShell:

```powershell
$env:OPENAI_API_KEY="..."
$env:OPENAI_MODEL="..."
$env:OPENAI_SMOKE_TEST="1"
npm run chat:ai-smoke
```

No debug aparecem `AI mode`, configuração sim/não, quantidade de chamadas, última decisão do router, intenção, `flowStep`, `conversationMode`, ação sugerida e latência. A chave nunca aparece.

## Roteiro manual

1. Abra o chat e informe `meu cep é 92120141`.
2. Informe `o número é 1186`.
3. Informe `não tenho complemento`.
4. Em modo mock viável, confira as três promoções, clique em `Ver mais ofertas` e depois em `Voltar às promoções`.
5. Escolha um card ou escreva `quero o mais barato`.
6. Informe o nome completo e aguarde a etapa CPF.
7. Na etapa CPF, pergunte `a instalação é grátis?` e confirme no debug que o estado continua CPF.
8. Teste `meu cpf é 529.982.247-25 e tem fidelidade?` com CPF de teste e confirme que apenas a dúvida aparece no request mockado/log de desenvolvimento.
9. Depois da mensagem mista, informe nascimento, e-mail, telefone principal, um segundo contato diferente, vencimento, data de instalação a partir de amanhã e turno.
10. Confira no resumo o valor proporcional estimado e a primeira fatura cheia.
11. Confirme o pré-cadastro. Sem `safe=1`, essa ação cria ou atualiza uma pré-venda real.
12. Verifique o resultado do CRM, a mensagem de sucesso, a contagem regressiva e o WhatsApp.
13. Teste `quero falar com atendente`, `voltar` e uma mensagem de prompt injection.
14. Recarregue durante o fluxo, teste `Continuar atendimento anterior` e depois `Resetar sessão`.
15. Repita com `coverage=mock&mockCoverage=inviavel` e com dados inválidos.

## Limitações atuais

- O ViaCEP pode retornar CEP geral sem rua/bairro; o MVP mantém o fluxo, mas uma segunda versão deve solicitar esses campos no chat.
- O endpoint de IA é local e não possui autenticação de usuário nem rate limiting distribuído; antes de produção, deve migrar para um backend autenticado com sessão server-side.
- O servidor valida o `step`, mas neste MVP não mantém uma cópia server-side da sessão para confrontar o estado enviado pelo navegador.
- Ponto de referência ainda não é coletado e fica vazio no payload.
- O cálculo proporcional espelha a regra atual da landing, que estima a instalação em D+2 mesmo quando o cliente escolhe outra data preferida.
- O mock de cobertura serve apenas para homologação e nunca deve ser tratado como decisão técnica real.
- O acesso pelo celular depende das regras do Windows Firewall e da rede permitir comunicação entre dispositivos.

## Checklist antes de produção

- Remover/segregar o painel de debug e revisar retenção de dados pessoais no `localStorage`.
- Implementar consentimento, política de privacidade e prazo de expiração da sessão.
- Validar o contrato da cobertura e o catálogo de planos com responsáveis comerciais.
- Migrar o endpoint OpenAI para backend autenticado, com rate limiting, moderação, observabilidade e sessão server-side.
- Revisar idempotência, antifraude e auditoria do endpoint CRM antes de integrar o chat à página publicada.
- Adicionar testes E2E em dispositivos reais e navegadores suportados.
- Revisar acessibilidade, LGPD, segurança, eventos de conversão e consentimento antes de qualquer deploy.
- Homologar em ambiente separado e obter aprovação explícita antes de integrar à landing page.

## Recomendações para a versão 2

1. Solicitar rua/bairro quando o CEP for geral e permitir confirmação estruturada do endereço.
2. Buscar planos de uma fonte única versionada, em vez de manter dados no HTML.
3. Criar um backend de sessão persistente para confrontar `flowStep` e aplicar limites por usuário.
4. Substituir a data mínima local por uma agenda real de disponibilidade, quando existir um serviço para isso.
5. Criar suíte E2E com cenários reais controlados de cobertura.
