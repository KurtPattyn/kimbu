"use strict";

//disable warnings about unnecessary semicolons
/*jshint -W032 */

/**
 * @external EventEmitter
 * @see https://nodejs.org/api/events.html
*/
var EventEmitter = require("events").EventEmitter;
var util = require("util");
var assert = require("assert");
var path = require("path");
var utils = require("./utils");
var Message = require("./message");

/**
 * Transport defines an interface to be implemented by all concrete message bus transports.
 *
 * @param {!Object} options - Provider specific options for the connection setup. See the respective plugin providers for
 * the list of possible options. The options argument should not be null or undefined. An empty options object is fine.
 *
 * @class
 * @extends {EventEmitter}
 * @abstract
 * @public
*/
function Transport(options) {
  assert(!Boolean(!options),
         "You must provide a valid options object (can be an empty object ({}) )");

  EventEmitter.call(this);

  /**
   * @private
   * @readonly
  */
  this._options = options;
  this._isConnecting = false;
  this._isDisconnecting = false;
}
util.inherits(Transport, EventEmitter);

module.exports = Transport;

var transportModulesPath = path.join(path.dirname(module.filename), "./transportproviders");

Transport.providers = utils.findModulesSync(transportModulesPath, Transport);

/**
 * Called when a connection attempt has finished.
 *
 * @callback ErrorCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @public
 * @static
 */

/**
 * Called when a connection attempt has finished.
 *
 * @callback ConnectCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @memberof Transport
 * @public
 * @alias Transport.ConnectCallback
*/

/**
 * Called when a connection has been closed, either by manually calling disconnect() or by the backend service.
 *
 * @callback DisconnectCallback
 * @param {?Error} error - the error that occurred; null if there was no error.
 * @memberof Transport
 * @public
 * @alias Transport.DisconnectCallback
*/

/**
 * Called when publication of a message has finished.
 *
 * @callback PublishCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @memberof Transport
 * @public
 * @alias Transport.PublishCallback
 */

/**
 * @callback ChannelCallback
 * @param {?Error} error - the error that occurred; null if there was no error
 * @param {?Channel} channel - the retrieved channel
 * @memberof Transport
 * @public
 * @alias Transport.ChannelCallback
*/

/**
 * Emitted when a succesful connection to the backend message bus service is established. The event takes no arguments.
 *
 * @event connected
 * @memberof Transport
 *
 * @public
 * @alias Transport.connected
*/

/**
 * Emitted when a connection to the backend message bus service is closed. The event takes no arguments.
 *
 * @event disconnected
 * @memberof Transport
 *
 * @public
 * @alias Transport.disconnected
*/

/**
 * Connects to the message bus backend service and calls callback when ready or on error.
 * This method also emits a 'connected' event when the connection has been established.
 * If the connection was already open, then the callback is called with the current connection. In the latter case
 * no 'connected' event is emitted.
 *
 * @param {Transport.ConnectCallback} [callback] - called when the connection is established.
 *
 * @fires Transport.connected
 * @fires EventEmitter.error
 *
 * @public
 * @final
*/
Transport.prototype.connect = function(callback) {
  var self = this;

  if (this._isConnecting) {
    this.once("connected", function () {
      utils.callLater(callback, null);
    });
    this.once("connectionFailed", function(err) {
      utils.callLater(callback, err);
    });
    return;
  }

  //note: _doConnect is never called when there is already a valid connection
  if (this.isConnected()) {
    utils.callLater(callback, null);
  } else {
    this._isConnecting = true;

// jscs:disable jsDoc
    self._doConnect(function _doConnectCallback(err) {
// jscs:enable jsDoc
      self._isConnecting = false;
      if (util.isFunction(callback)) {
        utils.callLater(callback, err);
      }
      if (err) {
        self.emit("connectionFailed", err);
      } else {
        self.emit("connected", self);
      }
    });
  }
};

/**
 * Returns true if a connection is established with the backend message bus service.
 *
 * @returns {Boolean}
 *
 * @public
 * @final
*/
Transport.prototype.isConnected = function() {
  return this._doIsConnected();
};

/**
 * Disconnects from the message bus backend service. If there was no connection this method does nothing.
 *
 * @param {Transport.DisconnectCallback} [callback] - Optional callback called when
 * the provider has been disconnected or when an error occurred.
 *
 * @fires Transport.event:disconnected
 * @public
 * @final
 * @see Transport#isConnected
*/
Transport.prototype.disconnect = function(callback) {
  var self = this;

  if (this._isDisconnecting) {
    if (util.isFunction(callback)) {
      this.once("disconnected", function() {
        utils.callLater(callback, null);
      });
    }
    return;
  }
  if (this.isConnected()) {
    this._isDisconnecting = true;

// jscs:disable jsDoc
    this._doDisconnect(function _doDisconnectCallback(err) {
      self._isDisconnecting = false;

// jscs:enable jsDoc
      if (util.isFunction(callback)) {
        utils.callLater(callback, err);
      }
    });
  } else {
    if (util.isFunction(callback)) {
      utils.callLater(callback, null);
    }
  }
};

/**
 * Requests a dispatch channel with the given name. When done, the given callback is called,
 * either with an error (first argument) or with the requested channel.
 *
 * @param {!String} dispatchChannelName - Name of the dispatch channel to retrieve.
 * @param {!Transport.ChannelCallback} callback - Called when dispatchChannel is retrieved.
 *
 * @see ConsumeChannel
 * @public
 * @final
*/
Transport.prototype.dispatchChannel = function(dispatchChannelName, callback) {
  assert.ok(util.isString(dispatchChannelName), "Must provide a valid name.");
  assert.ok(dispatchChannelName.length > 0, "Must provide a valid name.");
  assert.ok(util.isFunction(callback), "'dispatchChannel()' must have a valid callback");
  assert.ok(this.isConnected(),
            "Must have an open connection before a dispatch channel can be retrieved.");

  this._doGetDispatchChannel(dispatchChannelName, {}, function(err, channel) {
    utils.callLater(callback, err, channel);
  });
};

/**
 * Retrieve a {@link ConsumeChannel} with the given parameters.
 *
 * @param {!String} consumeChannelName - Name of the consume channel to retrieve.
 * @param {!String} dispatchChannelName - Name of the dispatch channel from which this consume channel
 * must consume.
 * @param {!function(?err, ?Channel)} callback - Called when consumeChannel has finished.
 *
 * @example
 * var rmq = new RabbitMQTransport();
 * rmq.consumeChannel("myConsumeChannel", "someDispatchChannel", function(err, consumeChannel) {
 *   if (err) {
 *     //some error occurred
 *   } else {
 *     consumeChannel.publish("happyMessage", "Hi, I got a consumeChannel!");
 *   }
 * });
 * @public
 * @final
*/
Transport.prototype.consumeChannel = function(consumeChannelName,
                                              dispatchChannelName,
                                              callback) {
  assert.ok(util.isString(consumeChannelName), "Must provide a valid consume channel name.");
  assert(consumeChannelName.length > 0, "Must provide a valid consume channel name.");
  assert.ok(util.isString(dispatchChannelName), "Must provide a valid dispatch channel name.");
  assert.ok(util.isFunction(callback), "'consumeChannel()' must have a valid callback");
  assert.ok(this.isConnected(),
            "Must have an open connection before a consume channel can be retrieved.");

  this._doGetConsumeChannel(consumeChannelName, dispatchChannelName, {}, function(err, channel) {
    utils.callLater(callback, err, channel);
  });
};

//TODO: remove this method; should not be exposed for the sake of lower levels
/**
 * Called by a lower level implementation.
 *
 * @param {!String} exchangeName - Name of the distribution endpoint to post the message to.
 * @param {!Message} msg - Message to be published.
 * @param {!String} routingKey - routing key to be used to distribute the message to its endpoint(s).
 * @param {Function} [callback] - called when the publication finished (successful or not).
 * @protected
 * @final
 *
*/
Transport.prototype.publish = function(exchangeName, msg, routingKey, callback) {
  assert.ok(util.isString(exchangeName), "Must provide a valid exchange name.");
  assert.ok(msg, "Must provide a valid 'msg'.");
  assert(msg instanceof Message, "'msg' must be a Message object.");
  assert.ok(util.isString(routingKey), "'routingKey' must be a valid string.");
  assert.ok(routingKey.length > 0, "'routingKey' must not be an empty string.");
  assert.ok(util.isFunction(callback), "publish() must have a valid callback.");
  assert.ok(this.isConnected(),
            "Must have an open connection before a message can be published.");

// jscs:disable jsDoc
  this._doPublish(exchangeName, msg, routingKey, function _doPublishCallback(err) {
// jscs:enable jsDoc
    utils.callLater(callback, err);
  });
};

/**
 * Called by a lower level implementation
 *
 * @param {!String} queueName - name of the queue to purge.
 * @param {Function} [callback] - called when the queue has been purged (successful or not)
 * @protected
 * @final
 */
Transport.prototype.purge = function(queueName, callback) {
  assert.ok(util.isString(queueName), "Must provide a valid queue name.");
  assert.ok(queueName.length > 0, "Must provide a valid queue name.");
  assert(!callback || util.isFunction(callback), "Must provide a valid callback");

  this._doPurge(queueName, function(err) {
    if (callback) {
      utils.callLater(callback, err);
    }
  });
};

/**
 * @protected
 * @final
*/
Transport.prototype.consume = function(queueName, options, callback, successCallback) {
  assert.ok(util.isString(queueName), "Must provide a valid queue name.");
  assert.ok(util.isFunction(callback), "'consume()' must have a valid callback.");
  assert.ok(this.isConnected(), "Must have an open connection before a queue can be consumed.");

  this._doConsume(queueName, options, callback, function(err, subscriptionId) {
    if (successCallback) {
      utils.callLater(successCallback, err, subscriptionId);
    }
  });
};

/**
 * @protected
 * @final
 */
Transport.prototype.cancelConsume = function(subscriptionId, callback) {
  assert.ok(!util.isNullOrUndefined(subscriptionId));
  /* istanbul ignore else */
  if (this.isConnected()) {
    this._doCancelConsume(subscriptionId, callback);
  } else {
    callback();
  }
};

/**
 * @protected
 * @final
*/
Transport.prototype.bind = function(consumeChannelName,
                                    dispatcherChannelName,
                                    bindingKey,
                                    callback) {
  assert.ok(util.isString(consumeChannelName), "Must provide a valid consumer name.");
  assert.ok(util.isString(dispatcherChannelName), "Must provide a valid dispatcher name.");
  assert.ok(util.isString(bindingKey), "Must provide a valid binding key.");
  assert.ok(util.isFunction(callback), "'bind()' must have a valid callback.");
  assert.ok(this.isConnected(), "Must have an open connection before a queue can be bound.");

  this._doBind(consumeChannelName, dispatcherChannelName, bindingKey, function(err) {
    utils.callLater(callback, err);
  });
};

/**
 * @protected
 * @final
*/
Transport.prototype.unbind = function(consumeChannelName,
                                      dispatcherChannelName,
                                      bindingKey,
                                      callback) {
  assert.ok(util.isString(consumeChannelName), "Must provide a valid consume name.");
  assert.ok(util.isString(dispatcherChannelName), "Must provide a valid dispatcher name.");
  assert.ok(util.isString(bindingKey), "Must provide a valid binding key.");
  assert.ok(util.isFunction(callback), "'unbind()' must have a valid callback.");
  assert.ok(this.isConnected(), "Must have an open connection before a queue can be bound.");

  this._doUnbind(consumeChannelName, dispatcherChannelName, bindingKey, function(err) {
    utils.callLater(callback, err);
  });
};

/**
 * Returns the provider specific options used to setup a connection to the
 * backend message queue service.
 *
 * @returns {Object} The provider specific options used to setup a connection
 *
 * @public
 * @final
*/
Transport.prototype.options = function options() {
  return this._options;
};

/* istanbul ignore next  */
/**
 * Actual implementation of connecting to the backend. This method must
 * be implemented by a concrete message queue provider.
 *
 * @param {function(?Error, ?Object)} callback - called when the connection is established.
 *
 * @abstract
 * @private
*/
Transport.prototype._doConnect = function(callback) {
  throw new Error("Method _doConnect() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * Actual implementation of disconnecting from the backend. This method must
 * be implemented by a concrete message queue provider.
 *
 * @param {function(?Error, ?Object)} callback - called when the connection is established.
 *
 * @abstract
 * @private
*/
Transport.prototype._doDisconnect = function(callback) {
  throw new Error("Method _doDisconnect() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * Actual implementation of querying whether the backend is connected. This method must
 * be implemented by a concrete message queue provider.
 *
 * @returns {Boolean} true when connected, otherwise false.
 *
 * @abstract
 * @private
*/
Transport.prototype._doIsConnected = function() {
  throw new Error("Method _doIsConnected() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * Actual implementation of retrieving a dispatch channel for the specific transport.
 * This method must
 * be implemented by a concrete message queue provider.
 *
 * @param {!String} dispatchChannelName - Name of the dispatch channel to retrieve.
 * @param {!Object} options - Options for the dispatch channel.
 * @param {!Function} callback - called when the connection is established.
 *
 * @abstract
 * @private
*/
Transport.prototype._doGetDispatchChannel = function(dispatchChannelName,
                                                     options,
                                                     callback) {
  throw new Error("Method _doGetDispatchChannel() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
*/
Transport.prototype._doGetConsumeChannel = function(consumeChannelName,
                                                    publicationChannelName,
                                                    options,
                                                    callback) {
  throw new Error("Method _doGetConsumeChannel() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
*/
Transport.prototype._doConsume = function(queueName,
                                          options,
                                          callback,
                                          successCallback) {
  throw new Error("Method _doConsume() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
 */
Transport.prototype._doCancelConsume = function(subscriptionId, callback) {
  throw new Error("Method _doCancelConsume() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
*/
Transport.prototype._doPublish = function(exchangeName, msg, callback) {
  throw new Error("Method _doPublish() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
 */
Transport.prototype._doPurge = function(queueName, callback) {
  throw new Error("Method _doPurge() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
*/
Transport.prototype._doBind = function(consumerName,
                                       publisherName,
                                       bindingKey,
                                       callback) {
  throw new Error("Method _doBind() must be implemented by subclasses.");
};

/* istanbul ignore next  */
/**
 * @abstract
 * @private
*/
Transport.prototype._doUnbind = function(consumerName,
                                         publisherName,
                                         bindingKey,
                                         callback) {
  throw new Error("Method _doUnbind() must be implemented by subclasses.");
};
