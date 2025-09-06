import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * A tool for fetching github stars for a given repo
 */
export const githubRepoStarsTool = createTool({
  name: 'fetchRepoStars',
  description: 'Fetches the star count for a given GitHub repository (owner/repo).',
  parameters: z.object({
    owner: z.string().describe('Owner of the repository (e.g., "voltagent")'), // Repository owner
    repo: z.string().describe('Repository name (e.g., "voltagent/core")'), // Repository name
  }),
  execute: async ({ repo, owner }: { repo: string, owner: string }) => {
    try {
      const response = await octokit.repos.get({
        owner,
        repo,
      });
      return {
        success: true,
        stars: response.data.stargazers_count,
        message: `Repository ${owner}/${repo} has ${response.data.stargazers_count} stars.`,
      };
    } catch (error) {
      return {
        success: false,
        stars: 0,
        message: `Error fetching stars for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
