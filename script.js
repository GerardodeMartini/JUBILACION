// Constants
const RETIREMENT_AGE_FEMALE = 60;
const RETIREMENT_AGE_MALE = 65;
const API_URL = '/api';

// State
let globalAgents = [];
let currentUser = null;
let token = localStorage.getItem('auth_token');

// DOM Elements
let dropZone;
let fileInput;
let uploadSection;
let dashboardSection;
let tableBody;
let modal;
let authSection;
let mainApp;
let loginFormContainer;
let registerFormContainer;
let userDisplay;

// Init
window.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM Elements
    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    uploadSection = document.getElementById('upload-section'); // Might be null now if removed from HTML
    dashboardSection = document.getElementById('dashboard-section');
    tableBody = document.getElementById('table-body');
    modal = document.getElementById('add-agent-modal');
    authSection = document.getElementById('auth-section');
    mainApp = document.getElementById('main-app');
    loginFormContainer = document.getElementById('login-form-container');
    registerFormContainer = document.getElementById('register-form-container');
    userDisplay = document.getElementById('user-display');

    if (dropZone) {
        dropZone.addEventListener('click', (e) => {
            if (e.target !== fileInput) {
                fileInput.click();
            }
        });
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', handleDrop);
    }
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Upload Modal Listeners
    const uploadModal = document.getElementById('upload-modal');
    if (uploadModal) {
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) {
                closeUploadModal();
            }
        });
    }

    // Page Logic
    const isDashboard = window.location.pathname.endsWith('dashboard.html');
    const isLogin = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    const isRegister = window.location.pathname.endsWith('register.html');

    if (token) {
        const savedUser = localStorage.getItem('auth_user');
        if (savedUser) currentUser = JSON.parse(savedUser);

        if (isLogin || isRegister) {
            window.location.href = 'dashboard.html';
            return;
        }

        if (isDashboard) {
            if (userDisplay) {
                userDisplay.textContent = `${currentUser.username} (${currentUser.role === 'admin' ? 'Admin' : 'Usuario'})`;
            }
            loadAgents();
        }
    } else {
        if (isDashboard) {
            window.location.href = 'index.html';
            return;
        }
    }
});

// --- Auth Functions ---

function toggleAuthMode() {
    // Deprecated: Pages are now separate
    console.warn('toggleAuthMode is deprecated');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            const data = await res.json();
            token = data.token;
            currentUser = { username: data.username, role: data.role };
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_user', JSON.stringify(currentUser));

            window.location.href = 'dashboard.html';
        } else {
            alert('Error de login: Credenciales inválidas');
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión con el servidor');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (res.ok) {
            alert('Usuario creado con éxito. Por favor inicia sesión.');
            window.location.href = 'index.html';
        } else {
            const data = await res.json();
            alert(`Error: ${data.error}`);
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión');
    }
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    globalAgents = [];

    window.location.href = 'index.html';
}

// --- Helper Functions ---

function capitalize(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

function sortAgents() {
    globalAgents.sort((a, b) => {
        return (a.full_name || a.fullName).localeCompare(b.full_name || b.fullName);
    });
}

// --- File Handling ---

function triggerDashboardUpload() {
    document.getElementById('dashboard-file-input').click();
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) processFile(files[0]);
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length) processFile(files[0]);
    e.target.value = '';
}

function processFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        analyzeData(jsonData);
    };
    reader.readAsArrayBuffer(file);
}

async function analyzeData(data) {
    if (!data || data.length === 0) {
        alert('El archivo parece estar vacío.');
        return;
    }

    const getValue = (row, possibleKeys) => {
        const rowKeys = Object.keys(row);
        const normalizedRowKeys = rowKeys.map(k => k.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

        for (const key of possibleKeys) {
            const normalizedKey = key.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const index = normalizedRowKeys.indexOf(normalizedKey);
            if (index !== -1) return row[rowKeys[index]];
        }
        return null;
    };

    let successCount = 0;

    for (const row of data) {
        let name = getValue(row, ['Nombre', 'Nombres', 'Name']) || '';
        let surname = getValue(row, ['Apellido', 'Apellidos', 'Surname']) || '';

        if (!name && !surname) {
            const full = getValue(row, ['Nombre Completo', 'Agente']) || 'Desconocido';
            name = full;
        }

        name = capitalize(name);
        surname = capitalize(surname);
        // Format: Surname Name
        const fullName = `${surname} ${name}`.trim();

        const genderRaw = getValue(row, ['Genero', 'Género', 'Sexo', 'Sex', 'Gender']) || 'M';
        const genderUpper = String(genderRaw).toUpperCase().trim();
        const gender = (genderUpper.startsWith('F') || genderUpper.startsWith('M')) ? genderUpper.charAt(0) : 'M';

        let birthDateRaw = getValue(row, ['Fecha Nacimiento', 'Fecha de Nacimiento', 'F. Nac', 'Nacimiento', 'Birth Date']);
        let ageRaw = getValue(row, ['Edad', 'Age', 'Años']);

        // New fields
        const agreement = getValue(row, ['Convenio', 'Agreement']) || '';
        const law = getValue(row, ['Ley', 'Law']) || '';
        const affiliateStatus = getValue(row, ['Afiliado', 'Affiliate', 'Estado Afiliado']) || '';
        const ministry = getValue(row, ['Ministerio', 'Ministry', 'Repartición']) || '';

        let birthDate = null;

        if (birthDateRaw) {
            if (typeof birthDateRaw === 'number') {
                birthDate = new Date(Math.round((birthDateRaw - 25569) * 86400 * 1000));
            } else {
                if (typeof birthDateRaw === 'string' && birthDateRaw.includes('/')) {
                    const parts = birthDateRaw.split('/');
                    if (parts.length === 3) {
                        birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    } else {
                        birthDate = new Date(birthDateRaw);
                    }
                } else {
                    birthDate = new Date(birthDateRaw);
                }
            }
        } else if (ageRaw !== null && ageRaw !== undefined) {
            const age = parseInt(ageRaw, 10);
            if (!isNaN(age)) {
                const today = new Date();
                birthDate = new Date(today.getFullYear() - age, today.getMonth(), today.getDate());
            }
        }

        if (birthDate && isNaN(birthDate.getTime())) {
            birthDate = null;
        }

        let retirementDate = null;
        let status = { code: 'lejos', label: '' };
        let age = null;

        if (birthDate) {
            retirementDate = calculateRetirementDate(birthDate, gender);
            status = getRetirementStatus(retirementDate);
            age = calculateAge(birthDate);
        }

        try {
            await fetch(`${API_URL}/agents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    fullName,
                    birthDate: birthDate ? birthDate.toISOString() : null,
                    gender,
                    retirementDate: retirementDate ? retirementDate.toISOString() : null,
                    status,
                    age,
                    agreement,
                    law,
                    affiliateStatus,
                    ministry
                })
            });
            successCount++;
        } catch (e) {
            console.error('Error uploading agent', e);
        }
    }

    alert(`Se importaron ${successCount} agentes correctamente.`);
    closeUploadModal();
    loadAgents();
}

// --- Logic ---

function calculateRetirementDate(birthDate, gender) {
    const retirementAge = (gender === 'F' || gender === 'FEMENINO') ? RETIREMENT_AGE_FEMALE : RETIREMENT_AGE_MALE;
    const date = new Date(birthDate);
    date.setFullYear(date.getFullYear() + retirementAge);
    return date;
}

function calculateAge(birthDate) {
    const diff = Date.now() - birthDate.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
}

function getRetirementStatus(retirementDate) {
    const now = new Date();
    const diffTime = retirementDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffYears = diffDays / 365;

    if (diffDays < 0) return { code: 'vencido', label: 'VENCIDO' };
    if (diffDays < 180) return { code: 'inminente', label: 'INMINENTE (< 6 meses)' };
    if (diffYears < 2) return { code: 'proximo', label: 'PRÓXIMO (< 2 años)' };
    return { code: 'lejos', label: 'LEJOS' };
}

// --- Persistence (API) ---

async function loadAgents() {
    try {
        const res = await fetch(`${API_URL}/agents`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            globalAgents = data.map(a => ({
                id: a.id,
                fullName: a.full_name,
                birthDate: a.birth_date,
                gender: a.gender,
                retirementDate: a.retirement_date,
                status: typeof a.status === 'string' ? JSON.parse(a.status) : a.status,
                age: a.birth_date ? calculateAge(new Date(a.birth_date)) : null,
                agreement: a.agreement,
                law: a.law,
                affiliateStatus: a.affiliate_status,
                ministry: a.ministry
            }));
            sortAgents();

            if (globalAgents.length === 0) {
                // Show dashboard anyway so user can add agents
                console.log('No agents found');
            }
            renderDashboard();
        } else if (res.status === 401 || res.status === 403) {
            logout();
        }
    } catch (e) {
        console.error('Error loading agents', e);
        alert('Error al cargar agentes: ' + e.message);
    }
}

async function clearAllData() {
    if (confirm('¿Estás seguro de que quieres borrar todos los agentes visibles?')) {
        for (const agent of globalAgents) {
            await deleteAgent(agent.id, false);
        }
        loadAgents();
    }
}

function updateStats() {
    const totalCount = document.getElementById('total-count');
    const vencidoCount = document.getElementById('vencido-count');
    const proximoCount = document.getElementById('proximo-count');

    if (!totalCount || !vencidoCount || !proximoCount) return;

    totalCount.textContent = globalAgents.length;

    const vencidos = globalAgents.filter(a => a.status.code === 'vencido').length;
    vencidoCount.textContent = vencidos;

    const proximos = globalAgents.filter(a => a.status.code === 'proximo' || a.status.code === 'inminente').length;
    proximoCount.textContent = proximos;
}

function renderDashboard() {
    const dashboardSection = document.getElementById('dashboard-section');
    const tableBody = document.getElementById('table-body');

    if (dashboardSection) dashboardSection.classList.remove('hidden');

    updateStats();

    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (globalAgents.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No hay agentes cargados</td></tr>';
        return;
    }

    globalAgents.forEach(agent => {
        const row = document.createElement('tr');

        let birthDateStr = '-';
        let rDateStr = '-';

        if (agent.birthDate) {
            const bDate = new Date(agent.birthDate);
            birthDateStr = bDate.toLocaleDateString('es-AR');
        }

        if (agent.retirementDate) {
            const rDate = new Date(agent.retirementDate);
            rDateStr = rDate.toLocaleDateString('es-AR');
        }

        row.innerHTML = `
            <td>
                <div style="font-weight: 500; cursor: pointer; color: var(--primary);" onclick="openDetailsModal('${agent.id}')">
                    ${agent.fullName}
                </div>
            </td>
            <td>${birthDateStr}</td>
            <td>${agent.age !== null ? agent.age + ' años' : '-'}</td>
            <td>${agent.gender}</td>
            <td>${rDateStr}</td>
            <td>
                <span class="status-badge status-${agent.status.code}">
                    ${agent.status.label}
                </span>
            </td>
            <td>
                <button class="btn-secondary btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteAgent('${agent.id}')">
                    <i class="ph ph-trash"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

async function deleteAgent(id, reload = true) {
    if (!reload || confirm('¿Borrar este agente?')) {
        try {
            const res = await fetch(`${API_URL}/agents/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                if (reload) loadAgents();
            } else {
                alert('No se pudo borrar (quizás no tienes permiso)');
            }
        } catch (e) {
            console.error(e);
        }
    }
}

// --- Modal Logic ---

function openModal() {
    const modal = document.getElementById('add-agent-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    const modal = document.getElementById('add-agent-modal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('add-agent-form');
    if (form) form.reset();
}

function openUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeUploadModal() {
    const modal = document.getElementById('upload-modal');
    if (modal) modal.classList.add('hidden');
}

function openDetailsModal(id) {
    const agent = globalAgents.find(a => a.id === id);
    if (!agent) return;

    document.getElementById('detail-fullname').textContent = agent.fullName;
    document.getElementById('detail-agreement').textContent = agent.agreement || '-';
    document.getElementById('detail-law').textContent = agent.law || '-';
    document.getElementById('detail-affiliate').textContent = agent.affiliateStatus || '-';
    document.getElementById('detail-ministry').textContent = agent.ministry || '-';

    const modal = document.getElementById('agent-details-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDetailsModal() {
    const modal = document.getElementById('agent-details-modal');
    if (modal) modal.classList.add('hidden');
}

async function handleManualAdd(e) {
    e.preventDefault();

    const nameInput = document.getElementById('input-name').value;
    const surnameInput = document.getElementById('input-surname').value;
    const gender = document.getElementById('input-gender').value;
    const birthDateInput = document.getElementById('input-birthdate').value;

    const name = capitalize(nameInput);
    const surname = capitalize(surnameInput);
    // Format: Surname Name
    const fullName = `${surname} ${name}`.trim();

    let birthDate = null;
    let age = null;
    let retirementDate = null;
    let status = { code: 'lejos', label: '' };

    if (birthDateInput) {
        const [year, month, day] = birthDateInput.split('-').map(Number);
        birthDate = new Date(year, month - 1, day);
        age = calculateAge(birthDate);
        retirementDate = calculateRetirementDate(birthDate, gender);
        status = getRetirementStatus(retirementDate);
    }

    try {
        const res = await fetch(`${API_URL}/agents`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fullName,
                birthDate: birthDate ? birthDate.toISOString() : null,
                gender,
                retirementDate: retirementDate ? retirementDate.toISOString() : null,
                status,
                age
            })
        });

        if (res.ok) {
            loadAgents();
            closeModal();
        } else {
            alert('Error al guardar agente');
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión');
    }
}

// --- Expose to Window ---
window.handleFileSelect = handleFileSelect;
window.triggerDashboardUpload = triggerDashboardUpload;
window.clearAllData = clearAllData;
window.openModal = openModal;
window.closeModal = closeModal;
window.openUploadModal = openUploadModal;
window.openUploadModal = openUploadModal;
window.closeUploadModal = closeUploadModal;
window.openDetailsModal = openDetailsModal;
window.closeDetailsModal = closeDetailsModal;
window.handleManualAdd = handleManualAdd;
window.deleteAgent = deleteAgent;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.toggleAuthMode = toggleAuthMode;
window.logout = logout;
