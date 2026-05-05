const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// Garde-fou global : empêche le crash du process
// ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    console.error('🚨 [uncaughtException] Erreur non interceptée :', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('🚨 [unhandledRejection] Promesse rejetée non interceptée :', reason?.message ?? reason);
});

// ─────────────────────────────────────────────
// Initialisation du client WhatsApp
// ─────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || undefined,
        // ⬇ CRITIQUE : empêcher le crash "ProtocolError: Runtime.callFunctionOn timed out"
        protocolTimeout: 120000, 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let isClientReady = false;
let latestQR = '';
let noOfQrGenerated = 0;

client.on('loading_screen', (percent, message) => {
    console.log('🔄 Chargement WhatsApp Web...', percent, '%', message);
});

client.on('qr', (qr) => {
    noOfQrGenerated++;
    console.log(`[${noOfQrGenerated}] 🔴 NOUVEAU QR CODE GÉNÉRÉ !`);
    latestQR = qr;
});

client.on('authenticated', () => {
    console.log('🔐 Authentification réussie !');
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is Ready and Connected!');
    isClientReady = true;
    latestQR = ''; 
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Bot déconnecté :', reason);
    isClientReady = false;
    setTimeout(() => {
        client.initialize().catch(err => {
            console.error('🚨 Erreur lors de la reconnexion :', err.message);
        });
    }, 10000);
});

client.on('auth_failure', (msg) => {
    console.error('❌ Échec d\'authentification :', msg);
    isClientReady = false;
});

app.get('/qr', (req, res) => {
    if (isClientReady) {
        return res.send('<h3>✅ Le bot est déjà connecté !</h3>');
    }
    if (!latestQR) {
        return res.send('<h3>⏳ En cours de génération...</h3><script>setTimeout(()=>location.reload(), 3000)</script>');
    }
    res.send(`
        <html><body>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <div id="qrcode"></div>
        <script>
            new QRCode(document.getElementById("qrcode"), { text: "${latestQR}" });
            setTimeout(()=>location.reload(), 10000);
        </script>
        </body></html>
    `);
});

// ─────────────────────────────────────────────
// Endpoint POST /send
// ─────────────────────────────────────────────
app.post('/send', async (req, res) => {
    const SEND_TIMEOUT_MS = 12000; 

    const sendWithTimeout = new Promise(async (resolve) => {
        try {
            if (!isClientReady) return resolve({ success: false, error: 'Bot not ready.' });

            const { phone, message } = req.body;
            if (!phone || !message) return resolve({ success: false, error: 'Missing data.' });

            // ── Formatage numéro ──
            let formattedPhone = phone.replace(/[^0-9]/g, '');

            if (formattedPhone.length === 13 && formattedPhone.startsWith('229')) {
                // Déjà 13 chiffres, on touche pas
            } else if (formattedPhone.length === 10) {
                // Format béninois (ex: 0197... ou 41...)
                formattedPhone = '229' + formattedPhone;
            } else if (formattedPhone.length === 8) {
                formattedPhone = '22901' + formattedPhone;
            }

            console.log(`📤 Envoi vers: ${formattedPhone}`);

            // ── Résolution du numéro pour éviter "No LID for user" ──
            const numberId = await client.getNumberId(formattedPhone);
            if (!numberId) {
                console.warn(`⚠️ Numéro invalide ou non-WhatsApp : ${formattedPhone}`);
                return resolve({ success: false, error: "Numéro non trouvé sur WhatsApp" });
            }

            await client.sendMessage(numberId._serialized, message);
            console.log(`✅ Succès vers ${formattedPhone}`);
            resolve({ success: true, message: 'Message envoyé.' });

        } catch (error) {
            console.error('🚨 Erreur envoi:', error.message);
            resolve({ success: false, error: error.message });
        }
    });

    const timeout = new Promise((resolve) =>
        setTimeout(() => resolve({ success: false, error: 'Timeout' }), SEND_TIMEOUT_MS)
    );

    try {
        const result = await Promise.race([sendWithTimeout, timeout]);
        // IMPORTANT: On répond TOUJOURS 200 à Laravel pour éviter un crash serveur côté Laravel
        res.status(200).json(result);
    } catch (err) {
        res.status(200).json({ success: false, error: err.message });
    }
});

console.log('⏳ Initialisation...');
client.initialize().catch(err => {
    console.error('🚨 Erreur lancement:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));
