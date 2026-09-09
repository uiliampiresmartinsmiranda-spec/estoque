const express = require('express');
const path = require('path');
const { pool, uid, initSchema, seedIfEmpty } = require('./db');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ========================= mappers (snake_case -> camelCase) ========================= */
function rowToMaterial(r) {
  return {
    id: r.id, codigo: r.codigo, nome: r.nome, categoria: r.categoria, unidade: r.unidade,
    estoqueAtual: r.estoque_atual, estoqueMinimo: r.estoque_minimo, localizacao: r.localizacao || '',
    fornecedor: r.fornecedor || '', lote: r.lote || '', validade: r.validade || '',
    reutilizavel: r.reutilizavel, foto: r.foto || '', observacoes: r.observacoes || '',
    criadoEm: r.criado_em, atualizadoEm: r.atualizado_em
  };
}
function rowToMovimentacao(r) {
  return {
    id: r.id, codigo: r.codigo, tipo: r.tipo, materialId: r.material_id, quantidade: r.quantidade,
    data: r.data || '', lote: r.lote || '', validade: r.validade || '', fornecedor: r.fornecedor || '', notaFiscal: r.nota_fiscal || '',
    turma: r.turma || '', professor: r.professor || '', finalidade: r.finalidade || '', alunos: r.alunos || '',
    retornavel: r.retornavel, statusDevolucao: r.status_devolucao, dataDevolucao: r.data_devolucao || '',
    condicaoDevolucao: r.condicao_devolucao, responsavel: r.responsavel || '', verificadoPor: r.verificado_por || '',
    observacoes: r.observacoes || '', criadoEm: r.criado_em
  };
}
function rowToTurma(r) { return { id: r.id, nome: r.nome, curso: r.curso || '', professor: r.professor || '' }; }
function rowToCategoria(r) { return { key: r.key, nome: r.nome, cor: r.cor }; }
function rowToConfig(r) { return { instituicao: r.instituicao || '', diasAlertaValidade: r.dias_alerta_validade || 30 }; }
function rowToAudit(r) { return { id: r.id, timestamp: r.ts, acao: r.acao, entidade: r.entidade, entidadeId: r.entidade_id, detalhes: r.detalhes || '' }; }
function condicaoLabel(c) { return { integro: 'Íntegro', danificado: 'Danificado', perdido: 'Perdido' }[c] || c; }

async function logAudit(client, acao, entidade, entidadeId, detalhes) {
  await client.query(
    `INSERT INTO auditlog (id, acao, entidade, entidade_id, detalhes) VALUES ($1,$2,$3,$4,$5)`,
    [uid('log'), acao, entidade, entidadeId, detalhes || '']
  );
}
async function nextMaterialCodigo(client) {
  const { rows } = await client.query(`SELECT codigo FROM materiais WHERE codigo LIKE 'MAT-%'`);
  let max = 0;
  rows.forEach(r => { const m = /MAT-(\d+)/.exec(r.codigo || ''); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } });
  return 'MAT-' + String(max + 1).padStart(4, '0');
}
async function nextMovCodigo(client) {
  const { rows } = await client.query(`SELECT codigo FROM movimentacoes WHERE codigo LIKE 'MOV-%'`);
  let max = 0;
  rows.forEach(r => { const m = /MOV-(\d+)/.exec(r.codigo || ''); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; } });
  return 'MOV-' + String(max + 1).padStart(5, '0');
}

/* ========================= health ========================= */
app.get('/healthz', (req, res) => res.json({ ok: true }));

/* ========================= bootstrap (carga inicial) ========================= */
app.get('/api/bootstrap', async (req, res) => {
  try {
    const [materiais, movimentacoes, turmas, categorias, config, auditlog] = await Promise.all([
      pool.query('SELECT * FROM materiais ORDER BY nome'),
      pool.query('SELECT * FROM movimentacoes ORDER BY criado_em DESC LIMIT 2000'),
      pool.query('SELECT * FROM turmas ORDER BY nome'),
      pool.query('SELECT * FROM categorias_custom ORDER BY nome'),
      pool.query('SELECT * FROM config WHERE id=1'),
      pool.query('SELECT * FROM auditlog ORDER BY ts DESC LIMIT 300')
    ]);
    res.json({
      materiais: materiais.rows.map(rowToMaterial),
      movimentacoes: movimentacoes.rows.map(rowToMovimentacao),
      turmas: turmas.rows.map(rowToTurma),
      categoriasCustom: categorias.rows.map(rowToCategoria),
      config: config.rows[0] ? rowToConfig(config.rows[0]) : { instituicao: '', diasAlertaValidade: 30 },
      auditlog: auditlog.rows.map(rowToAudit)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dados' });
  }
});

/* ========================= materiais ========================= */
app.post('/api/materiais', async (req, res) => {
  const b = req.body || {};
  if (!b.nome || !b.categoria) return res.status(400).json({ error: 'nome e categoria são obrigatórios' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const codigo = await nextMaterialCodigo(client);
    const id = uid('mat');
    const { rows } = await client.query(
      `INSERT INTO materiais (id,codigo,nome,categoria,unidade,estoque_atual,estoque_minimo,localizacao,fornecedor,lote,validade,reutilizavel,foto,observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [id, codigo, b.nome, b.categoria, b.unidade || 'un', parseInt(b.estoqueAtual, 10) || 0, parseInt(b.estoqueMinimo, 10) || 0,
      b.localizacao || '', b.fornecedor || '', b.lote || '', b.validade || null, !!b.reutilizavel, b.foto || '', b.observacoes || '']
    );
    await logAudit(client, 'criar', 'material', id, 'Cadastrou ' + b.nome);
    await client.query('COMMIT');
    res.status(201).json(rowToMaterial(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao criar material' });
  } finally { client.release(); }
});

app.put('/api/materiais/:id', async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE materiais SET nome=$1, categoria=$2, unidade=$3, estoque_atual=$4, estoque_minimo=$5, localizacao=$6,
       fornecedor=$7, lote=$8, validade=$9, reutilizavel=$10, foto=$11, observacoes=$12, atualizado_em=now()
       WHERE id=$13 RETURNING *`,
      [b.nome, b.categoria, b.unidade || 'un', parseInt(b.estoqueAtual, 10) || 0, parseInt(b.estoqueMinimo, 10) || 0, b.localizacao || '',
      b.fornecedor || '', b.lote || '', b.validade || null, !!b.reutilizavel, b.foto || '', b.observacoes || '', req.params.id]
    );
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Material não encontrado' }); }
    await logAudit(client, 'editar', 'material', req.params.id, 'Editou ' + b.nome);
    await client.query('COMMIT');
    res.json(rowToMaterial(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao editar material' });
  } finally { client.release(); }
});

app.delete('/api/materiais/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT nome FROM materiais WHERE id=$1', [req.params.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Material não encontrado' }); }
    await client.query('DELETE FROM materiais WHERE id=$1', [req.params.id]);
    await logAudit(client, 'excluir', 'material', req.params.id, 'Excluiu ' + rows[0].nome);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao excluir material' });
  } finally { client.release(); }
});

/* ========================= movimentações ========================= */
app.post('/api/movimentacoes/entrada', async (req, res) => {
  const b = req.body || {};
  const quantidade = parseInt(b.quantidade, 10) || 0;
  if (!b.materialId || quantidade <= 0) return res.status(400).json({ error: 'Material e quantidade válida são obrigatórios' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matRes = await client.query('SELECT * FROM materiais WHERE id=$1 FOR UPDATE', [b.materialId]);
    if (!matRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Material não encontrado' }); }
    const mat = matRes.rows[0];
    const lote = (b.lote || '').trim();
    const validade = b.validade || null;
    const updRes = await client.query(
      `UPDATE materiais SET estoque_atual = estoque_atual + $1,
       lote = CASE WHEN $2 <> '' THEN $2 ELSE lote END,
       validade = COALESCE($3, validade),
       atualizado_em = now() WHERE id=$4 RETURNING *`,
      [quantidade, lote, validade, b.materialId]
    );
    const id = uid('mov');
    const codigo = await nextMovCodigo(client);
    const movRes = await client.query(
      `INSERT INTO movimentacoes (id,codigo,tipo,material_id,quantidade,data,lote,validade,fornecedor,nota_fiscal,responsavel,verificado_por,observacoes)
       VALUES ($1,$2,'entrada',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, codigo, b.materialId, quantidade, b.data || new Date().toISOString().slice(0, 10), lote, validade,
      (b.fornecedor || '').trim(), (b.notaFiscal || '').trim(), (b.responsavel || '').trim(), (b.verificadoPor || '').trim(), (b.observacoes || '').trim()]
    );
    await logAudit(client, 'entrada', 'movimentacao', id, 'Entrada de ' + quantidade + ' ' + mat.unidade + ' — ' + mat.nome);
    await client.query('COMMIT');
    res.status(201).json({ movimentacao: rowToMovimentacao(movRes.rows[0]), material: rowToMaterial(updRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao registrar entrada' });
  } finally { client.release(); }
});

app.post('/api/movimentacoes/saida', async (req, res) => {
  const b = req.body || {};
  const quantidade = parseInt(b.quantidade, 10) || 0;
  if (!b.materialId || quantidade <= 0) return res.status(400).json({ error: 'Material e quantidade válida são obrigatórios' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const matRes = await client.query('SELECT * FROM materiais WHERE id=$1 FOR UPDATE', [b.materialId]);
    if (!matRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Material não encontrado' }); }
    const mat = matRes.rows[0];
    if (quantidade > mat.estoque_atual && !b.forcar) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'estoque_insuficiente', estoqueAtual: mat.estoque_atual, unidade: mat.unidade });
    }
    const updRes = await client.query(
      `UPDATE materiais SET estoque_atual = estoque_atual - $1, atualizado_em = now() WHERE id=$2 RETURNING *`,
      [quantidade, b.materialId]
    );
    const turma = (b.turma || '').trim();
    if (turma) {
      const existing = await client.query('SELECT id FROM turmas WHERE lower(nome)=lower($1)', [turma]);
      if (!existing.rows.length) {
        await client.query('INSERT INTO turmas (id,nome,curso,professor) VALUES ($1,$2,$3,$4)',
          [uid('turma'), turma, '', (b.professor || '').trim()]);
      }
    }
    const retornavel = !!mat.reutilizavel;
    const id = uid('mov');
    const codigo = await nextMovCodigo(client);
    const movRes = await client.query(
      `INSERT INTO movimentacoes (id,codigo,tipo,material_id,quantidade,data,turma,professor,finalidade,alunos,retornavel,status_devolucao,responsavel,verificado_por,observacoes)
       VALUES ($1,$2,'saida',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [id, codigo, b.materialId, quantidade, b.data || new Date().toISOString().slice(0, 10), turma, (b.professor || '').trim(),
      (b.finalidade || '').trim(), (b.alunos || '').trim(), retornavel, retornavel ? 'pendente' : null,
      (b.responsavel || '').trim(), (b.verificadoPor || '').trim(), (b.observacoes || '').trim()]
    );
    await logAudit(client, 'saida', 'movimentacao', id, 'Saída de ' + quantidade + ' ' + mat.unidade + ' — ' + mat.nome + (turma ? ' para ' + turma : ''));
    await client.query('COMMIT');
    res.status(201).json({ movimentacao: rowToMovimentacao(movRes.rows[0]), material: rowToMaterial(updRes.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao registrar saída' });
  } finally { client.release(); }
});

app.put('/api/movimentacoes/:id/devolucao', async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const movRes = await client.query('SELECT * FROM movimentacoes WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!movRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Movimentação não encontrada' }); }
    const mov = movRes.rows[0];
    const condicao = b.condicaoDevolucao;
    const dataDevolucao = b.dataDevolucao || new Date().toISOString().slice(0, 10);
    const updMov = await client.query(
      `UPDATE movimentacoes SET status_devolucao='devolvido', data_devolucao=$1, condicao_devolucao=$2 WHERE id=$3 RETURNING *`,
      [dataDevolucao, condicao, req.params.id]
    );
    let updMaterial = null;
    if (condicao === 'integro' && mov.material_id) {
      const r = await client.query(
        `UPDATE materiais SET estoque_atual = estoque_atual + $1, atualizado_em=now() WHERE id=$2 RETURNING *`,
        [mov.quantidade, mov.material_id]
      );
      updMaterial = r.rows[0] ? rowToMaterial(r.rows[0]) : null;
    }
    await logAudit(client, 'devolucao', 'movimentacao', req.params.id, 'Devolução registrada — ' + condicaoLabel(condicao));
    await client.query('COMMIT');
    res.json({ movimentacao: rowToMovimentacao(updMov.rows[0]), material: updMaterial });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao registrar devolução' });
  } finally { client.release(); }
});

/* ========================= turmas ========================= */
app.post('/api/turmas', async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = uid('turma');
    const { rows } = await client.query('INSERT INTO turmas (id,nome,curso,professor) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, b.nome, b.curso || '', b.professor || '']);
    await logAudit(client, 'criar', 'turma', id, 'Cadastrou turma ' + b.nome);
    await client.query('COMMIT');
    res.status(201).json(rowToTurma(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao criar turma' });
  } finally { client.release(); }
});
app.put('/api/turmas/:id', async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('UPDATE turmas SET nome=$1, curso=$2, professor=$3 WHERE id=$4 RETURNING *',
      [b.nome, b.curso || '', b.professor || '', req.params.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Turma não encontrada' }); }
    await logAudit(client, 'editar', 'turma', req.params.id, 'Editou turma ' + b.nome);
    await client.query('COMMIT');
    res.json(rowToTurma(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao editar turma' });
  } finally { client.release(); }
});
app.delete('/api/turmas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT nome FROM turmas WHERE id=$1', [req.params.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Turma não encontrada' }); }
    await client.query('DELETE FROM turmas WHERE id=$1', [req.params.id]);
    await logAudit(client, 'excluir', 'turma', req.params.id, 'Excluiu turma ' + rows[0].nome);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao excluir turma' });
  } finally { client.release(); }
});

/* ========================= categorias ========================= */
app.post('/api/categorias', async (req, res) => {
  const b = req.body || {};
  if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
  const key = 'cat_' + b.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + Date.now().toString(36).slice(-4);
  try {
    const { rows } = await pool.query('INSERT INTO categorias_custom (key,nome,cor) VALUES ($1,$2,$3) RETURNING *',
      [key, b.nome, b.cor || '#3B6E8F']);
    res.status(201).json(rowToCategoria(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao criar categoria' }); }
});
app.delete('/api/categorias/:key', async (req, res) => {
  try {
    const inUse = await pool.query('SELECT 1 FROM materiais WHERE categoria=$1 LIMIT 1', [req.params.key]);
    if (inUse.rows.length) return res.status(409).json({ error: 'Categoria em uso por materiais' });
    await pool.query('DELETE FROM categorias_custom WHERE key=$1', [req.params.key]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao excluir categoria' }); }
});

/* ========================= config ========================= */
app.put('/api/config', async (req, res) => {
  const b = req.body || {};
  try {
    const { rows } = await pool.query(
      `UPDATE config SET instituicao=$1, dias_alerta_validade=$2 WHERE id=1 RETURNING *`,
      [b.instituicao || '', parseInt(b.diasAlertaValidade, 10) || 30]
    );
    res.json(rowToConfig(rows[0]));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao salvar configuração' }); }
});

/* ========================= backup / reset ========================= */
app.post('/api/reset', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM movimentacoes');
    await client.query('DELETE FROM materiais');
    await client.query('DELETE FROM turmas');
    await client.query('DELETE FROM categorias_custom');
    await client.query('DELETE FROM auditlog');
    await client.query(`UPDATE config SET instituicao='', dias_alerta_validade=30 WHERE id=1`);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao apagar dados' });
  } finally { client.release(); }
});

app.post('/api/import', async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM movimentacoes');
    await client.query('DELETE FROM materiais');
    await client.query('DELETE FROM turmas');
    await client.query('DELETE FROM categorias_custom');
    for (const m of (b.materiais || [])) {
      await client.query(
        `INSERT INTO materiais (id,codigo,nome,categoria,unidade,estoque_atual,estoque_minimo,localizacao,fornecedor,lote,validade,reutilizavel,foto,observacoes,criado_em,atualizado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15,now()),COALESCE($16,now()))`,
        [m.id, m.codigo, m.nome, m.categoria, m.unidade, m.estoqueAtual || 0, m.estoqueMinimo || 0, m.localizacao || '',
        m.fornecedor || '', m.lote || '', m.validade || null, !!m.reutilizavel, m.foto || '', m.observacoes || '', m.criadoEm || null, m.atualizadoEm || null]
      );
    }
    for (const t of (b.turmas || [])) {
      await client.query('INSERT INTO turmas (id,nome,curso,professor) VALUES ($1,$2,$3,$4)',
        [t.id, t.nome, t.curso || '', t.professor || '']);
    }
    for (const c of (b.categoriasCustom || [])) {
      await client.query('INSERT INTO categorias_custom (key,nome,cor) VALUES ($1,$2,$3)', [c.key, c.nome, c.cor]);
    }
    for (const mv of (b.movimentacoes || [])) {
      await client.query(
        `INSERT INTO movimentacoes (id,codigo,tipo,material_id,quantidade,data,lote,validade,fornecedor,nota_fiscal,turma,professor,finalidade,alunos,retornavel,status_devolucao,data_devolucao,condicao_devolucao,responsavel,verificado_por,observacoes,criado_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,COALESCE($22,now()))`,
        [mv.id, mv.codigo || null, mv.tipo, mv.materialId || null, mv.quantidade, mv.data, mv.lote || '', mv.validade || null,
        mv.fornecedor || '', mv.notaFiscal || '', mv.turma || '', mv.professor || '', mv.finalidade || '', mv.alunos || '',
        mv.retornavel, mv.statusDevolucao || null, mv.dataDevolucao || null, mv.condicaoDevolucao || null,
        mv.responsavel || '', mv.verificadoPor || '', mv.observacoes || '', mv.criadoEm || null]
      );
    }
    if (b.config) {
      await client.query('UPDATE config SET instituicao=$1, dias_alerta_validade=$2 WHERE id=1',
        [b.config.instituicao || '', b.config.diasAlertaValidade || 30]);
    }
    await client.query(`INSERT INTO auditlog (id,acao,entidade,entidade_id,detalhes) VALUES ($1,'editar','sistema','-','Backup importado')`, [uid('log')]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK'); console.error(err); res.status(500).json({ error: 'Erro ao importar backup: ' + err.message });
  } finally { client.release(); }
});

/* ========================= start ========================= */
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await initSchema();
    await seedIfEmpty();
    app.listen(PORT, () => console.log('SGMC rodando na porta ' + PORT));
  } catch (err) {
    console.error('Falha ao iniciar servidor:', err);
    process.exit(1);
  }
})();
