import { isFunction      } from '../utils/lang';
import { some            } from '../utils/array';
import { containsElement } from '../utils/dom';
import detector            from '../common/detector';


const WIN      = window;
const DOC      = window.document;
const IS_TOUCH = detector.IS_TOUCH;

const hooks = {
    mouseenter: {
        type: 'mouseover',
        wrap: mouseEnterLeaveWrap
    },

    mouseleave: {
        type: 'mouseout',
        wrap: mouseEnterLeaveWrap
    }
};

function mouseEnterLeaveWrap(elem, handler) {
    return function (e) {
        if (!isHover(e.delegateTarget || elem, e)) {
            handler.call(this, e);
        }
    }
}

function isHover(elem, e) {

    const target = e.type === 'mouseover'
        ? e.relatedTarget || e.fromElement
        : e.relatedTarget || e.toElement;

    return containsElement(elem, target) || elem === target;
}

let isMatchSelector = function () {

    let testDiv = DOC.createElement('div');
    // match selector
    let matchesSelector = testDiv.matches ||
        testDiv.webkitMatchesSelector ||
        testDiv.mozMatchesSelector ||
        testDiv.msMatchesSelector ||
        testDiv.oMatchesSelector;

    let hasMatchesSelector = matchesSelector && matchesSelector.call(testDiv, 'div');

    return function (elem, selector) {

        if (hasMatchesSelector) {
            return matchesSelector.call(elem, selector);
        }

        let parent = elem.parentNode;

        // if the element is an orphan, and the browser doesn't support matching
        // orphans, append it to a documentFragment
        if (!parent && !hasMatchesSelector) {
            parent = DOC.createDocumentFragment();
            parent.appendChild(elem);
        }

        // from the parent element's context, get all nodes that match the selector
        let nodes = parent.querySelectorAll(selector);

        return some(nodes, function (node) {
            return node === elem;
        });
    };
}();

function fixEvent(event) {

    // add W3C standard event methods
    event.preventDefault  = fixEvent.preventDefault;
    event.stopPropagation = fixEvent.stopPropagation;

    return event;
}

fixEvent.preventDefault = function () {

    this.returnValue = false;
};

fixEvent.stopPropagation = function () {

    this.cancelBubble = true;
};

function handleEvent(event) {

    let result  = true;
    let element = this;

    // grab the event object (IE uses a global event object)
    event = event || fixEvent((DOC.parentWindow || WIN).event);

    // get a reference to the hash table of event handlers
    let handlers = element.events[event.type];

    // execute each event handler
    for (let key in handlers) {

        if (handlers.hasOwnProperty(key)) {

            element.$$handleEvent = handlers[key];

            if (element.$$handleEvent(event) === false) {
                result = false;
            }
        }
    }

    return result;
}

function addEvent(elem, type, handler) {

    if (elem.addEventListener) {
        elem.addEventListener(type, handler, false);
    } else {

        // assign each event handler a unique ID
        if (!handler.$$guid) {
            handler.$$guid = ++addEvent.guid;
        }

        // create a hash table of event types for the element
        if (!elem.events) {
            elem.events = {};
        }

        let fixedName = 'on' + type;

        // create a hash table of event handlers for each element/event pair
        let handlers = elem.events[type];
        if (!handlers) {
            handlers = elem.events[type] = {};
            // store the existing event handler (if there is one)
            if (elem[fixedName]) {
                handlers[0] = elem[fixedName];
            }
        }
        // store the event handler in the hash table
        handlers[handler.$$guid] = handler;
        // assign a global event handler to do all the work
        elem[fixedName] = handleEvent;
    }
}

addEvent.guid = 0;

function getDelegateTarget(elem, target, selector) {

    while (target && target !== elem) {

        if (isMatchSelector(target, selector)) {
            return target;
        }

        target = target.parentElement;
    }

    return null;
}

function removeEventListener(elem, type, handler) {

    let wrapper = handler._delegateWrapper;
    let hook    = hooks[type];

    type = hook ? hook.type : type;

    if (elem.removeEventListener) {
        elem.removeEventListener(type, handler, false);
        wrapper && elem.removeEventListener(type, wrapper, false);
    } else {
        // delete the event handler from the hash table
        if (elem.events && elem.events[type]) {
            delete elem.events[type][handler.$$guid];

            if (wrapper) {
                delete elem.events[type][wrapper.$$guid];
            }
        }
    }
}

function addEventListener(elem, type, selector, handler, once) {

    let hook = hooks[type];

    type = hook ? hook.type : type;

    if (isFunction(selector)) {
        return hook
            ? addEvent(elem, type, hook.wrap(elem, selector))
            : addEvent(elem, type, selector);
    }

    function wrapper(e) {

        // if this event has a delegateTarget, then we add it to the event
        // object (so that handlers may have a reference to the delegator
        // element) and fire the callback
        let delegateTarget = getDelegateTarget(elem, e.target, selector);
        if (delegateTarget) {

            e.delegateTarget = delegateTarget;

            if (hook) {
                handler = hook.wrap(elem, handler)
            }

            if (once === true) {
                removeEventListener(elem, type, wrapper);
            }

            handler.call(elem, e);
        }
    }

    handler._delegateWrapper = wrapper;
    addEvent(elem, type, wrapper);

    return handler;
}

function normalizeEvent(evt) {

    let touchEvt = IS_TOUCH
        && evt.originalEvent
        && evt.originalEvent.changedTouches
        && evt.originalEvent.changedTouches[0];

    if (touchEvt) {
        for (let property in evt) {
            // copy all the properties from the input event that are not
            // defined on the touch event (functions included).
            if (touchEvt[property] === undefined) {
                touchEvt[property] = evt[property];
            }
        }
        return touchEvt;
    }

    return evt;
}

function isLeftMouseButton(evt) {

    if (detector.IS_IE) {
        return evt.button === 1;
    }

    return evt.button === 0;
}

function hasModifierKey(evt) {

    return hasCtrlKey(evt) || hasMetaKey(evt) || hasShiftKey(evt);
}

function hasAltKey(evt) {

    return evt.altKey;
}

function hasCtrlKey(evt) {

    return evt.ctrlKey;
}

function hasShiftKey(evt) {

    return evt.shiftKey;
}

function hasMetaKey(evt) {

    return evt.metaKey;
}


// exports
// -------

export {
    normalizeEvent,
    hasAltKey,
    hasCtrlKey,
    hasMetaKey,
    hasShiftKey,
    hasModifierKey,
    isLeftMouseButton,
    addEventListener,
    removeEventListener
};
