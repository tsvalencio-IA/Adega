# Adega EID VALÊNCIO PRO 2.1

Aplicação premium para gestão da adega familiar, mantendo o Firebase original `valencio-app`, o Cloudinary configurável e o backend Gemini pela Vercel.

## Organização física real

A V2.1 representa exatamente o armário informado:

```text
01  02  03  04  05
06  07  08  09  10
11  12  13  14  15
16  17  18  19  20
...
```

É **uma única prateleira física**, com cinco posições por fileira. O sistema não usa mais o modelo genérico A/B/C/D. A migração distribui os vinhos existentes na mesma ordem alfabética usada pela listagem da adega, de cima para baixo. Novas garrafas recebem a próxima posição livre; ao mover uma garrafa para uma posição ocupada, as posições são trocadas para impedir duplicidade.

## Firebase e sincronização

O sistema continua usando apenas:

```text
Firebase project: valencio-app
Firestore: adegas/adega-compartilhada
```

Estrutura:

```text
adegas/adega-compartilhada
├── estoque[]
└── v2
    ├── settings
    ├── movements[]
    ├── tastings[]
    ├── wishlist[]
    └── events[]
```

Isso elimina o antigo fallback local causado pelo documento `adega-compartilhada-pro-v2`. Estoque, configurações, diário e organização física passam a sincronizar no mesmo documento que as Rules atuais já autorizam.

Não há Firebase Authentication nesta versão, conforme definido para o uso familiar. A regra atual `allow read, write: if true` funciona, porém tecnicamente deixa esse documento acessível publicamente para quem conhecer a configuração do projeto.

## Recursos

- dashboard da adega;
- inventário pesquisável e filtros;
- cadastro manual e leitura de rótulo por imagem;
- quantidade e controle por garrafa;
- armário visual 1–5 / 6–10 / 11–15...;
- edição e troca de posição sem duplicidade;
- movimentações e auditoria;
- fluxo Abrir garrafa e diário de degustação;
- favoritos, wishlist e eventos;
- harmonização e Sommelier IA usando o estoque real;
- ficha técnica;
- backup JSON, importação e CSV;
- Cloudinary configurável pelo painel;
- PWA para Android/celular;
- backend Gemini protegido na Vercel.

## Cloudinary

Em **Configurações**, informe o `Cloud name` e o `Unsigned upload preset` do Cloudinary utilizado pela adega e salve. A configuração pública passa a ser sincronizada em `v2.settings.cloudinary` no próprio documento da adega. Nunca coloque `API Secret` do Cloudinary no frontend.

## Gemini

Na Vercel, em **Settings → Environment Variables**:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

A chave não fica exposta no navegador.

## Atenção à versão antiga

A versão antiga usava `setDoc({ estoque })` sem `merge`. Se ela voltar a gravar no mesmo Firebase, pode remover o bloco `v2`. Depois da migração 2.1, use o PRO como interface principal.

## Validação

Opcionalmente, com Node 20+:

```bash
npm run check
```

O GitHub Actions executa a mesma validação nos pushes.

---

Powered by **thIAguinho Soluções Digitais**
