"use strict";

var utils = require("./utils");
var util = require("util");

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
  /* istanbul ignore if */
  if (util.isNullOrUndefined(this._registrationId)) {
    utils.callLater(callback, null);
  } else {
    var registrationId = this._registrationId;

    this._consumationCanceled = true;
    this._registrationId = null;
    this._provider.cancelConsume(registrationId, callback);
  }
};

/**
 * Purges all messages from the recipient.
 *
 * @param {ErrorCallback} callback - called when the messages have been purged.
 */
MessageRecipient.prototype.purge = function(callback) {
  if (this._consumationCanceled) {
    callback(null);
  } else {
    this._provider.purge(this._name, callback);
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

module.exports = {
  MessageRecipient: MessageRecipient,
  MessageDistributor: MessageDistributor
};
