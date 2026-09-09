# SGMC — Sistema de Gestão de Materiais Cirúrgicos

Backend em Node.js + Express, com banco de dados PostgreSQL. Substitui a
versão anterior (que salvava tudo só no navegador) por um sistema real,
multi-usuário, com os dados guardados no banco.

## Status atual

- ✅ Banco de dados PostgreSQL **já criado** no Render (plano gratuito)
  — atenção: o plano gratuito expira 30 dias após a criação, a menos que
  seja promovido a um plano pago pelo painel do Render.
- ⏳ Falta publicar este código como um "Web Service" no Render e ligá-lo
  a esse banco. Essa etapa depende da sua conta do GitHub/Render, então
  não consigo fazer sozinho — mas fica fácil com os passos abaixo.

## Como publicar (sem usar linha de comando)

**1. Criar um repositório no GitHub**
   - Acesse https://github.com/new (crie uma conta grátis se ainda não tiver)
   - Dê um nome, ex. `sgmc-materiais-cirurgicos`, e clique em "Create repository"

**2. Enviar os arquivos**
   - Na página do repositório novo, clique no link "uploading an existing file"
   - Arraste todos os arquivos e pastas desta pasta (`server.js`, `package.json`,
     `db/`, `public/`, etc.) para a área de upload — **não** precisa incluir a
     pasta `node_modules`
   - Clique em "Commit changes"

**3. Me enviar o link**
   - Copie o endereço do repositório (algo como
     `https://github.com/seu-usuario/sgmc-materiais-cirurgicos`) e me mande aqui
     no chat. Eu crio o Web Service no Render e conecto ao banco que já existe.

## Alternativa: publicar você mesmo pelo painel do Render

1. Em https://dashboard.render.com, clique em "New" → "Blueprint"
2. Aponte para o repositório do GitHub criado acima
3. O Render lê o arquivo `render.yaml` e configura tudo sozinho — mas nesse
   caminho ele cria **um banco de dados novo**, separado do que já existe.
   Se quiser reaproveitar o banco já criado, prefira me mandar o link (passo 3
   acima) em vez de usar o Blueprint.

## Rodando na sua própria máquina (opcional, para testar)

```
npm install
export DATABASE_URL="postgres://usuario:senha@localhost:5432/nome_do_banco"
npm start
```

Depois acesse http://localhost:3000
