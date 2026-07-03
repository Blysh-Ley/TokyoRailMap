const toText = (value) => String(value ?? '').trim();

const collectTypeNameSet = (typeItems) => new Set(
    (Array.isArray(typeItems) ? typeItems : [])
        .map((item) => toText(item?.name ?? item))
        .filter(Boolean)
);

export const countTypeNameSymmetricDifference = (leftTypeItems, rightTypeItems) => {
    const leftNames = collectTypeNameSet(leftTypeItems);
    const rightNames = collectTypeNameSet(rightTypeItems);
    let count = 0;

    for (const name of leftNames) {
        if (!rightNames.has(name)) count += 1;
    }
    for (const name of rightNames) {
        if (!leftNames.has(name)) count += 1;
    }

    return count;
};

export const resolvePanelStationInfoTypePlacement = ({
    differenceThreshold = 2,
    globalTypeItems = [],
    directionTypeGroups = []
} = {}) => {
    const directions = (Array.isArray(directionTypeGroups) ? directionTypeGroups : [])
        .map((group) => ({
            dirKey: toText(group?.dirKey),
            typeItems: Array.isArray(group?.typeItems) ? group.typeItems : []
        }));

    if (directions.length !== 2) {
        return {
            mode: 'global',
            differenceCount: 0,
            globalTypeItems
        };
    }

    const differenceCount = countTypeNameSymmetricDifference(
        directions[0].typeItems,
        directions[1].typeItems
    );

    if (differenceCount <= differenceThreshold) {
        return {
            mode: 'global',
            differenceCount,
            globalTypeItems
        };
    }

    return {
        mode: 'split',
        differenceCount,
        primaryTypeItems: directions[0].typeItems,
        secondaryTypeItems: directions[1].typeItems
    };
};
