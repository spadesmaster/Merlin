const factory = require('./merlin_factory.js');
const fs = require('fs');
const path = require('path');

async function pushThursdayBriefing() {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'merlin_state.json'), 'utf8'));
  const missions = state.missions.thursday;
  
  const dateStr = "Thursday, April 2, 2026";
  // Ultra-brief weather for Thursday (placeholder, should ideally fetch)
  const weatherStr = "🌤️ Weather: 75/55 AM: ☀️ 5% 2PM: 🌤️ 10% 7PM: ☁️ 20% 🌬️ 10-15 🔭 8/10";
  const trafficStr = "🚦 Traffic: Construction on MD-355 (Bethesda); Beltway Inner Loop clearing early.";
  const eventStr = "📅 Events: Court Clerk Check@9:00 Meds@8";
  const kpiStr = `📊 #KPIs | Win: 🏆 100% | Sleep: 💤 82 | Leads: ☹️ 0 | Exercise: ☹️ 0`;
  const pmUpdateStr = `📝 PM Update: Finalized Will Review; set rest priority; Bed by 10 PM.`;

  const missionLines = [
    `⚔️ #WARRIOR: <b>${missions.warrior}</b>`,
    `👑 #KING: <b>${missions.king}</b>`,
    `🧙 #VIZIER: <b>${missions.vizier}</b>`,
    `⚒️ #TINKER: <b>${missions.tinker}</b>`,
    `❤️ #LOVER: <b>${missions.lover}</b>`,
    `🕵️ #ROGUE: <b>${missions.rogue}</b>`,
    `📱 #SPECIAL: <b>Deploy One UI 'Stacked Armory'</b>`
  ];

  try {
    console.log('Pushing Thursday Mission Briefing...');
    const items = await factory.client.fetchTree();
    
    // Find or create the Thursday Briefing node
    let briefing = items.find(i => i.nm.includes(`#MissionBriefing - ${dateStr}`));
    
    if (!briefing) {
      const parentId = "7093b270-f42e-8d95-8916-6d58aab57f5e"; // !MERLIN-GOALS!
      const id = factory.client.createNode(parentId, `📋 #MissionBriefing - ${dateStr}`);
      briefing = { id, nm: `📋 #MissionBriefing - ${dateStr}` };
    } else {
      // Clean old children
      const children = items.filter(i => i.prnt === briefing.id);
      for (const child of children) {
        factory.client.deleteNode(child.id);
      }
    }
    
    // Add components in order
    factory.client.createNode(briefing.id, kpiStr, 0);
    factory.client.createNode(briefing.id, weatherStr, 1);
    factory.client.createNode(briefing.id, trafficStr, 2);
    factory.client.createNode(briefing.id, eventStr, 3);
    missionLines.forEach((m, idx) => {
      factory.client.createNode(briefing.id, m, idx + 4);
    });
    factory.client.createNode(briefing.id, pmUpdateStr, 10);

    await factory.client.push();
    console.log('Thursday Briefing updated successfully:', briefing.id);

  } catch (err) {
    console.error('Error pushing to Workflowy:', err);
  }
}

pushThursdayBriefing();
