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
    const { success, vacancy } = JSON.parse(textOf(saveResult));
    expect(success).toBe(true);
    expect(vacancy.company).toBe('Acme');
    expect(vacancy.title).toBe('Backend Engineer');

    const getResult = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    const full = JSON.parse(textOf(getResult));
    expect(full.applyUrl).toBe(validArgs.applyUrl);
    expect(full.recommendation).toBe('APPLY');
    expect(full.userAction).toBe('NOT_REVIEWED');
  });

  it('save_estimated_vacancy reports success:false and drops the analysis on a re-save', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });

    const again = await client.callTool({
      name: 'save_estimated_vacancy',
      arguments: { ...validArgs, matchScore: 5, estimationComment: 'changed' },
    });
    const { success, vacancy } = JSON.parse(textOf(again));
    expect(success).toBe(false);
    expect(vacancy.company).toBe('Acme');

    const got = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    const full = JSON.parse(textOf(got));
    expect(full.matchScore).toBe(80);
    expect(full.estimationComment).toBe('Strong match.');
  });

  it('save_estimated_vacancies_batch saves a mixed batch and skips a duplicate applyUrl', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });

    const batchResult = await client.callTool({
      name: 'save_estimated_vacancies_batch',
      arguments: {
        vacancies: [
          validArgs, // duplicate applyUrl — should be skipped
          { ...validArgs, applyUrl: 'https://example.com/jobs/2', title: 'Frontend Engineer' },
        ],
      },
    });
    const items = JSON.parse(textOf(batchResult));
    expect(items).toHaveLength(2);
    expect(items[0].success).toBe(false);
    expect(items[0].vacancy.company).toBe('Acme');
    expect(items[0].vacancy.id).toBeTypeOf('number');
    expect(items[1].success).toBe(true);
    expect(items[1].vacancy.title).toBe('Frontend Engineer');

    const list = await client.callTool({ name: 'list_estimated_vacancies', arguments: {} });
    expect(JSON.parse(textOf(list)).total).toBe(2);
  });

  it('save_estimated_vacancies_batch rejects an empty or oversized array', async () => {
    const client = await connectedClient();
    const empty = await client.callTool({
      name: 'save_estimated_vacancies_batch',
      arguments: { vacancies: [] },
    });
    expect(empty.isError).toBe(true);

    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      ...validArgs,
      applyUrl: `https://example.com/jobs/${i}`,
    }));
    const oversized = await client.callTool({
      name: 'save_estimated_vacancies_batch',
      arguments: { vacancies: tooMany },
    });
    expect(oversized.isError).toBe(true);
  });

  it('record_applications_batch records a mixed batch in one call', async () => {
    const client = await connectedClient();
    const batchResult = await client.callTool({
      name: 'record_applications_batch',
      arguments: {
        applications: [
          { company: 'Batch Co', title: 'Backend Engineer' },
          { company: 'Batch Co', title: 'Frontend Engineer', matchScore: 65 },
        ],
      },
    });
    const items = JSON.parse(textOf(batchResult));
    expect(items).toHaveLength(2);
    expect(items[0].success).toBe(true);
    expect(items[0].application.title).toBe('Backend Engineer');
    expect(items[1].application.title).toBe('Frontend Engineer');

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Batch Co' },
    });
    expect(JSON.parse(textOf(list)).total).toBe(2);
  });

  it('record_applications_batch rolls back the whole batch if one item fails', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Existing Co', title: 'Dev' },
    });

    const result = await client.callTool({
      name: 'record_applications_batch',
      arguments: {
        applications: [
          { company: 'Never Inserted Co', title: 'Dev' },
          { company: 'Existing Co', title: 'Dev' }, // already has an application — fails
        ],
      },
    });
    expect(result.isError).toBe(true);

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Never Inserted Co' },
    });
    expect(JSON.parse(textOf(list)).total).toBe(0);
  });

  it('record_applications_batch rejects an empty or oversized array', async () => {
    const client = await connectedClient();
    const empty = await client.callTool({
      name: 'record_applications_batch',
      arguments: { applications: [] },
    });
    expect(empty.isError).toBe(true);

    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      company: `Co ${i}`,
      title: 'Dev',
    }));
    const oversized = await client.callTool({
      name: 'record_applications_batch',
      arguments: { applications: tooMany },
    });
    expect(oversized.isError).toBe(true);
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

  it('list tools enforce their own paging ceilings and reject what falls outside them', async () => {
    // `pagination(maxLimit)` is the one abstraction the tool refactor introduced,
    // and the two list tools differ only in that number. Nothing else exercises
    // the bounds — every other call goes through at the defaults.
    const client = await connectedClient();

    const atVacancyCeiling = await client.callTool({
      name: 'list_estimated_vacancies',
      arguments: { limit: 100 },
    });
    expect(atVacancyCeiling.isError).toBeFalsy();

    for (const limit of [0, -1, 101]) {
      const result = await client.callTool({
        name: 'list_estimated_vacancies',
        arguments: { limit },
      });
      expect(result.isError, `limit ${limit} should be rejected`).toBe(true);
    }

    // 500 is inside one tool's ceiling and outside the other's, which is the
    // reason the ceiling is a parameter rather than a shared constant.
    const applicationsAt500 = await client.callTool({
      name: 'list_applications',
      arguments: { limit: 500 },
    });
    expect(applicationsAt500.isError).toBeFalsy();

    const applicationsAt501 = await client.callTool({
      name: 'list_applications',
      arguments: { limit: 501 },
    });
    expect(applicationsAt501.isError).toBe(true);
  });

  it('list_estimated_vacancies pages with limit and offset without shrinking total', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'save_estimated_vacancies_batch',
      arguments: {
        vacancies: [1, 2, 3, 4, 5].map((i) => ({
          ...validArgs,
          applyUrl: `https://example.com/jobs/${i}`,
          title: `Role ${i}`,
        })),
      },
    });

    const page = await client.callTool({
      name: 'list_estimated_vacancies',
      arguments: { limit: 2, offset: 1 },
    });
    const body = JSON.parse(textOf(page));

    // `total` is the match count, not the size of the page — the same contract the
    // web app leans on to use `limit=1` as a count endpoint.
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(5);
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
    const body = JSON.parse(textOf(updateResult));
    expect(body.success).toBe(true);
    expect(body.vacancy.id).toBe(vacancy.id);

    const got = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(got)).userAction).toBe('DECLINED');
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
    expect(parsed.success).toBe(true);
    expect(parsed.application.company).toBe('Never Analyzed Co');
    expect(parsed.application.title).toBe('Staff Engineer');

    const list = await client.callTool({
      name: 'list_estimated_vacancies',
      arguments: { company: 'Never Analyzed Co' },
    });
    const { items } = JSON.parse(textOf(list));
    expect(items[0].matchScore).toBe(72);
    expect(items[0].recommendation).toBe('APPLY');
  });

  it('record_application links to an analyzed vacancy and marks it APPLIED', async () => {
    const client = await connectedClient();
    const saved = await client.callTool({ name: 'save_estimated_vacancy', arguments: validArgs });
    const { vacancy } = JSON.parse(textOf(saved));

    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'acme', title: 'backend engineer', salaryInListing: '130 PLN/h' },
    });
    expect(JSON.parse(textOf(recorded)).success).toBe(true);

    const got = await client.callTool({
      name: 'get_estimated_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(got)).userAction).toBe('APPLIED');

    const list = await client.callTool({ name: 'list_estimated_vacancies', arguments: {} });
    expect(JSON.parse(textOf(list)).total).toBe(1); // linked, no new vacancy created
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
    const body = JSON.parse(textOf(updated));
    expect(body.success).toBe(true);
    expect(body.application.id).toBe(application.id);
    expect(body.application.company).toBe('Gamma Co');

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Gamma Co' },
    });
    expect(JSON.parse(textOf(list)).items[0].status).toBe('INTERVIEW');

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

    await client.callTool({
      name: 'update_application_status',
      arguments: {
        id: application.id,
        status: 'RECRUITER_SCREEN',
        statusComment: 'Recruiter called.',
      },
    });
    const afterFirst = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Delta Co' },
    });
    expect(JSON.parse(textOf(afterFirst)).items[0].statusComment).toBe('Recruiter called.');

    await client.callTool({
      name: 'update_application_status',
      arguments: { id: application.id, status: 'INTERVIEW', statusComment: 'Interview on 20.09.' },
    });
    const afterSecond = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Delta Co' },
    });
    expect(JSON.parse(textOf(afterSecond)).items[0].statusComment).toBe(
      'Recruiter called. / Interview on 20.09.',
    );
  });

  it('update_application_status matches by company + title, e.g. from a rejection email', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Epsilon Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

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
    expect(parsed.success).toBe(true);
    expect(parsed.application.id).toBe(application.id);
    expect(parsed.application.company).toBe('Epsilon Co');

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Epsilon Co' },
    });
    const item = JSON.parse(textOf(list)).items[0];
    expect(item.status).toBe('REJECTED');
    expect(item.statusComment).toBe('Rejection email received.');
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
