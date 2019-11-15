import { Validators } from '@angular/forms';
import { IMFLocation, IMFModel } from '@modelata/types-fire/lib/angular';
import { MFControlConfig } from 'interfaces/control-config.interface';
import { Enumerable } from '../decorators/enumerable.decorator';
import { MissingFieldNotifier } from '../helpers/missing-field-notifier';
import { ModelHelper } from '../helpers/model.helper';
import { ObjectHelper } from '../helpers/object.helper';

/**
 * Abstract Model class
 */
export abstract class MFModel implements IMFModel {

  @Enumerable(false)
  public _id: string;

  @Enumerable(false)
  public _collectionPath: string;

  @Enumerable(false)
  public _controlsConfig: { [property: string]: MFControlConfig } = {};

  @Enumerable(false)
  protected _fromCache: boolean;

  @Enumerable(false)
  protected lastUpdateDate: Date = null;

  @Enumerable(false)
  protected creationDate: Date = null;


  /**
   * initializes the instance of the model with the given data and location
   * @param data the data to inject in the instance
   * @param location the identifier to set in the path
   * @param abstractPath the mustach path of the collection
   */
  protected initialize(data: Partial<this>, location: Partial<IMFLocation>, abstractPath: string): void {
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
      ObjectHelper.createHiddenProperty(this, 'id', location.id);
    } else if (data && data._id) {
      ObjectHelper.createHiddenProperty(this, 'id', data['_id']);
    }

    if (
      data
      && data['_collectionPath']
      && !(<string>data['_collectionPath']).includes('{')
      && (!location || Object.keys(location).length === (location.id ? 1 : 0))
    ) {
      ObjectHelper.createHiddenProperty(this, 'collectionPath', data['_collectionPath']);
    } else if (path) {
      ObjectHelper.createHiddenProperty(this, 'collectionPath', ModelHelper.getPath(path, pathIds));
    } else if (data && data['_collectionPath']) {
      ObjectHelper.createHiddenProperty(this, 'collectionPath', data['_collectionPath']);
    }

    if (data && data['_fromCache']) {
      ObjectHelper.createHiddenProperty(this, 'fromCache', data['_fromCache']);
    }

    if (data && data['_updateDate'] && typeof data['_updateDate'].toDate === 'function') {
      ObjectHelper.createHiddenProperty(this, 'updateDate', data['_updateDate'].toDate());
    }
  }

  toFormBuilderData(requiredFields: Array<string> = []): { [key: string]: Array<any> } {
    const formControls = {
      _id: [this._id, []],
      _collectionPath: [this._collectionPath, []]
    };
    if (!this._controls) {
      this._controls = {};
    }
    if (!this._notControls) {
      this._notControls = {};
    }
    // tslint:disable-next-line: forin
    for (const controlNameP in this) {
      const controlName = controlNameP.toString();
      if (
        ((!controlName.startsWith('_') &&
          !controlName.startsWith('$') &&
          typeof this[controlName] !== 'function') ||
          this._controls[controlName]) &&
        !this._notControls[controlName]
      ) {

        const validators = ([]).concat(this._controls[controlName] || []);
        if (requiredFields.includes(controlName)) {
          validators.push(Validators.required);
        }
        formControls[controlName] = [this[controlName] !== undefined ? this[controlName] : null, validators];
      }
    }

    return formControls;
  }

  // toFormGroup(requiredFields: Array<string> = []): FormGroup {
  //   return new FormBuilder().group(this.toFormGroupData(requiredFields));
  // }

  toString(): string {
    return `${this._collectionPath}/${this._id}`;
  }
}
