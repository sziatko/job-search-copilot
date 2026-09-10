import { getPrisma } from '@job-search-copilot/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createServer } from './server';

// Connects a real MCP Client to createServer() over an in-memory transport pair
// (the SDK's own recommended way to test a server) instead of spawning stdio —
// exercises the actual registerTool handlers, input schemas, and error shapes.
async function connectedClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === 'text')?.text ?? '';
}

const validArgs = {
  company: 'Acme',
  title: 'Backend Engineer',
  applyUrl: 'https://example.com/jobs/1',
  fullText: 'Full vacancy text goes here.',
  matchScore: 80,
  recommendation: 'ПОДАВАТИСЯ',
  estimationComment: 'Strong match.',
};

describe('job-search-copilot MCP server', () => {
  const prisma = getPrisma();

  afterEach(async () => {
    await prisma.estimatedVacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('save_estimated_vacancy normalizes the Ukrainian recommendation and persists it', async () => {
    const client = await connectedClient();
    const saveResult = await client.callTool({
      name: 'save_estimated_vacancy',
      arguments: validArgs,
    });
    const { created, vacancy } = JSON.parse(textOf(saveResult));
    expect(created).toBe(true);
    expect(vacancy.recommendation).toBe('APPLY');
    expect(vacancy.userAction).toBe('NOT_REVIEWED');

    const getResult = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(getResult)).applyUrl).toBe(validArgs.applyUrl);
  });

  it('save_estimated_vacancy reports created:false and drops the analysis on a re-save', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });

    const again = await client.callTool({
      name: 'save_estimated_vacancy',
      arguments: { ...validArgs, matchScore: 5, estimationComment: 'changed' },
    });
    const { created, vacancy } = JSON.parse(textOf(again));
    expect(created).toBe(false);
    expect(vacancy.matchScore).toBe(80);
    expect(vacancy.estimationComment).toBe('Strong match.');
  });

  it('get_estimated_vacancy reports isError for an unknown id', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: 999_999 },
    });
    expect(result.isError).toBe(true);
  });

  it('list_estimated_vacancies returns saved vacancies without fullText', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });

    const result = await client.callTool({ name: 'list_estimated_vacancies', arguments: {} });
    const { items, total } = JSON.parse(textOf(result));
    expect(total).toBe(1);
    expect(items[0]).not.toHaveProperty('fullText');
  });

  it('update_estimated_vacancy_user_action updates userAction', async () => {
    const client = await connectedClient();
    const saveResult = await client.callTool({
      name: 'save_estimated_vacancy',
      arguments: validArgs,
    });
    const { vacancy } = JSON.parse(textOf(saveResult));

    const updateResult = await client.callTool({
      name: 'update_estimated_vacancy_user_action',
      arguments: { id: vacancy.id, userAction: 'DECLINED' },
    });
    expect(JSON.parse(textOf(updateResult)).userAction).toBe('DECLINED');
  });

  it('update_estimated_vacancy_user_action reports isError for an unknown id', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'update_estimated_vacancy_user_action',
      arguments: { id: 999_999, userAction: 'DECLINED' },
    });
    expect(result.isError).toBe(true);
  });
});
