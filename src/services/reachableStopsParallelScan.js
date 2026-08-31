import { scanReachableStopsByDepartureOpportunity } from '../domain/reachableStops/opportunityPlanner.js';
import { mergeReachableStopsOpportunityResults } from '../domain/reachableStops/mergeOpportunityResults.js';
import { packReachableStopsWorkerTimetableIndex } from '../domain/reachableStops/workerTimetableIndex.js';

const createAbortError = (signal) => {
    if (signal?.reason instanceof Error) return signal.reason;
    const error = new Error('Reachable-stops opportunity scan was aborted');
    error.name = 'AbortError';
    return error;
};

// Workers own only this query's disjoint opportunity batches. They are released
// on completion or cancellation, so repeated searches do not grow a worker cache.
export const scanReachableStopsInParallel = ({ index, signal, yieldControl, ...options }) => {
    if (typeof Worker !== 'function') {
        return scanReachableStopsByDepartureOpportunity({ index, signal, yieldControl, ...options });
    }
    if (signal?.aborted) return Promise.reject(createAbortError(signal));
    const partitionCount = 4;
    const packet = packReachableStopsWorkerTimetableIndex(index);
    return new Promise((resolve, reject) => {
        const workers = [];
        const results = new Array(partitionCount);
        let completed = 0;
        const dispose = () => {
            signal?.removeEventListener('abort', onAbort);
            for (const worker of workers) {
                worker.onmessage = null;
                worker.onerror = null;
                worker.terminate();
            }
        };
        const onAbort = () => {
            dispose();
            reject(createAbortError(signal));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            for (let partition = 0; partition < partitionCount; partition += 1) {
                const worker = new Worker(new URL('./reachableStopsOpportunityWorker.js', import.meta.url), { type: 'module' });
                workers.push(worker);
                worker.onerror = (event) => {
                    dispose();
                    reject(event.error || new Error(event.message));
                };
                worker.onmessage = ({ data }) => {
                    if (data.error) {
                        dispose();
                        reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
                        return;
                    }
                    results[partition] = data.result;
                    completed += 1;
                    if (completed === partitionCount) {
                        dispose();
                        resolve(mergeReachableStopsOpportunityResults(results, index.stationIdsByGroupKey));
                    }
                };
                worker.postMessage({
                    ...options,
                    packet,
                    opportunityPartitionIndex: partition,
                    opportunityPartitionCount: partitionCount
                });
            }
        } catch (error) {
            dispose();
            reject(error);
        }
    });
};
