const { authorize, getHeaderMap } = require('./manager.js');
const { google } = require('googleapis');
require('dotenv').config({ path: './.env' });

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

async function checkStatus() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const ranges = ["'All Tasks'!A1:G1000", "'Completed'!A1:H1000"];
  const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges });
  
  const allTasks = res.data.valueRanges[0].values || [];
  const completedTasks = res.data.valueRanges[1].values || [];

  const allMap = getHeaderMap(allTasks[0]);
  const compMap = getHeaderMap(completedTasks[0]);

  const missionTasks = [
    { label: "⚔️ WARRIOR: Tidy Van", keywords: ["Tidy Van", "Clean Van", "Van", "Truck"] },
    { label: "👑 KING: Judge letter, M/C photo shop appts", keywords: ["Judge", "Motorcycle", "Cycle Gear", "Cycle", "Bike"] },
    { label: "🧙 VIZIER: Daily Standup", keywords: ["Daily Standup", "Sync", "Calendar", "Checklist", "Briefing"] },
    { label: "❤️ LOVER: Mail/Checks", keywords: ["Mail", "Checks", "Deposit"] },
    { label: "🕵️ ROGUE: AirTag/MO/Fedex", keywords: ["AirTag", "Money Order", "Fedex", "Package"] }
  ];

  console.log("\nMission Progress Summary (Mar 31, 2026):");
  
  missionTasks.forEach(mission => {
    let completedCount = 0;
    let pendingCount = 0;
    let details = [];

    const processRow = (row, map, statusLabel) => {
      const name = row[map.name] || "";
      if (mission.keywords.some(k => name.toLowerCase().includes(k.toLowerCase()))) {
        const rowStatus = row[map.status] || statusLabel;
        if (rowStatus === "Complete" || rowStatus === "Completed") completedCount++;
        else pendingCount++;
        details.push(`  - [${rowStatus}] ${name}`);
      }
    };

    for (let i = 1; i < allTasks.length; i++) processRow(allTasks[i], allMap, "Pending");
    for (let i = 1; i < completedTasks.length; i++) processRow(completedTasks[i], compMap, "Complete");

    console.log(`\n${mission.label}: ${completedCount} Completed / ${pendingCount} Pending`);
    if (details.length > 0) {
      details.forEach(d => console.log(d));
    } else {
      console.log("  - No matching tasks found.");
    }
  });
}

checkStatus().catch(console.error);
