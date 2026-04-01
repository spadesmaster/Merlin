const factory = require('./merlin_factory.js');
const fs = require('fs');
const path = require('path');

async function pushWednesdayBriefing() {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'merlin_state.json'), 'utf8'));
  const missions = state.missions.wednesday;
  
  const dateStr = "Wednesday, April 1, 2026";
  const weatherStr = "🌤️ Weather: Chevy Chase: 83°F/61°F. Morning: Dry (10% rain). Afternoon: Light rain starts (45-65% chance). Winds: 15-25mph gusts.";
  const trafficStr = "🚦 Traffic: Rain impact on I-495/I-270; Construction on Wisconsin Ave NW (Friendship Heights)";
  const eventStr = "📅 Events: Meds@8 Men's@8:40 Fedex@11 VB@7";
  const kpiStr = `📊 #KPIs | Win: 🏆 20% | Sleep: [Pending] | Leads: ☹️ 0 | Exercise: ☹️ 0`;
  const pmUpdateStr = `📝 PM Update: Finalized Judge Letter (Physics/EMT defense); reviewed Will; cleared Drop Zone.`;

  const missionLines = [
    `⚔️ #WARRIOR: <b>Judge letter / Tidy Van</b>`,
    `👑 #KING: <b>Glue MC decals, air tires, find chgr</b>`,
    `🧙 #VIZIER: <b>Costco / Walmart / Adv Auto</b>`,
    `❤️ #LOVER: <b>Mail/Checks and MC photos</b>`,
    `🕵️ #ROGUE: <b>Confirm and attend VB @ 7</b>`
  ];

  try {
    console.log('Pushing Mission Briefing...');
    // We already have the node from the previous run, let's just find it and update its children
    const items = await factory.client.fetchTree();
    const briefing = items.find(i => i.nm.includes('#MissionBriefing - Wednesday, April 1, 2026'));
    
    if (briefing) {
      // Clean old children to ensure fresh order and content
      const children = items.filter(i => i.prnt === briefing.id);
      for (const child of children) {
        factory.client.deleteNode(child.id);
      }
      
      // Add components in order
      factory.client.createNode(briefing.id, kpiStr, 0);
      factory.client.createNode(briefing.id, weatherStr, 1);
      factory.client.createNode(briefing.id, trafficStr, 2);
      factory.client.createNode(briefing.id, eventStr, 3);
      missionLines.forEach((m, idx) => {
        factory.client.createNode(briefing.id, m, idx + 4);
      });
      factory.client.createNode(briefing.id, pmUpdateStr, 9);

      await factory.client.push();
      console.log('Briefing updated successfully:', briefing.id);
    } else {
      console.error('Wednesday Briefing node not found for update.');
    }

  } catch (err) {
    console.error('Error pushing to Workflowy:', err);
  }
}

pushWednesdayBriefing();
