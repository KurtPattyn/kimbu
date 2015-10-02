"use strict";

var util = require("util");
var assert = require("assert");
var Channel = require("./channel");
var utils = require("./utils");
var MessageDistributor = require("./endpoint").MessageDistributor;
var MessageRecipient = require("./endpoint").MessageRecipient;
var Message = require("./message");

/**
 * <p>The DispatchChannel class implements a channel that dispatches the messages
 * to interested consumers.</p>
 * <p>Two messaging patterns are implemented:
 * <li>**Request-reply pattern**: a request is sent, a consumer picks it up, replies to the request
 * and the reply is returned to the caller (RPC-like).</li>
 * <li>**Fanout pattern**: a message is published and zero or more listeners receive the message.
 * There is no reply.</li></p>
 * <p>A DispatchChannel is normally not created directly, but through a call to
 * {@link Transport#dispatchChannel}.</p>
 *
 * @class
 * @constructor
 * @param {!String} distributorName - The name of the distributor endpoint.
 * @param {!String} replyRecipientName - Name of the MessageRecipient where replies to requests will be delivered.
 * @param {!Transport} provider - The message bus transport provider.
 * @public
 * @extends {Channel}
 * @see MessageDistributor
 * @see MessageRecipient
 */
function DispatchChannel(distributorName, replyRecipientName, provider) {
  assert(util.isString(distributorName), "Must provide a valid distributor name");
  assert(util.isString(replyRecipientName), "Must provide a valid reply recipient name");
  assert(!util.isNullOrUndefined(provider), "Must provide a valid message bus transport provider");
  assert(!util.isNullOrUndefined(provider.constructor.super_),
    "Must provide a valid message bus transport provider");

  //Not using instanceof because we need to require the Transport file
  //and this leads to circular include references
  assert.strictEqual(provider.constructor.super_.name, "Transport");
  Channel.call(this, provider);

  this._dispatchQueue = new MessageDistributor(distributorName, provider);
  this._replyQueue = new MessageRecipient(replyRecipientName, provider);
  this._id = 0;
}

util.inherits(DispatchChannel, Channel);


/**
 * @override
 * @inheritDoc
 */
DispatchChannel.prototype.start = function(callback) {
  const self = this;

  this._replyQueue.consume({}, function(msg, next) {
    self.emit("reply:" + msg.options.correlationId, msg.parameters, next);
  }, callback);
};

/**
 * @override
 * @inheritDoc
 */
DispatchChannel.prototype.stop = function(callback) {
  const self = this;

  this._replyQueue.cancelConsume(function(err) {
    /* istanbul ignore if */
    if (err) {
      callback(err);
    } else {
      self._dispatchQueue.stop(callback);
    }
  });
};

/**
 * Called when a request has finished.
 *
 * @callback RequestCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @param {?Object|Array|Number|String|Boolean|Date} reply - the reply of the request.
 * @public
 * @static
 */

/**
 * Sends a request over the channel. The reply to the request is delivered through the supplied callback.
 * This is an RPC-like call, aka request-response.
 *
 * @param {!String} cmd - The command to execute.
 * @param {!Object|Array|Number|String|Boolean|Date} parameters - A valid Javascript type used as parameter(s) to the command.
 * @param {!Object} options - Message options for the request.
 * @param {!RequestCallback} callback - Called when the request is finished.
 *
 * @final
 */
DispatchChannel.prototype.request = function request(cmd, parameters, options, callback) {
  assert(util.isString(cmd), "cmd must be a string");
  assert(cmd.length > 0, "cmd must not be an empty string");
  assert(!util.isNullOrUndefined(parameters), "parameters must be a valid (possible empty) object");
  assert.ok(util.isObject(options), "'options' must be a valid object (possibly empty)");
  assert(util.isFunction(callback), "callback must be a valid function");

  const self = this;
  let msgOptions = {
    replyTo: this._replyQueue._name,
    correlationId: process.pid + "." + (++this._id),
    type: "command"
  };

  msgOptions = utils.extend(msgOptions, options);

  self.once("reply:" + msgOptions.correlationId, function(reply, next) {
    const answer = reply.result;
    const error = reply.error ? new Error(reply.error) : null;

    setImmediate(callback.bind(self, error, answer));
    next();
  });
  const message = new Message(cmd, parameters, msgOptions);

  self._dispatchQueue.publish(message, function(err) {
    /* istanbul ignore next */
    if (err) {
      self.removeListener("reply:" + msgOptions.correlationId, callback);
      callback(err);
    }
  });
};

/**
 * Publishes an event over the channel. A publication does not receive a reply as there can be many subscribers.
 * This is a pub-sub style of messaging.
 *
 * @param {!String} eventName - The event to publish.
 * @param {!Object|Array|Number|String|Boolean|Date} parameters - A valid Javascript type used as parameter(s) to the event.
 * @param {!Object} options - Message options for the event.
 * @param {ErrorCallback} [callback] - Called when the publication succeeds.
 *
 * @final
 */
DispatchChannel.prototype.publish = function publish(eventName, parameters, options, callback) {
  assert(util.isString(eventName), "eventName must be a string");
  assert(eventName.length > 0, "eventName must not be an empty string");
  assert(!util.isNullOrUndefined(parameters));
  assert.ok(util.isObject(options), "'options' must be a valid object (possibly empty)");
  assert(!callback || util.isFunction(callback), "callback must be a valid function");

  let msgOptions = {
    type: "event"
  };

  msgOptions = utils.extend(msgOptions, options);

  const cb = callback || function() {};
  const msg = new Message(eventName, parameters, msgOptions);

  this._dispatchQueue.publish(msg, function(err) {
    cb(err);
  });
};

/**
 * Purges any outstanding messages from the dispatch channel.
 *
 * @param {Function} [callback] - called when the messages have been purged (successfully or not)
 * @final
 */
DispatchChannel.prototype.purge = function purge(callback) {
  assert(!callback || util.isFunction(callback), "callback must be a valid function");

  this._replyQueue.purge(callback);
};

module.exports = DispatchChannel;
