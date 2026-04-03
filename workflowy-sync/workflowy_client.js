const axios = require('axios');
require('dotenv').config({ path: __dirname + '/.env' });

class WorkflowyClient {
  constructor() {
    this.sessionId = process.env.WORKFLOWY_SESSION_ID;
    this.operations = [];
  }

  generateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async fetchTree() {
    const response = await axios.get('https://workflowy.com/get_tree_data/', {
      headers: { Cookie: `sessionid=${this.sessionId}` },
    });
    return response.data.items;
  }

  createNode(parentId, name, priority = 0) {
    const nodeId = this.generateGuid();
    this.operations.push({ type: 'create', data: { projectid: nodeId, parentid: parentId, priority } });
    if (name) {
      this.operations.push({ type: 'edit', data: { projectid: nodeId, name } });
    }
    return nodeId;
  }

  editNode(nodeId, name) {
    this.operations.push({ type: 'edit', data: { projectid: nodeId, name } });
  }

  completeNode(nodeId) {
    this.operations.push({ type: 'complete', data: { projectid: nodeId } });
  }

  uncompleteNode(nodeId) {
    this.operations.push({ type: 'uncomplete', data: { projectid: nodeId } });
  }

  moveNode(nodeId, parentId, priority = 0) {
    this.operations.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify([nodeId]), parentid: parentId, priority } });
  }

  bulkMoveNodes(nodeIds, parentId, priority = 0) {
    this.operations.push({ type: 'bulk_move', data: { projectids_json: JSON.stringify(nodeIds), parentid: parentId, priority } });
  }

  deleteNode(nodeId) {
    this.operations.push({ type: 'delete', data: { projectid: nodeId } });
  }

  async push() {
    if (this.operations.length === 0) return;

    const initResponse = await axios.get('https://workflowy.com/get_initialization_data', {
      headers: { Cookie: `sessionid=${this.sessionId}` }
    });
    const { projectTreeData } = initResponse.data;
    const { clientId, dateJoinedTimestamp } = projectTreeData;
    const ownerId = projectTreeData.mainProjectTreeInfo.ownerId;
    const lastId = projectTreeData.mainProjectTreeInfo.initialMostRecentOperationTransactionId;

    const pushPollData = [];
    if (projectTreeData.auxiliaryProjectTreeInfos) {
      projectTreeData.auxiliaryProjectTreeInfos.forEach(info => {
        pushPollData.push({ most_recent_operation_transaction_id: info.initialMostRecentOperationTransactionId.toString(), share_id: info.shareId });
      });
    }

    pushPollData.push({
      most_recent_operation_transaction_id: lastId.toString(),
      operations: this.operations.map(op => ({
        ...op,
        client_timestamp: Math.floor(Date.now() / 1000) - dateJoinedTimestamp
      })),
    });

    const payload = new URLSearchParams();
    payload.append('client_id', clientId);
    payload.append('client_version', '28');
    payload.append('push_poll_id', Math.random().toString(36).substring(2, 10));
    payload.append('push_poll_data', JSON.stringify(pushPollData));
    payload.append('crosscheck_user_id', ownerId.toString());

    const response = await axios.post('https://workflowy.com/push_and_poll', payload, {
      headers: { Cookie: `sessionid=${this.sessionId}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (response.data.results && response.data.results.includes('error')) {
      throw new Error('Workflowy push failed: ' + JSON.stringify(response.data.results));
    }

    this.operations = [];
    return response.data.results[0].new_most_recent_operation_transaction_id;
  }
}

module.exports = WorkflowyClient;
