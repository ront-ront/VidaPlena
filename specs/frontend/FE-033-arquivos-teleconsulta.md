# FE-033 - Compartilhamento de arquivos em teleconsulta

- **Software:** front
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** FE-031, FE-032, BE-046
- **Requisitos cobertos:** RF-026, RNF-014

## 1. Objetivo
Permitir upload e consulta de anexos durante a sessão para participantes autorizados.

## 2. Escopo
- Inclui lista, envio, progresso, falha e download. NÃO inclui gravação ou inclusão automática no prontuário.

## 3. Contexto necessário
Ler DRS §3.4.3, Q-17, shared/api-contracts.md#m3 (files), shared/parameters.md (file.*), frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14 como painel recolhível na sala FE-031/032: anexos por autor/data, seletor PDF/JPG/PNG, progresso e aviso de visibilidade para o outro participante. Validar formato/tamanho no cliente para feedback, mas BE-013 valida conteúdo real e limite. Link de download curto autenticado e auditado; profissional pode escolher incorporação explícita ao prontuário. Loading, lista vazia, arquivo recusado, falha de upload e sessão encerrada sem dados antigos.

## 5. Critérios de aceite
- [ ] Dado formato permitido dentro de file.attachment_max_mb, quando enviar, então o outro participante vê metadados.
- [ ] Dado extensão falsificada, quando API rejeitar, então erro claro e nenhum item aparece.
- [ ] Dado usuário fora da sessão, quando abrir URL, então download é negado.
- [ ] Dado link expirado, quando baixar, então novo link autorizado é exigido e evento é auditado.

## 6. Testes esperados
Arquivo válido/falso/excedido, sessão/IDOR, link expirado, incorporação e estados; lint.

## 7. Definition of Done
- [ ] Testes/lint passam, sem tsc; RNF-014 continua parcial para vídeo.

## 8. Suposições e pontos em aberto
DICOM e limites finais P-09.
