import { normalizeReachableStopsServiceDay } from '../domain/reachableStops/rules.js';

const normalizeText = (value) => String(value ?? '').trim();

export const createReachableStopsServiceDayIndexCache = ({
    buildIndex,
    describeIndex = (index) => index?.stats || {}
} = {}) => {
    if (typeof buildIndex !== 'function') {
        throw new TypeError('buildIndex must be a function');
    }

    const promiseByServiceDay = new Map();
    const readyIndexByServiceDay = new Map();
    let buildCount = 0;

    const get = (serviceDay = 'Weekday') => {
        const day = normalizeReachableStopsServiceDay(serviceDay);
        if (promiseByServiceDay.has(day)) return promiseByServiceDay.get(day);

        const promise = Promise.resolve()
            .then(() => buildIndex(day))
            .then((index) => {
                buildCount += 1;
                if (promiseByServiceDay.get(day) === promise) {
                    readyIndexByServiceDay.set(day, index);
                }
                return index;
            })
            .catch((error) => {
                if (promiseByServiceDay.get(day) === promise) {
                    promiseByServiceDay.delete(day);
                    readyIndexByServiceDay.delete(day);
                }
                throw error;
            });
        promiseByServiceDay.set(day, promise);
        return promise;
    };

    const invalidate = (serviceDay = '') => {
        const day = normalizeText(serviceDay);
        if (!day) {
            promiseByServiceDay.clear();
            readyIndexByServiceDay.clear();
            return;
        }
        const normalizedDay = normalizeReachableStopsServiceDay(day);
        promiseByServiceDay.delete(normalizedDay);
        readyIndexByServiceDay.delete(normalizedDay);
    };

    const stats = () => ({
        serviceDayCacheCount: promiseByServiceDay.size,
        buildCount,
        serviceDays: Array.from(promiseByServiceDay.keys()).sort().map((serviceDay) => {
            const index = readyIndexByServiceDay.get(serviceDay);
            const diagnostics = index ? describeIndex(index) : {};
            return {
                serviceDay,
                status: index ? 'ready' : 'building',
                tripCount: Number(diagnostics?.tripCount) || 0,
                connectionCount: Number(diagnostics?.connectionCount) || 0,
                throughEdgeCount: Number(diagnostics?.throughEdgeCount) || 0
            };
        })
    });

    return { get, invalidate, stats };
};
