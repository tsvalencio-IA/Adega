# Firestore Rules — compatibilidade

O código **não altera suas Rules automaticamente**. Isso é intencional: sobrescrever regras existentes poderia quebrar outros projetos que usam o mesmo Firebase `valencio-app`.

A versão PRO usa dois documentos da coleção `adegas`:

```text
adegas/adega-compartilhada
adegas/adega-compartilhada-pro-v2
```

## Se sua regra atual já usa wildcard

Exemplo estrutural:

```text
match /adegas/{adegaId} {
  ...sua regra atual...
}
```

Nesse caso, o segundo documento normalmente já cai na mesma regra e nenhuma mudança é necessária.

## Se sua regra libera apenas o documento antigo

Se existir algo específico como:

```text
match /adegas/adega-compartilhada {
  ...
}
```

copie **a mesma condição de acesso que você já usa** para:

```text
match /adegas/adega-compartilhada-pro-v2 {
  ...a mesma condição de acesso aprovada por você...
}
```

Não use `allow read, write: if true` apenas para fazer o app funcionar em produção. Como este Firebase pode ser compartilhado com outros projetos, ajuste somente os caminhos necessários e preserve o restante das Rules.

## Fallback automático

Se o documento PRO não puder ser lido/escrito, o aplicativo:

- continua lendo e gravando o `estoque` no documento antigo;
- mantém diário/configurações avançadas em armazenamento local do navegador;
- mostra um aviso em Configurações de que os dados PRO não estão sincronizando entre aparelhos.

Assim uma Rule restritiva não impede o uso do estoque atual.
