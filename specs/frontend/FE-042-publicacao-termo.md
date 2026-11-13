# FE-042 - Publicação administrativa do termo de dados

- **Software:** front
- **Milestone:** M0 Fundação — complemento aprovado em 13/11/2026
- **Status:** implementada localmente; revisão manual com leitor de tela pendente
- **Depende de:** FE-003, FE-004, BE-011
- **Requisitos cobertos:** RF-004, RNF-016

## 1. Objetivo
Permitir ao admin publicar a primeira versão e novas versões do termo de dados pela interface, removendo a dependência de chamada manual à API para habilitar os cadastros.

## 2. Escopo
- Inclui: `/admin/termos`, navegação exclusiva de admin, termo vigente, formulário de versão/texto, revisão e publicação imediata.
- NÃO inclui: editor jurídico, texto de exemplo automático, agendamento visual de vigência, edição/exclusão de versão publicada ou termos de teleconsulta/gravação.

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `frontend/design-system.md`, `frontend/screens-map.md`, `shared/api-contracts.md` (M0 consentimento), `backend/BE-011-consentimento-dados.md` e P-12/P-52 em `04-open-questions.md`.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho Termos de consentimento; card da versão/texto/vigência atuais ou estado Nenhum termo publicado; card Publicar nova versão com versão obrigatória (até50 caracteres) e texto integral obrigatório (até200.000). Validar com Zod, exibir texto como texto e manter tokens/labels/estados existentes.
- Admin revisa em Dialog acessível versão/texto e consequência: publicação é imutável, pode exigir novo aceite dos pacientes. Cancelar preserva rascunho; confirmar usa POST contratado sem effectiveAt, calculado no servidor. Sucesso só depois201 válido, seguido de releitura do vigente. Duplo clique não envia duas publicações; nenhuma repetição automática de POST.
- 409/falha de rede preservam rascunho e orientam conferir termo vigente antes de repetir. Usuários sem admin não recebem menu nem formulário; servidor revalida admin/MFA. Não usar mocks no produto nem persistir termo em storage local.
- A tela pública/assistida de cadastro é corrigida separadamente nas FE-007/039: ausência de termo orienta publicação, erro técnico permite retry e troca de versão exige novo aceite/evidência.

## 5. Critérios de aceite
- [x] Dado banco sem termo, quando admin abrir a tela, então estado vazio permite informar/revisar/publicar o primeiro termo e o GET vigente retorna a versão.
- [x] Dado formulário vazio/excessivo, quando revisar, então erros ligados aos campos impedem POST; cancelar revisão não publica nem perde rascunho.
- [x] Dada publicação confirmada, quando retornar201 válido, então UI exibe sucesso e termo lido da API, sem edição/exclusão do publicado.
- [x] Dado conflito ou resposta perdida, quando publicar, então rascunho permanece e a UI não anuncia sucesso inexistente; duplo evento em andamento só envia um POST.
- [x] Dado outro perfil ou viewport360px/teclado, quando abrir/navegar, então permissões e acessibilidade são respeitadas sem overflow.

## 6. Testes esperados
Playwright com contrato simulado para vazio/publicação/revisão/validação/conflito/rede/duplo envio/papéis/360px; integração HTTP/PostgreSQL do complemento BE-011 para vigência/auditoria/compatibilidade/RBAC. Lint.

## 7. Definition of Done
- [x] Usa serviços HTTP, schemas Zod e componentes do projeto; nenhum endpoint/termo fictício ou migração desnecessária.
- [x] Testes pertinentes/lint aprovados; contrato/matriz/ordem atualizados; sem tsc ou commits.

## 8. Suposições e pontos em aberto
Texto é fornecido pelo admin. Publicação imediata pela tela é decisão do plano aprovado; API mantém vigência explícita. P-01 jurídico e revisão manual com leitor de tela permanecem antes de produção. M1 continua pausada após FE-017.

## Evidência local — 13/11/2026

10/10 Firefox com API simulada e lint90 aprovados em `/tmp/vidaplena-consent-admin-{browser,lint}.log`; BE-011 complementar5/5 integrações e lint221 aprovados. Revisão mobile inspecionada; retorno de foco/Escape e duplo evento comprovados. Contrato/frontend Zod validados, sem POST automático/retry nem edição do publicado. Correções dos consumidores FE-007/039 seguem separadamente; fechamento da matriz/ordem após o lote autorizado.

**Fechamento do lote P-52:** 26/26 Firefox em execução única (11 FE-042,5 FE-007,6 FE-039 e4 de regressão MFA), cliente HTTP6/6, integrações backend5/5 e lint monorepo221/91 aprovados. Inclui limites de versão/texto, rejeição de termo inválido, retry/cadastro real pelo contrato e nova evidência presencial quando a versão muda. Matriz, mapa e ordem atualizados para96 specs. Logs `/tmp/vidaplena-consent-final-{browser,lint,api}.log`. Nenhum build/tsc/commit; M1 continua pausada.
