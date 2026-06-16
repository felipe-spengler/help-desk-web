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

// Garantir diretório de dados persistentes para SQLite e uploads
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(dataDir, 'uploads');
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
const dbPath = path.join(dataDir, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Envio de Notificações WhatsApp (SaaS local hospedado)
const https = require('https');
const ADMIN_PHONE = '49999459490';
const MASTER_KEY = 'test_key_master_123';

function sendNotification(to, message) {
  if (!to) {
    console.log('Sem destinatário para envio de notificação.');
    return;
  }
  
  const cleanPhone = to.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    console.log(`Número de telefone inválido para envio: ${cleanPhone}`);
    return;
  }

  const payload = JSON.stringify({
    to: cleanPhone,
    message: message,
    force: true
  });

  const options = {
    hostname: 'mensagens.techinteligente.site',
    port: 443,
    path: '/api/v1/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MASTER_KEY}`,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log(`Notificação enviada para ${cleanPhone}. Status: ${res.statusCode}.`);
    });
  });

  req.on('error', (e) => {
    console.error(`Erro ao enviar notificação para ${cleanPhone}:`, e);
  });

  req.write(payload);
  req.end();
}

// Criar Tabelas
db.serialize(() => {
  // Tabela de Projetos
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Tabela de Usuários
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'client'
    )
  `);

  // Tabela de Solicitações (Tickets)
  db.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('Baixa', 'Média', 'Alta')) DEFAULT 'Média',
      status TEXT DEFAULT 'Pendente',
      project_id INTEGER,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      budget_amount REAL DEFAULT 0,
      budget_status TEXT DEFAULT 'Nenhum',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Adicionar coluna client_phone se ela não existir
  db.run("ALTER TABLE tickets ADD COLUMN client_phone TEXT", (err) => {
    // Ignora silenciosamente se a coluna já existe
  });

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

  // Inserir usuário Admin padrão se não houver admin cadastrado
  db.get('SELECT COUNT(*) as count FROM users WHERE role = "admin"', [], (err, row) => {
    if (row && row.count === 0) {
      db.run('INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, ?)', [
        'Administrador',
        'admin',
        'supersenha',
        'admin'
      ]);
      console.log('Usuário administrador padrão inserido.');
    }
  });
});

// --- ROTAS DA API ---

// 1. Registro de Cliente
app.post('/api/auth/register', (req, res) => {
  const { name, phone, password } = req.body;

  if (!name || !phone || !password) {
    return res.status(400).json({ success: false, message: 'Nome, telefone e senha são obrigatórios.' });
  }

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return res.status(400).json({ success: false, message: 'Por favor, insira um telefone válido com DDD.' });
  }

  db.run(
    'INSERT INTO users (name, phone, password, role) VALUES (?, ?, ?, "client")',
    [name.trim(), cleanPhone, password],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ success: false, message: 'Este número de telefone já está cadastrado.' });
        }
        return res.status(500).json({ success: false, message: err.message });
      }

      const userId = this.lastID;
      
      // Notificar cliente sobre o cadastro
      sendNotification(cleanPhone, `Olá, ${name.trim()}! Seu cadastro no Help Desk foi realizado com sucesso. Agora você pode abrir e acompanhar suas solicitações.`);

      res.json({
        success: true,
        role: 'client',
        clientName: name.trim(),
        clientPhone: cleanPhone,
        token: 'token-client-' + userId + '-' + Date.now()
      });
    }
  );
});

// 2. Login
app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'Telefone/Usuário e senha são obrigatórios.' });
  }

  const cleanPhone = phone.trim().toLowerCase();

  // Login direto para Admin
  if (cleanPhone === 'admin' && password === 'supersenha') {
    return res.json({
      success: true,
      role: 'admin',
      clientName: 'Administrador',
      clientPhone: '',
      token: 'token-admin-session'
    });
  }

  // Buscar usuário no banco
  db.get(
    'SELECT * FROM users WHERE phone = ? AND password = ?',
    [cleanPhone.replace(/\D/g, ''), password],
    (err, user) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      if (!user) {
        return res.status(401).json({ success: false, message: 'Telefone ou senha incorretos.' });
      }

      res.json({
        success: true,
        role: user.role,
        clientName: user.name,
        clientPhone: user.phone,
        token: 'token-' + user.role + '-' + user.id + '-' + Date.now()
      });
    }
  );
});

// 3. Projetos
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

// Excluir Projeto
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM projects WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, changes: this.changes });
  });
});

// 4. Solicitações (Tickets)
app.get('/api/tickets', (req, res) => {
  const { project_id, role, client_phone } = req.query;

  let query = `
    SELECT t.*, p.name as project_name, 
           (SELECT json_group_array(json_object('id', a.id, 'filename', a.filename, 'filepath', a.filepath, 'filetype', a.filetype))
            FROM attachments a WHERE a.ticket_id = t.id) as attachments_json
    FROM tickets t
    LEFT JOIN projects p ON t.project_id = p.id
  `;

  const params = [];
  const conditions = [];

  if (project_id && project_id !== 'all') {
    conditions.push('t.project_id = ?');
    params.push(project_id);
  }

  // Se for cliente, exibe apenas os chamados dele
  if (role === 'client' && client_phone) {
    conditions.push('t.client_phone = ?');
    params.push(client_phone);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
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
  const { title, description, priority, project_id, client_name, client_phone } = req.body;

  if (!title || !project_id || !client_name) {
    return res.status(400).json({ error: 'Título, projeto e nome do cliente são obrigatórios.' });
  }

  const query = `
    INSERT INTO tickets (title, description, priority, status, project_id, client_name, client_phone)
    VALUES (?, ?, ?, 'Pendente', ?, ?, ?)
  `;

  db.run(query, [title, description, priority || 'Média', project_id, client_name, client_phone || null], function(err) {
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

    // Gerar link para o ticket
    const host = req.headers.host;
    const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'http';
    const link = `${protocol}://${host}/#ticket-${ticketId}`;

    // Notificar administrador
    sendNotification(ADMIN_PHONE, `📢 *Nova Solicitação*\n\n*Cliente:* ${client_name}\n*Título:* ${title}\n*Prioridade:* ${priority || 'Média'}\n\nAcessar: ${link}`);

    res.json({ success: true, ticketId });
  });
});

// Atualizar Status (Admin)
app.put('/api/tickets/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'Pendente', 'Em Análise', 'Aprovado', 'Em Andamento', 'Concluído'

  // Buscar informações do ticket para enviar notificação
  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, ticket) => {
    if (err || !ticket) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    db.run('UPDATE tickets SET status = ? WHERE id = ?', [status, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      const host = req.headers.host;
      const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'http';
      const link = `${protocol}://${host}/#ticket-${id}`;

      // Notificar cliente
      if (ticket.client_phone) {
        sendNotification(ticket.client_phone, `🛠️ *Atualização de Status*\n\nSua solicitação "*${ticket.title}*" foi atualizada para o status: *${status}*.\n\nAcompanhe aqui: ${link}`);
      }

      res.json({ success: true, changes: this.changes });
    });
  });
});

// Definir Orçamento/Valor (Admin)
app.put('/api/tickets/:id/budget', (req, res) => {
  const { id } = req.params;
  const { budget_amount } = req.body;

  if (budget_amount === undefined || budget_amount < 0) {
    return res.status(400).json({ error: 'Valor do orçamento inválido.' });
  }

  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, ticket) => {
    if (err || !ticket) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    db.run(
      'UPDATE tickets SET budget_amount = ?, budget_status = "Pendente de Aprovação" WHERE id = ?',
      [budget_amount, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const host = req.headers.host;
        const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'http';
        const link = `${protocol}://${host}/#ticket-${id}`;

        // Notificar cliente sobre orçamento pendente de aprovação
        if (ticket.client_phone) {
          sendNotification(ticket.client_phone, `💰 *Orçamento Disponível*\n\nUm orçamento de *R$ ${parseFloat(budget_amount).toFixed(2)}* foi cadastrado para o ajuste "*${ticket.title}*".\n\nPor favor, acesse o painel para aprovar ou recusar: ${link}`);
        }

        res.json({ success: true, changes: this.changes });
      }
    );
  });
});

// Aprovar/Recusar Orçamento (Cliente)
app.put('/api/tickets/:id/approve-budget', (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'Aprovado' ou 'Recusado'

  if (action !== 'Aprovado' && action !== 'Recusado') {
    return res.status(400).json({ error: 'Ação inválida. Escolha Aprovado ou Recusado.' });
  }

  const ticketStatus = action === 'Aprovado' ? 'Em Andamento' : 'Pendente';

  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, ticket) => {
    if (err || !ticket) {
      return res.status(404).json({ error: 'Chamado não encontrado.' });
    }

    db.run(
      'UPDATE tickets SET budget_status = ?, status = ? WHERE id = ?',
      [action, ticketStatus, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const host = req.headers.host;
        const protocol = req.headers.referer ? req.headers.referer.split(':')[0] : 'http';
        const link = `${protocol}://${host}/#ticket-${id}`;

        // Notificar administrador sobre a resposta do orçamento
        const statusEmoji = action === 'Aprovado' ? '✅' : '❌';
        sendNotification(ADMIN_PHONE, `${statusEmoji} *Orçamento ${action}*\n\nO cliente ${ticket.client_name} *${action.toLowerCase()}* o orçamento de *R$ ${parseFloat(ticket.budget_amount).toFixed(2)}* para a solicitação "*${ticket.title}*".\n\nAcesse para ver: ${link}`);

        res.json({ success: true, changes: this.changes });
      }
    );
  });
});

// Inicialização
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
