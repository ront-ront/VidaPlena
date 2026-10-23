# Fase 1 — Leitura e inventário

**Estado:** concluída; respostas recebidas em 23/10/2026 e registradas em `specs/04-open-questions.md`. O plano da Fase 2 é elaborado separadamente; este arquivo preserva a extração original do DRS.

## 1. Fontes lidas integralmente

| Arquivo | Linhas | Conferência |
| --- | ---: | --- |
| `docs/architecture.md` | 155 | Lido da linha 1 à 155. |
| `docs/DRS_VidaPlena_Connected_Care.docx.md` | 1.777 | Lido em nove blocos sequenciais, da linha 1 à 1.777. |
| `apps/frontend/AGENTS.md` | 76 | Lido da linha 1 à 76. |
| `apps/frontend/docs/VidaPlena_Design_System.md` | 1.484 | Lido em oito blocos sequenciais, da linha 1 à 1.484. |

Também foram lidos integralmente, apenas para conferir o estado atual do repositório, `package.json` (25 linhas), `apps/backend/package.json` (33), `apps/frontend/package.json` (36), `apps/backend/prisma/schema.prisma` (13) e `apps/backend/docker-compose.yaml` (37), da primeira à última linha de cada arquivo. A lista de arquivos em `src` foi inspecionada, sem leitura do conteúdo desses arquivos. O DRS está não rastreado no Git (`??`); nenhum arquivo existente foi alterado.

### Método de extração

Os IDs do DRS foram normalizados sem mudar seu significado: `RF001` → `RF-001`, `NF001` → `RNF-001`, `RN01` → `RN-001`. Há **32 RF, 25 RNF e 12 RN: 69 requisitos formais**. Cada linha abaixo aponta para sua seção de origem. Os detalhes dos fluxos principal, alternativos, pré e pós-condições pertencem ao respectivo ID e deverão ser desdobrados nos critérios de aceite da Fase 3. As diretrizes dos documentos de front foram consolidadas separadamente como `UI-*`, sem atribuir ao DRS requisitos que ele não nomeia.

## 2. Resumo do sistema (10 linhas)

1. VidaPlena Connected Care é uma plataforma web para uma clínica com cerca de 200 atendimentos diários e oito especialidades.
2. Substitui agenda telefônica/planilha, prontuário em papel e teleconsulta por aplicativos pessoais.
3. Pacientes cadastram-se, consentem, marcam e administram consultas, consultam documentos e participam de teleconsultas.
4. Recepção opera a agenda, agenda em nome de pacientes, registra chegada, ausência, espera e encaixes.
5. Profissionais consultam histórico, registram evolução e alertas, solicitam exames e emitem documentos assinados.
6. Gestores configuram oferta e consultam indicadores e relatórios agregados.
7. Administradores gerem contas, perfis e auditoria, sem acesso clínico irrestrito.
8. A plataforma exige autorização por perfil e vínculo assistencial, consentimento, auditoria e retenção de registros.
9. A arquitetura sugerida separa frontend Next.js e backend Express por API REST, com PostgreSQL/Prisma já presentes no repositório.
10. O DRS prevê quatro sprints, mas a ordem proposta contém dependências que precisam ser reorganizadas no plano.

## 3. Módulos e domínios identificados

1. Identidade, autenticação, sessões, segundo fator e recuperação de acesso.
2. Cadastro de pacientes, profissionais, especialidades e representação legal.
3. Consentimentos, direitos do titular e retenção de dados.
4. Agenda, disponibilidade, recursos/salas, reserva concorrente, cancelamento e reagendamento.
5. Espera, encaixes, notificações, check-in e ausência.
6. Prontuário, evolução, alertas clínicos, histórico e acesso de urgência.
7. Prescrição, pedidos/resultados de exames e documentos clínicos com assinatura.
8. Teleconsulta, sala de espera, mídia, compartilhamento e gravação opcional.
9. Gestão operacional, indicadores e relatórios.
10. Autorização, auditoria, observabilidade, backup, segurança e infraestrutura.
11. Design system, shell de navegação, acessibilidade e responsividade do frontend.

## 4. Requisitos formais do DRS

### 4.1 Regras de negócio — DRS §2.5

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RN-001 | Regra de negócio | Impedir sobreposição de atendimentos confirmados por profissional e por sala/recurso presencial. | DRS §2.5, RN01 |
| RN-002 | Regra de negócio | Duração padrão por especialidade e tipo de consulta, configurável pelo gestor. | DRS §2.5, RN02 |
| RN-003 | Regra de negócio | Exibir ao paciente apenas horários com pelo menos duas horas de antecedência. | DRS §2.5, RN03 |
| RN-004 | Regra de negócio | Auto cancelamento/reagendamento até quatro horas antes; depois, recepção. | DRS §2.5, RN04 |
| RN-005 | Regra de negócio | Lembrete 24 horas antes e registro de ausência sem cancelamento como no-show. | DRS §2.5, RN05 |
| RN-006 | Regra de negócio | Três ausências injustificadas em 12 meses suspendem o autoagendamento. | DRS §2.5, RN06 |
| RN-007 | Regra de negócio | Conteúdo clínico acessível só a profissional vinculado ou em urgência justificada e auditada. | DRS §2.5, RN07 |
| RN-008 | Regra de negócio | Autor pode corrigir evolução até 24 horas; depois, apenas adendo com original preservado. | DRS §2.5, RN08 |
| RN-009 | Regra de negócio | Prescrições e atestados só válidos após assinatura ICP-Brasil. | DRS §2.5, RN09 |
| RN-010 | Regra de negócio | Início da teleconsulta depende de consentimento específico registrado. | DRS §2.5, RN10 |
| RN-011 | Regra de negócio | Gravação opcional depende de consentimento explícito, registrado e revogável. | DRS §2.5, RN11 |
| RN-012 | Regra de negócio | Prontuário retido por pelo menos 20 anos após último atendimento, sem exclusão física nesse período. | DRS §2.5, RN12 |

### 4.2 Funcionais — DRS §3.1, acesso e identidade

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RF-001 | Funcional | Autocadastro e cadastro pela recepção, com CPF único, validações, consentimento e credencial provisória quando aplicável. | DRS §3.1.1, RF001 |
| RF-002 | Funcional | Login para cinco perfis, segundo fator interno, bloqueio por tentativas e auditoria. | DRS §3.1.2, RF002 |
| RF-003 | Funcional | Recuperar senha por link temporário, sem enumerar contas e revogando sessões antigas. | DRS §3.1.3, RF003 |
| RF-004 | Funcional | Registrar, consultar, renovar e revogar consentimento de dados, com versão e histórico. | DRS §3.1.4, RF004 |
| RF-005 | Funcional | Atualizar cadastro, confirmar novos contatos e solicitar exportação/eliminação permitida. | DRS §3.1.5, RF005 |

### 4.3 Funcionais — DRS §3.2, agendamento

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RF-006 | Funcional | Consultar horários por especialidade, profissional, modalidade e período, descontando ocupações e bloqueios. | DRS §3.2.1, RF006 |
| RF-007 | Funcional | Confirmar consulta presencial/remota pelo paciente ou recepção, com duração, sala, notificação e regras de elegibilidade. | DRS §3.2.2, RF007 |
| RF-008 | Funcional | Reservar intervalo de forma atômica e recusar concorrentes sem registro parcial. | DRS §3.2.3, RF008 |
| RF-009 | Funcional | Reagendar mantendo histórico e reserva anterior intacta se nova reserva falhar. | DRS §3.2.4, RF009 |
| RF-010 | Funcional | Cancelar sem exclusão física, liberar horário, notificar e acionar espera. | DRS §3.2.5, RF010 |
| RF-011 | Funcional | Publicar e manter grade, modalidades, intervalos, férias e bloqueios do profissional. | DRS §3.2.6, RF011 |
| RF-012 | Funcional | Gerir espera, ofertas por ordem de chegada e encaixe justificado. | DRS §3.2.7, RF012 |
| RF-013 | Funcional | Enviar lembrete, registrar envio/falha, repetição e resposta do paciente. | DRS §3.2.8, RF013 |
| RF-014 | Funcional | Check-in, horário de chegada, fila do profissional e exceções de atraso/demanda espontânea. | DRS §3.2.9, RF014 |
| RF-015 | Funcional | Conferir e registrar no-show, justificativas e efeito sobre autoagendamento/indicadores. | DRS §3.2.10, RF015 |

### 4.4 Funcionais — DRS §3.3, prontuário

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RF-016 | Funcional | Abrir prontuário por vínculo assistencial, destacar alertas, histórico e auditar acesso. | DRS §3.3.1, RF016 |
| RF-017 | Funcional | Rascunhar, salvar e finalizar evolução com autoria, correção versionada e adendo. | DRS §3.3.2, RF017 |
| RF-018 | Funcional | Registrar alergias/condições críticas, destacar, alertar prescrição e manter histórico de remoção. | DRS §3.3.3, RF018 |
| RF-019 | Funcional | Prescrever, verificar alergias, assinar digitalmente, arquivar e disponibilizar documento verificável. | DRS §3.3.4, RF019 |
| RF-020 | Funcional | Solicitar exames assinados e anexar resultados validados ao pedido/histórico, com notificação. | DRS §3.3.5, RF020 |
| RF-021 | Funcional | Emitir atestados e outros documentos clínicos assinados, arquivados e verificáveis. | DRS §3.3.6, RF021 |
| RF-022 | Funcional | Consultar linha do tempo clínica com filtros e permissões distintas para profissional e paciente. | DRS §3.3.7, RF022 |
| RF-023 | Funcional | Conceder acesso clínico temporário de urgência com justificativa, auditoria e revisão. | DRS §3.3.8, RF023 |

### 4.5 Funcionais — DRS §3.4, teleconsulta

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RF-024 | Funcional | Registrar aceite/recusa versionado para teleconsulta antes da entrada na sala. | DRS §3.4.1, RF024 |
| RF-025 | Funcional | Realizar vídeo vinculado a agenda/prontuário, teste de dispositivos, espera, reconexão e duração. | DRS §3.4.2, RF025 |
| RF-026 | Funcional | Compartilhar e arquivar documentos validados durante a sessão. | DRS §3.4.3, RF026 |
| RF-027 | Funcional | Gravar sessão apenas com consentimento, sinalizar gravação, interromper e descartar trecho após revogação. | DRS §3.4.4, RF027 |

### 4.6 Funcionais — DRS §3.5, administração e gestão

| ID | Tipo | Descrição curta | Origem |
| --- | --- | --- | --- |
| RF-028 | Funcional | Manter profissionais/especialidades, registros profissionais, modalidades e inativação com agenda futura. | DRS §3.5.1, RF028 |
| RF-029 | Funcional | Manter contas, perfis, bloqueio/revogação imediata e proteger a última conta administradora. | DRS §3.5.2, RF029 |
| RF-030 | Funcional | Mostrar indicadores agregados de ocupação, ausência, volume e modalidade com filtros. | DRS §3.5.3, RF030 |
| RF-031 | Funcional | Gerar, exibir e exportar relatórios autorizados, com auditoria e processamento assíncrono quando necessário. | DRS §3.5.4, RF031 |
| RF-032 | Funcional | Consultar/exportar auditoria imutável; destacar urgência e permissões; auditar a própria consulta. | DRS §3.5.5, RF032 |

### 4.7 Não funcionais — DRS §4

| ID | Tipo | Descrição curta e métrica documentada | Origem |
| --- | --- | --- | --- |
| RNF-001 | Não funcional | Agendamento em até 4 interações; 90% em até 3 min sem auxílio. | DRS §4.1.1, NF001 |
| RNF-002 | Não funcional | Ações comuns da recepção em até 2 cliques da agenda, sem recarga completa. | DRS §4.1.2, NF002 |
| RNF-003 | Não funcional | Telas do paciente em WCAG 2.1 AA, contraste ≥4,5:1, teclado, labels e leitor de tela. | DRS §4.1.3, NF003 |
| RNF-004 | Não funcional | Após 1 h de treinamento, 90% da recepção e profissionais executam tarefas definidas sem auxílio. | DRS §4.1.4, NF004 |
| RNF-005 | Não funcional | Evolução finalizada não removível ou sobrescrita silenciosamente; alterações rastreáveis. | DRS §4.2.1, NF005 |
| RNF-006 | Não funcional | Disponibilidade mensal ≥99,7%; manutenção ≤2 h/mês, fora do atendimento e avisada 48 h antes. | DRS §4.2.2, NF006 |
| RNF-007 | Não funcional | Backup diário + incremental contínuo; RPO ≤15 min, RTO ≤4 h; cópia cifrada distinta e teste semestral. | DRS §4.2.3, NF007 |
| RNF-008 | Não funcional | Rascunho preservado a cada 30 s e recuperado; vídeo tenta reconectar por até 60 s. | DRS §4.2.4, NF008 |
| RNF-009 | Não funcional | 95% das leituras <1 s; prontuário <2 s; escritas <2 s sob carga normal. | DRS §4.3.1, NF009 |
| RNF-010 | Não funcional | 200 atendimentos/dia, 60 usuários internos e 40 vídeos simultâneos; +200% de crescimento degrada tempos ≤20%. | DRS §4.3.2, NF010 |
| RNF-011 | Não funcional | Vídeo 720p/30 fps a 1,5 Mbps, latência <300 ms, adaptação e prioridade de áudio. | DRS §4.3.3, NF011 |
| RNF-012 | Não funcional | RBAC no servidor e isolamento por paciente/vínculo; acesso direto por ID/URL não contorna autorização. | DRS §4.4.1, NF012 |
| RNF-013 | Não funcional | Hash bcrypt/Argon2, MFA interno, inatividade interna 15 min, bloqueio após 5 falhas. | DRS §4.4.2, NF013 |
| RNF-014 | Não funcional | TLS 1.3 (mín. 1.2), repouso AES-256, mídia de teleconsulta fim a fim cifrada. | DRS §4.4.3, NF014 |
| RNF-015 | Não funcional | Auditar dados pessoais/clínicos com ator/perfil/tempo/ação/recurso/origem; reter ≥5 anos, imutável. | DRS §4.4.4, NF015 |
| RNF-016 | Não funcional | Direitos LGPD, exportação legível por máquina, eliminação cabível em até 15 dias e dados gerenciais agregados. | DRS §4.4.5, NF016 |
| RNF-017 | Não funcional | Guarda clínica ≥20 anos, ICP-Brasil, telemedicina regulamentada e arquitetura compatível com SBIS/CFM. | DRS §4.4.6, NF017 |
| RNF-018 | Não funcional | Uso integral via navegador sem instalação, inclusive teleconsulta. | DRS §4.5.1, NF018 |
| RNF-019 | Não funcional | Todas as funções do paciente desde 360 px, sem rolagem horizontal/perda funcional; tablet para profissional. | DRS §4.5.2, NF019 |
| RNF-020 | Não funcional | Componentes de biblioteca única, consistentes em ação, data, termos e comportamento. | DRS §4.6.1, NF020 |
| RNF-021 | Não funcional | Erros em linguagem natural com causa e ação; conflito de agenda oferece alternativas. | DRS §4.6.2, NF021 |
| RNF-022 | Não funcional | CID-10, TUSS, interfaces compatíveis com FHIR R4 e troca TISS. | DRS §4.6.3, NF022 |
| RNF-023 | Não funcional | Duas últimas versões de Chrome, Edge, Firefox e Safari, com WebRTC. | DRS §4.7.1, NF023 |
| RNF-024 | Não funcional | Ambientes separados, nuvem no Brasil, monitoramento/alertas e ampliação sem parada programada. | DRS §4.7.2, NF024 |
| RNF-025 | Não funcional | Testar câmera, microfone e banda ≥2 Mbps em ambos os sentidos na confirmação e entrada da sala. | DRS §4.7.3, NF025 |

### 4.8 Restrições e decisões sem ID formal no DRS

- **§1–2:** cinco perfis; paciente com leitura restrita e nenhum poder de editar conteúdo clínico; recepção sem conteúdo clínico; gestor com agregados; administrador sem acesso irrestrito a prontuários.
- **§2.1:** versão inclui os três eixos clínicos e administração; ficam fora faturamento, convênios, estoque/farmácia, internação/leitos, folha e ERP. Notificações e WebRTC são dependências externas; TISS, laboratórios automáticos, pagamentos e interfaces de terceiros são citados como integração futura.
- **§2.6:** entrega incremental em quatro sprints, hospedagem nacional, operação assistida sem interrupção, importação progressiva do papel, certificado ICP-Brasil e encarregado designado.
- **§3.1–3.5:** os fluxos alternativos especificam condições adicionais que a Fase 3 deve conservar: menor representado, especialidade sem teleconsulta, senha provisória, revisão de grade que afete consultas, falha de notificação, ausência por falha da clínica, documento importado identificado, assinatura/retificação e revisão do acesso de urgência.
- **§5.1:** a matriz publicada é de *acoplamento* e inclui dependências recíprocas; não pode ser copiada literalmente como grafo de implantação de specs.
- **§5.2:** os quatro sprints são referência de prioridade; o próprio DRS permite postergar RF012, RF027 e RF031, embora RF012 esteja listado no primeiro sprint. A ordem concreta depende de resolver Q-01/Q-02.
- **§5.3:** mudanças em segurança/sigilo/conformidade exigem parecer do DPO; o processo de governança e versionamento do próprio DRS foi lido, mas não é automaticamente uma feature de produto.

## 5. Diretrizes dos documentos de front, consolidadas para rastreio

Estas entradas têm origem própria e deverão ser referenciadas pelas specs de fundação/tela. `UI-*` designa requisito não funcional de interface, sem renomear os 25 `NF` do DRS.

| ID | Tipo | Diretriz extraída | Origem |
| --- | --- | --- | --- |
| UI-001 | Não funcional | Estética moderna, minimalista, responsiva e operacional; hierarquia, alinhamento, cards e legibilidade; clareza de localização, informação principal e próxima ação. | `apps/frontend/AGENTS.md`, “Regra de Layout e UI”, “Estilo visual”, “UX” |
| UI-002 | Não funcional | Tratar loading, vazio, erro, disabled, hover e focus quando aplicável. | `apps/frontend/AGENTS.md`, “UX” |
| UI-003 | Não funcional | Usar tokens semânticos light/dark, paleta azul/menta/lilás/neutros e distinção entre marca e status. | Design System §§1–7, 25–26, 29.1 |
| UI-004 | Não funcional | Poppins para headings/marca e Inter para conteúdo operacional, com escala documentada. | Design System §8, 29.2 |
| UI-005 | Não funcional | Spacing em base de 4 px, radius moderado, sombras discretas e cards com borda. | Design System §§9–10, 13, 29.3 |
| UI-006 | Não funcional | Motion discreto conforme tokens; evitar animação ornamental em tarefas clínicas. | Design System §11, 23, 29.6, 30 |
| UI-007 | Não funcional | Botões, inputs, campos médicos, badges, textarea e estados conforme padrões; labels persistentes e unidades visíveis. | Design System §§12, 19, 21, 29.3–29.4 |
| UI-008 | Não funcional | Shell desktop com sidebar 280 px, sticky, navegação definida; versão média 220 px. | Design System §14, 20.1 |
| UI-009 | Não funcional | Agenda densa, busca por paciente, indicadores, grade hora/especialidade, status textuais e ações rápidas. | Design System §§17, 31 |
| UI-010 | Não funcional | Prontuário com identificação/alertas do paciente, timeline e evolução ampla com salvamento explícito. | Design System §§18, 32 |
| UI-011 | Não funcional | Breakpoints 1050/760 px, reorganização mobile, agenda com largura útil ≥620 px e scroll próprio. | Design System §20, 29.5 |
| UI-012 | Não funcional | Informação clínica jamais só por cor; contraste, focus ring, labels, texto/status/ícone e legibilidade. | Design System §§5–6, 21, 29.7, 30 |
| UI-013 | Não funcional | Shadcn/ui como base de primitives, ScrollX UI apenas onde apropriado e Lucide linear 16–32 px. | Design System §§22–24, 35–36 |
| UI-014 | Não funcional | Alternância claro/escuro por classe `dark` em `<html>`, persistida em `vp-theme`. | Design System §27 |
| UI-015 | Não funcional | Aplicar checklist de consistência e evitar os antipadrões explicitados para paleta, labels, status e clínica. | Design System §§29–34, 37 |
| UI-016 | Não funcional | Seguir regras locais do Next.js instalado antes de alterar código, devido a mudanças de API/estrutura. | `apps/frontend/AGENTS.md`, “This is NOT the Next.js you know” |

O `global.css` citado por `apps/frontend/AGENTS.md` não traz tokens dentro daquele documento (bloco CSS vazio). O Design System especifica valores explícitos em §§3–4 e §25. A confirmação de precedência está em Q-13.

## 6. Telas extraídas dos documentos de front

Os documentos de front apresentam **duas telas operacionais com layout descrito**. As demais linhas abaixo são *destinos de navegação ou contexto visual*, sem desenho completo; não foram promovidas a layout inventado. O DRS acrescenta jornadas funcionais que exigirão telas/estados, a serem mapeados na Fase 2 após resposta.

| Tela/área | Grau de definição | Objetivo e componentes descritos | Navegação/fluxos documentados | Origem |
| --- | --- | --- | --- | --- |
| Agenda operacional da recepção | Layout explícito | Sidebar, topbar com título/data/busca, cards “consultas hoje/confirmadas/no-show”, grade por hora e especialidade, slots com status. | Sidebar para Agenda, Pacientes, Prontuários, Teleconsulta, Relatórios, Configurações; DRS prevê agendar/reagendar/cancelar/check-in a partir da agenda. | Design System §17 e §31; DRS §3.2, RNF-002 |
| Prontuário clínico | Layout explícito | Cabeçalho com avatar, nome, idade, número, última consulta e alerta; timeline; painel de evolução com textarea, status “Salvo/Salvando/Erro/Rascunho”, salvar rascunho e finalizar. | Acesso pela agenda/fila do profissional; consulta do histórico, edição corrente e retorno ao atendimento. | Design System §18 e §32; DRS §§3.3.1–3.3.2 |
| Página de apresentação/documentação do design system | Exemplo visual, não tela clínica contratada | Hero com gradiente, título, descrição e pills; paleta e amostras de componentes. | Sem fluxo clínico definido; cópia de CSS da documentação em §28 não é requisito do produto. | Design System §§16, 28 |
| Pacientes, Teleconsulta, Relatórios, Configurações | Apenas destinos na sidebar | O design system nomeia os itens, mas não define a composição completa de cada tela. | Navegação lateral a partir da Agenda; casos de uso correspondentes estão no DRS. | Design System §17.2 |

**Lacuna de telas:** login, autocadastro, recuperação de acesso, cadastro/consentimento, agendamento do paciente, espera, painel do profissional, prescrições, exames, documentos, sala de vídeo, gestão de usuários/profissionais, indicadores, relatórios e auditoria são requeridos pelo DRS, mas não recebem layout específico nos dois documentos de front. Q-14 pede a regra de desenho para essas telas.

## 7. Arquitetura sugerida e riscos identificados

### Direção documentada

`docs/architecture.md` propõe duas aplicações independentes, Next.js App Router e Express, por HTTPS/JSON REST. Para o backend, define domínio sem framework, use cases dependentes de portas e infraestrutura de HTTP/banco/integrações. Para o frontend, propõe `app/`, `components/`, `hooks/` e `services/`, com chamadas ao backend concentradas em serviços. O repositório já contém Yarn workspaces/Turbo, Express 5, Next 16, Prisma 7/PostgreSQL e Redis no Docker Compose. Isso foi observado nos manifests e no schema/compose, não inferido como requisito do DRS.

| ID | Risco/problema | Evidência e consequência para o plano |
| --- | --- | --- |
| A-01 | Diagrama de camadas pode induzir dependência invertida. | `architecture.md`, “Express.js com Clean Architecture”: setas sólidas Domain → Services → Controllers → Frameworks, embora a regra escrita diga que externas dependem das internas. O texto deve prevalecer; diagramas futuros precisam mostrar dependência correta. |
| A-02 | Local das implementações de repositório é descrito de dois modos. | “Camadas” as põe junto de Controllers; a árvore as põe em `infrastructure/database/`. Preferir a árvore exige declaração explícita na Fase 2/3. |
| A-03 | Árvore sugerida não é a árvore real. | `architecture.md` usa `src/shared/app.ts` e `src/infrastructure/http/...`; o repositório usa `apps/backend/src/shared/infra/http/app.ts` e `server.ts`. Plano precisa mapear sem mudança silenciosa. |
| A-04 | Contratos e fronteiras de autenticação não foram definidos. | REST/JSON é citado, mas rotas, schemas, erros, RBAC, vínculo assistencial, sessão/MFA e Server Components não têm contrato. Sem contrato único, back/front podem divergir ou vazar dados. |
| A-05 | Concorrência da agenda exige garantia de banco, além do use case. | RN-001/RF-008 requerem exclusão de intervalos por profissional e recurso; uma verificação seguida de insert sem bloqueio/constraint ainda permite dupla reserva. Encaixe “em intervalo já ocupado” de RF-008/RF-012 precisa exceção explicitada. |
| A-06 | Infraestrutura crítica externa está ausente do desenho. | Lembretes, WebRTC com 40 sessões concorrentes, gravação opcional, assinatura ICP-Brasil, anexos, jobs, logs/auditoria, backups e recuperação não têm adaptadores/provedores definidos. Podem afetar custo, segurança e critérios RNF-006–015. |
| A-07 | Mídia cifrada fim a fim e gravação entram em tensão técnica. | RNF-014 exige criptografia fim a fim; RF-027 pede gravação armazenada. A arquitetura precisa dizer onde ocorre a gravação, sob qual chave/acesso e como mantém o caráter fim a fim. |
| A-08 | Fonte de verdade do modelo de dados inicial é incerta. | `apps/backend/prisma/schema.prisma` tem apenas generator/datasource, mas `src/generated/prisma/models/` contém modelos de identidade e auditoria. Não assumir que o código gerado representa schema versionado. |
| A-09 | Roadmap do DRS tem pré-requisitos posteriores. | Sprint 1 agenda precisa RF-028 para profissionais/especialidades e RF-029/RNF-012 para perfis; auditoria desde login e dados clínicos precisa capacidade antes do Sprint 4 RF-032. A matriz §5.1 também tem dependências recíprocas RF-007↔RF-008 e RF-016↔RF-032. |
| A-10 | Requisitos operacionais carecem de estratégia de validação. | RNF-006/007/009/010/011/024 exigem ambiente, carga, métricas e testes de restauração além de lint/teste de unidade; o backend proposto não descreve deployment/monitoramento. |

## 8. Ambiguidades, conflitos e lacunas

As perguntas objetivas, numeradas e com opções de decisão, estão em [`specs/04-open-questions.md`](../04-open-questions.md). Para a Fase 2 são especialmente bloqueadoras Q-01 (ordem de módulos), Q-02 (escopo de desejáveis), Q-03 (acesso do paciente ao histórico), Q-04 (imutabilidade/correção), Q-06 (encaixe) e Q-14 (layouts não documentados). Nenhuma lacuna foi assumida como requisito aprovado.

## 9. Conferência da Fase 1

- [x] Quatro fontes principais lidas integralmente, com contagem e limites registrados.
- [x] DRS percorrido por introdução, contexto, 12 RN, 32 RF, 25 RNF e gestão de requisitos.
- [x] Design System percorrido de §§1–37 e instruções de front lidas.
- [x] 69 IDs formais presentes uma vez neste inventário, separados de 16 diretrizes `UI-*`.
- [x] Telas com layout explícito distinguidas dos destinos apenas citados.
- [x] Questões e riscos registrados sem alterar fontes ou código.
- [x] Respostas do usuário recebidas e registradas; Fase 2 autorizada.

## 10. Decisões posteriores sobre os riscos A-01 a A-10

Em 23/10/2026, o usuário determinou que **todas as recomendações A-01 a A-10 sejam incorporadas ao projeto**. Os fatos da fonte acima não foram reescritos; a aplicação da decisão será explícita em `specs/_work/02-plan.md` e, após aprovação, nas specs da Fase 3.

| Risco | Direção aprovada para o plano |
| --- | --- |
| A-01 | Usar a regra de dependência escrita da Clean Architecture e corrigir a direção das setas no documento de arquitetura das specs. |
| A-02 | Repositórios concretos ficam em infraestrutura; controllers ficam no adaptador HTTP. Portas permanecem internas. |
| A-03 | Mapear a arquitetura à árvore real do monorepo, justificando desvios da árvore ilustrativa de `docs/architecture.md`. |
| A-04 | Definir uma única fonte para contratos de API, dados, erros, sessão, RBAC e vínculo assistencial, consumida por back e front. |
| A-05 | Garantir ausência de sobreposição por transação e proteção no PostgreSQL para profissional e sala; encaixe fora da grade também respeita a regra, conforme Q-06. |
| A-06 | Definir portas/adaptadores e estratégia para notificações, vídeo, assinatura, arquivos, jobs, auditoria, observabilidade, backup e restauração. Adaptadores de desenvolvimento e bloqueios de produção obedecem Q-10/Q-12/Q-17. |
| A-07 | Registrar a diferença entre DTLS-SRTP e criptografia fim a fim; a V1 atende apenas parcialmente RNF-014 e não deverá declarar conformidade integral. Gravação cliente segue Q-11/Q-12. |
| A-08 | Criar modelo Prisma novo do zero; artefatos gerados anteriores foram removidos pelo usuário, conforme Q-23. |
| A-09 | Desdobrar dependências recíprocas do DRS em pré-requisitos técnicos sem ciclos; antecipar cadastro, autorização e escrita de auditoria antes das funcionalidades que os usam, conforme Q-01. |
| A-10 | Incluir especificações e cenários mensuráveis para carga/concorrência, monitoramento, backup/restauração e critérios operacionais; metas pendentes seguem Q-22. |

**Desvios do DRS a manter visíveis:** RN-008/RNF-005 passam a adendo sem edição do original; RN-009/RNF-017 não são cumpridos em produção pelo adaptador de assinatura de desenvolvimento; RNF-013 tem inatividade interna de 30 min por decisão do usuário (o DRS dizia 15 min); RNF-014 tem atendimento parcial; RNF-022 é compatibilidade estrutural sem interfaces operacionais; RNF-009 recebe cenário p95 com exceções documentadas; RN-005 recebe segundo lembrete parametrizável. Ver `specs/04-open-questions.md` para contexto e portões de produção.
