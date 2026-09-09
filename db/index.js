const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool, types } = require('pg');

// DATE columns (OID 1082) chegam como string 'YYYY-MM-DD' em vez de objeto Date,
// evitando o clássico problema de fuso horário deslocando o dia em 1.
types.setTypeParser(1082, (val) => val);

const sslEnabled = process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false
});

function uid(prefix) {
  return (prefix || 'id') + '_' + crypto.randomBytes(8).toString('hex');
}

function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// [nome, categoria, unidade, estoqueAtual, estoqueMinimo, localizacao, reutilizavel, validadeDiasOffset|null]
const MATERIAIS_SEED_RAW = [
  ['Cabo de Bisturi nº 3', 'instrumental', 'un', 12, 4, 'Armário A1', true, null],
  ['Cabo de Bisturi nº 4', 'instrumental', 'un', 10, 4, 'Armário A1', true, null],
  ['Tesoura Mayo Reta', 'instrumental', 'un', 8, 3, 'Armário A1', true, null],
  ['Tesoura Mayo Curva', 'instrumental', 'un', 8, 3, 'Armário A1', true, null],
  ['Tesoura Metzenbaum', 'instrumental', 'un', 6, 2, 'Armário A1', true, null],
  ['Tesoura Íris', 'instrumental', 'un', 6, 2, 'Armário A2', true, null],
  ['Pinça Anatômica 14cm', 'instrumental', 'un', 16, 6, 'Armário A2', true, null],
  ['Pinça Dente-de-Rato 14cm', 'instrumental', 'un', 16, 6, 'Armário A2', true, null],
  ['Pinça Kelly Reta', 'instrumental', 'un', 10, 4, 'Armário A2', true, null],
  ['Pinça Kelly Curva', 'instrumental', 'un', 10, 4, 'Armário A2', true, null],
  ['Pinça Kocher', 'instrumental', 'un', 8, 3, 'Armário A3', true, null],
  ['Porta-Agulha Mayo-Hegar', 'instrumental', 'un', 10, 4, 'Armário A3', true, null],
  ['Afastador Farabeuf (par)', 'instrumental', 'par', 6, 2, 'Armário A3', true, null],
  ['Afastador Senn-Muller', 'instrumental', 'un', 6, 2, 'Armário A3', true, null],
  ['Cuba Rim Inox', 'instrumental', 'un', 8, 3, 'Armário A4', true, null],
  ['Cuba Redonda Inox', 'instrumental', 'un', 8, 3, 'Armário A4', true, null],
  ['Pinça Backhaus (Campo)', 'instrumental', 'un', 14, 5, 'Armário A4', true, null],
  ['Lâmina de Bisturi nº 15 (cx c/100)', 'descartavel', 'cx', 3, 1, 'Prateleira B1', false, 90],
  ['Lâmina de Bisturi nº 22 (cx c/100)', 'descartavel', 'cx', 2, 1, 'Prateleira B1', false, 90],
  ['Gaze Estéril 7,5x7,5cm (pacote)', 'descartavel', 'pct', 20, 8, 'Prateleira B1', false, 200],
  ['Gaze Não Estéril (pacote)', 'descartavel', 'pct', 15, 5, 'Prateleira B1', false, null],
  ['Algodão Hidrófilo (rolo)', 'descartavel', 'un', 10, 4, 'Prateleira B2', false, null],
  ['Esparadrapo Impermeável (rolo)', 'descartavel', 'un', 12, 4, 'Prateleira B2', false, null],
  ['Micropore (rolo)', 'descartavel', 'un', 14, 5, 'Prateleira B2', false, null],
  ['Luva Estéril nº 7,5 (par)', 'descartavel', 'par', 24, 10, 'Prateleira B3', false, 12],
  ['Luva de Procedimento (caixa)', 'descartavel', 'cx', 8, 3, 'Prateleira B3', false, 300],
  ['Máscara Cirúrgica Tripla (caixa)', 'descartavel', 'cx', 1, 2, 'Prateleira B3', false, 300],
  ['Touca Descartável (pacote)', 'descartavel', 'pct', 10, 3, 'Prateleira B3', false, null],
  ['Avental Descartável', 'descartavel', 'un', 30, 10, 'Prateleira B4', false, null],
  ['Campo Cirúrgico Fenestrado', 'descartavel', 'un', 18, 6, 'Prateleira B4', false, 150],
  ['Campo Cirúrgico Simples', 'descartavel', 'un', 18, 6, 'Prateleira B4', false, 150],
  ['Seringa Descartável 10ml', 'descartavel', 'un', 40, 15, 'Prateleira B5', false, 300],
  ['Agulha Descartável 25x7 (caixa)', 'descartavel', 'cx', 5, 2, 'Prateleira B5', false, 300],
  ['Fio Mononáilon 3-0', 'sutura', 'un', 20, 8, 'Gaveta C1', false, 250],
  ['Fio Categute Simples 2-0', 'sutura', 'un', 16, 6, 'Gaveta C1', false, 18],
  ['Fio Categute Cromado 2-0', 'sutura', 'un', 16, 6, 'Gaveta C1', false, -6],
  ['Fio de Seda 3-0', 'sutura', 'un', 18, 6, 'Gaveta C2', false, 250],
  ['Fio Vicryl 3-0', 'sutura', 'un', 3, 5, 'Gaveta C2', false, 9],
  ['Álcool 70% (frasco 1L)', 'antisseptico', 'frasco', 8, 3, 'Armário D1', false, 300],
  ['PVPI Tópico (frasco)', 'antisseptico', 'frasco', 6, 2, 'Armário D1', false, 200],
  ['PVPI Degermante (frasco)', 'antisseptico', 'frasco', 6, 2, 'Armário D1', false, 200],
  ['Clorexidina Degermante 2% (frasco)', 'antisseptico', 'frasco', 6, 2, 'Armário D2', false, 240],
  ['Soro Fisiológico 0,9% (frasco 500ml)', 'antisseptico', 'frasco', 5, 8, 'Armário D2', false, -3],
  ['Óculos de Proteção', 'epi', 'un', 14, 5, 'Armário E1', true, null],
  ['Máscara N95/PFF2 (caixa)', 'epi', 'cx', 4, 2, 'Armário E1', false, 300],
  ['Protetor Facial (Face Shield)', 'epi', 'un', 10, 4, 'Armário E1', true, null],
  ['Avental Impermeável', 'epi', 'un', 12, 4, 'Armário E2', true, null]
];

async function initSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schemaSql);
}

async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM materiais');
  if (rows[0].n > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < MATERIAIS_SEED_RAW.length; i++) {
      const [nome, categoria, unidade, estoqueAtual, estoqueMinimo, localizacao, reutilizavel, validadeDias] = MATERIAIS_SEED_RAW[i];
      const id = 'seed_' + (i + 1);
      const codigo = 'MAT-' + String(i + 1).padStart(4, '0');
      const lote = reutilizavel ? '' : ('L' + String(2026001 + i));
      const validade = (validadeDias === null || validadeDias === undefined) ? null : addDaysISO(validadeDias);
      await client.query(
        `INSERT INTO materiais (id, codigo, nome, categoria, unidade, estoque_atual, estoque_minimo, localizacao, fornecedor, lote, validade, reutilizavel, foto, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,$11,'','')`,
        [id, codigo, nome, categoria, unidade, estoqueAtual, estoqueMinimo, localizacao, lote, validade, reutilizavel]
      );
    }
    await client.query(
      `INSERT INTO auditlog (id, acao, entidade, entidade_id, detalhes) VALUES ($1,'seed','sistema','-', $2)`,
      [uid('log'), 'Catálogo padrão carregado com ' + MATERIAIS_SEED_RAW.length + ' itens']
    );
    await client.query('COMMIT');
    console.log('Seed: catálogo padrão inserido (' + MATERIAIS_SEED_RAW.length + ' itens).');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, uid, initSchema, seedIfEmpty };
