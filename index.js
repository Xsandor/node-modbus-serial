"use strict";
/**
 * Copyright (c) 2015-2017, Yaacov Zamir <kobi.zamir@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF  THIS SOFTWARE.
 */

/* Add bit operation functions to Buffer
 */
require("./utils/buffer_bit")();
const crc16 = require("./utils/crc16");
const modbusSerialDebug = require("debug")("modbus-serial");

const events = require("events");
const EventEmitter = events.EventEmitter || events;

const PORT_NOT_OPEN_MESSAGE = "Port Not Open";
const PORT_NOT_OPEN_ERRNO = "ECONNREFUSED";

const BAD_ADDRESS_MESSAGE = "Bad Client Address";
const BAD_ADDRESS_ERRNO = "ECONNREFUSED";

const TRANSACTION_TIMED_OUT_MESSAGE = "Timed out";
const TRANSACTION_TIMED_OUT_ERRNO = "ETIMEDOUT";

const modbusErrorMessages = [
    "Unknown error",
    "Illegal function (device does not support this read/write function)",
    "Illegal data address (register not supported by device)",
    "Illegal data value (value cannot be written to this register)",
    "Slave device failure (device reports internal error)",
    "Acknowledge (requested data will be available later)",
    "Slave device busy (retry request again later)",
    "Negative acknowledge (device cannot perform action)",
    "Memory parity error (failed to read from memory)",
    "Gateway path unavailable",
    "Gateway target device failed to respond"
];

const PortNotOpenError = function() {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = PORT_NOT_OPEN_MESSAGE;
    this.errno = PORT_NOT_OPEN_ERRNO;
};

const BadAddressError = function() {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = BAD_ADDRESS_MESSAGE;
    this.errno = BAD_ADDRESS_ERRNO;
};

const BroadcastNotAllowedError = function() {
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.message = "Function does not allow broadcast requests";
    this.errno = BAD_ADDRESS_ERRNO;
};

const TransactionTimedOutError = function() {
    this.name = this.constructor.name;
    this.message = TRANSACTION_TIMED_OUT_MESSAGE;
    this.errno = TRANSACTION_TIMED_OUT_ERRNO;
};

const SerialPortError = function() {
    this.name = this.constructor.name;
    this.message = null;
    this.errno = "ECONNREFUSED";
};

const BROADCAST_ADDRESS = 0;

/**
 * @fileoverview ModbusRTU module, exports the ModbusRTU class.
 * this class makes ModbusRTU calls fun and easy.
 *
 * Modbus is a serial communications protocol, first used in 1979.
 * Modbus is simple and robust, openly published, royalty-free and
 * easy to deploy and maintain.
 */

/**
 * Parse the data for a Modbus -
 * Read Coils (FC=02, 01)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC2(data, next) {
    const length = data.readUInt8(2);
    const contents = [];

    for (let i = 0; i < length; i++) {
        let reg = data[i + 3];

        for (let j = 0; j < 8; j++) {
            contents.push((reg & 1) === 1);
            reg = reg >> 1;
        }
    }

    if (next)
        next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
}

/**
 * Parse the data for a Modbus -
 * Read Input Registers (FC=04, 03)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC3or4(data, next) {
    const length = data.readUInt8(2);
    const contents = [];

    for (let i = 0; i < length; i += 2) {
        const reg = data.readUInt16BE(i + 3);
        contents.push(reg);
    }

    if (next)
        next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
}

/**
 * Parse the data for a Modbus (Enron) -
 * Read Registers (FC=04, 03)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC3or4Enron(data, next) {
    const length = data.readUInt8(2);
    const contents = [];

    for (let i = 0; i < length; i += 4) {
        const reg = data.readUInt32BE(i + 3);
        contents.push(reg);
    }

    if (next)
        next(null, { "data": contents, "buffer": data.slice(3, 3 + length) });
}

/**
 * Parse the data for a Modbus -
 * Force Single Coil (FC=05)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC5(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const state = data.readUInt16BE(4);

    if (next)
        next(null, { "address": dataAddress, "state": (state === 0xff00) });
}

/**
 * Parse the data for a Modbus -
 * Preset Single Registers (FC=06)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC6(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const value = data.readUInt16BE(4);

    if (next)
        next(null, { "address": dataAddress, "value": value });
}

/**
 * Parse the data for a Modbus -
 * Read Exception Status (FC=07)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC7(data, next) {
    const value = data.readInt8(2);

    if (next)
        next(null, { "data": value });
}

/**
 * Parse the data for a Modbus (Enron) -
 * Preset Single Registers (FC=06)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC6Enron(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const value = data.readUInt32BE(4);

    if (next)
        next(null, { "address": dataAddress, "value": value });
}

/**
 * Parse the data for a Modbus -
 * Preset Multiple Registers (FC=15, 16)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC16(data, next) {
    const dataAddress = data.readUInt16BE(2);
    const length = data.readUInt16BE(4);

    if (next)
        next(null, { "address": dataAddress, "length": length });
}

/**
 * Parse  the data fro Modbus -
 * Read File Records
 * Currently only parses the first subRequest
 *
 * @param {Buffer4} buffer
 * @param {Function} next
 */
function _readFC20(data, next) {
    // const fileRespLength = parseInt(data.readUInt8(2));
    const subRequestLength = parseInt(data.readUInt8(3));
    const subRequestRefType = parseInt(data.readUInt8(4));

    let result;

    if (subRequestRefType === 7) {
        // read data as ASCII string
        result = data.toString("ascii", 5, 5 + subRequestLength - 1).replace(/\0.*$/g, "");
    } else {
        // result = [];

        // for (let i = 0; i < subRequestLength - 1; i++) {
        //     const reg = data.readUInt8(5 + i);
        //     result.push(reg);
        // }

        result = data.slice(5, 5 + subRequestLength - 1);
    }

    if(next)
        next(null, { "data": result, "length": subRequestLength });
}

/**
 * Parse the data for a Modbus -
 * Read Device Identification (FC=43)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Modbus} modbus the client in case we need to read more device information
 * @param {Function} next the function to call next.
 */
function _readFC43(data, modbus, next) {
    const address = parseInt(data.readUInt8(0));
    const readDeviceIdCode = parseInt(data.readUInt8(3));
    const conformityLevel = parseInt(data.readUInt8(4));
    const moreFollows = parseInt(data.readUInt8(5));
    const nextObjectId = parseInt(data.readUInt8(6));
    const numOfObjects = parseInt(data.readUInt8(7));

    let startAt = 8;
    const result = {};
    for (let i = 0; i < numOfObjects; i++) {
        const objectId = parseInt(data.readUInt8(startAt));
        const objectLength = parseInt(data.readUInt8(startAt + 1));
        const startOfData = startAt + 2;
        result[objectId] = data.toString("ascii", startOfData, startOfData + objectLength);
        startAt = startOfData + objectLength;
    }

    // is it saying to follow and did you previously get data
    // if you did not previously get data go ahead and halt to prevent an infinite loop
    if (moreFollows && numOfObjects) {
        const cb = function(err, data) {
            data.data = Object.assign(data.data, result);
            return next(err, data);
        };
        modbus.writeFC43(address, readDeviceIdCode, nextObjectId, cb);
    } else if (next) {
        next(null, { data: result, conformityLevel });
    }
}

/**
 * Parse the data for a Modbus -
 * Read Parameter Number Compressed (FC=65)
 *
 * @param {Buffer} data the data buffer to parse.
 * @param {Function} next the function to call next.
 */
function _readFC65(data, next) {
    const length = data.readUInt8(2); // byte count
    const errorFlags = data.readUInt16BE(3); // should be parsed as an array of bits
    const contents = [];

    for (let i = 0; i < (length - 2); i += 2) {
        const reg = data.readInt16BE(5 + i);
        contents.push(reg);
    }

    if (next)
        next(null, { "data": contents, "errorFlags": errorFlags, "buffer": data.slice(3, 3 + length) });
}

/**
 * Wrapper method for writing to a port with timeout. <code><b>[this]</b></code> has the context of ModbusRTU
 * @param {Buffer} buffer The data to send
 * @private
 */
function _writeBufferToPort(buffer, transactionId) {
    const transaction = this._transactions[transactionId];

    if (transaction) {
        // Only start the timeout if a response is expected
        if (transaction.nextLength > 0) {
            transaction._timeoutFired = false;
            transaction._timeoutHandle = _startTimeout(this._timeout, transaction);
        }

        // If in debug mode, stash a copy of the request payload
        if (this._debugEnabled) {
            transaction.request = Uint8Array.prototype.slice.call(buffer);
            transaction.responses = [];
        }
    }

    this._port.write(buffer);

    if (transaction && transaction.nextLength === 0) {
        // If no response is expected, call the callback immediately
        transaction.next(null, {});
    }
}

/**
 * Starts the timeout timer with the given duration.
 * If the timeout ends before it was cancelled, it will call the callback with an error.
 * @param {number} duration the timeout duration in milliseconds.
 * @param {Function} next the function to call next.
 * @return {number} The handle of the timeout
 * @private
 */
function _startTimeout(duration, transaction) {
    if (!duration) {
        return undefined;
    }
    return setTimeout(function() {
        transaction._timeoutFired = true;
        if (transaction.next) {
            const err = new TransactionTimedOutError();
            if (transaction.request && transaction.responses) {
                err.modbusRequest = transaction.request;
                err.modbusResponses = transaction.responses;
            }
            transaction.next(err);
        }
    }, duration);
}

/**
 * Cancel the given timeout.
 *
 * @param {number} timeoutHandle The handle of the timeout
 * @private
 */
function _cancelTimeout(timeoutHandle) {
    clearTimeout(timeoutHandle);
}

/**
 * Handle incoming data from the Modbus port.
 *
 * @param {Buffer} data The data received
 * @private
 */
function _onReceive(data) {
    const modbus = this;
    let error;

    // set locale helpers variables
    const transaction = modbus._transactions[modbus._port._transactionIdRead];

    // the _transactionIdRead can be missing, ignore wrong transaction it's
    if (!transaction) {
        return;
    }

    if (transaction.responses) {
        /* Stash what we received */
        transaction.responses.push(Uint8Array.prototype.slice.call(data));
    }

    /* What do we do next? */
    const next = function(err, res) {
        if (transaction.next) {
            /* Include request/response data if enabled */
            if (transaction.request && transaction.responses) {
                if (err) {
                    err.modbusRequest = transaction.request;
                    err.modbusResponses = transaction.responses;
                }

                if (res) {
                    res.request = transaction.request;
                    res.responses = transaction.responses;
                }
            }

            /* Pass the data on */
            return transaction.next(err, res);
        }
    };

    /* cancel the timeout */
    _cancelTimeout(transaction._timeoutHandle);
    transaction._timeoutHandle = undefined;

    /* check if the timeout fired */
    if (transaction._timeoutFired === true) {
        // we have already called back with an error, so don't generate a new callback
        return;
    }

    /* check incoming data
     */

    /* check minimal length
     */
    if (!transaction.lengthUnknown && data.length < 5) {
        error = "Data length error, expected " +
            transaction.nextLength + " got " + data.length;
        next(new Error(error));
        return;
    }

    /* check message CRC
     * if CRC is bad raise an error
     */
    const crcIn = data.readUInt16LE(data.length - 2);
    if (crcIn !== crc16(data.slice(0, -2))) {
        error = "CRC error";
        next(new Error(error));
        return;
    }

    // if crc is OK, read address and function code
    const address = data.readUInt8(0);
    const code = data.readUInt8(1);

    /* check for modbus exception
     */
    if (data.length >= 5 &&
        code === (0x80 | transaction.nextCode)) {
        const errorCode = data.readUInt8(2);
        if (transaction.next) {
            error = new Error("Modbus exception " + errorCode + ": " + (modbusErrorMessages[errorCode] || "Unknown error"));
            error.modbusCode = errorCode;
            next(error);
        }
        return;
    }

    /* check enron options are valid
     */
    if (modbus._enron) {
        const example = {
            enronTables: {
                booleanRange: [1001, 1999],
                shortRange: [3001, 3999],
                longRange: [5001, 5999],
                floatRange: [7001, 7999]
            }
        };

        if (typeof modbus._enronTables === "undefined" ||
                modbus._enronTables.shortRange.length !== 2 ||
                modbus._enronTables.shortRange[0] >= modbus._enronTables.shortRange[1]) {
            next(new Error("Enron table definition missing from options. Example: " + JSON.stringify(example)));
            return;
        }
    }

    /* check message length
     * if we do not expect this data
     * raise an error
     */
    if (!transaction.lengthUnknown && data.length !== transaction.nextLength) {
        error = "Data length error, expected " +
            transaction.nextLength + " got " + data.length;
        next(new Error(error));
        return;
    }

    /* check message address
     * if we do not expect this message
     * raise an error
     */
    if (address !== transaction.nextAddress) {
        error = "Unexpected data error, expected " +
              "address " + transaction.nextAddress + " got " + address;
        if (transaction.next)
            next(new Error(error));
        return;
    }

    /* check message code
     * if we do not expect this message
     * raise an error
     */
    if (code !== transaction.nextCode) {
        error = "Unexpected data error, expected " +
            "code " + transaction.nextCode + " got " + code;
        if (transaction.next)
            next(new Error(error));
        return;
    }

    /* parse incoming data
     */

    switch (code) {
        case 1:
        case 2:
            // Read Coil Status (FC=01)
            // Read Input Status (FC=02)
            _readFC2(data, next);
            break;
        case 3:
        case 4:
            // Read Input Registers (FC=04)
            // Read Holding Registers (FC=03)
            if (modbus._enron && !(transaction.nextDataAddress >= modbus._enronTables.shortRange[0] && transaction.nextDataAddress <= modbus._enronTables.shortRange[1])) {
                _readFC3or4Enron(data, next);
            } else {
                _readFC3or4(data, next);
            }
            break;
        case 5:
            // Force Single Coil
            _readFC5(data, next);
            break;
        case 6:
            // Preset Single Register
            if (modbus._enron && !(transaction.nextDataAddress >= modbus._enronTables.shortRange[0] && transaction.nextDataAddress <= modbus._enronTables.shortRange[1])) {
                _readFC6Enron(data, next);
            } else {
                _readFC6(data, next);
            }
            break;
        case 7:
            _readFC7(data, next);
            break;
        case 15:
        case 16:
            // Force Multiple Coils
            // Preset Multiple Registers
            _readFC16(data, next);
            break;
        case 20:
            modbusSerialDebug({ action: "readFC20" });
            _readFC20(data, transaction.next);
            break;
        case 43:
            // read device identification
            _readFC43(data, modbus, next);
            break;
        case 65:
            // read compressed
            _readFC65(data, next);
            break;
    }
}

/**
 * Handle SerialPort errors.
 *
 * @param {Error} error The error received
 * @private
 */
function _onError(e) {
    const err = new SerialPortError();
    err.message = e.message;
    err.stack = e.stack;
    this.emit("error", err);
}

class ModbusRTU extends EventEmitter {
    /**
     * Class making ModbusRTU calls fun and easy.
     *
     * @param {SerialPort} port the serial port to use.
     */
    constructor(port) {
        super();

        // the serial port to use
        this._port = port;

        // state variables
        this._transactions = {};
        this._timeout = null; // timeout in msec before unanswered request throws timeout error
        this._unitID = 1;

        // Flag to indicate whether debug mode (pass-through of raw
        // request/response) is enabled.
        this._debugEnabled = false;

        this._onReceive = _onReceive.bind(this);
        this._onError = _onError.bind(this);
    }

    /**
     * Open the serial port and register Modbus parsers
     *
     * @param {Function} callback the function to call next on open success
     *      of failure.
     */
    open(callback) {
        const modbus = this;

        // open the serial port
        modbus._port.open(function(error) {
            if (error) {
                modbusSerialDebug({ action: "port open error", error: error });
                /* On serial port open error call next function */
                if (callback)
                    callback(error);
            } else {
                /* init ports transaction id and counter */
                modbus._port._transactionIdRead = 1;
                modbus._port._transactionIdWrite = 1;

                /* On serial port success
                 * (re-)register the modbus parser functions
                 */
                modbus._port.removeListener("data", modbus._onReceive);
                modbus._port.on("data", modbus._onReceive);

                /* On serial port error
                 * (re-)register the error listener function
                 */
                modbus._port.removeListener("error", modbus._onError);
                modbus._port.on("error", modbus._onError);

                /* Hook the close event so we can relay it to our callers. */
                modbus._port.once("close", modbus.emit.bind(modbus, "close"));

                /* On serial port open OK call next function with no error */
                if (callback)
                    callback(error);
            }
        });
    }

    get isDebugEnabled() {
        return this._debugEnabled;
    }

    set isDebugEnabled(enable) {
        enable = Boolean(enable);
        this._debugEnabled = enable;
    }

    get isOpen() {
        if (this._port) {
            return this._port.isOpen;
        }

        return false;
    }

    /**
     * Close the serial port
     *
     * @param {Function} callback the function to call next on close success
     *      or failure.
     */
    close(callback) {
        // close the serial port if exist
        if (this._port) {
            this._port.removeAllListeners("data");
            this._port.close(callback);
        } else {
            // nothing needed to be done
            callback();
        }
    }

    /**
     * Destroy the serial port
     *
     * @param {Function} callback the function to call next on close success
     *      or failure.
     */
    destroy(callback) {
        // close the serial port if exist and it has a destroy function
        if (this._port && this._port.destroy) {
            this._port.removeAllListeners("data");
            this._port.destroy(callback);
        } else {
            // nothing needed to be done
            callback();
        }
    }

    /**
     * Write a Modbus "Read Coil Status" (FC=01) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first coil.
     * @param {number} length the total number of coils requested.
     * @param {Function} next the function to call next.
     */
    writeFC1(address, dataAddress, length, next) {
        this.writeFC2(address, dataAddress, length, next, 1);
    }

    /**
     * Write a Modbus "Read Input Status" (FC=02) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first digital input.
     * @param {number} length the total number of digital inputs requested.
     * @param {Function} next the function to call next.
     */
    writeFC2(address, dataAddress, length, next, code) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        // function code defaults to 2
        code = code || 2;

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: 3 + parseInt((length - 1) / 8 + 1) + 2,
            next: next
        };

        const codeLength = 6;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);
        buf.writeUInt16BE(length, 4);

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Read Holding Registers" (FC=03) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {number} length the total number of registers requested.
     * @param {Function} next the function to call next.
     */
    writeFC3(address, dataAddress, length, next) {
        this.writeFC4(address, dataAddress, length, next, 3);
    }

    /**
     * Write a Modbus "Read Input Registers" (FC=04) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {number} length the total number of registers requested.
     * @param {Function} next the function to call next.
     */
    writeFC4(address, dataAddress, length, next, code) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        // function code defaults to 4
        code = code || 4;

        let valueSize = 2;
        if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
            valueSize = 4;
        }

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextDataAddress: dataAddress,
            nextCode: code,
            nextLength: 3 + (valueSize * length) + 2,
            next: next
        };

        const codeLength = 6;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);
        buf.writeUInt16BE(length, 4);

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Force Single Coil" (FC=05) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the coil.
     * @param {number} state the boolean state to write to the coil (true / false).
     * @param {Function} next the function to call next.
     */
    writeFC5(address, dataAddress, state, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        let responseLength = 8;

        if (address === BROADCAST_ADDRESS) {
            responseLength = 0;
        }

        const code = 5;

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: responseLength,
            next: next
        };

        const codeLength = 6;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);

        if (state) {
            buf.writeUInt16BE(0xff00, 4);
        } else {
            buf.writeUInt16BE(0x0000, 4);
        }

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Preset Single Register " (FC=6) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the register.
     * @param {number} value the value to write to the register.
     * @param {Function} next the function to call next.
     */
    writeFC6(address, dataAddress, value, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        const code = 6;

        let responseLength = 8;
        if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
            responseLength = 10;
        }

        if (address === BROADCAST_ADDRESS) {
            responseLength = 0;
        }

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextDataAddress: dataAddress,
            nextCode: code,
            nextLength: responseLength,
            next: next
        };

        let codeLength = 6; // 1B deviceAddress + 1B functionCode + 2B dataAddress + (2B value | 4B value (enron))
        if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
            codeLength = 8;
        }

        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);

        if (Buffer.isBuffer(value)) {
            value.copy(buf, 4);
        } else if (this._enron && !(dataAddress >= this._enronTables.shortRange[0] && dataAddress <= this._enronTables.shortRange[1])) {
            buf.writeUInt32BE(value, 4);
        } else {
            buf.writeUInt16BE(value, 4);
        }

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Read Exception Status" (FC=7) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {Function} next the function to call next.
     */
    writeFC7(address, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        const code = 7;

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: 5,
            next: next
        };

        const codeLength = 2;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes
        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Force Multiple Coils" (FC=15) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first coil.
     * @param {Array} array the array of boolean states to write to coils.
     * @param {Function} next the function to call next.
     */
    writeFC15(address, dataAddress, array, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        const code = 15;
        let responseLength = 8;
        if (address === BROADCAST_ADDRESS) {
            responseLength = 0;
        }

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: responseLength,
            next: next
        };

        const dataBytes = Math.ceil(array.length / 8);
        const codeLength = 7 + dataBytes;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);
        buf.writeUInt16BE(array.length, 4);
        buf.writeUInt8(dataBytes, 6);

        // clear the data bytes before writing bits data
        for (let i = 0; i < dataBytes; i++) {
            buf.writeUInt8(0, 7 + i);
        }

        for (let i = 0; i < array.length; i++) {
            // buffer bits are already all zero (0)
            // only set the ones set to one (1)
            if (array[i]) {
                buf.writeBit(1, i, 7);
            }
        }

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Preset Multiple Registers" (FC=16) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} dataAddress the Data Address of the first register.
     * @param {Array} array the array of values to write to registers.
     * @param {Function} next the function to call next.
     */
    writeFC16(address, dataAddress, array, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || typeof dataAddress === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        const code = 16;
        let responseLength = 8;
        if (address === BROADCAST_ADDRESS) {
            responseLength = 0;
        }

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: responseLength,
            next: next
        };

        let dataLength = array.length;
        if (Buffer.isBuffer(array)) {
            // if array is a buffer it has double length
            dataLength = array.length / 2;
        }

        const codeLength = 7 + 2 * dataLength;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt16BE(dataAddress, 2);
        buf.writeUInt16BE(dataLength, 4);
        buf.writeUInt8(dataLength * 2, 6);

        // copy content of array to buf
        if (Buffer.isBuffer(array)) {
            array.copy(buf, 7);
        } else {
            for (let i = 0; i < dataLength; i++) {
                buf.writeUInt16BE(array[i], 7 + 2 * i);
            }
        }

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write Modbus "Read Device Identification" (FC=20) to serial port
     * @param {number} address the slave unit address.
     * @param {number} fileNumber the file number (1-65535) (for legacy support: 1-10). // TODO: Write better description
     * @param {number} recordNumber the record number (0-9999). // TODO: Write better description
     * @param {number} recordLength no. of record registers to read (each is 2 bytes) (old default was 100). // TODO: Write better description
     * @param {number} referenceType the reference type, 6 for standard requests. // TODO: Write better description
     * @param {Function} next;
     */
    writeFC20(address, fileNumber, recordNumber, recordLength, referenceType, next) {
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        // function code defaults to 20
        const code = 20;
        const byteCount = 7; // Fixed to 7 for a request of a single file record, to support multiple records (sub-requests), this needs to be calculated

        // We can calculate the response length
        // 1 byte for address
        // 1 byte for function code
        // 1 byte for response data length
        //   For each subrequest there is
        //      1 byte for subRequestLength
        //      1 byte for referenceType
        //      2x bytes for each record we have requested
        // 2 bytes for CRC
        // Currently we only do a single subrequest, and if read 8 registers (16 bytes) the total response length will be 5 + 16 + 2 = 23 bytes
        const responseLength = 5 + recordLength * 2 + 2; // 9 bytes for the response header, 2 bytes per record register
        modbusSerialDebug({ action: "FC20: Expecting a response of " + responseLength + " bytes" });

        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: responseLength,
            // lengthUnknown: true,
            next: next
        };

        const codeLength = 10;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt8(byteCount, 2);
        buf.writeUInt8(referenceType, 3); // ReferenceType
        buf.writeUInt16BE(fileNumber, 4);
        buf.writeUInt16BE(recordNumber, 6);
        buf.writeUInt8(recordLength, 9);

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Read Device Identification" (FC=43) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} deviceIdCode the read device access code.
     * @param {number} objectId the array of values to write to registers.
     * @param {Function} next the function to call next.
     */
    writeFC43(address, deviceIdCode, objectId, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined") {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        const code = 0x2B; // 43

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            lengthUnknown: true,
            next: next
        };

        const codeLength = 5;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes
        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt8(0x0E, 2); // 16 MEI Type
        buf.writeUInt8(deviceIdCode, 3);
        buf.writeUInt8(objectId, 4);
        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);
        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }

    /**
     * Write a Modbus "Read Parameter Number Compressed" (FC=65) to serial port.
     *
     * @param {number} address the slave unit address.
     * @param {number} parameterNumbers a list of parameter numbers to be requested.
     * @param {Function} next the function to call next.
     */
    writeFC65(address, parameterNumbers, next) {
        // check port is actually open before attempting write
        if (this.isOpen !== true) {
            if (next) next(new PortNotOpenError());
            return;
        }

        // sanity check
        if (typeof address === "undefined" || !Array.isArray(parameterNumbers) || parameterNumbers.length > 16) {
            if (next) next(new BadAddressError());
            return;
        }

        if (address === BROADCAST_ADDRESS) {
            if (next) next(new BroadcastNotAllowedError());
            return;
        }

        const code = 0x41; // 65
        const quantityOfParameters = parameterNumbers.length;

        // set state variables
        this._transactions[this._port._transactionIdWrite] = {
            nextAddress: address,
            nextCode: code,
            nextLength: 4 + 2 * quantityOfParameters + 3, // The expected length of the response
            next: next
        };

        const codeLength = 3 + 2 * quantityOfParameters;
        const buf = Buffer.alloc(codeLength + 2); // add 2 crc bytes

        buf.writeUInt8(address, 0);
        buf.writeUInt8(code, 1);
        buf.writeUInt8(quantityOfParameters, 2);

        parameterNumbers.forEach((pnu, index) => {
            buf.writeUInt16BE(pnu, 3 + 2 * index);
        });

        // add crc bytes to buffer
        buf.writeUInt16LE(crc16(buf.slice(0, -2)), codeLength);

        // write buffer to serial port
        _writeBufferToPort.call(this, buf, this._port._transactionIdWrite);
    }
}

// add the connection shorthand API
require("./apis/connection")(ModbusRTU);

// add the promise API
require("./apis/promise")(ModbusRTU);

// add worker API
require("./apis/worker")(ModbusRTU);

// exports
module.exports = ModbusRTU;
module.exports.TestPort = require("./ports/testport");
try {
    module.exports.RTUBufferedPort = require("./ports/rtubufferedport");
} catch (err) { }
module.exports.TcpPort = require("./ports/tcpport");
module.exports.TcpRTUBufferedPort = require("./ports/tcprtubufferedport");
module.exports.TelnetPort = require("./ports/telnetport");
module.exports.C701Port = require("./ports/c701port");

module.exports.ServerTCP = require("./servers/servertcp");
module.exports.ServerSerial = require("./servers/serverserial");
module.exports.default = module.exports;
