# Matriz de Purga

App Android para guardar e consultar os volumes de purga (flushing volumes) da Bambu Lab por par de cores de/para. Os dados ficam guardados no próprio celular, sem conta nem internet.

## Baixar e instalar

1. No celular, abra a página **Releases** deste repositório e baixe o `.apk` da versão mais recente.
2. Abra o arquivo. Se o Android pedir, permita "instalar apps desta fonte" para o navegador.

Versões novas são instaladas por cima da anterior, sem perder os dados.

## Backup

Os dados ficam numa área privada do app. Desinstalar o app ou usar "Limpar dados" apaga tudo, então use **Exportar backup** de vez em quando e guarde o arquivo `.json` no Drive ou no WhatsApp. **Importar backup** restaura a partir desse arquivo.

## Estrutura

```
www/index.html          o app (tela, matriz com zoom, dados locais, backup)
assets/                 ícone e tela de abertura
.github/workflows/      gera e assina o APK a cada push na branch main
apps-script/            versão integrada com Google Sheets (não usada pelo app por enquanto)
```

## Versão integrada (opcional, futura)

A pasta `apps-script/` guarda um servidor em Google Apps Script que usa uma planilha como base e expõe uma API JSON. Não está ligado ao app atual.

### Configurar o Apps Script

1. Na planilha, abra **Extensões > Apps Script** e cole `apps-script/Code.gs` e `apps-script/Index.html` (arquivo HTML chamado `Index`).
2. Rode a função `gerarToken` e copie a senha que aparece no registro de execução.
3. **Implantar > Gerenciar implantações > editar**: escolha **Nova versão**, **Executar como: Eu** e **Quem pode acessar: Qualquer pessoa**.
4. No computador, abra `SEU_LINK/exec?token=SUA_SENHA` e salve nos favoritos.

Sem a senha, o link mostra apenas "Acesso restrito" e a API responde `token inválido`.

### API

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
