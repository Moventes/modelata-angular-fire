import { IMFLocation } from '@modelata/types-fire/lib/angular';
import { MFModel } from 'mf-model';
import { mustache } from './string.helper';

/**
 * Returns the path from a collection mustache path ad a location object.
 * @param mustachePath Collection mustache path
 * @param location Location object containin path ids and document id or not.
 */
export function getPath(mustachePath: string, location?: string | Partial<IMFLocation>): string {
  const realLocation = getLocation(location, mustachePath);

  if (!(mustachePath && mustachePath.length)) {
    throw new Error('collectionPath must be defined');
  }
  let path = mustache(mustachePath, realLocation);
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

/**
 * Returns true if the document path is in the same format as the collection path (meaning the document is from this kind of collection)
 * or false if it doesn't
 * @param mustachePath Collection path
 * @param refPath Document path
 */
export function isCompatiblePath(mustachePath: string, refPath: string): boolean {
  if (mustachePath && refPath) {
    const { pathSplitted, mustachePathSplitted } = getSplittedPath(refPath, mustachePath);


    if (mustachePathSplitted.length < pathSplitted.length - 1 || mustachePathSplitted.length > pathSplitted.length) {
      return false;
    }
    return mustachePathSplitted.every((path, index) => {
      return pathSplitted[index] && (path.startsWith('{') || pathSplitted[index] === path);
    });
  }
  return false;

}

/**
 * Return a location object from either unvalued, string id or location object
 * @param idOrLocationOrModel string id or location object
 */
export function getLocation(idOrLocationOrModel: string | Partial<IMFLocation> | MFModel<any>, mustachePath: string): Partial<IMFLocation> {
  if (idOrLocationOrModel) {
    if (typeof idOrLocationOrModel === 'string') {
      return { id: idOrLocationOrModel };
    }
    if (idOrLocationOrModel.hasOwnProperty('_collectionPath')) {
      return getLocationFromPath(idOrLocationOrModel._collectionPath, mustachePath, idOrLocationOrModel._id) as IMFLocation;
    }

    return idOrLocationOrModel as Partial<IMFLocation>;
  }
  return {};
}

/**
 * Return a location object from either unvalued, string id or location object
 * @param location string id or location object
 */
export function getLocationFromPath(path: string, mustachePath: string, id?: string): Partial<IMFLocation> {
  if (path && mustachePath) {
    const { pathSplitted, mustachePathSplitted } = getSplittedPath(path, mustachePath);

    return mustachePathSplitted.reduce(
      (location: Partial<IMFLocation>, partOfMustachePath: string, index: number) => {
        if (partOfMustachePath.startsWith('{')) {
          location[partOfMustachePath.slice(1, -1)] = pathSplitted[index];
        }
        return location;
      },
      {
        id
      });
  }
  return {};
}

export function getSplittedPath(path: String, mustachePath: string): {
  pathSplitted: string[],
  mustachePathSplitted: string[],
} {
  const pathSplitted = path.split('/');
  const mustachePathSplitted = mustachePath.split('/');
  if (pathSplitted[0] === '') {
    pathSplitted.shift();
  }
  if (pathSplitted[pathSplitted.length - 1] === '') {
    pathSplitted.pop();
  }
  if (mustachePathSplitted[0] === '') {
    mustachePathSplitted.shift();
  }
  if (mustachePathSplitted[mustachePathSplitted.length - 1] === '') {
    mustachePathSplitted.pop();
  }

  return {
    pathSplitted,
    mustachePathSplitted,
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



/**
 * returns list of file(s) properties
 * @param model The model object
 */
export function getFileProperties(model: Object): string[] {
  return Object.keys(model).filter((key) => {
    return Reflect.hasMetadata('storageProperty', model as Object, key);
  });
}

