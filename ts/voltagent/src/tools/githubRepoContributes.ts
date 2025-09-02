import { createTool } from '@voltagent/core';
import { z } from 'zod';

/**
 * A tool for fetching github contributes for a given repo
 */
export const githubRepoContributesTool = createTool({
  name: 'fetchRepoContributors',
  description: 'Fetches the contributors for a given GitHub repository (owner/repo).',
  parameters: z.object({
    repo: z.string().describe('Repository name (e.g., "voltagent/core")'), // Repository name
  }),
  execute: async ({ repo }: { repo: string }) => {
    // TODO: Replace this mock with a real GitHub API call

    return {
      contributors: ['Tom Cruze', 'Mark Richards', 'Uncle Bob'], // Mock data
    };
  },
});
