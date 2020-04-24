import { DocumentReference, DocumentSnapshot } from '@angular/fire/firestore';
import { FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { createHiddenProperty, Enumerable, getPath, IMFLocation, IMFMetaRef, IMFMetaSubCollection, IMFModel, MissingFieldNotifier, MFLogger } from '@modelata/fire/lib/angular';
import { MFDao } from 'mf-dao';
import 'reflect-metadata';
import { MFControlConfig } from './interfaces/control-config.interface';

/**
 * Abstract Model class
 */
export abstract class MFModel<M> implements IMFModel<M> {
  /**
   * @inheritdoc
   */
  @Enumerable(false)
  public _id: string = null;

  /**
   * @inheritdoc
   */
  @Enumerable(false)
  public _collectionPath: string = null;

  /**
   * @inheritdoc
   */
  @Enumerable(false)
  public _snapshot: DocumentSnapshot<M> = null;

  /**
   * Controls configuration
   */
  @Enumerable(false)
  public _controlsConfig: { [P in keyof this]?: MFControlConfig } = {};

  /**
   * Document was retrieved from angular fire cache
   */
  @Enumerable(false)
  protected _fromCache: boolean = null;

  /**
   * @inheritdoc
   */
  @Enumerable(false)
  public updateDate: Date = null;

  /**
   * @inheritdoc
   */
  @Enumerable(false)
  public creationDate: Date = null;

  /**
   * @inheritdoc
   *
   * @param data
   * @param mustachePath
   * @param location
   */
  initialize(data: Partial<M>, mustachePath: string, location: Partial<IMFLocation>): void {
    if (location && location.id) {
      createHiddenProperty(this, 'id', location.id);
    } else if (data && (data as any)._id) {
      createHiddenProperty(this, 'id', (data as any)._id);
    }

    if (mustachePath && location) {
      createHiddenProperty(this, 'collectionPath', getPath(mustachePath, { ...location, id: null }));
    } else if (data && (data as any)._collectionPath) {
      createHiddenProperty(this, 'collectionPath', (data as any)._collectionPath);
    }

    if (data && typeof (data as any)._fromCache === 'boolean') {
      createHiddenProperty(this, 'fromCache', (data as any)._fromCache);
    }

    if (data && !!(data as any)._snapshot) {
      createHiddenProperty(this, 'snapshot', (data as any)._snapshot);
    }

    if (data) {
      for (const key in data) {
        if (typeof data[key] !== 'function') {
          if (!key.startsWith('_')) {
            if (this.hasOwnProperty(key)) {
              if (data[key] && typeof (data[key] as any).toDate === 'function') {
                (this as any)[key] = (data[key] as any).toDate();
              } else {
                (this as any)[key] = data[key];
              }
            } else {
              MissingFieldNotifier.notifyMissingField(this.constructor.name, key);
            }
          } else {

          }
        }
      }
      for (const key in this) {
        if (key.startsWith('_') && key.endsWith('$')) {
          if (Reflect.hasMetadata('observableFromSubCollection', this, key)) {
            const meta: IMFMetaSubCollection = Reflect.getMetadata('observableFromSubCollection', this, key);
            if (meta.collectionName && meta.daoName && this._id && (this as any)[meta.daoName]) {
              const dao: MFDao<any> = (this as any)[meta.daoName];
              const collectionPath = `${this._collectionPath}/${this._id}/${meta.collectionName}`;
              (this as any)[key] = dao.getListByPath(collectionPath, meta.options);
            }
          } else if (Reflect.hasMetadata('observableFromRef', this, key)) {
            const meta: IMFMetaRef = Reflect.getMetadata('observableFromRef', this, key);
            if (meta.attributeName && meta.daoName && (data as any)[meta.attributeName] && (this as any)[meta.daoName]) {
              const dao: MFDao<any> = (this as any)[meta.daoName];
              const ref: DocumentReference = (data as any)[meta.attributeName];
              (this as any)[key] = dao.getByReference(ref);
            }
          }
        } else if (
          this[key] &&
          (
            ((this[key] as unknown).constructor &&
              ((this[key] as unknown).constructor as any).__proto__ &&
              ((this[key] as unknown).constructor as any).__proto__.name === 'MFDao') ||
            ((this[key] as unknown as MFDao<any>).hasOwnProperty &&
              (this[key] as unknown as MFDao<any>).hasOwnProperty('db') &&
              (this[key] as unknown as MFDao<any>).hasOwnProperty('mustachePath'))
          )
        ) {
          // is dao without underscore
          MFLogger.error(`/!\\ ${key} is part of model and seems to be a DAO, but it should start with an underscore ! else modelata will try to save it in db !!!!!!`);
        }
      }
    }



  }

  /**
   * Returns data to build a form group
   *
   * @param requiredFields Controls with required validator
   */
  toFormBuilderData(
    requiredFields: { [P in keyof this]?: boolean | (() => any) } = {}
  ): { [P in keyof this]?: ([any, ValidatorFn[]] | FormGroup) } {

    const formControls: { [P in keyof this]?: ([any, ValidatorFn[]] | FormGroup) } = {
      _id: [this._id, ([] as ValidatorFn[])],
      _collectionPath: [this._collectionPath, ([] as ValidatorFn[])]
    } as { [P in keyof this]?: ([any, ValidatorFn[]] | FormGroup) };

    for (const controlNameP in this) {
      const controlName = controlNameP.toString() as keyof this;
      const isVisibleProperty = !(controlName as string).startsWith('_') && typeof (this as any)[controlName] !== 'function';
      const isForcedControl = this._controlsConfig[controlName] && !this._controlsConfig[controlName].notControl;
      const isRemovedControl = this._controlsConfig[controlName] && this._controlsConfig[controlName].notControl;
      if (
        (
          isVisibleProperty || isForcedControl
        ) &&
        !isRemovedControl
      ) {

        // const validators: any = [...(this._controlsConfig[controlName] || {}).validators];
        const validators: ValidatorFn[] = [];

        if (this._controlsConfig[controlName] && this._controlsConfig[controlName].validators) {
          validators.push(...(this._controlsConfig[controlName]).validators);
        }

        if (requiredFields[controlName]) {
          validators.push(Validators.required);
        }

        if (this._controlsConfig[controlName] && this._controlsConfig[controlName].toFormGroupFunction) {
          formControls[controlName] = this._controlsConfig[controlName].toFormGroupFunction(
            this[controlName] !== undefined ? this[controlName] : null,
            validators
          );
        } else {
          formControls[controlName] = [
            this[controlName] !== undefined ? this[controlName] : null,
            validators
          ];
        }
      }
    }

    return formControls;
  }

  /**
   * return a string of the document path
   */
  toString(): string {
    return `${this._collectionPath}/${this._id}`;
  }
}
