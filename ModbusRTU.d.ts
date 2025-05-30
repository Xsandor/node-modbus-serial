import { Socket } from 'net';
import { TestPort } from "./TestPort";
export class ModbusRTU {
  constructor(port?: any);
  static TestPort: typeof TestPort

  open(callback: Function): void;
  close(callback: Function): void;
  destroy(callback: Function): void;

  writeFC1(address: number, dataAddress: number, length: number, next: NodeStyleCallback<ReadCoilResult>): void;
  writeFC2(address: number, dataAddress: number, length: number, next: NodeStyleCallback<ReadCoilResult>): void;
  writeFC3(address: number, dataAddress: number, length: number, next: NodeStyleCallback<ReadRegisterResult>): void;
  writeFC4(address: number, dataAddress: number, length: number, next: NodeStyleCallback<ReadRegisterResult>): void;
  writeFC5(address: number, dataAddress: number, state: boolean, next: NodeStyleCallback<WriteCoilResult>): void;
  writeFC6(address: number, dataAddress: number, value: number, next: NodeStyleCallback<WriteRegisterResult>): void;
  writeFC7(address: number, next: NodeStyleCallback<WriteRegisterResult>): void;

  writeFC15(address: number, dataAddress: number, states: Array<boolean>, next: NodeStyleCallback<WriteMultipleResult>): void;
  writeFC16(address: number, dataAddress: number, values: Array<number>, next: NodeStyleCallback<WriteMultipleResult>): void;
  writeFC20(address: number, fileNumber: number, recordNumber: number, recordLength: number, referenceType: number, next: NodeStyleCallback<WriteMultipleResult>): void
  writeFC43(address: number, deviceIdCode: number, objectId: number, next: NodeStyleCallback<WriteMultipleResult>): void;
  writeFC65(address: number, parameterNumbers: Array<number>, next: NodeStyleCallback<WriteMultipleResult>): void;

  // Connection shorthand API
  connectRTU(path: string, options: SerialPortOptions, next: Function): void;
  connectRTU(path: string, options: SerialPortOptions): Promise<void>;
  connectTCP(ip: string, options: TcpPortOptions, next: Function): void;
  connectTCP(ip: string, options: TcpPortOptions): Promise<void>;
  connectUDP(ip: string, options: UdpPortOptions, next: Function): void;
  connectUDP(ip: string, options: UdpPortOptions): Promise<void>;
  connectTcpRTUBuffered(ip: string, options: TcpRTUPortOptions, next: Function): void;
  connectTcpRTUBuffered(ip: string, options: TcpRTUPortOptions): Promise<void>;
  connectTelnet(ip: string, options: TelnetPortOptions, next: Function): void;
  connectTelnet(ip: string, options: TelnetPortOptions): Promise<void>;
  connectC701(ip: string, options: C701PortOptions, next: Function): void;
  connectC701(ip: string, options: C701PortOptions): Promise<void>;
  connectRTUBuffered(path: string, options: SerialPortOptions, next: Function): void;
  connectRTUBuffered(path: string, options: SerialPortOptions): Promise<void>;
  connectAsciiSerial(path: string, options: SerialPortOptions, next: Function): void;
  connectAsciiSerial(path: string, options: SerialPortOptions): Promise<void>;
  linkTCP(socket: Socket, options: TcpPortOptions, next: Function): void;
  linkTCP(socket: Socket, options: TcpPortOptions): Promise<void>;
  linkTcpRTUBuffered(socket: Socket, options: TcpRTUPortOptions, next: Function): void;
  linkTcpRTUBuffered(socket: Socket, options: TcpRTUPortOptions): Promise<void>;
  linkTelnet(socket: Socket, options: TelnetPortOptions, next: Function): void;
  linkTelnet(socket: Socket, options: TelnetPortOptions): Promise<void>;
  connectRTUSocket(socket: Socket, next: Function): void;
  connectRTUSocket(socket: Socket): Promise<void>;

  // Promise API
  setID(id: number): void;
  getID(): number;
  setTimeout(duration: number): void;
  getTimeout(): number;

  readCoils(dataAddress: number, length: number): Promise<ReadCoilResult>;
  readDiscreteInputs(dataAddress: number, length: number): Promise<ReadCoilResult>;
  readHoldingRegisters(dataAddress: number, length: number): Promise<ReadRegisterResult>;
  readRegistersEnron(dataAddress: number, length: number): Promise<ReadRegisterResult>;
  readInputRegisters(dataAddress: number, length: number): Promise<ReadRegisterResult>;
  writeCoil(dataAddress: number, state: boolean): Promise<WriteCoilResult>;
  writeCoils(dataAddress: number, states: Array<boolean>): Promise<WriteMultipleResult>;
  writeRegister(dataAddress: number, value: number): Promise<WriteRegisterResult>;
  writeRegisterEnron(dataAddress: number, value: number): Promise<WriteRegisterResult>;
  writeRegisters(dataAddress: number, values: Array<number> | Buffer): Promise<WriteMultipleResult>; // 16
  readFileRecords(fileNumber: number, recordNumber: number, recordLength: number, referenceType: number): Promise<ReadFileRecordResult>;
  readExceptionStatus(): Promise<ReadExceptionStatusResult>;
  readDeviceIdentification(deviceIdCode: number, objectId: 1 | 2 | 3 | 4): Promise<ReadDeviceIdentificationResult>;
  readCompressed(parameterNumbers: Array<number>): Promise<ReadCompressedResult>;
  
  on(event: 'close', listener: () => unknown): this;

  isOpen: boolean;
  isDebugEnabled: boolean;
}

export interface NodeStyleCallback<T> {
  (err: NodeJS.ErrnoException, param: T): void;
}

export interface BaseResult {
  responses?: Buffer[];
  request?: Buffer;
}

export interface ReadCoilResult extends BaseResult {
  data: Array<boolean>;
  buffer: Buffer;
}

export interface ReadRegisterResult extends BaseResult {
  data: Array<number>;
  buffer: Buffer;
}

export interface WriteCoilResult extends BaseResult {
  address: number;
  state: boolean;
}

export interface WriteRegisterResult extends BaseResult {
  address: number;
  value: number;
}

export interface WriteMultipleResult extends BaseResult {
  address: number;
  length: number;
}

export interface ReadFileRecordResult extends BaseResult {
  data: Buffer | string;
  length: number;
}

export interface ReadDeviceIdentificationResult extends BaseResult {
  data: string[];
  conformityLevel: number;
}

export interface ReadCompressedResult extends BaseResult {
  data: number[];
  errorFlags: number;
  buffer: Buffer;
}

export interface ReadExceptionStatusResult extends BaseResult {
  data: number;
}

export interface SerialPortOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
  xany?: boolean;
  flowControl?: boolean | Array<string>;
  bufferSize?: number;
  parser?: any;
  platformOptions?: SerialPortUnixPlatformOptions;
}

export interface SerialPortUnixPlatformOptions {
  vmin?: number;
  vtime?: number;
}

export interface TcpPortOptions {
  port?: number;
  localAddress?: string;
  family?: number;
  ip?: string;
  timeout?: number;
}

export interface UdpPortOptions {
  port?: number;
  localAddress?: string;
  family?: number;
}

export interface TcpRTUPortOptions {
  port?: number;
  localAddress?: string;
  family?: number;
}

export interface TelnetPortOptions {
  port?: number;
}

export interface C701PortOptions {
  port?: number;
}