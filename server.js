require('dotenv').config();

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const cron = require('node-cron');

// Import local modules
const db = require('./config/database');
const steamAuth = require('./services/steamAuth');
const inventoryService = require('./services/inventoryService');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL) || 10;

// Generate secure session secret
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration - secure with encryption
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    name: 'cs2tracker_session',
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict'
    }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Auth middleware
function requireAuth(req, res, next) {
    if (steamAuth.isLoggedIn) {
        return next();
    }
    res.redirect('/');
}

// ============ AUTH ROUTES ============

// Login page
app.get('/', (req, res) => {
    res.render('login', {
        status: steamAuth.getStatus(),
        error: req.session.error,
        needsSteamGuard: req.session.needsSteamGuard
    });
    // Clear flash messages
    delete req.session.error;
});

// Login handler
app.post('/login', async (req, res) => {
    const { username, password, sharedSecret } = req.body;

    if (!username || !password) {
        req.session.error = 'Username et mot de passe requis';
        return res.redirect('/');
    }

    try {
        console.log('[Auth] Login attempt for:', username);

        // Store credentials in session (encrypted in memory)
        req.session.credentials = {
            username,
            password: Buffer.from(password).toString('base64'),
            sharedSecret: sharedSecret ? Buffer.from(sharedSecret).toString('base64') : null
        };

        // Initialize Steam auth
        steamAuth.init();

        // Attempt login
        await steamAuth.login(
            username,
            password,
            sharedSecret || null
        );

        console.log('[Auth] Login successful');

        // Clear sensitive data after successful login
        delete req.session.credentials.password;
        delete req.session.credentials.sharedSecret;

        // Start initial refresh
        inventoryService.refresh().catch(err => {
            console.error('[Auth] Initial refresh error:', err.message);
        });

        res.redirect('/dashboard');
    } catch (err) {
        console.error('[Auth] Login failed:', err.message);

        if (err.message.includes('Steam Guard') || err.message.includes('SteamGuard')) {
            req.session.needsSteamGuard = true;
            req.session.error = 'Code Steam Guard requis';
        } else if (err.message.includes('InvalidPassword')) {
            req.session.error = 'Mot de passe incorrect';
        } else if (err.message.includes('RateLimitExceeded')) {
            req.session.error = 'Trop de tentatives, réessayez plus tard';
        } else {
            req.session.error = err.message || 'Erreur de connexion';
        }

        res.redirect('/');
    }
});

// Steam Guard code handler
app.post('/steamguard', async (req, res) => {
    const { code } = req.body;
    const credentials = req.session.credentials;

    if (!code || !credentials) {
        req.session.error = 'Session expirée, reconnectez-vous';
        return res.redirect('/');
    }

    try {
        // Decode credentials
        const password = Buffer.from(credentials.password, 'base64').toString();

        // Retry login with Steam Guard code
        steamAuth.steamUser.once('steamGuard', (domain, callback) => {
            callback(code.toUpperCase());
        });

        await steamAuth.login(credentials.username, password, code.toUpperCase());

        // Clear sensitive data
        delete req.session.credentials;
        delete req.session.needsSteamGuard;

        res.redirect('/dashboard');
    } catch (err) {
        req.session.error = 'Code Steam Guard invalide';
        req.session.needsSteamGuard = true;
        res.redirect('/');
    }
});

// Logout handler
app.post('/logout', (req, res) => {
    console.log('[Auth] Logging out...');
    steamAuth.logout();
    req.session.destroy();
    res.redirect('/');
});

// ============ PROTECTED ROUTES ============

// Dashboard (protected)
app.use('/dashboard', requireAuth, dashboardRoutes);
app.use('/refresh', requireAuth, dashboardRoutes);
app.use('/export', requireAuth, dashboardRoutes);
app.use('/api', requireAuth, dashboardRoutes);

// Redirect old routes
app.get('/dashboard', requireAuth, (req, res, next) => {
    req.url = '/';
    dashboardRoutes(req, res, next);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server] Error:', err);
    res.status(500).render('login', {
        status: steamAuth.getStatus(),
        error: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).redirect('/');
});

/**
 * Initialize application
 */
async function initialize() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║       CS2 Inventory Tracker v1.2.0         ║');
    console.log('║          🔒 Secure Login Edition           ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');

    // Initialize database
    try {
        await db.init();
    } catch (err) {
        console.error('[Server] Database initialization failed:', err);
        process.exit(1);
    }

    // Setup cron job for auto-refresh (only if logged in)
    const cronSchedule = `*/${REFRESH_INTERVAL} * * * *`;
    cron.schedule(cronSchedule, async () => {
        if (!steamAuth.isLoggedIn) {
            return;
        }

        console.log('[Cron] Scheduled refresh triggered');
        try {
            await inventoryService.refresh();
        } catch (err) {
            console.error('[Cron] Refresh failed:', err.message);
        }
    });

    console.log(`[Server] Auto-refresh scheduled every ${REFRESH_INTERVAL} minutes`);
    console.log('[Server] Login via web interface required');

    // Start server
    app.listen(PORT, () => {
        console.log('');
        console.log(`[Server] ✓ Server running at http://localhost:${PORT}`);
        console.log('[Server] Open the URL in your browser to login');
        console.log('[Server] Press Ctrl+C to stop');
        console.log('');
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    steamAuth.logout();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Server] Received SIGTERM, shutting down...');
    steamAuth.logout();
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the application
initialize().catch(err => {
    console.error('[Server] Initialization failed:', err);
    process.exit(1);
});
