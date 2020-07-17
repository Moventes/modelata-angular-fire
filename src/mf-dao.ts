import {
  AngularFirestore,
  AngularFirestoreCollection,
  AngularFirestoreDocument,
  CollectionReference,
  DocumentReference,
  DocumentSnapshot,
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
  clearNullAttributes,
  convertDataFromDb,
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
  MFOmit,
  MFDeleteMode,
} from '@modelata/fire/lib/angular';
import { firestore } from 'firebase/app';
import 'reflect-metadata';
import { combineLatest, Observable, of, Subscriber } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { MFModel } from './mf-model';

/**
 * @inheritdoc
 */
export abstract class MFDao<M extends MFModel<M>> implements IMFDao<M> {
  /**
   * @inheritdoc
   */
  public readonly mustachePath: string = Reflect.getMetadata(
    'mustachePath',
    this.constructor,
  );

  /**
   * soft or hard (default: hard)
   */
  public readonly deletionMode: MFDeleteMode =
    Reflect.getMetadata('deletionMode', this.constructor) || MFDeleteMode.HARD;

  /**
   * Must be called with super()
   *
   * @param db The databse to use to store data
   * @param storage The bucket where files will be stored
   */
  constructor(
    protected db: AngularFirestore,
    protected storage?: AngularFireStorage,
  ) { }

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
  public get(
    idOrLocation: string | IMFLocation,
    options: IMFGetOneOptions = {},
  ): Observable<M> {
    if (idOrLocation && (typeof idOrLocation === 'string' || idOrLocation.id)) {
      const reference = this.getAFReference(
        idOrLocation,
      ) as AngularFirestoreDocument<M>;
      return this.getByAFReference(reference, options);
    }
    throw new Error('getById missing parameter : "location" or "id"');
  }

  /**
   * @inheritdoc
   *
   * @param reference
   * @param options
   */
  public getByReference(
    reference: DocumentReference,
    options?: IMFGetOneOptions,
  ): Observable<M> {
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
  private getByPath(path: string, options?: IMFGetOneOptions): Observable<M> {
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
  public getReference(
    idOrLocationOrModel: string | Partial<IMFLocation> | M,
  ): DocumentReference | CollectionReference {
    return this.getAFReference(
      getLocation(idOrLocationOrModel, this.mustachePath),
    ).ref;
  }

  /**
   * @inheritdoc
   *
   * @param location
   * @param options
   */
  public getList(
    location?: MFOmit<IMFLocation, 'id'>,
    options: IMFGetListOptions<M> = {},
  ): Observable<M[]> {
    const realLocation = getLocation(location, this.mustachePath);
    const getListOptions = { ...options };
    if (!getListOptions.includeDeleted) {
      if (!getListOptions.where) {
        getListOptions.where = [];
      }
      if (!getListOptions.where.some(w => w.field === 'deleted')) {
        getListOptions.where.push({
          field: 'deleted',
          operator: '==',
          value: false,
        });
      } else {
        MFLogger.error(
          'The query option "where: {field:deleted}" is already added automatically to all getList() queries',
        );
      }
    } else if (
      getListOptions.where &&
      getListOptions.where.some(w => w.field === 'deleted')
    ) {
      MFLogger.error(
        'The query option "where: {field:deleted}" is already added automatically to all getList() queries. If you want to get deleted documents, use "includeDeleted" option instead.',
      );
    }

    return this.getOffsetSnapshots(getListOptions.offset).pipe(
      switchMap((offset) => {
        const collection = this.db.collection<M>(
          getPath(this.mustachePath, realLocation),
          (ref) => {
            let query:
              | firebase.firestore.CollectionReference
              | firebase.firestore.Query = ref;

            if (getListOptions.completeOnFirst) {
              query = this.constructSpecialQuery(query, getListOptions, offset);
            }

            return query;
          },
        );

        return this.getListByAFReference(collection, getListOptions, offset);
      }),
    );
  }

  /**
   * Get list of document by collection path
   *
   * @param path collection path
   * @param options get list options
   */
  public getListByPath(
    path: string,
    options: IMFGetListOptions<M> = {},
  ): Observable<M[]> {
    if (path && isCompatiblePath(this.mustachePath, path)) {
      const location = getLocationFromPath(path, this.mustachePath);
      return this.getList(location, { ...options });
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
  private async prepareToCreate(
    data: M,
    location?: string | Partial<IMFLocation>,
    options: IMFSaveOptions = {},
  ): Promise<{
    savableData: Partial<M>;
    savableLocation: Partial<IMFLocation>;
  }> {
    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject(
        'try to update/add an attribute that is not defined in the model',
      );
    }

    (data as any).updateDate = firestore.FieldValue.serverTimestamp();
    (data as any).creationDate = firestore.FieldValue.serverTimestamp();
    const realLocation: Partial<IMFLocation> = getLocation(
      location || data,
      this.mustachePath,
    );

    return this.beforeSave(data, realLocation).then((model) => {
      let testIfdocAlreadyExist: Promise<void>;

      if (realLocation && realLocation.id && !options.overwrite) {
        testIfdocAlreadyExist = (this.getAFReference<Partial<M>>(
          realLocation,
        ).get() as Observable<firestore.DocumentSnapshot>)
          .pipe(take(1))
          .toPromise()
          .then((snap: firestore.DocumentSnapshot) => {
            if (snap.exists) {
              return Promise.reject({
                message: `conflict ! document ${snap.id} already exists`,
                code: 409,
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
          savableData: clearNullAttributes(getSavableData(dataToSave)),
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
  public async create(
    data: M,
    location?: string | Partial<IMFLocation>,
    options: IMFSaveOptions = {},
  ): Promise<M> {
    return this.prepareToCreate(data, location, options)
      .then(({ savableLocation, savableData }) => {
        const ref = this.getAFReference<Partial<M>>(savableLocation);
        let save;
        if (savableLocation && savableLocation.id) {
          save = (ref as AngularFirestoreDocument<Partial<M>>)
            .set(savableData, { merge: !options.overwrite })
            .then(() => ref.ref);
        } else {
          save = (ref as AngularFirestoreCollection<Partial<M>>).add(
            savableData,
          );
        }
        return save.then(ref =>
          this.getNewModel(data, { ...savableLocation, id: ref.id }),
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
  public update(
    data: Partial<M>,
    location?: string | IMFLocation | M,
    options: IMFUpdateOptions<M> = {},
  ): Promise<Partial<M>> {
    // MFLogger.debug('mf-dao#update - (0) doc to save ', data);
    if (!allDataExistInModel(data, this.getNewModel())) {
      return Promise.reject(
        'try to update/add an attribute that is not defined in the model',
      );
    }
    const realLocation = getLocation(
      location || (data as M),
      this.mustachePath,
    );

    (data as any)['updateDate'] = firestore.FieldValue.serverTimestamp();

    return this.beforeSave(data, realLocation)
      .then((model) => {
        const fileProperties = this.getFileProperties().filter(
          key => (model as any)[key] && (model as any)[key]._file,
        );
        const nullOrUndefinedProperties = Object.keys(model).filter(
          key => model[key as keyof M] == null,
        );
        if (fileProperties.length || nullOrUndefinedProperties.length) {
          return this.get(realLocation as IMFLocation, {
            completeOnFirst: true,
          })
            .toPromise()
            .then((dbModel) => {
              if (nullOrUndefinedProperties.length) {
                // remove null or undefined properties that are not in existing data
                nullOrUndefinedProperties.forEach((key) => {
                  if (dbModel[key as keyof M] == null) {
                    delete model[key as keyof M];
                    // MFLogger.debug(`removing empty property \\"${key}\\" before save`);
                  }
                });
              }
              if (fileProperties.length) {
                fileProperties.forEach((key) => {
                  (model as any)[key] = {
                    ...(dbModel as any)[key],
                    ...(model as any)[key],
                  };
                });
              }
              // MFLogger.debug('mf-dao#update - (1) doc to save ', model);
              return this.updateFiles(
                model,
                realLocation as IMFLocation,
                options ? options.deletePreviousOnUpdateFiles : undefined,
              );
            });
        }
        return Promise.resolve(model);
      })
      .then(newModel => getSavableData(newModel))
      .then((newModel) => {
        MFLogger.debug(
          '[mf-dao#update] updating into Firestore the doc ',
          newModel,
        );
        return newModel;
      })
      .then(savable =>
        (this.getAFReference(realLocation) as AngularFirestoreDocument<
          M
        >).update(savable),
      )
      .then(() => data);
  }

  /**
   * @inheritdoc
   *
   * @param idLocationOrModel
   * @param options
   */
  public delete(
    idLocationOrModel: string | IMFLocation | M,
    options: IMFDeleteOptions<M> = {},
  ): Promise<void> {
    const realLocation = getLocation(idLocationOrModel, this.mustachePath);
    let deleteFilesPromise: Promise<M>;

    if (this.getFileProperties().length) {
      deleteFilesPromise = (idLocationOrModel.hasOwnProperty('_collectionPath') // is model ? ok : get model
        ? Promise.resolve(idLocationOrModel as M)
        : this.get(realLocation as IMFLocation, {
          completeOnFirst: true,
        }).toPromise()
      ).then(model =>
        this.deleteFiles(
          model,
          options ? options.deleteOnDeleteFiles : undefined,
        ),
      );
    } else {
      deleteFilesPromise = Promise.resolve(null);
    }

    return deleteFilesPromise.then(() => {
      if (
        options.mode === MFDeleteMode.SOFT ||
        (options.mode !== MFDeleteMode.HARD &&
          this.deletionMode !== MFDeleteMode.HARD)
      ) {
        return (this.getAFReference(realLocation) as AngularFirestoreDocument<
          MFModel<M>
        >).update({ deleted: true });
      }
      return (this.getAFReference(realLocation) as AngularFirestoreDocument<
        M
      >).delete();
    });
  }

  /**
   * Delete a model by its reference
   *
   * @param reference Document reference
   */
  public deleteByReference(
    reference: AngularFirestoreDocument<M>,
    options: IMFDeleteOptions<M> = {},
  ) {
    if (
      this.getFileProperties().length ||
      (options.mode !== MFDeleteMode.HARD &&
        this.deletionMode === MFDeleteMode.SOFT)
    ) {
      return this.getByAFReference(reference, { completeOnFirst: true })
        .toPromise()
        .then(model => this.delete(model, options));
    }
    return reference.delete();
  }

  /**
   * returns a model from a snapshot
   *
   * @param snapshot document snapshot
   * @param options get one options
   */
  public getModelFromSnapshot(
    snapshot: firestore.DocumentSnapshot,
    options: Partial<IMFGetOneOptions> = {},
  ): M {
    if (snapshot && snapshot.exists) {
      const convertedData = convertDataFromDb(snapshot.data()) as Partial<M>;
      return this.getNewModel({
        ...convertedData,
        _id: snapshot.id,
        _collectionPath: snapshot.ref.parent.path,
        _snapshot: snapshot,
      });
    }
    if (typeof options.warnOnMissing !== 'boolean' || options.warnOnMissing) {
      MFLogger.warn(
        'This document does not exist in Firestore (maybe deleted?):',
        snapshot && snapshot.ref && snapshot.ref.path
          ? snapshot.ref.path
          : snapshot,
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
  public getSnapshot(
    idOrLocation: string | IMFLocation,
    options: IMFGetOneOptions = {},
  ): Observable<DocumentSnapshot<M>> {
    const ref = this.getAFReference(idOrLocation) as AngularFirestoreDocument<
      M
    >;
    return this.getSnapshotFromRef(ref, options);
  }

  /**
   * @inheritdoc
   *
   * @param model
   * @param idOrLocation
   */
  public async beforeSave(
    model: Partial<M>,
    idOrLocation?: string | Partial<IMFLocation>,
  ): Promise<Partial<M>> {
    return Promise.resolve(model);
  }

  /**
   * Save files from declared file properties and returns the model with storage informations and location with new document id
   *
   * @param model the model for which files must be stored
   * @param location location of the model
   * @returns Promise of an object containing the model with storage informations and location with new document id
   */
  private async saveFiles(
    modelToSave: Partial<M>,
    newLocation: IMFLocation,
  ): Promise<{
    newModel: Partial<M>;
    newLocation: IMFLocation;
  }> {
    const fileKeys = this.getFileProperties(modelToSave);
    if (fileKeys.length) {
      MFLogger.debug('[mf-dao#saveFiles] will save IMFFile properties ', fileKeys);
      if (!newLocation.id) {
        newLocation.id = modelToSave._id || this.db.createId();
      }
      return Promise.all(
        fileKeys
          .filter(filterKey => !!modelToSave[filterKey as keyof M])
          .map((fileModelKey) => {
            return this.saveFile(
              modelToSave[fileModelKey as keyof M],
              newLocation as IMFLocation,
            ).then((savedFile) => {
              (modelToSave as any)[fileModelKey] = savedFile;
            });
          }),
      ).then(() => {
        return { newLocation, newModel: modelToSave };
      });
    }
    return Promise.resolve({ newLocation, newModel: modelToSave });
  }

  /**
   * @inheritdoc
   *
   * @param fileObject
   * @param location
   */
  public async saveFile(
    fileObject: IMFFile,
    location: IMFLocation,
  ): Promise<IMFFile> {
    if (fileObject && fileObject._file) {
      if (this.storage) {
        const filePath = `${getPath(this.mustachePath, location)}/${
          fileObject._file.name
          }`;
        MFLogger.debug(`[mf-dao#saveFile] uploading file ${filePath}`);
        return this.storage
          .upload(filePath, fileObject._file)
          .then((uploadTask) => {
            const newFile = {
              ...fileObject,
              storagePath: uploadTask.ref.fullPath,
              name: fileObject._file.name,
              type: fileObject._file.type,
              contentLastModificationDate: new Date(
                fileObject._file.lastModified,
              ),
            };
            delete newFile._file;
            return uploadTask.ref.getDownloadURL().then((url: string) => {
              MFLogger.debug(`[mf-dao#saveFile] File uploaded at ${url}`);
              newFile.url = url;
              return newFile;
            });
          });
      }
      return Promise.reject(
          new Error(
            '"storage: AngularFireStorage" is missing as parameter of DAO service\'s constructor',
          ),
        );

    }
    return Promise.resolve(fileObject);
      // no file to save

  }

  /**
   * Delete files from declared file properties and returns the model
   *
   * @param model the model for which files must be deleted
   * @param options override delete on delete default option
   * @returns Promise of the model
   */
  private async deleteFiles(
    model: M,
    options: IMFDeleteOnDeleteFilesOptions<M> = {},
  ): Promise<M> {
    const fileProperties = this.getFileProperties(model);

    return fileProperties.length
      ? Promise.all(
        fileProperties
          .filter(key => (model as any)[key])
          .map((key) => {
            const property = (model as any)[key] as IMFFile;
            if (
              property &&
              property.storagePath &&
              (typeof (options as any)[key] === 'boolean'
                ? (options as any)[key]
                : this.getStorageOptions(key).deleteOnDelete)
            ) {
              return this.deleteFile(property);
            }
            return Promise.resolve();
          }),
      ).then(() => model)
      : Promise.resolve(model);
  }

  /**
   * @inheritdoc
   *
   * @param fileObject
   */
  public deleteFile(fileObject: IMFFile): Promise<void> {
    if (fileObject && fileObject.storagePath) {
      if (this.storage) {
        return this.storage
          .ref(fileObject.storagePath)
          .delete()
          .toPromise()
          .catch((err) => {
            if (err.code === 'storage/object-not-found') {
              return Promise.resolve();
            }
            return Promise.reject(err);
          });
      }
      return Promise.reject(
          new Error(
            '"storage: AngularFireStorage" is missing as parameter of DAO service\'s constructor',
          ),
        );
    }
    return Promise.resolve();
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
    options: IMFDeletePreviousOnUpdateFilesOptions<M> = {},
  ): Promise<Partial<M>> {
    const fileProperties = this.getFileProperties();

    return fileProperties.length
      ? Promise.all(
        fileProperties
          .filter(
            (key: string) => (data as any)[key] && (data as any)[key]._file,
          )
          .map((key) => {
            const property = (data as any)[key] as IMFFile;
            if (property) {
              const deletePrevious =
                typeof (options as any)[key] === 'boolean'
                  ? (options as any)[key]
                  : this.getStorageOptions(key).deletePreviousOnUpdate;
              return this.updateFile(property, location, deletePrevious).then(
                (newFileObject) => {
                  (data as any)[key] = newFileObject;
                },
              );
            }
            return Promise.resolve(null);
          }),
      ).then(() => data)
      : Promise.resolve(data);
  }

  /**
   * Update a file
   *
   * @param fileObject the file to update
   * @param location location of the paret model
   * @param deletePrevious delete previous file before update
   */
  public async updateFile(
    fileObject: IMFFile,
    location: IMFLocation,
    deletePrevious = true,
  ): Promise<IMFFile> {
    return (deletePrevious
      ? this.deleteFile(fileObject)
      : Promise.resolve()
    ).then(() => this.saveFile(fileObject, location));
  }

  /**
   * Check if the model or reference is compatible with this DAO based on its path
   *
   * @param modelOrReference Model or reference to chheck
   */
  public isCompatible(
    doc: M | DocumentReference | CollectionReference,
  ): boolean {
    return isCompatiblePath(
      this.mustachePath,
      (doc as M)._collectionPath ||
      (doc as DocumentReference).path ||
      (doc as CollectionReference).path,
    );
  }

  //    ///////////////////////////////////
  //   ///////////////////////////////////
  //  ////////////PRIVATE////////////////
  // ///////////////////////////////////
  /////////////////////////////////////

  /**
   * return a snapshot from a reference object
   *
   * @param ref
   * @param options
   */
  private getSnapshotFromRef(
    ref: AngularFirestoreDocument<M>,
    options: IMFGetOneOptions = {}
  ): Observable<DocumentSnapshot<M>> {
    return options && options.completeOnFirst
      ? ref.get().pipe(map(snap => snap as DocumentSnapshot<M>))
      : ref.snapshotChanges().pipe(map(action => action.payload));
  }

  /**
   * Get angular fire reference from location
   *
   * @param location location
   */
  private getAFReference<M>(
    location: string | Partial<IMFLocation>,
  ): AngularFirestoreDocument<M> | AngularFirestoreCollection<M> {
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
  private getByAFReference(
    reference: AngularFirestoreDocument<M>,
    options: IMFGetOneOptions = {},
  ): Observable<M> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        return this.getSnapshotFromRef(reference, options)
          .pipe(
            map(snapshot => this.getModelFromSnapshot(snapshot, options)),
          );
      }
      throw new Error(
        `getByReference(): the given model (${reference?.ref?.path?.split('/').slice(-2)[0]}) is not compatible with the DAO service's @CollectionPath (${this.mustachePath.split('/').slice(-1)[0]})`
      );
      // the model or reference is compatible with this DAO based on its path
    }
    throw new Error('getByReference() missing parameter "reference"');
  }

  /**
   * Get list from angular fire reference
   *
   * @param reference angular fire reference
   * @param options get list options
   * @param offset offset document
   */
  private getListByAFReference(
    reference: AngularFirestoreCollection<M>,
    options: IMFGetListOptions<M> = {},
    offset?: IMFOffset<M>,
  ): Observable<M[]> {
    if (reference) {
      if (this.isCompatible(reference.ref)) {
        let modelObs;
        if (options.completeOnFirst) {
          modelObs = reference
            .get()
            .pipe(
              map(querySnapshot =>
                querySnapshot.docs.map(snapshot =>
                  this.getModelFromSnapshot(snapshot),
                ),
              ),
            );
        } else {
          modelObs = new Observable(
            (observer: Subscriber<firestore.QuerySnapshot>) => {
              let query:
                | firebase.firestore.CollectionReference
                | firebase.firestore.Query = reference.ref;

              query = this.constructSpecialQuery(query, options, offset);

              query.onSnapshot({ includeMetadataChanges: true }, observer);
            },
          ).pipe(
            map(querySnap =>
              querySnap.docs.map(snap => this.getModelFromSnapshot(snap)),
            ),
          );
        }
        return modelObs;
      }
      throw new Error(
        `getListByReference() : the "reference" parameter (${reference?.ref?.path}) is not compatible with the DAO service's @CollectionPath (${this.mustachePath})`,
      );
    }
    throw new Error('getListByReference() missing parameter : reference');
  }

  private getSnapshotFromIMFOffsetPart(
    elem: string | DocumentSnapshot<M>,
  ): Observable<DocumentSnapshot<M>> {
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
  private getOffsetSnapshots(
    iMFOffset: IMFOffset<M>,
  ): Observable<IMFOffset<M>> {
    if (iMFOffset) {
      if (Object.values(iMFOffset).filter(value => !!value).length > 1) {
        throw new Error(
          'Only one offset at a time can be defined as query parameter',
        );
      } else if (
        iMFOffset.endBefore ||
        iMFOffset.startAfter ||
        iMFOffset.endAt ||
        iMFOffset.startAt
      ) {
        return combineLatest([
          this.getSnapshotFromIMFOffsetPart(iMFOffset.endBefore),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.startAfter),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.endAt),
          this.getSnapshotFromIMFOffsetPart(iMFOffset.startAt),
        ]).pipe(
          map(([endBefore, startAfter, endAt, startAt]) => ({
            endBefore,
            startAfter,
            endAt,
            startAt,
          })),
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
  getReferenceFromPath(
    path: string,
  ):
    | DocumentReference
    | AngularFirestoreDocument<M>
    | AngularFirestoreCollection<M> {
    if (isCompatiblePath(this.mustachePath, path)) {
      const { pathSplitted, mustachePathSplitted } = getSplittedPath(
        path,
        this.mustachePath,
      );
      const pathLength = pathSplitted.length;
      const moustacheLength = mustachePathSplitted.length;
      if (pathLength === moustacheLength + 1) {
        return this.db.doc<M>(path);
      }
      if (pathLength === moustacheLength) {
        return this.db.collection<M>(path);
      }
      throw new Error(
        `getReferenceFromPath() : the "path" parameter (${path}) contains ${pathLength} IDs  whereas  the DAO service's @CollectionPath (${this.mustachePath}) contains ${moustacheLength} IDs`,
      );
    }
    throw new Error(
      `getReferenceFromPath() : the "path" parameter (${path}) is not compatible with the DAO service's @CollectionPath (${this.mustachePath})`,
    );
  }

  /**
   * Returns array of file properties names for the partial model consumed or if missing, for the model appliable to this dao
   *
   * @param model Some partial or full model
   */
  private getFileProperties(model?: Partial<M>): string[] {
    return getFileProperties<M>(model || this.getNewModel());
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
    offset?: IMFOffset<M>,
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

    if (
      options.limit !== null &&
      options.limit !== undefined &&
      options.limit > -1
    ) {
      query = query.limit(options.limit);
    }
    return query;
  }

  private getStorageOptions(propertyName: string): IMFStorageOptions {
    return Reflect.getMetadata(
      'storageProperty',
      this.getNewModel(),
      propertyName,
    ) as IMFStorageOptions;
  }
}
