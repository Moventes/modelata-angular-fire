export enum MFLoggerLevel {
  NONE,
  ERROR,
  DEBUG,
  DEBUG_LIBRARY
}

export class MFLogger {
  static loggerLevel: MFLoggerLevel = MFLoggerLevel.ERROR;
  static error(...args: any[]) {
    if (MFLogger.loggerLevel >= MFLoggerLevel.ERROR) {
      // tslint:disable-next-line: no-console
      console.debug(...args);
    }
  }
  static debug(...args: any[]) {
    if (MFLogger.loggerLevel >= MFLoggerLevel.DEBUG) {
      // tslint:disable-next-line: no-console
      console.debug(...args);
    }
  }
  static debugLibrary(...args: any[]) {
    if (MFLogger.loggerLevel >= MFLoggerLevel.DEBUG_LIBRARY) {
      // tslint:disable-next-line: no-console
      console.debug(...args);
    }
  }
}
