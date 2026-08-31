// Scanner-only worker transport for a legal heatmap timetable/query index.
// Runtime trip keys are private numeric IDs; departure opportunity components
// and station/group identifiers retain their original strings.
export const packReachableStopsWorkerTimetableIndex = (index) => {
    const tripIds = Array.from(index.tripById.keys());
    const tripNumbers = new Map(tripIds.map((tripId, number) => [tripId, number]));
    const tripStopOffsets = new Uint32Array(tripIds.length + 1);
    const tripConnectionLengths = new Int32Array(tripIds.length);
    const tripComponentNumbers = new Uint32Array(tripIds.length);
    for (let number = 0; number < tripIds.length; number += 1) {
        const tripId = tripIds[number];
        tripStopOffsets[number + 1] = tripStopOffsets[number] + index.tripById.get(tripId).stops.length;
        tripConnectionLengths[number] = index.connectionsByTripId.has(tripId)
            ? index.connectionsByTripId.get(tripId).length : -1;
    }
    const stopArrivalMinutes = new Float64Array(tripStopOffsets[tripIds.length]);
    const stopDepartureMinutes = new Float64Array(stopArrivalMinutes.length);
    for (let number = 0; number < tripIds.length; number += 1) {
        const stops = index.tripById.get(tripIds[number]).stops;
        const offset = tripStopOffsets[number];
        for (let position = 0; position < stops.length; position += 1) {
            stopArrivalMinutes[offset + position] = stops[position].arrMin;
            stopDepartureMinutes[offset + position] = stops[position].depMin;
        }
    }

    const stopIds = [];
    const stopNumbers = new Map();
    const getStopNumber = (stopId) => {
        let number = stopNumbers.get(stopId);
        if (number === undefined) {
            number = stopIds.length;
            stopIds.push(stopId);
            stopNumbers.set(stopId, number);
        }
        return number;
    };
    const componentIds = [];
    const componentNumbers = new Map();
    const getComponentNumber = (componentId) => {
        let number = componentNumbers.get(componentId);
        if (number === undefined) {
            number = componentIds.length;
            componentIds.push(componentId);
            componentNumbers.set(componentId, number);
        }
        return number;
    };
    const length = index.connections.length;
    const connectionTripNumbers = new Uint32Array(length);
    const connectionFromIndexes = new Uint32Array(length);
    const connectionScanIndexes = new Uint32Array(length);
    const connectionFromStopNumbers = new Uint32Array(length);
    const connectionToStopNumbers = new Uint32Array(length);
    const connectionDepartureMinutes = new Float64Array(length);
    const connectionArrivalMinutes = new Float64Array(length);
    for (let position = 0; position < length; position += 1) {
        const connection = index.connections[position];
        const tripNumber = tripNumbers.get(connection.tripId);
        connectionTripNumbers[position] = tripNumber;
        connectionFromIndexes[position] = connection.fromIndex;
        connectionScanIndexes[position] = connection.scanIndex;
        connectionFromStopNumbers[position] = getStopNumber(connection.fromStopId);
        connectionToStopNumbers[position] = getStopNumber(connection.toStopId);
        connectionDepartureMinutes[position] = connection.depMin;
        connectionArrivalMinutes[position] = connection.arrMin;
        tripComponentNumbers[tripNumber] = getComponentNumber(connection.throughComponentId);
    }

    let edgeCount = 0;
    for (const edges of index.throughEdgesFromTripId.values()) edgeCount += edges.length;
    const throughSourceTripNumbers = new Uint32Array(edgeCount);
    const throughTargetTripNumbers = new Uint32Array(edgeCount);
    const throughEntryIndexes = new Uint32Array(edgeCount);
    let edgeNumber = 0;
    for (const [sourceTripId, edges] of index.throughEdgesFromTripId) {
        for (const edge of edges) {
            throughSourceTripNumbers[edgeNumber] = tripNumbers.get(sourceTripId);
            throughTargetTripNumbers[edgeNumber] = tripNumbers.get(edge.targetTripId);
            throughEntryIndexes[edgeNumber] = edge.targetEntryIndex;
            edgeNumber += 1;
        }
    }
    return {
        serviceDay: index.serviceDay,
        stopIds,
        componentIds,
        connectionTripNumbers,
        connectionFromIndexes,
        connectionScanIndexes,
        connectionFromStopNumbers,
        connectionToStopNumbers,
        connectionDepartureMinutes,
        connectionArrivalMinutes,
        tripComponentNumbers,
        tripStopOffsets,
        tripConnectionLengths,
        stopArrivalMinutes,
        stopDepartureMinutes,
        throughSourceTripNumbers,
        throughTargetTripNumbers,
        throughEntryIndexes,
        groupKeyByStop: index.groupKeyByStop,
        stationIdsByGroupKey: index.stationIdsByGroupKey,
        transferSourcesByTargetStop: index.transferSourcesByTargetStop
    };
};

export const unpackReachableStopsWorkerTimetableIndex = (packet) => {
    const tripById = new Map();
    const connectionsByTripId = new Map();
    const tripCount = packet.tripConnectionLengths.length;
    for (let tripNumber = 0; tripNumber < tripCount; tripNumber += 1) {
        const offset = packet.tripStopOffsets[tripNumber];
        const length = packet.tripStopOffsets[tripNumber + 1] - offset;
        const stops = new Array(length);
        for (let position = 0; position < length; position += 1) {
            stops[position] = {
                arrMin: packet.stopArrivalMinutes[offset + position],
                depMin: packet.stopDepartureMinutes[offset + position]
            };
        }
        tripById.set(tripNumber, { stops });
        if (packet.tripConnectionLengths[tripNumber] >= 0) {
            connectionsByTripId.set(tripNumber, new Array(packet.tripConnectionLengths[tripNumber]));
        }
    }
    const groupKeys = packet.stopIds.map((stopId) => packet.groupKeyByStop.get(stopId) || stopId);
    const connections = new Array(packet.connectionTripNumbers.length);
    for (let position = 0; position < connections.length; position += 1) {
        const tripId = packet.connectionTripNumbers[position];
        const fromIndex = packet.connectionFromIndexes[position];
        const scanIndex = packet.connectionScanIndexes[position];
        const fromStopNumber = packet.connectionFromStopNumbers[position];
        const toStopNumber = packet.connectionToStopNumbers[position];
        const connection = {
            id: scanIndex,
            tripId,
            throughComponentId: packet.componentIds[packet.tripComponentNumbers[tripId]],
            fromIndex,
            toIndex: fromIndex + 1,
            fromStopId: packet.stopIds[fromStopNumber],
            toStopId: packet.stopIds[toStopNumber],
            fromGroupKey: groupKeys[fromStopNumber],
            toGroupKey: groupKeys[toStopNumber],
            depMin: packet.connectionDepartureMinutes[position],
            arrMin: packet.connectionArrivalMinutes[position],
            scanIndex
        };
        connections[position] = connection;
        connectionsByTripId.get(tripId)[fromIndex] = connection;
    }
    const throughEdgesFromTripId = new Map();
    for (let position = 0; position < packet.throughSourceTripNumbers.length; position += 1) {
        const sourceTripId = packet.throughSourceTripNumbers[position];
        let edges = throughEdgesFromTripId.get(sourceTripId);
        if (!edges) {
            edges = [];
            throughEdgesFromTripId.set(sourceTripId, edges);
        }
        edges.push({
            sourceTripId,
            targetTripId: packet.throughTargetTripNumbers[position],
            targetEntryIndex: packet.throughEntryIndexes[position]
        });
    }
    return {
        serviceDay: packet.serviceDay,
        connections,
        connectionsByTripId,
        tripById,
        groupKeyByStop: packet.groupKeyByStop,
        stationIdsByGroupKey: packet.stationIdsByGroupKey,
        transferSourcesByTargetStop: packet.transferSourcesByTargetStop,
        throughEdgesFromTripId
    };
};
