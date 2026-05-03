const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

// Initialize WhatsApp Client
// LocalAuth saves the session so we don't need to scan the QR code every time
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium', // Pointe vers Chromium installé dans le Dockerfile
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        protocolTimeout: 0 // Prevents the Runtime.callFunctionOn timeout error
    }
});

let isClientReady = false;
let currentQR = "";

client.on('qr', (qr) => {
    currentQR = qr; // Sauvegarder le QR code
    console.log('🔴 QR Code généré ! Allez sur http://votre-site/qr pour le scanner facilement.');
    // qrcode.generate(qr, { small: true }); // Désactivé car illisible dans les logs
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is Ready and Connected!');
    isClientReady = true;
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Bot was disconnected: ', reason);
    isClientReady = false;
});

client.initialize();

// Route pour afficher le QR Code proprement dans le navigateur
app.get('/qr', (req, res) => {
    if (isClientReady) {
        return res.send("<h1>Le Bot WhatsApp est déjà connecté ! ✅</h1>");
    }
    
    if (!currentQR) {
        return res.send("<h1>Le QR Code n'est pas encore généré, patientez quelques secondes et rafraîchissez la page... ⏳</h1>");
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Connexion WhatsApp Bot</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
            body { display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f0f0; flex-direction: column; font-family: sans-serif; }
            #qrcode { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); margin-top: 20px; }
            h1 { color: #333; }
        </style>
    </head>
    <body>
        <h1>Scannez ce QR Code avec WhatsApp</h1>
        <p>Allez dans WhatsApp > Appareils liés > Connecter un appareil</p>
        <div id="qrcode"></div>
        <script>
            new QRCode(document.getElementById("qrcode"), {
                text: "${currentQR}",
                width: 300,
                height: 300
            });
            // Rafraîchir automatiquement toutes les 15 secondes
            setTimeout(() => { location.reload(); }, 15000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Express Endpoint to send messages
app.post('/send', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({ success: false, error: "WhatsApp Client is not ready yet. Scan the QR code first." });
        }

        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ success: false, error: "Phone number and message are required." });
        }

        // WhatsApp expects numbers strictly without '+' and with '@c.us' appended
        // Format input: "+228 90 00 00 00" or "22890000000"
        let formattedPhone = phone.replace(/[^0-9]/g, ''); 

        // Automatically append Benin country code if it's a local 8-digit number
        if (formattedPhone.length === 8) {
            formattedPhone = '229' + formattedPhone;
        }

        let chatId = `${formattedPhone}@c.us`;

        // Bypass isRegisteredUser check to avoid puppeteer timeouts on slow servers
        /*
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.status(404).json({ success: false, error: "This phone number is not registered on WhatsApp." });
        }
        */

        // Send the message
        await client.sendMessage(chatId, message);
        console.log(`📤 Message sent to ${formattedPhone}`);

        res.json({ success: true, message: "WhatsApp message sent successfully." });

    } catch (error) {
        console.error("🚨 Error sending message:", error);
        res.status(500).json({ success: false, error: error.toString() });
    }
});

// Start the Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
    console.log(`➡️ Endpoint ready at: POST http://localhost:${PORT}/send`);
});
