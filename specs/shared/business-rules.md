# Regras de negócio compartilhadas

**Autoridade:** DRS §2.5 e respostas Q-01–Q-23 de 23/10/2026. Este arquivo é a única formulação operacional das RN para BE/FE. Texto diferente do DRS é assinalado como decisão do usuário; valores configuráveis vêm de `parameters.md`.

| ID | Regra operacional para as specs | Origem / decisão |
| --- | --- | --- |
| RN-001 | Nenhum atendimento ativo se sobrepõe para o mesmo profissional ou, se presencial, para a mesma sala. A confirmação e realocação são atômicas no PostgreSQL. Encaixe fora da grade continua sujeito à mesma restrição. | DRS RN01; Q-06/Q-07 corrigem fluxo alternativo RF008. |
| RN-002 | Duração padrão depende de especialidade e primeira consulta/retorno e é alterável pelo gestor; mudança da grade não apaga agendamentos existentes. | DRS RN02, RF011/RF028. |
| RN-003 | Portal do paciente oferece apenas início de consulta com antecedência de pelo menos duas horas. Recepção segue política de encaixe/agendamento assistido; nenhum caminho ignora RN-001. | DRS RN03, RF006/007/012. |
| RN-004 | Paciente cancela/reagenda online até quatro horas antes; depois solicita recepção, que registra ator e justificativa. Reagendamento falho preserva o original. | DRS RN04, RF009/010. |
| RN-005 | Lembrete essencial programado segundo `reminder.schedule_hours_before`, default provisório 24 h e 2 h, máximo dois por consulta; ausência não cancelada vira no-show após conferência. | DRS RN05; Q-16 adiciona segundo lembrete. |
| RN-006 | Três ausências não justificadas em 12 meses suspendem apenas autoagendamento, mantendo agendamento pela recepção; falha da clínica não conta. | DRS RN06, RF015. |
| RN-007 | Conteúdo clínico de trabalho só é acessado a profissional com vínculo assistencial ativo ou urgência justificada, temporária e auditada. Paciente/responsável acessa projeção própria publicada conforme `access-policy.md`; recepção, gestor e admin não ganham conteúdo clínico por papel. | DRS RN07; Q-03/Q-20/Q-21 resolvem exceções. |
| RN-008 | Evolução finalizada é travada desde a finalização. Correção em qualquer prazo é adendo/retificação do autor, com justificativa, autoria e data, ligado ao original exibido junto; nunca sobrescrever ou apagar. | **Desvio aprovado Q-04:** substitui a janela de edição direta de 24 h do DRS. |
| RN-009 | Tipo de documento e nível exigido vêm do catálogo configurável. Padrão qualificada para documentos clínicos; declaração de comparecimento simples. Sem assinatura exigida válida, documento permanece rascunho/não válido. DevSignatureProvider mostra “sem validade jurídica” e é bloqueado em produção. | DRS RN09; extensão Q-10. Validação jurídica pendente. |
| RN-010 | Teleconsulta não inicia sem aceite específico versionado para o atendimento; recusa deixa alternativa presencial. | DRS RN10, RF024. |
| RN-011 | Gravação é opcional, tem consentimento separado, indicador visível e revogação que interrompe imediatamente e inicia bloqueio/expurgo de mídia/derivados. | DRS RN11; Q-11/Q-12. Prazo físico pendente. |
| RN-012 | Conteúdo do prontuário permanece por no mínimo 20 anos após último atendimento, sem exclusão física antes do prazo; retenção parametrizada não pode ficar abaixo do mínimo. Gravação de teleconsulta é material auxiliar com prazo próprio. | DRS RN12; Q-11 separa gravação. |

## Fluxos que atravessam módulos

- **Consentimento de dados:** recusa impede cadastro/serviço digital conforme RF-001/004. Revogação suspende portal, notificações e tratamentos só consentidos, preservando dados obrigatórios em acesso restrito; a tabela ainda requer DPO/jurídico (Q-09). Não apagar prova da manifestação.
- **Responsável legal:** possui conta própria e vínculo com cada dependente; cadastra, consente e agenda em nome do menor. Consentimento presencial pela recepção inclui termo assinado, nome, parentesco, data e versão (Q-05). Exceções de sigilo do menor estão pendentes.
- **Notificações:** essenciais e não essenciais têm preferência separada. Essenciais seguem RN-005 e Q-18; sem canal externo, entrega no portal e sinalização à recepção. Revogação de dados bloqueia envios, salvo exigência legal a validar.
- **Documentos clínicos:** prescrição, atestado, pedido de exame, declaração, relatório e encaminhamento pertencem ao catálogo. Assinatura de desenvolvimento não equivale à ICP-Brasil e nunca é apresentada como documento válido em produção (Q-10).
- **Importação:** CSV demonstrativo não cria conta nem envia notificação; origem, importador e data são auditados. Histórico importado é imutável e identificado, sem equivaler a evolução assinada (Q-19).
- **Urgência e DPO:** urgência é para profissional de saúde, com justificativa/expiração/notificação; `privacy.dpo` não abre conteúdo clínico. Ambos geram eventos destacados de auditoria (Q-20/Q-21).

## Limites deliberados da V1

- RF-012, RF-027 e RF-031 estão incluídos por Q-02.
- Integrações FHIR/TISS/laboratórios são futuras; V1 mantém compatibilidade estrutural, CID-10 e TUSS locais (Q-08).
- RNF-014 fim a fim e RN-009/RNF-017 assinatura qualificada real permanecem **parciais** na V1 acadêmica. `../04-open-questions.md` define os portões de produção.
