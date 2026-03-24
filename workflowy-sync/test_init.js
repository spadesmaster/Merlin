const axios = require('axios');
const SESSION_ID = 'ogow136jzsc3a71fukl1sraf168lcad6';

async function pushOperation(op) {
  // To push, we need a clientId and a most_recent_operation_transaction_id
  // Let's get them from get_initialization_data
  const initResponse = await axios.get('https://workflowy.com/get_initialization_data/', {
    headers: { Cookie: `sessionid=${SESSION_ID}` }
  });
  const initData = initResponse.data;
  const clientId = initData.projected_operation_transaction_id; // Just a guess, let's look at the data
  const lastId = initData.most_recent_operation_transaction_id;

  console.log('Init Data:', JSON.stringify(initData, null, 2));
}

pushOperation().catch(console.error);
