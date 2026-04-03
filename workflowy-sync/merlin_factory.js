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
   * Creates or updates an ultra-brief mission briefing node.
   * Mandates bolding for mission tasks and specific component order.
   */
  async createOrUpdateBriefing(dateStr, data = {}) {
    const { weather, traffic, events, missions, kpis, pmUpdate } = data;
    const items = await this.client.fetchTree();
    
    // Find existing briefing for this date
    let briefing = items.find(i => i.nm.includes(`#MissionBriefing - ${dateStr}`));
    
    if (!briefing) {
      const id = this.client.createNode(this.PARENTS.GOALS, `📋 #MissionBriefing - ${dateStr}`);
      briefing = { id, nm: `📋 #MissionBriefing - ${dateStr}` };
    } else {
      // Clean old children to ensure fresh order
      const children = items.filter(i => i.prnt === briefing.id);
      for (const child of children) {
        this.client.deleteNode(child.id);
      }
    }
    
    // Add components in order
    if (kpis) this.client.createNode(briefing.id, kpis, 0);
    if (weather) this.client.createNode(briefing.id, weather, 1);
    if (traffic) this.client.createNode(briefing.id, traffic, 2);
    if (events) this.client.createNode(briefing.id, events, 3);

    if (missions && Array.isArray(missions)) {
      missions.forEach((m, idx) => {
        this.client.createNode(briefing.id, m, idx + 4);
      });
    }

    if (pmUpdate) this.client.createNode(briefing.id, pmUpdate, 10);

    await this.client.push();
    await this.reorganizeGoals();
    
    return briefing.id;
  }

  /**
   * Creates an ultra-brief mission briefing node with KPIs, Weather, and Missions.
   */
  async createBriefing(dateStr, data = {}) {
    return this.createOrUpdateBriefing(dateStr, data);
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
