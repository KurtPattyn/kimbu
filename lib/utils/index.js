"use strict";

/**
 * The utils module provides some utility methods not provided by node.js.
 *
 * @module utils
*/

/**
 * Applies the given `func` to all elements of the array.
 * This is an optimized version of the default `forEach` method in JavaScript.
 * Code slightly adapted from {@link http://www.reddit.com/r/javascript/comments/2ecnw2/}
 *
 * @param {!Array} array - the array to apply the given `func` to.
 * @param {!Function} func - the function to call for each element of the given `array`
 *
 * @public
 * @alias module:utils.forEach
 */
function forEach(array, func) {
  let i = array.length;

  while (--i >= 0) {
    func(array[i], i, array);
  }
}

/**
 * Extends the given objects going from left to right. Objects to the left have priority over
 * objects to the right. None of the objects is overridden.
 * This method is non-recursive; i.e. it does not copy properties from parent objects.
 *
 * @param {...Object} objects - two or more objects to use for extension.
 *
 * @example
 * let target = utils.extend({ a: 1, b: 2 }, { a: 3 }, { c: 5 });
 * //now target = { a: 1, b: 2, c: 5 }
 *
 * @returns {{}}
 * @alias module:utils.extend
 * @public
 */
function extend(objects) {
  const sources = [].slice.call(arguments);
  const firstObject = sources.shift();
  let target = {};

  //first copy the first object into a new one
  forEach(Object.getOwnPropertyNames(firstObject), function(propName) {
    target[propName] = firstObject[propName];
  });

  //then copy over the properties of the remaining objects
  if (sources.length > 0) {
    forEach(sources, function (source) {
      forEach(Object.getOwnPropertyNames(source), function(propName) {
        if (!target.hasOwnProperty(propName)) {
          target[propName] = source[propName];
        }
      });
    });
  }
  return target;
}

/**
 * Defers the given `method` to be called on the next tick.
 *
 * @param {!Function} method - Function to be called later.
 *
 * @example
 * function toBeCalledLater(number) {
 *   //do something
 * }
 *
 * callLater(toBeCalledLater.bind(3));
 * //will call toBeCalledLater with the number 3 on the next process tick
 *
 * @public
 * @alias module:utils.callLater
 */
function callLater(method) {
  const parameters = [].slice.call(arguments, 1);

  process.nextTick(function() {
    method.apply(null, parameters);
  });
}

/**
 * Forwards the given `sourceEvent` from the `sourceObject` to the `targetEvent` on the `targetObject`.
 * Whenever the `sourceEvent` occurs on the `sourceObject`, the `targetEvent` will be emitted on the `targetObject`.
 *
 * Note: be careful to avoid circular forwarding as this will result in an endless loop (and exhaust the stack).
 *
 * @param {!Object} sourceObject - the object to redirect the sourceEvent from; must be an EventEmitter
 * @param {!String} sourceEvent - the name of the event to redirect
 * @param {!Object} targetObject - the object to send the redirected event to; must be an EventEmitter
 * @param {!String} targetEvent - the new name of the redirected event
 *
 * @public
 * @alias module:utils.forwardEvent
*/
function forwardEvent(sourceObject, sourceEvent, targetObject, targetEvent) {
  sourceObject.on(sourceEvent, targetObject.emit.bind(targetObject, targetEvent));
}

/**
 * Returns true if the given `string` ends with the given `searchString`. The search starts at
 * the given `position`. When no position is given or when position is greater the length of the
 * given 'string', search starts at the end of the `string`.
 * Code taken from {@link https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith}
 *
 * @param {!String} string - the string to search through
 * @param {!String} searchString - the string to search for
 * @param {Number=} position - Search within this string as if this string were only this long;
 * defaults to this string's actual length, clamped within the range established by this string's length.
 *
 * @public
 * @alias module:utils.endsWith
*/
function endsWith(string, searchString, position) {
  const subjectString = string;
  let pos = position;

  if (pos === undefined || pos > subjectString.length) {
    pos = subjectString.length;
  }
  pos -= searchString.length;
  const lastIndex = subjectString.indexOf(searchString, pos);

  return lastIndex !== -1 && lastIndex === pos;
}

/**
 * Filters the given JavaScript files for modules that implement the specified type.
 *
 * @param {!String} folder - the name of the folder containing the files
 * @param {!String[]} files - list of filenames to consider
 * @param {!Function} type - the interface that should be implemented
 * @param {!Function} callback - called when filtering has finished
 * @private
 */
function _filterModules(folder, files, type, callback) {
  const path = require("path");
  let modules = {};

  const jsFiles = files.filter(function (file) {
    return endsWith(file, ".js");
  });

  forEach(jsFiles, function (file) {
    const current = path.resolve(folder, file);
    const module = require(current);

    if (module.prototype instanceof type) {
      modules[module.prototype.constructor.name] = module;
    }
  });

  callback(modules);
}

/**
 * Finds node modules in the given `folder` that implement the specified `type` (aka interface).
 * This method is asynchronous and when finished will call the 'done' callback with an object hash
 * where the keys represent the name of the module and the values represent a handle to the module.
 *
 * @param {!String} folder - the folder to search for modules
 * @param {!Function} type - the constructor method of the type that the modules must implement
 * @param {!Function} done - called when search has finished.
 *
 * @example
 * function SomeInterface() {
 * }
 * utils.findModules(".", SomeInterface, function(modules) {
 *   for (let m in modules) {
 *     console.log("Found module: " + m + "; handle: " + modules[m];
 *   }
 * });
 *
 * @public
 * @alias module:utils.findModules
 *
 * @see module:utils.findModulesSync
 */
function findModules(folder, type, done) {
  const fs = require("fs");

  fs.readdir(folder, function(err, files) {
    if (err) {
      done({});
    } else {
      _filterModules(folder, files, type, done);
    }
  });
}

/**
 * Synchronous version of {@link module:utils.findModules }. This method blocks until it found all modules.
 *
 * @param {!String} folder - the folder to search for modules
 * @param {!Function} type - the constructor method of the type that the modules must implement
 * @returns {Object}
 *
 * @public
 * @alias module:utils.findModulesSync
 *
 * @see module:utils.findModules
 */
function findModulesSync(folder, type) {
  const fs = require("fs");

  try {
    const files = fs.readdirSync(folder);
    let modules = {};

    _filterModules(folder, files, type, function (mods) {
      modules = mods;
    });

    return modules;
  } catch(err) {
    /* istanbul ignore else */
    if (err) {
      //ignore error
    }
    return {};
  }
}

module.exports = {
  extend: extend,
  callLater: callLater,
  findModules: findModules,
  findModulesSync: findModulesSync,
  endsWith: endsWith,
  forwardEvent: forwardEvent,
  forEach: forEach
};
