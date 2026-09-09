-- SGMC - Sistema de Gestao de Materiais Cirurgicos
-- Schema PostgreSQL (idempotente: seguro rodar toda vez que o servidor inicia)

CREATE TABLE IF NOT EXISTS materiais (
  id             TEXT PRIMARY KEY,
  codigo         TEXT NOT NULL,
  nome           TEXT NOT NULL,
  categoria      TEXT NOT NULL,
  unidade        TEXT NOT NULL DEFAULT 'un',
  estoque_atual  INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  localizacao    TEXT DEFAULT '',
  fornecedor     TEXT DEFAULT '',
  lote           TEXT DEFAULT '',
  validade       DATE,
  reutilizavel   BOOLEAN NOT NULL DEFAULT false,
  foto           TEXT DEFAULT '',
  observacoes    TEXT DEFAULT '',
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS turmas (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  curso     TEXT DEFAULT '',
  professor TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS movimentacoes (
  id                  TEXT PRIMARY KEY,
  codigo              TEXT,
  tipo                TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  material_id         TEXT REFERENCES materiais(id) ON DELETE SET NULL,
  quantidade          INTEGER NOT NULL,
  data                DATE NOT NULL,
  lote                TEXT DEFAULT '',
  validade            DATE,
  fornecedor          TEXT DEFAULT '',
  nota_fiscal         TEXT DEFAULT '',
  turma               TEXT DEFAULT '',
  professor           TEXT DEFAULT '',
  finalidade          TEXT DEFAULT '',
  alunos              TEXT DEFAULT '',
  retornavel          BOOLEAN,
  status_devolucao    TEXT,
  data_devolucao      DATE,
  condicao_devolucao  TEXT,
  responsavel         TEXT DEFAULT '',
  verificado_por      TEXT DEFAULT '',
  observacoes         TEXT DEFAULT '',
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categorias_custom (
  key  TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cor  TEXT NOT NULL DEFAULT '#3B6E8F'
);

CREATE TABLE IF NOT EXISTS auditlog (
  id          TEXT PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  acao        TEXT,
  entidade    TEXT,
  entidade_id TEXT,
  detalhes    TEXT
);

CREATE TABLE IF NOT EXISTS config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  instituicao           TEXT DEFAULT '',
  dias_alerta_validade  INTEGER DEFAULT 30,
  CHECK (id = 1)
);

CREATE INDEX IF NOT EXISTS idx_mov_material ON movimentacoes(material_id);
CREATE INDEX IF NOT EXISTS idx_mov_data ON movimentacoes(data);
CREATE INDEX IF NOT EXISTS idx_mov_tipo ON movimentacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON auditlog(ts DESC);

INSERT INTO config (id, instituicao, dias_alerta_validade)
VALUES (1, '', 30)
ON CONFLICT (id) DO NOTHING;
