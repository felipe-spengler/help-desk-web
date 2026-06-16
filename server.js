const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurações e Middlewares
app.use(cors());
app.use(express.json());

// Garantir diretório de uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Servir arquivos estáticos do frontend e uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Configurar armazenamento do Multer para uploads de mídia
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // Limite de 100MB para vídeos
});

// Inicializar banco de dados SQLite
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Criar Tabelas
db.serialize(() => {
  // Tabela de Projetos
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Tabela de Solicitações (Tickets)
  // Status possíveis: 'Pendente', 'Em Análise', 'Aprovado', 'Em Andamento', 'Concluído'
  // Orçamento (budget_status): 'Nenhum', 'Pendente de Aprovação', 'Aprovado', 'Recusado'
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('Baixa', 'Média', 'Alta')) DEFAULT 'Média',
      status TEXT DEFAULT 'Pendente',
      project_id INTEGER,
      client_name TEXT NOT NULL,
      budget_amount REAL DEFAULT 0,
      budget_status TEXT DEFAULT 'Nenhum',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Tabela de Anexos
  db.run(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER,
      filename TEXT,
      filepath TEXT,
      filetype TEXT,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    )
  `);

  // Inserir projetos de demonstração iniciais caso a tabela esteja vazia
  db.get('SELECT COUNT(*) as count FROM projects', [], (err, row) => {
    if (row && row.count === 0) {
      db.run('INSERT INTO projects (name) VALUES (?)', ['Projeto Principal']);
      db.run('INSERT INTO projects (name) VALUES (?)', ['App Esportivo']);
      db.run('INSERT INTO projects (name) VALUES (?)', ['TV Motel']);
      console.log('Projetos iniciais inseridos com sucesso.');
    }
  });
});

// --- ROTAS DA API ---

// 1. Autenticação Simples
app.post('/api/auth/login', (req, res) => {
  const { password, clientName } = req.body;

  if (password === 'admin123') {
    return res.json({ success: true, role: 'admin', clientName: 'Administrador', token: 'token-admin-session' });
  } else if (password === 'cliente123') {
    if (!clientName || clientName.trim() === '') {
      return res.status(400).json({ success: false, message: 'Por favor, identifique-se informando seu nome.' });
    }
    return res.json({ success: true, role: 'client', clientName: clientName.trim(), token: 'token-client-' + Date.now() });
  } else {
    return res.status(401).json({ success: false, message: 'Senha incorreta.' });
  }
});

// 2. Projetos
app.get('/api/projects', (req, res) => {
  db.all('SELECT * FROM projects ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/projects', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'O nome do projeto é obrigatório.' });
  }
  db.run('INSERT INTO projects (name) VALUES (?)', [name.trim()], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Um projeto com este nome já existe.' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, name: name.trim() });
  });
});

// 3. Solicitações (Tickets)
app.get('/api/tickets', (req, res) => {
  const { project_id } = req.query;

  let query = `
    SELECT t.*, p.name as project_name, 
           (SELECT json_group_array(json_object('id', a.id, 'filename', a.filename, 'filepath', a.filepath, 'filetype', a.filetype))
            FROM attachments a WHERE a.ticket_id = t.id) as attachments_json
    FROM tickets t
    LEFT JOIN projects p ON t.project_id = p.id
  `;

  const params = [];
  if (project_id && project_id !== 'all') {
    query += ' WHERE t.project_id = ?';
    params.push(project_id);
  }

  query += ' ORDER BY t.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    // Parse do JSON de anexos
    const tickets = rows.map(row => {
      row.attachments = JSON.parse(row.attachments_json);
      delete row.attachments_json;
      return row;
    });

    res.json(tickets);
  });
});

app.post('/api/tickets', upload.array('files'), (req, res) => {
  const { title, description, priority, project_id, client_name } = req.body;

  if (!title || !project_id || !client_name) {
    return res.status(400).json({ error: 'Título, projeto e nome do cliente são obrigatórios.' });
  }

  const query = `
    INSERT INTO tickets (title, description, priority, status, project_id, client_name)
    VALUES (?, ?, ?, 'Pendente', ?, ?)
  `;

  db.run(query, [title, description, priority || 'Média', project_id, client_name], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const ticketId = this.lastID;
    
    // Processar arquivos se existirem
    if (req.files && req.files.length > 0) {
      const fileInsertStmt = db.prepare(`
        INSERT INTO attachments (ticket_id, filename, filepath, filetype)
        VALUES (?, ?, ?, ?)
      `);

      req.files.forEach(file => {
        const relativePath = '/uploads/' + file.filename;
        const filetype = file.mimetype.startsWith('video/') ? 'video' : 'image';
        fileInsertStmt.run(ticketId, file.originalname, relativePath, filetype);
      });

      fileInsertStmt.finalize();
    }

    res.json({ success: true, ticketId });
  });
});

// Atualizar Status (Admin)
app.put('/api/tickets/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Pendente', 'Em Análise', 'Aprovado', 'Em Andamento', 'Concluído'

  db.run('UPDATE tickets SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

// Definir Orçamento/Valor (Admin)
app.put('/api/tickets/:id/budget', (req, res) => {
  const { id } = req.params;
  const { budget_amount } = req.body;

  if (budget_amount === undefined || budget_amount < 0) {
    return res.status(400).json({ error: 'Valor do orçamento inválido.' });
  }

  // Define o valor e altera status do orçamento para "Pendente de Aprovação" e status do chamado para "Aguardando Valor"
  db.run(
    'UPDATE tickets SET budget_amount = ?, budget_status = "Pendente de Aprovação" WHERE id = ?',
    [budget_amount, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

// Aprovar/Recusar Orçamento (Cliente)
app.put('/api/tickets/:id/approve-budget', (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'Aprovado' ou 'Recusado'

  if (action !== 'Aprovado' && action !== 'Recusado') {
    return res.status(400).json({ error: 'Ação inválida. Escolha Aprovado ou Recusado.' });
  }

  // Se for aprovado, muda o status do chamado para "Em Andamento"
  const ticketStatus = action === 'Aprovado' ? 'Em Andamento' : 'Pendente';

  db.run(
    'UPDATE tickets SET budget_status = ?, status = ? WHERE id = ?',
    [action, ticketStatus, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

// Inicialização
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
