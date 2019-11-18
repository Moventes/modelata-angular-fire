import { FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { IMFLocation, IMFModel } from '@modelata/types-fire/lib/angular';
import { Enumerable } from './decorators/enumerable.decorator';
import { MissingFieldNotifier } from './helpers/missing-field-notifier';
import { getPath } from './helpers/model.helper';
import { createHiddenProperty } from './helpers/object.helper';
import { MFControlConfig } from './interfaces/control-config.interface';

/**
 * Abstract Model class
 */
export abstract class MFModel implements IMFModel {

  @Enumerable(false)
  public _id: string = null;

  @Enumerable(false)
  public _collectionPath: string = null;

  @Enumerable(false)
  public _controlsConfig: { [P in keyof this]?: MFControlConfig } = {};

  @Enumerable(false)
  protected _fromCache: boolean = null;

  @Enumerable(false)
  public updateDate: Date = null;

  @Enumerable(false)
  public creationDate: Date = null;


  /**
   * initializes the instance of the model with the given data and location
   * @param data the data to inject in the instance
   * @param mustachePath the mustache path of the collection
   * @param location the identifier to set in the path
   */
  initialize(data: Partial<this>, mustachePath: string, location: Partial<IMFLocation>): void {
    if (data) {
      for (const key in data) {
        if (!key.startsWith('_') && typeof data[key] !== 'function') {
          if (this.hasOwnProperty(key)) {
            if (data[key] && typeof (data[key] as any).toDate === 'function') {
              this[key] = (data[key] as any).toDate();
            } else {
              this[key] = data[key];
            }
          } else {
            MissingFieldNotifier.notifyMissingField(this.constructor.name, key);
          }
        }
      }
    }
    if (location && location.id) {
      createHiddenProperty(this, 'id', location.id);
    } else if (data && data._id) {
      createHiddenProperty(this, 'id', data._id);
    }

    if (mustachePath && location) {
      createHiddenProperty(this, 'collectionPath', getPath(mustachePath, location));
    } else if (data && data._collectionPath) {
      createHiddenProperty(this, 'collectionPath', data._collectionPath);
    }

    if (data && typeof (data as any)._fromCache === 'boolean') {
      createHiddenProperty(this, 'fromCache', (data as any)._fromCache);
    }

  }

  toFormBuilderData(
    requiredFields: { [P in keyof this]?: boolean } = {}
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

        const validators = [...(this._controlsConfig[controlName] || {}).validators];
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


  toString(): string {
    return `${this._collectionPath}/${this._id}`;
  }
}
