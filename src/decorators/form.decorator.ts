import { FormGroup, ValidatorFn } from '@angular/forms';
import { MFModel } from 'mf-model';

export function FormControlValidators<M extends MFModel>(value: ValidatorFn[] = []) {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    if (!target._controlsConfig[propertyKey].validators || target._controlsConfig[propertyKey].validators.length === 0) {
      target._controlsConfig[propertyKey].validators = value;
    }
  };
}

export function ToFormControl<M extends MFModel>() {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].notControl = false;
  };
}

export function NotInFormControl<M extends MFModel>() {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].notControl = true;
  };
}

export function ToFormGroupFunction<M extends MFModel>(fn: (value: any, validators: ValidatorFn[]) => FormGroup) {
  return function (target: M, propertyKey: keyof M) {
    if (!target._controlsConfig[propertyKey]) {
      target._controlsConfig[propertyKey] = {};
    }
    target._controlsConfig[propertyKey].toFormGroupFunction = fn;
  };
}
