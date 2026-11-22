# Referência para o agente: o que a câmera do capacete vê

Prints gerados pela simulação **sem nenhum texto de interface**, iguais ao `GET /api/snapshot`
(1280 px de largura). Use-os para montar e testar o prompt de visão e a conversa do agente.

## O cenário em uma frase

O trem acabador (cadeiras F1 a F4) sofreu uma **parada de emergência**. Os sistemas não dizem qual cadeira
causou a parada. O defeito real é o **transdutor de posição ZT-2101 da F2, quebrado por impacto**, e só dá para
identificá-lo olhando o equipamento.

## Os prints

| Arquivo | O que mostra | O que o agente pode concluir |
|---|---|---|
| `01-sala-controle.jpg` | Sala de controle com vista para F1–F4 | Linha parada, todas as cadeiras iguais |
| `02-monitor-alarmes.jpg` | 7 alarmes no mesmo segundo | Parada de emergência; a pista é o `ALM-0950` (permissivo de posição das guias laterais F1–F4 ausente) |
| `03-monitor-guias-laterais.jpg` | As 4 guias com feedback `####` / BAD | Diagnóstico coletivo do módulo AI-04: o sistema não sabe qual canal falhou e manda verificar em campo |
| `04-monitor-clp.jpg` | E/S remota ET-2, módulo AI-04 com erro | Mesma conclusão, do ponto de vista do CLP |
| `05-galpao-parada-emergencia.jpg` | Galpão com andons vermelhos em todas as cadeiras | Nada se destaca de longe |
| `06-transdutor-ok-F1.jpg` | **Transdutor bom (referência)** | LED verde e LED âmbar acesos, carcaça inteira, conector encaixado |
| `07-transdutor-quebrado-F2.jpg` | **Transdutor defeituoso, a ~1 m** | LEDs apagados, cabeça torta, canto escuro (lasca). Placas "F2", "JB-F2" e "ZT-2101" legíveis |
| `08-transdutor-quebrado-F2-zoom.jpg` | O mesmo, de perto | Trincas saindo do canto, lasca faltando com eletrônica exposta, LEDs apagados |
| `09-fragmentos-no-chao-F2.jpg` | Pedaços da carcaça no chão, abaixo do transdutor | Confirma que houve impacto |
| `10-transdutor-substituido-F2.jpg` | Depois da troca | Transdutor novo com LEDs acesos |
| `11-linha-em-producao.jpg` | Linha rodando | Tira incandescente, vapor; problema resolvido |

## Pistas visuais do defeito (do mais óbvio ao mais sutil)

1. **LEDs apagados.** Em todos os outros transdutores, um LED verde e um âmbar ficam acesos.
2. **Lasca faltando** no canto superior direito da cabeça, com um pedaço da placa verde aparecendo.
3. **Trincas** na face da frente e na lateral, a partir do canto.
4. **Cabeça levemente torta** em relação ao cilindro e ao conector.
5. **Fragmentos** brancos no chão, logo abaixo.

O cabo laranja e o conector estão **intactos e encaixados**. Não é problema de cabeamento, é o próprio sensor.

## Diálogo de exemplo

> **Agente:** A linha parou por emergência. Entre os alarmes, o que aponta causa é a perda do permissivo de posição
> das guias laterais de F1 a F4, mas o módulo não diz qual canal. Vamos verificar os transdutores das guias, no lado
> operador, na entrada de cada cadeira, à altura do peito. Começa pela F1.
> *(foto 06)*
> **Agente:** Esse está ok: LED verde aceso, carcaça inteira. Segue para a F2.
> *(foto 07/08)*
> **Agente:** Achei. O ZT-2101 da F2 está com a carcaça trincada, falta uma lasca no canto e os LEDs estão apagados.
> Parece ter levado uma pancada; tem até fragmento no chão. O cabo está bom, então é o transdutor. Precisa substituir.
> *(técnico segura E e a peça é trocada; a linha volta, foto 10/11)*

## Integração (para quem monta o agente)

- `GET http://localhost:5173/api/snapshot`: foto atual do capacete (JPEG).
- `GET http://localhost:5173/api/state`: alarmes, tags do CLP, `player.nearMachine` (F1..F4) e `player.lookingAt` (ex.: `ZT-2101`). **Não contém a resposta.**
- `GET http://localhost:5173/api/truth`: gabarito (`F2`, `ZT-2101`, evidências visuais), só para validar.
- `GET http://localhost:5173/api/events` (SSE): `player_near_machine`, `component_intervention` (`changed: true/false`), `component_fixed`, `machine_state_changed`...
- `POST http://localhost:5173/api/reset`: recomeça a demo.

Se quiserem **mockar** que o agente "analisou todos os sensores", basta o agente responder com base no `/api/truth`.
A simulação aceita isso: segurar E no ZT-2101 resolve, independentemente de quem identificou.

Para regenerar os prints: `node scripts/reference-shots.mjs` (com `npm start` rodando).
