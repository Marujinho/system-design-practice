import { catalog } from '@archsim/catalog';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_MONTH } from '../queueing';
import { simulateSteady } from '../simulate';
import { initialState, step } from '../step';
import { ctxFor, diagram, edge, node, READ } from '../test-helpers';
import { handlers } from './index';

const users = node('users', 'core.users', 'default');
const load = (rps: number, payloadKB = 1) => [{ ...READ, name: 'default', rps, payloadKB }];

describe('queue (FR-18)', () => {
  const d = diagram(
    [users, node('q', 'aws.sqs', 'standard'), node('workers', 'aws.ec2', 't3.small', { units: 2 })],
    [edge('users', 'q', { protocol: 'queue' }), edge('q', 'workers', { protocol: 'queue' })],
    load(1000),
  );

  it('builds a 4,000-message backlog after 10 s of 1,000 in / 600 out', () => {
    const r = simulateSteady(d, catalog, { ticks: 100 });
    expect(r.nodes.q?.backlog).toBeCloseTo(4000, 6);
    expect(r.nodes.q?.queueAgeS).toBeCloseTo(6.667, 2);
    expect(r.nodes.workers?.rpsIn).toBeCloseTo(600, 6);
    expect(r.nodes.workers?.errorRps).toBe(0);
  });

  it('never blocks the producer: no errors on the queue itself', () => {
    expect(simulateSteady(d, catalog, { ticks: 10 }).nodes.q?.errorRps).toBe(0);
  });

  it('marks a growing backlog as a bottleneck', () => {
    expect(simulateSteady(d, catalog, { ticks: 10 }).nodes.q?.health).toBe('bottleneck');
  });

  it('drains to zero when consumers keep up', () => {
    const ok = diagram(
      [
        users,
        node('q', 'aws.sqs', 'standard'),
        node('workers', 'aws.ec2', 't3.small', { units: 4 }),
      ],
      [edge('users', 'q'), edge('q', 'workers')],
      load(1000),
    );
    const r = simulateSteady(ok, catalog, { ticks: 50 });
    expect(r.nodes.q?.backlog).toBe(0);
    expect(r.nodes.q?.health).not.toBe('bottleneck');
  });

  it('ends the synchronous latency path at the queue', () => {
    const r = simulateSteady(d, catalog, { ticks: 5 });
    expect(r.global.p50ByClass.default).toBeCloseTo(r.nodes.q?.p50 ?? -1, 9);
  });

  it('FIFO without batching turns 500 msg/s into 200 errors', () => {
    const fifo = diagram(
      [users, node('q', 'aws.sqs', 'fifo'), node('fn', 'aws.lambda', 'x86')],
      [edge('users', 'q'), edge('q', 'fn')],
      load(500),
    );
    const r = step(initialState(), fifo, catalog, 100).result;
    expect(r.nodes.q?.errorRps).toBeCloseTo(200, 9);
  });

  it('FIFO with batches of 10 accepts 3,000 msg/s', () => {
    const fifo = diagram(
      [users, node('q', 'aws.sqs', 'fifo', { batchSize: 10 }), node('fn', 'aws.lambda', 'x86')],
      [edge('users', 'q'), edge('q', 'fn')],
      load(3000),
    );
    expect(step(initialState(), fifo, catalog, 100).result.nodes.q?.errorRps).toBe(0);
  });

  it('a queue without consumers grows without NaN and warns', () => {
    const lonely = diagram(
      [users, node('q', 'aws.sqs', 'standard')],
      [edge('users', 'q')],
      load(10),
    );
    const r = simulateSteady(lonely, catalog, { ticks: 20 });
    expect(r.nodes.q?.backlog).toBeCloseTo(20, 6);
    expect(Number.isFinite(r.nodes.q?.queueAgeS)).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('QUEUE_NO_CONSUMER');
  });
});

describe('pub/sub (FR-19)', () => {
  it('delivers 100 msg/s to each of 3 subscribers and bills 100 publishes + 300 deliveries', () => {
    const d = diagram(
      [
        users,
        node('topic', 'aws.sns', 'standard'),
        node('a', 'aws.sqs', 'standard'),
        node('b', 'aws.sqs', 'standard'),
        node('c', 'aws.sqs', 'standard'),
      ],
      [edge('users', 'topic'), edge('topic', 'a'), edge('topic', 'b'), edge('topic', 'c')],
      load(100),
    );
    const r = step(initialState(), d, catalog, 100).result;
    for (const id of ['a', 'b', 'c']) expect(r.nodes[id]?.rpsIn).toBe(100);
    const expected =
      0.5 * ((100 * SECONDS_PER_MONTH) / 1e6) + 0.6 * ((300 * SECONDS_PER_MONTH) / 1e6);
    expect(r.nodes.topic?.costMonth).toBeCloseTo(expected, 6);
  });

  it('EventBridge fans out the same way', () => {
    const h = handlers.pubsub;
    const out = h?.process({ default: 50 }, ctxFor('aws.eventbridge', 'classic', { outDegree: 2 }));
    expect(out?.fanout).toBe(true);
    expect(out?.forward.default).toBe(50);
  });
});

describe('stream (FR-20)', () => {
  const kinesis = (shards: number) => ctxFor('aws.kinesis', 'provisioned', { props: { shards } });

  it('2 shards, 3,000 records/s of 1 KB → 1,000 throttled', () => {
    const ctx = ctxFor('aws.kinesis', 'provisioned', {
      props: { shards: 2 },
      classes: [{ ...READ, payloadKB: 1 }],
    });
    const out = handlers.stream?.process({ read: 3000 }, ctx);
    expect(out?.errors.read).toBeCloseTo(1000, 9);
  });

  it('2 shards, 1,500 records/s of 2 KB (3 MB/s) → 500 throttled by the 2 MB/s limit', () => {
    const ctx = ctxFor('aws.kinesis', 'provisioned', {
      props: { shards: 2 },
      classes: [{ ...READ, payloadKB: 2 }],
    });
    const out = handlers.stream?.process({ read: 1500 }, ctx);
    expect(out?.processed.read).toBeCloseTo(1000, 9);
    expect(out?.errors.read).toBeCloseTo(500, 9);
  });

  it('4 shards take 4,000 records/s', () => {
    expect(handlers.stream?.capacity(kinesis(4))).toBe(4000);
  });

  it('bills shard-hours', () => {
    const out = handlers.stream?.process({}, kinesis(2));
    expect(out?.costMonth).toBeCloseTo(2 * 0.015 * 730, 9);
  });
});
