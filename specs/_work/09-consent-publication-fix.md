# Correção de termo vigente e publicação administrativa

## Escopo aprovado — 13/11/2026

Diagnóstico por leitura e consulta sem mutação: GET `/v1/consent-documents/current?kind=data` respondeu404; `ConsentDocumentVersion` do banco de desenvolvimento não tem linhas. A API de publicação já existe, sem tela para operá-la. Usuário escolheu **Tela do admin** e aprovou o plano: publicar termo real, sem mock, com vigência imediata do servidor; corrigir carregamento e invalidar aceite/arquivo na troca de versão.

Executar uma spec por vez: BE-011 (compatibilidade HTTP e teste), FE-042 (publicação/admin), FE-007 (cadastro digital), FE-039 (assistido). Preservar mudanças locais anteriores, não criar commits nem iniciar FE-018–020/M1. Não publicar conteúdo arbitrário no banco de desenvolvimento; admin fornece o texto pela nova tela.

## Decisão de contrato P-52

POST existente passa a aceitar effectiveAt opcional; ausência usa Date do servidor. Não há migração, nova biblioteca ou bypass de consentimento. GET404 continua ausência real, sem fallback de desenvolvimento. Publicação permanece admin com MFA, auditoria, versão única e imutável. FE-042 é complemento M0 autorizado pelo pedido atual e usa os contratos únicos.

## Implementação concluída localmente

1. **BE-011:** Zod/OpenAPI permite effectiveAt omitido; HTTP deriva a vigência no servidor. Data explícita, admin/MFA, auditoria e imutabilidade preservados. 5/5 integrações (3 novas publicação+2 anteriores consentimento) e lint221 passaram antes de iniciar a UI.
2. **FE-042:** `/admin/termos` e menu exclusivo de admin; vigente/vazio/erro/retry, versão/texto, validação Zod, Dialog de revisão, gate contra duplo envio, POST201 validado e releitura. Conflito/rede/resposta inválida mantêm rascunho e orientam conferir antes de repetir. Serviço único de termos valida DTO e mantém reexport compatível para os cadastros. Inicial10/10 browser e lint90 passaram antes de corrigir FE-007.
3. **FE-007:** ausência de publicação e erro técnico separados de loading, link do admin em outra aba, retry e dados mantidos; outra versão invalida aceite. Inicial4/4 browser e lint91 passaram antes de corrigir FE-039.
4. **FE-039:** mesmos estados no local correto da seção do termo, sem loading infinito. Termo indisponível impede upload/aceite/conclusão; versão nova limpa aceite/arquivo também no DOM e invalida resultado de validação assíncrona anterior. Mesma versão mantém evidência em conflito cadastral. Inicial5/5 browser passou; paciente existente preserva fluxo próprio de novo aceite.

Nenhuma migração ou biblioteca nova. Nenhum texto automático de consentimento publicado, seed executado ou dado de desenvolvimento alterado. Para habilitar o cadastro, o admin fornece o texto/versão em **Termos de consentimento**, revisa e publica; depois volta ao cadastro e escolhe **Atualizar termo**. Evidência/representação/CPF/consentimento continuam sendo validados normalmente.

## Verificação final — 13/11/2026

- **26/26 Firefox em execução única**, APIs simuladas:11 FE-042,5 FE-007,6 FE-039 e4 de regressão MFA. Inclui validação de limites, termo inválido, papéis, confirmação/cancelamento da revisão, publicação/refetch, conflitos, resposta perdida, duplo envio, preservação de dados, nova versão/evidência, paciente existente, teclado/360px. Log `/tmp/vidaplena-consent-final-browser.log`, sessão62981 exit0.
- **5/5 integrações HTTP/PostgreSQL**, incluindo publicação com vigência imediata, compatibilidade futura, limites/RBAC/MFA, auditoria e proteção contra sobrescrita/exclusão, cadastro digital/presencial e revogação. Log `/tmp/vidaplena-consent-publication-backend.log`, sessão62498 exit0. Banco efêmero criado/migrado/removido dentro do PostgreSQL17 de testes em127.0.0.1:32768, base de controle `_test`; sem usar o banco de desenvolvimento.
- **6/6 testes do cliente HTTP** e **lint monorepo backend221/front91 arquivos** aprovados em `/tmp/vidaplena-consent-final-{api,lint}.log`. `git diff --check` aprovado. Revisão visual mobile em `/tmp/vidaplena-consent-{review,missing}-mobile.png`. Build não repetido; nenhum comando tsc. Revisão manual com leitor de tela/P-01 jurídico continuam pendentes.

Testes de navegador usaram configuração temporária anterior `/tmp/vidaplena-mfa-qr-playwright.config.ts` sobre o servidor de desenvolvimento já existente em localhost3000, preservado, com navegador isolado e chamadas `/v1/**` totalmente interceptadas por fixtures fictícias. A API de produto continua real. Asserções backend usam aplicação real e PostgreSQL isolado. O modo padrão dos testes permanece `yarn workspace vida-plena-frontend test:e2e consent-terms.spec.ts` (servidor3400) quando não houver outro Next ocupando `.next/dev`. Não alterar/encerrar serviço do usuário para testar.

O lint revelou apenas quebra de linha na orientação QR do login, normalizada sem alteração funcional; os4 testes MFA também passaram. Nenhum pacote instalado ou config de desenvolvimento modificada nesta correção. Matriz/ordem/mapa/constituição agora registram a FE-042 complementar: **96 specs,54BE/42FE**, sem mudar os85 requisitos/diretrizes. FE-018/019/020 permanecem pendentes e M1 pausada. Sem commits/staging/push; alterações locais anteriores preservadas.

## Leituras e rastreabilidade

Constituição48, overview47, AGENTS frontend76, design system70, screens-map60 e guia Next instalado `use-client.md`123 linhas lidos integralmente. As specs BE-011/FE-007/FE-039 e os contextos de consentimento foram lidos integralmente na investigação e implementação. Código original do cadastro437, formulário presencial691, ManageConsent319, adapter ConsentStore238, router213 e testes de consentimento587 linhas lidos da primeira à última em blocos sequenciais durante investigação/execução. FE-042 escrita no template de8 seções antes do código; P-52/contrato/matriz registrados antes de alterar a API. Context7 indisponível; usado guia local do Next16.3.6, sem nova biblioteca.

Mensagem de commit sugerida (não executada):

```text
fix(consent): disponibilizar publicação de termos e desbloquear cadastro

- permitir vigência imediata pelo relógio do servidor
- adicionar tela administrativa de publicação com revisão e auditoria
- distinguir termo ausente de erro técnico nos cadastros
- invalidar aceite e evidência anteriores quando a versão mudar
- cobrir publicação, cadastro, permissões e conflitos com testes
- atualizar contratos, specs e rastreabilidade sem avançar na M1
```
