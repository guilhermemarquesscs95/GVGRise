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

## Batalhas entre outras alianças

- Em "Lançar batalha" há a chave **We Sink × aliança / Outras alianças**. No modo "Outras alianças" você informa a aliança A, a aliança B, quem venceu e a composição de cada lado.
- Esses confrontos NÃO entram nos números da We Sink (KPIs, mapas, alianças enfrentadas, jogadores, Rivais e Nossos). Eles alimentam: Personagens · **Todos** (une We Sink, rivais e outras alianças), Composições · de todos, **Alianças · visão geral** (jogos, % e composição que cada uma mais repete), "O que as outras alianças usam em cada mapa" e o histórico.

## Posição primária/secundária, personagens preferidos e aba Personagens

- Em "Meu perfil" cada membro escolhe **uma posição primária** (a que mais domina), as **secundárias** e até **5 personagens preferidos**. Reserva continua sendo etiqueta da liderança.
- Em Aliança, clicar no nome de alguém abre o perfil dele: primária, secundárias e preferidos. A liderança com permissão de Aliança também pode mudar a primária pela lista ao lado do membro, mas não altera os personagens preferidos de ninguém.
- A aba **Personagens** mostra a galeria (com busca). Ao clicar: desempenho (geral, com a We Sink e contra a We Sink, calculado das batalhas lançadas), quem da aliança o tem entre os preferidos e um espaço reservado para winrate detalhado, counters e notas.

## Aba PvP (1x1, 2x2, 3x3)
Qualquer membro lança matches de PvP (modalidade, casual ou ranked, vitória/derrota, seu time e o adversário, só personagens, sem identificar jogadores). No ranked dá para informar até 4 banimentos (opcional). A aba mostra aproveitamento por modalidade, personagens (nossos/rivais/todos), confrontos com vantagem, consulta de counters, duplas e trios, banimentos, histórico com filtros e CSV. Cada um edita/apaga só os seus; admin e quem tem "batalhas" editam todos.

## Ajustes da semana
- **Confirmação das equipes** vale só na semana do GVG: zera sozinha toda segunda-feira 00:00 (Brasília). Membros e mapas continuam, só volta a "Em montagem".
- **Inimigo morto** fica 30 s no marcador (a cura continua 60 s).
- **Análise**: nick opcional de cada rival ao lançar batalha; filtro por jogador (nosso ou adversário) e card "Jogadores adversários".
- **Perfil**: abaixo de cada personagem preferido (e dos mais usados), barra de vitórias/derrotas nos GVGs.
- **Personagens**: filtro por membro mostra todos os bonecos que ele joga e as taxas.
- **PvP**: match espelhado (mesmos personagens dos dois lados) fica no histórico mas não conta nas taxas.
- **PvP ranked**: banimentos separados em "nossos" e "do rival" (até 4 de cada lado, sem mínimo).
- **Personagens**: o perfil do personagem mostra "Fraco contra" e "Forte contra" com % de vitória/derrota e nº de jogos (GVG, PvP ou os dois).

## Aba PVE
Qualquer membro monta PT ("PTs disponíveis") ou entra em "Procurando PT". Conteúdos: Raid Enies Lobby (Normal/Elite/Hard), Raid Enel (Elite/Hard), Boss Rush (2 jogadores, 2 personagens cada), Boss Semanal (Madera, Deathstalker, Sanshoo, Barbarossa, Hassan), Jaya (Van Augur, Jesus Burgess) e Bosses Novos (Yokozuna, Humandrill, Duval). Enies e Enel têm modo RECORD no Hard. Nos bosses a PT pode ser de 4 ou 6 e o dono marca quais bosses já foram feitos. O dono convida quem está procurando PT; o convidado aceita escolhendo vaga e personagens. Todo o PVE (raids, Boss Rush e bosses) reseta toda sexta 00:00 (Brasília): PT "fixa" continua com os mesmos membros e os bosses feitos zerados; PT não fixa acaba. Pedidos e convites somem após 24 h sem atualização (máx. 3 PTs e 5 pedidos por pessoa).
