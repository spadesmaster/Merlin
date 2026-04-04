const { authorize } = require('./manager.js');
const factory = require('./merlin_factory.js');
const path = require('path');
require('dotenv').config({ path: __dirname + '/.env' });

const STATE_PATH = path.join(__dirname, 'merlin_state.json');
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function runDynamicSync() {
  const auth = await authorize();
  const fs = require('fs');

  // Manual status restoration before dynamic sync (to ensure preservation)
  if (fs.existsSync(STATE_PATH)) {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    
    // Thursday (Apr 2) - ALL GREEN
    if (state.missions.thursday) {
      Object.keys(state.missions.thursday).forEach(r => state.missions.thursday[r].status = 'GREEN');
    }
    
    // Friday (Apr 3) - Specific GREEN
    if (state.missions.friday) {
      ['warrior', 'king', 'lover'].forEach(r => {
        if (state.missions.friday[r]) state.missions.friday[r].status = 'GREEN';
      });
    }
    
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  }
  
  // Sync Yesterday, Today, and the next 3 days
  await factory.syncFromSheet(auth, SPREADSHEET_ID, STATE_PATH, 3);
  
  console.log("Dynamic Authority Sync complete.");
}

runDynamicSync().catch(console.error);
