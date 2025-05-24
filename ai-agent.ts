#!/usr/bin/env node

import { InteractiveAIAgent } from "./interactive-cli";




// Main execution
async function main() {
  const agent = new InteractiveAIAgent();
  await agent.start();
}

// Run the agent
main().catch(error => {
  console.error(`❌ Fatal error: ${error.message}`);
  process.exit(1);
});