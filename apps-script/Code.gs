/**
 * Matriz de Purga — back-end em Google Apps Script.
 * A planilha "Matriz de Purga" é o banco de dados:
 *   Cores  : id | nome | hex | material | marca | ordem | criado_em
 *   Purga  : chave | de_id | para_id | valor_mm3 | status | nota | atualizado_em
 *   Matriz : visão de/para calculada por fórmulas (só leitura)
 *
 * O mesmo script serve:
 *   - o app web (doGet sem parâmetros) usado no computador e no celular;
 *   - uma API JSON (doGet ?api=dados&token=... / doPost) usada pelo app Android.
 */

const PLANILHA_ID = '18kLA285vjFwCW_vPT0p-MRkLBJQNZOGdqGIJ1pRVk0Q';
const COLS_CORES = ['id', 'nome', 'hex', 'material', 'marca', 'ordem', 'criado_em'];
const COLS_PURGA = ['chave', 'de_id', 'para_id', 'valor_mm3', 'status', 'nota', 'atualizado_em'];
const TAMANHO_MATRIZ = 40; // cores que a aba Matriz comporta

function ss_() {
  return SpreadsheetApp.openById(PLANILHA_ID);
}

/* ================= APP WEB ================= */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api) return api_(p.api, p, null);
  if (!autorizado_(p.token)) {
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif;padding:24px">Acesso restrito. ' +
      'Abra o link com a senha no final: .../exec?token=SUA_SENHA</p>').setTitle('Matriz de Purga');
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.token = p.token || '';
  return t.evaluate()
    .setTitle('Matriz de Purga')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  return api_(body.acao || 'dados', (e && e.parameter) || {}, body);
}

/* ================= SENHA ================= */

function autorizado_(enviado) {
  const token = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  return !token || enviado === token;
}
function checar_(enviado) {
  if (!autorizado_(enviado)) throw new Error('Senha inválida.');
}

/**
 * Rode uma vez pelo editor (menu de funções > gerarToken > Executar).
 * Cria a senha e mostra no Registro de execução os links prontos.
 * Para trocar a senha: apague API_TOKEN em Configurações do projeto > Propriedades do script e rode de novo.
 */
function gerarToken() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('API_TOKEN')) {
    Logger.log('Já existe uma senha. Ela está em Configurações do projeto > Propriedades do script > API_TOKEN.');
    return;
  }
  const token = Utilities.getUuid().replace(/-/g, '');
  props.setProperty('API_TOKEN', token);
  Logger.log('Senha (API_TOKEN): ' + token);
  Logger.log('No computador, abra: <seu link /exec>?token=' + token);
}

/* ================= FUNÇÕES CHAMADAS PELA TELA WEB ================= */

function obterDados(token) { checar_(token); return dados_(); }
function salvarCor(token, cor) { checar_(token); return salvarCor_(cor); }
function excluirCor(token, id) { checar_(token); return excluirCor_(id); }
function salvarPurga(token, p) { checar_(token); return salvarPurga_(p); }
function excluirPurga(token, de, para) { checar_(token); return excluirPurga_(de, para); }

/* ================= API JSON (app Android) ================= */

function api_(acao, params, body) {
  body = body || {};
  if (!autorizado_(body.token || params.token)) return json_({ ok: false, erro: 'token inválido' });
  try {
    let r;
    switch (acao) {
      case 'dados': r = dados_(); break;
      case 'salvarCor': r = salvarCor_(body.cor); break;
      case 'excluirCor': r = excluirCor_(body.id); break;
      case 'salvarPurga': r = salvarPurga_(body.purga); break;
      case 'excluirPurga': r = excluirPurga_(body.de_id, body.para_id); break;
      default: return json_({ ok: false, erro: 'ação desconhecida: ' + acao });
    }
    return json_({ ok: true, dados: r });
  } catch (err) {
    return json_({ ok: false, erro: String(err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= LEITURA ================= */

function dados_() {
  const ss = ss_();
  const cores = lerTabela_(ss.getSheetByName('Cores'), COLS_CORES)
    .filter(c => c.id)
    .map(c => ({
      id: String(c.id), nome: String(c.nome), hex: String(c.hex || '#888888').toUpperCase(),
      material: String(c.material || ''), marca: String(c.marca || ''),
      ordem: Number(c.ordem) || 0, criado_em: String(c.criado_em || '')
    }))
    .sort((a, b) => a.ordem - b.ordem);
  const purga = lerTabela_(ss.getSheetByName('Purga'), COLS_PURGA)
    .filter(p => p.de_id && p.para_id && p.valor_mm3 !== '')
    .map(p => ({
      de_id: String(p.de_id), para_id: String(p.para_id), valor_mm3: Number(p.valor_mm3),
      status: String(p.status || 'ajustado'), nota: String(p.nota || ''),
      atualizado_em: String(p.atualizado_em || '')
    }));
  return { cores: cores, purga: purga, lidoEm: new Date().toISOString() };
}

function lerTabela_(sh, cols) {
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getValues();
  return v.map(r => { const o = {}; cols.forEach((c, i) => o[c] = r[i]); return o; });
}

/* ================= ESCRITA ================= */

function comTrava_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function linhaDe_(sh, valor) {
  if (sh.getLastRow() < 2) return -1;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(valor)) return i + 2;
  return -1;
}

function salvarCor_(cor) {
  if (!cor || !cor.nome) throw new Error('A cor precisa de um nome.');
  const hex = String(cor.hex || '').toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(hex)) throw new Error('Cor em formato inválido. Use #RRGGBB.');
  return comTrava_(() => {
    const sh = ss_().getSheetByName('Cores');
    let id = cor.id ? String(cor.id) : '';
    let linha = id ? linhaDe_(sh, id) : -1;
    let ordem, criado;
    if (linha > 0) {
      const atual = sh.getRange(linha, 1, 1, COLS_CORES.length).getValues()[0];
      ordem = atual[5]; criado = atual[6];
    } else {
      id = id || novoId_(cor.nome);
      const ords = sh.getLastRow() > 1 ? sh.getRange(2, 6, sh.getLastRow() - 1, 1).getValues().map(r => Number(r[0]) || 0) : [0];
      ordem = Math.max.apply(null, ords.concat([0])) + 1;
      criado = new Date().toISOString();
      linha = sh.getLastRow() + 1;
    }
    sh.getRange(linha, 1, 1, COLS_CORES.length).setValues([[id, cor.nome, hex, cor.material || 'PLA', cor.marca || '', ordem, criado]]);
    sh.getRange(linha, 3).setBackground(hex).setFontColor(corTexto_(hex));
    return dados_();
  });
}

function excluirCor_(id) {
  return comTrava_(() => {
    const ss = ss_();
    const sc = ss.getSheetByName('Cores');
    const l = linhaDe_(sc, id);
    if (l > 0) sc.deleteRow(l);
    const sp = ss.getSheetByName('Purga');
    if (sp.getLastRow() > 1) {
      const v = sp.getRange(2, 2, sp.getLastRow() - 1, 2).getValues();
      for (let i = v.length - 1; i >= 0; i--) {
        if (String(v[i][0]) === String(id) || String(v[i][1]) === String(id)) sp.deleteRow(i + 2);
      }
    }
    return dados_();
  });
}

function salvarPurga_(p) {
  const v = Number(p && p.valor_mm3);
  if (!p || !p.de_id || !p.para_id || !isFinite(v) || v < 0 || v > 900) throw new Error('Valor deve ficar entre 0 e 900 mm³.');
  return comTrava_(() => {
    const sh = ss_().getSheetByName('Purga');
    const chave = p.de_id + '~' + p.para_id;
    let linha = linhaDe_(sh, chave);
    if (linha < 0) linha = sh.getLastRow() + 1;
    sh.getRange(linha, 1, 1, COLS_PURGA.length).setValues([[
      chave, p.de_id, p.para_id, Math.round(v), p.status || 'ajustado', p.nota || '', new Date().toISOString()
    ]]);
    return dados_();
  });
}

function excluirPurga_(de, para) {
  return comTrava_(() => {
    const sh = ss_().getSheetByName('Purga');
    const l = linhaDe_(sh, de + '~' + para);
    if (l > 0) sh.deleteRow(l);
    return dados_();
  });
}

function novoId_(nome) {
  const base = String(nome).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'cor';
  return base + '-' + Utilities.getUuid().slice(0, 4);
}

function corTexto_(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return l > 150 ? '#1B2220' : '#FFFFFF';
}

/* ================= CONFIGURAÇÃO INICIAL (rodar uma vez) ================= */

function configurar() {
  const ss = ss_();
  const agora = '2026-09-29T18:50:00Z';

  // --- Cores
  let sc = ss.getSheetByName('Cores');
  if (!sc) { sc = ss.getSheets()[0]; sc.setName('Cores'); }
  if (sc.getLastRow() < 2) {
    const cores = [
      ['branco', 'Branco', '#FFFFFF'], ['preto', 'Preto', '#161616'], ['amarelo', 'Amarelo', '#F4C21A'],
      ['azul-claro', 'Azul claro', '#A9D3E6'], ['laranja-claro', 'Laranja claro', '#F0B866'],
      ['rosa-claro', 'Rosa claro', '#F5DCD6'], ['marrom', 'Marrom', '#6B4A3A']
    ];
    sc.clear();
    sc.getRange(1, 1, 1, COLS_CORES.length).setValues([COLS_CORES]);
    sc.getRange(2, 1, cores.length, COLS_CORES.length)
      .setValues(cores.map((c, i) => [c[0], c[1], c[2], 'PLA', '', i + 1, agora]));
    cores.forEach((c, i) => sc.getRange(i + 2, 3).setBackground(c[2]).setFontColor(corTexto_(c[2])));

    // --- Purga (valores do Bambu Studio, tela Flushing volumes de 29/09/2026)
    const M = [[0,128,287,114,171,108,139],[608,0,656,552,570,587,340],[426,166,0,351,166,365,210],
               [270,151,269,0,211,234,177],[332,158,175,244,0,269,130],[157,134,264,131,146,0,115],
               [496,108,471,433,383,447,0]];
    let sp = ss.getSheetByName('Purga') || ss.insertSheet('Purga');
    sp.clear();
    sp.getRange(1, 1, 1, COLS_PURGA.length).setValues([COLS_PURGA]);
    const linhas = [];
    cores.forEach((a, i) => cores.forEach((b, j) => {
      if (i !== j) linhas.push([a[0] + '~' + b[0], a[0], b[0], M[i][j], 'bambu', '', agora]);
    }));
    sp.getRange(2, 1, linhas.length, COLS_PURGA.length).setValues(linhas);
    sp.getRange('A1').setNote('Uma linha por transição. chave = de_id~para_id. status: bambu (padrão do slicer), ajustado ou testado. ' +
      'Fonte dos valores iniciais: tela Flushing volumes do Bambu Studio, 29/09/2026.');
  }
  const sp = ss.getSheetByName('Purga');

  [sc, sp].forEach(sh => {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#2E3A36').setFontColor('#FFFFFF');
    sh.getDataRange().setFontFamily('Arial');
  });
  sc.setColumnWidths(1, 2, 140); sc.setColumnWidth(7, 170);
  sp.setColumnWidth(1, 200); sp.setColumnWidths(2, 2, 120); sp.setColumnWidth(6, 280); sp.setColumnWidth(7, 170);
  sp.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['bambu', 'ajustado', 'testado'], true).build());
  sc.getRange('A1').setNote('Base de dados do app Matriz de Purga. Prefira editar pelo app. Se editar aqui, mantenha o id único e sem espaços.');

  montarMatriz_(ss);
  ss.setActiveSheet(ss.getSheetByName('Matriz'));
  return 'Pronto';
}

function montarMatriz_(ss) {
  let sm = ss.getSheetByName('Matriz');
  if (sm) sm.clear(); else sm = ss.insertSheet('Matriz');
  const N = TAMANHO_MATRIZ;
  if (sm.getMaxColumns() < N + 2) sm.insertColumnsAfter(sm.getMaxColumns(), N + 2 - sm.getMaxColumns());
  if (sm.getMaxRows() < N + 2) sm.insertRowsAfter(sm.getMaxRows(), N + 2 - sm.getMaxRows());
  const col = c => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

  const topo = [[], []];
  for (let k = 0; k < N; k++) {
    const L = col(3 + k);
    topo[0].push('=IFERROR(INDEX(SORT(FILTER(Cores!$A$2:$A,Cores!$A$2:$A<>""),FILTER(Cores!$F$2:$F,Cores!$A$2:$A<>""),TRUE),' + (k + 1) + '),"")');
    topo[1].push('=IF(' + L + '1="","",INDEX(Cores!$B:$B,MATCH(' + L + '1,Cores!$A:$A,0)))');
  }
  sm.getRange(1, 3, 2, N).setFormulas(topo);
  const lado = [], corpo = [];
  for (let r = 0; r < N; r++) {
    const R = r + 3;
    lado.push(['=IFERROR(INDEX(SORT(FILTER(Cores!$A$2:$A,Cores!$A$2:$A<>""),FILTER(Cores!$F$2:$F,Cores!$A$2:$A<>""),TRUE),' + (r + 1) + '),"")',
               '=IF(A' + R + '="","",INDEX(Cores!$B:$B,MATCH(A' + R + ',Cores!$A:$A,0)))']);
    const linha = [];
    for (let k = 0; k < N; k++) {
      const L = col(3 + k);
      linha.push('=IF(OR($A' + R + '="",' + L + '$1=""),"",IF($A' + R + '=' + L + '$1,"—",IFERROR(INDEX(Purga!$D:$D,MATCH($A' + R + '&"~"&' + L + '$1,Purga!$A:$A,0)),"")))');
    }
    corpo.push(linha);
  }
  sm.getRange(3, 1, N, 2).setFormulas(lado);
  sm.getRange(3, 3, N, N).setFormulas(corpo).setHorizontalAlignment('center');
  sm.getRange('B2').setValue('de ↓  para →').setNote('Linha = cor que sai (de). Coluna = cor que entra (para). Valores em mm³. ' +
    'Calculada a partir das abas Cores e Purga; não digite aqui.');

  sm.getRange(1, 1, N + 2, N + 2).setFontFamily('Arial');
  sm.getRange(2, 1, 1, N + 2).setFontWeight('bold').setWrap(true).setHorizontalAlignment('center');
  sm.getRange(3, 2, N, 1).setFontWeight('bold');
  sm.getRange(1, 1, 1, N + 2).setFontColor('#9AA5A1').setFontSize(8);
  sm.getRange(3, 1, N, 1).setFontColor('#9AA5A1').setFontSize(8);
  sm.setColumnWidth(1, 30); sm.setColumnWidth(2, 120); sm.setColumnWidths(3, N, 72);
  sm.setFrozenRows(2); sm.setFrozenColumns(2);

  const faixa = sm.getRange(3, 3, N, N);
  sm.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#E8F3EC', SpreadsheetApp.InterpolationType.NUMBER, '48')
      .setGradientMidpointWithValue('#F6D9A8', SpreadsheetApp.InterpolationType.NUMBER, '300')
      .setGradientMaxpointWithValue('#D9774B', SpreadsheetApp.InterpolationType.NUMBER, '700')
      .setRanges([faixa]).build()
  ]);
}
