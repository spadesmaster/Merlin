const fs = require('fs');
const path = require('path');

const ARMORY_CONFIG_PATH = path.join(__dirname, '../assets/armory_config.json');

function getArmoryConfig() {
    if (!fs.existsSync(ARMORY_CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(ARMORY_CONFIG_PATH, 'utf8'));
}

/**
 * Suggests training based on a tool name.
 */
function suggestTraining(toolName) {
    const config = getArmoryConfig();
    const suggestions = [];

    if (toolName.toLowerCase().includes('good lock')) {
        suggestions.push({
            tool: "Good Lock / Home Up",
            objective: "Advanced Grid Optimization",
            suggestion: "Practice navigating a 7x7 grid; verify folder accessibility in 4x4.",
            lead: "Boni (The Navigator)"
        });
        suggestions.push({
            tool: "Sound Assistant",
            objective: "Multi-sound Mastery",
            suggestion: "Test simultaneous audio streams with Bluetooth vs. Phone Speaker.",
            lead: "Dan (The Bard)"
        });
    }

    if (toolName.toLowerCase().includes('unity')) {
        suggestions.push({
            tool: "Unity Editor",
            objective: "Scene Navigation",
            suggestion: "Review keyboard shortcuts for fast layout switching.",
            lead: "Nyx (The Sorcerer)"
        });
    }

    return suggestions;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const tool = args[0] || 'Good Lock';
    console.log(`Training suggestions for ${tool}:`);
    console.log(JSON.stringify(suggestTraining(tool), null, 2));
}

module.exports = { suggestTraining };
