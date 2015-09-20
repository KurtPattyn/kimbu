"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");

function TestModule() {
  EventEmitter.call(this);
}

util.inherits(TestModule, EventEmitter);

module.exports = TestModule;
