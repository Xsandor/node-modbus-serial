import { SerialPortOptions } from './ModbusRTU'
import type { FCallback, FCallbackVal } from './ServerTCP'

import * as events from 'events';

export class ServerSerial extends events.EventEmitter {
  constructor(vector: ModbusServerVector, options: SerialServerOptions, serialportOptions?: SerialPortOptions);
  close(cb: FCallback): void;
}

interface SerialServerOptions {
  path?: string
  port?: string
  baudRate?: number
  baudrate?: number
  debug?: boolean
  unitID?: number
  maxBufferSize?: number
  interval?: number
  binding?: any
}

interface ModbusServerVector {
  getCoil? (addr: number, unitID: number, cb: FCallbackVal<number>): void
  getDiscreteInput? (addr: number, unitID: number, cb: FCallbackVal<number>): void
  getInputRegister? (addr: number, unitID: number, cb: FCallbackVal<number>): void
  getHoldingRegister? (addr: number, unitID: number, cb: FCallbackVal<number>): void
  getMultipleInputRegisters? (startAddr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void
  getMultipleHoldingRegisters? (startAddr: number, length: number, unitID: number, cb: FCallbackVal<number[]>): void
  setCoil? (addr: number, value: number, unitID: number, cb: FCallback): void
  setCoilArray? (startAddr: number, value: number[], unitID: number, cb: FCallback): void
  setRegister? (addr: number, value: number, unitID: number, cb: FCallback): void
  setRegisterArray? (startAddr: number, value: number[], unitID: number, cb: FCallback): void
  getExceptionStatus? (unitID: number, cb: FCallbackVal<number>): void
}

export declare interface ServerSerial {
  on(event: 'open', listener: FCallback): this;
  on(event: 'close', listener: FCallback): this;
  on(event: 'error', listener: FCallback): this;
  on(event: 'initialized', listener: FCallback): this;
  on(event: 'socketError', listener: FCallback): this;
  on(event: 'log', listener: FCallbackLog): this;
}

export type FCallbackLog = (type: 'warn' | 'info', message: string) => void;