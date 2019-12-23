import {
  AngularFirestore,
  AngularFirestoreCollection,
  AngularFirestoreDocument,
  CollectionReference,
  DocumentReference,
  DocumentSnapshot
} from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
import {
  MFLogger,
  allDataExistInModel,
  getFileProperties,
  getLocation,
  getLocationFromPath,
  getPath,
  getSavableData,
  getSplittedPath,
  IMFDao,
  IMFDeleteOnDeleteFilesOptions,
  IMFDeleteOptions,
  IMFDeletePreviousOnUpdateFilesOptions,
  IMFFile,
  IMFGetListOptions,
  IMFGetOneOptions,
  IMFLocation,
  IMFOffset,
  IMFSaveOptions,
  IMFStorageOptions,
  IMFUpdateOptions,
  isCompatiblePath,
  MFOmit
} from '@modelata/fire/lib/angular';
import { firestore } from 'firebase/app';
import 'reflect-metadata';
import { combineLatest, Observable, of, Subscriber } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { Cacheable } from './decorators/cacheable.decorator';
import { MFCache } from './mf-cache';
import { MFModel } from './mf-model';


/**
 * @inheritdoc
 */
export abstract class MFDao<M extends MFModel<M>> extends MFCache implements IMFDao<M>{
  /**
   * @inheritdoc
   */
  public readonly mustachePath: string = Reflect.getMetadata('mustachePath', this.constructor);

  /**
   * Tru if this dao stores requests results
   */
  public readonly cacheable: boolean = Reflect.getMetadata('cacheable', this.constructor);

  /**
   * Must be called with super()
   *
   * @param db The databse to use to store data
   * @param storage The bucket where files will be stored
   */
  constructor(
    protected db: AngularFirestore,
    protected storage?: AngularFireStorage,
  ) {
    super();
  }



  //       ///////////////////////////////////   \\
  //      ///////////////////////////////////    \\
  //     ///////////PUBLIC API//////////////     \\
  //    ///////////////////////////////////      \\
  //   ///////////////////////////////////       \\

  /**
   * @inheritdoc
   *
   * @param data
   * @param location
   */
  abstract getNewModel(data?: Partial<M>, location?: Partial<IMFLocation>): M;

  /**
   * @inheritdoc
   *
   * @param idOrLocation
   * @param options
   */
  public get(idOrLocation: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    if (idOrLocation && (typeof idOrLocation === 'string' || idOrLocation.id)) {
      const reference = this.getAFReference(idOrLocation) as AngularFirestoreDocument<M>;
      return this.getByAFReference(reference, options);
    }
    throw new Error('getById missing parameter : location and/or id');
  }

  /**
   * @inheritdoc
   *
   * @param reference
   * @param options
   */
  public getByReference(reference: DocumentReference, options?: IMFGetOneOptions): Observable<M> {
    if (reference) {
      return this.getByAFReference(this.db.doc(reference), options);
    }
    throw new Error('getByReference missing parameter : reference');
  }

  /**
   * @inheritdoc
   *
   * @param path
   * @param options
   */
  public getByPath(path: string, options?: IMFGetOneOptions): Observable<M> {
    if (path) {
      return this.getByAFReference(this.db.doc(path), options);
    }
    throw new Error('getByPath missing parameter : path');
  }

  /**
   * @inheritdoc
   *
   * @param idOrLocationOrModel
   */
  public getReference(idOrLocationOrModel: string | Partial<IMFLocation> | M): DocumentReference | CollectionReference {
    return this.getAFReference(getLocation(idOrLocationOrModel, this.mustachePath)).ref;
  }

  /**
   * @inheritdoc
   *
   * @param location
   * @param options
   */
  public getList(location?: MFOmit<IMFLocation, 'id'>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    const realLocation = getLocation(location, this.mustachePath);

    return this.getOffsetSnapshots(options.offset).pipe(
      switchMap((offset) => {
        const collection = this.db.collection<M>(getPath(this.mustachePath, realLocation), (ref) => {

          let query: firebase.firestore.CollectionReference | firebase.firestore.Query = ref;

          if (options.completeOnFirst) {
            query = this.constructSpecialQuery(query, options, offset);
          }

          return query;

        });

        return this.getListByAFReference(collection, options, offset);
      })
    );

  }

  /**
   * Get list of document by collection path
   *
   * @param path collection path
   * @param options get list options
   */
  public getListByPath(path: string, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    if (path && isCompatiblePath(this.mustachePath, path)) {
      const location = getLocationFromPath(path, this.mustachePath);
      return this.getList(location, options);
    }
    throw new Error('getByPath missing or incompatible parameter : path');
  }

  /**
   * Prepare data and location in order to create document in database
   *
   * @param data document data
   * @param location location of the document
   * @param options create options
   */
  public async prepareToCreate(data: M, location?: string | Partial<IMFLocation>, options: IMFSaveOptions = {})
    : Promise<{ savableData: Partial<M>; savableLocation: Partial<IMFLocation> }> {
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
          .then(({ newModel: dataToSave, newLocation }) => ({
            savableLocation: newLocation,
            savableData: getSavableData(dataToSave)
          }))
          .catch((error) => {
            MFLogger.error(error);
            MFLogger.debug('error for ', data);
            return Promise.reject(error);
          });

      });
  }

  /**
   * @inheritdoc
   *
   * @param data
   * @param idOrLocation
   * @param options
   */
  public async create(data: M, location?: string | Partial<IMFLocation>, options: IMFSaveOptions = {}): Promise<M> {

    return this.prepareToCreate(data, location, options).then(({ savableLocation, savableData }) => {
      const ref = this.getAFReference<Partial<M>>(savableLocation);
      let save;
      if (savableLocation && savableLocation.id) {
        save = (ref as AngularFirestoreDocument<Partial<M>>).set(savableData, { merge: !options.overwrite }).then(() => ref.ref);
      } else {
        save = (ref as AngularFirestoreCollection<Partial<M>>).add(savableData);
      }
      return save.then(ref =>
        this.getNewModel(data, { ...savableLocation, id: ref.id })
      );
    })
      .catch((error) => {
        MFLogger.error(error);
        MFLogger.debug('error for ', data);
        return Promise.reject(error);
      });

  }

  /**
   * @inheritdoc
   *
   * @param data
   * @param idOrLocationOrModel
   * @param options
   */
  public update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
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

  /**
   * @inheritdoc
   *
   * @param idLocationOrModel
   * @param options
   */
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

  /**
   * Delete a model by its reference
   *
   * @param reference Document reference
   */
  deleteByReference(reference: AngularFirestoreDocument<M>) {
    if (getFileProperties(this.getNewModel()).length) {
      return this.getByAFReference(reference, { completeOnFirst: true }).toPromise()
        .then(model => this.delete(model));
    }
    return reference.delete();
  }

  /**
   * returns a model from a snapshot
   *
   * @param snapshot document snapshot
   * @param options get one options
   */
  public getModelFromSnapshot(snapshot: firestore.DocumentSnapshot, options: Partial<IMFGetOneOptions> = {}): M {
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
    if (typeof options.warnOnMissing !== 'boolean' || options.warnOnMissing) {
      MFLogger.error(
        '[firestoreDao] - getNewModelFromDb return null because dbObj.exists is null or false. dbObj :',
        snapshot
      );
    }
    return null;
  }

  /**
   * @inheritdoc
   *
   * @param idOrLocation
   * @param options
   */
  public getSnapshot(idOrLocation: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<DocumentSnapshot<M>> {
    const ref = (this.getAFReference(idOrLocation) as AngularFirestoreDocument<M>);
    return options && options.completeOnFirst ?
      ref.get().pipe(map(snap => snap as DocumentSnapshot<M>)) :
      ref.snapshotChanges().pipe(map(action => action.payload));
  }

  /**
   * @inheritdoc
   *
   * @param model
   * @param idOrLocation
   */
  public async beforeSave(model: Partial<M>, idOrLocation?: string | Partial<IMFLocation>): Promise<Partial<M>> {
    return Promise.resolve(model);
  }

  /**
   * Save files from declared file properties and returns the model with storage informations and location with new document id
   *
   * @param model the model for which files must be stored
   * @param location location of the model
   * @returns Promise of an object containing the model with storage informations and location with new document id
   */
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

  /**
   * @inheritdoc
   *
   * @param fileObject
   * @param location
   */
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

  /**
   * Delete files from declared file properties and returns the model
   *
   * @param model the model for which files must be deleted
   * @param options override delete on delete default option
   * @returns Promise of the model
   */
  private async deleteFiles(model: M, options: IMFDeleteOnDeleteFilesOptions<M> = {}): Promise<M> {
    const fileProperties = getFileProperties(model);

    return fileProperties.length ?
      Promise.all(fileProperties.filter(key => (model as any)[key]).map((key) => {
        const property = (model as any)[key] as IMFFile;
        if (
          property && property.storagePath &&
          (
            typeof (options as any)[key] === 'boolean' ?
              (options as any)[key] :
              (Reflect.getMetadata('storageProperty', model, key) as IMFStorageOptions).deleteOnDelete
          )
        ) {
          return this.deleteFile(property);
        }
        return Promise.resolve();
      })).then(() => model) :
      Promise.resolve(model);
  }

  /**
   * @inheritdoc
   *
   * @param fileObject
   */
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

  /**
   * Update files from declared file properties and returns the data with storage informations
   *
   * @param data the data from which files must be updated
   * @param location location of the model
   * @param options override default option
   * @returns Promise of the model with storage informations
   */
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

  /**
   * Update a file
   *
   * @param fileObject the file to update
   * @param location location of the paret model
   * @param deletePrevious delete previous file before update
   */
  public async updateFile(fileObject: IMFFile, location: IMFLocation, deletePrevious = true): Promise<IMFFile> {
    if (this.storage) {
      return ((fileObject.storagePath && deletePrevious) ? this.deleteFile(fileObject) : Promise.resolve())
        .then(() => this.saveFile(fileObject, location));

    }
    return Promise.reject(new Error('AngularFireStorage was not injected'));
  }

  /**
   * Check if the model or reference is compatible with this DAO based on its path
   *
   * @param modelOrReference Model or reference to chheck
   */
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

  /**
   * Get angular fire reference from location
   *
   * @param location location
   */
  private getAFReference<M>(location: string | Partial<IMFLocation>): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
    const realLocation = getLocation(location, this.mustachePath);

    return realLocation.id
      ? this.db.doc<M>(getPath(this.mustachePath, realLocation))
      : this.db.collection<M>(getPath(this.mustachePath, realLocation));
  }

  /**
   * Get document from angular fire reference
   *
   * @param reference angular fire reference
   * @param options get one option
   */
  @Cacheable
  private getByAFReference(reference: AngularFirestoreDocument<M>, options: IMFGetOneOptions = {}): Observable<M> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        let getObs;
        if (options.completeOnFirst) {
          getObs = reference.get().pipe(
            map(snapshot => this.getModelFromSnapshot(snapshot, options))
          );

        } else {
          getObs = new Observable((observer: Subscriber<firestore.DocumentSnapshot>) => {
            reference.ref.onSnapshot({ includeMetadataChanges: true }, observer);
          }).pipe(
            filter((querySnap) => {
              return !querySnap.metadata.hasPendingWrites && !querySnap.metadata.fromCache;
            }),
            map((snapshot: firestore.DocumentSnapshot) => this.getModelFromSnapshot(snapshot, options))
          );

        }
        return getObs;
      }
      throw new Error('location is not compatible with this dao!');
    }
    throw new Error('getByReference missing parameter : reference');
  }

  /**
   * Get list from angular fire reference
   *
   * @param reference angular fire reference
   * @param options get list options
   * @param offset offset document
   */
  @Cacheable
  private getListByAFReference(
    reference: AngularFirestoreCollection<M>,
    options: IMFGetListOptions<M> = {},
    offset?: IMFOffset<M>
  ): Observable<M[]> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        let modelObs;
        if (options.completeOnFirst) {
          modelObs = reference.get().pipe(
            map(querySnapshot => querySnapshot.docs.map(snapshot => this.getModelFromSnapshot(snapshot)))
          );

        } else {
          modelObs = new Observable((observer: Subscriber<firestore.QuerySnapshot>) => {
            let query: firebase.firestore.CollectionReference | firebase.firestore.Query = reference.ref;

            query = this.constructSpecialQuery(query, options, offset);

            query.onSnapshot({ includeMetadataChanges: true }, observer);
          }).pipe(
            filter((querySnap) => {
              return !querySnap.metadata.hasPendingWrites && !querySnap.metadata.fromCache;
            }),
            map(querySnap => querySnap.docs.map(snap => this.getModelFromSnapshot(snap)))
          );

        }
        return modelObs;

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

  /**
   * Get the first offset snapshot available (startAt > startAfter > endAt > endBefore)
   *
   * @param offsetOption The offset option value used here
   * @param options get one options to apply
   */
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

  /**
   * Get a reference from a compatible path
   *
   * @param path The path for which get a reference
   * @return a CollectionReference or a documentReference depending on the path param
   */
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

  /**
   * Returns array of file properties names for the partial model consumed or if missing, for the model appliable to this dao
   *
   * @param model Some partial or full model
   */
  private getFileProperties(model?: Partial<M>): string[] {
    return getFileProperties((model || this.getNewModel()) as Object);
  }

  /**
   * Build get list special query from get list options
   *
   * @param ref collection reference
   * @param options get list options
   * @param offset offset
   */
  private constructSpecialQuery(
    ref: firebase.firestore.CollectionReference | firebase.firestore.Query,
    options: IMFGetListOptions<M>,
    offset?: IMFOffset<M>
  ): firebase.firestore.CollectionReference | firebase.firestore.Query {
    let query = ref;
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
  }
}
