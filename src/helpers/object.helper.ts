
/**
 * creates an hidden property in the given object
 * @param obj the object to create the attribute on
 * @param propName the name of the property
 * @param propVal the value of the property
 */
export function createHiddenProperty(obj: { [key: string]: any }, propName: string, propVal: any) {
  if (obj) {
    const hiddenPropName = `_${propName}`;
    if (obj.hasOwnProperty(hiddenPropName)) {
      obj[hiddenPropName] = propVal;
    } else {
      Object.defineProperty(obj, hiddenPropName, {
        value: propVal,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
  } else {
    console.error('you must define an object to set it an hidden property');
  }
}

