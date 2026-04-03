const factory = require('./merlin_factory.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: __dirname + '/.env' });

const INBOX_PATH = "/mnt/c/Users/spade/OneDrive/Documents/ToMerlin";

/**
 * Shadow Commander: Monitors Workflowy directives and the "ToMerlin" drop zone.
 */
async function watchSystem() {
  console.log('🚀 Shadow Commander active. Monitoring for #COMMAND nodes...');
  
  while (true) {
    try {
      const items = await factory.client.fetchTree();
      const consoleNode = items.find(i => (i.nm || '').includes('!MERLIN-COMMANDS!'));
      
      if (consoleNode) {
        const commands = items.filter(i => i.prnt === consoleNode.id && i.nm.includes('#COMMAND') && !i.cp);
        for (const cmdNode of commands) {
          const cmdText = cmdNode.nm.replace('#COMMAND', '').trim();
          console.log(`[SHADOW] Received Command: ${cmdText}`);
          
          // 1. RESEARCH COMMAND
          if (cmdText.toLowerCase().startsWith('research:')) {
            const topic = cmdText.replace(/research:/i, '').trim();
            console.log(`[SHADOW] Starting background research on: ${topic}`);
            
            // We simulate the research by creating a background placeholder
            // In a real scenario, this would trigger a separate script or API call
            fs.appendFileSync(path.join(__dirname, 'research_log.txt'), `\n[${new Date().toISOString()}] Researching: ${topic}`);
            
            factory.client.createNode(cmdNode.id, `🕒 Research in progress... results will appear in ToMerlin/Processed`, 0);
          } 
          // 2. SYNC COMMAND
          else if (cmdText.toLowerCase().includes('sync')) {
            const { sync } = require('./sync.js');
            await sync();
          } 

          factory.client.completeNode(cmdNode.id);
          await factory.client.push();
          console.log(`[SHADOW] Command "${cmdText}" marked COMPLETE.`);
        }
      }

      // --- DROP ZONE MONITORING ---
      if (fs.existsSync(INBOX_PATH)) {
        const files = fs.readdirSync(INBOX_PATH).filter(f => f !== 'Processed');
        for (const file of files) {
          const fullPath = path.join(INBOX_PATH, file);
          if (fs.lstatSync(fullPath).isFile()) {
            console.log(`[SHADOW] Ingesting: ${file}`);
            const hudNode = items.find(i => (i.nm || '').includes('!MERLIN-RAW-INBOX-BEFORE-SYNC!'));
            if (hudNode) {
              factory.client.createNode(hudNode.id, `📂 NEW FILE: ${file}`, 0);
              await factory.client.push();
              const processedDir = path.join(INBOX_PATH, 'Processed');
              if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir);
              fs.renameSync(fullPath, path.join(processedDir, file));
            }
          }
        }
      }

    } catch (err) {
      console.error(`[SHADOW] Cycle Error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

watchSystem().catch(console.error);
