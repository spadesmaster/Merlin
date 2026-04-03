const factory = require('./merlin_factory.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: __dirname + '/.env' });

const INBOX_PATH = "/mnt/c/Users/spade/OneDrive/Documents/ToMerlin";
const STATE_PATH = path.join(__dirname, 'merlin_state.json');
const CHANGE_LOG = path.join(__dirname, '../.gemini/tmp/merlin/state_changes.log');

/**
 * Pre-Flight Protocol: Pulls latest from Sheet to protect manual edits.
 */
async function preFlightSync() {
  console.log('[SHADOW] Running Pre-Flight Authority Sync...');
  try {
    const { authorize } = require('./manager.js');
    const { google } = require('googleapis');
    const auth = await authorize();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const res = await sheets.spreadsheets.values.get({ 
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID, 
      range: "'Daily'!A1:N15" 
    });
    const rows = res.data.values;
    if (!rows) return;

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const headers = rows[0];
    const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    
    const dayRows = rows.slice(1);
    let discrepancies = false;

    // We only sync the current state day (e.g., friday)
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const d = new Date(state.date);
    const dayName = days[d.getDay()];
    const dateStr = `${dayName.substring(0,3)}, ${new Date().toLocaleDateString('en-US', {month:'short'})} ${d.getDate()}`;

    const sheetRow = dayRows.find(r => r[0] && r[0].includes(dateStr));
    if (sheetRow) {
      const missions = state.missions[dayName];
      const checkRole = (role, colName) => {
        const colIdx = getCol(colName);
        if (colIdx !== -1 && sheetRow[colIdx] && sheetRow[colIdx] !== missions[role].task) {
          fs.appendFileSync(CHANGE_LOG, `[${new Date().toISOString()}] CMD-RECOVERY: Correcting ${role} to "${sheetRow[colIdx]}" (was "${missions[role].task}")\n`);
          missions[role].task = sheetRow[colIdx];
          discrepancies = true;
        }
      };

      ['warrior', 'king', 'vizier', 'lover', 'rogue', 'tinker'].forEach(r => checkRole(role, r.charAt(0).toUpperCase() + r.slice(1)));
    }

    if (discrepancies) {
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
      console.log('[SHADOW] Authority Sync complete. State updated from Sheet.');
    }
  } catch (err) {
    console.error('[SHADOW] Pre-Flight Failed:', err.message);
  }
}

/**
 * Shadow Commander: Monitors Workflowy directives and the "ToMerlin" drop zone.
 */
async function watchSystem() {
  console.log('🚀 Shadow Commander active. Monitoring for #COMMAND nodes...');
  
  while (true) {
    try {
      await preFlightSync();
      const items = await factory.client.fetchTree();
      const consoleNode = items.find(i => (i.nm || '').includes('!MERLIN-COMMANDS!'));
      
      if (consoleNode) {
        const commands = items.filter(i => i.prnt === consoleNode.id && i.nm.includes('#COMMAND') && !i.cp);
        for (const cmdNode of commands) {
          const cmdText = cmdNode.nm.replace('#COMMAND', '').trim();
          console.log(`[SHADOW] Received Command: ${cmdText}`);
          
          // 1. RESEARCH COMMAND
          if (cmdText.toLowerCase().startsWith('research:')) {
            const topic = cmdText.replace(/research:/i, '').trim();
            console.log(`[SHADOW] Starting background research on: ${topic}`);
            
            // We simulate the research by creating a background placeholder
            // In a real scenario, this would trigger a separate script or API call
            fs.appendFileSync(path.join(__dirname, 'research_log.txt'), `\n[${new Date().toISOString()}] Researching: ${topic}`);
            
            factory.client.createNode(cmdNode.id, `🕒 Research in progress... results will appear in ToMerlin/Processed`, 0);
          } 
          // 2. SYNC COMMAND
          else if (cmdText.toLowerCase().includes('sync')) {
            const { sync } = require('./sync.js');
            await sync();
          } 

          factory.client.completeNode(cmdNode.id);
          await factory.client.push();
          console.log(`[SHADOW] Command "${cmdText}" marked COMPLETE.`);
        }
      }

      // --- DROP ZONE MONITORING ---
      if (fs.existsSync(INBOX_PATH)) {
        const files = fs.readdirSync(INBOX_PATH).filter(f => f !== 'Processed');
        for (const file of files) {
          const fullPath = path.join(INBOX_PATH, file);
          if (fs.lstatSync(fullPath).isFile()) {
            console.log(`[SHADOW] Ingesting: ${file}`);
            const hudNode = items.find(i => (i.nm || '').includes('!MERLIN-WORKING!'));
            if (hudNode) {
              factory.client.createNode(hudNode.id, `📂 NEW FILE: ${file}`, 0);
              await factory.client.push();
              const processedDir = path.join(INBOX_PATH, 'Processed');
              if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
              fs.renameSync(fullPath, path.join(processedDir, file));
            }
          }
        }
      }

    } catch (err) {
      console.error(`[SHADOW] Cycle Error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

watchSystem().catch(console.error);
