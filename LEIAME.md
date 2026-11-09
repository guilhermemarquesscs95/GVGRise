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

## Contas, senha pessoal e permissões

- Cada membro cadastrado na aba Aliança é uma conta. No primeiro acesso ele escolhe o nick na lista, entra com a senha padrão do grupo (`GVG_PASSWORD`) e é obrigado a criar uma senha pessoal (8+ caracteres). Depois disso a senha padrão não vale mais para ele.
- O admin (aba "Usuários e Permissões") escolhe o que cada membro pode fazer: Usar o Controle de Cura, Gerenciar Equipes, Gerenciar Aliança, Lançar batalhas. Há atalhos Líder, Oficial e Oldsinker. Todos veem todas as abas.
- "Resetar senha" apaga a senha pessoal; no próximo acesso a pessoa volta ao primeiro acesso.
- Tudo é conferido no servidor, não só escondido na tela.

## Perfil de cada membro

- Ao logar pela primeira vez, a pessoa define as próprias funções (Tank, DPS Melee, DPS Ranged, Bruiser, Support) e pode colocar uma foto. Em "Meu perfil" ela muda isso, e a própria senha, quando quiser. Cada um edita só o seu.
- As senhas ficam guardadas só como hash: ninguém consegue ver a senha de ninguém. O admin pode **definir uma nova senha** (com botão "Gerar") ou **resetar** na aba Usuários e Permissões.
