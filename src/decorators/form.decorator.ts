import { FormGroup, ValidatorFn, AbstractControlOptions } from '@angular/forms';
import { MFModel } from './../mf-model';
import { MFControlConfig } from './../interfaces/control-config.interface';

/**
 * Adds validators to form control when generating form group data
 *
 * @param value Validators to apply
 */
export function FormControlValidators<M extends MFModel<M>>(value: ValidatorFn[] = []) {
  return function (target: M, propertyKey: string) {
    let controlConfig: MFControlConfig = {};
    if (Reflect.hasMetadata('controlConfig', target, propertyKey)) {
      controlConfig = Reflect.getMetadata('controlConfig', target, propertyKey);
    }
    if (!controlConfig.validators || controlConfig.validators.length === 0) {
      controlConfig.validators = value;
    }
    Reflect.defineMetadata('controlConfig', controlConfig, target, propertyKey);
  };
}

/**
 * Generates form control data for this property
 */
export function ToFormControl<M extends MFModel<M>>() {
  return function (target: M, propertyKey: string) {
    let controlConfig: MFControlConfig = {};
    if (Reflect.hasMetadata('controlConfig', target, propertyKey)) {
      controlConfig = Reflect.getMetadata('controlConfig', target, propertyKey);
    }
    controlConfig.notControl = false;
    Reflect.defineMetadata('controlConfig', controlConfig, target, propertyKey);

  };
}

/**
 * Explicitly DOES NOT generates form control data for this property
 */
export function NotInFormControl<M extends MFModel<M>>() {
  return function (target: M, propertyKey: string) {
    let controlConfig: MFControlConfig = {};
    if (Reflect.hasMetadata('controlConfig', target, propertyKey)) {
      controlConfig = Reflect.getMetadata('controlConfig', target, propertyKey);
    }
    controlConfig.notControl = true;
    Reflect.defineMetadata('controlConfig', controlConfig, target, propertyKey);

  };
}

/**
 * Generates form group data
 * @param fn ?
 */
export function ToFormGroupFunction<M extends MFModel<M>>(
  fn: (value?: any, options?: AbstractControlOptions, specialData?: any) => ([any, AbstractControlOptions] | FormGroup)
) {
  return function (target: M, propertyKey: string) {
    let controlConfig: MFControlConfig = {};
    if (Reflect.hasMetadata('controlConfig', target, propertyKey)) {
      controlConfig = Reflect.getMetadata('controlConfig', target, propertyKey);
    }
    controlConfig.toFormGroupFunction = fn;
    Reflect.defineMetadata('controlConfig', controlConfig, target, propertyKey);

  };
}
