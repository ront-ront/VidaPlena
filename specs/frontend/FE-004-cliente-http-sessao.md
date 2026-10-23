# FE-004 - Cliente HTTP, sessão e proteção de rotas

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-003, BE-003, BE-008
- **Requisitos cobertos:** RF-002, RNF-012, RNF-013

## 1. Objetivo
Centralizar chamadas REST, ciclo de sessão e erros para que nenhuma página manipule token ou `fetch` diretamente.

## 2. Escopo
- Inclui: cliente HTTP, acesso em memória, refresh rotativo, tratamento 401/403/409/429, proteção visual de rota e limpeza no logout.
- NÃO inclui: formulário de login (FE-005), autorização real de recursos (BE-005) ou endpoint novo.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md` (convenções/auth), `specs/shared/access-policy.md`, `specs/backend/architecture.md` (contratos), `specs/frontend/screens-map.md` e `docs/architecture.md` (“Comunicação frontend ↔ backend”).

## 4. Detalhamento
- `services/api` é única origem de URL, headers, requestId, parsing e erro; componentes usam serviços/hooks. Access token só em memória; refresh em cookie HttpOnly/Secure conforme BE-008. Fila de refresh impede múltiplas rotações simultâneas; falha limpa sessão e direciona login sem perder orientação.
- Server Components buscam dados públicos quando possível; dados protegidos só por caminho que preserva credencial no servidor ou por Client Components/serviços autenticados, nunca token renderizado em HTML. Configuração de SameSite/Origin/CSRF depende de BE-001/008 e deve ser igual em front/back.
- Mapear erros para mensagens pt-BR acionáveis, sem mostrar `requestId` como mensagem principal; oferecer esse ID apenas em detalhe de suporte quando apropriado. Um 403 não substitui isolamento de dados do backend.

## 5. Critérios de aceite
- [ ] Dado access token expirado e refresh válido, quando duas chamadas concorrerem, então uma rotação recupera ambas sem reutilizar refresh antigo.
- [ ] Dado refresh revogado, quando chamar API, então sessão local é limpa e rota protegida conduz a login.
- [ ] Dado 409/429, quando exibir erro, então usuário recebe causa/ação e nenhum código interno bruto.
- [ ] Dada busca de página protegida, quando inspecionar HTML/localStorage, então nenhum access/refresh token é exposto.

## 6. Testes esperados
Integração com servidor/mock contratual para refresh concorrente, 401/403/409/429, logout e proteção de rota; lint.

## 7. Definition of Done
- [ ] Nenhum componente faz `fetch` direto; contrato REST único respeitado.
- [ ] Sessão/CSRF conferidos com BE-008; testes/lint passam, sem `tsc`.
- [ ] Dados protegidos não aparecem em render público.

## 8. Suposições e pontos em aberto
Domínio real de front/back e política de cookies/CSRF são decisões técnicas pendentes BE-001/P-05. FE-004 não fica implementável sem contrato final de sessão.
