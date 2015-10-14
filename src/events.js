/* jshint node: true, loopfunc: true, undef: true, unused: true */

var Class = require('./class');
var utils = require('./utils');

var isFunction = utils.isFunction;
var invoke = utils.invoke;
var keys = utils.keys;
var each = utils.each;
var eventSplitter = /\s+/;


module.exports = Class.create({

    eventListeners: null,
    eventEnabled: true,
    eventSource: null,

    constructor: function Events() {},

    isEventEnabled: function () {
        return this.eventEnabled;
    },

    enableEvent: function () {
        var that = this;
        that.eventEnabled = true;
        return that;
    },

    disableEvent: function () {
        var that = this;
        that.eventEnabled = false;
        return that;
    },

    getEventSource: function () {
        return this.eventSource;
    },

    setEventSource: function () {
        var that = this;
        this.eventSource = value;
        return that;
    },

    on: function (events, callback, context) {

        var that = this;

        if (!callback) {
            return that;
        }

        var listeners = that.eventListeners || (that.eventListeners = {});

        events = events.split(eventSplitter);

        each(events, function (event) {
            var list = listeners[event] || (listeners[event] = []);
            list.push(callback, context);
        });

        return that;
    },

    once: function (events, callback, context) {

        var that = this;
        var cb = function () {
            that.off(events, cb);
            callback.apply(context || that, arguments);
        };

        return that.on(events, cb, context);
    },

    off: function (events, callback, context) {

        var that = this;
        var listeners = that.eventListeners;

        // No events.
        if (!listeners) {
            return that;
        }

        // removing *all* events.
        if (!(events || callback || context)) {
            delete that.eventListeners;
            return that;
        }

        events = events ? events.split(eventSplitter) : keys(listeners);

        each(events, function (event) {

            var list = listeners[event];

            if (!list) {
                return;
            }

            // remove all event.
            if (!(callback || context)) {
                delete listeners[event];
                return;
            }

            for (var i = list.length - 2; i >= 0; i -= 2) {
                if (!(callback && list[i] !== callback ||
                    context && list[i + 1] !== context)) {
                    list.splice(i, 2);
                }
            }
        });

        return that;
    },

    emit: function (events, sender) {
        var that = this;
        var listeners = that.eventListeners;

        // No events.
        if (!listeners || !that.isEventEnabled()) {
            return that;
        }

        events = events.split(eventSplitter);

        var returned = true;
        var args;

        each(arguments, function (arg, index) {
            if (index > 0) {
                args[index - 1] = arg;
            }
        });

        each(events, function (event) {
            var all = listeners['*'];
            var list = listeners[event];

            // Copy callback lists to prevent modification.
            all = all && all.slice();
            list = list && list.slice();

            // Execute event callbacks except one named '*'
            if (event !== '*') {
                returned = triggerEvents(list, args, this) && returned;
            }

            // Execute '*' callbacks.
            returned = triggerEvents(all, [event].concat(args), this) && returned;
        });

        return returned;
    }
});

function triggerEvents(list, args, context) {
    var ret = true;

    if (list) {
        for (var i = 0, l = list.length; i < l; i += 2) {
            ret = invoke(list[i], args, list[i + 1] || context) !== false && ret;
        }
    }
    // trigger will return false if one of the callbacks return false
    return ret;
}