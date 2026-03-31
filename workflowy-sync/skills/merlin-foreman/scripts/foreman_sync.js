const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const axios = require('axios');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const { authorize, getHeaderMap } = require('../../../manager.js');

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SESSION_ID = process.env.WORKFLOWY_SESSION_ID;

async function getCalendarIds(auth) {
    const calendar = google.calendar({ version: 'v3', auth });
    const list = await calendar.calendarList.list();
    const appt = list.data.items.find(c => c.summary === 'Appt');
    const vb = list.data.items.find(c => c.summary === 'VB/Fun MD');
    return {
        apptId: appt ? appt.id : 'primary',
        vbId: vb ? vb.id : null
    };
}

async function getEvents(auth, dateStr) {
    const calendar = google.calendar({ version: 'v3', auth });
    const { apptId, vbId } = await getCalendarIds(auth);
    
    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);

    const fetchFrom = async (id) => {
        if (!id) return [];
        const res = await calendar.events.list({
            calendarId: id,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });
        return res.data.items || [];
    };

    const apptEvents = await fetchFrom(apptId);
    const vbEvents = await fetchFrom(vbId);
    
    return [...apptEvents, ...vbEvents].sort((a, b) => {
        const aTime = a.start.dateTime || a.start.date;
        const bTime = b.start.dateTime || b.start.date;
        return aTime.localeCompare(bTime);
    });
}

async function getSheetData(auth, tabName) {
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${tabName}'!A1:Z100`,
    });
    return res.data.values || [];
}

async function updateDailyTab(auth, rowData) {
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Ensure "Daily" tab exists
    const ss = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    if (!ss.data.sheets.find(s => s.properties.title === 'Daily')) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests: [{ addSheet: { properties: { title: 'Daily' } } }] }
        });
        // Headers
        const headers = [['Date', 'Events', 'M-WAR', 'WAR Est', 'WAR Act', 'M-VIZ', 'VIZ Est', 'VIZ Act', 'M-KNG', 'KNG Est', 'KNG Act', 'M-LUV', 'LUV Est', 'LUV Act', 'M-ROG', 'ROG Est', 'ROG Act', 'Win %', 'Sleep', 'Job Leads', 'Exercise', 'Bank', 'Wins/Notes', 'Blocked']];
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: "'Daily'!A1",
            valueInputOption: 'RAW',
            resource: { values: headers }
        });
    }

    const rows = await getSheetData(auth, 'Daily');
    const dateIdx = 0;
    const existingRowIdx = rows.findIndex(r => r[dateIdx] === rowData[0]);

    if (existingRowIdx !== -1) {
        // Update existing row
        const range = `'Daily'!A${existingRowIdx + 1}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'RAW',
            resource: { values: [rowData] }
        });
    } else {
        // Append new row
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "'Daily'!A1",
            valueInputOption: 'RAW',
            resource: { values: [rowData] }
        });
    }
}

async function getWorkflowyData() {
    const response = await axios.get('https://workflowy.com/get_tree_data/', {
        headers: { Cookie: `sessionid=${SESSION_ID}` },
    });
    return response.data.items;
}

async function pushToWorkflowy(operations) {
    // Reusing the push logic from sync.js pattern
    const initResponse = await axios.get('https://workflowy.com/get_initialization_data', {
        headers: { Cookie: `sessionid=${SESSION_ID}` }
    });
    const { projectTreeData } = initResponse.data;
    const { clientId, dateJoinedTimestamp } = projectTreeData;
    const ownerId = projectTreeData.mainProjectTreeInfo.ownerId;
    const lastId = projectTreeData.mainProjectTreeInfo.initialMostRecentOperationTransactionId;

    const pushPollData = [{
        most_recent_operation_transaction_id: lastId.toString(),
        operations: operations.map(op => ({
            ...op,
            client_timestamp: Math.floor(Date.now() / 1000) - dateJoinedTimestamp
        })),
    }];

    const payload = new URLSearchParams();
    payload.append('client_id', clientId);
    payload.append('client_version', '28');
    payload.append('push_poll_data', JSON.stringify(pushPollData));
    payload.append('crosscheck_user_id', ownerId.toString());

    await axios.post('https://workflowy.com/push_and_poll', payload, {
        headers: { Cookie: `sessionid=${SESSION_ID}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
}

async function updateWorkflowyHUD(content) {
    const items = await getWorkflowyData();
    const hudNode = items.find(i => (i.nm || '').includes('!MERLIN-RAW-INBOX-BEFORE-SYNC!'));
    
    if (!hudNode) {
        console.error("HUD Node '!MERLIN-RAW-INBOX-BEFORE-SYNC!' not found.");
        return;
    }

    // Overwriting logic:
    // 1. Delete all children
    // 2. Add new structured content
    // Simplified for now: Just edit the name of the node or add a child.
    // The user wants to OVERWRITE it with a structured report.
    
    // To properly overwrite, we should clear children and add new ones.
    const childIds = items.filter(i => i.prnt === hudNode.id).map(i => i.id);
    const ops = [];
    childIds.forEach(id => ops.push({ type: 'delete', data: { projectid: id } }));
    
    // Create new children based on content (which should be an array of lines or nodes)
    // For simplicity, let's just edit the note or the name for now, or take a string.
    // If content is an object with sections:
    const generateGuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (Math.random() * 16 | 0).toString(16));
    
    const lines = content.split('\n');
    let lastId = hudNode.id;
    for (const line of lines) {
        if (!line.trim()) continue;
        const newId = generateGuid();
        ops.push({ type: 'create', data: { projectid: newId, parentid: hudNode.id, priority: ops.filter(o => o.type === 'create').length } });
        ops.push({ type: 'edit', data: { projectid: newId, name: line } });
    }

    await pushToWorkflowy(ops);
}

module.exports = {
    getEvents,
    getSheetData,
    updateDailyTab,
    updateWorkflowyHUD,
    authorize
};

if (require.main === module) {
    const args = process.argv.slice(2);
    const cmd = args[0];
    (async () => {
        const auth = await authorize();
        if (cmd === 'events') {
            const date = args[1] || new Date().toISOString().split('T')[0];
            const events = await getEvents(auth, date);
            console.log(JSON.stringify(events, null, 2));
        } else if (cmd === 'sheet') {
            const data = await getSheetData(auth, args[1]);
            console.log(JSON.stringify(data, null, 2));
        }
    })();
}
