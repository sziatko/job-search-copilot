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
    await prisma.application.deleteMany();
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

  it('record_application creates a placeholder vacancy when nothing matches', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Never Analyzed Co', title: 'Staff Engineer', matchScore: 72 },
    });
    const parsed = JSON.parse(textOf(result));
    expect(parsed.resolution).toBe('created-vacancy');
    expect(parsed.application.matchScore).toBe(72);
    expect(parsed.application.recommendation).toBe('APPLY');
  });

  it('record_application links to an analyzed vacancy and marks it APPLIED', async () => {
    const client = await connectedClient();
    const saved = await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });
    const { vacancy } = JSON.parse(textOf(saved));

    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'acme', title: 'backend engineer', salaryInListing: '130 PLN/h' },
    });
    expect(JSON.parse(textOf(recorded)).resolution).toBe('linked-existing');

    const got = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(got)).userAction).toBe('APPLIED');
  });

  it('list_applications filters by status and search', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Alpha Co', title: 'Dev', status: 'REJECTED' },
    });
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Beta Co', title: 'Dev' },
    });

    const rejected = await client.callTool({
      name: 'list_applications',
      arguments: { status: 'REJECTED' },
    });
    expect(JSON.parse(textOf(rejected)).total).toBe(1);

    const searched = await client.callTool({
      name: 'list_applications',
      arguments: { search: 'beta' },
    });
    expect(JSON.parse(textOf(searched)).total).toBe(1);
  });

  it('list_applications filters by company and title independently, AND-ed when both given', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Kappa Co', title: 'Backend Engineer' },
    });
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Kappa Co', title: 'Frontend Lead' },
    });

    const byCompany = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'kappa' },
    });
    expect(JSON.parse(textOf(byCompany)).total).toBe(2);

    const byTitle = await client.callTool({
      name: 'list_applications',
      arguments: { title: 'lead' },
    });
    expect(JSON.parse(textOf(byTitle)).total).toBe(1);

    const byBoth = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'kappa', title: 'backend' },
    });
    expect(JSON.parse(textOf(byBoth)).total).toBe(1);
  });

  it('update_application_status moves the pipeline stage; isError for an unknown id', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Gamma Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

    const updated = await client.callTool({
      name: 'update_application_status',
      arguments: { id: application.id, status: 'INTERVIEW' },
    });
    expect(JSON.parse(textOf(updated)).status).toBe('INTERVIEW');

    const missing = await client.callTool({
      name: 'update_application_status',
      arguments: { id: 999_999, status: 'INTERVIEW' },
    });
    expect(missing.isError).toBe(true);
  });

  it('update_application_status appends statusComment across calls', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Delta Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

    const first = await client.callTool({
      name: 'update_application_status',
      arguments: {
        id: application.id,
        status: 'RECRUITER_SCREEN',
        statusComment: 'Recruiter called.',
      },
    });
    expect(JSON.parse(textOf(first)).statusComment).toBe('Recruiter called.');

    const second = await client.callTool({
      name: 'update_application_status',
      arguments: { id: application.id, status: 'INTERVIEW', statusComment: 'Interview on 20.09.' },
    });
    expect(JSON.parse(textOf(second)).statusComment).toBe(
      'Recruiter called. / Interview on 20.09.',
    );
  });

  it('update_application_status matches by company + title, e.g. from a rejection email', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Epsilon Co', title: 'Dev' },
    });

    const updated = await client.callTool({
      name: 'update_application_status',
      arguments: {
        company: 'epsilon co',
        title: 'DEV',
        status: 'REJECTED',
        statusComment: 'Rejection email received.',
      },
    });
    const parsed = JSON.parse(textOf(updated));
    expect(parsed.status).toBe('REJECTED');
    expect(parsed.statusComment).toBe('Rejection email received.');
  });

  it('update_application_status isError for an unmatched company/title', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'update_application_status',
      arguments: { company: 'Nobody Inc', title: 'Ghost Role', status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });

  it('update_application_status isError for two vacancies matching the same company/title', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Zeta Co', title: 'Dev' },
    });
    await client.callTool({
      name: 'save_estimated_vacancy',
      arguments: {
        ...validArgs,
        company: 'Zeta Co',
        title: 'Dev',
        applyUrl: 'https://example.com/z2',
      },
    });

    const result = await client.callTool({
      name: 'update_application_status',
      arguments: { company: 'Zeta Co', title: 'Dev', status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });

  it('update_application_status isError when neither id nor company+title is given', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'update_application_status',
      arguments: { status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });
});
