#!/bin/bash
# Start both the Founder Autonomous Agent and the Incentives Data Collector
# Usage: pm2 start agent/start_agent.sh --name founder-agents

cd "$(dirname "$0")/.."

# Load environment
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "Starting Founder Autonomous Agent..."
npx tsx agent/FounderAutonomousAgent.ts &

echo "Starting Incentives Data Collector..."
npx tsx agent/IncentivesDataCollector.ts &

wait
