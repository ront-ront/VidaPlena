# Mapa de telas e navegação

**Origem:** DRS §§3.1–3.5; `apps/frontend/docs/VidaPlena_Design_System.md` §§17–18/31–32 e `apps/frontend/AGENTS.md`. **Agenda operacional e Prontuário** são os únicos layouts clínicos explicitamente detalhados nos docs de front. Todas as outras rotas/layouts abaixo são **propostas técnicas de navegação** autorizadas por Q-14, baseadas nos RF e no design system; não são protótipos originais. Rotas são propostas de contrato de frontend, não texto literal das fontes.

## Shell e rotas públicas

`/` redireciona a `/login` como proposta técnica; a página atual em `/` já contém layout de login, mas validação é simulada. FE-005 conecta a autenticação e mantém o padrão visual útil. Rotas protegidas ficam sob shell por perfil; `/(app)` é grupo de diretório Next sem aparecer na URL. Sidebar operacional cita Agenda, Pacientes, Prontuários, Teleconsulta, Relatórios e Configurações no Design System §17.2; itens só aparecem com permissão, mas servidor revalida cada ação.

| Rota proposta / tela | Objetivo, seções e componentes | Fluxo principal / estados | Origem / FE |
| --- | --- | --- | --- |
| `/login` | Marca, introdução breve, e-mail/CPF, senha, link recuperar, botão entrar, desafio MFA interno. | Após login, painel do papel; erro genérico, bloqueio e loading. Layout atual serve de base, corrigindo simulação. | RF-002, Q-15; FE-005 |
| `/recuperar-acesso`, `/redefinir-senha`, `/convite` | Identificador, mensagem genérica, token de link, senha/confirmar. | Solicitar → e-mail → redefinir/ativar; estados expirado/usado. | RF-003/029; FE-006 |
| `/cadastro` | Dados do paciente, identificação de responsável/dependente, senha, termo versionado, aceite. | Autocadastro adulto ou dependente; falha CPF, validações e recusa. | RF-001/004, Q-05; FE-007 |
| `/minha-conta` | Dados/contatos, dependentes, consentimentos, pedidos de titular. | Editar contato → confirmação; revogar → portal restrito. | RF-004/005; FE-008 |
| `/admin/usuarios` | Lista, perfis/status/último acesso, convite, bloqueio, concessão `privacy.dpo`. | Criar/alterar/inativar; impedir último admin; alertar DPO ausente. | RF-029, Q-20; FE-009 |
| `/recepcao/pacientes/novo` | Dados de paciente/responsável, versão do termo e upload obrigatório do termo assinado. | Recepção cadastra presencialmente; erro de arquivo/CPF preserva formulário; sucesso mostra ID e status de acesso. | RF-001/004, Q-05; FE-039 |
| `/recepcao/pacientes/[id]/consentimento` | Versão vigente, dados do consentinte e novo termo assinado para paciente existente. | Recepção registra aceite posterior sem alterar cadastro nem apagar o termo anterior. | RF-004, Q-05; FE-039 |

## M1 — agenda

| Rota proposta / tela | Objetivo, seções e componentes | Fluxo principal / estados | Origem / FE |
| --- | --- | --- | --- |
| `/gestao/catalogo` | Especialidades, profissionais, duração/modalidades, salas ativas/inativas. | Gestor/admin cadastra e revê impacto de inativação. | RF-028, Q-07; FE-010 |
| `/agenda/grade` | Grade por profissional, faixas, férias, bloqueios e consultas afetadas. | Alterar → revisão de conflito/impacto → publicar. | RF-011; FE-011 |
| `/agendar` | Busca por especialidade, profissional, modalidade/período, dias e slots. | Escolher → confirmar em até quatro interações; vazio oferece próxima data/espera. | RF-006, Design System §17.1 (paciente mais espaçoso); FE-012/013 |
| `/minhas-consultas` | Futuras/passadas, detalhes, reagendar/cancelar, aviso de prazo. | Selecionar → ação → confirmação; conflito preserva original. | RF-009/010; FE-014 |
| `/agenda` | **Layout de origem:** sidebar, topbar título/data/busca, cards total/confirmadas/no-show, grade hora/especialidade/status. | Recepção abre ações em até dois cliques; loading, vazio, conflito, atraso; grade scroll próprio em estreito. | Design System §§17/31; FE-015/016/018 |
| `/agenda/espera` | Fila ordenada, ofertas/TTL, faixa disponível, justificativa de encaixe. | Paciente entra/sai; recepção oferta/encaixa em intervalo livre. | RF-012, Q-06; FE-017 |
| `/importacoes/pacientes`, `/importacoes/agenda` | Upload CSV, preview de linhas, erros/duplicatas, confirmação e relatório. | Arquivo inválido não grava; reimportar não duplica. | Q-19; FE-019/020 |

## M2 — prontuário

| Rota proposta / tela | Objetivo, seções e componentes | Fluxo principal / estados | Origem / FE |
| --- | --- | --- | --- |
| `/clinico/agenda`, `/prontuarios/[patientId]` | **Layout de origem:** identificação/alerta, timeline, área de evolução com badge de salvamento e ações. | Agenda/fila → paciente vinculado → histórico; sem vínculo, negar/urgência. | Design System §§18/32; FE-021/022/023 |
| `/prontuarios/[patientId]/prescricao` | Busca de fármaco, posologia, alerta de alergia, selo de assinatura. | Rascunho → alerta → emissão; dev sem validade jurídica. | RF-019; FE-024 |
| `/prontuarios/[patientId]/exames` | Solicitação, pedido, resultados/anexos e alertas pendentes. | Prescrever exame → anexar resultado → notificar. | RF-020; FE-025 |
| `/prontuarios/[patientId]/documentos` | Tipo, modelo, conteúdo, assinatura/verificação. | Criar rascunho → assinar/emitir; anular com novo documento. | RF-021; FE-026 |
| `/meu-historico` | Linha do tempo e filtros, documentos/resultados/orientações liberados. | Paciente/dependente vê projeção própria; vazio e erro sem vazamento. | RF-022, Q-03; FE-027 |
| `/prontuarios/acesso-urgente` | Justificativa, prazo, aviso de auditoria e encerramento. | Solicitar → acesso limitado → expirar/revisar. | RF-023; FE-028 |
| `/importacoes/historico` | Origem, data, autor anterior, arquivo e conferência. | Lançar histórico → identificar como importado → profissional confere. | Q-19; FE-029; política de acesso pendente P-11 |
| `/meu-historico/exames/enviar`, `/recepcao/exames/enviar` | Identificação do exame, paciente/pedido, arquivo e recibo, sem leitura clínica pela recepção. | Selecionar → validar conteúdo/tamanho → enviar → profissional recebe aviso. | RF-020, Q-17; FE-040 |
| `/admin/documentos/tipos` | Catálogo de tipos, nível de assinatura exigido e estado da configuração. | Admin ajusta nível → salva com auditoria; validação jurídica pré-produção. | RN-009, Q-10; FE-041 |

## M3/M4 — teleconsulta e gestão

| Rota proposta / tela | Objetivo, seções e componentes | Fluxo principal / estados | Origem / FE |
| --- | --- | --- | --- |
| `/teleconsultas/[id]/preparo` | Termo, teste câmera/mic/banda e orientação. | Consentir → testar na confirmação e entrada; recusa oferece presencial. | RF-024/025, RNF-025; FE-030 |
| `/teleconsultas/[id]/sala` | Espera, status conexão, vídeo/áudio, documentos e aviso gravação. | Paciente espera; profissional inicia com prontuário ao lado; reconectar até limite. | RF-025–027; FE-031–034 |
| `/gestao/indicadores` | Cards agregados, filtros período/especialidade/profissional, estado de dados insuficientes. | Filtrar → recalcular; sem dados clínicos identificáveis. | RF-030; FE-035 |
| `/gestao/relatorios` | Tipo/filtros, preview, exportação e job assíncrono. | Solicitar → aguardar/notificar → baixar com auditoria. | RF-031; FE-036 |
| `/admin/auditoria` | Filtros período/ator/paciente/evento, tabela, destaque urgência/permissão, exportar. | Consulta também auditada; sem edição. | RF-032; FE-037 |
| `/privacidade/solicitacoes` | Fila de pedidos, consentimentos, prazos e decisão. | DPO/admin revisa → resolve; sem conteúdo clínico. | RF-005, Q-20; FE-038 |

## Estados e cobertura transversal

Toda tela proposta usa tokens e componentes de `design-system.md`, `lang=pt-BR`, navegação por teclado, labels explícitos e erro acionável. Telas do paciente funcionam desde 360 px sem rolagem horizontal do viewport; grade da recepção pode ter scroll horizontal próprio. Route guard no front indica acesso, mas a API decide permissão. FE de fundação: FE-001 tokens/tema, FE-002 componentes/estados, FE-003 shell/rotas, FE-004 cliente HTTP.

**Cobertura das duas telas explicitamente desenhadas:** Agenda → FE-015/016/018; Prontuário → FE-021/022/023. O hero do Design System §16 e o botão copiar CSS §28 são exemplos da documentação, não telas clínicas obrigatórias.
