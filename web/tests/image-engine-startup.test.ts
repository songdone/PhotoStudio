import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ImageEngine } from '../src/engine/engine';

class TestWorker {
  static current: TestWorker;
  onmessage?: (event: { data: { id: number; result: unknown } }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn<(message: { id: number; operation: string }, transfer: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() {
    TestWorker.current = this;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', TestWorker);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('retains a worker load failure before the first ready request', async () => {
  const engine = new ImageEngine();
  const worker = TestWorker.current;
  worker.onerror?.();
  await expect(engine.ready()).rejects.toThrow('worker failed');
  expect(worker.postMessage).not.toHaveBeenCalled();
  engine.dispose();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('bounds a stalled startup and rejects subsequent requests', async () => {
  const engine = new ImageEngine();
  const worker = TestWorker.current;
  const started = expect(engine.ready()).rejects.toThrow('did not start in time');
  await vi.advanceTimersByTimeAsync(15_000);
  await started;
  await expect(engine.histogram(new Uint8Array(4))).rejects.toThrow('did not start in time');
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test('a successful handshake clears the startup timer', async () => {
  const engine = new ImageEngine();
  const worker = TestWorker.current;
  const started = engine.ready();
  const [{ id, operation }] = worker.postMessage.mock.calls[0];
  expect(operation).toBe('ready');
  worker.onmessage?.({ data: { id, result: true } });
  await expect(started).resolves.toBe(true);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(worker.terminate).not.toHaveBeenCalled();
  engine.dispose();
});

test('a worker message error rejects its pending handshake', async () => {
  const engine = new ImageEngine();
  const worker = TestWorker.current;
  const started = expect(engine.ready()).rejects.toThrow('could not deliver a response');
  worker.onmessageerror?.();
  await started;
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});
