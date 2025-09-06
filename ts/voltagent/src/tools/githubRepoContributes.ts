import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * A tool for fetching github contributes for a given repo
 */
export const githubRepoContributesTool = createTool({
  name: 'fetchRepoContributors',
  description: 'Fetches the contributors for a given GitHub repository (owner/repo).',
  parameters: z.object({
    owner: z.string().describe('Owner of the repository (e.g., "voltagent")'), // Repository owner
    repo: z.string().describe('Repository name (e.g., "voltagent/core")'), // Repository name
  }),
  execute: async ({ repo, owner }: { repo: string, owner: string }) => {
    try {
      const response = await octokit.repos.listContributors({
        owner,
        repo,
      });

      const contributors = response.data.map((contributor) => ({
        login: contributor.login,
        contributions: contributor.contributions,
      }));

      return {
        success: true,
        contributors,
        message: `Repository ${owner}/${repo} has ${contributors.length} contributors.`,
        details: contributors,
      };
    } catch (error) {
      return {
        success: false,
        contributors: [],
        message: `Error fetching contributors for ${owner}/${repo}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
