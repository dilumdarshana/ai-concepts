import 'dotenv/config';
import VoltAgent, { Agent } from '@voltagent/core';
import { VercelAIProvider } from '@voltagent/vercel-ai';
import { openai } from '@ai-sdk/openai';
import { githubRepoContributesTool, githubRepoStarsTool } from './tools';

// Agent to analyze repository stars
const starsFetcherAgent = new Agent({
  name: 'StarsFetcher',
  description: 'Fetches the number of stars for a GitHub repository using a tool.',
  llm: new VercelAIProvider(),
  model: openai('gpt-4o-mini'),
  tools: [githubRepoStarsTool],
});

// Agent to analyze repository contributors
const contributorsFetcherAgent = new Agent({
  name: 'ContributorsFetcher',
  description: 'Fetches the list of contributors for a GitHub repository using a tool.',
  llm: new VercelAIProvider(),
  model: openai('gpt-4o-mini'),
  tools: [githubRepoContributesTool],
});

// Agent to analyse and provide insights based on stars and contributors
// This agent doesn't need tools; it processes data provided by the supervisor.
const analyserAgent = new Agent({
  name: 'RepoAnalyser',
  description: 'Analyses repository statistics (stars, contributors) and provides insights.',
  llm: new VercelAIProvider(),
  model: openai('gpt-4o-mini'),
});

const supervisorAgent = new Agent({
  name: 'Supervisor',
  description: `You are a GitHub repository analyser. When given a GitHub repository URL or owner/repo format, you will:
  1. Extract the owner/repo name.
  2. Use the StarsFetcher agent to get the repository's star count.
  3. Use the ContributorsFetcher agent to get the repository's contributors.
  4. Pass the collected data (stars, contributors) to the RepoAnalyzer agent.
  5. Return the analysis provided by the RepoAnalyzer.

  Example input: https://github.com/vercel/ai-sdk or vercel/ai-sdk`,
  llm: new VercelAIProvider(),
  model: openai('gpt-4o-mini'),
  subAgents: [starsFetcherAgent, contributorsFetcherAgent, analyserAgent],
});

// Create the VoltAgent system with the supervisor agent
// Here only expose the supervisor externally.
// The supervisor will internally call the other agents.
new VoltAgent({
  agents: {
    supervisor: supervisorAgent,
  },
});

console.log('GitHub Repo Analyzer Agent system started.');
