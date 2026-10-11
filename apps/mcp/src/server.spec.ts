import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from './server';

/** The user the server acts as (ADR-0038): a real row, its vacancies' owner. */
const userId = randomUUID();

// Connects a real MCP Client to createServer() over an in-memory transport pair
// (the SDK's own recommended way to test a server) instead of spawning stdio —
// exercises the actual registerTool handlers, input schemas, and error shapes.
async function connectedClient() {
  const server = createServer({ userId });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === 'text')?.text ?? '';
}

/** A vacancy intake took in (NEW, unanalysed); returns its id. */
async function queued(url: string, fullText?: string): Promise<number> {
  await new VacancyIntakeService().intake(userId, {
    url,
    company: 'Queued Co',
    title: url,
    fullText,
  });
  return (await getPrisma().vacancy.findFirstOrThrow({ where: { applyUrl: url } })).id;
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

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, name: 'Test User', email: `${userId}@example.com` },
    });
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('save_vacancy normalizes the Ukrainian recommendation and persists it', async () => {
    const client = await connectedClient();
    const saveResult = await client.callTool({
      name: 'save_vacancy',
      arguments: validArgs,
    });
    const { success, vacancy } = JSON.parse(textOf(saveResult));
    expect(success).toBe(true);
    expect(vacancy.company).toBe('Acme');
    expect(vacancy.title).toBe('Backend Engineer');

    const getResult = await client.callTool({
      name: 'get_vacancy',
      arguments: { id: vacancy.id },
    });
    const full = JSON.parse(textOf(getResult));
    expect(full.applyUrl).toBe(validArgs.applyUrl);
    expect(full.recommendation).toBe('APPLY');
    expect(full.status).toBe('NOT_REVIEWED');
    expect(full.comments).toMatchObject([{ source: 'ANALYZER', body: 'Strong match.' }]);
  });

  it('sends the cross-tool rules as its instructions', async () => {
    const client = await connectedClient();
    const instructions = client.getInstructions() ?? '';
    expect(instructions).toContain('intake_vacancy before analysing');
    expect(instructions).toContain('update_vacancy_status');
  });

  it('registers exactly the fifteen tools', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_comment',
      'get_vacancies_batch',
      'get_vacancy',
      'intake_vacancies_batch',
      'intake_vacancy',
      'list_applications',
      'list_vacancies',
      'record_application',
      'record_applications_batch',
      'save_vacancies_batch',
      'save_vacancy',
      'submit_analyses_batch',
      'submit_analysis',
      'update_application',
      'update_vacancy_status',
    ]);
  });

  // The skills in skills/ call these tools by name and are uploaded to claude.ai by
  // hand, so a rename here leaves them calling a tool that no longer exists — silently.
  // They live in a separate private repo cloned into skills/ (gitignored): without
  // that clone (CI, a fresh checkout) there is nothing to check.
  const skillsDir = path.resolve(import.meta.dirname, '../../../skills');
  it.skipIf(!existsSync(skillsDir))('every JSC tool a skill names is registered', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((t) => t.name));

    // ponytail: a tool is recognised by its noun (`<verb>_vacanc…/application…/analys…`);
    // one named after another noun goes unchecked — widen the pattern when one appears.
    const referenced = readdirSync(skillsDir, { withFileTypes: true })
      // A skill is a folder with a SKILL.md — not the clone's own .git.
      .filter((entry) => existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
      .flatMap((entry) => {
        const text = readFileSync(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8');
        return [...text.matchAll(/`([a-z]+_(?:vacanc|application|analys)[a-z_]*)`/g)].map(
          (m) => `${entry.name}: ${m[1]}`,
        );
      });

    expect(referenced.length).toBeGreaterThan(0);
    expect(referenced.filter((ref) => !registered.has(ref.split(': ')[1]))).toEqual([]);
  });

  // The email sync maps each Gmail label to a status in a table (`| label | \`STATUS\` |`):
  // a status the server no longer takes would fail only on the day such an email comes.
  it.skipIf(!existsSync(skillsDir))(
    'every status a skill table maps to is one update_vacancy_status takes',
    async () => {
      const client = await connectedClient();
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'update_vacancy_status');
      const status = tool?.inputSchema.properties?.status as { enum: string[] } | undefined;
      const accepted = status?.enum ?? [];

      const mapped = readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
        .flatMap((entry) => {
          const text = readFileSync(path.join(skillsDir, entry.name, 'SKILL.md'), 'utf8');
          return [...text.matchAll(/\| `([A-Z_]+)`/g)].map((m) => m[1]);
        });

      expect(mapped).toContain('AWAITING');
      expect(mapped.filter((status) => !accepted.includes(status))).toEqual([]);
    },
  );

  it('works the analysis queue: list NEW with text → get_vacancies_batch → submit_analyses_batch', async () => {
    const client = await connectedClient();
    // Intake stores posting text from 200 characters (a shorter one is a login wall).
    const one = 'Posting one. '.padEnd(200, 'x');
    const two = 'Posting two. '.padEnd(200, 'x');
    await queued('https://example.com/q/1', one);
    await queued('https://example.com/q/2', two);
    await queued('https://example.com/q/3'); // no text: not in the queue

    const listed = await client.callTool({
      name: 'list_vacancies',
      arguments: { status: ['NEW'], hasText: true },
    });
    const { items, total } = JSON.parse(textOf(listed));
    expect(total).toBe(2);
    const ids = items.map((item: { id: number }) => item.id);

    const got = await client.callTool({ name: 'get_vacancies_batch', arguments: { ids } });
    expect(
      JSON.parse(textOf(got))
        .map((v: { fullText: string }) => v.fullText)
        .sort(),
    ).toEqual([one, two]);

    const submitted = await client.callTool({
      name: 'submit_analyses_batch',
      arguments: {
        analyses: [
          { id: ids[0], matchScore: 80, recommendation: 'ПОДАВАТИСЯ', estimationComment: 'Fits.' },
          { id: ids[1], matchScore: 20, recommendation: 'SKIP', estimationComment: 'Backend.' },
        ],
      },
    });
    expect(JSON.parse(textOf(submitted))).toMatchObject([
      { success: true, vacancy: { id: ids[0] } },
      { success: true, vacancy: { id: ids[1] } },
    ]);
    const statuses = await prisma.vacancy.findMany({ where: { id: { in: ids } } });
    expect(Object.fromEntries(statuses.map((v) => [v.id, v.status]))).toEqual({
      [ids[0]]: 'NOT_REVIEWED',
      [ids[1]]: 'FILTERED_OUT',
    });
  });

  it('submit_analysis isError for a vacancy already analysed', async () => {
    const client = await connectedClient();
    const id = await queued('https://example.com/q/1');
    const args = { id, matchScore: 80, recommendation: 'APPLY', estimationComment: 'Fits.' };

    const first = await client.callTool({ name: 'submit_analysis', arguments: args });
    expect(JSON.parse(textOf(first))).toEqual({
      success: true,
      vacancy: { id, company: 'Queued Co', title: 'https://example.com/q/1' },
    });
    const again = await client.callTool({
      name: 'submit_analysis',
      arguments: { ...args, matchScore: 10 },
    });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toContain('already analysed');
  });

  it('get_vacancies_batch and submit_analyses_batch cap at 10; an unknown id isError', async () => {
    const client = await connectedClient();
    const ids = Array.from({ length: 11 }, (_, i) => i + 1);
    const tooMany = await client.callTool({ name: 'get_vacancies_batch', arguments: { ids } });
    expect(tooMany.isError).toBe(true);
    const oversized = await client.callTool({
      name: 'submit_analyses_batch',
      arguments: {
        analyses: ids.map((id) => ({
          id,
          matchScore: 1,
          recommendation: 'SKIP',
          estimationComment: '',
        })),
      },
    });
    expect(oversized.isError).toBe(true);

    const unknown = await client.callTool({
      name: 'get_vacancies_batch',
      arguments: { ids: [999_999] },
    });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain('999999 not found');
  });

  it('save_vacancy attaches the analysis to a vacancy intake created: success true', async () => {
    const client = await connectedClient();
    const id = await queued(validArgs.applyUrl);
    const saved = await client.callTool({ name: 'save_vacancy', arguments: validArgs });
    expect(JSON.parse(textOf(saved))).toMatchObject({ success: true, vacancy: { id } });
    expect((await prisma.vacancy.findUniqueOrThrow({ where: { id } })).status).toBe('NOT_REVIEWED');
  });

  it('save_vacancy reports success:false and drops the analysis on a re-save', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_vacancy', arguments: validArgs });

    const again = await client.callTool({
      name: 'save_vacancy',
      arguments: { ...validArgs, matchScore: 5, estimationComment: 'changed' },
    });
    const { success, vacancy } = JSON.parse(textOf(again));
    expect(success).toBe(false);
    expect(vacancy.company).toBe('Acme');

    const got = await client.callTool({
      name: 'get_vacancy',
      arguments: { id: vacancy.id },
    });
    const full = JSON.parse(textOf(got));
    expect(full.matchScore).toBe(80);
    expect(full.estimationComment).toBe('Strong match.');
  });

  it('save_vacancies_batch saves a mixed batch and skips a duplicate applyUrl', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_vacancy', arguments: validArgs });

    const batchResult = await client.callTool({
      name: 'save_vacancies_batch',
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

    const list = await client.callTool({ name: 'list_vacancies', arguments: {} });
    expect(JSON.parse(textOf(list)).total).toBe(2);
  });

  it('save_vacancies_batch rejects an empty or oversized array', async () => {
    const client = await connectedClient();
    const empty = await client.callTool({
      name: 'save_vacancies_batch',
      arguments: { vacancies: [] },
    });
    expect(empty.isError).toBe(true);

    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      ...validArgs,
      applyUrl: `https://example.com/jobs/${i}`,
    }));
    const oversized = await client.callTool({
      name: 'save_vacancies_batch',
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

  it('get_vacancy reports isError for an unknown id', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'get_vacancy',
      arguments: { id: 999_999 },
    });
    expect(result.isError).toBe(true);
  });

  it('list_vacancies returns saved vacancies without fullText', async () => {
    const client = await connectedClient();
    await client.callTool({ name: 'save_vacancy', arguments: validArgs });

    const result = await client.callTool({ name: 'list_vacancies', arguments: {} });
    const { items, total } = JSON.parse(textOf(result));
    expect(total).toBe(1);
    expect(items[0]).not.toHaveProperty('fullText');
  });

  it('list tools enforce their own paging ceilings and reject what falls outside them', async () => {
    // The two list tools differ only in `pagination(maxLimit)`'s number. Nothing
    // else exercises the bounds — every other call goes through at the defaults.
    const client = await connectedClient();

    const atVacancyCeiling = await client.callTool({
      name: 'list_vacancies',
      arguments: { limit: 100 },
    });
    expect(atVacancyCeiling.isError).toBeFalsy();

    for (const limit of [0, -1, 101]) {
      const result = await client.callTool({
        name: 'list_vacancies',
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

  it('list_vacancies pages with limit and offset without shrinking total', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'save_vacancies_batch',
      arguments: {
        vacancies: [1, 2, 3, 4, 5].map((i) => ({
          ...validArgs,
          applyUrl: `https://example.com/jobs/${i}`,
          title: `Role ${i}`,
        })),
      },
    });

    const page = await client.callTool({
      name: 'list_vacancies',
      arguments: { limit: 2, offset: 1 },
    });
    const body = JSON.parse(textOf(page));

    // `total` is the match count, not the size of the page — the same contract the
    // web app leans on to use `limit=1` as a count endpoint.
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(5);
    // The web's cursor paging (ADR-0030) does not leak into the tool's output.
    expect(Object.keys(body)).toEqual(['items', 'total']);
  });

  it('update_vacancy_status triages a vacancy; list_vacancies filters by several statuses', async () => {
    const client = await connectedClient();
    const saveResult = await client.callTool({
      name: 'save_vacancy',
      arguments: validArgs,
    });
    const { vacancy } = JSON.parse(textOf(saveResult));
    await client.callTool({
      name: 'save_vacancy',
      arguments: { ...validArgs, applyUrl: 'https://example.com/jobs/2' },
    });

    const updateResult = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { id: vacancy.id, status: 'SAVED_FOR_LATER' },
    });
    const body = JSON.parse(textOf(updateResult));
    expect(body.success).toBe(true);
    expect(body.vacancy.id).toBe(vacancy.id);

    const got = await client.callTool({
      name: 'get_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(got)).status).toBe('SAVED_FOR_LATER');

    // A triage repeat carries no event: refused.
    const repeat = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { id: vacancy.id, status: 'SAVED_FOR_LATER' },
    });
    expect(repeat.isError).toBe(true);
    expect(textOf(repeat)).toContain('already SAVED_FOR_LATER');

    const saved = await client.callTool({
      name: 'list_vacancies',
      arguments: { status: ['SAVED_FOR_LATER', 'DECLINED'] },
    });
    expect(JSON.parse(textOf(saved)).total).toBe(1);
    const applications = await client.callTool({ name: 'list_applications', arguments: {} });
    expect(JSON.parse(textOf(applications)).total).toBe(0);
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
      name: 'list_vacancies',
      arguments: { company: 'Never Analyzed Co' },
    });
    const { items } = JSON.parse(textOf(list));
    expect(items[0].matchScore).toBe(72);
    expect(items[0].recommendation).toBe('APPLY');
  });

  it('record_application links to an analyzed vacancy and moves it to APPLIED', async () => {
    const client = await connectedClient();
    const saved = await client.callTool({ name: 'save_vacancy', arguments: validArgs });
    const { vacancy } = JSON.parse(textOf(saved));

    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'acme', title: 'backend engineer', salaryInApplication: '130 PLN/h' },
    });
    const { success, application } = JSON.parse(textOf(recorded));
    expect(success).toBe(true);
    expect(application.id).toBe(vacancy.id);

    const got = await client.callTool({
      name: 'get_vacancy',
      arguments: { id: vacancy.id },
    });
    expect(JSON.parse(textOf(got))).toMatchObject({
      status: 'APPLIED',
      salaryInApplication: '130 PLN/h',
    });

    const again = await client.callTool({
      name: 'record_application',
      arguments: { company: 'acme', title: 'backend engineer' },
    });
    expect(again.isError).toBe(true);

    const list = await client.callTool({ name: 'list_vacancies', arguments: {} });
    expect(JSON.parse(textOf(list)).total).toBe(1); // linked, no new vacancy created
  });

  it('record_application takes a vacancyId instead of company + title, never both', async () => {
    const client = await connectedClient();
    const saved = await client.callTool({ name: 'save_vacancy', arguments: validArgs });
    const { vacancy } = JSON.parse(textOf(saved));

    const both = await client.callTool({
      name: 'record_application',
      arguments: { vacancyId: vacancy.id, company: 'Acme', title: 'Backend Engineer' },
    });
    expect(both.isError).toBe(true);
    const neither = await client.callTool({ name: 'record_application', arguments: {} });
    expect(neither.isError).toBe(true);

    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { vacancyId: vacancy.id, salaryInApplication: '130 PLN/h' },
    });
    expect(JSON.parse(textOf(recorded)).application.id).toBe(vacancy.id);
    const got = await client.callTool({ name: 'get_vacancy', arguments: { id: vacancy.id } });
    expect(JSON.parse(textOf(got))).toMatchObject({
      status: 'APPLIED',
      salaryInApplication: '130 PLN/h',
    });
  });

  it('list_applications finds an application by the posting link from an email', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'save_vacancy',
      arguments: { ...validArgs, applyUrl: 'https://www.linkedin.com/jobs/view/3900000001/' },
    });
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Acme', title: 'Backend Engineer' },
    });

    const found = await client.callTool({
      name: 'list_applications',
      arguments: { applyUrl: 'https://www.linkedin.com/comm/jobs/view/3900000001/?trk=eml' },
    });
    expect(JSON.parse(textOf(found)).items.map((i: { company: string }) => i.company)).toEqual([
      'Acme',
    ]);
  });

  it('list_applications filters by status and search, and rejects a triage status', async () => {
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

    const triage = await client.callTool({
      name: 'list_applications',
      arguments: { status: 'DECLINED' },
    });
    expect(triage.isError).toBe(true);
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

  it('update_vacancy_status moves the pipeline stage; isError for an unknown id', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Gamma Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

    const updated = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { id: application.id, status: 'INTERVIEW' },
    });
    const body = JSON.parse(textOf(updated));
    expect(body.success).toBe(true);
    expect(body.vacancy.id).toBe(application.id);
    expect(body.vacancy.company).toBe('Gamma Co');

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Gamma Co' },
    });
    expect(JSON.parse(textOf(list)).items[0].status).toBe('INTERVIEW');

    const missing = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { id: 999_999, status: 'INTERVIEW' },
    });
    expect(missing.isError).toBe(true);
  });

  it("record_application's comment is USER; update_vacancy_status's are AGENT", async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Delta Co', title: 'Dev', comment: 'Applied via referral.' },
    });
    const { application } = JSON.parse(textOf(recorded));

    await client.callTool({
      name: 'update_vacancy_status',
      arguments: {
        id: application.id,
        status: 'RECRUITER_SCREEN',
        comment: 'Recruiter called.',
      },
    });
    await client.callTool({
      name: 'update_vacancy_status',
      arguments: { id: application.id, status: 'INTERVIEW', comment: 'Interview on 20.09.' },
    });
    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Delta Co' },
    });
    expect(
      JSON.parse(textOf(list)).items[0].comments.map((c: { source: string; body: string }) => [
        c.source,
        c.body,
      ]),
    ).toEqual([
      ['USER', 'Applied via referral.'],
      ['AGENT', 'Recruiter called.'],
      ['AGENT', 'Interview on 20.09.'],
    ]);
  });

  it('update_vacancy_status matches by company + title, e.g. from a rejection email', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Epsilon Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

    const updated = await client.callTool({
      name: 'update_vacancy_status',
      arguments: {
        company: 'epsilon co',
        title: 'DEV',
        status: 'REJECTED',
        comment: 'Rejection email received.',
      },
    });
    const parsed = JSON.parse(textOf(updated));
    expect(parsed.success).toBe(true);
    expect(parsed.vacancy.id).toBe(application.id);
    expect(parsed.vacancy.company).toBe('Epsilon Co');

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Epsilon Co' },
    });
    const item = JSON.parse(textOf(list)).items[0];
    expect(item.status).toBe('REJECTED');
    expect(item.comments).toMatchObject([{ source: 'AGENT', body: 'Rejection email received.' }]);
  });

  it('update_vacancy_status isError for an unmatched company/title', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { company: 'Nobody Inc', title: 'Ghost Role', status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });

  it('update_vacancy_status isError for a vacancy that was never applied to', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'save_vacancy',
      arguments: { ...validArgs, company: 'Eta Co', title: 'Dev' },
    });
    const result = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { company: 'Eta Co', title: 'Dev', status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('not found');
  });

  it('update_vacancy_status isError for two applied vacancies matching the same company/title', async () => {
    const client = await connectedClient();
    await client.callTool({
      name: 'record_application',
      arguments: { company: 'Zeta Co', title: 'Dev' },
    });
    const saved = await client.callTool({
      name: 'save_vacancy',
      arguments: {
        ...validArgs,
        company: 'Zeta Co',
        title: 'Dev',
        applyUrl: 'https://example.com/z2',
      },
    });
    await client.callTool({
      name: 'record_application',
      arguments: { vacancyId: JSON.parse(textOf(saved)).vacancy.id },
    });

    const result = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { company: 'Zeta Co', title: 'Dev', status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });

  it('update_vacancy_status isError when neither id nor company+title is given', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'update_vacancy_status',
      arguments: { status: 'REJECTED' },
    });
    expect(result.isError).toBe(true);
  });
  it('update_application edits salary and CV flag only; isError for an unknown id', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Eta Co', title: 'Dev', salaryInApplication: '100 PLN/h' },
    });
    const { application } = JSON.parse(textOf(recorded));

    const updated = await client.callTool({
      name: 'update_application',
      arguments: { id: application.id, usedTailoredResume: true },
    });
    expect(JSON.parse(textOf(updated))).toEqual({
      success: true,
      application: { id: application.id, company: 'Eta Co', title: 'Dev' },
    });
    expect(await prisma.vacancy.findUniqueOrThrow({ where: { id: application.id } })).toMatchObject(
      { salaryInApplication: '100 PLN/h', usedTailoredResume: true, status: 'APPLIED' },
    );

    await client.callTool({
      name: 'update_application',
      arguments: { id: application.id, salaryInApplication: '' },
    });
    expect(
      (await prisma.vacancy.findUniqueOrThrow({ where: { id: application.id } }))
        .salaryInApplication,
    ).toBeNull();

    const missing = await client.callTool({
      name: 'update_application',
      arguments: { id: 999_999, usedTailoredResume: true },
    });
    expect(missing.isError).toBe(true);
  });

  it('add_comment adds an AGENT comment by default, or a USER one, without a status move', async () => {
    const client = await connectedClient();
    const recorded = await client.callTool({
      name: 'record_application',
      arguments: { company: 'Theta Co', title: 'Dev' },
    });
    const { application } = JSON.parse(textOf(recorded));

    await client.callTool({
      name: 'add_comment',
      arguments: { id: application.id, body: 'Email from recruiter.' },
    });
    const added = await client.callTool({
      name: 'add_comment',
      arguments: { id: application.id, body: 'My own note.', source: 'USER' },
    });
    expect(JSON.parse(textOf(added)).vacancy.id).toBe(application.id);

    const list = await client.callTool({
      name: 'list_applications',
      arguments: { company: 'Theta Co' },
    });
    const [item] = JSON.parse(textOf(list)).items;
    expect(item.status).toBe('APPLIED');
    expect(item.comments.map((c: { source: string; body: string }) => [c.source, c.body])).toEqual([
      ['AGENT', 'Email from recruiter.'],
      ['USER', 'My own note.'],
    ]);

    for (const arguments_ of [
      { id: 999_999, body: 'x' },
      { id: application.id, body: '   ' },
    ]) {
      const result = await client.callTool({ name: 'add_comment', arguments: arguments_ });
      expect(result.isError).toBe(true);
    }
  });

  it('intake_vacancy creates a new posting as a NEW vacancy, then reports a duplicate', async () => {
    const client = await connectedClient();
    const url = 'https://pl.linkedin.com/jobs/view/engineer-at-acme-3900000001?trk=x';
    const first = await client.callTool({
      name: 'intake_vacancy',
      arguments: { url, company: 'Acme', title: 'Engineer', source: 'linkedin' },
    });
    expect(JSON.parse(textOf(first))).toEqual({ new: true });
    expect(await prisma.vacancy.findFirstOrThrow()).toMatchObject({
      status: 'NEW',
      source: 'linkedin',
      recommendation: null,
    });

    const again = await client.callTool({
      name: 'intake_vacancy',
      arguments: { url: 'https://www.linkedin.com/jobs/view/3900000001', company: 'X', title: 'Y' },
    });
    expect(JSON.parse(textOf(again))).toEqual({ new: false });
  });

  it('intake_vacancy isError without a url, company or title, or with a non-http url', async () => {
    const client = await connectedClient();
    for (const args of [
      { company: 'Acme', title: 'Dev' },
      { url: 'https://acme.com/jobs/1' },
      { url: 'https://acme.com/jobs/1', company: ' ', title: 'Dev' },
      { url: 'javascript:alert(1)', company: 'Acme', title: 'Dev' },
    ]) {
      expect((await client.callTool({ name: 'intake_vacancy', arguments: args })).isError).toBe(
        true,
      );
    }
    expect(await prisma.vacancy.count()).toBe(0);
  });

  it('intake_vacancies_batch returns the raw urls of the new entries', async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: 'intake_vacancies_batch',
      arguments: {
        entries: [
          { url: 'https://acme.com/jobs/1?utm_source=x', company: 'Acme', title: 'QA' },
          { url: 'https://acme.com/jobs/1#apply', company: 'Acme', title: 'QA' },
          { url: 'https://acme.com/jobs/9', company: 'Acme Ltd', title: 'QA' },
          { url: 'https://acme.com/jobs/2', company: 'Acme', title: 'Dev', source: 'justjoin' },
        ],
      },
    });
    expect(JSON.parse(textOf(result))).toEqual({
      new: ['https://acme.com/jobs/1?utm_source=x', 'https://acme.com/jobs/2'],
    });
  });

  it('intake_vacancies_batch rejects the whole call on an entry without a url, company or title', async () => {
    const client = await connectedClient();
    const ok = { url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' };
    for (const bad of [
      { company: 'Acme', title: 'No link' },
      { url: 'https://acme.com/jobs/3' },
      { url: 'ftp://acme.com/jobs/3', company: 'Acme', title: 'QA' },
    ]) {
      const result = await client.callTool({
        name: 'intake_vacancies_batch',
        arguments: { entries: [ok, bad] },
      });
      expect(result.isError).toBe(true);
    }
    expect(await prisma.vacancy.count()).toBe(0);
  });

  it('intake_vacancies_batch rejects an empty or oversized array', async () => {
    const client = await connectedClient();
    const empty = await client.callTool({
      name: 'intake_vacancies_batch',
      arguments: { entries: [] },
    });
    expect(empty.isError).toBe(true);
    const oversized = await client.callTool({
      name: 'intake_vacancies_batch',
      arguments: {
        entries: Array.from({ length: 101 }, (_, i) => ({
          url: `https://a.com/${i}`,
          company: 'A',
          title: `Role ${i}`,
        })),
      },
    });
    expect(oversized.isError).toBe(true);
  });
});
