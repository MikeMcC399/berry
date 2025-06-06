import {PackageRegistryData}                            from './types';
import {PackageStoreData, PnpSettings, SerializedState} from './types';

// Keep this function is sync with its implementation in:
// @yarnpkg/core/sources/miscUtils.ts
export function sortMap<T>(values: Iterable<T>, mappers: ((value: T) => string) | Array<(value: T) => string>) {
  const asArray = Array.from(values);

  if (!Array.isArray(mappers))
    mappers = [mappers];

  const stringified: Array<Array<string>> = [];

  for (const mapper of mappers)
    stringified.push(asArray.map(value => mapper(value)));

  const indices = asArray.map((_, index) => index);

  indices.sort((a, b) => {
    for (const layer of stringified) {
      const comparison = layer[a] < layer[b] ? -1 : layer[a] > layer[b] ? +1 : 0;

      if (comparison !== 0) {
        return comparison;
      }
    }

    return 0;
  });

  return indices.map(index => {
    return asArray[index];
  });
}

function generateFallbackExclusionList(settings: PnpSettings): Array<[string, Array<string>]> {
  const fallbackExclusionList = new Map();

  const sortedData = sortMap(settings.fallbackExclusionList || [], [
    ({name, reference}) => name,
    ({name, reference}) => reference,
  ]);

  for (const {name, reference} of sortedData) {
    let references = fallbackExclusionList.get(name);

    if (typeof references === `undefined`)
      fallbackExclusionList.set(name, references = new Set());

    references.add(reference);
  }

  return Array.from(fallbackExclusionList).map(([name, references]) => {
    return [name, Array.from(references)] as [string, Array<string>];
  });
}

function generateFallbackPoolData(settings: PnpSettings): Array<[string, string | [string, string] | null]> {
  return sortMap(settings.fallbackPool || [], ([name]) => name);
}

function generatePackageRegistryData(settings: PnpSettings): PackageRegistryData {
  const packageRegistryData: PackageRegistryData = [];

  const topLevelPackageLocator = settings.dependencyTreeRoots.find(locator => {
    return settings.packageRegistry.get(locator.name)?.get(locator.reference)?.packageLocation === `./`;
  });

  for (const [packageName, packageStore] of sortMap(settings.packageRegistry, ([packageName]) => packageName === null ? `0` : `1${packageName}`)) {
    if (packageName === null)
      continue;

    const packageStoreData: PackageStoreData = [];
    packageRegistryData.push([packageName, packageStoreData]);

    for (const [packageReference, {packageLocation, packageDependencies, packagePeers, linkType, discardFromLookup}] of sortMap(packageStore, ([packageReference]) => packageReference === null ? `0` : `1${packageReference}`)) {
      if (packageReference === null)
        continue;

      const normalizedDependencies: Array<[string, string | [string, string] | null]> = [];

      if (packageName !== null && packageReference !== null && !packageDependencies.has(packageName))
        normalizedDependencies.push([packageName, packageReference]);

      for (const [dependencyName, dependencyReference] of packageDependencies)
        normalizedDependencies.push([dependencyName, dependencyReference]);

      const sortedDependencies = sortMap(normalizedDependencies, ([dependencyName]) => dependencyName);

      const normalizedPeers = packagePeers && packagePeers.size > 0
        ? Array.from(packagePeers)
        : undefined;

      const normalizedDiscardFromLookup = discardFromLookup
        ? discardFromLookup
        : undefined;

      const packageData = {
        packageLocation,
        packageDependencies: sortedDependencies,
        packagePeers: normalizedPeers,
        linkType,
        discardFromLookup: normalizedDiscardFromLookup,
      };

      packageStoreData.push([packageReference, packageData]);

      if (topLevelPackageLocator && packageName === topLevelPackageLocator.name && packageReference === topLevelPackageLocator.reference) {
        packageRegistryData.unshift([null, [[null, packageData]]]);
      }
    }
  }

  return packageRegistryData;
}

export function generateSerializedState(settings: PnpSettings): SerializedState {
  return {
    // @eslint-ignore-next-line @typescript-eslint/naming-convention
    __info: [
      `This file is automatically generated. Do not touch it, or risk`,
      `your modifications being lost.`,
    ],

    dependencyTreeRoots: settings.dependencyTreeRoots,
    enableTopLevelFallback: settings.enableTopLevelFallback || false,
    ignorePatternData: settings.ignorePattern || null,

    fallbackExclusionList: generateFallbackExclusionList(settings),
    fallbackPool: generateFallbackPoolData(settings),
    packageRegistryData: generatePackageRegistryData(settings),
  };
}
