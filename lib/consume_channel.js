"use strict";

var assert = require("assert");
var util = require("util");
var EventEmitter = require("events").EventEmitter;
var konsol = require("Konsol")("kimbu");
var Message = require("./message");
var MessageRecipient = require("./endpoint").MessageRecipient;
var MessageDistributor = require("./endpoint").MessageDistributor;
var Channel = require("./channel");

/**
 * Callback to call when the command has been processed.
 *
 * @callback CommandNextCallback
 * @param {?Error|Object|Array|Number|String|Boolean|Date} parameters - the parameters supplied to the request.
 * @param {?ErrorCallback} callback - An optional callback to receive an indication if the reply was correctly processed.
 */

/**
 * Called when a command is received.
 *
 * @callback CommandCallback
 * @param {Object|Array|Number|String|Boolean|Date} parameters - the parameters supplied to the request.
 * @param {!CommandNextCallback} next - callback to call when the command has been processed.
 */

/**
 * Callback to call when the event has been processed.
 *
 * @callback EventNextCallback
 * @param {?ErrorCallback} callback - An optional callback to receive an indication if the reply was correctly processed.
 */

/**
 * Called when an event is received.
 *
 * @callback EventCallback
 * @param {Object|Array|Number|String|Boolean|Date} parameters - the parameters supplied to the event.
 * @param {!EventNextCallback} next - callback to call when the command has been processed.
 */

/**
 * The ConsumeChannel class implements a channel that receives messages from a
 * {@link MessageDistributor} and that can return replies from received messages.
 *
 * @param {!String} recipientName - name of the recipient endpoint (see {@link MessageRecipient}).
 * @param {!String} distributorName - name of the distributor endpoint (see {@link MessageDistributor}).
 * @param {!Transport} provider - The message bus transport provider.
 *
 * @class
 * @extends {Channel}
 * @see MessageDistributor
 * @see MessageRecipient
 */
function ConsumeChannel(recipientName, distributorName, provider) {
  assert(util.isString(recipientName), "Must provide a valid recipient name");
  assert(util.isString(distributorName), "Must provide a valid distributor name");
  assert(!util.isNullOrUndefined(provider), "Must provide a valid message bus transport provider");
  assert(!util.isNullOrUndefined(provider.constructor.super_),
    "Must provide a valid message bus transport provider");

  //Not using instanceof because we need to require the Transport file
  //and this leads to circular include references
  assert.strictEqual(provider.constructor.super_.name, "Transport");
  Channel.call(this, provider);

  this._consumeQueue = new MessageRecipient(recipientName, provider);
  this._dispatchQueue = new MessageDistributor(distributorName, provider);
}

util.inherits(ConsumeChannel, Channel);

/**
 * @override
 * @inheritDoc
 */
ConsumeChannel.prototype.start = function(cb) {
  let self = this;

  this._consumeQueue.consume({}, function(msg, next) {
    const msgName = /*msg.options.type + ":" +*/ msg.name;

    if (EventEmitter.listenerCount(self, msgName) > 0) {
      self.emit(msgName, msg.parameters, function(reply, callback) {
        if (msg.options.type === "command") {
          let content;

          if (reply instanceof Error) {
            content = { error: reply.message };
          } else {
            content = {result: reply};
          }

          const msgOptions = {
            correlationId: msg.options.correlationId,
            type: "reply"
          };
          const replyMsg = new Message("reply", content, msgOptions);
          const replyQueue = new MessageRecipient(msg.options.replyTo, self._provider);

          replyQueue.publish(replyMsg, function(err) {
            next(); //acknowledge
            /* istanbul ignore next */
            if (callback) {
              callback(err);
            }
          });
        } else {
          next(); //acknowledge
          /* istanbul ignore next */
          if (callback) {
            callback();
          }
        }
      });
    } else {
      next(); //acknowledge
      konsol.error("Received message %j with no defined handler.", msg);
      /* istanbul ignore else */
      if (msg.options.type === "command") {
        const msgOptions = {
          correlationId: msg.options.correlationId,
          type: "reply"
        };
        const content = { error: "Message could not be handled by receiver" };
        const replyMsg = new Message("reply", content, msgOptions);

        const replyQueue = new MessageRecipient(msg.options.replyTo, self._provider);

        replyQueue.publish(replyMsg, function(/* err */) {});
      }
    }
  }, cb);
};

/**
 * @override
 * @inheritDoc
 */
ConsumeChannel.prototype.stop = function(cb) {
  let self = this;

  this._consumeQueue.cancelConsume(function(err) {
    /* istanbul ignore if */
    if (err) {
      cb(err);
    } else {
      self._dispatchQueue.stop(cb);
    }
  });
};

/**
 * Subscribes the channel to messages with the given name. When a message with the given name is received,
 * the supplied callback is invoked with the originating parameters (see {@link DispatchChannel#request} and
 * {@link DispatchChannel#publish}).
 *
 * @param {!String} msgName - the name of the message to subscribe to.
 * @param {!CommandCallback|EventCallback} callback - callback to call when a message with the given msgName is received.
 */
ConsumeChannel.prototype.on = function(msgName, callback) {
  let self = this;

  EventEmitter.prototype.on.call(self, msgName, callback);
  this._provider.bind(this._consumeQueue._name, this._dispatchQueue._name, msgName, function(err) {
    /* istanbul ignore next */
    if (err) {
      self.removeListener(msgName, callback);
    }
  });
};

/**
 * Unsubscribes the consume channel from messages with the given name.
 *
 * @param {!String} msgName - Name of the messages to stop watching.
 */
ConsumeChannel.prototype.off = function(msgName) {
  let self = this;

  this._provider.unbind(this._consumeQueue._name, this._dispatchQueue._name,
    msgName, function(ignore) {
      self.removeAllListeners(msgName);
    });
};

/**
 * Purges any outstanding messages from the consume channel.
 *
 * @param {Function} [callback] - called when the messages have been purged (successfully or not)
 * @final
 */
ConsumeChannel.prototype.purge = function purge(callback) {
  assert(!callback || util.isFunction(callback), "callback must be a valid function");

  this._consumeQueue.purge(callback);
};

module.exports = ConsumeChannel;
