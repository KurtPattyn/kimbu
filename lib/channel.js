"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");
var assert = require("assert");
var Message = require("./message");
var utils = require("./utils");

/**
 * @callback PublishCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @memberof MessageRecipient
*/

/**
 * @callback ConsumeCallback
 * @param {Message} message - the message that has been received
 * @memberof MessageRecipient
 */

/**
 * A MessageEndpoint is responsible to send or retrieve messages through the supplied provider.
 *
 * @param {!String} name - Name of the endpoint
 * @param {!String} distributorName - Name of the distributor endpoint this endpoint is connected to.
 * @param {!Transport} provider - Messagebus transport provider.
 * @class
*/
function MessageEndpoint(name, distributorName, provider) {
  this._name = name;
  this._distributorName = distributorName;
  this._provider = provider;
}

/**
 * Concrete implementation of the publish method.
 *
 * @param {!Message} msg - The message to be published.
 * @param {!String} routingKey - the routing key to be used for routing the message to its endpoint(s).
 * @param {Function} [callback] - Optional callback called when publishing finishes.
 */
MessageEndpoint.prototype._doPublish = function(msg, routingKey, callback) {
  this._provider.publish(this._distributorName, msg, routingKey, function(err) {
    utils.callLater(callback, err);
  });
};

/**
 * A MessageRecipient is an endpoint for messages distributed by a {@link MessageDistributor}
 * or received through a {@link MessageRecipient#publish} call.
 *
 * @extends MessageEndpoint
 * @class
*/
function MessageRecipient(name, provider) {
  MessageEndpoint.call(this, name, "", provider);
}
util.inherits(MessageRecipient, MessageEndpoint);

/**
 * Publishes a message directly to the recipient circumventing any intermediate routing.
 *
 * @param {!Message} msg - the message to publish
 * @param {Function} [callback] - optional callback indicating success or failure.
*/
MessageRecipient.prototype.publish = function(msg, callback) {
  this._doPublish(msg, this._name, callback);
};

/**
 * Consumes messages from the recipient. When a message is available, the given callback is called
 * with the received message.
 *
 * @param {!Object} options - endpoint specific options that configure how messages are consumed.
 * @param {Function} [callback] - Called when a message is consumed.
 * @param {ErrorCallback} successCallback - called when the subscription to the recipient finishes.
 */
MessageRecipient.prototype.consume = function(options, callback, successCallback) {
  var self = this;

  this._provider.consume(this._name, options, callback, function(err, registrationId) {
    var consumerTag = null;

    /* istanbul ignore else */
    if (!err) {
      consumerTag = registrationId.consumerTag;
      self._registrationId = consumerTag;
    }
    successCallback(err, consumerTag);
  });
};

/**
 * Cancels consumation from the recipient.
 *
 * @param {!Function} callback - Called when consumation has finished.
 */
MessageRecipient.prototype.cancelConsume = function(callback) {
  /* istanbul ignore else */
  if (!util.isNullOrUndefined(this._registrationId)) {
    var registrationId = this._registrationId;

    this._consumationCanceled = true;
    this._registrationId = null;
    this._provider.cancelConsume(registrationId, callback);
  } else {
    utils.callLater(callback, null);
  }
};

/**
 * Purges all messages from the recipient.
 *
 * @param {ErrorCallback} callback - called when the messages have been purged.
 */
MessageRecipient.prototype.purge = function(callback) {
  if (!this._consumationCanceled) {
    this._provider.purge(this._name, callback);
  } else {
    callback(null);
  }
};

/**
 * A MessageDistributor is an endpoint responsible for distributing messages using the
 * configured provider to the interested consumers. It is not possible to consume messages from
 * a distributor.
 *
 * @see MessageRecipient
 * @class
 * @extends MessageEndpoint
*/
function MessageDistributor(name, provider) {
  MessageEndpoint.call(this, name, name, provider);
}
util.inherits(MessageDistributor, MessageEndpoint);

/**
 * Publishes a message directly to a distribution endpoint which will route it to interesting parties.
 *
 * @param {!Message} msg - the message to publish
 * @param {Function} [callback] - optional callback indicating success or failure.
 */
MessageDistributor.prototype.publish = function(msg, callback) {
  if (this._stopped) {
    callback(new Error("Publishing is stopped."));
  } else {
    this._doPublish(msg, msg.name, callback);
  }
};

/**
 * Disables publishing to the distributor.
 *
 * @param {!Function} callback - Called when stop has finished.
 */
MessageDistributor.prototype.stop = function(callback) {
  this._stopped = true;
  callback(null);
};

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
DispatchChannel.prototype.start = function(callback) {
  var self = this;

  this._replyQueue.consume({}, function(msg, next) {
    self.emit("reply:" + msg.options.correlationId, msg.parameters, next);
  }, callback);
};

/**
 * @override
 * @inheritDoc
 */
DispatchChannel.prototype.stop = function(callback) {
  var self = this;

  this._replyQueue.cancelConsume(function(err) {
    /* istanbul ignore else */
    if (!err) {
      self._dispatchQueue.stop(callback);
    } else {
      callback(err);
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

  var self = this;
  var msgOptions = {
    replyTo: this._replyQueue._name,
    correlationId: process.pid + "." + (++this._id),
    type: "command"
  };

  msgOptions = utils.extend(msgOptions, options);

  self.once("reply:" + msgOptions.correlationId, function(reply, next) {
    var answer = reply.result;
    var error = reply.error ? new Error(reply.error) : null;

    setImmediate(callback.bind(self, error, answer));
    next();
  });
  var message = new Message(cmd, parameters, msgOptions);

  self._dispatchQueue.publish(message, function(err) {
    message = null;
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

  var msgOptions = {
    type: "event"
  };

  msgOptions = utils.extend(msgOptions, options);

  callback = callback || function() {};
  var msg = new Message(eventName, parameters, msgOptions);

  this._dispatchQueue.publish(msg, function(err) {
    callback(err);
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

/**
 * @override
 * @inheritDoc
 */
ConsumeChannel.prototype.start = function(cb) {
  var self = this;

  this._consumeQueue.consume({}, function(msg, next) {
    var msgName = /*msg.options.type + ":" +*/ msg.name;

    if (EventEmitter.listenerCount(self, msgName) > 0) {
      self.emit(msgName, msg.parameters, function(reply, callback) {
        if (msg.options.type === "command") {
          var content;

          if (reply instanceof Error) {
            content = { error: reply.message };
          } else {
            content = {result: reply};
          }

          var msgOptions = {
            correlationId: msg.options.correlationId,
            type: "reply"
          };
          var replyMsg = new Message("reply", content, msgOptions);

          var replyQueue = new MessageRecipient(msg.options.replyTo, self._provider);

          replyQueue.publish(replyMsg, function(err) {
            next(); //acknowledge
            replyMsg = null;
            replyQueue = null;
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
      console.error("Received message %j with no defined handler.", msg);
      /* istanbul ignore else */
      if (msg.options.type === "command") {
        var msgOptions = {
          correlationId: msg.options.correlationId,
          type: "reply"
        };
        var content = { error: "Message could not be handled by receiver" };
        var replyMsg = new Message("reply", content, msgOptions);

        var replyQueue = new MessageRecipient(msg.options.replyTo, self._provider);

        replyQueue.publish(replyMsg, function(err) {
          replyMsg = null;
          replyQueue = null;
        });
      }
    }
  }, cb);
};

/**
 * @override
 * @inheritDoc
 */
ConsumeChannel.prototype.stop = function(cb) {
  var self = this;

  this._consumeQueue.cancelConsume(function(err) {
    /* istanbul ignore else */
    if (!err) {
      self._dispatchQueue.stop(cb);
    } else {
      cb(err);
    }
  });
};

/**
 * Callback to call when the command has been processed.
 *
 * @callback CommandNextCallback
 * @param {?Error|Object|Array|Number|String|Boolean|Date} parameters - the parameters supplied to the request.
 * @param {?ErrorCallback} callback - An optional callback to receive an indication if the reply was correctly processed.
 */

/**
 * Callback to call when the event has been processed.
 *
 * @callback EventNextCallback
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
 * Called when an event is received.
 *
 * @callback EventCallback
 * @param {Object|Array|Number|String|Boolean|Date} parameters - the parameters supplied to the event.
 * @param {!EventNextCallback} next - callback to call when the command has been processed.
 */

/**
 * Subscribes the channel to messages with the given name. When a message with the given name is received,
 * the supplied callback is invoked with the originating parameters (see {@link DispatchChannel#request} and
 * {@link DispatchChannel#publish}).
 *
 * @param {!String} msgName - the name of the message to subscribe to.
 * @param {!CommandCallback|EventCallback} callback - callback to call when a message with the given msgName is received.
 */
ConsumeChannel.prototype.on = function(msgName, callback) {
  var self = this;

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
  var self = this;

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

module.exports.DispatchChannel = DispatchChannel;
module.exports.ConsumeChannel = ConsumeChannel;
