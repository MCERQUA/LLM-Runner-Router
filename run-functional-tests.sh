#!/bin/bash

# 🧠 LLM Router Functional Test Runner
# Automatically loads environment and runs functional tests

set -e

BASE_URL="${BASE_URL:-http://localhost:3006}"

echo "🧠 Loading environment and running LLM Router functional tests..."

# Load API key from .env.test file (for testing)
if [ -f ".env.test" ]; then
    export $(grep -v '^#' .env.test | xargs)
    echo "✅ Loaded test configuration from .env.test"
elif [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
    echo "✅ Loaded configuration from .env"
else
    echo "❌ No .env.test or .env file found. Please create one with API_KEY set."
    exit 1
fi

# Set the API key for the functional tests
export ROUTER_API_KEY="$API_KEY"

echo "🚀 Starting functional tests against server (${BASE_URL})"
echo "🔑 Using API key: ${API_KEY:0:20}..."
echo ""

# Run the functional tests
./functional-llm-router-tests.sh