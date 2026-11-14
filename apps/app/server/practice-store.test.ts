// @vitest-environment node
import { emptyConversation, type Conversation } from '@archsim/problems';
import { PROBLEMS_DIR } from '@archsim/problems/load';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { practiceStore } from './practice-store';

let dir: string;
let warnings: string[];
const store = () =>
  practiceStore(dir, (line) => {
    warnings.push(line);
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'archsim-store-'));
  warnings = [];
});

const conversation: Conversation = {
  ...emptyConversation('url-shortener'),
  messages: [
    { role: 'user', text: 'Por onde eu começo?', at: '2026-11-14T12:00:00.000Z' },
    { role: 'mentor', text: 'Pelo enunciado.', at: '2026-11-14T12:00:02.000Z', provider: 'api' },
  ],
};

describe('mentor conversations (study-mode FR-8, A01, A08, A10)', () => {
  it('starts empty, round-trips, and clears', () => {
    const s = store();
    expect(s.readConversation('url-shortener')).toEqual(emptyConversation('url-shortener'));
    s.writeConversation(conversation);
    expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(true);
    expect(s.readConversation('url-shortener')).toEqual(conversation);
    s.clearConversation('url-shortener');
    expect(existsSync(join(dir, 'mentor-url-shortener.json'))).toBe(false);
    expect(() => {
      s.clearConversation('url-shortener');
    }).not.toThrow();
  });

  it('sets a corrupted conversation aside and starts over', () => {
    writeFileSync(join(dir, 'mentor-url-shortener.json'), '{ not json');
    expect(store().readConversation('url-shortener').messages).toEqual([]);
    expect(readdirSync(dir).some((f) => f.startsWith('mentor-url-shortener.corrupt-'))).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it('sets aside a file that belongs to another problem', () => {
    writeFileSync(
      join(dir, 'mentor-url-shortener.json'),
      JSON.stringify({ ...conversation, problemId: 'ticketing' }),
    );
    expect(store().readConversation('url-shortener').messages).toEqual([]);
  });

  it('lets an I/O error through instead of calling it corruption', () => {
    mkdirSync(join(dir, 'mentor-url-shortener.json'));
    expect(() => store().readConversation('url-shortener')).toThrow();
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(false);
  });

  it('refuses a path-like id on every operation and writes nothing', () => {
    const s = store();
    expect(() => s.readConversation('../x')).toThrow();
    expect(() => {
      s.clearConversation('../../etc/passwd');
    }).toThrow();
    expect(() => {
      s.writeConversation({ ...conversation, problemId: '../x' });
    }).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });

  it('keeps conversations out of git (FR-54)', () => {
    const out = execFileSync('git', ['check-ignore', 'practice/mentor-url-shortener.json'], {
      cwd: join(PROBLEMS_DIR, '..'),
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('practice/mentor-url-shortener.json');
  });
});
