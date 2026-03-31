const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OFFSET_FILE = path.join(__dirname, 'tg_offset.txt');

async function getUpdates() {
    let offset = 0;
    if (fs.existsSync(OFFSET_FILE)) {
        offset = parseInt(fs.readFileSync(OFFSET_FILE, 'utf8'));
    }

    try {
        const response = await axios.get(`https://api.telegram.org/bot${TOKEN}/getUpdates`, {
            params: { offset: offset + 1, timeout: 30 }
        });

        const updates = response.data.result;
        for (const update of updates) {
            const message = update.message;
            if (message && (message.text || message.voice)) {
                console.log(`Received message from ${message.from.first_name}: ${message.text || '[Voice Message]'}`);
                
                // For now, we log it to a special "INBOX.md" that the agent can read
                const logEntry = `\n\n### Message from ${new Date().toLocaleString()}\n${message.text || '[Voice Note received - awaiting transcription]'}`;
                fs.appendFileSync(path.join(__dirname, '../INBOX.md'), logEntry);
                
                // If it's a voice message, we'd eventually download and transcribe it here
            }
            fs.writeFileSync(OFFSET_FILE, update.update_id.toString());
        }
    } catch (err) {
        console.error('Telegram Error:', err.message);
    }
}

console.log('Merlin Voice Bridge active. Listening for messages...');
setInterval(getUpdates, 5000);
