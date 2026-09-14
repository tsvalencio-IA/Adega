# Deploy — Adega EID VALÊNCIO PRO 2.1

## GitHub + Vercel

O repositório já está preparado para deploy pela Vercel com Framework Preset **Other**, raiz do repositório, sem Build Command e sem Output Directory customizado.

## Gemini

Em **Vercel → Project → Settings → Environment Variables**, mantenha:

```text
GEMINI_API_KEY=sua_chave
GEMINI_MODEL=gemini-2.5-flash
```

Depois de alterar variável, faça Redeploy.

## Firebase

O projeto continua usando `valencio-app` e somente o documento:

```text
adegas/adega-compartilhada
```

A V2.1 grava nele tanto `estoque` quanto o bloco `v2`. Portanto, com as Rules atuais do usuário, não existe mais a dependência de `adega-compartilhada-pro-v2` nem o fallback local para configurações/diário.

Não é necessário ativar Firebase Authentication para esta instalação familiar.

## Armário físico

A disposição é fixa e fiel ao uso real:

```text
1  2  3  4  5
6  7  8  9  10
11 12 13 14 15
...
```

Ao primeiro carregamento da V2.1, posições antigas A/B/C/D ou ausentes são migradas automaticamente para posições numéricas em ordem alfabética dos rótulos, que corresponde à ordem informada da lista física. Quantidades não são alteradas.

## Cloudinary

No painel ⚙ **Configurações**, informe o mesmo `Cloud name` e `Unsigned upload preset` já usado por você. Salve e use **Testar Cloudinary**. Esses dois valores são configuração pública; não coloque API Secret no navegador.

## Validação pós-deploy

1. confirme que o estoque antigo carregou com a mesma quantidade total;
2. abra **Armário visual** e confira 1–5 / 6–10 / 11–15;
3. mova uma garrafa e confirme que a posição sincroniza no outro aparelho;
4. salve uma alteração em Configurações e confirme no outro aparelho;
5. teste Cloudinary;
6. teste Sommelier;
7. se estiver usando a PWA instalada, feche e abra novamente para o service worker 2.1 substituir o cache antigo.

## Versão antiga

Não use o frontend legado para gravar depois da migração: ele pode sobrescrever o documento apenas com `estoque` e remover o bloco `v2`.
