import { AngularFirestore, DocumentReference } from '@angular/fire/firestore';
import { AngularFireStorage } from '@angular/fire/storage';
import {
  concatMustachePaths,
  getLocation,
  getLocationFromPath,
  getSubPaths,
  IMFGetListOptions,
  IMFGetOneOptions,
  IMFLocation,
  IMFSaveOptions,
  IMFUpdateOptions,
  mergeModels,
  MFLogger,
  MFOmit
} from '@modelata/fire/lib/angular';
import 'reflect-metadata';
import { combineLatest, Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MFDao } from './mf-dao';
import { MFModel } from './mf-model';
import { SubMFDao } from './mf-sub-dao';

/**
 * Abstract Flattable DAO class
 */
export abstract class MFFlattableDao<M extends MFModel<M>> extends MFDao<M>{
  /**
   * List of sub daos used
   */
  private subDAOs: {
    [daoPath: string]: {
      dao: SubMFDao;
      ids: string[];
    }
  } = {};

  /**
   * @inheritdoc
   *
   * @param db
   * @param storage
   */
  constructor(
    db: AngularFirestore,
    storage?: AngularFireStorage,
  ) {
    super(db, storage);
    this.initAllSubDao(db, storage);
    if (!this.subDAOs || Object.keys(this.subDAOs).length < 1) {
      MFLogger.error(`${this.mustachePath} DAO EXTENDS MFFlattableDao But the model dont use any data stored in other document !! `);
      MFLogger.error(`${this.mustachePath} DAO MUST EXTENDS MFDao instead`);
    }
  }

  /**
   * Create all sub daos used
   */
  private initAllSubDao(
    db: AngularFirestore,
    storage?: AngularFireStorage
  ) {
    const refModel = this.getNewModel();
    const subPaths = getSubPaths(refModel);
    this.subDAOs = subPaths.reduce(
      (daos, subPath: string) => {
        const [daoPath, docId] = subPath.split('/');
        if (!(daos as any)[daoPath]) {
          (daos as any)[daoPath] = {
            dao: this.instantiateSubDao(daoPath, db, storage),
            ids: [docId]
          };
        } else if (!((daos as any)[daoPath].ids as string[]).includes(docId)) {
          ((daos as any)[daoPath].ids as string[]).push(docId);
        }
        return daos;
      },
      {}
    );
  }

  /**
   * Creates one sub dao
   *
   * @param subDaoPath path used by the sub dao
   */
  private instantiateSubDao(
    subDaoPath: string,
    db: AngularFirestore,
    storage?: AngularFireStorage,
  ): SubMFDao {
    const subMustachePath = concatMustachePaths(this.mustachePath, subDaoPath);
    return new SubMFDao(subMustachePath, db, this.getNewModel, this.beforeSave, storage);
  }

  /**
   * Fetch all subdocs
   *
   * @param parentLocation Location of the parent document
   * @param options Options to apply to fetch one subdoc
   */
  private get_subDocs(parentLocation: IMFLocation, options: IMFGetOneOptions = {}) {
    return combineLatest(
      Object.keys(this.subDAOs)
        .map(subDaoPath =>
          this.subDAOs[subDaoPath].ids.map(docId =>
            this.subDAOs[subDaoPath].dao.get(
              {
                ...parentLocation,
                parentId: parentLocation.id,
                id: docId
              },
              {
                ...options,
                warnOnMissing: false
              }
            )
              .pipe(
                catchError((err) => {
                  if (err.code === 'permission-denied') {
                    return of(null);
                  }
                  return throwError(err);
                }),
                map(model => ({ model, subDocPath: `${subDaoPath}/${docId}` }))
              )
          )
        )
        .reduce(
          (obsArray, subObsArray) => obsArray.concat(subObsArray),
          []
        )
    )
      .pipe(
        map((subDocWithPath: { subDocPath: string, model: object }[]) =>
          subDocWithPath.reduce(
            (subDocsByPath, docWithPath) => {
              if (docWithPath && docWithPath.model) {
                (subDocsByPath as any)[docWithPath.subDocPath] = docWithPath.model;
              }
              return subDocsByPath;
            }
            ,
            {}
          )
        )
      );
  }

  /**
   * @inheritdoc
   *
   * @param location
   * @param options
   */
  public get(location: string | IMFLocation, options: IMFGetOneOptions = {}): Observable<M> {
    if (location && (typeof location === 'string' || location.id)) {
      const reference = this.getReference(location) as DocumentReference;
      return this.getByReference(reference, options);
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
    const realLocation = getLocationFromPath(reference.parent.path, this.mustachePath, reference.id) as IMFLocation;
    return combineLatest([
      super.getByReference(reference, options),
      this.get_subDocs(realLocation, options)
    ])
      .pipe(
        map(([mainModel, subDocsByPath]) =>
          mergeModels(mainModel, subDocsByPath)
        )
      );
  }

  /**
   * Rebuild a model with data from subdocuments
   *
   * @param mainModel The main model
   * @param options Options to apply to fetch subdocs
   */
  private getModelWithSubDocsFromMainModel(mainModel: M, options: IMFGetOneOptions = {}): Observable<M> {
    const location = getLocation(mainModel, this.mustachePath) as IMFLocation;
    return this.get_subDocs(location, options)
      .pipe(
        map(subDocsByPath =>
          mergeModels(mainModel, subDocsByPath)
        )
      );
  }

  /**
   * @inheritdoc
   *
   * @param location
   * @param options
   */
  public getList(location?: MFOmit<IMFLocation, 'id'>, options: IMFGetListOptions<M> = {}): Observable<M[]> {
    return super.getList(location, options)
      .pipe(switchMap(models =>
        combineLatest(
          models.map((mainModel) => {
            const opt = options;
            delete opt.limit;
            delete opt.offset;
            delete opt.orderBy;
            delete opt.where;
            return this.getModelWithSubDocsFromMainModel(mainModel, opt);
          })
        )
      ));
  }

  /**
   * extract from main model data intended to sub model
   *
   * @param data main model data
   */
  extractMyData(data: Partial<M>): Partial<M> {
    const refModel = this.getNewModel(data);
    return Object.keys(refModel).reduce(
      (myData, key) => {
        if (
          !Reflect.hasMetadata('subDocPath', refModel, key) &&
          data.hasOwnProperty(key)
        ) {
          (myData as any)[key] = (data as any)[key];
        }
        return myData;
      },
      {}
    );
  }

  /**
   * Create subdocuments (even empty ones)
   *
   * @param data Subdocument data
   * @param parentLocation Location of parent document
   * @param options Create options
   */
  private create_subDocs(
    data: Partial<M>,
    parentLocation: IMFLocation,
    options: IMFSaveOptions = {}
  ): Promise<{ model: Partial<M>, subDocPath: string }[]> {


    return Promise.all(
      Object.keys(this.subDAOs).reduce(
        (creates: Promise<{ model: Partial<M>, subDocPath: string }>[], pathDao) => {
          // if (this.subDAOs[pathDao].dao.containsSomeValuesForMe(data as object)) { // commented for create empty subDoc
          const docsById = this.subDAOs[pathDao].dao.splitDataByDocId(data);
          return creates.concat(Object.keys(docsById).map(docId => this.subDAOs[pathDao].dao.create(
            docsById[docId],
            {
              ...parentLocation,
              parentId: parentLocation.id,
              id: docId
            },
            options
          ).then(model => ({ model, subDocPath: `${pathDao}/${docId}` }))));
          // }
          // return creates;
        },
        []
      )
    );
  }

  /**
   * @inheritdoc
   *
   * @param data
   * @param location
   * @param options
   */
  public async create(data: M, location?: string | Partial<IMFLocation>, options: IMFSaveOptions = {}): Promise<M> {
    const realLocation = getLocation(location, this.mustachePath) as IMFLocation;
    if (!realLocation.id) {
      realLocation.id = this.db.createId();
    }
    return this.create_subDocs(
      data,
      realLocation,
      options
    ).then((subDocs) => {
      return super.create(this.extractMyData(data) as M, realLocation, options).then(modelSaved => mergeModels(
        modelSaved,
        subDocs.reduce(
          (subDocsByPath, docWithPath) => {
            (subDocsByPath as any)[docWithPath.subDocPath] = docWithPath.model;
            return subDocsByPath;
          }
          ,
          {}
        )
      ));

    });
  }

  /**
   * Update subdocuments the same way normal update does
   *
   * @param data Subdocument data
   * @param parentLocation Location of the parent document
   * @param options Update options
   */
  private update_subDocs(data: Partial<M>, parentLocation?: IMFLocation, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>[]> {
    return Promise.all(
      Object.keys(this.subDAOs).reduce(
        (updates: Promise<Partial<M>>[], pathDao) => {
          if (this.subDAOs[pathDao].dao.containsSomeValuesForMe(data as object)) {
            const docsById = this.subDAOs[pathDao].dao.splitDataByDocId(data);
            return updates.concat(Object.keys(docsById).map(docId => this.subDAOs[pathDao].dao.update(
              docsById[docId],
              {
                ...parentLocation,
                parentId: parentLocation.id,
                id: docId
              },
              options
            )));
          }
          return updates;
        },
        []
      )
    );
  }

  /**
   * @inheritdoc
   *
   * @param data
   * @param location
   * @param options
   */
  update(data: Partial<M>, location?: string | IMFLocation | M, options: IMFUpdateOptions<M> = {}): Promise<Partial<M>> {
    const mainData = this.extractMyData(data);
    return Promise.all([
      Object.keys(mainData).length > 0 ? super.update(mainData, location, options) : Promise.resolve(data),
      this.update_subDocs(data, getLocation(location || (data as M), this.mustachePath) as IMFLocation, options)
    ]).then(() => data);
  }
}
