const { authorize } = require('./manager.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const factory = require('./merlin_factory.js');
require('dotenv').config({ path: __dirname + '/.env' });

const STATE_PATH = path.join(__dirname, 'merlin_state.json');

async function finalSync() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Daily'!A1:N15" });
  const rows = res.data.values;
  const headers = rows[0];
  const getCol = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
  const cols = { date: 0, win: getCol('Win'), slp: getCol('Slp'), job: getCol('Job'), exer: getCol('Exer'), ev: getCol('Events'), war: getCol('Warrior'), kng: getCol('King'), viz: getCol('Vizier'), luv: getCol('Lover'), rog: getCol('Rogue'), tnk: getCol('Tinker') };

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

  const syncDay = async (dateStr, stateDayObj, dateLong) => {
    const row = rows.find(r => r[0] && r[0].includes(dateStr));
    if (!row) return;

    // Update Missions in State
    const missions = {};
    if (cols.war !== -1 && row[cols.war]) missions.warrior = { task: row[cols.war], status: 'NONE' };
    if (cols.kng !== -1 && row[cols.kng]) missions.king = { task: row[cols.kng], status: 'NONE' };
    if (cols.viz !== -1 && row[cols.viz]) missions.vizier = { task: row[cols.viz], status: 'NONE' };
    if (cols.luv !== -1 && row[cols.luv]) missions.lover = { task: row[cols.luv], status: 'NONE' };
    if (cols.rog !== -1 && row[cols.rog]) missions.rogue = { task: row[cols.rog], status: 'NONE' };
    if (cols.tnk !== -1 && row[cols.tnk]) missions.tinker = { task: row[cols.tnk], status: 'NONE' };

    // Maintain completions for today (Fri)
    if (dateStr === 'Fri, Apr 3') {
      ['warrior', 'king', 'lover'].forEach(r => { if (missions[r]) missions[r].status = 'GREEN'; });
    }

    state.missions[stateDayObj] = missions;

    // Update Workflowy Briefing
    const missionLines = Object.keys(missions).map(role => factory.formatMission(role, missions[role]));
    const kpiStr = `📊 #KPIs | Win: 🏆 ${row[cols.win] || '[Pending]'}% | Sleep: 💤 ${row[cols.slp] || '[Pending]'} | Leads: ☹️ ${row[cols.job] || '0'} | Exercise: ☹️ ${row[cols.exer] || '0'}`;
    const evStr = `📅 Events: ${row[cols.ev] || 'No Events'}`;
    
    await factory.createOrUpdateBriefing(dateLong, {
      kpis: kpiStr,
      events: evStr,
      missions: missionLines,
      weather: dateStr.includes('Sat') ? '☁️ Weather: 84/61 Mostly Cloudy/Warm' : '🌤️ Weather: 78/55 Clear/Sunny'
    });
  };

  await syncDay('Fri, Apr 3', 'friday', 'Friday, April 3, 2026');
  await syncDay('Sat, Apr 4', 'saturday', 'Saturday, April 4, 2026');
  await syncDay('Sun, Apr 5', 'sunday', 'Sunday, April 5, 2026');
  await syncDay('Mon, Apr 6', 'monday', 'Monday, April 6, 2026');

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log("Final Authority Sync complete. JSON and Briefings updated.");
}

finalSync().catch(console.error);
