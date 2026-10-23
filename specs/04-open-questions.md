# Perguntas em aberto — Fase 1

**Estado:** respostas do usuário recebidas em 23/10/2026; decisões e pendências residuais registradas abaixo. As perguntas originais são mantidas para rastreabilidade. Referências usam os IDs normalizados de `specs/_work/01-inventory.md`.

## Decisões que bloqueiam o plano da Fase 2

| ID | Evidência / impacto | Pergunta objetiva |
| --- | --- | --- |
| Q-01 | DRS §5.2 coloca RF-028/RF-029/RF-032 no sprint 4, mas agenda do sprint 1 depende de profissionais, perfis e auditoria desde login. | Os quatro sprints e sua composição são fixos, ou posso antecipar as partes mínimas de profissionais, autorização e auditoria na fundação, preservando os quatro marcos de valor? |
| Q-02 | DRS §5.2 inclui RF-012 no sprint 1, RF-027 no 3 e RF-031 no 4, mas permite postergar os três “Desejáveis”. | Para o conjunto de specs desta versão, devo incluir RF-012, RF-027 e RF-031 como entregas planejadas, ou documentá-los como backlog de versão futura com specs próprias? |
| Q-03 | RN-007 restringe conteúdo clínico a profissionais vinculados/urgência; DRS §2.2.1 e RF-022 dão ao paciente leitura de histórico/documentos, excluindo anotações internas. | Que itens clínicos o paciente pode ler exatamente (evoluções, diagnósticos, prescrições, exames, documentos, orientações), e quais ficam exclusivos do profissional? |
| Q-04 | RN-008 permite correção pelo autor até 24 h; RNF-005 proíbe sobrescrever qualquer evolução finalizada. | Dentro das 24 h, a correção deve gerar versão imutável com original visível e auditoria, ou deve haver outro fluxo de retificação? |
| Q-05 | DRS §2.1 prevê administração de usuários internos e RF-001/004 exigem cadastro e aceite do paciente; não define quem cria conta de gestor/admin/recepção/profissional nem como o responsável legal de menor consente. | Quem provisiona cada perfil interno e quem registra consentimentos/agendamentos de paciente menor ou representado? |
| Q-06 | RF-008 proíbe sobreposição; seu fluxo alternativo e RF-012 admitem encaixe em intervalo ocupado mediante justificativa. | Um encaixe pode realmente sobrepor horário do profissional ou apenas ficar fora da grade em intervalo livre? Se pode sobrepor, quais perfis podem autorizar e qual limite vale para sala/recurso? |
| Q-07 | RF-011, RF-006 e RF-008 envolvem sala/recurso presencial, mas não especificam cadastro, seleção e capacidade de recursos. | A sala/recurso é escolhida automaticamente, pela recepção ou pelo profissional? Quais recursos precisam de cadastro e bloqueio na primeira versão? |
| Q-08 | DRS §2.1 coloca TISS, laboratórios e FHIR como integrações futuras; RNF-022 exige representação CID-10/TUSS e interfaces conformes a FHIR R4/TISS. | Nesta versão, basta preparar modelo/contratos para FHIR/TISS, ou devem existir endpoints/integradores operacionais? Quais terminologias são obrigatórias já no cadastro clínico? |
| Q-09 | DRS §3.1.4 condiciona cadastro digital ao consentimento e §4.4.5 menciona LGPD, enquanto RN-012 exige retenção legal após revogação. | Após revogação do consentimento de dados, quais funcionalidades digitais ficam bloqueadas e quais dados/tratamentos permanecem por outra base ou obrigação? Quem aprova essa tabela? |
| Q-10 | RF-020 submete pedido de exame à assinatura e associa RN-009, cuja redação nomeia só prescrições e atestados. RF-021 cita relatórios/encaminhamentos. | Pedido de exame, declaração, relatório e encaminhamento também exigem ICP-Brasil para emissão válida? Há tipos de documento com assinatura distinta? |
| Q-11 | RF-027 manda descartar trecho já gravado após revogação; RN-012 pede guarda de registros do prontuário por 20 anos, e o próprio RF-027 diz que o prazo de gravações será definido pela clínica. | A gravação integra o prontuário sujeito aos 20 anos, ou tem prazo próprio? Como tratar trecho já gravado, backups e auditoria quando o consentimento é revogado? |
| Q-12 | RNF-014 exige mídia com criptografia fim a fim e RF-027 gravação; a arquitetura apenas cita WebRTC. | Qual solução/provedor de vídeo e gravação está autorizado, e onde ocorre a gravação/decriptação sem contrariar o requisito de criptografia fim a fim? |
| Q-13 | `apps/frontend/AGENTS.md` manda seguir cores do `global.css`, mas seu bloco CSS está vazio; o Design System §§3–4/25 define os tokens. | Confirmam que os valores do Design System são a fonte de verdade para tokens, inclusive se o CSS atual divergir? |
| Q-14 | Só Agenda e Prontuário têm layout detalhado nos docs de front; o DRS exige as demais jornadas. | Posso especificar layouts das demais telas a partir dos fluxos do DRS e dos padrões do Design System, marcando como **proposta de layout**, ou há protótipos/documentos adicionais a incorporar? |

## Decisões de detalhamento necessárias antes das specs correspondentes

| ID | Evidência / impacto | Pergunta objetiva |
| --- | --- | --- |
| Q-15 | RF-002/003 e RNF-013 deixam sem valor política de senha, expiração, segundo fator, duração do bloqueio e validade do link. | Quais valores/canal de MFA e política de senha, expiração, bloqueio e recuperação devem compor o contrato de identidade? |
| Q-16 | RF-012/013/014/015/020/023/029/031 usam prazos/limites não definidos. | Quais valores devem valer para expiração de oferta da espera, repetição do lembrete, tolerância de atraso/no-show, prazo de resultado pendente, duração do acesso de urgência, revisão de conta inativa e limite de relatório síncrono? Posso registrá-los como parâmetros aguardando decisão nas specs? |
| Q-17 | RF-020/026/027 tratam arquivos, mas não fixam formatos, tamanhos, antivírus, política de armazenamento ou acesso a mídia. | Quais formatos, tamanhos máximos, varredura de malware e limites de acesso devem valer para anexos, resultados e gravações? |
| Q-18 | RF-013 cita “canais cadastrados” e DRS §2.1 prevê e-mail e mensagens; a preferência de não receber comunicações conflita com lembrete automático universal RN-005. | Quais canais da primeira versão são obrigatórios (e-mail, SMS, WhatsApp/outro), e o opt-out se aplica a lembretes de consulta ou apenas comunicações não essenciais? |
| Q-19 | DRS §2.6 prevê convivência com processo atual e digitalização progressiva; RF-016/022 mostram histórico importado, mas não há escopo de migração. | Esta entrega inclui importação digital de prontuários/agenda legados? Se sim, quais fontes, responsáveis, validação e data de corte? |
| Q-20 | RF-032 autoriza “Encarregado de dados (DPO)”, mas DRS §2.2 define cinco perfis, sem perfil DPO. | DPO terá conta/perfil próprio, uma permissão atribuível a perfil existente ou acesso formal mediado por administrador? |
| Q-21 | RN-007 fala em profissional “vinculado a um atendimento”, sem dizer quando o vínculo começa/termina; RF-022 inclui histórico entre especialidades. | O vínculo autoriza consulta antes, durante e depois do atendimento? Por quanto tempo e para quais profissionais da equipe assistencial? |
| Q-22 | RNF-009/010 dão metas de latência/carga, mas não definem conjunto de dados, percentil da abertura do prontuário, rede de teste ou interpretação de “crescimento de 200%”. | Qual cenário de teste é oficial para as metas de desempenho: tamanho de histórico/anexos, volume de usuários/dados, região/rede e percentis por operação? |
| Q-23 | O schema Prisma versionado está vazio, enquanto há modelos gerados de identidade/auditoria em `src/generated/prisma/models/`. | Esses modelos gerados refletem desenho já aprovado que devemos preservar como base, ou são artefatos experimentais que não definem contrato? |

## Registro das respostas de 23/10/2026

| ID | Decisão registrada | Estado |
| --- | --- | --- |
| Q-01 | Antecipar o mínimo de cadastros, RBAC e auditoria necessário à agenda; conservar quatro marcos de valor. | Decidida |
| Q-02 | Incluir RF-012, RF-027 e RF-031 no plano da V1. | Decidida |
| Q-03 | Usuário delegou a definição da visibilidade do histórico; política proposta abaixo. | Decisão técnica documentada |
| Q-04 | Evolução finalizada é intocável; toda correção vira adendo/retificação justificado, ligado ao original e exibido junto. | Decidida; substitui edição direta de RN-008 |
| Q-05 | Primeiro admin por seed; admin convida internos; gestor convida recepção/profissionais; contas desativadas; menor vinculado a responsável com conta própria, dependentes e consentimento presencial/portal. | Decidida |
| Q-06 | Encaixe somente fora da grade, em intervalo livre de profissional e sala, com justificativa e autor recepção/gestor; RF-008 nunca admite sobreposição. | Decidida; corrigir redação do fluxo alternativo nas specs |
| Q-07 | Na V1 só salas físicas, capacidade 1, sem exclusão; sugestão automática de sala livre, recepção pode trocar; reserva atômica; remoto sem sala. | Decidida |
| Q-08 | CID-10/TUSS locais estruturados; apenas compatibilidade estrutural com FHIR R4/TISS, sem integração operacional V1. | Suposição de escopo autorizada; validação futura |
| Q-09 | Revogação bloqueia portal/notificações/tratamentos só consentidos; guarda mínima obrigatória com retenção parametrizada e acesso restrito. | Provisória; validação jurídica pré-produção |
| Q-10 | SignatureProvider com DevSignatureProvider sem validade jurídica e bloqueado em produção; catálogo por tipo e nível de assinatura, padrão qualificada salvo declaração de comparecimento simples. | Decidida para V1 acadêmica; validação jurídica e integração real pré-produção |
| Q-11 | Gravação é material auxiliar, não prontuário; retenção própria parametrizada, padrão provisório 30 dias; revogação inicia expurgo de conteúdo/derivados. | Provisória; prazo físico e backup pendentes de validação pré-produção |
| Q-12 | WebRTC peer-to-peer com DTLS-SRTP, sinalização WebSocket própria e VideoSessionProvider; gravação cliente MediaRecorder em RecordingStorage local. | Decidida para V1; RNF-014 parcialmente atendido |
| Q-13 | Design System é fonte dos tokens; a futura spec de frontend manda adicioná-los ao CSS se ausentes. | Decidida; nenhuma edição de CSS nesta tarefa |
| Q-14 | Telas sem layout no documento podem ser propostas a partir do DRS, Design System e referências, com liberdade de melhoria identificada como proposta. | Decidida |
| Q-15 | Valores padrão de identidade parametrizáveis conforme seção abaixo. | Decidida em parte; canal MFA/duração do bloqueio ainda sem valor |
| Q-16 | Nove parâmetros operacionais com defaults provisórios, chaves nas specs e testes, status aguardando decisão. | Decidida como método; valores definitivos pendentes |
| Q-17 | Parâmetros de arquivo, FileStorage e MalwareScanner com adaptadores locais/dev; autorização e auditoria em download; dev scanner bloqueado em produção. | Decidida como método; três escolhas de baixo risco pendentes |
| Q-18 | V1: e-mail e portal; essenciais/marketing separados; SMS/WhatsApp só extensão; revogação bloqueia todos os envios salvo exigência legal. | Decidida como método; categorias essenciais aguardam jurídico |
| Q-19 | Sem migração em massa; CSV demonstrativo de pacientes/agenda e histórico manual, com preview, idempotência, origem e auditoria. | Decidida; dados reais e corte pendentes |
| Q-20 | DPO é permissão privacy.dpo atribuível a admin/gestor, sem acesso clínico; designação e mudanças auditadas. | Decidida; designação formal pendente |
| Q-21 | Vínculo assistencial é entidade própria com janelas configuráveis, autoria preservada, compartilhamento individual auditado e urgência excepcional. | Decidida como modelo; janelas e campos visíveis pendentes |
| Q-22 | Cenário oficial de desempenho, massa, carga e metas p95 conforme seção abaixo. | Decidida como cenário provisório; infraestrutura/metas definitivas pendentes |
| Q-23 | Ignorar artefatos Prisma anteriores; criar schema novo do zero. | Decidida; pasta gerada foi removida pelo usuário |

### Q-03 — política de visibilidade proposta pelo arquiteto

- No portal, o paciente autenticado e seu responsável legal vinculado veem **seus próprios** dados cadastrais, agenda, status dos atendimentos, documentos disponibilizados, prescrições, pedidos e resultados de exames, orientações explicitamente publicadas e resumo de atendimento com diagnóstico **confirmado e liberado** pelo profissional. A existência de um item em prontuário não o publica automaticamente.
- Anamnese, exame físico, hipóteses diagnósticas, rascunhos, evolução integral, notas de trabalho, justificativas de urgência, alertas internos, auditoria de terceiros e arquivos não publicados ficam fora da visualização comum do portal. Um documento emitido via DevSignatureProvider aparece marcado **sem validade jurídica** e não é apresentado como prescrição/atestado válido.
- O direito de solicitar acesso/exportação de dados pelo fluxo RF-005/RNF-016 é separado da visão comum do portal. A resposta passa por revisão do responsável designado e preserva os limites legais aplicáveis; esta política de portal não elimina o direito do titular.
- O responsável legal só acessa dependentes explicitamente vinculados. **Pendência jurídica:** confirmar exceções de sigilo e transição da autorização quando o menor alcançar maioridade. Esta é uma decisão de desenho delegada pelo usuário, sujeita à validação pré-produção.

### Q-05, Q-07, Q-20 e Q-21 — acesso e atores

- Seed único cria o primeiro admin. Admin cria gestor, recepção e profissional por convite de e-mail; gestor cria recepção e profissional. Convite leva à definição de senha. Contas são desativadas, nunca apagadas. Responsável legal tem conta própria, pode ter vários dependentes; recepção pode cadastrar o menor e anexar consentimento presencial assinado. Cada aceite registra nome, parentesco, data e versão do termo.
- Sala V1: nome, status ativa/inativa, capacidade 1; admin/gestor cadastram/editam/inativam. Sugestão automática de sala livre, troca apenas pela recepção, confirmação atômica com reserva do profissional. Sem sala livre, a consulta presencial é recusada. Equipamentos, capacidade >1 e compatibilidade sala/especialidade ficam fora da V1.
- privacy.dpo é permissão em conta interna de admin/gestor, sem sexto perfil. Dá acesso a auditoria, consentimentos/revogações e fila de solicitações; nunca ao conteúdo clínico. Admin atribui/revoga com auditoria; MFA obrigatório; alerta se não houver DPO e fila cai para admin.
- Vínculo clínico: profissional, paciente, origem, início, fim e status. Surge no agendamento confirmado. Pré-atendimento, pós-atendimento e no-show usam parâmetros `access.link_pre_hours`, `access.link_post_days` e `access.link_noshow_days`; cancelamento encerra vínculo pré-atendimento. Novo atendimento renova. Após expiração, profissional lê apenas evoluções próprias. Sem vínculo, só urgência justificada. Compartilhamento pelo responsável e substituição pelo gestor são individuais, temporários e auditados; `access.shared_case_enabled` controla compartilhamento. Recepção não ganha vínculo clínico. Todo acesso registra o vínculo autorizador.

### Q-08, Q-10, Q-12 e Q-13 — limites técnicos aprovados

- V1 sem endpoints FHIR, guias TISS ou laboratórios integrados. Modelo e API devem manter correspondência documentada com recursos FHIR R4/TISS. Diagnóstico tem código+descrição CID-10 com busca local; procedimentos/serviços têm código+descrição TUSS, opcional em consulta particular. Outras terminologias são futuras.
- SignatureProvider tem DevSignatureProvider que registra hash SHA-256, signatário, data/hora e versão, mantém documento imutável e mostra selo **sem validade jurídica**. Bloqueio por configuração em produção. Catálogo: prescrição, atestado, pedido de exame, declaração, relatório e encaminhamento; nível de assinatura configurável, qualificada por padrão em documentos clínicos e simples em declaração de comparecimento. RN-009 é interpretada para todos os tipos clínicos. A simulação não satisfaz a exigência ICP-Brasil de RN-009/RNF-017 em produção.
- VideoSessionProvider usa WebRTC P2P e sinalização WebSocket própria. DTLS-SRTP atende criptografia de trânsito; o requisito de criptografia fim a fim de RNF-014 permanece **parcial/adiado**. Gravação no cliente via MediaRecorder, após consentimento, enviada a RecordingStorage local; servidor não processa mídia. Evolução futura: provedor/SFU com Insertable Streams e política de chaves.
- Tokens visuais vêm do Design System. A implementação futura verifica e completa `apps/frontend/src/app/globals.css`; não há edição de código nas fases de documentação.

### Q-09, Q-11 e Q-18 — consentimento, gravação e notificações

- Revogação de consentimento de dados bloqueia portal, notificações e tratamentos que dependam só desse aceite. Permanecem, com acesso restrito e prazo parametrizável, prontuário, identificação mínima, auditoria, evidências de consentimento/revogação e dados fiscais legalmente obrigatórios. A tabela é **provisória** até aprovação do encarregado/jurídico da clínica.
- Gravação não integra o prontuário nem sua retenção de 20 anos. Default provisório recording.retention_days = 30. Na revogação, interromper imediatamente, bloquear acesso, excluir logicamente gravação/derivados (transcrição, resumo, temporários), programar exclusão física e impedir restauração do conteúdo revogado; backup sai no ciclo de rotação com limite documentado. Auditoria mantém só metadados de existência, autor, consentimento, revogação e exclusão. Evolução assinada permanece. **Prazo de exclusão física não foi definido**: o exemplo de 7 dias era ilustrativo, não decisão.
- V1 oferece EmailSender de desenvolvimento (log/caixa local) e portal; SMS/WhatsApp são stubs de NotificationChannel. Uma mensagem registra categoria, canal, status e preferência vigente. Mensagens essenciais: confirmação, lembrete, cancelamento/remarcação, oferta da espera, recuperação e convite; paciente escolhe canal, mas não desliga categoria. Sem canal externo, entrega no portal e sinalização à recepção. Marketing e pesquisas admitem opt-out total. Revogação bloqueia todos os envios, exceto exigência legal, e recepção deve contatar por outro meio. Validação jurídica da lista de essenciais pendente.

### Q-15 — identidade, defaults técnicos configuráveis

| Chave/tema | Padrão aprovado |
| --- | --- |
| Senha | Mínimo 10 caracteres; bloquear lista de senhas comuns; bcrypt; sem expiração periódica. |
| Tokens | Access token 15 min; refresh rotativo 7 dias. |
| Inatividade | Interno 30 min; paciente 60 min. **Desvio explícito:** DRS RNF-013 diz 15 min para estação interna; decisão do usuário prevalece no plano. |
| Recuperação | Link de uso único por 30 min; até 3 pedidos/hora; resposta genérica e auditoria. |
| Convite/confirmação | Links por 48 h. |
| E-mail | EmailSender com implementação dev em log/caixa local. |

Os valores são padrões técnicos configuráveis sem mudança de arquitetura. Permanecem sem definição: **fator/canal MFA** e **duração do bloqueio após cinco falhas**. O plano reserva essas decisões antes da spec de login. A exigência de MFA e o limite de cinco falhas do DRS continuam válidos.

### Q-16 — parâmetros operacionais provisórios

Registrar em `shared/parameters.md` na Fase 3, cada um com requisito, dono e status **aguardando decisão**. Specs e critérios citam a chave, nunca repetem o valor; testes usam o default.

| Chave | Default provisório | Origem | Responsável / regra |
| --- | --- | --- | --- |
| `waitlist.offer_ttl_minutes` | 30 min | RF-012 | Clínica/gestor; próxima pessoa após expirar. |
| `reminder.schedule_hours_before` | 24 h e 2 h | RF-013, RN-005 | Clínica/gestor; no máximo dois envios. O segundo é adição autorizada ao DRS. |
| `appointment.late_tolerance_minutes` | 15 min | RF-014 | Clínica/gestor; recepção decide remarcar/falta. |
| `appointment.noshow_after_minutes` | 30 min | RF-015 | Clínica/gestor; confirmação manual na V1. |
| `exam.pending_result_alert_days` | 7 dias | RF-020 | Clínica/responsável técnico. |
| `emergency_access.duration_minutes` | 60 min | RF-023 | Clínica/jurídico; justificativa, expiração, notificação e auditoria obrigatórias. |
| `account.inactivity_review_days` | 90 dias | RF-029 | Admin/gestor; revisar/alertar, nunca excluir. |
| `report.sync_max_rows` | 5.000 | RF-031 | Equipe técnica; acima disso assíncrono. |
| `report.sync_timeout_seconds` | 10 s | RF-031 | Equipe técnica; timeout vira assíncrono. |

### Q-17 — parâmetros de arquivos e interfaces

Registrar em `shared/parameters.md`, seção Arquivos: `file.attachment_max_mb` = 10, `file.result_max_mb` = 20, `file.recording_max_mb` = 500, `file.recording_max_minutes` = 60, `file.max_per_record` = 10 e `file.signed_url_ttl_seconds` = 120, todos provisórios; PDF/JPG/PNG para anexos/resultados e WebM para gravação. A associação 10 MB/anexo e 20 MB/resultado segue a ordem da resposta do usuário; confirmar se necessário. Verificar tipo real do conteúdo, gerar nome interno aleatório e autorizar cada endpoint/download com auditoria. Recepção não lê conteúdo clínico; gravação só pelo profissional responsável e, se aprovado futuramente, pelo paciente, com consentimento ativo. Arquivo de evolução assinada é imutável.

FileStorage único tem implementação local por categoria anexo/resultado/gravação. MalwareScanner tem DevMalwareScanner que valida tipo/tamanho e marca `skipped_dev`, bloqueado em produção por configuração; ClamAV/serviço gerenciado e storage externo são extensões futuras. Critérios das specs deverão cobrir tipo/tamanho falsos, acesso negado, link expirado e auditoria. DICOM, limites finais e acesso do paciente à gravação continuam pendentes, sem bloquear a V1 acadêmica.

### Q-19 — importação demonstrativa

Sem migração em massa, OCR ou integração legado. V1 documenta modelo com origem de histórico, lançamento manual por admin/gestor e CSV de pacientes/agenda com layout único em `shared/import-templates.md`, usado com dados fictícios. Admin/gestor pré-visualizam erros/duplicidades por CPF e confirmam; relatório final discrimina importadas/rejeitadas; reimportação idempotente. Profissional pode marcar histórico do próprio paciente como conferido. Parâmetro `migration.cutoff_date` fica aguardando decisão. Registro importado guarda origem/data/responsável, é imutável com correção por adendo, não equivale a evolução assinada, não cria conta nem dispara aviso; consentimento é necessário para acesso digital. Cada lote é auditado. Fontes reais, corte e validador clínico seguem pendentes.

### Q-22 — cenário provisório de desempenho

Registrar em `shared/performance-scenario.md` e parametrizar metas em `shared/parameters.md`. Massa fictícia reprodutível: 5.000 pacientes, 30 profissionais, 100.000 atendimentos, média de 20 evoluções por paciente, um paciente com 300, um anexo de cerca de 1 MB a cada cinco evoluções e 10.000 agendamentos futuros. Carga 50 usuários simultâneos base / 150 pico; aquecimento 2 min e estado estável 10 min, scripts versionados em k6 ou Locust. Ambiente de homologação com máquina de referência descrita, banco equivalente e cliente na mesma região com 50 Mbps/40 ms; 4G secundário. Medir servidor e LCP separadamente.

| Operação | Meta p95 provisória |
| --- | --- |
| Abrir prontuário médio | ≤2 s |
| Abrir prontuário pesado | ≤4 s |
| Buscar paciente | ≤1 s |
| Consultar disponibilidade | ≤1,5 s |
| Confirmar agendamento | ≤1,5 s e zero dupla reserva concorrente |
| Erros | ≤1% |

“Crescimento de 200%” = três vezes a base: cenários separados de carga 3x com massa base e massa 3x (15.000 pacientes/300.000 atendimentos) com carga base, mantendo metas e verificando também a degradação máxima de 20% do RNF-010. Relatório p50/p95/p99 e teste concorrente do mesmo horário. **Desvio explícito:** disponibilidade a 1,5 s e prontuário pesado a 4 s alteram os limites gerais RNF-009; a leitura da agenda e as demais operações não substituídas mantêm os limites do DRS. RNF-010 ainda exige verificar 200 atendimentos/dia, 60 internos e 40 teleconsultas simultâneas. Metas definitivas e infraestrutura-alvo aguardam responsável do requisito.

## Pendências residuais e portões de produção

| ID | Pendência objetiva | Momento |
| --- | --- | --- |
| P-01 | DPO/jurídico aprova bases, bloqueios e retenção na revogação, inclusive valores de `privacy.min_identity_retention_years`, `privacy.consent_evidence_retention_years` e `privacy.fiscal_retention_years`; exceções para responsável legal e lista de mensagens essenciais. | Antes de produção |
| P-02 | Jurídico/conselhos aprovam níveis de assinatura por tipo e integra-se provedor ICP-Brasil real. DevSignatureProvider jamais habilitado em produção. | Antes de produção de emissão clínica |
| P-03 | Jurídico/responsável técnico aprovam prazo de gravação, exclusão física após revogação e prazo máximo de rotação de backup. | Antes de produção da gravação |
| P-04 | RNF-014: definir arquitetura de criptografia fim a fim, chaves e gravação; WebRTC P2P/DTLS-SRTP cobre só transporte na V1. | Antes de declarar RNF-014 integralmente atendido |
| P-05 | Definir fator/canal de MFA, duração do bloqueio por falhas e quantidade de senhas anteriores vedadas (`auth.password_history_count`). | Antes de implementar BE-008/009 |
| P-06 | Confirmar defaults Q-16/Q-17/Q-21: janelas `access.link_pre_hours`, `access.link_post_days`, `access.link_noshow_days`, `access.shared_case_enabled` e campos clínicos entre especialidades. | Antes das specs de vínculo; demais podem seguir com default provisório |
| P-07 | Confirmar dados legados, `migration.cutoff_date`, validador clínico, valores reais de infraestrutura/carga e metas. | Antes de implantação/teste final |
| P-08 | Nome/designação formal do detentor de privacy.dpo e eventual ampliação das funções RF-032. | Antes de produção |
| P-09 | Decidir DICOM, limites definitivos e leitura de gravação pelo paciente; decidir SMS/WhatsApp/provedores futuros. | Evolução ou antes de habilitar função correspondente |
| P-10 | Definir STUN/TURN próprio ou equivalente, fallback de conectividade P2P e método de medição de banda no pré-teste, sem provedor externo de vídeo. | Antes das specs de vídeo/preparo |
| P-11 | Q-19 manda admin/gestor lançar histórico clínico manual, mas RN-007/DRS §2.2 não lhes permite ler conteúdo clínico. Definir se fazem apenas upload/metadados cegos para conferência por profissional, ou se há concessão excepcional auditada com limite de conteúdo/tempo. | Antes de implementar BE-033/FE-029 |
| P-12 | Definir quem publica novas versões do termo de dados e como confirmar telefone novo na V1 sem SMS; definir domínio SameSite/Origin/CSRF da sessão para front/back separados. | Antes de concluir BE-001/009/011 e FE-004/008 |
| P-13 | Confirmar fonte, licença e versão dos catálogos locais CID-10/TUSS e do catálogo pesquisável de medicamentos; definir a regra clínica/regulatória para medicamentos controlados antes de emitir prescrições reais. | Antes de carregar catálogos/produção clínica |
| P-14 | Validar fórmulas de ocupação, absenteísmo e produtividade, formato exportável da V1 e limite `report.aggregation_min_subjects` para suprimir células pequenas sem reidentificação. A proposta técnica M4 usa CSV UTF-8 para relatório operacional e contagens agregadas; nenhuma célula pequena será exibida até o limite ser aprovado. | Antes de liberar painel/exportação em produção |

**Regra de trabalho:** decisões do usuário têm precedência sobre redações conflitantes do DRS, e cada desvio ficará identificado nas specs e na matriz. Pendência não vira fato. Uma spec pode documentar uma chave sem default, mas não deve ser marcada implementável enquanto depender de um valor obrigatório em aberto.
