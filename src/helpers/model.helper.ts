import { DocumentReference } from '@angular/fire/firestore';
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

export function isCompatiblePath(mustachePath: string, refPath: string): boolean {
  if (mustachePath) {
    const refPathSplitted = refPath.split('/');
    const mustachePathSplitted = mustachePath.split('/');
    if (refPathSplitted[0] === '') {
      refPathSplitted.shift();
    }
    if (refPathSplitted[refPathSplitted.length - 1] === '') {
      refPathSplitted.pop();
    }
    if (mustachePathSplitted[0] === '') {
      mustachePathSplitted.shift();
    }
    if (mustachePathSplitted[mustachePathSplitted.length - 1] === '') {
      mustachePathSplitted.pop();
    }
    if (mustachePathSplitted.length < refPathSplitted.length - 1 || mustachePathSplitted.length > refPathSplitted.length) {
      return false;
    }
    return mustachePathSplitted.every((path, index) => {
      return refPathSplitted[index] && (path.startsWith('{') || refPathSplitted[index] === path);
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
/**
 * Return a location object from either unvalued, string id or location object
 * @param location string id or location object
 */
export function getLocationFromRef(ref: DocumentReference): Partial<IMFLocation> {
  return {
    id: ref.id
  };
}


export function allDataExistInModel<M>(data: Partial<M>, model: M, logInexistingData: boolean = true): boolean {
  for (const key in data) {
    if (!model.hasOwnProperty(key)) {
      if (logInexistingData) {
        console.error(`try to update/add an attribute that is not defined in the model = ${key}`);
      }
      return false;
    }
  }
  return true;
}

/**
* method used to prepare the data for save
* @param modelObj the data to save
*/
export function getSavableData<M>(modelObj: M): Partial<M> {

  return Object.keys(modelObj)
    .filter(key =>
      !(key as string).startsWith('_') &&
      typeof modelObj[(key as keyof M)] !== 'undefined' &&
      typeof modelObj[(key as keyof M)] !== 'function'
    )
    .reduce(
      (dbObj: Partial<M>, keyp) => {
        const key: keyof M = keyp as keyof M;
        if (modelObj[key] && modelObj[key].constructor.name === 'Object') {
          (dbObj[key] as any) = getSavableData<any>(modelObj[key]);
        } else {
          dbObj[key] = modelObj[key];
        }
        return dbObj;
      },
      {}
    );

}


