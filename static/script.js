// Constants
const RETIREMENT_AGE_FEMALE = 60;
const RETIREMENT_AGE_MALE = 65;
// Helper to determine API URL based on environment
const getApiUrl = () => {
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === 'localhost' || host === '127.0.0.1') && port !== '8000') {
        return `http://${host}:8000/api`;
    }
    return window.location.origin + '/api';
};
const API_URL = getApiUrl();
console.log('Jubilacion API_URL:', API_URL);

// State
let globalAgents = [];
let currentUser = null;
let token = localStorage.getItem('auth_token');
let nextPageUrl = null;
let prevPageUrl = null;
let currentPage = 1;
let currentStatusFilter = null;

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
    if (diffYears < 1) return { code: 'proximo', label: 'PRÓXIMO (< 1 año)' };
    return { code: 'lejos', label: 'LEJOS' };
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
        // Use header: 1 to get array of arrays (index-based)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        analyzeData(jsonData);
    };
    reader.readAsArrayBuffer(file);
}

async function analyzeData(data) {
    if (!data || data.length < 2) {
        alert('El archivo parece estar vacío o no tiene datos.');
        return;
    }

    // Row 0 is headers
    // Using simple mapping to normalize headers for dynamic search
    const headers = data[0].map(h => String(h).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const rows = data.slice(1);

    // Helper to find column index by header name
    const findCol = (possibleKeys) => {
        for (const key of possibleKeys) {
            const normalizedKey = key.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const index = headers.findIndex(h => h === normalizedKey);
            if (index !== -1) return index;
        }
        return -1;
    };

    // Detect indices for dynamic fields
    const idxName = findCol(['Nombre', 'Nombres', 'Name']);
    const idxSurname = findCol(['Apellido', 'Apellidos', 'Surname']);
    const idxFullName = findCol(['Nombre Completo', 'Agente']);

    // Gender
    const idxGender = findCol(['Genero', 'Género', 'Sexo', 'Sex', 'Gender']);

    // Dates
    const idxBirth = findCol(['Fecha Nacimiento', 'Fecha de Nacimiento', 'F. Nac', 'Nacimiento', 'Birth Date']);
    const idxAge = findCol(['Edad', 'Age', 'Años']);

    // Seniority
    const idxSeniority = findCol(['Antig Total Años']);

    // CUIL
    const idxCuil = findCol(['CUIL', 'Cuil', 'C.U.I.L.']);

    // Indices FIXED by user specification (0-based)
    // C = 2 (DNI)
    // E = 4 (Ley)
    // H = 7 (Afiliado) -> Confirmed Working by User
    // L = 11 (Jurisdiccion Code)
    // M = 12 (Nombre Jurisdiccion)

    const IDX_DNI = 2;
    const IDX_LEY = 4;
    const IDX_AFILIADO = 7;
    const IDX_JURIS_CODE = 11;
    const IDX_JURIS_NAME = 12;

    let agentsToUpload = [];

    for (const row of rows) {
        if (!row || row.length === 0) continue;

        // --- Name & Surname ---
        let name = (idxName !== -1 && row[idxName]) ? row[idxName] : '';
        let surname = (idxSurname !== -1 && row[idxSurname]) ? row[idxSurname] : '';

        if (!name && !surname) {
            const full = (idxFullName !== -1 && row[idxFullName]) ? row[idxFullName] : 'Desconocido';
            name = full;
        }

        name = capitalize(String(name));
        surname = capitalize(String(surname));
        const fullName = `${surname} ${name}`.trim();

        // --- Gender ---
        const genderRaw = (idxGender !== -1 && row[idxGender]) ? row[idxGender] : 'M';
        const genderUpper = String(genderRaw).toUpperCase().trim();
        const gender = (genderUpper.startsWith('F') || genderUpper.startsWith('M')) ? genderUpper.charAt(0) : 'M';

        // --- Birth Date ---
        let birthDateRaw = (idxBirth !== -1) ? row[idxBirth] : null;
        let ageRaw = (idxAge !== -1) ? row[idxAge] : null;

        // --- STRICT MAPPED COLUMNS (User Request) ---

        // DNI (Col C -> Index 2)
        // Debugging: If DNI is missing at C, check neighbors B(1) or D(3)
        let dniVal = (row[IDX_DNI] !== undefined) ? row[IDX_DNI] : null;

        // If empty, try fallback to dynamic search or neighbors
        if (!dniVal || dniVal === '-') {
            // Try explicit neighbors just in case
            if (row[3] && String(row[3]).match(/^\d+$/)) dniVal = row[3]; // Check Col D (3)
            else if (row[1] && String(row[1]).match(/^\d+$/)) dniVal = row[1]; // Check Col B (1)
            // Try searching further right if shifted
            else if (row[4] && String(row[4]).match(/^\d{7,8}$/)) dniVal = row[4]; // Check Col E (4)
            else dniVal = '-';
        }

        if (dniVal && dniVal !== '-') {
            dniVal = String(dniVal).replace(/\./g, '').trim();
        }

        // Ley (Col E -> Index 4)
        const law = (row[IDX_LEY] !== undefined) ? String(row[IDX_LEY]).trim() : '';

        // Afiliado (Col H -> Index 7)
        const affiliateStatus = (row[IDX_AFILIADO] !== undefined) ? String(row[IDX_AFILIADO]).trim() : '';

        // Jurisdicción (Col L + M -> Index 11 + 12)
        // Check also L+1 or L-1 if shifted
        const jurisCode = (row[IDX_JURIS_CODE] !== undefined) ? String(row[IDX_JURIS_CODE]).trim() : '';
        const jurisName = (row[IDX_JURIS_NAME] !== undefined) ? String(row[IDX_JURIS_NAME]).trim() : '';

        let actualJurisName = jurisName;
        if ((!actualJurisName || actualJurisName === '-') && row[13]) {
            actualJurisName = row[13]; // Check M+1 (13)
        }

        let ministry = '';
        if (jurisCode || actualJurisName) {
            ministry = `${jurisCode} - ${actualJurisName}`.trim();
            if (ministry === '-') ministry = '';
        }

        // --- Other Fields (Dynamic or Fallback) ---

        let agreement = '';
        const idxAgreement = findCol(['Convenio', 'Agreement']);
        if (idxAgreement !== -1) agreement = row[idxAgreement] || '';

        // Ubicacion
        const idxLocDesc = findCol(['Unnamed: 15', 'Ubicacion Descripcion']);
        const idxLocCode = findCol(['Ubicacion', 'Location', 'U1']);
        let locationVal = '';
        if (idxLocDesc !== -1 && row[idxLocDesc]) locationVal = row[idxLocDesc];
        else if (idxLocCode !== -1 && row[idxLocCode]) locationVal = row[idxLocCode];

        // Rama
        const idxBranchCode = findCol(['Rama', 'Branch', 'RamCod']);
        const idxBranchDesc = findCol(['Unnamed: 21', 'Rama Descripcion']);
        let branchVal = '';
        const bCode = (idxBranchCode !== -1 && row[idxBranchCode]) ? row[idxBranchCode] : '';
        const bDesc = (idxBranchDesc !== -1 && row[idxBranchDesc]) ? row[idxBranchDesc] : '';
        if (bCode && bDesc) branchVal = `${bCode} - ${bDesc}`;
        else branchVal = bDesc || bCode;

        // CUIL
        const cuilVal = (idxCuil !== -1 && row[idxCuil]) ? row[idxCuil] : '';

        // Antiguedad
        const seniorityVal = (idxSeniority !== -1 && row[idxSeniority]) ? row[idxSeniority] : '-';

        let birthDate = null;
        if (birthDateRaw) {
            if (typeof birthDateRaw === 'number') {
                birthDate = new Date(Math.round((birthDateRaw - 25569) * 86400 * 1000));
            } else {
                const s = String(birthDateRaw);
                if (s.includes('/')) {
                    const parts = s.split('/');
                    if (parts.length === 3) {
                        birthDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    }
                } else {
                    birthDate = new Date(s);
                }
            }
        } else if (ageRaw) {
            const age = parseInt(ageRaw, 10);
            if (!isNaN(age)) {
                const today = new Date();
                birthDate = new Date(today.getFullYear() - age, today.getMonth(), today.getDate());
            }
        }

        if (birthDate && isNaN(birthDate.getTime())) birthDate = null;

        let retirementDate = null;
        let status = { code: 'lejos', label: '' };
        let age = null;

        if (birthDate) {
            retirementDate = calculateRetirementDate(birthDate, gender);
            status = getRetirementStatus(retirementDate);
            age = calculateAge(birthDate);
        }

        agentsToUpload.push({
            fullName,
            birthDate: birthDate ? birthDate.toISOString().split('T')[0] : null,
            gender,
            retirementDate: retirementDate ? retirementDate.toISOString().split('T')[0] : null,
            status,
            age,
            agreement,
            law,
            affiliateStatus,
            ministry,
            location: locationVal,
            branch: branchVal,
            cuil: cuilVal,
            dni: dniVal,
            seniority: seniorityVal
        });
    }


    if (agentsToUpload.length > 0) {
        try {
            const res = await fetch(`${API_URL}/agents/bulk/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(agentsToUpload)
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Éxito: ${data.message}`);
                closeUploadModal();
                loadAgents();
            } else {
                const errorData = await res.json();
                alert(`Error al importar: ${errorData.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Error de conexión al importar');
        }
    } else {
        alert('No se encontraron agentes válidos para importar.');
    }
}

// --- Persistence (API) ---

async function loadAgents(url = null) {
    let fetchUrl;

    if (url) {
        // Pagination case: URL provided by DRF (absolute)
        // We only want the query parameters to avoid Origin/Host mismatch issues
        try {
            const urlObj = new URL(url);
            // Construct cleaner URL using our trusted API_URL
            fetchUrl = `${API_URL}/agents/${urlObj.search}`;
        } catch (e) {
            console.warn('Invalid pagination URL, using base:', url);
            fetchUrl = `${API_URL}/agents/`;
        }
    } else {
        // Initial load or filter change
        fetchUrl = `${API_URL}/agents/`;
        if (currentStatusFilter) {
            fetchUrl += `?status=${currentStatusFilter}`;
        }
    }

    try {
        const res = await fetch(fetchUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            const agentsList = data.results || data;

            // Pagination state
            nextPageUrl = data.next;
            prevPageUrl = data.previous;

            // Update UI Controls
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');
            const pageInfo = document.getElementById('page-info');

            if (prevBtn) prevBtn.disabled = !prevPageUrl;
            if (nextBtn) nextBtn.disabled = !nextPageUrl;
            if (pageInfo) pageInfo.textContent = `Página ${currentPage}`;

            globalAgents = agentsList.map(a => ({
                id: a.id,
                fullName: a.full_name,
                birthDate: a.birth_date,
                gender: a.gender,
                retirementDate: a.retirement_date,
                status: typeof a.status === 'string' ? JSON.parse(a.status) : a.status,
                age: a.birth_date ? calculateAge(new Date(a.birth_date)) : null,
                agreement: a.agreement,
                law: a.law,
                affiliate_status: a.affiliate_status,
                ministry: a.ministry,
                location: a.location,
                branch: a.branch,
                cuil: a.cuil,
                dni: a.dni,
                seniority: a.seniority
            }));
            sortAgents();

            if (globalAgents.length === 0) {
                console.log('No agents found');
            }

            // Render what we received (already filtered by backend)
            renderDashboard();

        } else if (res.status === 401 || res.status === 403) {
            logout();
        }
    } catch (e) {
        console.error('Error loading agents', e);
        alert('Error al cargar agentes: ' + e.message);
    }
}

function nextPage() {
    if (nextPageUrl) {
        currentPage++;
        loadAgents(nextPageUrl);
    }
}

function prevPage() {
    if (prevPageUrl) {
        currentPage--;
        loadAgents(prevPageUrl);
    }
}

function filterByStatus(statusCode) {
    currentStatusFilter = statusCode;
    currentPage = 1; // Reset to page 1 on new filter
    loadAgents();
}

function showAllAgents() {
    currentStatusFilter = null;
    currentPage = 1;
    loadAgents();
}

function updateStats() {
    const totalCount = document.getElementById('total-count');
    const vencidoCount = document.getElementById('vencido-count');
    const proximoCount = document.getElementById('proximo-count');

    if (!totalCount || !vencidoCount || !proximoCount) return;

    totalCount.textContent = globalAgents.length;

    const vencidos = globalAgents.filter(a => a.status.code === 'vencido').length;
    vencidoCount.textContent = vencidos;

    const inminenteCount = document.getElementById('inminente-count');
    if (inminenteCount) {
        const inminentes = globalAgents.filter(a => a.status.code === 'inminente').length;
        inminenteCount.textContent = inminentes;
    }

    const proximos = globalAgents.filter(a => a.status.code === 'proximo').length;
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
            <td>${agent.seniority || '-'}</td>
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

async function clearAllData() {
    if (confirm('¿Estás seguro de que querés borrar TODOS los agentes? Esta acción no se puede deshacer.')) {
        try {
            const res = await fetch(`${API_URL}/agents/delete_all/`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                loadAgents();
            } else {
                const data = await res.json();
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert('Error al borrar los datos.');
        }
    }
}

async function deleteAgent(id, reload = true) {
    if (!reload || confirm('¿Borrar este agente?')) {
        try {
            const res = await fetch(`${API_URL}/agents/${id}/`, {
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
        const res = await fetch(`${API_URL}/agents/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fullName,
                birthDate: birthDate ? birthDate.toISOString().split('T')[0] : null,
                gender,
                retirementDate: retirementDate ? retirementDate.toISOString().split('T')[0] : null,
                status,
                age
            })
        });

        if (res.ok) {
            loadAgents();
            closeModal();
        } else {
            const data = await res.json();
            console.error('Error creating agent:', data);
            alert(`Error al guardar agente: ${JSON.stringify(data)}`);
        }
    } catch (e) {
        console.error(e);
        alert('Error de conexión');
    }
}

// --- Details Modal Logic ---

function openDetailsModal(id) {
    const agent = globalAgents.find(a => a.id == id);
    if (!agent) return;

    // Helper safely get element
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '-';
    };

    setVal('detail-name', agent.fullName);
    setVal('detail-dni', agent.dni);
    setVal('detail-cuil', agent.cuil);
    setVal('detail-age', agent.age !== null ? agent.age + ' años' : '-');
    setVal('detail-gender', agent.gender);
    setVal('detail-birthdate', agent.birthDate ? new Date(agent.birthDate).toLocaleDateString('es-AR') : '-');
    setVal('detail-retirement-date', agent.retirementDate ? new Date(agent.retirementDate).toLocaleDateString('es-AR') : '-');

    setVal('detail-ministry', agent.ministry);
    setVal('detail-location', agent.location);
    setVal('detail-branch', agent.branch);
    setVal('detail-agreement', agent.agreement);
    setVal('detail-law', agent.law);
    setVal('detail-affiliate', agent.affiliate_status); // Updated from affiliateStatus
    setVal('detail-seniority', agent.seniority ? agent.seniority + ' años' : '-');

    const statusEl = document.getElementById('detail-status');
    if (statusEl) {
        statusEl.textContent = agent.status.label;
        statusEl.className = `status-badge status-${agent.status.code}`;
    }

    const modal = document.getElementById('agent-details-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDetailsModal() {
    const modal = document.getElementById('agent-details-modal');
    if (modal) modal.classList.add('hidden');
}

// Close on outside click
window.addEventListener('click', (e) => {
    const dModal = document.getElementById('agent-details-modal');
    if (dModal && e.target === dModal) {
        closeDetailsModal();
    }
});

// --- Chatbot Logic ---

function toggleChatbot() {
    const window = document.getElementById('chatbot-window');
    window.classList.toggle('hidden');
    if (!window.classList.contains('hidden')) {
        document.getElementById('chat-input').focus();
    }
}

function handleChatInput(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    // Process logic with a small delay to simulate "thinking"
    setTimeout(() => {
        const response = processUserQuery(text);
        addMessage(response, 'bot');
    }, 400);
}

function addMessage(text, sender) {
    const container = document.getElementById('chatbot-messages');
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerHTML = text.replace(/\n/g, '<br>');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Helper for accent-insensitive comparison
function normalizeString(str) {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function processUserQuery(query) {
    const normalizedQuery = normalizeString(query);
    const lower = query.toLowerCase().trim();

    // --- PUBLIC MODE (No User Logged In) ---
    if (!currentUser) {
        if (lower.includes('hola') || lower.includes('buen')) {
            return "¡Hola! ¿En qué puedo orientarte hoy?";
        }
        if (lower.includes('contacto') || lower.includes('telefono') || lower.includes('mail') || lower.includes('donde estan') || lower.includes('ubicacion')) {
            return "Estamos en Santa Rosa. Podés llamarnos al 02954-452600 (Interno 1213) o escribir a legajospersonal@lapampa.gob.ar.";
        }
        if (lower.includes('ayuda') || lower.includes('que haces')) {
            return "Soy PILIN. En esta versión pública puedo darte información de contacto. Para buscar agentes o ver estados de trámites, por favor iniciá sesión.";
        }

        // --- KNOWLEDGE BASE (Public) ---

        // Retiro Especial / Ley 3581
        if (normalizedQuery.includes('retiro especial') || normalizedQuery.includes('ley 3581') || normalizedQuery.includes('3581')) {
            return `**Retiro Especial (Ley N° 3581):**<br><br>
            Es para agentes que aún no tienen edad/aportes para la ordinaria. Se retiran con un % del sueldo (aprox. 60%) y siguen aportando hasta cumplir la edad legal.<br><br>
            **Requisitos:**<br>
            • Mujeres 55 años / Varones 60 años.<br>
            • 30 años de aportes (mínimo 20 en ISS La Pampa).<br>
            • Vigencia hasta 31/12/2027.<br><br>
            <a href="https://dgp.lapampa.gob.ar/jubilaciones-especiales" target="_blank" style="color: var(--primary); text-decoration: underline;">Más información aquí</a>`;
        }

        // Jubilación por ANSES
        if (normalizedQuery.includes('anses')) {
            return `**Jubilación por ANSES:**<br><br>
            Corresponde a quienes aportaron a la Caja Nacional. Requisito: 30 años de aportes y 60/65 años de edad.<br><br>
            **Diferencia Clave:** Si tenés aportes en ISS y ANSES, se jubila por la "Caja Otorgante" (donde tengas más años). Al obtener este beneficio, cesa la relación de empleo provincial.<br><br>
            <a href="https://dgp.lapampa.gob.ar/jubilacion-por-anses" target="_blank" style="color: var(--primary); text-decoration: underline;">Más información aquí</a>`;
        }

        // Suplemento Especial Vitalicio / Invalidez
        if (normalizedQuery.includes('suplemento') || normalizedQuery.includes('vitalicio') || normalizedQuery.includes('invalidez')) {
            return `**Suplemento Especial Vitalicio:**<br><br>
            Beneficio para agentes que ingresaron tarde a planta y no llegan a los 30 años de aportes. El Estado paga un plus para completar el haber.<br><br>
            **Destinado a:** Ingresantes al ISS entre 2004-2007 o ex Ley 2343.<br>
            **Requisitos:** 60/65 años de edad, 10 años de aportes al ISS y **no tener otra jubilación**.<br><br>
            <a href="https://dgp.lapampa.gob.ar/jubilacion-anticipada" target="_blank" style="color: var(--primary); text-decoration: underline;">Más información aquí</a>`;
        }

        // Jubilación Ordinaria
        if (normalizedQuery.includes('ordinaria')) {
            return `**Jubilación Ordinaria:**<br><br>
            Es el beneficio estándar al completar la carrera laboral.<br><br>
            **Requisitos:**<br>
            • Edad: 60 (mujeres) / 65 (hombres).<br>
            • Aportes: 30 años computables.<br>
            • **Caja Otorgante:** Mayor cantidad de aportes en ISS La Pampa (o 10 años mínimo si es la última).<br><br>
            <a href="https://dgp.lapampa.gob.ar/jubilacion-ordinaria" target="_blank" style="color: var(--primary); text-decoration: underline;">Más información aquí</a>`;
        }

        // Catch-all for data queries in public mode
        return "Para buscar personas, DNI o ver estados de trámites, necesitás **iniciar sesión**. Por seguridad, no puedo mostrar datos privados aquí.<br><br>Podés preguntarme sobre: *Ordinaria, Retiro Especial, ANSES o Suplemento Vitalicio*.";
    }

    // --- PRIVATE MODE (Dashboard) ---

    // Command: Reset/Clean
    if (lower.includes('reset') || lower.includes('limpiar') || lower.includes('todos') || lower.includes('borrar') || lower.includes('inicio') || lower.includes('volver') || lower.includes('lista') || lower.includes('original')) {
        loadAgents();
        return 'Listo jefe, volví a cargar la lista completa. Ahí tenés a todos de nuevo.';
    }

    // --- SMART NUMERIC SEARCH (DNI or Affiliate) ---
    // Matches if the query is a number of at least 4 digits
    const numberMatch = lower.match(/^\d{4,}$/);
    if (numberMatch) {
        const numStr = numberMatch[0];

        // Search in DNI and Affiliate Status (which holds the affiliate number)
        const found = globalAgents.filter(a => {
            const dniMatch = a.dni && a.dni.toString().includes(numStr);
            // Check affiliateStatus. Sometimes it is mixed text, so we check if it includes the number
            const affMatch = a.affiliate_status && a.affiliate_status.toString().includes(numStr);
            return dniMatch || affMatch;
        });

        if (found.length === 1) {
            const agent = found[0];
            const isDni = agent.dni && agent.dni.toString().includes(numStr);
            const isAff = agent.affiliate_status && agent.affiliate_status.toString().includes(numStr);

            let reason = "";
            if (isDni && isAff) reason = "por DNI y Nro. de Afiliado";
            else if (isDni) reason = "por DNI";
            else if (isAff) reason = "por Nro. de Afiliado";

            openDetailsModal(agent.id);
            return `¡Encontrado! Es **${agent.fullName}** (lo encontré ${reason}: ${numStr}).`;

        } else if (found.length > 1) {
            renderFilteredAgents(found);
            return `Encontré a **${found.length}** agentes que coinciden con el número **${numStr}** (en DNI o Afiliado). Mirá la tabla.`;
        } else {
            return `Busqué el número **${numStr}** como DNI y como Nro. de Afiliado, pero no encontré a nadie.`;
        }
    }

    // --- SURNAME SEARCH (Single Word) ---
    // If it's a single word and not a number, treat as Surname search
    if (/^[a-zñáéíóúü]+$/i.test(lower)) {
        const found = globalAgents.filter(a => {
            // Normalize agent full name too
            const agentNameNorm = normalizeString(a.fullName);
            return agentNameNorm.includes(normalizedQuery);
        });

        if (found.length > 0) {
            renderFilteredAgents(found);
            if (found.length === 1) {
                openDetailsModal(found[0].id);
                return `Encontré a **${found[0].fullName}**. Aquí tenés su ficha.`;
            }
            return `Encontré a **${found.length}** agentes con el nombre/apellido "${query}".`;
        } else {
            return `No encontré a nadie con el apellido o nombre "${query}".`;
        }
    }

    // --- Legacy Filters (Age/Seniority) ---
    if (lower.includes('antigüedad') || lower.includes('años') || lower.includes('edad')) {
        const numMatch = lower.match(/(\d+)/);
        if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            let filtered = [];
            let msg = '';
            // Determine if we are filtering by Seniority or Age
            const isAge = lower.includes('edad');
            const criteriaName = isAge ? 'edad' : 'antigüedad';

            // Helper to get value based on criteria
            const getValue = (a) => isAge ? (a.age || 0) : (parseInt(a.seniority) || 0);

            if (lower.includes('mayor') || lower.includes('mas de') || lower.includes('más de')) {
                filtered = globalAgents.filter(a => getValue(a) > num);
                msg = `mayores a ${num} años (${criteriaName})`;
            } else if (lower.includes('menor') || lower.includes('menos de')) {
                filtered = globalAgents.filter(a => getValue(a) < num);
                msg = `menores a ${num} años (${criteriaName})`;
            } else {
                filtered = globalAgents.filter(a => getValue(a) === num);
                msg = `con exactamente ${num} años (${criteriaName})`;
            }

            if (filtered.length > 0) {
                renderFilteredAgents(filtered);
                return `Filtré por ${criteriaName}: encontré **${filtered.length}** agentes ${msg}.`;
            } else {
                return `No encontré a nadie con esa ${criteriaName} (${msg}).`;
            }
        }
    }


    // Command: Filter by Ministry/Jurisdiccion/Branch
    if (lower.includes('filtrar') || lower.includes('busca en') || lower.includes('muestrame') || lower.includes('ver') || lower.includes('traeme')) {
        let term = lower.replace('filtrar', '').replace('por', '').replace('busca en', '').replace('muestrame', '').replace('ver', '').replace('los de', '').replace('traeme', '').replace('a los', '').trim();

        if (!term) return '¿A quiénes buscamos? Decime un sector, como "Salud" o "Vialidad".';

        const filtered = globalAgents.filter(a => {
            const t = term.toLowerCase();
            return (
                (a.ministry && a.ministry.toLowerCase().includes(t)) ||
                (a.branch && a.branch.toLowerCase().includes(t)) ||
                (a.location && a.location.toLowerCase().includes(t)) ||
                (a.status && a.status.label.toLowerCase().includes(t))
            );
        });

        if (filtered.length > 0) {
            renderFilteredAgents(filtered);
            return `¡Encontré a ${filtered.length} agentes en "${term}"! Ya te actualicé la tabla.`;
        } else {
            return `Mmm... busqué por todos lados pero no encontré nada con "${term}". ¿Probamos otra cosa?`;
        }
    }

    // Command: Count Status
    if (lower.includes('cuantos') || lower.includes('cantidad') || lower.includes('hay')) {
        let count = 0;
        let type = '';

        if (lower.includes('vencido')) {
            count = globalAgents.filter(a => a.status.code === 'vencido').length;
            type = 'que ya se tienen que jubilar (Vencidos)';
        } else if (lower.includes('proximo') || lower.includes('próximo')) {
            count = globalAgents.filter(a => a.status.code === 'proximo').length;
            type = 'que les falta poco (Próximos)';
        } else if (lower.includes('inminente')) {
            count = globalAgents.filter(a => a.status.code === 'inminente').length;
            type = 'a punto de salir (Inminentes)';
        } else {
            return '¿Qué cantidad querés saber? Probá "Cuántos vencidos hay" o "Cuántos próximos".';
        }

        return `Según mis cálculos, hay **${count}** agentes ${type}.`;
    }

    // Command: Search specific person
    if (lower.includes('buscar a') || lower.includes('quien es') || lower.includes('buscame a')) {
        const name = lower.replace('buscar a', '').replace('quien es', '').replace('buscame a', '').replace('por dni', '').trim();

        if (!name || /^\d+$/.test(name)) return 'No entendí el nombre. Si querés buscar por DNI, escribí solo el número o "DNI [Numero]".';

        const found = globalAgents.filter(a => a.fullName.toLowerCase().includes(name));

        if (found.length === 1) {
            openDetailsModal(found[0].id);
            return `¡Acá está! Te abrí la ficha de ${found[0].fullName}.`;
        } else if (found.length > 1) {
            renderFilteredAgents(found);
            return `Encontré a ${found.length} personas que coinciden con "${name}". Fijate en la tabla cuál es el que buscás.`;
        } else {
            return `No me suena "${name}" en este padrón. ¿Estará bien escrito el apellido?`;
        }
    }

    return 'No entendí esa orden. Probá con:\n• "Buscame al DNI 12345678"\n• "Ver los de Salud"\n• "Edad mayor a 55"\n• "Reset"';
}

function renderFilteredAgents(filteredList) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    filteredList.forEach(agent => {
        const row = document.createElement('tr');

        let birthDateStr = agent.birthDate ? new Date(agent.birthDate).toLocaleDateString('es-AR') : '-';
        let rDateStr = agent.retirementDate ? new Date(agent.retirementDate).toLocaleDateString('es-AR') : '-';

        row.innerHTML = `
            <td>
                <div style="font-weight: 500; cursor: pointer; color: var(--primary);" onclick="openDetailsModal('${agent.id}')">
                    ${agent.fullName}
                </div>
            </td>
            <td>${birthDateStr}</td>
            <td>${agent.age !== null ? agent.age + ' años' : '-'}</td>
            <td>${agent.gender}</td>
            <td>${agent.seniority || '-'}</td>
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



// --- Expose to Window ---
window.handleFileSelect = handleFileSelect;
window.triggerDashboardUpload = triggerDashboardUpload;
window.clearAllData = clearAllData;
window.openModal = openModal;
window.closeModal = closeModal;
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
window.analyzeData = analyzeData;
window.filterByStatus = filterByStatus;
window.loadAgents = loadAgents;
// Chatbot
window.toggleChatbot = toggleChatbot;
window.handleChatInput = handleChatInput;
window.sendMessage = sendMessage;

window.showAllAgents = showAllAgents;
window.nextPage = nextPage;
window.prevPage = prevPage;
