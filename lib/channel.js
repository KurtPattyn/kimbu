"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");

/**
 * A Channel represents a logical one-way communication path that transmits messages from a client to a message bus
 * backend fabric. The physical transmission medium is defined by the supplied Transport.
 *
 * @class
 *
 * @param {!Transport} provider - Represents the physical transmission medium.
 *
 * @abstract
 */
function Channel(provider) {
  EventEmitter.call(this);
  this._provider = provider;
}

util.inherits(Channel, EventEmitter);

/* istanbul ignore next  */
/**
 * Starts the channel and makes it ready to send and/or receive messages.
 *
 * @param {ErrorCallback} callback - Called when the channel finished starting up.
 * @abstract
 */
Channel.prototype.start = function(callback) {
  throw new Error("'start()' must be implemented by subclasses");
};

/* istanbul ignore next  */
/**
 * Stops the channel. Sending and/or receiving messages will not be possible anymore.
 *
 * @param {ErrorCallback} callback - Called when the channel finished starting up.
 * @abstract
 */
Channel.prototype.stop = function(callback) {
  throw new Error("'stop()' must be implemented by subclasses");
};

module.exports = Channel;
