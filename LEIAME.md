# Painel de GVG · We Sink

## Como atualizar (GitHub -> Cloudflare publica sozinho)
1. No repositório `GVGRise`, clique em **Add file > Upload files**.
2. Arraste para lá **o conteúdo desta pasta**: `worker.js` e a pasta `public` inteira
   (index.html, style.css, app.js, analysis.js, faces.js, chars.js, chars.webp).
   Se o GitHub perguntar, substitua os arquivos que já existem.
3. Clique em **Commit changes**. Em ~1 minuto o Cloudflare publica a versão nova no mesmo link.

## Senhas (recomendado trocar por Secrets)
Como o repositório é público, as senhas padrão ficam visíveis no código.
No Cloudflare: Workers > gvg-alerta-cura > Settings > Variables and Secrets > Add (tipo **Secret**):
- `GVG_PASSWORD`   senha do grupo (a que todos digitam para entrar)
- `ADMIN_USER`     usuário do admin
- `ADMIN_PASSWORD` senha do admin
Sem os Secrets valem os padrões do worker.js (grupo: Risewin123 · admin: tiopatinhas / admin123).

## Como usar
- **Admin**: botão "Admin" no canto superior direito. Libera a aba Jogadores e o lançamento/edição de batalhas.
- **Jogadores**: o admin cadastra os nicks (pode colar vários separados por vírgula). A tela de login passa a mostrar só essa lista.
- **Cura**: marcador de mortes com rosto. "Escolher personagens" preenche em sequência (digite o nome + Enter);
  segurar uma bolinha troca só aquele personagem. Funciona também na janela flutuante (botão lápis).
- **Análise**: o admin lança cada batalha (mapa, aliança, resultado, nossa comp. e a do rival).
  "Importar do marcador" copia os rivais marcados durante o jogo.
