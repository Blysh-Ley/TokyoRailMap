import { scanReachableStopsByDepartureOpportunity } from '../domain/reachableStops/opportunityPlanner.js';
import { unpackReachableStopsWorkerTimetableIndex } from '../domain/reachableStops/workerTimetableIndex.js';

self.onmessage = async ({ data }) => {
    try {
        const { packet, ...options } = data;
        const index = unpackReachableStopsWorkerTimetableIndex(packet);
        const result = await scanReachableStopsByDepartureOpportunity({ index, ...options });
        self.postMessage({ result });
    } catch (error) {
        self.postMessage({ error: { name: error.name, message: error.message } });
    }
};
