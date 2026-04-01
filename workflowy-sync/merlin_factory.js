const WorkflowyClient = require('./workflowy_client.js');

class MerlinFactory {
  constructor() {
    this.client = new WorkflowyClient();
    this.PARENTS = {
      GOALS: "7093b270-f42e-8d95-8916-6d58aab57f5e", // !MERLIN-GOALS!
      RAW_INBOX: "428d2830-b6f0-4152-f1c2-e4fe8e4cc1af" // !MERLIN-RAW-INBOX-BEFORE-SYNC!
    };
  }

  /**
   * Creates an ultra-brief mission briefing node with KPIs, Weather, and Missions.
   * Mandates bolding for mission tasks and specific component order.
   */
  async createBriefing(dateStr, data = {}) {
    const { weather, traffic, events, missions, kpis, pmUpdate } = data;
    
    // Create header: 📋 #MissionBriefing - Wednesday, April 1, 2026
    const briefingId = this.client.createNode(this.PARENTS.GOALS, `📋 #MissionBriefing - ${dateStr}`);
    
    // 1. KPIs at the top
    if (kpis) this.client.createNode(briefingId, kpis, 0);
    
    // 2. Weather (Ultra-brief: 🌤️ Weather: 83/61 AM: ☁️ 10% 2PM: 🌦️ 45-65% 7PM: 🌧️ 70% 🌬️ 15-25 🔭 1/10)
    if (weather) this.client.createNode(briefingId, weather, 1);
    
    // 3. Traffic (Metro-only, no bus)
    if (traffic) this.client.createNode(briefingId, traffic, 2);
    
    // 4. Events
    if (events) this.client.createNode(briefingId, events, 3);

    // 5. Missions (Role-based, bolded tasks)
    if (missions && Array.isArray(missions)) {
      missions.forEach((m, idx) => {
        this.client.createNode(briefingId, m, idx + 4);
      });
    }

    // 6. PM Update (Notes from previous day)
    if (pmUpdate) this.client.createNode(briefingId, pmUpdate, 10);

    await this.client.push();
    
    // Ensure this briefing is at the top of the briefings list (below inboxes)
    await this.reorganizeGoals();
    
    return briefingId;
  }

  /**
   * Creates a bolded action item starting with 📥 at the top of GOALS.
   */
  async createActionItem(name) {
    const boldName = `<b>📥 ${name}</b>`;
    const nodeId = this.client.createNode(this.PARENTS.GOALS, boldName);
    await this.client.push();
    await this.reorganizeGoals();
    return nodeId;
  }

  /**
   * Reorganizes the GOALS node: Inboxes (📥) at top, Briefings (📋) in reverse-chronological order.
   */
  async reorganizeGoals() {
    const items = await this.client.fetchTree();
    const children = items.filter(i => i.prnt === this.PARENTS.GOALS);
    
    const inboxes = children.filter(c => c.nm.includes('📥'));
    const briefings = children.filter(c => c.nm.includes('📋')).sort((a,b) => b.nm.localeCompare(a.nm));
    
    const sorted = [...inboxes, ...briefings];
    
    // Force order by moving each to their respective index
    for (let i = 0; i < sorted.length; i++) {
      this.client.moveNode(sorted[i].id, this.PARENTS.GOALS, i);
    }
    
    await this.client.push();
  }

  /**
   * Updates the HUD node with Metro and road-only info.
   */
  async updateHUD(content) {
    const items = await this.client.fetchTree();
    const hudNode = items.find(i => (i.nm || '').includes('!MERLIN-RAW-INBOX-BEFORE-SYNC!'));
    
    if (!hudNode) return;

    const childIds = items.filter(i => i.prnt === hudNode.id).map(i => i.id);
    childIds.forEach(id => this.client.deleteNode(id));
    
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.trim()) {
        this.client.createNode(hudNode.id, line, idx);
      }
    });

    await this.client.push();
  }
}

module.exports = new MerlinFactory();
