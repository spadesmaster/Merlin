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
   * Formats the KPI string with dynamic emojis based on thresholds.
   */
  formatKPIs(stats = {}, showEmoticons = true) {
    const { win, sleep, leads, exercise } = stats;
    
    const isPending = (val) => !val || val === '[Pending]' || val === '0' || val === 0 || val === '0%';
    const allPending = isPending(win) && isPending(sleep) && isPending(leads) && isPending(exercise);

    if (!showEmoticons && allPending) return null;

    // Exercise Emojis: 0=☹️, <30=🚶, <60=🏃, <90=😊, 90+=🤩
    let exEmoji = showEmoticons ? '☹️' : '';
    const ex = parseInt(exercise) || 0;
    if (ex >= 90) exEmoji = showEmoticons ? '🤩' : '';
    else if (ex >= 60) exEmoji = showEmoticons ? '😊' : '';
    else if (ex >= 30) exEmoji = showEmoticons ? '🏃' : '';
    else if (ex > 0) exEmoji = showEmoticons ? '🚶' : '';

    // Lead Emojis: 0=☹️, >0=📈
    const leadEmoji = showEmoticons ? ((parseInt(leads) || 0) > 0 ? '📈' : '☹️') : '';
    
    const winVal = (win !== undefined && win !== null && win !== '[Pending]') ? win : null;
    const winStr = winVal !== null ? `${showEmoticons ? '🏆 ' : ''}${winVal}${winVal.toString().includes('%') ? '' : '%'}` : '[Pending]';
    
    const sleepVal = (sleep !== undefined && sleep !== null && sleep !== '[Pending]') ? sleep : null;
    const sleepStr = sleepVal !== null ? `${showEmoticons ? '💤 ' : ''}${sleepVal}` : '[Pending]';
    
    const leadStr = `${leadEmoji} ${leads || 0}`.trim();
    const exStr = `${exEmoji} ${exercise || 0}`.trim();

    return `📊 #KPIs | Win: ${winStr} | Sleep: ${sleepStr} | Leads: ${leadStr} | Exercise: ${exStr}`;
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
    
    // Store existing component values if not provided in 'data'
    const existingComponents = {};
    if (briefing) {
      const children = items.filter(i => i.prnt === briefing.id);
      children.forEach(child => {
        const nm = child.nm || '';
        if (nm.includes('Weather:') && !weather) existingComponents.weather = nm;
        if (nm.includes('Traffic:') && !traffic) existingComponents.traffic = nm;
        if (nm.includes('Events:') && !events) existingComponents.events = nm;
        if (nm.includes('#KPIs') && !kpis) existingComponents.kpis = nm;
      });
    }

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
    
    // Add components in order (prefer provided data if it exists or is explicitly null for removal)
    const getVal = (provided, existing) => (provided !== undefined) ? provided : existing;

    const kpiVal = getVal(kpis, existingComponents.kpis);
    const weatherVal = getVal(weather, existingComponents.weather);
    const trafficVal = getVal(traffic, existingComponents.traffic);
    const eventsVal = getVal(events, existingComponents.events);

    if (kpiVal) this.client.createNode(briefing.id, kpiVal, 0);
    if (weatherVal) this.client.createNode(briefing.id, weatherVal, 1);
    if (trafficVal) this.client.createNode(briefing.id, trafficVal, 2);
    if (eventsVal) this.client.createNode(briefing.id, eventsVal, 3);

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
   * Authority Sync: Pulls data from the Google Sheet 'Daily' tab and updates the JSON state and Briefings.
   * Handles a dynamic range of days starting from today.
   */
  async syncFromSheet(auth, spreadsheetId, statePath, daysAhead = 3) {
    const { google } = require('googleapis');
    const fs = require('fs');
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log(`[FACTORY] Starting Authority Sync from Sheet...`);
    
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Daily'!A1:N20" });
    const rows = res.data.values;
    if (!rows || rows.length === 0) return;

    const headers = rows[0];
    const getCol = (name) => headers.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()));
    
    const cols = { 
      date: 0, 
      win: getCol('Win'), 
      slp: getCol('Slp'), 
      job: getCol('Job'), 
      exer: getCol('Exer'), 
      ev: getCol('Events'), 
      war: getCol('Warrior'), 
      kng: getCol('King'), 
      viz: getCol('Vizier'), 
      luv: getCol('Lover'), 
      rog: getCol('Rogue'), 
      tnk: getCol('Tinker') 
    };

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    
    // Get current local date at midnight for comparison
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // We'll sync from Yesterday to Today + daysAhead
    for (let i = -1; i <= daysAhead; i++) {
      const targetDate = new Date(todayMidnight);
      targetDate.setDate(todayMidnight.getDate() + i);
      
      const isFuture = targetDate > todayMidnight;
      
      const dateStr = targetDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); // "Fri, Apr 3"
      const dateLong = targetDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); // "Friday, April 3, 2026"
      const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      
      const row = rows.find(r => r[0] && r[0].includes(dateStr));
      if (!row) continue;

      console.log(`[FACTORY] Syncing ${dateStr}...`);

      const missions = {};
      const roles = ['warrior', 'king', 'vizier', 'lover', 'rogue', 'tinker'];
      const roleMap = {
        warrior: 'war', king: 'kng', vizier: 'viz', 
        lover: 'luv', rogue: 'rog', tinker: 'tnk'
      };

      roles.forEach(role => {
        const colIdx = cols[roleMap[role]];
        if (colIdx !== undefined && colIdx !== -1 && row[colIdx]) {
          // Preserve existing GREEN status if already present in state
          const existingStatus = (state.missions[dayName] && state.missions[dayName][role]) 
            ? state.missions[dayName][role].status 
            : 'NONE';
          
          missions[role] = { 
            task: row[colIdx], 
            status: existingStatus 
          };
        }
      });

      state.missions[dayName] = missions;

      const missionLines = Object.keys(missions).map(role => this.formatMission(role, missions[role]));
      const kpiStr = this.formatKPIs({
        win: row[cols.win],
        sleep: row[cols.slp],
        leads: row[cols.job],
        exercise: row[cols.exer]
      }, !isFuture); // Omit emoticons for future dates

      const evStr = `📅 Events: ${row[cols.ev] || 'No Events'}`;
      
      // Weather Mapping
      let dailyWeather = null;
      if (dateStr.includes('Apr 3')) dailyWeather = '🌤️ Weather: 78/55 Clear/Sunny';
      else if (dateStr.includes('Apr 4')) dailyWeather = '☁️ Weather: 84/61 Mostly Cloudy/Warm';
      else if (dateStr.includes('Apr 5')) dailyWeather = '🌤️ Weather: 82/60 Sunny/Clear';
      else if (dateStr.includes('Apr 6')) dailyWeather = '⛅ Weather: 79/58 Partly Cloudy';
      
      await this.createOrUpdateBriefing(dateLong, {
        kpis: kpiStr,
        events: evStr,
        missions: missionLines,
        weather: dailyWeather // Apply specific weather for the requested range
      });
    }

    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log(`[FACTORY] Authority Sync complete.`);
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
