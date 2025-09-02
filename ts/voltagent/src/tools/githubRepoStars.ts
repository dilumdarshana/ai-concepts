import { createTool } from '@voltagent/core';
import { z } from 'zod';

/**
 * A tool for fetching github stars for a given repo
 */
export const githubRepoStarsTool = createTool({
  name: 'fetchRepoStars',
  description: 'Fetches the star count for a given GitHub repository (owner/repo).',
  parameters: z.object({
    repo: z.string().describe('Repository name (e.g., "voltagent/core")'), // Repository name
  }),
  execute: async ({ repo }: { repo: string }) => {
    // TODO: Replace this mock with a real GitHub API call

    const stars = Math.floor(Math.random() * 5000); // Mock data

    return {
      stars,
      message: `The repository ${repo} has ${stars} stars.`
    };
  },
});
