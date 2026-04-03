const factory = require('./merlin_factory.js');
const fs = require('fs');
const path = require('path');

async function pushThursdayBriefing() {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'merlin_state.json'), 'utf8'));
  const missions = state.missions.thursday;
  
  const dateStr = "Thursday, April 2, 2026";
  const weatherStr = "🌤️ Weather: 75/55 AM: ☀️ 5% 2PM: 🌤️ 10% 7PM: ☁️ 20% 🌬️ 10-15 🔭 8/10";
  const trafficStr = "🚦 Traffic: Construction on MD-355 (Bethesda); Beltway Inner Loop clearing early.";
  const eventStr = "📅 Events: Court Clerk Check@9:00 Meds@8";
  const kpiStr = `📊 #KPIs | Win: 🏆 40% | Sleep: 💤 82 | Leads: ☹️ 0 | Exercise: ☹️ 0`;
  const pmUpdateStr = `📝 PM Update: Completed VB League and Honda Research; Deferred Van/Mail to Friday.`;

  const getStyledTask = (m) => {
    const colorClass = m.status === 'GREEN' ? 'bg-green' : 'bg-red';
    return `<span class="colored ${colorClass}"><b>${m.task}</b></span>`;
  };

  const missionNodes = [
    { name: `⚔️ #WARRIOR: ${getStyledTask(missions.warrior)}` },
    { 
      name: `👑 #KING: ${getStyledTask(missions.king)}`,
      children: missions.king.subtasks
    },
    { 
      name: `🧙 #VIZIER: ${getStyledTask(missions.vizier)}`,
      children: missions.vizier.subtasks
    },
    { name: `⚒️ #TINKER: ${getStyledTask(missions.tinker)}` },
    { name: `❤️ #LOVER: ${getStyledTask(missions.lover)}` },
    { name: `🕵️ #ROGUE: ${getStyledTask(missions.rogue)}` }
  ];

  try {
    console.log('Pushing Styled Thursday Mission Briefing...');
    const items = await factory.client.fetchTree();
    
    let briefing = items.find(i => i.nm.includes(`#MissionBriefing - ${dateStr}`));
    
    if (!briefing) {
      const parentId = "7093b270-f42e-8d95-8916-6d58aab57f5e";
      const id = factory.client.createNode(parentId, `📋 #MissionBriefing - ${dateStr}`);
      briefing = { id, nm: `📋 #MissionBriefing - ${dateStr}` };
    } else {
      const children = items.filter(i => i.prnt === briefing.id);
      for (const child of children) {
        factory.client.deleteNode(child.id);
      }
    }
    
    factory.client.createNode(briefing.id, kpiStr, 0);
    factory.client.createNode(briefing.id, weatherStr, 1);
    factory.client.createNode(briefing.id, trafficStr, 2);
    factory.client.createNode(briefing.id, eventStr, 3);
    
    missionNodes.forEach((m, idx) => {
      const nodeId = factory.client.createNode(briefing.id, m.name, idx + 4);
      if (m.children) {
        m.children.forEach((child, cIdx) => {
          factory.client.createNode(nodeId, child, cIdx);
        });
      }
    });
    
    factory.client.createNode(briefing.id, pmUpdateStr, 10);

    await factory.client.push();
    console.log('Styled Thursday Briefing updated successfully:', briefing.id);

  } catch (err) {
    console.error('Error pushing to Workflowy:', err);
  }
}

pushThursdayBriefing();
