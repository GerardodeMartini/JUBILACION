// Constants
const RETIREMENT_AGE_FEMALE = 60;
const RETIREMENT_AGE_MALE = 65;

// Helper to get CSRF Token
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Helper to determine API URL based on environment
const getApiUrl = () => {
    // Determine API URL based on current context
    const origin = window.location.origin;

    // If running from file:// or empty origin (unlikely in normal browser usage but possible in some views)
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
        return 'http://127.0.0.1:8000/api';
    }

    // Standard web context
    return origin + '/api';
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
let currentPageSize = 50; // Track page size for continuous numbering
let currentStatusFilter = null;
let currentFilters = {}; // Track active filters (Name, Ministry, etc.)

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
    const isInicio = window.location.pathname.endsWith('inicio.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    const isLogin = window.location.pathname.endsWith('login.html');
    const isRegister = window.location.pathname.endsWith('registro.html');

    if (token) {
        const savedUser = localStorage.getItem('auth_user');
        if (savedUser) currentUser = JSON.parse(savedUser);

        // If logged in and on auth pages, go to dashboard
        if (isLogin || isRegister) {
            window.location.href = 'dashboard.html';
            return;
        }

        if (isDashboard) {
            if (userDisplay) {
                userDisplay.textContent = `${currentUser.username} (${currentUser.role === 'admin' ? 'Admin' : 'Usuario'})`;
            }
            // Default View: Imminent Agents (100 per page as requested)
            currentStatusFilter = 'inminente';
            loadAgents(null, {}, 100);

            // Hide Admin Actions if not admin
            if (currentUser.role !== 'admin') {
                const headerActions = document.querySelector('.header-actions');
                if (headerActions) headerActions.style.display = 'none';
            }
        }
    } else {
        // If not logged in and on dashboard, go to login
        if (isDashboard) {
            window.location.href = 'login.html';
            return;
        }
    }


    // Check for activation success
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('activated') === 'true') {
        alert('¡Cuenta activada con éxito! Ya puedes iniciar sesión.');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // --- Inactivity Timer ---
    if (token) {
        setupInactivityTimer();
    }
});

let inactivityTimer;
const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 Minutes

function setupInactivityTimer() {
    // Reset timer on any interaction
    window.onload = resetInactivityTimer;
    document.onmousemove = resetInactivityTimer;
    document.onkeydown = resetInactivityTimer;
    document.onclick = resetInactivityTimer;
    document.onscroll = resetInactivityTimer;
    document.ontouchstart = resetInactivityTimer;

    // Start initial timer
    resetInactivityTimer();
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(doInactivityLogout, INACTIVITY_LIMIT);
}

function doInactivityLogout() {
    alert('Tu sesión ha expirado por inactividad.');
    logout();
}

// --- Auth Functions ---

function toggleAuthMode() {
    console.warn('toggleAuthMode is deprecated');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/auth/login/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
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
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    // Get Turnstile Token
    const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;

    if (password !== confirmPassword) {
        alert('Las contraseñas no coinciden.');
        return;
    }

    // Password Complexity Validation
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isLongEnough = password.length >= 6;

    if (!isLongEnough || !hasUpperCase || !hasNumber || !hasSpecialChar) {
        alert('La contraseña debe tener al menos: 6 caracteres, una mayúscula, un número y un carácter especial.');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/auth/register/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                username,
                email,
                password,
                confirm_password: confirmPassword,
                turnstile_token: turnstileToken
            })
        });

        if (res.ok) {
            alert('Cuenta creada. Revisa tu email para activarla.');
            window.location.href = 'login.html';
        } else {
            const data = await res.json();
            // Handle specific field errors or general errors
            let msg = 'Error en el registro';
            if (data.password) msg = `Contraseña: ${data.password[0]}`;
            else if (data.email) msg = `Email: ${data.email[0]}`;
            else if (data.username) msg = `Usuario: ${data.username[0]}`;
            else if (data.error) msg = data.error;

            alert(msg);
        }
    } catch (err) {
        console.error(err);
        alert('Error de conexión');
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const btn = input.nextElementSibling; // The button
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('ph-eye');
        icon.classList.add('ph-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('ph-eye-slash');
        icon.classList.add('ph-eye');
    }
}

function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    globalAgents = [];

    window.location.href = '/';
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
                    'Authorization': `Bearer ${token}`,
                    'X-CSRFToken': getCookie('csrftoken')
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

async function loadAgents(url = null, filters = {}, pageSize = 100) {
    let fetchUrl;

    // Update global page size tracker if this is a fresh load (not pagination link)
    if (!url) {
        currentPageSize = pageSize;
        // Update global filters
        currentFilters = filters || {};
    }

    if (url) {
        // Pagination case: URL provided by DRF (absolute)
        try {
            const urlObj = new URL(url);
            fetchUrl = `${API_URL}/agents/${urlObj.search}`;
        } catch (e) {
            console.warn('Invalid pagination URL, using base:', url);
            fetchUrl = `${API_URL}/agents/`;
        }
    } else {
        // Initial load or filter change
        fetchUrl = `${API_URL}/agents/?page_size=${pageSize}`;

        // Add Filters
        if (currentStatusFilter) {
            fetchUrl += `&status=${currentStatusFilter}`;
        }

        // Add Custom Filters (Search)
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                fetchUrl += `&${key}=${encodeURIComponent(value)}`;
            }
        }
    }

    try {
        const res = await fetch(fetchUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': getCookie('csrftoken')
            }
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
        loadAgents(prevPageUrl);
    }
}

async function exportAgents() {
    // Determine the export URL with current filters
    let exportUrl = `${API_URL}/agents/export/?`;

    // Add Status Filter
    if (currentStatusFilter) {
        exportUrl += `status=${currentStatusFilter}&`;
    }

    // Add Custom Filters (tracked in global currentFilters)
    for (const [key, value] of Object.entries(currentFilters)) {
        if (value) {
            exportUrl += `${key}=${encodeURIComponent(value)}&`;
        }
    }

    try {
        // Use fetch with Auth header instead of window.location.href
        const res = await fetch(exportUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'agentes_filtrados.xlsx'; // Filename
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            console.error('Export failed:', res.status);
            if (res.status === 401) logout();
            else alert('Error al exportar el archivo.');
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Error de conexión al exportar.');
    }
}

function filterByStatus(statusCode) {
    currentStatusFilter = statusCode;
    currentPage = 1;
    loadAgents();
}

function showAllAgents() {
    currentStatusFilter = null;
    currentPage = 1;
    loadAgents();
}

// --- Search Features ---

async function searchAgents() {
    const criterion = document.getElementById('search-criterion').value;
    const value = document.getElementById('search-input').value.trim();

    if (value) {
        currentStatusFilter = null; // Search overrides status tabs
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));

        await loadAgents(null, { [criterion]: value }, 100);
    } else {
        loadAgents();
    }
}

function resetSearch() {
    document.getElementById('search-input').value = '';
    // Reset to "Inminente" view (100 per page)
    currentStatusFilter = 'inminente';
    currentPage = 1;
    loadAgents(null, {}, 100);
}

function handleSearchInput(event) {
    if (event.key === 'Enter') {
        searchAgents();
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_URL}/agents/stats/`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': getCookie('csrftoken')
            }
        });
        if (res.ok) {
            const stats = await res.json();

            const totalCount = document.getElementById('total-count');
            const vencidoCount = document.getElementById('vencido-count');
            const proximoCount = document.getElementById('proximo-count');
            const inminenteCount = document.getElementById('inminente-count');

            if (totalCount) totalCount.textContent = stats.total;
            if (vencidoCount) vencidoCount.textContent = stats.vencido;
            if (proximoCount) proximoCount.textContent = stats.proximo;
            if (inminenteCount) inminenteCount.textContent = stats.inminente;
        }
    } catch (e) {
        console.error('Error fetching stats:', e);
    }
}

// Renamed for compatibility, but now calls fetchStats
function updateStats() {
    fetchStats();
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

    globalAgents.forEach((agent, index) => {
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
            <td>${(currentPage - 1) * currentPageSize + index + 1}</td>
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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRFToken': getCookie('csrftoken')
                }
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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRFToken': getCookie('csrftoken')
                }
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
                'Authorization': `Bearer ${token}`,
                'X-CSRFToken': getCookie('csrftoken')
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

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    input.value = '';

    // Process logic with a small delay to simulate "thinking"
    // Using setTimeout wrapped in a promise or just awaiting after a delay

    // Simulate thinking delay visually if desired, but for now just await response
    const loadingId = addMessage('...', 'bot'); // Optional: Add a temp loading message

    try {
        // Improve: Remove "..." message before adding real response, or just replace it.
        // For simplicity: We wait 400ms then call async process
        await new Promise(r => setTimeout(r, 400));

        const response = await processUserQuery(text);

        // Remove loading message if we had one, or just append. 
        // Simplest compatible way: Remove the last '...' message if it exists
        const container = document.getElementById('chatbot-messages');
        if (container.lastChild && container.lastChild.innerHTML === '...') {
            container.removeChild(container.lastChild);
        }

        addMessage(response, 'bot');
    } catch (e) {
        console.error(e);
        addMessage('Ups, tuve un error al buscar esa información.', 'bot');
    }
}

function addMessage(text, sender) {
    const container = document.getElementById('chatbot-messages');
    const div = document.createElement('div');
    div.className = `message ${sender}`;

    // Parse Markdown Links: [text](url) -> <a href="url" target="_blank">text</a>
    // Also parse plain https:// links if they aren't already part of a markdown link
    let formattedText = text.replace(/\n/g, '<br>');

    // 1. Replace [text](url)
    formattedText = formattedText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 2. Replace raw URLs (http/s) that are NOT inside quotation marks or HTML tags (basic heuristic)
    // A simpler approach is just to handle the markdown ones since we control the prompt.
    // But to be safe, we stick to the Markdown parser since we instructed the bot to use it.

    div.innerHTML = formattedText;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function normalizeAgent(a) {
    // Recalculate Status on the fly to avoid stale DB labels
    let status = typeof a.status === 'string' ? JSON.parse(a.status) : a.status;

    // Force recalculation if date is available
    if (a.birth_date && a.gender) {
        const rDate = calculateRetirementDate(new Date(a.birth_date), a.gender);
        status = getRetirementStatus(rDate);
    }

    return {
        id: a.id,
        fullName: a.full_name,
        birthDate: a.birth_date,
        gender: a.gender,
        retirementDate: a.retirement_date,
        status: status,
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
    };
}

// Helper for accent-insensitive comparison
function normalizeString(str) {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function processUserQuery(query) {
    const normalizedQuery = normalizeString(query);
    const lower = query.toLowerCase().trim();

    // --- PRIVATE MODE COMMANDS (UI Control) ---
    if (currentUser) {
        // Command: Reset/Clean
        if (lower.includes('reset') || lower.includes('limpiar') || lower.includes('todos') || lower.includes('borrar') || lower.includes('inicio') || lower.includes('volver') || lower.includes('lista') || lower.includes('original')) {
            resetSearch();
            return 'Listo jefe, tabla limpia.';
        }

        // Command: Status Filters
        if (lower.includes('inminente') || lower.includes('inminent')) {
            filterByStatus('inminente');
            return 'Filtrando por: **Inminentes** (< 6 meses).';
        }
        if (lower.includes('vencido') || lower.includes('ya') || lower.includes('pasado')) {
            filterByStatus('vencido');
            return 'Filtrando por: **Vencidos**.';
        }
        if (lower.includes('proximo') || lower.includes('cerca') || lower.includes('año')) {
            filterByStatus('proximo');
            return 'Filtrando por: **Próximos** (1 año).';
        }
    }

    // --- LLM (Groq) for everything else ---
    try {
        const mode = currentUser ? 'private' : 'public';
        const res = await fetch(`${API_URL}/chat/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                message: query,
                mode: mode
            })
        });

        if (res.ok) {
            const data = await res.json();

            // Check if response is JSON-command (Private Mode)
            if (currentUser) {
                try {
                    // LLM might return "Here is json: {...}", so we try to extract JSON
                    let text = data.response;
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const cmd = JSON.parse(jsonMatch[0]);
                        if (cmd.intent === 'command') {
                            executeBotCommand(cmd);
                            return cmd.reply || 'Ejecutando acción...';
                        } else if (cmd.intent === 'message') {
                            return cmd.reply;
                        }
                    }
                } catch (e) {
                    console.warn("Could not parse LLM JSON", e);
                }
            }

            return data.response;
        } else {
            console.error('Chat API Error:', res.status);
            return 'Lo siento, mi cerebro de IA está desconectado temporalmente. Intenta más tarde.';
        }
    } catch (e) {
        console.error('Chat Network Error:', e);
        return 'Error de conexión. Verifica tu internet.';
    }
}

async function executeBotCommand(cmd) {
    // Reset status filter for global search
    currentStatusFilter = null;
    currentFilters = {}; // Clear previous custom filters

    // Update UI status badge if exists
    const statusBadges = document.querySelectorAll('.filter-badge');
    statusBadges.forEach(b => b.classList.remove('active'));

    // 1. DNI Search
    if (cmd.action === 'search_dni') {
        const dniValue = cmd.value.trim();
        // Trigger generic load with ONE filter: dni
        // loadAgents handles url building. We pass null for url, and filter obj.
        await loadAgents(null, { dni: dniValue });

        // After loading, if we found it, open modal
        // We know globalAgents is now the result of the filter
        if (globalAgents.length > 0) {
            openDetailsModal(globalAgents[0].id);
        } else {
            // Optional: reload all agents if not found so table isn't empty?
            // Or just let user see empty table + alert.
            // We will reload original list for better UX
            alert('No se encontró nadie con ese DNI.');
            resetSearch();
        }
    }

    // 2. Filters (Jurisdiction, Agreement, Surname) - Global Backend Filters
    else if (cmd.action === 'filter_jurisdiction') {
        await loadAgents(null, { ministry: cmd.value });
    }
    else if (cmd.action === 'filter_agreement') {
        await loadAgents(null, { agreement: cmd.value });
    }
    else if (cmd.action === 'filter_surname') {
        await loadAgents(null, { surname: cmd.value });
    }
}

function renderFilteredAgents(filteredList) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    filteredList.forEach((agent, index) => {
        const row = document.createElement('tr');

        let birthDateStr = agent.birthDate ? new Date(agent.birthDate).toLocaleDateString('es-AR') : '-';
        let rDateStr = agent.retirementDate ? new Date(agent.retirementDate).toLocaleDateString('es-AR') : '-';

        row.innerHTML = `
            <td>${index + 1}</td>
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
window.searchAgents = searchAgents;
window.togglePasswordVisibility = togglePasswordVisibility;
window.resetSearch = resetSearch;
window.handleSearchInput = handleSearchInput;
window.exportAgents = exportAgents;
