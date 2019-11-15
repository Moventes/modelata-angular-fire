import { Validator, ValidatorFn } from '@angular/forms';

export interface MFControlConfig {
  validators?: (Validator | ValidatorFn)[];
}
