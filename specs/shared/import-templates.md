# Contratos de importação CSV demonstrativa

**Estado:** layout técnico proposto para Q-19; dados reais, data de corte e validador clínico pendentes em P-07. V1 usa exemplos fictícios. Importação não substitui digitalização de prontuário em papel nem migração massiva.

## Regras comuns

- UTF-8, primeira linha de cabeçalho exata, separador `;`, datas civis `YYYY-MM-DD`, timestamps ISO 8601 com fuso, CPF só dígitos após normalização. Arquivo estruturalmente inválido (encoding/cabeçalho/coluna faltante) gera relatório **sem gravar linha alguma**.
- Etapa 1 `preview`: analisar conteúdo, formato, referências, duplicidade por CPF e colisões de agenda, com linhas aceitas/rejeitadas e motivos; nenhuma entidade de negócio é gravada. Etapa 2 `confirm`: revalidar dentro da transação e persistir somente linhas aptas, mantendo relatório final. Qualquer nova colisão é rejeitada, sem reserva parcial.
- Idempotência por `source_system` + `external_id` por linha e hash do arquivo/lote; repetir não duplica pacientes/consultas. Cada lote guarda importador, origem, data, contagem, arquivo/hash e eventos de auditoria.
- Importar paciente não cria usuário, senha ou sessão; importar agenda não envia confirmação/lembrete automaticamente. Acesso digital só após consentimento válido. Registros anteriores a `migration.cutoff_date` aparecem como “histórico importado”; após a data, o sistema é fonte de verdade. Corte sem valor aprovado impede tratar dados reais como definitivos.

## CSV de pacientes — proposta de layout

```csv
external_id;full_name;birth_date;cpf;email;phone;source_system
P-001;Maria Exemplo;1980-05-10;12345678909;maria@example.test;85999990000;planilha_ficticia
```

`external_id`, `full_name`, `birth_date`, `cpf` e `source_system` obrigatórios; e-mail/telefone podem estar vazios no histórico e exigem atualização antes de notificar. CPF duplicado na base ou no arquivo é relatado e não cria duplicata. Nomes/CPF no exemplo são fictícios e **não** devem ser usados como massa real sem verificação de validade do CPF; o script de demonstração gera valores válidos fictícios.

## CSV de agenda — proposta de layout

```csv
external_id;patient_cpf;professional_external_id;specialty_code;room_name;starts_at;ends_at;modality;visit_type;status;source_system
A-001;12345678909;PRO-001;CARDIO;Sala 1;2026-11-02T09:00:00-03:00;2026-11-02T09:30:00-03:00;onsite;first;confirmed;planilha_ficticia
```

Campos obrigatórios: `external_id`, `patient_cpf`, `professional_external_id`, `specialty_code`, `starts_at`, `ends_at`, `modality`, `visit_type`, `status`, `source_system`; `room_name` é obrigatório se `onsite`, vazio se `remote`. Valores de modalidade `onsite/remote`, tipo `first/return`, status `confirmed/cancelled/completed`. Profissional/especialidade/sala devem existir e estar aptos; horário e duração são validados contra RN-001/RN-002. Uma linha cancelada é preservada para histórico, sem reservar slot. Idempotência não altera silenciosamente registro anteriormente importado.

## Histórico clínico manual

Q-19 atribui o lançamento a admin/gestor, mas RN-007 nega acesso clínico a esses papéis. **P-11 bloqueia a definição do fluxo e de sua permissão** até decidir se haverá upload cego de conteúdo/metadados ou concessão excepcional limitada. O registro planejado terá paciente, data original conhecida, origem, autor original se conhecido, importador, data de importação e arquivo opcional; profissional vinculado poderá marcar “conferido por”. O item ficará identificado como importado, imutável, não assinado, com correção por adendo. Nenhuma spec pode conceder leitura clínica a admin/gestor por inferência deste parágrafo.

## Critérios de validação do lote

1. Arquivo malformado → relatório de erro, zero pacientes/consultas gravados.
2. CPF duplicado no arquivo/base → linha identificada; sem novo paciente. Reimportar mesmo arquivo → zero novos registros.
3. Agenda com profissional/sala indisponível ou intervalo sobreposto → linha recusada e demais linhas independentes confirmáveis; nenhuma dupla reserva.
4. Histórico importado aparece marcado com origem/data/importador em RF-016/RF-022 e não permite edição direta.
5. Nenhuma importação cria acesso digital ou dispara mensagem; cada confirmação e resultado de lote é auditado.
