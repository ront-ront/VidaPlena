# Política compartilhada de acesso e projeção de dados

**Origem:** DRS §§2.2, 3.1–3.5, RN-007, RNF-012/RNF-016; decisões Q-03/Q-05/Q-09/Q-20/Q-21. Este é o contrato único de autorização para BE/FE. Toda regra é aplicada no servidor; ocultar controles no frontend é apoio visual, nunca autorização.

## Papéis e concessões

Cinco papéis: `patient`, `receptionist`, `professional`, `manager`, `admin`. A pessoa responsável legal recebe conta com acesso ao portal do paciente e vínculos `GuardianLink` individuais, sem acesso a pacientes fora deles. `privacy.dpo` é permissão direta, atribuível só a `admin`/`manager`, concedida/revogada por admin com auditoria; não cria sexto papel. O último admin ativo não pode ser removido/desativado. Contas internas exigem MFA.

| Recurso/ação | Paciente/responsável | Recepção | Profissional | Gestor | Admin/DPO |
| --- | --- | --- | --- | --- | --- |
| Próprio cadastro e consentimentos | Próprio/dependente vinculado | Cadastro/aceite presencial assistido | Próprio | Próprio | Próprio; DPO lê manifestações |
| Agendamento administrativo | Próprio/dependente, sujeito a RN-003/004/006 | Criar/alterar/check-in/no-show | Ver própria agenda, cancelar atendimento conforme RF-010 | Configurar política e oferta | Suporte administrativo autorizado |
| Grade profissional | Consultar horários publicados | Operar conforme RF-011 | Própria grade | Gerir | Suporte técnico autorizado |
| Conteúdo clínico integral | Não pelo portal comum | Nunca | Com vínculo ativo, autoria própria ou urgência | Nunca por papel | Nunca por papel nem por `privacy.dpo` |
| Projeção clínica publicada | Própria/dependente vinculado | Nunca | Pode publicar e consultar se autorizado | Nunca | Nunca |
| Evolução/adendo | Nunca | Nunca | Atendimento corrente e autoria para adendo | Nunca | Nunca |
| Salas/profissionais/especialidades | Consulta pública do catálogo | Leitura operacional | Leitura operacional | Criar/editar/inativar | Criar/editar/inativar |
| Contas internas/permissões | Nunca | Nunca | Nunca | Convidar recepção/profissional | Gerir contas/papéis e `privacy.dpo` |
| Auditoria e solicitações do titular | Solicitar acesso aos próprios dados; consulta limitada ao próprio pedido | Nunca | Seus atos quando necessário ao fluxo | Apenas com `privacy.dpo` | Admin consulta auditoria; DPO consulta fila/consentimentos |

O admin pode consultar metadados de auditoria, sem payload clínico. A própria consulta/exportação de auditoria é auditada. Consentimentos/revogações e tela do DPO exigem `privacy.dpo`, inclusive para admin; se ninguém detiver a permissão, a fila de solicitações fica acessível ao admin como fallback limitado. `privacy.dpo` vê apenas metadados, consentimentos/revogações e solicitações; nunca evolução, anexos ou gravação.

## Vínculo assistencial (Q-21)

- Entidade `CareLink`: profissional, paciente, origem (consulta/compartilhamento/substituição), início, fim, status, justificativa e quem concedeu. Confirmação da consulta cria vínculo individual; cancelamento antes do atendimento o encerra. No-show preserva janela própria. Novo atendimento renova; após expiração, autor mantém leitura de evoluções de sua autoria.
- Janela anterior, posterior e no-show: `access.link_pre_hours`, `access.link_post_days`, `access.link_noshow_days`. Sem defaults aprovados; a spec BE-030 fica pendente para implementação até decisão. O mesmo vale para `access.shared_case_enabled`.
- Profissional responsável pode compartilhar caso com outro profissional quando parâmetro permitir, com escopo/tempo/justificativa e auditoria. Gestor pode conceder substituição temporária justificada, sem receber acesso clínico próprio. Nenhum profissional herda vínculo automaticamente de outro.
- Sem vínculo, somente RF-023: justificativa obrigatória, expiração por `emergency_access.duration_minutes`, notificação ao admin/DPO e revisão. Toda leitura grava usuário, paciente, recurso, vínculo ou urgência, hora e origem.
- O histórico entre especialidades só se abre sob vínculo ativo; os campos concretos ainda aguardam validação clínica (P-06). A UI não deve antecipar leitura adicional.

## Projeção do portal (decisão técnica Q-03)

**Visíveis quando próprios e liberados:** dados cadastrais, consultas/status, prescrições/documentos disponibilizados, pedidos/resultados de exames, orientações publicadas e resumo com diagnóstico confirmado que o profissional marcou como publicável. O responsável legal vê somente dependente explicitamente vinculado. Documento com selo DevSignatureProvider fica marcado “sem validade jurídica”, sem aparência de documento válido.

**Não visíveis na navegação comum:** rascunhos, evolução integral, anamnese, exame físico, hipóteses, notas internas, justificativa de urgência, alertas de trabalho, auditoria de terceiros, arquivos não publicados e dados de outro paciente. A mera presença no prontuário não publica o item.

RF-005/RNF-016 oferecem solicitação formal de acesso/exportação e revisão pelo responsável designado, separada da projeção comum. A política não extingue direitos do titular. Exceções de sigilo de menores e acesso após maioridade dependem de validação jurídica P-01.

## Regras de autorização por resposta

- API filtra consultas por sujeito autorizado antes de retornar conteúdo; IDs trocados em rota ou payload não ampliam escopo.
- Para recurso sem vínculo, retornar erro genérico `NOT_FOUND_OR_FORBIDDEN` de 404 quando a existência do prontuário seria sensível; autenticação ausente retorna 401. A escolha é decisão técnica de contrato, não uma distinção exibida ao usuário.
- Acesso negado relevante gera auditoria sem conteúdo clínico. Download de arquivo exige autorização atual e registro de cada visualização; URL assinada expira por `file.signed_url_ttl_seconds` e também requer sessão autorizada.
- Revogação de consentimento limita portal/ações imediatamente, preservando dados legalmente obrigatórios em acesso restrito. A regra final requer parecer do DPO/jurídico.
- Gravação de teleconsulta só é acessível ao profissional que atendeu enquanto houver consentimento ativo; acesso do paciente depende de decisão P-09. Recepção, gestor e admin/DPO não recebem o conteúdo.
