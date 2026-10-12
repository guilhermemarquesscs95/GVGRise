# GVG · Alerta de Cura (Cloudflare)

Site + servidor em tempo real, tudo no plano gratuito do Cloudflare.

## Arquivos
- `public/index.html` — o app (o que o pessoal abre no navegador)
- `worker.js` — servidor: confere o login, guarda o estado do time e avisa todo mundo na hora
- `wrangler.jsonc` — configuração do Cloudflare (o nome `gvg-alerta-cura` precisa ser igual ao nome do projeto no painel)

## Login
Quem abre o site digita **nick + senha**. A senha é conferida no servidor (não dá para burlar pela página).
- Senha padrão: `Risewin123` (está no começo do `worker.js`).
- Depois de entrar, o aparelho lembra o login. O botão **Sair** apaga a senha salva.
- Depois de 8 senhas erradas seguidas, aquele IP espera 1 minuto.

### Trocar a senha depois (sem mexer no código)
Painel do Cloudflare > Workers & Pages > gvg-alerta-cura > Settings > Variables and Secrets > Add:
tipo **Secret**, nome `GVG_PASSWORD`, valor = a senha nova. Quando existir, ela vale no lugar da padrão,
e quem já estava logado com a senha antiga precisa entrar de novo.
(Use *Secret*: variáveis comuns criadas no painel podem ser apagadas no próximo deploy.)

## Como publicar
1. Suba estes 3 itens (`wrangler.jsonc`, `worker.js` e a pasta `public`) no repositório do GitHub.
2. No Cloudflare: Workers & Pages > Create application > Import a repository > escolha o repositório.
3. Nome do projeto: `gvg-alerta-cura` | comando de build: vazio | comando de deploy: `npx wrangler deploy`.
4. Save and Deploy. O endereço final aparece no fim (algo como `gvg-alerta-cura.SEU-NOME.workers.dev`).

Depois disso, todo upload novo no GitHub republica o site sozinho.

## Dica de teste
Abrindo `SEU-ENDERECO/?room=teste` você usa uma sala separada, sem mexer no estado real do grupo.
