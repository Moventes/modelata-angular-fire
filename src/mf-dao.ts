import { AngularFirestore, AngularFirestoreCollection, AngularFirestoreDocument, CollectionReference, DocumentReference, DocumentSnapshot } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
import { IMFDao, IMFFile, IMFGetListOptions, IMFGetOneOptions, IMFLocation, IMFOffset, IMFSaveOptions, MFOmit, IMFUpdateOptions, IMFDeletePreviousOnUpdateFilesOptions, IMFDeleteOnDeleteFilesOptions, IMFDeleteOptions } from '@modelata/types-fire/lib/angular';
import { firestore } from 'firebase/app';
import 'reflect-metadata';
import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { Cacheable } from './decorators/cacheable.decorator';
import { allDataExistInModel, getFileProperties, getLocation, getLocationFromPath, getPath, getSavableData, getSplittedPath, isCompatiblePath } from './helpers/model.helper';
import { IMFStorageOptions } from './interfaces/storage-options.interface';
import { MFCache } from './mf-cache';
import { MFModel } from './mf-model';

/**
 * Abstract DAO class
 */
export abstract class MFDao<M extends MFModel<M>> extends MFCache implements IMFDao<M>{

  constructor(
    private db: AngularFirestore,
    private storage?: AngularFireStorage,
  ) {
    super();
  }

  public readonly mustachePath: string = Reflect.getMetadata('mustachePath', this.constructor);
  public readonly cacheable: boolean = Reflect.getMetadata('cacheable', this.constructor);

  //       ///////////////////////////////////   \\
  //      ///////////////////////////////////    \\
  //     ///////////PUBLIC API//////////////     \\
  //    ///////////////////////////////////      \\
  //   ///////////////////////////////////       \\

  abstract getNewModel(data?: Partial<M>, location?: Partial<IMFLocation>): M;

  public get(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    if (location && (typeof location === 'string' || location.id)) {
      const reference = this.getAFReference(location) as AngularFirestoreDocument<M>;
      return this.getByAFReference(reference, options);
    }
    throw new Error('getById missing parameter : location and/or id');
  }

  public getByReference(reference: DocumentReference, options?: IMFGetOneOptions): Observable<M> {
    if (reference) {
      return this.getByAFReference(this.db.doc(reference), options);
    }
    throw new Error('getByReference missing parameter : reference');
  }

  public getByPath(path: string, options?: IMFGetOneOptions): Observable<M> {
    if (path) {
      return this.getByAFReference(this.db.doc(path), options);
    }
    throw new Error('getByPath missing parameter : path');
  }

  public getReference(idOrLocationOrModel: string | Partial<IMFLocation> | M): DocumentReference | CollectionReference {
    return this.getAFReference(getLocation(idOrLocationOrModel, this.mustachePath)).ref;
  }

  public getList(location?: MFOmit<IMFLocation, 'id'>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    const realLocation = getLocation(location, this.mustachePath);

    return this.getOffsetSnapshots(options.offset).pipe(
      switchMap((offset) => {
        const collection = this.db.collection<M>(getPath(this.mustachePath, realLocation), (ref) => {

          let query: firebase.firestore.CollectionReference | firebase.firestore.Query = ref;

          if (options.where && options.where.length > 0) {
            options.where.forEach((where) => {
              if (where) {
                query = query.where(where.field, where.operator, where.value);
              }
            });
          }

          if (options.orderBy) {
            query = query.orderBy(options.orderBy.field, options.orderBy.operator);
          }

          if (offset) {
            if (offset.startAt) {
              query = query.startAt(offset.startAt);
            } else if (offset.startAfter) {
              query = query.startAfter(offset.startAfter);
            } else if (offset.endAt) {
              query = query.endAt(offset.endAt);
            } else if (offset.endBefore) {
              query = query.endBefore(offset.endBefore);
            }
          }

          if (options.limit !== null && options.limit !== undefined && options.limit > -1) {
            query = query.limit(options.limit);
          }

          return query;

        });

        return this.getListByAFReference(collection, options);
      })
    );

  }

  public getListByPath(path: string, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    if (path && isCompatiblePath(this.mustachePath, path)) {
      const location = getLocationFromPath(path, this.mustachePath);
      return this.getList(location, options);
    }
    throw new Error('getByPath missing or incompatible parameter : path');
  }

  public async create(data: M, location?: string | Partial<IMFLocation>, options: IMFSaveOptions = {}): Promise<M> {

    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject('try to update/add an attribute that is not defined in the model');
    }

    (data as any).updateDate = firestore.FieldValue.serverTimestamp();
    (data as any).creationDate = firestore.FieldValue.serverTimestamp();
    const realLocation: Partial<IMFLocation> = getLocation(location || data, this.mustachePath);


    return this.beforeSave(data, realLocation)
      .then((model) => {

        let testIfdocAlreadyExist: Promise<void>;

        if (realLocation && realLocation.id && !options.overwrite) {
          testIfdocAlreadyExist = (this.getAFReference<Partial<M>>(realLocation).get() as Observable<firestore.DocumentSnapshot>)
            .pipe(take(1)).toPromise()
            .then((snap: firestore.DocumentSnapshot) => {
              if (snap.exists) {
                return Promise.reject({
                  message: `conflict ! document ${snap.id} already exists`,
                  code: 409
                });
              }
              return Promise.resolve();
            });
        } else {
          testIfdocAlreadyExist = Promise.resolve();
        }

        return testIfdocAlreadyExist
          .then(() => this.saveFiles(model, realLocation as IMFLocation))
          .then(({ newModel: dataToSave, newLocation }) => {
            const ref = this.getAFReference<Partial<M>>(newLocation);
            const savableData = getSavableData(dataToSave);
            if (newLocation && newLocation.id) {
              return (ref as AngularFirestoreDocument<Partial<M>>).set(savableData, { merge: !options.overwrite }).then(() => ref.ref);
            }
            return (ref as AngularFirestoreCollection<Partial<M>>).add(savableData);
          })
          .then(ref =>
            this.getNewModel(data, { ...realLocation, id: ref.id })
          )
          .catch((error) => {
            console.error(error);
            console.log('error for ', data);
            return Promise.reject(error);
          });

      });
  }

  update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject('try to update/add an attribute that is not defined in the model');
    }
    const realLocation = getLocation(location || (data as M), this.mustachePath);

    (data as any)['updateDate'] = firestore.FieldValue.serverTimestamp();

    return this.beforeSave(data, realLocation)
      .then((model) => {
        const fileProperties = this.getFileProperties(this.getNewModel()).filter(key => (data as any)[key] && (data as any)[key]._file);
        if (fileProperties.length) {
          return this.get(realLocation as IMFLocation, { completeOnFirst: true }).toPromise()
            .then((dbModel) => {
              fileProperties.forEach((key) => {
                (model as any)[key] = { ...(dbModel as any)[key], ...(model as any)[key] };
              });
              return this.updateFiles(model, realLocation as IMFLocation, options ? options.deletePreviousOnUpdateFiles : undefined);
            });
        }
        return Promise.resolve(model);

      })
      .then(newModel => getSavableData(newModel))
      .then(savable => (this.getAFReference(realLocation) as AngularFirestoreDocument<M>).update(savable))
      .then(() => data);
  }

  delete(idLocationOrModel: string | IMFLocation | M, options: IMFDeleteOptions<M> = {}): Promise<void> {

    const realLocation = getLocation(idLocationOrModel, this.mustachePath);
    let deleteFilesPromise: Promise<M>;

    if (this.getFileProperties(this.getNewModel()).length) {
      deleteFilesPromise = (idLocationOrModel.hasOwnProperty('_collectionPath') ? // is model ? ok : get model
        Promise.resolve(idLocationOrModel as M) :
        this.get(realLocation as IMFLocation, { completeOnFirst: true }).toPromise()
      ).then(model => this.deleteFiles(model, options ? options.deleteOnDeleteFiles : undefined));
    } else {
      deleteFilesPromise = Promise.resolve(null);
    }

    return deleteFilesPromise.then(() => (this.getAFReference(realLocation) as AngularFirestoreDocument<M>).delete());
  }

  deleteByReference(reference: AngularFirestoreDocument<M>) {
    if (getFileProperties(this.getNewModel()).length) {
      return this.getByAFReference(reference, { completeOnFirst: true }).toPromise()
        .then(model => this.delete(model));
    }
    return reference.delete();
  }

  public getModelFromSnapshot(snapshot: firestore.DocumentSnapshot): M {
    if (snapshot.exists) {
      return this.getNewModel(
        {
          ...snapshot.data() as Partial<M>,
          _id: snapshot.id,
          _collectionPath: snapshot.ref.parent.path,
          _snapshot: snapshot,
        }
      );
    }
    console.error(
      '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
      snapshot
    );
    return null;
  }

  public getSnapshot(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<DocumentSnapshot<M>> {
    const ref = (this.getAFReference(location) as AngularFirestoreDocument<M>);
    return options && options.completeOnFirst ?
      ref.get().pipe(map(snap => snap as DocumentSnapshot<M>)) :
      ref.snapshotChanges().pipe(map(action => action.payload));
  }

  public async beforeSave(model: Partial<M>, location?: string | Partial<IMFLocation>): Promise<Partial<M>> {
    return Promise.resolve(model);
  }

  private async saveFiles(newModel: Partial<M>, newLocation: IMFLocation): Promise<{
    newModel: Partial<M>,
    newLocation: IMFLocation
  }> {
    const fileKeys = getFileProperties(newModel as Object);
    if (fileKeys.length) {
      if (!newLocation.id) {
        newLocation.id = newModel._id || this.db.createId();
      }
      return Promise.all(fileKeys.filter(key => (newModel as any)[key] && (newModel as any)[key]._file).map((key) => {
        return this.saveFile((newModel as any)[key], newLocation as IMFLocation)
          .then((file) => {
            (newModel as any)[key] = file;
          });
      })).then(() => {
        return { newModel, newLocation };
      });
    }
    return Promise.resolve({ newModel, newLocation });
  }

  public async saveFile(fileObject: IMFFile, location: IMFLocation): Promise<IMFFile> {
    if (this.storage) {
      return this.storage.upload(`${getPath(this.mustachePath, location)}/${fileObject._file.name}`, fileObject._file)
        .then((uploadTask) => {
          const newFile = {
            ...fileObject,
            storagePath: uploadTask.ref.fullPath,
            name: fileObject._file.name,
            type: fileObject._file.type,
            contentLastModificationDate: new Date(fileObject._file.lastModified)
          };
          delete newFile._file;
          return uploadTask.ref.getDownloadURL().then((url) => {
            newFile.url = url;
            return newFile;
          });
        });
    }
    return Promise.reject(new Error('AngularFireStorage was not injected'));
  }

  private async deleteFiles(model: M, options: IMFDeleteOnDeleteFilesOptions<M> = {}): Promise<M> {
    const fileProperties = getFileProperties(model);

    return fileProperties.length ?
      Promise.all(fileProperties.filter(key => (model as any)[key]).map((key) => {
        const property = (model as any)[key] as IMFFile;
        if (
          property &&
          (
            typeof (options as any)[key] === 'boolean' ?
              (options as any)[key] :
              property.storagePath && (Reflect.getMetadata('storageProperty', model, key) as IMFStorageOptions).deleteOnDelete
          )
        ) {
          return this.deleteFile(property);
        }
        return Promise.resolve();
      })).then(() => model) :
      Promise.resolve(model);
  }

  public deleteFile(fileObject: IMFFile): Promise<void> {
    if (this.storage) {
      return this.storage.ref(fileObject.storagePath).delete().toPromise().catch((err) => {
        if (err.code === 'storage/object-not-found') {
          return Promise.resolve();
        }
        return Promise.reject(err);
      });
    }
    return Promise.reject(new Error('AngularFireStorage was not injected'));
  }

  private async updateFiles(
    data: Partial<M>,
    location: IMFLocation,
    options: IMFDeletePreviousOnUpdateFilesOptions<M> = {}
  ): Promise<Partial<M>> {
    const emptyModel = this.getNewModel();
    const fileProperties = getFileProperties(emptyModel);

    return fileProperties.length ?
      Promise.all(fileProperties.filter((key: string) => (data as any)[key] && (data as any)[key]._file).map((key) => {
        const property = (data as any)[key] as IMFFile;
        if (
          property
        ) {
          return this.updateFile(
            property,
            location,
            (
              typeof (options as any)[key] === 'boolean' ?
                (options as any)[key] :
                (Reflect.getMetadata('storageProperty', emptyModel, key) as IMFStorageOptions).deletePreviousOnUpdate
            )
          )
            .then((newFileObject) => {
              (data as any)[key] = newFileObject;
            });
        }
        return Promise.resolve(null);
      })).then(() => data) :
      Promise.resolve(data);
  }

  public async updateFile(fileObject: IMFFile, location: IMFLocation, deletePrevious = true): Promise<IMFFile> {
    if (this.storage) {
      return ((fileObject.storagePath && deletePrevious) ? this.deleteFile(fileObject) : Promise.resolve())
        .then(() => this.saveFile(fileObject, location));

    }
    return Promise.reject(new Error('AngularFireStorage was not injected'));
  }

  public isCompatible(doc: M | DocumentReference | CollectionReference): boolean {
    return isCompatiblePath(
      this.mustachePath,
      (doc as M)._collectionPath ||
      (doc as DocumentReference).path ||
      (doc as CollectionReference).path
    );
  }






  //    ///////////////////////////////////
  //   ///////////////////////////////////
  //  ////////////PRIVATE////////////////
  // ///////////////////////////////////
  /////////////////////////////////////


  private getAFReference<M>(location: string | Partial<IMFLocation>): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    const realLocation = getLocation(location, this.mustachePath);

    return realLocation.id
      ? this.db.doc<M>(getPath(this.mustachePath, realLocation))
      : this.db.collection<M>(getPath(this.mustachePath, realLocation));
  }




  @Cacheable
  private getByAFReference(reference: AngularFirestoreDocument<M>, options: IMFGetOneOptions = {}): Observable<M> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        if (options.completeOnFirst) {
          return reference.get().pipe(
            map(snapshot => this.getModelFromSnapshot(snapshot))
          );
        }
        if (options.withSnapshot) {
          return reference.snapshotChanges().pipe(
            map(action => this.getModelFromSnapshot(action.payload))
          );
        }
        return reference.valueChanges().pipe(
          map((data) => {
            if (data) {
              return this.getNewModel(
                { ...data, _id: reference.ref.id },
                getLocationFromPath(reference.ref.parent.path, this.mustachePath)
              );
            }
            console.error('[firestoreDao] - get return null because dbObj is null or false. dbObj :', data);
            return null;
          })
        );
      }
      throw new Error('location is not compatible with this dao!');
    }
    throw new Error('getByReference missing parameter : reference');
  }

  @Cacheable
  private getListByAFReference(reference: AngularFirestoreCollection<M>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        if (options.completeOnFirst) {
          return reference.get().pipe(
            map(querySnapshot => querySnapshot.docs.map(snapshot => this.getModelFromSnapshot(snapshot)))
          );
        }
        if (options.withSnapshot) {
          return reference.snapshotChanges().pipe(
            map(actions => actions.map(action => this.getModelFromSnapshot(action.payload.doc)))
          );
        }
        return reference.valueChanges({ idField: '_id' }).pipe(
          map(dataList =>
            dataList.map(data => this.getNewModel(data, getLocationFromPath(reference.ref.path, this.mustachePath)))
          )
        );
      }
      throw new Error('location is not compatible with this dao!');
    }
    throw new Error('getListByReference missing parameter : reference');
  }

  private getSnapshotFromIMFOffsetPart(elem: string | DocumentSnapshot<M>): Observable<DocumentSnapshot<M>> {
    if (elem) {
      if (typeof elem === 'string') {
        return this.getSnapshot(elem, {});
      }
      return of(elem);
    }
    return of(null);
  }

  private getOffsetSnapshots(iMFOffset: IMFOffset<M>): Observable<IMFOffset<M>> {
    if (iMFOffset) {
      if (Object.values(iMFOffset).filter(value => !!value).length > 1) {
        throw new Error('Two many offset options');
      } else if (iMFOffset.endBefore || iMFOffset.startAfter || iMFOffset.endAt || iMFOffset.startAt) {
        return combineLatest(
          this.getSnapshotFromIMFOffsetPart(iMFOffset.endBefore),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.startAfter),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.endAt),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.startAt)
        ).pipe(
          map(([endBefore, startAfter, endAt, startAt]) => ({
            endBefore, startAfter, endAt, startAt
          }))
        );
      }
    }
    return of(null);
  }

  getReferenceFromPath(path: string): DocumentReference | AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    if (isCompatiblePath(this.mustachePath, path)) {
      const { pathSplitted, mustachePathSplitted } = getSplittedPath(path, this.mustachePath);
      if (pathSplitted.length === mustachePathSplitted.length + 1) {
        return this.db.doc<M>(path);
      }
      if (pathSplitted.length === mustachePathSplitted.length) {
        return this.db.collection<M>(path);
      }
      throw new Error('Unable to establish if path is for doc or collection');
    }
    throw new Error('This path is not compatible with this DAO');
  }

  private getFileProperties(model?: Partial<M>): string[] {
    return getFileProperties((model || this.getNewModel()) as Object);
  }
}
