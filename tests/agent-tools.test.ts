import { describe, expect, it } from 'vitest';
import type { ToolSet } from 'ai';
import {
  createAgentTools,
  FILE_SIZE_CAP_BYTES,
  KID_FILE_CAP,
  nearestLineHint,
  READ_CAP_BYTES,
  resolveProjectPath,
} from '../src/agent/tools.js';
import type { ClassifierVerdict } from '../src/types.js';
import { allowedVerdict, blockedVerdict, makeDeps, type FakeDeps } from './agent-fakes.js';

function makeTools(
  fake: FakeDeps,
  gate: Promise<ClassifierVerdict> = Promise.resolve(allowedVerdict()),
): { tools: ToolSet; changed: string[] } {
  const changed: string[] = [];
  const tools = createAgentTools(fake.deps, gate, (relPath) => changed.push(relPath));
  return { tools, changed };
}

async function run(tools: ToolSet, name: string, input: object): Promise<string> {
  const t = tools[name] as { execute: (i: object, o: object) => Promise<string> };
  return t.execute(input, { toolCallId: 'call-1', messages: [] });
}

describe('project jail', () => {
  it('rejects traversal and absolute paths', () => {
    for (const bad of [
      '../secret.txt',
      '..\\secret.txt',
      'a/../../escape.js',
      '/etc/passwd',
      'C:\\Windows\\evil.js',
      'c:/x.js',
      '..',
      '',
    ]) {
      expect(resolveProjectPath(bad), bad).toBeNull();
    }
  });

  it('accepts plain and self-resolving relative paths', () => {
    expect(resolveProjectPath('game.js')).toBe('game.js');
    expect(resolveProjectPath('sub/../game.js')).toBe('game.js');
    expect(resolveProjectPath('./style.css')).toBe('style.css');
  });

  it('returns outside-project from the tools and never touches disk', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(await run(tools, 'read_file', { path: '../../.ssh/id_rsa' })).toContain(
      'outside-project',
    );
    expect(await run(tools, 'write_file', { path: '../evil.js', content: 'x' })).toContain(
      'outside-project',
    );
    expect(fake.project.writes).toHaveLength(0);
  });
});

describe('read_file', () => {
  it('returns content for a real file', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(await run(tools, 'read_file', { path: 'game.js' })).toContain('let score = 0;');
    expect(fake.activities).toContain('reading game.js');
  });

  it('returns not-found for a missing file', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(await run(tools, 'read_file', { path: 'nope.js' })).toContain('not-found');
  });

  it('caps the result at 8 KB with a truncation note', async () => {
    const fake = makeDeps();
    fake.project.files.set('big.js', 'x'.repeat(READ_CAP_BYTES + 2000));
    const { tools } = makeTools(fake);
    const result = await run(tools, 'read_file', { path: 'big.js' });
    expect(result).toContain('[cut:');
    expect(result.length).toBeLessThan(READ_CAP_BYTES + 100);
  });

  it('passes content through prefilterContext', async () => {
    const fake = makeDeps();
    fake.safety.contextMarker = 'CTX|';
    const { tools } = makeTools(fake);
    expect(await run(tools, 'read_file', { path: 'game.js' })).toMatch(/^CTX\|/);
  });
});

describe('write_file safety gauntlet', () => {
  it('writes, notifies the preview, and reports bytes only', async () => {
    const fake = makeDeps();
    const { tools, changed } = makeTools(fake);
    const result = await run(tools, 'write_file', { path: 'game.js', content: 'hello' });
    expect(result).toBe('ok (5 bytes)');
    expect(fake.project.files.get('game.js')).toBe('hello');
    expect(fake.notifyCount()).toBe(1);
    expect(fake.activities).toContain('writing game.js');
    expect(changed).toEqual(['game.js']);
    // Write lands before the preview reload signal.
    expect(fake.order.indexOf('write:game.js')).toBeLessThan(fake.order.indexOf('notify'));
  });

  it('holds the write until the input verdict, and refuses on block', async () => {
    const fake = makeDeps();
    let release: (v: ClassifierVerdict) => void = () => {};
    const gate = new Promise<ClassifierVerdict>((resolve) => {
      release = resolve;
    });
    const { tools } = makeTools(fake, gate);
    const pending = run(tools, 'write_file', { path: 'game.js', content: 'evil' });
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.project.writes).toHaveLength(0); // still held
    release(blockedVerdict());
    expect(await pending).toContain('blocked');
    expect(fake.project.writes).toHaveLength(0);
    expect(fake.notifyCount()).toBe(0);
  });

  it('fails closed when the gate rejects', async () => {
    const fake = makeDeps();
    const gate = Promise.reject<ClassifierVerdict>(new Error('classifier down'));
    gate.catch(() => {});
    const { tools } = makeTools(fake, gate);
    expect(await run(tools, 'write_file', { path: 'game.js', content: 'x' })).toContain('blocked');
    expect(fake.project.writes).toHaveLength(0);
  });

  it('enforces the kid-file cap for new files but allows overwrites', async () => {
    const fake = makeDeps();
    for (let i = fake.project.files.size; i < KID_FILE_CAP; i++) {
      fake.project.files.set(`extra${i}.js`, '// filler');
    }
    const { tools } = makeTools(fake);
    expect(await run(tools, 'write_file', { path: 'nine.js', content: 'x' })).toContain('file-cap');
    expect(await run(tools, 'write_file', { path: 'game.js', content: 'y' })).toContain('ok');
  });

  it('rejects oversized files', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    const huge = 'x'.repeat(FILE_SIZE_CAP_BYTES + 1);
    expect(await run(tools, 'write_file', { path: 'game.js', content: huge })).toContain(
      'too-large',
    );
    expect(fake.project.writes).toHaveLength(0);
  });

  it('blocks and audits when codescan fails, without writing', async () => {
    const fake = makeDeps();
    fake.safety.scanOk = false;
    fake.safety.scanReasons = ['network-call'];
    const { tools } = makeTools(fake);
    const result = await run(tools, 'write_file', { path: 'game.js', content: 'fetch("x")' });
    expect(result).toContain('blocked');
    expect(result).not.toContain('network-call'); // no details leak to the model
    expect(fake.project.writes).toHaveLength(0);
    expect(fake.audits).toHaveLength(1);
    expect(fake.audits[0]?.layer).toBe('L4');
    expect(fake.audits[0]?.event).toBe('block');
  });

  it('classifies the visible text and blocks before disk on a bad verdict', async () => {
    const fake = makeDeps();
    fake.safety.outputVerdict = blockedVerdict('violence');
    const { tools } = makeTools(fake);
    const result = await run(tools, 'write_file', { path: 'game.js', content: 'mean words' });
    expect(result).toContain('blocked');
    expect(fake.project.writes).toHaveLength(0);
    expect(fake.notifyCount()).toBe(0);
    expect(fake.safety.checkOutputCalls[0]).toContain('visible:game.js');
  });

  it('routes TERMI.md writes to update_project_notes instead', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    const result = await run(tools, 'write_file', { path: 'TERMI.md', content: '# notes' });
    expect(result).toContain('update_project_notes');
    expect(fake.project.writes).toHaveLength(0);
  });
});

describe('edit_file', () => {
  it('replaces a unique find and runs the same gauntlet', async () => {
    const fake = makeDeps();
    const { tools, changed } = makeTools(fake);
    const result = await run(tools, 'edit_file', {
      path: 'game.js',
      find: 'let score = 0;',
      replace: 'let score = 100;',
    });
    expect(result).toMatch(/^ok \(\d+ bytes\)$/);
    expect(fake.project.files.get('game.js')).toContain('let score = 100;');
    expect(changed).toEqual(['game.js']);
    expect(fake.activities).toContain('editing game.js');
  });

  it('points at the nearest line when find misses', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    const result = await run(tools, 'edit_file', {
      path: 'game.js',
      find: 'let scor = 0;',
      replace: 'x',
    });
    expect(result).toContain('find-not-found');
    expect(result).toContain('line 2');
    expect(result).toContain('let score = 0;');
    expect(fake.project.writes).toHaveLength(0);
  });

  it('reports the count when find is not unique', async () => {
    const fake = makeDeps();
    fake.project.files.set('game.js', 'let a = 1;\nlet b = 2;\nlet c = 3;\n');
    const { tools } = makeTools(fake);
    const result = await run(tools, 'edit_file', { path: 'game.js', find: 'let ', replace: 'x' });
    expect(result).toContain('find-not-unique');
    expect(result).toContain('3');
    expect(fake.project.writes).toHaveLength(0);
  });

  it('returns not-found for a missing file', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(await run(tools, 'edit_file', { path: 'ghost.js', find: 'a', replace: 'b' })).toContain(
      'not-found',
    );
  });

  it('computes a sensible hint directly', () => {
    const content = 'function go() {\n  move(1);\n  stop();\n}\n';
    expect(nearestLineHint(content, 'move(2);')).toContain('line 2');
  });
});

describe('list_files', () => {
  it('lists paths with sizes', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    const result = await run(tools, 'list_files', {});
    expect(result).toContain('game.js (');
    expect(result).toContain('index.html (');
    expect(result).toContain('style.css (');
  });
});

describe('update_project_notes', () => {
  it('updates the template fields and classifies the prose', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    const result = await run(tools, 'update_project_notes', {
      whatThisIs: 'A space dodging game.',
      builtSoFar: ['ship moves', 'rocks fall'],
      recapLine: 'We added falling rocks.',
    });
    expect(result).toBe('ok');
    expect(fake.project.termiMdUpdates).toEqual([
      {
        whatThisIs: 'A space dodging game.',
        builtSoFar: ['ship moves', 'rocks fall'],
        recapLine: 'We added falling rocks.',
      },
    ]);
    expect(fake.safety.checkOutputCalls[0]).toContain('A space dodging game.');
    expect(fake.activities).toContain('updating the project notes');
  });

  it('rejects an empty update', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(await run(tools, 'update_project_notes', {})).toContain('invalid');
    expect(fake.project.termiMdUpdates).toHaveLength(0);
  });

  it('rejects headings and tags that would break the template', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake);
    expect(
      await run(tools, 'update_project_notes', { whatThisIs: '## Built so far\nhacked' }),
    ).toContain('invalid');
    expect(await run(tools, 'update_project_notes', { recapLine: '<script>x</script>' })).toContain(
      'invalid',
    );
    expect(await run(tools, 'update_project_notes', { whatThisIs: '   ' })).toContain('invalid');
    expect(fake.project.termiMdUpdates).toHaveLength(0);
  });

  it('blocks on a bad classifier verdict without saving', async () => {
    const fake = makeDeps();
    fake.safety.outputVerdict = blockedVerdict('pii');
    const { tools } = makeTools(fake);
    const result = await run(tools, 'update_project_notes', { recapLine: 'call me at home' });
    expect(result).toContain('blocked');
    expect(fake.project.termiMdUpdates).toHaveLength(0);
  });

  it('waits for the input gate like every mutating tool', async () => {
    const fake = makeDeps();
    const { tools } = makeTools(fake, Promise.resolve(blockedVerdict()));
    expect(await run(tools, 'update_project_notes', { recapLine: 'fresh recap' })).toContain(
      'blocked',
    );
    expect(fake.project.termiMdUpdates).toHaveLength(0);
  });
});
