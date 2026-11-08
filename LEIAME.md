# QG We Sink

Painel da aliança We Sink: cura da GVG, análise de batalhas e cadastro da aliança.

## Como atualizar (GitHub -> Cloudflare publica sozinho)
Suba `worker.js` e a pasta `public` inteira para o repositório (Add file > Upload files > Commit changes).
O Cloudflare publica a versão nova no mesmo link em cerca de 1 minuto.

## Senhas (recomendado trocar por Secrets)
Cloudflare: Workers > gvg-alerta-cura > Settings > Variables and Secrets > Add (tipo Secret):
`GVG_PASSWORD` (senha do grupo), `ADMIN_USER`, `ADMIN_PASSWORD`.
Sem os Secrets valem os padrões do worker.js (grupo: Kahineterno123@ · admin: tiopatinhas / admin123).

## Abas
- **Cura**: marcador de pontos de cura e de mortes dos inimigos, com o rosto dos personagens.
- **Análise**: vitórias/derrotas por mapa, aliança, personagem, composição e jogador (lançamento só pelo admin).
- **Aliança**: membros com funções (Tank, DPS Melee, DPS Ranged, Bruiser, Support, Reserva) e cargos.
  O admin adiciona membros, marca as funções, troca o cargo e cria/renomeia/reordena/apaga cargos.
