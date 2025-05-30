"use strict";
/**
 * Copyright (c) 2015, Yaacov Zamir <kobi.zamir@gmail.com>
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

/**
 * Take a modbus serial function and convert it to use promises.
 *
 * @param {Function} f the function to convert
 * @return a function that calls function "f" and return a promise.
 * @private
 */
const _convert = function(f) {
    const converted = function(...args) {
        const client = this;
        const id = this._unitID;
        const next = args[args.length - 1]; // The last argument is the callback or promise resolve function

        if (typeof next === "function") {
            // Use the callback
            f.bind(client)(id, ...args.slice(0, -1), next);
        } else {
            const promise = new Promise(function(resolve, reject) {
                function cb(err, data) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(data);
                    }
                }

                f.bind(client)(id, ...args, cb);
            });

            return promise;
        }
    };

    return converted;
};
// const _convert = function(f) {
//     const converted = function(address, arg, next) {
//         const client = this;
//         const id = this._unitID;

//         /* the function check for a callback
//          * if we have a callback, use it
//          * o/w build a promise.
//          */
//         if (next) {
//             // if we have a callback, use the callback
//             f.bind(client)(id, address, arg, next);
//         } else {
//             // o/w use  a promise
//             const promise = new Promise(function(resolve, reject) {
//                 function cb(err, data) {
//                     if (err) {
//                         reject(err);
//                     } else {
//                         resolve(data);
//                     }
//                 }

//                 f.bind(client)(id, address, arg, cb);
//             });

//             return promise;
//         }
//     };

//     return converted;
// };

/**
 * Adds promise API to a Modbus object.
 *
 * @param {ModbusRTU} Modbus the ModbusRTU object.
 */
const addPromiseAPI = function(Modbus) {

    const cl = Modbus.prototype;

    // set/get unitID
    cl.setID = function(id) {this._unitID = Number(id);};
    cl.getID = function() {return this._unitID;};

    // set/get timeout
    cl.setTimeout = function(timeout) {this._timeout = timeout;};
    cl.getTimeout = function() {return this._timeout;};

    // convert functions to return promises
    cl.readCoils = _convert(cl.writeFC1);
    cl.readDiscreteInputs = _convert(cl.writeFC2);
    cl.readHoldingRegisters = _convert(cl.writeFC3);
    cl.readRegistersEnron = _convert(cl.writeFC3);
    cl.readInputRegisters = _convert(cl.writeFC4);
    cl.writeCoil = _convert(cl.writeFC5);
    cl.writeRegister = _convert(cl.writeFC6);
    cl.writeRegisterEnron = _convert(cl.writeFC6);
    cl.writeCoils = _convert(cl.writeFC15);
    cl.writeRegisters = _convert(cl.writeFC16);
    cl.readFileRecords = _convert(cl.writeFC20);
    cl.readExceptionStatus = _convert(cl.writeFC7);
    cl.readDeviceIdentification = _convert(cl.writeFC43);
    cl.readCompressed = _convert(cl.writeFC65);
};

/**
 * Promise API Modbus library.
 *
 * @type {addPromiseAPI}
 */
module.exports = addPromiseAPI;
