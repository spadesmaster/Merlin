const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const factory = require('./merlin_factory.js');
require('dotenv').config({ path: __dirname + '/.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

const SHORTHAND_MAP = {
    'volleyball': 'VB',
    'vb league': 'VB',
    'play piano': 'Piano',
    'breakfast': 'Bkfast',
    'quantum leap': 'Dancing',
    'dance night': 'Dancing',
    'water color': 'WaterColor',
    'game days': 'Games',
    'text jeff': 'Jeff'
};

function getShorthand(name) {
    const lower = name.toLowerCase();
    for (const [key, val] of Object.entries(SHORTHAND_MAP)) {
        if (lower.includes(key)) return val;
    }
    return name.split(' ')[0]; // Default to first word
}

async function getEvents(auth, dateStr) {
    const calendar = google.calendar({ version: 'v3', auth });
    const list = await calendar.calendarList.list();
    const appt = list.data.items.find(c => c.summary === 'Appt');
    const vb = list.data.items.find(c => c.summary === 'Vb/Fun MD');
    
    const calendarIds = [appt?.id, vb?.id].filter(id => !!id);
    if (calendarIds.length === 0) return [];

    const start = new Date(dateStr + 'T00:00:00');
    const end = new Date(dateStr + 'T23:59:59');

    let allEvents = [];
    for (const id of calendarIds) {
        try {
            const res = await calendar.events.list({
                calendarId: id,
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
                timeZone: 'America/New_York'
            });
            if (res.data.items) {
                const filtered = res.data.items.filter(e => {
                    const sum = (e.summary || '').toUpperCase();
                    return !sum.startsWith('DAILY:') && !sum.startsWith('SCHEDULE');
                });
                allEvents = allEvents.concat(filtered);
            }
        } catch (e) { console.error(`Error ${id}:`, e.message); }
    }
    return allEvents.sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
}

function formatTime(dateTimeStr) {
    if (!dateTimeStr || dateTimeStr.length <= 10) return '';
    const date = new Date(dateTimeStr);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'p' : '';
    hours = hours % 12 || 12;
    return minutes === 0 ? `${hours}${ampm}` : `${hours}:${minutes < 10 ? '0'+minutes : minutes}${ampm}`;
}

async function sync() {
    const auth = await authorize();
    const sheets = google.sheets({ version: 'v4', auth });
    const dates = ['2026-04-02', '2026-04-03', '2026-04-04'];
    const sheetData = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:F15" });
    const rows = sheetData.data.values;

    for (const dateStr of dates) {
        const events = await getEvents(auth, dateStr);
        const display = events.map(e => `${getShorthand(e.summary)}@${formatTime(e.start.dateTime || e.start.date)}`).join(' ') || 'No Events';
        
        console.log(`${dateStr}: ${display}`);

        // 1. Update Sheet
        const d = new Date(dateStr.split('-')[0], dateStr.split('-')[1]-1, dateStr.split('-')[2]);
        const sheetDateStr = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}, ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${d.getDate()}`;
        const rIdx = rows.findIndex(r => r[0] && r[0].includes(sheetDateStr));
        if (rIdx !== -1) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `'Daily'!F${rIdx+1}`, valueInputOption: 'RAW', resource: { values: [[display]] }
            });
        }

        // 2. Update Workflowy
        const items = await factory.client.fetchTree();
        const briefing = items.find(i => (i.nm || '').includes('#MissionBriefing') && (i.nm || '').includes(dateStr));
        if (briefing) {
            const children = items.filter(i => i.prnt === briefing.id);
            const eventsNode = children.find(c => (c.nm || '').includes('📅 Events:'));
            const nodeText = `📅 Events: ${display}`;
            if (eventsNode) {
                await factory.client.editNode(eventsNode.id, nodeText);
            } else {
                factory.client.createNode(briefing.id, nodeText, 3);
            }
        }
    }
    await factory.client.push();
    console.log("Sync complete.");
}

sync().catch(console.error);
