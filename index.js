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
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Good for running on servers
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('🔴 SCAN THIS QR CODE WITH YOUR WHATSAPP (LINKED DEVICES) 🔴');
    qrcode.generate(qr, { small: true });
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
        chatId = `${formattedPhone}@c.us`;

        // Check if the number is registered on WhatsApp (optional but safe)
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.status(404).json({ success: false, error: "This phone number is not registered on WhatsApp." });
        }

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
