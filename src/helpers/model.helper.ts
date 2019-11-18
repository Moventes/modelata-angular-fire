import { IMFLocation } from '@modelata/types-fire/lib/angular';
import { mustache } from './string.helper';

/**
 * Returns the path from a collection mustache path ad a location object.
 * @param collectionPath Collection mustache path
 * @param location Location object containin path ids and document id or not.
 */
export function getPath(collectionPath: string, location?: string | Partial<IMFLocation>): string {
  const realLocation = getLocation(location);

  if (!(collectionPath && collectionPath.length)) {
    throw new Error('collectionPath must be defined');
  }
  let path = mustache(collectionPath, realLocation);
  if (path.includes('{')) {
    const missingIdRegex = /{(.*?)}/g;
    const missingIds: string[] = [];
    let missingId;
    while ((missingId = missingIdRegex.exec(path)) !== null) {
      missingIds.push(missingId[1]);
    }
    throw new Error(`collectionIds ${missingIds.join(', ')} missing !!!!`);
  }
  if (realLocation.id) {
    path += `${path.endsWith('/') ? '' : '/'}${realLocation.id}`;
  }
  return path;
}

export function isCompatiblePath(collectionPath: string, docPath: string): boolean {
  if (collectionPath) {
    const docPathSplitted = docPath.split('/');
    const collectionPathSplitted = collectionPath.split('/');
    if (docPathSplitted[0] === '') {
      docPathSplitted.shift();
    }
    if (docPathSplitted[docPathSplitted.length - 1] === '') {
      docPathSplitted.pop();
    }
    if (collectionPathSplitted[0] === '') {
      collectionPathSplitted.shift();
    }
    if (collectionPathSplitted[collectionPathSplitted.length - 1] === '') {
      collectionPathSplitted.pop();
    }
    if (collectionPathSplitted.length < docPathSplitted.length - 1 || collectionPathSplitted.length > docPathSplitted.length) {
      return false;
    }
    return collectionPathSplitted.every((path, index) => {
      return docPathSplitted[index] && (path.startsWith('{') || docPathSplitted[index] === path);
    });
  }
  return false;

}

/**
 * Return a location object from either unvalued, string id or location object
 * @param location string id or location object
 */
export function getLocation(location?: string | Partial<IMFLocation>): Partial<IMFLocation> {
  if (location) {
    return typeof location === 'string' ?
      { id: location } :
      location;
  }
  return {};
}

