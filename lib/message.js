"use strict";

var util = require("util");
var assert = require("assert");

/**
 * @class
 * @param {!String} messageName - name of the message
 * @param {*} [parameters] - parameters to the message
 * @param {?Object} options - options to be used for sending the message; this argument must be present, but can be empty or null.
 * @param {Number} [options.expiration=0] - Time in milliseconds after which the message will be discarded from the queue (default = 0 = never).
 * @param {String} [options.correlationId] - A string to identify a message; normally used in request-reply scenarios where the request must be mapped to the originating reply.
 * @param {String} [options.replyTo] - The name of the queue where replies to this message should be sent; the queue will be automatically created when it doesn't exist yet.
 * @param {String} [options.messageId] - An arbitrary application-specific identifier for the message.
 * @param {Number} [options.timestamp] - An application-specific timestamp; not used by the message queue infrastructure
 * @param {String} [options.type] - An arbitrary application-specific type for the message
 * @param {String} [options.appId] - An arbitrary identifier for the originating application
*/
function Message(messageName, parameters, options) {
  assert(util.isString(messageName), "messageName must be a string");
  assert.notEqual(messageName.length, 0);
  assert(!options || util.isObject(options));

  /**
   * @type {!String}
   * @public
   */
  this.name = messageName;
  /**
   * @type {!String}
   * @public
   */
  this.parameters = parameters;
  /**
   * @type {!String}
   * @public
   */
  this.options = options;
}

module.exports = Message;
