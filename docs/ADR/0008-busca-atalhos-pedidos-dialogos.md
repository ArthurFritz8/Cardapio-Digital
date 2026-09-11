# ADR 0008 — Busca no cardápio, atalhos de pedidos e diálogos acessíveis

- **Status:** Aceito
- **Data:** 2026-09-10
- **Relacionados:** ADR 0004 (cache/carrinho), ADR 0006 (auditoria), ADR 0007 (idempotência)

## Objetivo

Melhorar a experiência do cliente e fechar a pendência de foco dos diálogos
enquanto o desenvolvedor configura o Supabase. Escopo incremental de frontend,
sem alteração de migrations, schema, contratos HTTP ou máquina de estados.

## Contexto

O estudo de `PublicMenu`, `CartSheet`, `OrdersBoard`, `useMenu`, persistência
do carrinho/tentativas e acompanhamento confirmou:

- Acompanhamento já existe em `OrderStatus.tsx`/`useOrderStatus.ts`. A URL era
  perdida ao retornar ao cardápio e não havia lista de atalhos locais.
- O cardápio já carrega os itens disponíveis e categorias ativas, incluindo
  cache local para leitura offline. Não havia busca nesses dados.
- Os diálogos tinham nome acessível, mas não tornavam o fundo inerte nem
  tratavam foco/Escape. O cancelamento ainda permitia fechar enquanto enviava.

## Solução

### Busca local

`menu-search.ts` filtra nome, descrição e categoria, ignorando caixa, acentos
e espaços extras. Todos os termos precisam corresponder; texto não é regex.
Preserva ordem e objetos recebidos. A UI informa quantidade/ausência de
resultados, permite limpar e mostra somente âncoras de categorias com resultados.
Busca não representa catálogo completo de ingredientes ou informação de alergênicos.
Não cria requisição, índice ou dependência e continua utilizável com menu em cache.

### Recuperação de acompanhamento

Após resposta de sucesso do POST já existente, `saveRecentOrder` grava somente
`{id, savedAt}` em `cd.recent-orders.{tableId}`. São até cinco pedidos por mesa,
com validade de 24 horas e UUID/data validados por Zod. Um retry não duplica
o atalho nem renova a data enquanto ele está retido. Falha de storage não impede
limpar o carrinho e navegar ao pedido confirmado pelo servidor.

`RecentOrders` restaura os atalhos após reload, ao voltar à aba e por evento de
storage de outra aba; um timer local expira o próximo registro. Limpeza de
expirados ocorre na leitura; não há processo em segundo plano com o navegador
fechado. `Limpar atalhos` remove apenas esta chave e informa falha de remoção.
Links usam a rota existente, sem prefetch nem polling adicional no cardápio.

O UUID continua sendo uma credencial de leitura. A lista só contém envios
confirmados neste navegador: não enumera pedidos da mesa no banco, não consulta
outros clientes e não guarda nome, itens, preço ou status. Um aparelho compartilhado
também compartilha seu storage. Expirar/apagar o atalho não revoga a URL no servidor.
Não é comprovante fiscal, prova de identidade ou recibo offline; acompanhamento
continua exigindo conexão. Resposta perdida só salva o atalho quando um retry
idempotente confirma o pedido.

### Diálogos

`Modal.tsx` reutiliza `<dialog>.showModal()` para fundo inerte, foco inicial e
navegação por teclado. Bloqueia scroll do documento, restaura foco ao disparador
quando ele ainda existe, fecha por Escape/toque fora e bloqueia fechamento quando
`busy`. O componente serve ao carrinho e à confirmação de cancelamento.

No carrinho, nome usa `Input` existente e observação recebe label acessível.
No cancelamento, motivo e botão Voltar também ficam desabilitados durante envio;
seletor tem alvo mínimo de 44 px. As ações de pedido continuam iguais.

### Vetos e impactos

- Vetada lista pública de pedidos por mesa: recuperamos somente IDs já recebidos
  neste navegador; não abrimos RLS nem criamos RPC/estado/identidade de cliente.
- Vetado segundo cache de snapshots ou status: o acompanhamento existente
  permanece fonte de apresentação do resultado consultado ao servidor.
- Vetada biblioteca de busca/modal: APIs nativas e helpers puros são suficientes.
- Mudanças visíveis: campo de busca, seção de atalhos quando há envios locais,
  ocultação de âncoras vazias, Escape/foco/fundo modal e bloqueio de cancelamento
  em curso. Nenhuma mudança em preço, sessão, geo, envio idempotente ou transição.
- Reversão: retirar os componentes/helper de busca e a chamada de persistência;
  a chave local fica sem uso e pode ser removida, sem migração ou efeitos no banco.

## Prevenção

- Testes de busca: acentos/caixa, múltiplos termos, descrição nula, categoria,
  ordenação, texto literal, nenhum resultado e limpeza.
- Testes de persistência: isolamento, cinco mais recentes, TTL exato, retry,
  corrupção/campos extras, datas futuras, UUID inválido, servidor sem window e
  storage bloqueado. Dados de localStorage nunca entram em href sem validar UUID.
- Roteiro `scripts/check-client-ux.mjs`: navegador real com cache sintético,
  interceptação de APIs e bloqueio de todo tráfego externo. Testa busca, 320 px,
  foco/Tab/Shift+Tab/Escape, fundo inerte, retorno do foco, fechamento bloqueado,
  um POST sem preço/nome de produto, recuperação/reload/isolamento/limpeza.
- O roteiro desativa SW para que a interceptação não mascare requisições. PWA
  tem testes próprios; este roteiro não substitui smoke Supabase nem Android físico.
- Playwright é ferramenta externa opcional de QA já disponível no ambiente,
  sem nova dependência na aplicação/lockfile ou CI. Para reproduzir: build,
  `PLAYWRIGHT_MODULE_PATH` apontando à instalação externa de `playwright`,
  `PLAYWRIGHT_CHANNEL=msedge` para Edge instalado (ou Chromium do Playwright),
  então `npm run test:client-ux`. O harness inicia/encerra seu servidor local.

## Validação executada

- 99 testes Vitest em 13 arquivos; TypeScript strict, lint, build e smoke HTTP.
- Edge headless real: roteiro de UI aprovado e screenshots em 320 px inspecionados.
- First Load JS: menu 198 kB (antes 193 kB), kanban 192 kB (sem aumento arredondado).
- Scan de segredos sem achados. Nenhuma migration, API ou dependência alterada.
- Permanecem pendentes o fluxo autenticado de cancelamento com Supabase real,
  teclado virtual/Android físico e o smoke de implantação do desenvolvedor.

Referências: [dialog e showModal](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog),
[foco e modal nativo](https://webkit.org/blog/12209/introducing-the-dialog-element/).
