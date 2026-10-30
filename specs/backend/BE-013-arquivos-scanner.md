# BE-013 - FileStorage cifrado, links e MalwareScanner de desenvolvimento

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementação parcial (base, upload de termo e política de consentimento integrados; endpoint genérico POST /v1/files aguarda contexto autorizável de negócio)
- **Depende de:** BE-004, BE-005
- **Requisitos cobertos:** RF-020, RF-026, RF-027, RNF-014

## 1. Objetivo
Oferecer uma porta única para guardar e entregar arquivos autorizados, com metadados, criptografia, validação e auditoria antes dos fluxos clínicos.

## 2. Escopo
- Inclui: `FileStorage` local por categoria, AES-256 em repouso, `MalwareScanner` dev, MIME real/tamanho/quantidade, nomes aleatórios, link curto e download autenticado.
- NÃO inclui: resultado de exame, compartilhamento ou gravação como regra de negócio (M2/M3), scanner real de produção.

## 3. Contexto necessário
Ler `specs/shared/data-model.md` (`FileObject`), `specs/shared/api-contracts.md` (arquivos), `specs/shared/parameters.md` (Arquivos), `specs/shared/access-policy.md`, Q-17 e RNF-014.

## 4. Detalhamento
- Porta `FileStorage` com categorias anexo/resultado/gravação; termo presencial assinado usa `anexo` ligado ao consentimento. Adapter local grava fora de diretório servido diretamente, cifrado AES-256 com referência de chave fora do armazenamento. Verificar conteúdo real, formato, tamanho e `file.max_per_record`; nome interno aleatório e SHA-256 de integridade.
- `MalwareScanner` dev valida tipo/tamanho e retorna `skipped_dev`; nunca apresentar como varredura efetiva e bloquear sua configuração em produção. Arquivo sem varredura real não pode ser aceito por configuração de produção.
- `download-link` expira por `file.signed_url_ttl_seconds`; o endpoint de stream exige também sessão, vínculo/permissão atual e auditoria por visualização/download. Revogação de consentimento/gravação invalida acesso mesmo antes de expirar o link. Recepção não lê conteúdo clínico.

## 5. Critérios de aceite
- [ ] Dado arquivo com extensão aceita e conteúdo falso, quando enviar, então 422 e nenhum objeto disponível.
- [ ] Dado arquivo acima do parâmetro da categoria, quando enviar, então 422 e zero objeto persistido.
- [ ] Dado usuário sem permissão ou link expirado, quando baixar, então 403/410 e nenhum byte de conteúdo é entregue.
- [ ] Dado download autorizado, quando ocorrer, então há evento de auditoria e arquivo permanece cifrado em disco.
- [ ] Dado ambiente produção com DevMalwareScanner, quando iniciar, então bootstrap falha.

## 6. Testes esperados
Conteúdo/extensão falsos, limites por categoria, criptografia em disco, links expirados, IDOR, revogação e auditoria por download; bloqueio do scanner dev em prod. Lint.

## 7. Definition of Done
- [ ] Interfaces e adapter local testáveis; chave fora do storage; sem rota estática pública.
- [ ] Falha fechada em produção; contratos e parâmetros únicos respeitados.
- [ ] Testes/lint passam, sem `tsc`.

## 8. Suposições e pontos em aberto
Scanner real, storage externo e limites definitivos são P-09/portão de produção. Evidência de termo presencial pode usar esta porta após BE-011. Política de acesso a gravação do paciente segue pendente.

### Estado local em 29/10/2026

`FileStorage` local cifrado, classificação por conteúdo/extensão, limite por categoria e por registro, `FileObject`, link HMAC restrito à sessão, revogação e auditoria foram implementados. Migration `202610290008_files` aplicada no banco isolado; 19/19 testes de integração, 15/15 testes Node, 2/2 Vitest e lint aprovados nesse ponto. BE-011 acrescentou upload multipart de termo presencial com política `FileAccessPolicy` específica, download pelo paciente/responsável e proibição de leitura pela recepção. A rota genérica `POST /v1/files` permanece pendente até haver um recurso de negócio autorizável além de termo presencial; tipos de resultado e gravação continuam M2/M3. O scanner de desenvolvimento segue bloqueado em produção.
