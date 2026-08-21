# Chat WebTurbo com IA — preparação para produção

Este guia descreve a estrutura pronta para implantação. Nenhum comando de deploy, criação de secret, alteração de DNS ou publicação da landing foi executado nesta etapa.

## Arquitetura

O frontend estático continua responsável pelo fluxo determinístico da contratação. Ele processa dados da etapa, mantém `flowStep`, seleciona planos, consulta cobertura, monta o CRM e dispara integrações existentes. A IA responde somente dúvidas e objeções.

O serviço `webturbo-chat-ai` é um backend HTTP Node.js sem dependências externas:

- `services/chat-ai/server.mjs`: processo que escuta `0.0.0.0:$PORT` no Cloud Run;
- `services/chat-ai/app.mjs`: CORS, healthcheck, status, rate limiting, request ID e logs seguros;
- `tools/chat-ai/openai-assist.mjs`: validação, segunda sanitização e chamada à Responses API;
- `tools/chat-ai/system-prompt.mjs`: regras comerciais e de segurança;
- `consultar-cobertura/chat/ai-schema.js`: JSON Schema e validação do retorno;
- `consultar-cobertura/chat/knowledge.js`: conhecimento comercial permitido.

O servidor local `tools/chat-lab-server.mjs` reutiliza a mesma camada HTTP. O serviço não mantém sessão persistente: o frontend é a autoridade do fluxo, `resumeStep` deve coincidir com o `step` recebido e `systemAction` é apenas informativa.

## Endpoints

### `GET /health`

Retorna `200 { "ok": true }`. Não chama a OpenAI.

### `GET /api/chat/assist/status`

Retorna somente configuração não sensível:

```json
{
  "ok": true,
  "configured": true,
  "model": "gpt-5.4-mini",
  "version": "1.0.0"
}
```

### `POST /api/chat/assist`

Aceita no máximo 16 KiB. O contrato é:

```json
{
  "sessionId": "identificador-com-até-100-caracteres",
  "step": "CPF",
  "message": "tem fidelidade?",
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

Limites adicionais: mensagem 500 caracteres, até 12 planos, até 5 features por plano e limites específicos em todos os campos textuais. Payloads fora do contrato são rejeitados, não truncados silenciosamente.

Erros controlados: `OPENAI_NOT_CONFIGURED`, `OPENAI_TIMEOUT`, `OPENAI_UNAVAILABLE`, `OPENAI_UPSTREAM_ERROR`, `OPENAI_INVALID_RESPONSE`, `INVALID_REQUEST`, `RATE_LIMITED` e `ORIGIN_NOT_ALLOWED`.

## OpenAI e privacidade

O backend chama `POST https://api.openai.com/v1/responses` com `store: false`, `max_output_tokens: 300` e Structured Outputs em JSON Schema estrito. O modelo é configurado por `OPENAI_MODEL`, com `gpt-5.4-mini` como padrão operacional.

A sanitização ocorre no router do navegador e novamente no backend. CPF, telefone, e-mail, nascimento, CEP, endereço reconhecível e sequências numéricas longas são removidos antes do request upstream. Mensagens mistas continuam sendo divididas localmente: o dado da etapa é salvo pelo fluxo e somente a pergunta segue para a IA.

Os logs usam o prefixo `[WEBTURBO CHAT AI]` e podem conter request ID, hash curto da sessão/IP, etapa, intenção, latência, status, rate limit e status upstream. Não registram mensagem bruta, chave, CPF, telefone ou e-mail.

## CORS e rate limiting

`ALLOWED_ORIGINS` contém uma lista separada por vírgulas. O backend ecoa somente uma origem explicitamente permitida e nunca usa `Access-Control-Allow-Origin: *`. Em produção, configure somente os hosts publicados necessários. Localhost e IPs privados são aceitos automaticamente apenas quando `NODE_ENV` não é `production`.

O limite padrão é de 10 chamadas por 60 segundos, aplicado separadamente ao hash do IP e ao hash de `sessionId`. Ao exceder, o serviço retorna HTTP 429, `RATE_LIMITED` e `Retry-After`, sem chamar a OpenAI.

Esse limite é uma proteção básica em memória. Cada instância do Cloud Run possui contadores próprios; reinícios limpam os contadores e múltiplas instâncias multiplicam a capacidade efetiva. Antes de uma escala maior, migrar o contador para Redis/Memorystore, banco com operação atômica ou API Gateway/Cloud Armor com política adequada.

## Frontend, sessão e debug

Em host local/porta 4173, o frontend usa `/api/chat/assist`. Em `webturbo-internet.com.br`, usa a URL preparada do Cloud Run. O endpoint pode ser alterado sem recompilar o módulo principal:

```html
<script>
  window.WEBTURBO_CHAT_CONFIG = {
    aiAssistEndpoint: "https://URL_CONFIRMADA_DO_CLOUD_RUN/api/chat/assist"
  };
</script>
```

Também pode ser definido por `<meta name="webturbo-chat-ai-endpoint" content="...">`. A URL final informada pelo Cloud Run deve ser confirmada antes da publicação.

A sessão local usa `createdAt`, `updatedAt` e `expiresAt`. Cada gravação renova a validade por 24 horas; ao carregar uma sessão expirada, o frontend a remove e inicia outra. A persistência server-side fica como evolução futura.

O painel completo de `?debug=1` só é habilitado em localhost, loopback, rede privada ou porta 4173. Em hostname de produção, o painel permanece oculto e o JSON de sessão/CRM é apagado do DOM.

## Desenvolvimento local seguro

Copie `.env.example` para `.env` somente se precisar testar a OpenAI. Nunca versione `.env`.

```powershell
npm test
npm run chat:serve
```

URL sem CRM, conversões ou redirecionamento reais:

`http://localhost:4173/consultar-cobertura/chat-lab.html?debug=1&safe=1&coverage=mock&ai=openai`

Backend isolado, opcional:

```powershell
npm run chat:ai-serve
```

O `npm test` usa mocks e não consome créditos. O smoke test real permanece opt-in por `OPENAI_SMOKE_TEST=1`.

## Roteiro manual obrigatório

Sempre usar `safe=1&coverage=mock` nesta etapa.

1. CEP misto: `meu cep 94035190 mas paga instalação?`. Confirmar CEP salvo, dúvida respondida/fallback e próxima etapa `NUMERO`.
2. CPF misto: usar um CPF de teste válido em `meu cpf é ... e tem fidelidade?`. Confirmar CPF salvo localmente, ausência do CPF no request da IA e avanço para `DATA_NASCIMENTO`.
3. Na etapa CPF: `antes de passar meu CPF, tem fidelidade?`. Confirmar resposta e permanência em `CPF`.
4. `quero falar com atendente`. Confirmar zero chamadas OpenAI e handoff WhatsApp em modo mock.
5. Sem chave ou com backend parado. Confirmar fallback amigável e `flowStep` intacto.
6. Após cobertura, conferir as três ofertas especiais, `Ver mais ofertas` e `Voltar às promoções`.

## Imagem e build

O contexto do Docker deve ser a raiz do repositório:

```powershell
docker build --file services/chat-ai/Dockerfile --tag webturbo-chat-ai:local .
docker run --rm --publish 8080:8080 --env-file services/chat-ai/.env webturbo-chat-ai:local
```

Cloud Build preparado em `services/chat-ai/cloudbuild.yaml`:

```powershell
gcloud builds submit . `
  --project=webturbo-crm `
  --config=services/chat-ai/cloudbuild.yaml `
  --substitutions=_IMAGE=southamerica-east1-docker.pkg.dev/webturbo-crm/webturbo-services/webturbo-chat-ai:VERSION
```

Esse comando é somente documentação nesta etapa.

## Preparação do Google Cloud e Secret Manager

Comandos preparados, não executados:

```powershell
gcloud config set project webturbo-crm
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create webturbo-services `
  --project=webturbo-crm `
  --location=southamerica-east1 `
  --repository-format=docker `
  --description="Imagens dos serviços WebTurbo"

gcloud iam service-accounts create webturbo-chat-ai `
  --project=webturbo-crm `
  --display-name="WebTurbo Chat AI"

gcloud secrets create webturbo-openai-api-key `
  --project=webturbo-crm `
  --replication-policy=automatic

gcloud secrets versions add webturbo-openai-api-key `
  --project=webturbo-crm `
  --data-file=-

gcloud secrets add-iam-policy-binding webturbo-openai-api-key `
  --project=webturbo-crm `
  --member="serviceAccount:webturbo-chat-ai@webturbo-crm.iam.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor"
```

No comando `versions add`, inserir a chave apenas pelo stdin seguro e encerrar a entrada; não colar a chave na linha de comando, em arquivo versionado ou em documentação. Em produção, fixe uma versão numérica do secret e faça rotação criando uma nova versão.

## Comando de deploy preparado — não executar sem autorização

Depois de criar e enviar a imagem `VERSION`:

```powershell
gcloud run deploy webturbo-chat-ai `
  --project=webturbo-crm `
  --region=southamerica-east1 `
  --platform=managed `
  --image=southamerica-east1-docker.pkg.dev/webturbo-crm/webturbo-services/webturbo-chat-ai:VERSION `
  --service-account=webturbo-chat-ai@webturbo-crm.iam.gserviceaccount.com `
  --allow-unauthenticated `
  --set-secrets=OPENAI_API_KEY=webturbo-openai-api-key:1 `
  --set-env-vars=OPENAI_MODEL=gpt-5.4-mini,ALLOWED_ORIGINS=https://webturbo-internet.com.br,RATE_LIMIT_WINDOW_MS=60000,RATE_LIMIT_MAX=10,OPENAI_TIMEOUT_MS=10000,SERVICE_VERSION=1.0.0 `
  --port=8080 `
  --timeout=30 `
  --cpu=1 `
  --memory=256Mi `
  --max-instances=3
```

O endpoint precisa ser público para o browser chamar diretamente; CORS não substitui autenticação nem controle de abuso. Após o deploy futuro, obter e validar a URL:

```powershell
gcloud run services describe webturbo-chat-ai `
  --project=webturbo-crm `
  --region=southamerica-east1 `
  --format="value(status.url)"
```

## Ativação futura na landing

Não há ativação nesta etapa. Depois de homologar o Cloud Run, a mudança futura deve conectar a opção `Atendimento` do botão flutuante ao chat, preservar o WhatsApp existente como saída/handoff e apontar `WEBTURBO_CHAT_CONFIG.aiAssistEndpoint` para a URL confirmada. Não substituir o WhatsApp nem publicar antes da aprovação de negócio, segurança, LGPD e tracking.

## Checklist pré-deploy

- `npm test` sem chamadas reais e todos os testes aprovados;
- imagem Docker construída e iniciada localmente como usuário não root;
- `/health`, `/api/chat/assist/status`, CORS, 429 e fallback homologados;
- secret criado sem exposição e versão numérica concedida somente à service account;
- `ALLOWED_ORIGINS` de produção sem localhost;
- URL real do Cloud Run confirmada no frontend de homologação;
- CRM, conversões e WhatsApp em mock durante homologação;
- logs verificados sem PII;
- limites de custo/alertas da OpenAI e do Google Cloud configurados;
- revisão de LGPD, acessibilidade, tracking e conteúdo comercial concluída;
- aprovação explícita antes de deploy, landing, DNS ou produção.

## Limitações restantes

- rate limiting em memória não é distribuído entre instâncias;
- não há sessão server-side para confrontar o estado declarado pelo navegador;
- o endpoint público depende de CORS e rate limit básico, sem autenticação de usuário;
- a URL padrão do Cloud Run no frontend deve ser confirmada após o primeiro deploy;
- testes automatizados cobrem HTTP e regras de fluxo, mas E2E visual/dispositivos reais ainda precisa de homologação;
- o chat continua separado da landing publicada até uma etapa futura autorizada.
