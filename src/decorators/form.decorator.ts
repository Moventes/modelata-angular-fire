import { FormGroup, ValidatorFn } from '@angular/forms';
import { MFModel } from './../mf-model';

/**
 * Adds validators to form control when generating form group data
 *
 * @param value Validators to apply
 */
export function FormControlValidators<M extends MFModel<M>>(value: ValidatorFn[] = []) {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    if (!target._controlsConfig[propertyKey].validators || target._controlsConfig[propertyKey].validators.length === 0) {
      target._controlsConfig[propertyKey].validators = value;
    }
  };
}

/**
 * Generates form control data for this property
 */
export function ToFormControl<M extends MFModel<M>>() {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].notControl = false;
  };
}

/**
 * Explicitly DOES NOT generates form control data for this property
 */
export function NotInFormControl<M extends MFModel<M>>() {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].notControl = true;
  };
}

/**
 * Generates form group data
 * @param fn ?
 */
export function ToFormGroupFunction<M extends MFModel<M>>(fn: (value: any, validators: ValidatorFn[]) => FormGroup) {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].toFormGroupFunction = fn;
  };
}
