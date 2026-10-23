# Visão geral do VidaPlena Connected Care

## Produto e problema

A Clínica VidaPlena realiza cerca de 200 atendimentos/dia em oito especialidades. O DRS §§1–2 descreve agenda por telefone/planilha, prontuário em papel e teleconsulta por aplicativos pessoais, com dupla reserva, lentidão no histórico e fragmentação. A V1 integra agendamento, prontuário, teleconsulta e indicadores em uma plataforma web responsiva.

## Perfis e limites

| Perfil | Tarefas principais | Limite de acesso |
| --- | --- | --- |
| Paciente | Cadastro, consentimento, consultas, documentos publicados, teleconsulta e solicitações de dados. | Só a própria conta e dependentes legalmente vinculados; sem editar conteúdo clínico. |
| Recepção | Agenda, cadastro assistido, check-in, no-show, espera e encaixe. | Dados administrativos; nenhum conteúdo clínico. |
| Profissional | Agenda própria, prontuário de paciente vinculado, evolução, alertas, documentos e teleconsulta. | Vínculo individual ou urgência justificada; atos auditados. |
| Gestor | Profissionais, especialidades, salas, configuração operacional e indicadores agregados. | Sem conteúdo clínico por privilégio de gestão. |
| Administrador | Contas, permissões, auditoria e operação técnica. | Sem prontuário irrestrito; não edita auditoria. |

O responsável legal usa conta própria no portal do paciente e pode ter vários dependentes (Q-05). `privacy.dpo` é permissão atribuível a admin/gestor, sem sexto perfil (Q-20).

## Fluxos principais

1. Paciente/responsável cadastra-se e registra consentimento; recepção pode cadastrar presencialmente.
2. Gestor/admin mantêm profissionais, especialidades, salas e grades. Paciente ou recepção consulta disponibilidade e confirma sem sobreposição.
3. Lembretes, reagendamento, cancelamento, espera, check-in e no-show compõem o ciclo da agenda.
4. Profissional vinculado abre prontuário, registra evolução/adendo e alertas, solicita exames e emite documentos. Paciente vê apenas a projeção publicada.
5. Consulta remota exige consentimento específico e teste prévio, ocorre em sala WebRTC e pode compartilhar arquivos; gravação opcional depende de aceite separado.
6. Gestão consulta indicadores/relatórios; auditoria e DPO acompanham acessos e solicitações do titular.

## Milestones

M0 Fundação técnica; M1 Agenda; M2 Prontuário; M3 Teleconsulta; M4 Gestão e medição. Os quatro últimos preservam os marcos de valor do DRS §5.2. Dependências e lotes: `03-implementation-order.md` e `_work/02-plan.md`.

## Glossário essencial

- **Consulta/agendamento:** reserva de horário para profissional, e sala se presencial.
- **Encaixe:** atendimento fora da grade publicada, somente em intervalo livre e com justificativa (Q-06).
- **Vínculo assistencial:** autorização temporal e individual de profissional para paciente, criada por agendamento ou concessão auditada (Q-21).
- **Prontuário:** histórico clínico permanente; **evolução** finalizada é imutável; **adendo** liga correção justificada ao original.
- **Consentimento de dados, teleconsulta e gravação:** manifestações distintas, versionadas e auditadas.
- **DPO:** encarregado de proteção de dados; no sistema, permissão `privacy.dpo` em conta interna existente.
- **No-show:** ausência sem cancelamento; justificativas e falha da clínica são distinguidas.
- **RPO/RTO:** perda máxima e tempo máximo de restauração, conforme RNF-007.

## Escopo, exclusões e estado de conformidade

O escopo detalhado é o dos 69 requisitos formais no inventário. Estão fora da V1 faturamento/convênios, estoque/farmácia, internação, folha, pagamentos, OCR/migração em massa, integração operacional FHIR/TISS/laboratórios e SMS/WhatsApp operacional. A importação CSV de pacientes/agenda é demonstrativa com dados fictícios; histórico antigo pode ser lançado manualmente com origem indicada (Q-19).

Assinatura simulada não cumpre RN-009/RNF-017 para emissão válida em produção. DTLS-SRTP não encerra a exigência fim a fim de RNF-014. A matriz registra cobertura parcial e `04-open-questions.md` registra as decisões que bloqueiam produção. Acesso do paciente ao histórico segue a projeção Q-03, com solicitação formal de dados em fluxo separado.
