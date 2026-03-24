const { WorkFlowy } = require('workflowy');

/**
 * Workflowy Client Wrapper
 */
class WorkflowyClient {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.wf = new WorkFlowy();
  }

  /**
   * Fetches all nodes under a specific branch ID.
   */
  async getNodes(branchId) {
    await this.wf.login({ sessionid: this.sessionId });
    const nodes = await this.wf.getNodes();
    
    // Recursive search for the branch ID
    const findNode = (list, id) => {
      for (const node of list) {
        if (node.id === id || node.id.startsWith(id)) return node;
        if (node.children) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const targetNode = findNode(nodes, branchId);
    return targetNode ? targetNode.children : [];
  }
}

module.exports = WorkflowyClient;
