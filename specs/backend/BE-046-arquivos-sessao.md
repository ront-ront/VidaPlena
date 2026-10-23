# BE-046 - Compartilhamento de arquivos na sessão

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-045, BE-013, BE-041
- **Requisitos cobertos:** RF-026, RN-012

## 1. Objetivo
Permitir que participantes autorizados compartilhem anexos em teleconsulta, preservando controle de acesso e origem.

## 2. Escopo
- Inclui upload/listagem/download de SharedSessionFile e ato explícito de incorporar arquivo ao prontuário. NÃO inclui processamento de mídia ou visibilidade pública.

## 3. Contexto necessário
Ler DRS §3.4.3, Q-17, shared/api-contracts.md#m3 (files), shared/data-model.md#m3, shared/parameters.md (file.*), backend/architecture.md.

## 4. Detalhamento
POST files reutiliza FileStorage/MalwareScanner BE-013, valida MIME real, limite/categoria/quantidade e sessão ativa. GET lista só ao participante autorizado; download exige sessão, permissão atual e auditoria. Visibilidade do arquivo é da sessão; incorporação ao prontuário é ato clínico separado pelo profissional e então sujeita retenção RN-012, sem ocorrer automaticamente. Revogação do consentimento de dados bloqueia portal; arquivo clínico necessário preserva-se sob política P-01.

## 5. Critérios de aceite
- [ ] Dado extensão falsa, quando enviar, então 422.
- [ ] Dado arquivo acima de file.attachment_max_mb ou além de file.max_per_record, quando enviar, então 422.
- [ ] Dado não participante, quando listar ou baixar, então 403/404.
- [ ] Dado profissional que incorpora arquivo, quando confirmar, então origem e vínculo clínico ficam auditados.
- [ ] Dado link expirado, quando baixar, então acesso negado.

## 6. Testes esperados
Upload válido/falso/excedente, participante/IDOR, link expirado, auditoria e incorporação explícita; lint.

## 7. Definition of Done
- [ ] Schema/contrato compartilhado respeitados; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
MalwareScanner dev é bloqueado em produção; DICOM futuro P-09.
