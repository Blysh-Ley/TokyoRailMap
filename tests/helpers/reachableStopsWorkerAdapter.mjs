import { Worker as NodeWorker } from 'node:worker_threads';

const bootstrap = new URL(`data:text/javascript;base64,${Buffer.from(`
import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = globalThis;
self.postMessage = (data) => parentPort.postMessage(data);
await import(workerData.moduleUrl);
parentPort.on('message', (data) => self.onmessage({ data }));
`).toString('base64')}`);

// Only bridge the browser Worker transport. The real production worker imports
// and runs the production opportunity scanner inside each Node worker thread.
export class ReachableStopsNodeWorker {
    constructor(moduleUrl) {
        this.onmessage = null;
        this.onerror = null;
        this.worker = new NodeWorker(bootstrap, {
            workerData: { moduleUrl: String(moduleUrl) }
        });
        this.worker.on('message', (data) => this.onmessage?.({ data }));
        this.worker.on('error', (error) => this.onerror?.({ error, message: error.message }));
    }

    postMessage(data, transferList) {
        this.worker.postMessage(data, transferList);
    }

    terminate() {
        return this.worker.terminate();
    }
}
