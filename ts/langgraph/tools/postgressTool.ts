import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

// Get user by name tool
export const getUserByName = tool(
  async ({ name } : { name: string }) => {
    console.log('Start calling getUserByName tool...', name);
  
    try {
      const users = await prisma.user.findMany({
        where: {
          name: {
            contains: name,
            mode: 'insensitive',
          }
        }
      });
      return users.length > 0 ? JSON.stringify(users) : `No users found with the name ${name}`;
  
    } catch (error) {
      console.error('Error searching user ny name', error);
      return 'Failed to search users by name';
    }
  }, 
  {
    name: 'getUserByName',
    description: 'Search for users by name from taskify database (case insensitive, partial mathces',
    schema: z.object({
      name: z.string().describe('The name for search')
    }) as any,
  }
);

// Get all users tool
export const getAllUsers = tool(
  async () => {
    console.log('Start calling getAllUsers tool...');

    try {
      const users = await prisma.user.findMany();

      return users.length > 0 ? JSON.stringify(users) : `No users found with the table`;
  
    } catch (error) {
      console.error('Error searching all users', error);
      return 'Failed to search all users';
    }
  },
  {
    name: 'getAllUsers',
    description: 'Search for all users in the table',
    schema: {},
  }
);
