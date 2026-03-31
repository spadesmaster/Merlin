const WorkflowyClient = require('./workflowy_client.js');

class MerlinFactory {
  constructor() {
    this.client = new WorkflowyClient();
    this.PARENTS = {
      GOALS: "7093b270-f42e-8d95-8916-6d58aab57f5e", // !MERLIN-GOALS!
      RAW_INBOX: "7da491bf-25ab-443b-648b-8a7da491bf25" // Example, verify if needed
    };
  }

  /**
   * Creates a mission briefing node with events and role-based missions.
   */
  async createBriefing(dateStr, events, missions) {
    const briefingId = this.client.createNode(this.PARENTS.GOALS, `📋 #MissionBriefing - ${dateStr}`);
    
    if (events) {
      this.client.createNode(briefingId, `**Events:** ${events}`);
    }

    missions.forEach((mission, idx) => {
      this.client.createNode(briefingId, mission, idx + 1);
    });

    await this.client.push();
    return briefingId;
  }

  /**
   * Creates an inbox node with subtasks.
   */
  async createInbox(name, subtasks = []) {
    const inboxId = this.client.createNode(this.PARENTS.GOALS, `📥 Inbox - ${name}`);
    
    subtasks.forEach((task, idx) => {
      this.client.createNode(inboxId, task, idx);
    });

    await this.client.push();
    return inboxId;
  }

  /**
   * Updates or creates a KPI node.
   */
  async updateKPIs(dateStr, stats) {
    const kpiId = this.client.createNode(this.PARENTS.GOALS, `📊 #KPIs - ${dateStr}`);
    
    Object.entries(stats).forEach(([label, value], idx) => {
      this.client.createNode(kpiId, `${label}: ${value}`, idx);
    });

    await this.client.push();
    return kpiId;
  }

  /**
   * Overwrites the HUD node with new content.
   */
  async updateHUD(content) {
    const items = await this.client.fetchTree();
    const hudNode = items.find(i => (i.nm || '').includes('!MERLIN-RAW-INBOX-BEFORE-SYNC!'));
    
    if (!hudNode) {
      console.error("HUD Node '!MERLIN-RAW-INBOX-BEFORE-SYNC!' not found.");
      return;
    }

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
