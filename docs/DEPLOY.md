# Publicação — novo repositório + Vercel

## 1. Novo repositório no GitHub

Crie um repositório novo, de preferência **Private**. Envie para a raiz do repositório todo o conteúdo deste ZIP — não envie a pasta externa envolvendo os arquivos.

Na raiz devem aparecer diretamente `index.html`, `vercel.json`, `package.json`, `api/`, `js/`, `css/` e `assets/`.

## 2. Importar na Vercel

1. Na Vercel, escolha **Add New → Project**.
2. Importe o novo repositório.
3. Framework Preset: **Other**.
4. Root Directory: raiz do repositório.
5. Build Command: deixe vazio.
6. Output Directory: deixe vazio.
7. Salve o projeto.

## 3. Gemini — obrigatório para IA

Em **Vercel → Project → Settings → Environment Variables**, crie:

- `GEMINI_API_KEY` = sua chave Gemini atual/rotacionada
- `GEMINI_MODEL` = `gemini-2.5-flash` (opcional)

Marque Production, Preview e Development se quiser IA em todos os ambientes. Depois faça Redeploy.

> A versão antiga expunha a chave Gemini no JavaScript do navegador. Por segurança, não reutilize uma chave que você considere comprometida: gere/rotacione no Google AI Studio e coloque somente na Vercel.

## 4. Firebase

Nada precisa ser trocado. O projeto já está configurado para o mesmo Firebase `valencio-app` e para `adegas/adega-compartilhada`.

O novo aplicativo preserva o campo `estoque` no documento legado e cria somente um documento adicional no mesmo projeto:

```text
adegas/adega-compartilhada-pro-v2
```

Esse segundo documento guarda diário, auditoria, eventos, wishlist e configurações. A separação evita que o `setDoc({ estoque })` da versão antiga apague os recursos PRO.

Se suas Rules atuais autorizam apenas o ID exato `adega-compartilhada`, será necessário autorizar também `adega-compartilhada-pro-v2`. Se elas já usam um wildcard como `match /adegas/{docId}`, normalmente o novo documento entra na mesma regra.

## 5. Cloudinary

O ZIP antigo da adega não continha `cloudName` nem `uploadPreset`, portanto eles não foram inventados.

No primeiro acesso:

1. Abra ⚙ **Configurações**.
2. Vá à área Cloudinary.
3. Toque em **Procurar no Firebase**. O app tenta reaproveitar configuração pública existente no mesmo Firebase.
4. Se não encontrar, informe os **mesmos** `Cloud name` e `Unsigned upload preset` já usados por você.
5. Toque em **Testar Cloudinary** e depois em **Salvar**.

Essa configuração pública passa a ser salva na própria adega e sincroniza com outros dispositivos.

## 6. Validação rápida depois do deploy

Faça nesta ordem:

1. O contador de garrafas precisa carregar os dados antigos.
2. Cadastre manualmente 1 vinho de teste e confirme que aparece em outro aparelho.
3. Altere +1 e -1 e confirme o histórico no Diário.
4. Configure/teste Cloudinary e fotografe um rótulo.
5. Abra **Sommelier** e confirme que `/api/ai` aparece configurada.
6. Instale a PWA pelo navegador Android e abra novamente.

Não exclua o repositório antigo nem o Firebase antigo para testar esta versão. Os dois frontends podem ler e alterar o mesmo estoque legado; os recursos PRO ficam isolados no documento adicional. Depois de validar o PRO, use-o como interface principal para que todas as movimentações passem pela auditoria nova.
