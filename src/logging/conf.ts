import { ISettingsParam } from 'tslog/src/index';
import { Logger } from 'tslog';

export const defaultLoggerOptions: ISettingsParam = {
  printLogMessageInNewLine: true,
  setCallerAsLoggerName: false,
  displayFunctionName: false,
  overwriteConsole: true,
  logLevelsColors: {
    '0': 'grey',
    '1': 'white',
    '2': 'cyan',
    '3': 'blue',
    '4': 'yellowBright',
    '5': 'red',
    '6': 'redBright'
  },
  minLevel: 'debug'
};

export const log = {
  cache: new Logger({
    ...defaultLoggerOptions
  }),
  client: new Logger({
    ...defaultLoggerOptions
  }),
  core: new Logger({
    ...defaultLoggerOptions
  }),
  plugins: new Logger({
    ...defaultLoggerOptions
  })
};
