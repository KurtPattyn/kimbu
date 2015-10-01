"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");

function BaseModule() {
  EventEmitter.call(this);
}
util.inherits(BaseModule, EventEmitter);

function TestModule() {
  BaseModule.call(this);
}

util.inherits(TestModule, BaseModule);

module.exports = TestModule;
