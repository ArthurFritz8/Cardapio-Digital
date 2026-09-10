# Bug — [título com ação, condição e falha]

Copie para `docs/bugs/AAAA-MM-DD-titulo-curto.md`. Os campos abaixo são um formulário; não constituem evidência de teste já executado.

| Campo | Preenchimento |
| --- | --- |
| Data/responsável | AAAA-MM-DD, nome |
| Severidade | Bloqueante / Alta / Média / Baixa |
| Estado | Aberto / Em correção / Aguardando reteste / Validado |
| Eixo e etapa | Segurança, Dados, PWA/UX ou Performance; ID do E2E |
| Commit/deploy e migrations aplicadas | SHA, URL de demonstração sem token, 0001–0004 |
| Impacto e alcance | Quem é afetado, frequência, perda/vazamento/duplicação de dados |

Severidade: **Bloqueante** impede instalar/migrar/iniciar o fluxo principal ou causa exposição crítica; **Alta** compromete segurança, integridade ou fluxo essencial mesmo com contorno; **Média** degrada operação com contorno seguro; **Baixa** é cosmética/documental sem impacto funcional.

## Ambiente

- Dispositivo, sistema, navegador e versão:
- Origem: build local de produção / deploy de teste:
- Rede: Wi-Fi / móvel / NAT compartilhado / offline:
- Perfil: dono A / dono B / cliente sem login:
- Service Worker: versão/ativo, cache previamente aquecido ou primeira visita:
- Estado inicial do pedido/mesa/estabelecimento e configuração de geo:

## Reprodução mínima

1. Preparação e dados sintéticos necessários:
2. Ação exata, incluindo simultaneidade/repetição se relevante:
3. Resposta observada e frequência (ex.: 3 de 3 tentativas):

## Esperado

Descreva o resultado e cite o item do E2E/ADR/regra que o exige.

## Observado e evidência

Mensagem literal sanitizada, HTTP status e código auditável da API ou SQLSTATE. Anexe captura/log mínimo com horário e fuso para correlacionar. Confirme no banco se houve efeito persistente; erro de rede após envio não prova que o pedido falhou.

Não publicar `service_role`, JWT, cookies, cabeçalhos de autorização, tokens de sessão de mesa, links completos de pedido/recuperação, IPs ou dados de clientes. Redigir identificadores quando o relatório sair do ambiente de teste. Capturas/HAR precisam ser sanitizados antes do commit.

## Diagnóstico e contorno

- Hipótese/arquivo ou policy suspeita (se conhecida):
- Contorno seguro, ou “nenhum”:
- Dado persistente afetado e necessidade de reparo:
- ADR relacionado; mudança de comportamento proposta:

## Correção e reteste

- Commit/ADR da correção:
- Teste de regressão que reproduzia a falha e resultado após a correção:
- E2E repetido, data, dispositivos e evidências:
- Fluxo principal QR → pedido → kanban → acompanhamento: passou / falhou / pendente:
- Pendências residuais e responsável:
