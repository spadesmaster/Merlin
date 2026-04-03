const WorkflowyClient = require('./workflowy_client.js');

class MerlinFactory {
  constructor() {
    this.client = new WorkflowyClient();
    this.PARENTS = {
      GOALS: "7093b270-f42e-8d95-8916-6d58aab57f5e", // !MERLIN-GOALS!
      RAW_INBOX: "428d2830-b6f0-4152-f1c2-e4fe8e4cc1af" // !MERLIN-WORKING!
    };
  }

  /**
   * Formats a mission line with emojis, bolding, and color spans based on status.
   */
  formatMission(role, missionObj) {
    const emoji = { 
      warrior: '⚔️', king: '👑', vizier: '🧙', tinker: '⚒️', 
      lover: '❤️', rogue: '🕵️', bard: '🧚' 
    }[role.toLowerCase()] || '📝';

    let taskText = missionObj;
    let status = 'NONE';

    if (missionObj && typeof missionObj === 'object') {
      taskText = missionObj.task || '';
      status = (missionObj.status || 'NONE').toUpperCase();
    }

    const colorMap = {
      'RED': 'c-red',
      'GREEN': 'c-green',
      'YELLOW': 'c-yellow',
      'BLUE': 'c-blue',
      'PURPLE': 'c-purple'
    };

    const colorClass = (status === 'GREEN' || status === 'RED') ? colorMap[status] : null;
    const taskFormatted = colorClass 
      ? `<b><span class="colored ${colorClass}">${taskText}</span></b>` 
      : `<b>${taskText}</b>`;

    return `${emoji} #${role.toUpperCase()}: ${taskFormatted}`;
  }

  /**
   * Creates or updates an ultra-brief mission briefing node.
   */
  async createOrUpdateBriefing(dateStr, data = {}) {
    const { weather, traffic, events, missions, kpis, pmUpdate } = data;
    const items = await this.client.fetchTree();
    
    // Convert readable date like "Thursday, April 2, 2026" to "2026-04-02"
    // Handle both formats: "Thursday, April 2, 2026" and "April 2, 2026"
    const dateParts = dateStr.includes(',') ? dateStr.split(',').slice(1).join(',').trim() : dateStr;
    const d = new Date(dateParts);
    const isoDate = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '0000-00-00';
    
    const nodeName = `📋 #MissionBriefing - ${isoDate} (${dateStr})`;
    
    // Find existing briefing for this date (match by ISO or Name)
    let briefing = items.find(i => (i.nm || '').includes(`#MissionBriefing - ${isoDate}`));
    
    if (!briefing) {
      const id = this.client.createNode(this.PARENTS.GOALS, nodeName);
      briefing = { id, nm: nodeName };
    } else {
      // Update name to include the readable date if it changed
      if (briefing.nm !== nodeName) {
        this.client.editNode(briefing.id, nodeName);
      }
      // Clean old children
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
    const goalsNode = items.find(i => i.id === this.PARENTS.GOALS);
    if (!goalsNode) return;

    const children = items.filter(i => i.prnt === this.PARENTS.GOALS);

    const inboxes = children.filter(c => (c.nm || '').includes('📥'));
    const briefings = children.filter(c => (c.nm || '').includes('📋')).sort((a, b) => {
      // With ISO prefix "📋 #MissionBriefing - YYYY-MM-DD", 
      // simple reverse alphabetical sort works perfectly.
      return (b.nm || '').localeCompare(a.nm || '');
    });
    const others = children.filter(c => !(c.nm || '').includes('📥') && !(c.nm || '').includes('📋'));

    const sorted = [...inboxes, ...briefings, ...others];

    console.log(`[FACTORY] Reorganizing GOALS: ${inboxes.length} Inboxes, ${briefings.length} Briefings.`);

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
