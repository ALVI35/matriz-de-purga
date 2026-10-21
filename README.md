# Matriz de Purga

App Android para guardar e consultar os volumes de purga (flushing volumes) da Bambu Lab por par de cores de/para. Os dados ficam numa planilha do Google, então o mesmo conteúdo aparece no celular (este app) e no computador (o app web do Apps Script).

## Baixar e instalar

1. No celular, abra a página **Releases** deste repositório e baixe o `.apk` da versão mais recente.
2. Abra o arquivo. Se o Android pedir, permita "instalar apps desta fonte" para o navegador.
3. Na primeira vez, o app pede o **link /exec** e a **senha** (API_TOKEN). Eles ficam guardados só no celular.

Versões novas são instaladas por cima da anterior, sem perder a configuração.

## Como funciona

```
www/index.html          tela do app Android (fala com a planilha pela API JSON)
apps-script/Code.gs     servidor no Google Apps Script (planilha + API + senha)
apps-script/Index.html  tela do app web para o computador
assets/                 ícone e tela de abertura
.github/workflows/      gera e assina o APK a cada push na branch main
```

A planilha tem três abas: **Cores**, **Purga** (uma linha por transição, com status e anotação) e **Matriz** (visão de/para calculada por fórmulas).

## Configurar o Apps Script (uma vez)

1. Na planilha, abra **Extensões > Apps Script** e cole `apps-script/Code.gs` e `apps-script/Index.html` (arquivo HTML chamado `Index`).
2. Rode a função `gerarToken` e copie a senha que aparece no registro de execução.
3. **Implantar > Gerenciar implantações > editar**: escolha **Nova versão**, **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.
4. No computador, abra `SEU_LINK/exec?token=SUA_SENHA` e salve nos favoritos.

Sem a senha, o link mostra apenas "Acesso restrito" e a API responde `token inválido`.

## API

`POST` no link `/exec`, corpo JSON (Content-Type `text/plain`):

| acao | campos |
|---|---|
| `dados` | |
| `salvarCor` | `cor: {id?, nome, hex, material, marca}` |
| `excluirCor` | `id` |
| `salvarPurga` | `purga: {de_id, para_id, valor_mm3, status, nota}` |
| `excluirPurga` | `de_id, para_id` |

Toda requisição leva `token`. A resposta é `{ok, dados}` ou `{ok: false, erro}`.

## Assinatura

O APK é assinado com a chave `assinatura/matriz-purga.jks`, protegida por senha. A senha fica só no segredo `KEYSTORE_PASSWORD` do repositório. Sem a mesma chave e senha, uma versão nova exigiria desinstalar o app antes.
