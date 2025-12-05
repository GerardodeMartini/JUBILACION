import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { initDB, getDB } from './db.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    console.error('ERROR: SECRET_KEY is not defined in .env file');
    process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- AUTH ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

    try {
        const db = await getDB();
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = crypto.randomUUID();

        await db.run(
            'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
            [id, username, hashedPassword]
        );

        res.status(201).json({ message: 'Usuario creado' });
    } catch (e) {
        if (e.message.includes('UNIQUE constraint failed')) {
            res.status(409).json({ error: 'El usuario ya existe' });
        } else {
            res.status(500).json({ error: 'Error interno' });
        }
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const db = await getDB();
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ token, username: user.username, role: user.role });
    } catch (e) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// --- AGENTS ROUTES ---

app.get('/api/agents', authenticateToken, async (req, res) => {
    try {
        const db = await getDB();
        let agents;
        console.log(`GET /agents user=${req.user.username} id=${req.user.id} role=${req.user.role}`);

        if (req.user.role === 'admin') {
            agents = await db.all('SELECT * FROM agents');
        } else {
            agents = await db.all('SELECT * FROM agents WHERE user_id = ?', [req.user.id]);
        }

        console.log(`Found ${agents.length} agents`);
        res.json(agents);
    } catch (e) {
        console.error('Error getting agents:', e);
        res.status(500).json({ error: 'Error al obtener agentes' });
    }
});



app.post('/api/agents/bulk', authenticateToken, async (req, res) => {
    const agents = req.body; // Expecting an array of agents
    if (!Array.isArray(agents)) return res.status(400).json({ error: 'Se esperaba un array de agentes' });

    console.log(`POST /agents/bulk user=${req.user.id} count=${agents.length}`);

    try {
        const db = await getDB();

        await db.run('BEGIN TRANSACTION');

        const stmt = await db.prepare(`
            INSERT INTO agents (id, user_id, full_name, birth_date, gender, retirement_date, status, agreement, law, affiliate_status, ministry)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const agent of agents) {
            const { fullName, birthDate, gender, retirementDate, status, agreement, law, affiliateStatus, ministry } = agent;
            const id = crypto.randomUUID();
            await stmt.run([
                id,
                req.user.id,
                fullName,
                birthDate,
                gender,
                retirementDate,
                JSON.stringify(status),
                agreement,
                law,
                affiliateStatus,
                ministry
            ]);
        }

        await stmt.finalize();
        await db.run('COMMIT');

        console.log(`Bulk insert completed: ${agents.length} agents`);
        res.status(201).json({ message: `${agents.length} agentes creados` });
    } catch (e) {
        console.error('Error in bulk insert:', e);
        try {
            const db = await getDB();
            await db.run('ROLLBACK');
        } catch (rollbackErr) {
            console.error('Error rolling back:', rollbackErr);
        }
        res.status(500).json({ error: 'Error al crear agentes masivamente' });
    }
});

app.post('/api/agents', authenticateToken, async (req, res) => {
    const { fullName, birthDate, gender, retirementDate, status, age, agreement, law, affiliateStatus, ministry } = req.body;
    console.log(`POST /agents user=${req.user.id} body=`, req.body);

    try {
        const db = await getDB();
        const id = crypto.randomUUID();

        await db.run(
            `INSERT INTO agents (id, user_id, full_name, birth_date, gender, retirement_date, status, agreement, law, affiliate_status, ministry)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.id, fullName, birthDate, gender, retirementDate, JSON.stringify(status), agreement, law, affiliateStatus, ministry]
        );

        console.log('Agent created:', id);
        res.status(201).json({ id, message: 'Agente creado' });
    } catch (e) {
        console.error('Error creating agent:', e);
        res.status(500).json({ error: 'Error al crear agente' });
    }
});

app.delete('/api/agents/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const db = await getDB();

        // Check ownership unless admin
        const agent = await db.get('SELECT user_id FROM agents WHERE id = ?', [id]);

        console.log(`DELETE /agents/${id} user=${req.user.id} role=${req.user.role}`);
        if (agent) console.log(`Agent owner: ${agent.user_id}`);

        if (!agent) return res.status(404).json({ error: 'Agente no encontrado' });

        if (req.user.role !== 'admin' && agent.user_id !== req.user.id) {
            console.log('Permission denied');
            return res.status(403).json({ error: 'No autorizado' });
        }

        await db.run('DELETE FROM agents WHERE id = ?', [id]);
        res.json({ message: 'Agente eliminado' });
    } catch (e) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// Start Server
// Start Server immediately to satisfy deployment health checks
const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Initialize DB in background
initDB().then(() => {
    console.log('Database initialized successfully');
}).catch(err => {
    console.error('Failed to initialize database:', err);
});
