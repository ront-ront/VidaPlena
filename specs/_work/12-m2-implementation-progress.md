# Implementação M2 —24/11/2026

Objetivo integral: implementar BE-030–043 eFE-021–029/040/041 (25 specs), uma por vez, com commits por entregável validado. Repositório inicialmente limpo em `db415e5` (M1 já commitada pelo usuário). Não iniciar M3. Não executar tsc; verificação estática por lint.

## Decisões recebidas

P-06: proposta provisória de acesso aprovada; P-11: entrada cega aprovada; P-13: testes simples em desenvolvimento solicitados, sem promessa de catálogo clínico real. Respostas registradas em `04-open-questions.md`; parâmetros/política/contrato atualizados antes do código.

## Sequência e commits

1. BE-030 vínculos, sincronização/reconciliação, guard.
2. BE-031 urgência; BE-032 leitura.
3. BE-033 entrada cega/histórico.
4. BE-034 catálogos locais versionados dev.
5. BE-035 rascunhos; BE-036 finalização/adendo.
6. BE-037 alertas; BE-038 assinatura/catálogo.
7. BE-039 prescrição; BE-040/041 exames/resultados.
8. BE-042 documentos; BE-043 publicação/projeção própria.
9. FE-021–029/040/041, seguindo dependências topológicas.

Cada spec deve ser testada e registrada na matriz antes da próxima. Commits por spec ou grupo coeso já validado; nenhuma cobertura antecipada. BE-030 fundação commitada em `2e9f6b3`; continuidade em BE-031 e demais specs pendentes.

## BE-030 — fundação verificada

Migration e sincronização/reconciliação CLI/startup implementadas, guard por paciente/fase e concessões individuais cifradas/auditadas, paginação SQL30+1, schemas HTTP/OpenAPI e configuração Zod. Casos de evolução própria ainda dependem de BE-035/036; nenhuma rota de prontuário criada antecipadamente.

Resultado:89/89 integrações de consumidores (sessão68409), revisão posterior10/10 em `/tmp/vidaplena-be030-audit-final-integration.log` (sessão72700),28/28 Node,2/2 Vitest e lint223. Primeiras falhas foram ambiente: porta do container mudou de32768 para32769 ao reiniciar; migração da fixture exige cwd apps/backend. Bateria inicial6/7 corrigiu expectativa MFA: sessão sem MFA é401 conforme contrato já existente. Nenhuma regra foi enfraquecida. Testes isolados criam/removem sua própria base `_test`; banco dev intocado.

Leituras: constituição48, overview47, ordem150, BE-03039, BE-03138, schema807 linhas originais e booking-store477 linhas originais percorridos no disco. Contratos M2/acesso/valores usados diretamente. Nenhum tsc. Próxima spec BE-031; objetivo completo M2 permanece ativo.

## BE-031 — urgência e revisão verificadas

Novo guard AuthorizeClinical resolve urgência vigente ou CareLink no mesmo escopo transacional, com conta/perfil/papel/MFA frescos. Concessão + auditoria + outbox admin/DPO atômicas; ausência de DPO alerta admin, fila paginada e revisão única imutável sem leitura clínica administrativa. Rejeição encerra o grant, aprovação preserva prazo. Schema/migration e schemas Zod/OpenAPI, prazo configurável `emergency_access.duration_minutes`, justificativa/notas cifradas e notificações sem paciente/conteúdo. Detalhes P-57 no contrato compartilhado antes do código.

22/22 integrações em `/tmp/vidaplena-be031-regression.log` (sessão17481, saída0),28/28 Node (`/tmp/vidaplena-be031-node.log`, sessão16542), lint231 e Prisma validate/generate aprovados. Inicial9/10 falhou só por teste referenciar metadata em vez de metadataSafe; corrigido e regressão passou. Uso real do guard por dados clínicos fica BE-032, sem aceitar cobertura antecipada. Próxima spec BE-032, objetivo integral25 specs mantido.

## BE-032 — leitura e encontros verificados

BE-031 commitada em `0bb8534`. BE-032 lê header/timeline com vínculo/urgência por paciente, escopo pré restrito, recordNumber sem PII e primeira visita. União SQL da agenda M1 completed e índice cifrado append-only, cursor estável/páginas30, origem importada identificada. Endpoint explícito abre encontro/estado in_service/histórico/vínculo em uma transação idempotente, sem alterar reserva. P-58 registrado antes do código. Alertas reais só BE-037; conteúdos fonte nas próximas specs. Autoria própria fora do vínculo ainda BE-035/036.

31/31 regressão BE-030/031/032/006 (`/tmp/vidaplena-be032-regression.log`, sessão37990, saída0), revisão final10/10 com índice cifrado (`/tmp/vidaplena-be032-final-integration.log`, sessão93959, saída0); conjuntos sobrepostos.28/28 Node (`/tmp/vidaplena-be032-node.log`, sessão63741), lint238, Prisma validate/generate e diff aprovados. Massa300 em10 páginas sem duplicação. Falhas iniciais: fixture precisava reservar profissional junto com consulta; fixture corrigida sem afrouxar banco. Origem `clinical` não pertencia ao CHECK M1; código corrigido para `clinic`. Teste de rollback passou a exigir a falha de auditoria específica. IDs inexistentes agora não causam falha de FK na negativa (resourceId preserva alvo).

Leituras completas: BE-03238 linhas, cenário36, constituição48, overview47; adapter clinical-record-store262 e use case206 após atualização revisados no disco. Objetivo integral25 specs permanece ativo;22 sem código, mais integrações explicitamente parciais. Próxima BE-033.

## BE-033 — em implementação

BE-032 commitada em `a03e647`, worktree limpa antes de iniciar BE-033. Spec38 linhas e contrato import-templates42 linhas lidos integralmente, da primeira à última. P-59 define multipart metadados+arquivo, recibo cego, conferência única e adendos; arquivos provisórios sem associação não serão legíveis. Próximo: models/portas, serviço/adapter, upload/download e integração com FileStorage/guard, testes antes do commit. Não declarar cobertura ainda.

Checkpoint BE-033: schema/migration, portas/use case, adapter Prisma, política clínica de arquivo, multipart/rotas/OpenAPI e DI escritos, ainda sem cobertura declarada. Prisma validate/generate e lint WIP242 passaram antes dos últimos arquivos HTTP; próximos passos são lint do escopo e integrações reais. FileAccessPolicy agora pode retornar authorizationBasis para auditar links/downloads; política de consentimento segue fallback. Reconciliador de evidências também remove órfãos ImportedHistory, nunca anexos já vinculados. Não commitado e não concluído.

## BE-033 — verificada localmente

Entrada cega com multipart, recibo sem arquivo/link, arquivo obrigatório cifrado/validado e binding imutável. Detalhe só sob vínculo/urgência fora de pre; conferência única idempotente e adendo exigem vínculo, preservando original. Origem na timeline via índice BE-032. Generic file links/download auditam CareLink/grant e revalidam a cada pedido; consentimento M0 continua fallback. Limpeza de falha e reconciliação de órfãos sem apagar arquivos vinculados.

9/9 específicos (`/tmp/vidaplena-be033-integration.log`, sessão54603),43/43 regressão BE-030/031/032/033 + arquivos/consentimento M0 (`/tmp/vidaplena-be033-regression.log`, sessão5773, saída0), revisão de expiração HTTP1/1 (`/tmp/vidaplena-be033-expiry.log`, sessão16461),28/28 Node (`/tmp/vidaplena-be033-node.log`, sessão36976), lint247 e Prisma validate/generate aprovados. Conjuntos se sobrepõem. Runner criou/removiu base adicional descartável para suítes M0, sem migrar banco dev nem a base de controle. Nenhum tsc. Próxima BE-034; objetivo integral25 specs continua ativo,21 ainda sem código e integrações de autoria BE-035/036 e alertas BE-037 pendentes.

## BE-034 — início

BE-033 commitada em `830ddd1`; worktree limpa antes de BE-034. Spec38 linhas lida integralmente, da primeira à última; DRS §3.3.2/3.3.5/4.6.3 e contratos usados diretamente. P-60 concretiza apenas CID10/TUSS demonstrativos, com códigos DEV-* e source/license/demo claros, loader versionado/idempotente e bloqueio de demo em staging/production. Próximo: models/migration, loader/portas/schemas/busca e validação snapshot, fixtures/CLI, testes e commit. Sem cobertura de código declarada ainda; objetivo M2 integral permanece ativo.

## BE-034 — catálogo demonstrativo verificado

Schema/migration, Zod para datasets/HTTP, CLI demo/load, fixtures CID/TUSS sintéticas (29 linhas cada), busca profissional com perfil ativo/MFA, cursor e snapshot por versão. Dados/versões imutáveis, seleção ativa transacional e idempotência por checksum, sem consulta externa. DEV-* não são códigos médicos oficiais; loader e uso demo bloqueados em staging/production. P-60 e dependências BE-004/030 registradas antes do adapter.

49/49 integrações BE-030–034 (`/tmp/vidaplena-be034-regression.log`, sessão35455, saída0),28/28 Node (`/tmp/vidaplena-be034-node.log`, sessão4245),2/2 Vitest (`/tmp/vidaplena-be034-vitest.log`, sessão92288), lint260 (src/tests/fixtures/manifest), Prisma validate/generate e diff aprovados. Primeiro9/10 falhou no subprocesso CLI por ambiente local misturado; isolado com DOTENV_CONFIG_PATH=/dev/null, env explícito e erro seguro com nomes de campos. Revisão1/1 CLI e regressão49/49 passaram. Nenhum tsc/banco dev. Persistência do snapshot no ato clínico continua BE-035/040, autoria própria BE-035/036 e alertas BE-037. Próxima BE-035; objetivo integralM2 ativo,20 specs ainda sem código.

## Checkpoint para BE-035 — próximo trabalho

HEAD `f96c032` (BE-034); commits M2 anteriores: `2e9f6b3` BE-030, `0bb8534` BE-031, `a03e647` BE-032, `830ddd1` BE-033. Todos locais na branch feat/m1. BE-03538 linhas relida integralmente; nenhum código BE-035 escrito ainda. Objetivo permanece implementar M2 inteira, inclusive11 FE, com commits; não parar no backend nem iniciar M3.

Plano técnico a concretizar em P-61/contratos antes do código:

- Uma evolução por encontro, autor do encontro, payload clínico cifrado com queixa/história/exame/hipóteses/conduta e snapshots CID. Campos textuais até20000 caracteres, diagnosisCodes até50; JSON global já aceita1MB em app.ts. Rascunho pode ser incompleto; obrigatoriedade de finalização pertence BE-036.
- POST /clinical/encounters/{id}/evolutions/draft; GET /clinical/encounters/{id}/evolutions/draft para recuperar sem ID local; GET /clinical/evolutions/{id} para próprio draft (finalizadas integram BE-036); PATCH /clinical/evolutions/{id}/draft com expectedDraftVersion e Idempotency-Key UUID. Versão concorrente409; chave repetida com mesmo payload retorna resultado original sem avançar; mesma chave com payload diferente409.
- Guard de escrita deve usar vínculo **da consulta do encontro**, além de autoria e encontro in_progress/consulta in_service, fase durante e prazo vigente. Estender ManageCareLinks.basis com filtro opcional appointmentId (source appointment) é solução proposta. Leitura de rascunho só do autor, com vínculo do paciente fora de pre; urgência não recupera drafts. Novo vínculo pode permitir leitura de draft antigo, mas não escrita em consulta expirada.
- EvolutionDraftCommand append-only guarda nonce/ator/evolução, fingerprint **HMAC** com chave derivada (não SHA simples sobre conteúdo clínico), versão/savedAt de resposta; revalida autorização e estado draft antes de replay. Use uma porta para fingerprint e adaptador crypto padrão, sem domínio importar DI/Prisma.
- ClinicalEvolution: id, encounterId único, authorProfessionalId, payloadEncrypted, status draft/finalized, draftVersion, savedAt, createdAt, finalizedAt?, contentHash?. Trigger sem DELETE, identidade imutável, finalized sem UPDATE; draft avança exatamente uma versão; finalize BE-036 preserva payload/versão. Não implementar endpoint finalize/adendo na BE-035.
- 409 inclui apenas draftConflict:{evolutionId,currentDraftVersion,savedAt,status}; contexto ApplicationError e errorResponse Zod precisam extensão. middleware/errors.ts já espalha error.context. Nunca pôr conteúdo clínico no erro/log.
- DiagnosisCodes na entrada usam {code,version}; resolução gera snapshot via ManageTerminologies.snapshot no **mesmo tx**. PrismaTerminologyStore.scope pode compor PrismaClinicalRecordStore.scope para novo store, sem DI nos use cases. Patch sem alterar diagnóstico preserva snapshots; política de revalidação de seleção explícita precisa constar em P-61.
- Testar criação/recuperação após sessão nova, concorrência/retry, CID inválido/inativo/versão, autoria/IDOR/MFA/vínculo/consulta, rollback de auditoria, cifragem, finalizada recusada (fixture, endpoint só BE-036), OpenAPI e lint. Concluir integração clínica de snapshot BE-034 quando evidência real existir; autoria de finalizada sem vínculo somente BE-036.

Ambiente: Node22.22.0 em /home/yan/.nvm/versions/node/v22.22.0/bin, container descartável vp-m1-postgres-test ativo e porta atual32769 (confirmar docker port se reiniciar). URL de controle postgresql://postgres@127.0.0.1:32769/vidaplena_m1_test. Fixtures criam/removem bases próprias; comandos integração exigem cwd apps/backend por causa de yarn prisma migrate deploy. Não ler .env/mailbox nem migrar dev. Nunca tsc. Lint de src/tests com ../../node_modules/.bin/biome check src tests, pois mailbox local ignorada contém artefatos que entram no lint global.

Checkpoint BE-035: P-61, api-contracts/data-model/perguntas atualizados antes do código. Schema ClinicalEvolution/EvolutionDraftCommand e migration202611250035 escritos; Prisma validate/generate passaram. A migration explicita finalizedAt não nulo e reforça endedAt não nulo de encontro completed (SQL CHECK com NULL não basta). Ainda faltam portas/use case/adapter/HMAC/HTTP/DI/testes; BE-035 NÃO concluída nem commitada, nenhuma cobertura declarada. HEAD continua f96c032, goal M2 ativo. Sem processo de teste vivo neste ponto.

## BE-035 — backend verificado

P-61/contratos concretizados e código completo de draft cifrado, CID snapshot, nonce/HMAC, recuperação/409 seguro. Escrita vinculada à consulta do encontro e guard BE-032 correspondente; nova consulta permite recuperar draft anterior mas não editá-lo se origem expirou. Dois recursos com mesmo nonce concorrem sob lock e não deixam versão parcial. Finalizada imutável, sem implementar finalize/adendo antecipadamente. Nullable timestamps SQL reforçados. Suporte M2 de testes em tests/support/m2-clinical.ts cria consulta/reserva/vínculo atomizados e usa API de início, com fixture explícita de encontro antigo ainda em andamento.

12/12 específicos,42/42 regressão (`/tmp/vidaplena-be035-regression.log`, sessão63540, saída0),28/28 Node (`/tmp/vidaplena-be035-node.log`, sessão9283), lint266 e Prisma validate/generate/diff aprovados. Primeira execução de Biome exigiu segunda passagem de formatação no encadeamento de método; lint final limpo. Sem processo vivo neste checkpoint, sem tsc/banco dev. CID do BE-034 integrado em payload clínico; TUSS BE-040, autoria finalizada BE-036, alertas BE-037 e autosave FE-022 permanecem.19 specs M2 sem implementação, objetivo integral ativo.

## BE-036 — retomada

HEAD d299def, worktree inicialmente limpa. BE-03638 linhas relida integralmente. Usuário aprovou queixa/conduta obrigatórias; decisão persistida em P-62/contratos/parâmetros antes do código. Próximo: models/adendos/retenção, finalização/leitura/autoria, integridade/anexos e testes. Não declarar cobertura até verificar. Objetivo continua M2 inteira (19 specs restantes), sem M3. Sem processos vivos ao retomar; não ler .env/mailbox nem usar tsc.

## BE-036 — verificada localmente

Finalização/adendos/retenção e autorização de autoria própria implementadas. P-62 aprovada pelo usuário: queixa/conduta obrigatórias via clinical.evolution_required_fields; restante opcional. Hash canônico versionado verifica payload/snapshot/anexos; adendo cifrado append-only do autor. Encerramento do encontro/consulta, liberação da reserva, CareLink pelo término real, timeline e retenção atômicos. Constraints/triggers bloqueiam alteração/exclusão/TRUNCATE e arquivos finalizados; download valida hash antes de devolver bytes. Signature legal não fornecida.

120/120 regressão (`/tmp/vidaplena-be036-regression.log`, sessão32657 saída0), revisão final12/12 (`/tmp/vidaplena-be036-canonical.log`, sessão95015 saída0), restore lógico1/1 (`/tmp/vidaplena-be036-final-restore.log`, sessão80215 saída0),28/28 Node,2/2 Vitest e lint277 aprovados. Suítes sobrepostas. Rerun cobre CID congelado após troca de catálogo, TRUNCATE e UUID maiúsculo no adendo. Primeiro lint após resumo usou cwd raiz e recusou configuração aninhada; reexecutado corretamente no workspace sem alterar configurações. Restore controlado usa PG17 do container descartável; não é homologação pgBackRest/P-07. Banco dev intocado; nenhum tsc. Porta atual de teste32768 (confirmar se reiniciar).

Constituição48, overview47, ordem160, matriz271, BE-03638 originais e AGENTS54/README105 originais relidos da primeira à última no disco, com continuação após saída inicialmente truncada. BE-030 fecha teste de autoria real; alertas BE-037, TUSS BE-040 e autosave FE-022 seguem pendentes.18 specs sem código (7BE+11FE); objetivo integral M2 continua ativo. Próxima BE-037, sem M3.

## BE-037 — início

BE-036 commitada em470cb64, worktree limpa antes da próxima. BE-03738 linhas, política de acesso45 linhas e contexto RF-018/Design System18.1 lidos diretamente. P-63 concretiza eventos append-only, confirmação explícita e versão/paginação antes do código. Escopo apenas alertas/header, associação prescrição BE-039 permanece futura; objetivo M2 integral ativo.

## BE-037 — verificada localmente

Eventos append-only cifrados, criação/confirmação/desativação com autoria/versão/locks, header ativo permanente e lista paginada por paciente/estado. Pré-consulta omite eventos/inativos, urgência só lê e mutações exigem vínculo durante atendimento. Trigger exige evento inicial na criação e impede UPDATE/DELETE/TRUNCATE. Uma transição concorrente vence; auditoria falha reverte tudo. Associação de substância/ciência em prescrição fica BE-039.

82/82 regressão BE-030–037 (`/tmp/vidaplena-be037-regression.log`, sessão42101 saída0), revisão10/10 (`/tmp/vidaplena-be037-final-integration.log`, sessão19109 saída0),28/28 Node,2/2 Vitest (sessão41107 saída0), lint285 e Prisma validate/generate/diff aprovados. Primeira rodada6/9 falhou em fixtures: nomes de contas inexistentes e tentativa de mudar reserva imutável. Corrigidas fixtures com contas reais e novas reservas/consultas, sem enfraquecer regras;9/9 depois10/10 passaram. Alerta persiste em novo atendimento e pós-consulta só lê. Todos testes em bancos descartáveis, dev intocado, nenhum tsc.

BE-03738 linhas e access-policy45 lidos da primeira à última; constitution48, overview47, ordem160 e matriz271 originais relidos completamente, inclusive continuação de saída truncada.17 specs sem código (6BE+11FE); M2 integral ativa, próxima BE-038. Sem processo de teste vivo neste checkpoint.

## BE-038 — início

BE-037 commitada em4569c51; worktree limpa antes da próxima. Spec38 linhas lida integralmente, da primeira à última; contratos M2/Q-10/P-02/RN-009 e DRS NF017 usados diretamente. P-64 concretiza catálogo/engine/bytes canônicos sem templates clínicos antecipados; dependência explícita BE-032 adicionada (encounters). Biblioteca canonicalize conforme documentação oficial https://github.com/erdtman/canonicalize e RFC8785; Context7 indisponível, docs oficiais consultadas. Instalação autorizada pelo usuário. Nenhuma cobertura declarada ainda; objetivo M2 inteiro ativo.

## BE-038 — fundação verificada localmente

Catálogo versionado/semeado e engine documental cifrado com canonicalize5.1.0, provider dev/disabled, anulação append-only e verificação pública segura. Políticas de payload concretas permanecem BE-039/040/042; runtime sem policy nega503, fake de payload só no teste. Assinatura simulada nunca é issued_valid, bloqueada em staging/production. JSON canônico é artefato técnico; PDF/templates integram consumidores.

53/53 regressão BE-032/033/036/037/038 (`/tmp/vidaplena-be038-regression.log`, sessão66201 saída0), revisão13/13 (`/tmp/vidaplena-be038-final-integration.log`, sessão45013 saída0),31/31 Node (sessão95881 saída0),2/2 Vitest (sessão99535 saída0), lint297 e Prisma validate/generate/diff aprovados. Instalação canonicalize terminou em217s, sem mudar versões das outras libs; lock reordenou entradas QR existentes. Testes provam migrate deploy repetido, versão/concorrência, leitura/urgência, anulação/substituição, arquivo imutável, rollback e hash após alteração de restore simulado. Código público expõe somente metadados, rate limit persistente ignora XFF não confiável. Sem banco dev/tsc.

BE-03838 linhas, service509 e adapter348 revistos integralmente da primeira à última, sequencialmente; último bloco relido após revisão de autorização da substituição. Sem processos de teste vivos.16 specs sem código (5BE+11FE). Próxima BE-039; objetivo M2 inteira permanece ativo, sem M3.

## BE-039 — início/plano técnico

HEAD1868fdc (BE-038), worktree limpa antes da próxima. BE-03938 linhas e FE-02438 linhas lidas integralmente, da primeira à última; RF-019 no DRS e contratos/modelo/P-02/P-13 diretamente do disco. P-65 concretizado antes de código; nenhuma implementação BE-039 escrita ainda.

Próximos passos, uma única spec: modelos MedicationCatalog/Entry/Selection separados de CID/TUSS (não quebrar dataset anterior), CLI demo/load sintético versionado; PrescriptionAllergyAcknowledgement append-only; ClinicalDocument.copiedFromDocumentId FK imutável. Engine recebe prepare opcional de policy na mesma transação e método reuse validando sourceSubject antes de conteúdo. Policy prescription registra validação/preparo/checagem e ack transacional; root registra somente prescription, mantém demais policies ausentes até BE-040/042. Busca oficial usa rota já planejada `/terminologies/medications`.

PDF via pdf-lib + @pdf-lib/fontkit, Noto Sans OFL bundled (fonte/license/checksum); docs oficiais consultadas https://pdf-lib.js.org/docs/api/classes/pdfdocument e licença https://github.com/notofonts/noto-fonts/blob/main/LICENSE. Baixar fonte por commit fixo e ler licença inteira. Render deve preservar texto e falhar com mensagem segura para glyph não suportado, sem substituir silenciosamente conteúdo clínico. Stage do PDF antes de canonical/signature, com código/signatário/data/selo conhecidos; JSON canônico novo v2 inclui arquivos/id/hash e origem da cópia, suporte v1 permanece. PDF não inclui hash canônico para evitar ciclo; código verifica metadados.

Adicionar port DocumentArtifactWriter.stage(tx,document,signer,issuedAt,code,provider) => {fileId,discard}, injetado no engine para prescription. Persistir FileObject via método do mesmo ClinicalDocumentTransaction (NÃO FileRepository.create, que abre outra transação e disputa lock do documento). Em erro externo à transação chamar discard do arquivo provisório; normal sucesso conserva. Associa arquivo enquanto draft, então congela e cria timeline/auditoria. DocumentFilePolicy revalida GET/hash/vínculo e delega outros tipos a EvolutionFilePolicy. FileStorage valida SHA antes de bytes. Preservar root38 testfake engine sem writer para policies fictícias; runtime39 usa writer real para prescription.

Testar campos/busca/CLI/versões, alergia estruturada/textual/manual/nova entre preview e issue, ciência+rollback, controlado recusado, cópia original intacto, dev/disabled/prod, PDF real com selo/glyph/acesso/auditoria/expiração, imutabilidade e lint antes do commit. Ainda16 specs sem código (BE-039–043+11FE); M2 integral ativa, sem M3. Nenhum processo vivo neste checkpoint. Node22.22; banco descartável vp-m1-postgres-test porta32768; confirmar se reiniciar; cwd de integrações apps/backend. Não ler .env/mailbox; nunca tsc.

### Checkpoint parcial BE-039

Modelos/migration202611250039 de medicamentos/cópia/ciência escritos; Prisma validate/generate aprovados (sessão39366). Portas Medication/DocumentArtifact, adapter MedicationStore, validação Zod/dataset sintético3 itens, ManageMedications e CLI escritos; DI medicações e composição no DocumentStore em construção. ClinicalDocumentTransaction agora compõe MedicationTransaction e declara attachDocumentFile/ack; adapter os implementa, mas engine ainda NÃO chama prepare/reuse/artefato/v2. Não executar CLI até validar lint/DI e testar banco descartável. Nenhuma cobertura BE-039 declarada.

pdf-lib1.17.1 e @pdf-lib/fontkit instalados (sessão77833 terminou saída0); fonte Noto Sans baixada do commit ffebf8c1ee449e544955a7e813c54f9b73848eac, com fonte/OFL/source.json em infrastructure/documents/assets. OFL94 linhas lida inteira da primeira à última, permite redistribuição/embedding com copyright/licença preservados. Manifesto inclui SHA256. Sessão59992 terminou saída0. Nenhum processo vivo neste checkpoint.

Faltam engine prepare/reuse/v2/artifact stage+cleanup, schema/port de prescrição, policy+checagem/ciência, PDF renderer/writer, FilePolicy, rotas/OpenAPI/DI completas e testes/lint/commit. Regras de renderer: fonte Unicode licenciada, erro seguro para glyph não suportado (sem substituição silenciosa), quebras/páginas sem cortar texto, selo em todas páginas; renderizar antes de canonical/sign, mostrar código e URL de verificação (sem hash canônico para evitar ciclo); v2 inclui arquivo/hash. Não retornar emissão completa antes disso. HEAD1868fdc, M2 inteira ativa (16 specs sem conclusão).

## BE-039 — backend verificado localmente

Engine prepare/reuse/v2/artefato, policy de prescrição/ciência, catálogo/CLI, PDF e autorização de arquivos completos.14/14 específicos (`/tmp/vidaplena-be039-final-integration.log`, sessão39849 saída0),110/110 regressão BE-030–039 (`/tmp/vidaplena-be039-regression.log`, sessão36143),4/4 M0 arquivos/consentimento em base-base descartável extra (`/tmp/vidaplena-be039-m0-files-consent.log`, sessão38741 saída0),31/31 Node (sessão10676),2/2 Vitest (sessão90777), lint314 e Prisma validate/generate/diff aprovados. Conjuntos se sobrepõem.

Primeiro smoke0/2: projeção do MedicationEntry espalhava campos Prisma extras, causando conflito no snapshot; corrigida projeção explícita. Smoke1/2 seguinte revelou variável SQL kind ambígua na constraint de ciência; renomeada document_kind. Smoke2/2 passou. Rodada26 teve25/26 porque assert.rejects recebeu erro síncrono de validação; assert.throws corrigiu teste. Revisão14/14 inclui v1, nomes/manuais, CLI/busca/cursor, catálogo novo, cópia imutável sem ciência antiga, controlado/disabled, rollback+remoção do PDF, links/permissão/auditoria e glyph não suportado. PDF de22 páginas conferido por pdftotext (selo/identificação em todas,30 fins de item completos) e screenshot da primeira página. Testes não dependem de Poppler. Artefatos fictícios `/tmp/vidaplena-be039-review-a.*`.

Serviço documental664, adapter454 e policy208 lidos no disco em blocos sequenciais até o fim, da primeira à última; OFL94 integral e specBE-03938 integral. P-13/P-02 seguem antes de emissão real, publicação/paciente integra BE-043/FE-027; sem banco dev e sem tsc.15 specs sem código (BE-040–043+11FE). M2 integral ativa; próxima BE-040. Antes de iniciar, confirmar término da sessão36143 e commit desta entrega.

## BE-040 — início/plano

HEADafebacb (BE-039), worktree limpa antes da próxima. BE-04038 eFE-02538 linhas lidas integralmente, RF-020 e contratos TUSS/documentos/parameters consultados no disco. P-66 documenta privateVisit explícito no pedido (agenda não contém classificação financeira), snapshotTUSS, índice ExamOrder e fila autorizada antes de código. Objetivo M2 inteiro ativo (15 specs sem conclusão), sem M3.

Plano da spec: criar ExamOrder (id,documentId único,createdAt,resultReceivedAt?), identidade imutável e registro durante beforeIssue no mesmo tx; orderedAt/solicitante/paciente derivados de documento, payload JSON cifrado sem tabela de itens duplicada. Somente BE-041 habilitará recebimento com resultado real; não criar resultado/upload agora. Adicionar ClinicalDocument.examOrder? no Prisma/port/view/schemas e DocStore.scope com TerminologyTransaction, reutilizando PrismaTerminologyStore/ManageTerminologies.procedureSnapshot. Registro de ExamOrder deve exigir tipo exam_order e draft (emissão ocorre no mesmo tx), sem DELETE/TRUNCATE.

Policy exam_order: template1, privateVisit boolean obrigatório, exams1–30, indicação1–2000, manual descrição1–500; ausênciaTUSS só particular; seleção resolvesnapshot servidor e revalida versão antes de emitir. Estabilizar seleção TUSS com shared advisory lock (estender lockTerminology(kind,shared?) mantendo loader exclusivo), sem serializar todos emissores por exclusividade global. HTTP parser/contratos e root registram exam_order além de prescription, sem ativar demais tipos. Reuso herda engine, resolve código vigente para nova cópia.

Refatorar PDF para base compartilhada/template de exames (sem duplicar paginação/fontkit/selo); writer stage passa a aceitar prescription/exam_order, files vinculados antes de canonical-v2 e rollback/cleanup existentes. Não tocar regras Rx nem legalprovider.

Fila GET /clinical/exam-orders/pending: próprio solicitante, opcionalpatientId/cursor, cutoff por exam.pending_result_alert_days, não anulado/sem recebimento/issued; SQL filtra autorização e escopo antesLIMIT30; AuthorizeClinical.basis revalida cada item (nega pre), audita paciente/recurso/base. SQL autorização: CareLink ativo/com janela atual, appointment não cancelado com paciente/prof corretos e startsAt<=now, shared_case com parent appointment ativo/vigente/não-pre, substitution válido; ou EmergencyGrant vigente sem revisão rejeitada. Cursor escopado ao mesmo filtro/autor. Retornar só orderId/documentId/paciente/data/status, detalhe por GET clínico. ParâmetroEXAM_PENDING_RESULT_ALERT_DAYS Zod/parameters.env map; relógio injetado para testarlimiar. Índiceautor/status/issuedAt/id.

Testar TUSSopcional/inválido/versão/snapshot congelado, providerdisabled/dev/PDF, pendência limiar/autorização/cursor/filtros e estado após resultado como integração BE-041 futura; regressãoRx/M0arquivos conforme mudança, lint, docs/matriz e commit. Não tsc/devDB. Sem processos vivos após fim da sessão36143 (saída0). M0extra38741/Node10676/Vitest90777 também terminaram saída0.

Atenção futura BE-042: RF-021 do DRS admite atendimento concluído; writer genérico atual exige in_progress para todos (P-64). Ao selecionar BE-042, registrar e implementar exceção por policy para documentos permitidos com vínculo pós-atendimento, preservando RF-019/020 em andamento. Não alterar isso nesta BE-040.

## Retomada M2 — fechamento BE-040

Usuário reativou o objetivo integral M2 em25/11/2026; investigação do seletor profissional foi cancelada pelo usuário como resolvida. Worktree limpa em689f71c, que já contém o código BE-040 junto da correção M0 de convites. Não reescrever esse commit. BE-040 ainda sem fechamento documental; nenhum código BE-041 iniciado.

A antiga regressão completa `/tmp/vidaplena-be040-full-m2.log` terminou117/118: upload acima do limite do ImportedHistory travava330s e devolvia408 em vez de422. Não tratar como full aprovado. Causa: pipeline de armazenamento destruía stream do Busboy ao recusar tamanho; parser não terminava o multipart. Adaptadores HTTP agora envolvem o stream em Readable.from(stream.iterator({destroyOnReturn:false})), preservando o consumo/dreno do request após recusa, sem mudar limites ou scanner. Mesma correção aplicada ao termo presencial. Referência primária Node22: https://nodejs.org/docs/latest-v22.x/api/stream.html#readableiteratoroptions. Testes de excesso têm deadline explícito para detectar o travamento sem aguardar timeout de servidor.

Revisão17/17 (`/tmp/vidaplena-be040-resume.log`, sessão33876 saída0),8 BE-040+9 histórico; regressão M0 arquivos/consentimento4/4 (`/tmp/vidaplena-m2-upload-m0.log`, sessão89188 saída0), incluindo excesso presencial; Node31/31, Vitest2/2 e lint322 aprovados. Todos em bancos/arquivos descartáveis. Sem tsc. Estes testes corrigem a falha conhecida; não equivalem a novo full118/118. Próximo: commit da correção de stream e fechamento de cobertura BE-040; depois BE-041, mantendo11 FE no escopo integral.

BE-040 fechada documentalmente após revisão acima; código principal já estava no commit689f71c do usuário, correção de streaming em a07b131. Quatro critérios de aceite e dois itens de DoD verificados por8 testes específicos; PDF18 páginas conferido anteriormente, com todos30 marcadores de fim. Constituição48, overview47, ordem168 e BE-040/04138 originais lidos diretamente, da primeira à última; matriz M2 atual conferida.14 specs sem fechamento: BE-041–043+11 FE. Não iniciar M3; próximo BE-041. Objetivo integral M2 ativo, sem nova pausa solicitada após retomada.

## BE-041 — início/contratos

HEAD71a9307; worktree limpa antes de selecionar BE-041. Spec38 linhas e política de acesso45 lidas integralmente; DRS RF020 e contratos/modelo/parâmetros de arquivo consultados diretamente. P-68 registrado antes de código. Ainda14 specs sem fechamento; não confundir upload com publicação BE-043 ou integração clínica válida em produção.

Plano: ExamResult append-only + arquivo result imutável/FK, projeção primeira data recebida em ExamOrder, generalizar ClinicalRetentionEvent para encounterId XOR examResultId. Resultado/pedido precisam mesmo patient/record, documento emitido não anulado; preservar canônico do pedido (metadado de recebimento não faz parte dos bytes v2). Store transacional compõe ClinicalRecordStore e usa lock identidade775001 para consentimento/representação frescos, depois patient/order/file; upload em duas etapas prepare/commit com rechecagem e compensação de órfão. Só paciente próprio/dependente consentido e recepção/MFA; nenhum upload profissional/admin por papel. Read detalhado/lista profissional com AuthorizeClinical não-pre; FilePolicy delega demais recursos, nega recibo para recepção/paciente até BE-043. Notificação exam.result_received segura/deduplicada ao solicitante, revalida consentimento/conta/resultado na entrega.

Adicionar ExamResult aos mecanismos de orphan reconcile/FileRepository.discardUnlinked/ManageFiles.discardUnlinked; nenhum arquivo associado pode ser removido. Stream multipart usa a correção a07b131 (iterator destroyOnReturn false), limites por file.result_max_mb e parser resultFile único. Lista clínica com cursor por receivedAt/id e filtro orderId dentro do mesmo patient. Retenção usa parâmetro privacy.clinical_retention_years com piso legal já existente; evento permanece append-only. Novas rotas GET detalhado/lista e POST multipart no OpenAPI, schemas Zod únicos; registrar DI evitando ciclo Files↔Results (serviço de resultado depende só de store/authorization/audit, controlador coordena ManageFiles).

Próximos passos: models/migration e Prisma validate/generate; portas/store/serviço/política/multipart/rotas/DI/evento; testes de upload inválido/limite/IDOR/dependentes/consentimento revogado entre prepare/commit, recepção cega, resultados externos/timeline, notificação/rollback/expurgo de órfão, fila BE-040 após resultado real, retenção e imutabilidade; lint, matriz e commit. Nenhum código BE-041 escrito neste checkpoint, sem processo de teste vivo. Testes Node22.22, banco descartável vp-m1-postgres-test porta32768 (confirmar se reiniciar); cwd apps/backend. Não acessar .env/banco real, nunca tsc. M2 integral ativa, sem M3.

## BE-041 — fechamento local em26/11/2026

- Contratos P-68 escritos antes do código; uma spec por vez. Releitura integral nesta retomada: constituição48 linhas, overview47, ordem168, matriz283 e BE-04138, da primeira à última; contexto de acesso45 e seções M2/Arquivos lidos diretamente do disco. Leituras anteriores continuam registradas nos lotes precedentes.
- Migration `202611260041_exam_results`: resultado/arquivo imutáveis, binding paciente/pedido/ator, primeira data recebida, retenção com exatamente uma origem (`encounterId` ou `examResultId`) e projeções verificadas ao commit. Migrations existentes de finalização continuam passando. Prisma validate/generate aprovados; apenas bancos descartáveis receberam migrations.
- Portas/use case/store, upload multipart data/resultFile, metadados/lista paginados e OpenAPI pelos mesmos schemas Zod. Upload próprio/dependente ou assistido por recepção com consentimento vigente revalidado; nenhum papel administrativo ou remetente ganha leitura. Profissional com vínculo integral/urgência lê e baixa sob auditoria; pré-consulta negada. Origem externa não inventa solicitante.
- Resultado, primeiro recebimento do pedido, timeline cifrada, retenção, auditoria e outbox transacionais; aviso seguro ao solicitante, com revalidação de consentimento/conta/perfil. Compensação/reconciliador removem só provisórios órfãos. Resultados preservados após revogação; publicação do portal é BE-043.
-13/13 específicas aprovadas com saída0 (`/tmp/vidaplena-be041-tests.log`): inválido/excesso/falsa extensão, IDOR, vínculo do responsável encerrado, consentimento revogado entre upload e commit, supressão do aviso, entrada cega, expiração/token pessoal, DPO/pré/urgência, paginação/cursor, imutabilidade/hash do pedido e rollback por falha real de auditoria. As rodadas anteriores tiveram erros de expectativa/fixture (status/token/base de auditoria/reserva do agendamento); corrigidos sem relaxar permissões do produto. A primeira rodada revelou typo na checagem de perfil do destinatário, corrigido (`active` booleano); envio positivo passou.
-44/44 regressão (`exam-orders`, `imported-history`, `notifications`, `clinical-evolutions`, `clinical-documents`) com saída0, log `/tmp/vidaplena-be041-regression.log`;4/4 arquivos/consentimento M0 com base descartável migrada, saída0, `/tmp/vidaplena-be041-m0.log`. Conjuntos independentes, sem alegação de nova regressão integral M2.
-31/31 Node,2/2 Vitest com saída0; lint331 sem alterações, sem tsc. Logs `/tmp/vidaplena-be041-{node,vitest,lint}.log`. Nenhuma leitura de .env, caixa ou banco real; fixtures efêmeras isoladas.
- Critérios BE-041:4/4 aceite+2/2 DoD comprovados no escopo local. RF-020/RN-012 continuam parciais globais pelos consumidores/portões.13 specs restantes:BE-042/043 e11 FE; objetivo M2 integral preservado. Próxima BE-042.

## BE-042 iniciada em26/11/2026

Spec38 linhas lida integralmente, da primeira à última, com DRS RF-021 e contexto compartilhado. P-69 resolve diferença entre DRS (andamento ou concluído) e base P-64 (só andamento), sem ampliar Rx/exames. Contratos escritos antes do código; modelo textual vazio de desenvolvimento, autoria/vínculo e retenção por emissão. Implementação e testes ainda pendentes neste registro.

## BE-042 — fechamento local em26/11/2026

- TextDocumentPolicy valida certificate/declaration/report/referral, versão1 e texto explícito do profissional. Draft pode vazio; emissão não. Período opcional validado sem inferir duração clínica. Contexto de modelo preenche identificação mínima/atendimento/emitente sem criar conteúdo médico.
- P-69 implementa pré-condição DRS RF-021 (andamento ou concluído) somente nos quatro tipos textuais; autoria e vínculo da consulta during/post, sessão/MFA/profissional atuais. Não reabre agenda/evolução nem amplia Rx/exames/urgência. Correção cria novo original e evento de anulação preservando hash/arquivo/retenção.
- Migration `202611260042_text_documents`: origem clinicalDocumentId na retenção, XOR de3 origens, âncora issuedAt e garantia deferred de retenção junto à emissão textual. Envelope v2 existente preservado. PDF usa renderer/storage/scanner/assinatura existentes, com corpo Unicode, contexto e selo dev por página; sem provider compatível mantém draft. Prisma validate/generate aprovados, migrations só em fixtures descartáveis.
-9/9 integrações HTTP/PostgreSQL específicas com saída0, `/tmp/vidaplena-be042-tests.log`: quatro tipos, níveis, contexto, pós-conclusão e Rx/exames recusados, payload/período/versão, provider disabled, mudança de catálogo, publicação ausente, público seguro, imutabilidade/anulação/retenção, IDOR/autoria/urgência, rollback real de auditoria/arquivo e modelo não implementado.
- Primeira regressão teve59/60 (`/tmp/vidaplena-be042-regression.log`), com única expectativa obsoleta BE-038: relatórios agora têm policy real. Teste passou a usar engine explicitamente sem policy, preservando503/draft e a verificação pretendida. Revisão BE-03813/13 com saída0 (`/tmp/vidaplena-be042-foundation-review.log`); demais consumidores dessa rodada foram47/47 (12 BE-036,14 BE-039,8 BE-040,13 BE-041). Não alegar novo full60/60 de uma execução.
-31/31 Node,2/2 Vitest e lint335 aprovados; logs `/tmp/vidaplena-be042-{node,vitest,lint}.log`. Sem tsc ou banco/dados reais. PDF `/tmp/vidaplena-be042-review.pdf`,6 páginas/180 linhas numeradas conferidas por extração; selo/identificação/atendimento em cada página, primeira página renderizada/revisada visualmente. Arquivo é apenas artefato fictício de teste.
- Aceite4/4 e DoD2/2 verificados no escopo local; catálogo real, texto aprovado/conselhos/assinatura qualificada permanecem P-02, publicação BE-043/FE-026 pendentes.12 specs M2 restantes (BE-043+11 FE); objetivo integral continua ativo.

## BE-043 iniciada em26/11/2026

Spec38 linhas lida integralmente (primeira à última), política de acesso45 e DRS RF-022/RNF-016; contexto M2 do modelo/contratos lido diretamente. P-70 concretiza publicação/revogação, projeção separada de texto interno e confirmação explícita de CID, consentimento/representação atuais e download sob publicação vigente. Contratos escritos antes de código; próximo passo schema/portas/store/use case/HTTP/FilePolicy/testes. BE-012 mantém exportação M0 explícita, sem exportação clínica automática. M2 integral ativa; restam BE-043+11 FE.

## BE-043 — fechamento local em26/11/2026

- PatientPublication preserva fonte/publicador/data/projeção cifrada; apenas acrescenta revogação completa e imutável, com justificativa cifrada. Migration `202611260043_patient_publications` verifica origem/paciente/data/estado e autoria de documento/evolução, índice único parcial de ativo e retenção sem DELETE/TRUNCATE. Prisma validate/generate aprovados e migrations só em fixtures descartáveis.
- Publicação/revogação/lista clínica e histórico/detalhe próprios usam os schemas Zod do OpenAPI. Link assistencial integral para escrita, autoria de documento/evolução, revisão explícita e consentimento atual. Não basta urgência; pré não publica. Paciente/responsável revalida conta/representação/consentimento em cada leitura e download. ClinicalFilePolicy permanece para profissional; nova camada de publicação permite somente arquivo explicitamente publicado, com binding/categoria/hash e autorização atual. Revogar publicação invalida link já emitido, sem apagar original.
- Orientação/resumo são texto específico aprovado para o paciente, separados do payload clínico interno. Somente CID selecionado do snapshot da evolução finalizada, com confirmação explícita e integridade verificada; hipótese/draft/nota interna recusados. PDF pode conter indicação/body clínico já emitido, por isso revisão explícita de todo arquivo é obrigatória. Documento dev/anulado expõe selo/estado, sem campos internos nem justificativa de anulação. Metadata inclui publicador para gestão de ações próprias na UI.
-10/10 integrações específicas com saída0 (`/tmp/vidaplena-be043-review.log`): publicação positiva/negativa, original oculto, resultado só após liberação, orientação/CID sem vazamento, responsável/revogação/IDOR, anulação/dev, fonte/autoria/urgência/papéis, concorrência/rollback e paginação/filtros/cursor; Rx e pedido preservam tipos. Rodadas iniciais4/4 e9/9 também aprovaram, sem somar conjuntos sobrepostos.
- Regressão completa do backend M2 e dependências pertinentes:155/155 com saída0,17 arquivos (`care-links,emergency-access,clinical-records,imported-history,terminologies,evolution-drafts,clinical-evolutions,clinical-alerts,clinical-documents,prescriptions,exam-orders,exam-results,text-documents,patient-publications,files,consent,subject-requests`), `/tmp/vidaplena-be043-full-backend.log`. Base M0 descartável migrada antes dos testes legados. Substitui o erro histórico59/60 de BE-042, sem mascarar execuções anteriores.
-31/31 Node,2/2 Vitest e lint344 aprovados, logs `/tmp/vidaplena-be043-{node,vitest,lint}.log`. Restore1/1 aprovado com pg_dump/pg_restore17 em bases descartáveis (`/tmp/vidaplena-be043-restore-review.log`): evolução/adendo/retenção íntegros, nova publicação preservada e publicação revogada não reaparece após restauração. Não comprova RPO/RTO/infraestrutura produtiva.
- Aceite4/4 e DoD2/2 verificados localmente. RF-005/BE-012 permanece fluxo separado e exportação M0 declarada; nenhuma exportação clínica automática foi adicionada. Jurídico/sigilo/maioridade P-01, validação clínica P-06 e produção permanecem pendentes. Nenhum tsc, dado real, .env, caixa real, deploy ou push.
-14/14 backend M2 encerradas no escopo local;11 FE restantes (FE-021–029/040/041), objetivo integral ativo. Próxima implementação FE-021, sem entrar M3.

### Preparação de leitura da FE-021 (sem código FE ainda)

Fontes lidas integralmente, em blocos sequenciais do disco: `apps/frontend/AGENTS.md`76 linhas; `VidaPlena_Design_System.md`1484 (blocos1–200,201–400,401–600,601–800,801–1000,1001–1200,1201–1400,1401–1484); `specs/frontend/design-system.md`70; `screens-map.md`61; FE-02139. Todas da primeira à última. Next instalado16.3.6; docs locais de use-client123 linhas, useParams84 e dynamic-routes382 lidos integralmente (params Promise e Suspense quando necessário). Continuar com API/tipos/rotas atuais e testes do frontend antes de escrever FE-021. P-06 provisória aprovada não é bloqueio de implementação; ensaio com pessoas RNF-004 é evidência futura, não pode ser marcado como realizado.
