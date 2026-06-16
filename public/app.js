// --- VARIÁVEIS DE ESTADO DO CLIENTE/FRONT ---
let currentUser = {
  token: localStorage.getItem('helpdesk_token') || null,
  role: localStorage.getItem('helpdesk_role') || null,
  clientName: localStorage.getItem('helpdesk_clientName') || null,
  clientPhone: localStorage.getItem('helpdesk_clientPhone') || null
};

let projects = [];
let tickets = [];
let activeProjectId = 'all'; // 'all' ou ID numérico
let currentStatusFilter = 'all'; // Filtro de status rápido do dashboard
let currentPriorityFilter = 'all'; // Filtro de prioridade
let selectedFiles = []; // Armazena arquivos temporários do formulário de envio
let currentViewingTicket = null;

const API_BASE = window.location.origin;

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  if (currentUser.token) {
    showAppScreen();
    checkUrlForTicket();
  } else {
    showLoginScreen();
  }
});

function checkUrlForTicket() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#ticket-')) {
    const ticketId = parseInt(hash.replace('#ticket-', ''), 10);
    if (!isNaN(ticketId)) {
      const checkInterval = setInterval(() => {
        if (tickets && tickets.length > 0) {
          clearInterval(checkInterval);
          openTicketDetails(ticketId);
        }
      }, 200);
      setTimeout(() => clearInterval(checkInterval), 5000);
    }
  }
}

// --- CONTROLE DE TELAS (LOGIN / APP) ---
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}

function showAppScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  // Atualizar informações do usuário
  document.getElementById('display-user-name').innerText = currentUser.clientName || 'Usuário';
  document.getElementById('display-user-role').innerText = currentUser.role === 'admin' ? 'Administrador' : 'Cliente';
  const initial = (currentUser.clientName || 'U').charAt(0).toUpperCase();
  document.getElementById('user-avatar-placeholder').innerText = initial;
  document.getElementById('mobile-avatar-placeholder').innerText = initial;

  // Exibir/ocultar controles de acordo com o nível de acesso (Admin vs Cliente)
  if (currentUser.role === 'admin') {
    document.getElementById('btn-add-project').classList.remove('hidden');
    document.getElementById('btn-new-ticket').classList.add('hidden');
    document.getElementById('admin-section-title').style.display = 'flex';
  } else {
    document.getElementById('btn-add-project').classList.add('hidden');
    document.getElementById('btn-new-ticket').classList.remove('hidden');
    document.getElementById('admin-section-title').style.display = 'none';
  }

  // Carregar dados iniciais
  loadInitialData();
}

// Controle do Sidebar Mobile
function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  sidebar.classList.toggle('active');
  overlay.classList.toggle('hidden');
}

function closeSidebarOnMobile() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  
  sidebar.classList.remove('active');
  overlay.classList.add('hidden');
}

// Alternar entre abas de Login (Cliente vs Admin)
function switchLoginTab(role) {
  const tabClient = document.getElementById('tab-client');
  const tabAdmin = document.getElementById('tab-admin');
  const phoneLabel = document.getElementById('phone-label');
  const phoneInput = document.getElementById('login-phone');
  const phoneIcon = document.getElementById('login-phone-icon');
  const linkToRegister = document.getElementById('link-to-register');

  // Voltar para tela de login caso esteja na de cadastro
  toggleAuthMode('login');

  if (role === 'client') {
    tabClient.classList.add('active');
    tabAdmin.classList.remove('active');
    phoneLabel.innerText = 'Telefone (DDD + Número)';
    phoneInput.placeholder = 'Ex: 47999999999';
    phoneInput.value = '';
    phoneIcon.className = 'fa-solid fa-phone input-icon';
    linkToRegister.classList.remove('hidden');
  } else {
    tabClient.classList.remove('active');
    tabAdmin.classList.add('active');
    phoneLabel.innerText = 'Usuário do Administrador';
    phoneInput.placeholder = 'Digite "admin"';
    phoneInput.value = '';
    phoneIcon.className = 'fa-solid fa-user input-icon';
    linkToRegister.classList.add('hidden');
  }
}

// Alternar entre Login e Cadastro
function toggleAuthMode(mode) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authSubtitle = document.getElementById('auth-subtitle');
  const authTabs = document.getElementById('auth-tabs');
  const errorDivLogin = document.getElementById('login-error');
  const errorDivRegister = document.getElementById('register-error');

  errorDivLogin.classList.add('hidden');
  errorDivRegister.classList.add('hidden');

  if (mode === 'register') {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    authSubtitle.innerText = 'Crie sua conta para enviar e gerenciar solicitações';
    authTabs.classList.add('hidden');
  } else {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    authSubtitle.innerText = 'Acesse a central de suporte e solicitações';
    authTabs.classList.remove('hidden');
  }
}

// Ação de Login
async function handleLogin(event) {
  event.preventDefault();
  const errorDiv = document.getElementById('login-error');
  errorDiv.classList.add('hidden');

  const isAdmin = document.getElementById('tab-admin').classList.contains('active');
  const phone = document.getElementById('login-phone').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: isAdmin ? 'admin' : phone,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao fazer login.');
    }

    // Salvar no estado e localStorage
    currentUser.token = data.token;
    currentUser.role = data.role;
    currentUser.clientName = data.clientName;
    currentUser.clientPhone = data.clientPhone || '';

    localStorage.setItem('helpdesk_token', data.token);
    localStorage.setItem('helpdesk_role', data.role);
    localStorage.setItem('helpdesk_clientName', data.clientName);
    localStorage.setItem('helpdesk_clientPhone', data.clientPhone || '');

    // Limpar formulário de login
    document.getElementById('login-phone').value = '';
    document.getElementById('login-password').value = '';

    showAppScreen();
  } catch (err) {
    errorDiv.innerText = err.message;
    errorDiv.classList.remove('hidden');
  }
}

// Ação de Cadastro
async function handleRegister(event) {
  event.preventDefault();
  const errorDiv = document.getElementById('register-error');
  errorDiv.classList.add('hidden');

  const name = document.getElementById('reg-name').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;

  try {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erro ao criar conta.');
    }

    // Após cadastro, fazer login automático
    currentUser.token = data.token;
    currentUser.role = data.role;
    currentUser.clientName = data.clientName;
    currentUser.clientPhone = data.clientPhone || '';

    localStorage.setItem('helpdesk_token', data.token);
    localStorage.setItem('helpdesk_role', data.role);
    localStorage.setItem('helpdesk_clientName', data.clientName);
    localStorage.setItem('helpdesk_clientPhone', data.clientPhone || '');

    // Limpar formulário de cadastro
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-password').value = '';

    showAppScreen();
  } catch (err) {
    errorDiv.innerText = err.message;
    errorDiv.classList.remove('hidden');
  }
}

// Ação de Logout
function handleLogout() {
  currentUser = { token: null, role: null, clientName: null, clientPhone: null };
  localStorage.removeItem('helpdesk_token');
  localStorage.removeItem('helpdesk_role');
  localStorage.removeItem('helpdesk_clientName');
  localStorage.removeItem('helpdesk_clientPhone');
  showLoginScreen();
}

// --- CARREGAMENTO DE DADOS ---
async function loadInitialData() {
  await fetchProjects();
  await fetchTickets();
}

// Carregar Projetos
async function fetchProjects() {
  try {
    const response = await fetch(`${API_BASE}/api/projects`);
    projects = await response.json();
    renderProjectTabs();
    populateProjectDropdown();
  } catch (err) {
    console.error('Erro ao buscar projetos:', err);
  }
}

// Renderizar Abas de Projetos na Sidebar
function renderProjectTabs() {
  const container = document.getElementById('project-tabs-container');
  
  // Calcular contagens de tickets por projeto
  const getCount = (projId) => {
    if (projId === 'all') return tickets.length;
    return tickets.filter(t => t.project_id == projId).length;
  };

  let html = `
    <div class="project-tab-wrapper ${activeProjectId === 'all' ? 'active' : ''}">
      <button class="project-tab-btn" onclick="selectProject('all', 'Todos os Projetos')">
        <span><i class="fa-solid fa-list-check icon-left"></i> Todos</span>
        <span class="project-count-badge" id="badge-count-all">${getCount('all')}</span>
      </button>
    </div>
  `;

  projects.forEach(proj => {
    const deleteBtn = currentUser.role === 'admin'
      ? `<button class="btn-delete-project-small" onclick="deleteProject(event, ${proj.id}, '${proj.name}')" title="Excluir Projeto"><i class="fa-solid fa-trash-can"></i></button>`
      : '';
    html += `
      <div class="project-tab-wrapper ${activeProjectId == proj.id ? 'active' : ''}">
        <button class="project-tab-btn" onclick="selectProject(${proj.id}, '${proj.name}')">
          <span><i class="fa-regular fa-folder icon-left"></i> ${proj.name}</span>
          <span class="project-count-badge">${getCount(proj.id)}</span>
        </button>
        ${deleteBtn}
      </div>
    `;
  });

  container.innerHTML = html;
}

// Popular o Select de Projetos no Formulário de Novo Ticket
function populateProjectDropdown() {
  const select = document.getElementById('ticket-project');
  let html = '<option value="" disabled selected>Selecione o projeto...</option>';
  
  projects.forEach(proj => {
    html += `<option value="${proj.id}">${proj.name}</option>`;
  });
  
  select.innerHTML = html;
}

// Selecionar Projeto e Filtrar Dashboard
function selectProject(id, name) {
  activeProjectId = id;
  document.getElementById('current-project-title').innerText = name;
  
  // Atualizar abas ativas
  renderProjectTabs();
  
  // Resetar filtros e buscar tickets
  currentStatusFilter = 'all';
  currentPriorityFilter = 'all';
  updateFilterButtonsUI();
  
  fetchTickets();
  closeSidebarOnMobile();
}

// Carregar Tickets
async function fetchTickets() {
  try {
    const response = await fetch(`${API_BASE}/api/tickets?project_id=${activeProjectId}&role=${currentUser.role}&client_phone=${currentUser.clientPhone || ''}`);
    tickets = await response.json();
    
    // Atualizar badges de projetos na sidebar
    renderProjectTabs();
    
    // Processar e exibir os tickets
    processDashboardStats();
    renderTicketsList();
  } catch (err) {
    console.error('Erro ao buscar chamados:', err);
  }
}

// Calcular contadores do dashboard
function processDashboardStats() {
  const total = tickets.length;
  
  const pending = tickets.filter(t => t.status === 'Pendente' || t.status === 'Em Análise').length;
  const budget = tickets.filter(t => t.budget_status === 'Pendente de Aprovação').length;
  const progress = tickets.filter(t => t.status === 'Em Andamento').length;
  const done = tickets.filter(t => t.status === 'Concluído').length;

  document.getElementById('stat-total').innerText = total;
  document.getElementById('stat-pending').innerText = pending;
  document.getElementById('stat-budget').innerText = budget;
  document.getElementById('stat-progress').innerText = progress;
  document.getElementById('stat-done').innerText = done;
}

// Renderizar a lista de chamados no grid
function renderTicketsList() {
  const container = document.getElementById('tickets-container');
  container.innerHTML = '';

  // Filtrar de acordo com status e prioridade
  let filteredTickets = tickets;

  // Filtro Rápido do Dashboard (Status)
  if (currentStatusFilter !== 'all') {
    if (currentStatusFilter === 'Pendente') {
      filteredTickets = filteredTickets.filter(t => t.status === 'Pendente' || t.status === 'Em Análise');
    } else if (currentStatusFilter === 'Orçamento') {
      filteredTickets = filteredTickets.filter(t => t.budget_status === 'Pendente de Aprovação');
    } else if (currentStatusFilter === 'Em Andamento') {
      filteredTickets = filteredTickets.filter(t => t.status === 'Em Andamento');
    } else if (currentStatusFilter === 'Concluído') {
      filteredTickets = filteredTickets.filter(t => t.status === 'Concluído');
    }
  }

  // Filtro de Prioridade
  if (currentPriorityFilter !== 'all') {
    filteredTickets = filteredTickets.filter(t => t.priority === currentPriorityFilter);
  }

  if (filteredTickets.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
        <i class="fa-solid fa-inbox" style="font-size: 3rem; margin-bottom: 15px; color: var(--primary);"></i>
        <p>Nenhuma solicitação encontrada para este filtro.</p>
      </div>
    `;
    return;
  }

  filteredTickets.forEach(ticket => {
    // Formatar data
    const dateStr = new Date(ticket.created_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    // Classe amigável para status no HTML
    const statusClass = ticket.status.replace(' ', '-');

    const card = document.createElement('div');
    card.className = 'ticket-card glass-panel';

    // Suporte a swipe para excluir (apenas Admin no mobile)
    let startX = 0;
    let currentX = 0;
    let swiping = false;

    if (currentUser.role === 'admin') {
      card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        swiping = true;
        card.style.transition = 'none';
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        currentX = e.touches[0].clientX;
        let diffX = currentX - startX;
        if (diffX < 0) { // Deslizar para a esquerda
          card.style.transform = `translateX(${diffX}px)`;
        }
      }, { passive: true });

      card.addEventListener('touchend', (e) => {
        if (!swiping) return;
        swiping = false;
        card.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        let diffX = currentX - startX;
        
        if (diffX < -120) {
          card.style.transform = 'translateX(-100%)';
          setTimeout(() => {
            if (confirm(`Deseja mesmo excluir permanentemente a solicitação "${ticket.title}"?`)) {
              deleteTicketById(ticket.id);
            } else {
              card.style.transform = 'translateX(0)';
            }
          }, 100);
        } else {
          card.style.transform = 'translateX(0)';
        }
      });
    }

    card.onclick = () => {
      // Se arrastou para o lado, cancela a abertura do chamado
      if (currentUser.role === 'admin' && Math.abs(currentX - startX) > 15) {
        return;
      }
      openTicketDetails(ticket.id);
    };

    // Se houver orçamento aguardando aprovação
    let budgetBadge = '';
    if (ticket.budget_status === 'Pendente de Aprovação') {
      budgetBadge = `<span class="badge-budget-alert"><i class="fa-solid fa-hand-holding-dollar"></i> R$ ${ticket.budget_amount.toFixed(2)}</span>`;
    }

    card.innerHTML = `
      <div class="ticket-card-header">
        <span class="ticket-card-project">${ticket.project_name || 'Sem Projeto'}</span>
        <span class="badge-priority ${ticket.priority}">${ticket.priority}</span>
      </div>
      <div>
        <h4 class="ticket-card-title">${ticket.title}</h4>
        <p class="ticket-card-desc">${ticket.description || 'Sem descrição.'}</p>
      </div>
      <div class="ticket-card-footer">
        <span class="ticket-card-author"><i class="fa-regular fa-user"></i> ${ticket.client_name}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${budgetBadge}
          <span class="badge-status ${statusClass}">${ticket.status}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// --- GERENCIAMENTO DE FILTROS ---
function filterByStatus(status) {
  currentStatusFilter = status;
  renderTicketsList();
}

function setTicketFilter(priority) {
  currentPriorityFilter = priority;
  
  // Atualizar botões ativos
  document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
  
  const idMap = {
    'all': 'filter-all',
    'Baixa': 'filter-low',
    'Média': 'filter-medium',
    'Alta': 'filter-high'
  };
  
  document.getElementById(idMap[priority]).classList.add('active');
  renderTicketsList();
}

function updateFilterButtonsUI() {
  document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
  document.getElementById('filter-all').classList.add('active');
}

// --- GERENCIAMENTO DE MODAIS ---
function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
  if (modalId === 'modal-new-ticket') {
    resetCreateTicketForm();
  }
}

// Abrir modal de criação definindo projeto padrão se houver
function openCreateTicketModal() {
  openModal('modal-new-ticket');
  const select = document.getElementById('ticket-project');
  if (activeProjectId !== 'all') {
    select.value = activeProjectId;
  }
}

// --- CRIAÇÃO DE PROJETO (Admin) ---
async function submitProject(event) {
  event.preventDefault();
  const name = document.getElementById('new-project-name').value;

  try {
    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao criar projeto.');

    closeModal('modal-add-project');
    document.getElementById('new-project-name').value = '';
    
    // Recarregar projetos
    await fetchProjects();
  } catch (err) {
    alert(err.message);
  }
}

// Cadastrar Novo Administrador (Admin)
async function submitAdmin(event) {
  event.preventDefault();
  const name = document.getElementById('new-admin-name').value;
  const phone = document.getElementById('new-admin-phone').value;
  const password = document.getElementById('new-admin-password').value;

  try {
    const response = await fetch(`${API_BASE}/api/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Erro ao cadastrar administrador.');

    alert(`Administrador "${name}" cadastrado com sucesso!`);
    closeModal('modal-add-admin');
    
    // Limpar formulário
    document.getElementById('new-admin-name').value = '';
    document.getElementById('new-admin-phone').value = '';
    document.getElementById('new-admin-password').value = '';
  } catch (err) {
    alert(err.message);
  }
}

// Excluir Projeto (Admin)
async function deleteProject(event, id, name) {
  event.stopPropagation(); // Evita que clique no projeto selecione ele
  if (!confirm(`Tem certeza que deseja excluir o projeto "${name}"? Isso também removerá todas as solicitações vinculadas a ele.`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Erro ao excluir projeto.');
    
    // Se o projeto excluído era o selecionado, volta para "Todos"
    if (activeProjectId == id) {
      activeProjectId = 'all';
      document.getElementById('current-project-title').innerText = 'Todos os Projetos';
    }
    
    await fetchProjects();
    await fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// --- CONTROLE DE UPLOAD DE ARQUIVOS (MOCK & SELEÇÃO) ---
function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  selectedFiles = selectedFiles.concat(files);
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const container = document.getElementById('selected-files-preview');
  container.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-preview-item';
    item.innerHTML = `
      <span><i class="fa-regular fa-file-image"></i> ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
      <button type="button" onclick="removeSelectedFile(${index})"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(item);
  });
}

function removeSelectedFile(index) {
  selectedFiles.splice(index, 1);
  renderSelectedFiles();
}

function resetCreateTicketForm() {
  document.getElementById('new-ticket-form').reset();
  selectedFiles = [];
  document.getElementById('selected-files-preview').innerHTML = '';
}

// --- CRIAÇÃO DE CHAMADOS ---
async function submitTicket(event) {
  event.preventDefault();

  const title = document.getElementById('ticket-title').value;
  const projectId = document.getElementById('ticket-project').value;
  const priority = document.getElementById('ticket-priority').value;
  const description = document.getElementById('ticket-description').value;

  if (!projectId) {
    alert('Por favor, selecione um projeto.');
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('project_id', projectId);
  formData.append('priority', priority);
  formData.append('description', description);
  formData.append('client_name', currentUser.clientName);
  formData.append('client_phone', currentUser.clientPhone || '');

  selectedFiles.forEach(file => {
    formData.append('files', file);
  });

  try {
    const response = await fetch(`${API_BASE}/api/tickets`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao criar chamado.');

    closeModal('modal-new-ticket');
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// --- DETALHES E INTERAÇÃO COM CHAMADOS ---
function openTicketDetails(ticketId) {
  const ticket = tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  currentViewingTicket = ticket;

  // Definir textos no modal
  document.getElementById('view-ticket-project').innerText = ticket.project_name || 'Sem Projeto';
  document.getElementById('view-ticket-title').innerText = ticket.title;
  document.getElementById('view-ticket-author').innerText = ticket.client_name;
  
  const dateStr = new Date(ticket.created_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('view-ticket-date').innerText = dateStr;

  // Badges
  const priorityBadge = document.getElementById('view-ticket-priority-badge');
  priorityBadge.innerText = ticket.priority;
  priorityBadge.className = `badge-priority ${ticket.priority}`;

  const statusBadge = document.getElementById('view-ticket-status-badge');
  statusBadge.innerText = ticket.status;
  statusBadge.className = `badge-status ${ticket.status.replace(' ', '-')}`;

  document.getElementById('view-ticket-description').innerText = ticket.description || 'Sem descrição.';

  // Renderizar anexos (imagens e vídeos)
  renderAttachments(ticket.attachments);

  // Lógica de Orçamento
  renderBudgetSection(ticket);

  // Lógica do Painel de Admin
  renderAdminControls(ticket);

  openModal('modal-view-ticket');
}

function renderAttachments(attachments) {
  const container = document.getElementById('view-attachments-container');
  const gallery = document.getElementById('attachments-gallery');
  gallery.innerHTML = '';

  if (!attachments || attachments.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  attachments.forEach(file => {
    const wrapper = document.createElement('div');
    wrapper.className = 'attachment-media-wrapper';

    if (file.filetype === 'video') {
      wrapper.innerHTML = `
        <video src="${API_BASE}${file.filepath}"></video>
        <div class="attachment-video-overlay"><i class="fa-solid fa-play"></i></div>
      `;
      wrapper.onclick = () => openFullscreenMedia(file.filepath, 'video');
    } else {
      wrapper.innerHTML = `<img src="${API_BASE}${file.filepath}" alt="${file.filename}">`;
      wrapper.onclick = () => openFullscreenMedia(file.filepath, 'image');
    }

    gallery.appendChild(wrapper);
  });
}

// Zoom e visualização em tela cheia do anexo
function openFullscreenMedia(filepath, type) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.95)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '999';
  overlay.onclick = () => overlay.remove();

  if (type === 'video') {
    const video = document.createElement('video');
    video.src = API_BASE + filepath;
    video.controls = true;
    video.autoplay = true;
    video.style.maxWidth = '90%';
    video.style.maxHeight = '90%';
    video.onclick = (e) => e.stopPropagation();
    overlay.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = API_BASE + filepath;
    img.style.maxWidth = '90%';
    img.style.maxHeight = '90%';
    img.style.objectFit = 'contain';
    img.onclick = (e) => e.stopPropagation();
    overlay.appendChild(img);
  }

  document.body.appendChild(overlay);
}

// Orçamentos
function renderBudgetSection(ticket) {
  const container = document.getElementById('view-budget-container');
  const clientActions = document.getElementById('client-budget-actions');
  const feedbackMsg = document.getElementById('budget-feedback-msg');
  const feedbackStatus = document.getElementById('budget-feedback-status');

  container.classList.add('hidden');
  clientActions.classList.add('hidden');
  feedbackMsg.classList.add('hidden');

  if (ticket.budget_status !== 'Nenhum') {
    container.classList.remove('hidden');
    document.getElementById('view-budget-price').innerText = `R$ ${ticket.budget_amount.toFixed(2)}`;

    if (ticket.budget_status === 'Pendente de Aprovação' || ticket.budget_status === 'Recusado') {
      if (currentUser.role === 'client') {
        clientActions.classList.remove('hidden');
        if (ticket.budget_status === 'Recusado') {
          feedbackMsg.classList.remove('hidden');
          feedbackStatus.innerText = 'Você recusou este orçamento, mas ainda pode aprová-lo:';
          feedbackStatus.style.color = 'var(--color-red)';
        }
      } else {
        feedbackMsg.classList.remove('hidden');
        feedbackStatus.innerText = ticket.budget_status === 'Pendente de Aprovação' ? 'Aguardando aprovação do cliente' : 'Recusado pelo cliente';
        feedbackStatus.style.color = ticket.budget_status === 'Pendente de Aprovação' ? 'var(--color-orange)' : 'var(--color-red)';
      }
    } else if (ticket.budget_status === 'Aprovado') {
      feedbackMsg.classList.remove('hidden');
      feedbackStatus.innerText = 'Orçamento Aprovado!';
      feedbackStatus.style.color = 'var(--color-green)';
    }
  }
}

// Controles Administrativos
function renderAdminControls(ticket) {
  const container = document.getElementById('admin-controls-container');
  if (currentUser.role === 'admin') {
    container.classList.remove('hidden');
    document.getElementById('admin-change-status').value = ticket.status;
    document.getElementById('admin-budget-input').value = ticket.budget_amount || '';
  } else {
    container.classList.add('hidden');
  }
}

// Ações do Admin: Mudar Status
async function adminChangeStatus(event) {
  if (!currentViewingTicket) return;
  const status = event.target.value;

  try {
    const response = await fetch(`${API_BASE}/api/tickets/${currentViewingTicket.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, admin_name: currentUser.clientName })
    });

    if (!response.ok) throw new Error('Erro ao alterar status.');
    
    // Atualizar dados localmente e recarregar
    currentViewingTicket.status = status;
    document.getElementById('view-ticket-status-badge').innerText = status;
    document.getElementById('view-ticket-status-badge').className = `badge-status ${status.replace(' ', '-')}`;
    
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// Ações do Admin: Definir Orçamento
async function adminSubmitBudget() {
  if (!currentViewingTicket) return;
  const amountInput = document.getElementById('admin-budget-input');
  const amount = parseFloat(amountInput.value);

  if (isNaN(amount) || amount < 0) {
    alert('Insira um valor de orçamento válido.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/tickets/${currentViewingTicket.id}/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget_amount: amount, admin_name: currentUser.clientName })
    });

    if (!response.ok) throw new Error('Erro ao registrar orçamento.');

    // Recarregar ticket
    alert('Orçamento cadastrado e enviado para aprovação do cliente!');
    closeModal('modal-view-ticket');
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// Ações do Cliente: Aprovar / Recusar Orçamento
async function approveBudget(isApproved) {
  if (!currentViewingTicket) return;
  const action = isApproved ? 'Aprovado' : 'Recusado';

  try {
    const response = await fetch(`${API_BASE}/api/tickets/${currentViewingTicket.id}/approve-budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });

    if (!response.ok) throw new Error('Erro ao processar decisão do orçamento.');

    alert(`Orçamento ${action.toLowerCase()} com sucesso!`);
    closeModal('modal-view-ticket');
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// Excluir Chamado (Admin Apenas)
async function adminDeleteTicket() {
  if (!currentViewingTicket) return;
  if (!confirm(`Tem certeza que deseja excluir permanentemente a solicitação "${currentViewingTicket.title}"?`)) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/tickets/${currentViewingTicket.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Erro ao excluir chamado.');

    closeModal('modal-view-ticket');
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}

// Excluir Chamado por ID (Admin Apenas)
async function deleteTicketById(id) {
  try {
    const response = await fetch(`${API_BASE}/api/tickets/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Erro ao excluir chamado.');
    fetchTickets();
  } catch (err) {
    alert(err.message);
  }
}
