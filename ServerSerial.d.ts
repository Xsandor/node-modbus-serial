import { SerialPortOptions } from './ModbusRTU'
import { FCallback } from './ServerTCP'

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
  getCoil? (addr: number, unitID: number, cb: Function): void
  getDiscreteInput? (addr: number, unitID: number, cb: Function): void
  getInputRegister? (addr: number, unitID: number, cb: Function): void
  getHoldingRegister? (addr: number, unitID: number, cb: Function): void
  getMultipleInputRegisters? (startAddr: number, length: number, unitID: number, cb: Function): void
  getMultipleHoldingRegisters? (startAddr: number, length: number, unitID: number, cb: Function): void
  setCoil? (addr: number, value: number, unitID: number, cb: Function): void
  setCoilArray? (startAddr: number, value: number[], unitID: number, cb: Function): void
  setRegister? (addr: number, value: number, unitID: number, cb: Function): void
  setRegisterArray? (startAddr: number, value: number[], unitID: number, cb: Function): void
}

export declare interface ServerSerial {
  on(event: 'open', listener: FCallback): this;
  on(event: 'close', listener: FCallback): this;
  on(event: 'error', listener: FCallback): this;
  on(event: 'initialized', listener: FCallback): this;
  on(event: 'socketError', listener: FCallback): this;
}