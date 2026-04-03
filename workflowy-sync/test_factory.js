const MerlinFactory = require('./merlin_factory.js');

async function test() {
  console.log("Testing MerlinFactory...");
  
  try {
    const inboxId = await MerlinFactory.createInbox("Test Factory Integration", [
      "Verify WorkflowyClient GUID generation",
      "Verify MerlinFactory node nesting",
      "Confirm transaction pushing"
    ]);
    
    console.log(`Successfully created test inbox with ID: ${inboxId}`);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
