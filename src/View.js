/* jshint node: true, loopfunc: true, undef: true, unused: false */
/* global document */

'use strict';

var Class = require('./common/class');
var utils = require('./common/utils');
var Event = require('./events/Event');
var Dictionary = require('./common/Dictionary');
var constants = require('./constants');
var Point = require('./Point');
var Rectangle = require('./Rectangle');
var CellState = require('./CellState');

var each = utils.each;
var isNullOrUndefined = utils.isNullOrUndefined;

module.exports = Class.create({

    Implements: Event,

    // 属性
    // ----

    graph: null,

    EMPTY_POINT: new Point(),
    // 国际化
    doneResource: '',
    updatingDocumentResource: '',

    allowEval: true,
    captureDocumentGesture: true,
    optimizeVmlReflows: true,
    rendering: true,
    currentRoot: null,
    graphBounds: null,
    scale: 1,
    translate: null,
    updateStyle: false,
    lastNode: null,
    lastHtmlNode: null,
    lastForegroundNode: null,
    lastForegroundHtmlNode: null,

    constructor: function View(graph) {

        var view = this;

        view.graph = graph || null;
        view.translate = new Point();
        view.graphBounds = new Rectangle();
        view.states = new Dictionary();
    },

    init: function () {
        return this.installListeners().createSvg();
    },

    getGraphBounds: function () {
        return this.graphBounds;
    },

    setGraphBounds: function (value) {
        this.graphBounds = value;
    },

    getBounds: function (cells) {

        var view = this;
        var result = null;

        if (cells && cells.length) {

            var model = view.graph.getModel();

            each(cells, function (cell) {

                if (model.isVertex(cell) || model.isEdge(cell)) {

                    var state = view.getState(cell);

                    if (state) {

                        var rect = new Rectangle(state.x, state.y, state.width, state.height);

                        if (result) {
                            result.add(rect);
                        } else {
                            result = rect;
                        }
                    }
                }
            });
        }

        return result;
    },

    setCurrentRoot: function (root) {
        if (this.currentRoot !== root) {
            var change = new CurrentRootChange(this, root);
            change.execute();
            var edit = new mxUndoableEdit(this, false);
            edit.add(change);
            this.fireEvent(new EventObject(mxEvent.UNDO, 'edit', edit));
            this.graph.sizeDidChange();
        }

        return root;
    },

    scaleAndTranslate: function (scale, dx, dy) {
        var view = this;
        var ts = view.translate;
        var previousScale = view.scale;
        var previousTranslate = new Point(ts.x, ts.y);

        if (previousScale !== scale || ts.x !== dx || ts.y !== dy) {

            view.scale = scale;

            view.translate.x = dx;
            view.translate.y = dy;

            if (view.isEventsEnabled()) {
                view.revalidate();
                view.graph.sizeDidChange();
            }
        }

        view.fireEvent(new EventObject(mxEvent.SCALE_AND_TRANSLATE,
            'scale', scale, 'previousScale', previousScale,
            'translate', view.translate, 'previousTranslate', previousTranslate));
    },

    getScale: function () {
        return this.scale;
    },

    setScale: function (value) {
        var view = this;
        var previousScale = view.scale;

        if (previousScale !== value) {
            view.scale = value;

            if (view.isEventsEnabled()) {
                view.revalidate();
                view.graph.sizeDidChange();
            }
        }

        view.fireEvent(new EventObject(mxEvent.SCALE,
            'scale', value, 'previousScale', previousScale));
    },

    getTranslate: function () {
        return this.translate;
    },

    setTranslate: function (dx, dy) {
        var view = this;
        var translate = view.translate;
        var previousTranslate = new Point(translate.x, translate.y);

        if (translate.x !== dx || translate.y !== dy) {
            translate.x = dx;
            translate.y = dy;

            if (view.isEventsEnabled()) {
                view.revalidate();
                view.graph.sizeDidChange();
            }
        }

        view.fireEvent(new EventObject(mxEvent.TRANSLATE,
            'translate', translate, 'previousTranslate', previousTranslate));
    },

    refresh: function () {
        if (this.currentRoot != null) {
            this.clear();
        }

        this.revalidate();
    },

    revalidate: function () {
        this.invalidate();
        this.validate();
    },

    clear: function (cell, force, recurse) {
        var view = this;
        var model = view.graph.getModel();

        cell = cell || model.getRoot();
        force = !isNullOrUndefined(force) ? force : false;
        recurse = !isNullOrUndefined(recurse) ? recurse : true;

        view.removeState(cell);

        if (recurse && (force || cell !== this.currentRoot)) {

            var childCount = model.getChildCount(cell);

            for (var i = 0; i < childCount; i++) {
                view.clear(model.getChildAt(cell, i), force);
            }
        } else {
            view.invalidate(cell);
        }
    },

    invalidate: function (cell, recurse, includeEdges) {
        var view = this;
        var model = view.graph.getModel();

        cell = cell || model.getRoot();
        recurse = !isNullOrUndefined(recurse) ? recurse : true;
        includeEdges = !isNullOrUndefined(includeEdges) ? includeEdges : true;

        var state = view.getState(cell);

        if (state) {
            state.invalid = true;
        }

        // Avoids infinite loops for invalid graphs
        if (!cell.invalidating) {
            cell.invalidating = true;

            // Recursively invalidates all descendants
            if (recurse) {
                var childCount = model.getChildCount(cell);

                for (var i = 0; i < childCount; i++) {
                    var child = model.getChildAt(cell, i);
                    view.invalidate(child, recurse, includeEdges);
                }
            }

            // Propagates invalidation to all connected edges
            if (includeEdges) {
                var edgeCount = model.getEdgeCount(cell);

                for (var i = 0; i < edgeCount; i++) {
                    view.invalidate(model.getEdgeAt(cell, i), recurse, includeEdges);
                }
            }

            delete cell.invalidating;
        }
    },

    validate: function (cell) {
        this.resetValidationState();

        var graphBounds = this.getBoundingBox(this.validateCellState(
            this.validateCell(cell || ((this.currentRoot != null) ?
                    this.currentRoot : this.graph.getModel().getRoot()))));

        this.setGraphBounds((graphBounds != null) ? graphBounds : this.getEmptyBounds());

        this.validateBackground();

        this.resetValidationState();
    },

    getEmptyBounds: function () {
        var view = this;
        var translate = view.translate;
        var scale = view.scale;

        return new Rectangle(translate.x * scale, translate.y * scale);
    },

    getBoundingBox: function (state, recurse) {

        recurse = !isNullOrUndefined(recurse) ? recurse : true;

        var bbox = null;

        if (isNullOrUndefined(state)) {
            return bbox;
        }

        if (state.shape && state.shape.boundingBox) {
            bbox = state.shape.boundingBox.clone();
        }

        // Adds label bounding box to graph bounds
        if (state.text && state.text.boundingBox) {
            if (bbox) {
                bbox.add(state.text.boundingBox);
            } else {
                bbox = state.text.boundingBox.clone();
            }
        }

        if (recurse) {
            var model = this.graph.getModel();
            var childCount = model.getChildCount(state.cell);

            for (var i = 0; i < childCount; i++) {
                var bounds = this.getBoundingBox(this.getState(model.getChildAt(state.cell, i)));

                if (bounds != null) {
                    if (bbox == null) {
                        bbox = bounds;
                    }
                    else {
                        bbox.add(bounds);
                    }
                }
            }
        }

        return bbox;
    },

    createBackgroundPageShape: function (bounds) {

    },

    validateBackground: function () {
        this.validateBackgroundImage();
        this.validateBackgroundPage();
    },

    validateBackgroundImage: function () {},

    validateBackgroundPage: function () {},

    getBackgroundPageBounds: function () {
        var view = this;
        var scale = view.scale;
        var translate = view.translate;
        var fmt = view.graph.pageFormat;
        var ps = scale * view.graph.pageScale;

        return new Rectangle(scale * translate.x, scale * translate.y, fmt.width * ps, fmt.height * ps);
    },

    redrawBackgroundImage: function (backgroundImage, bg) {
        backgroundImage.scale = this.scale;
        backgroundImage.bounds.x = this.scale * this.translate.x;
        backgroundImage.bounds.y = this.scale * this.translate.y;
        backgroundImage.bounds.width = this.scale * bg.width;
        backgroundImage.bounds.height = this.scale * bg.height;

        backgroundImage.redraw();
    },

    validateCell: function (cell, visible) {

        var view = this;

        if (!cell) {
            return cell;
        }

        visible = !isNullOrUndefined(visible) ? visible : true;
        visible = visible && view.graph.isCellVisible(cell);

        var state = view.getState(cell, visible);

        if (state && !visible) {
            view.removeState(cell);
        } else {

            var model = view.graph.getModel();
            var childCount = model.getChildCount(cell);

            for (var i = 0; i < childCount; i++) {
                this.validateCell(model.getChildAt(cell, i), visible &&
                    (!this.isCellCollapsed(cell) || cell == this.currentRoot));
            }
        }

        return cell;
    },

    validateCellState: function (cell, recurse) {

        var view = this;
        var state = null;

        if (isNullOrUndefined(cell)) {
            return state;
        }

        state = view.getState(cell);

        if (isNullOrUndefined(state)) {
            return state;
        }

        recurse = !isNullOrUndefined(recurse) ? recurse : true;

        var model = view.graph.getModel();

        if (state.invalid) {
            state.invalid = false;

            if (cell != this.currentRoot) {
                this.validateCellState(model.getParent(cell), false);
            }

            state.setVisibleTerminalState(this.validateCellState(this.getVisibleTerminal(cell, true), false), true);
            state.setVisibleTerminalState(this.validateCellState(this.getVisibleTerminal(cell, false), false), false);

            this.updateCellState(state);

            // Repaint happens immediately after the cell is validated
            if (cell != this.currentRoot) {
                this.graph.cellRenderer.redraw(state, false, this.isRendering());
            }
        }

        if (recurse) {
            state.updateCachedBounds();

            // Updates order in DOM if recursively traversing
            if (state.shape != null) {
                this.stateValidated(state);
            }

            var childCount = model.getChildCount(cell);

            for (var i = 0; i < childCount; i++) {
                this.validateCellState(model.getChildAt(cell, i));
            }
        }

        return state;
    },

    updateCellState: function (state) {
        state.absoluteOffset.x = 0;
        state.absoluteOffset.y = 0;
        state.origin.x = 0;
        state.origin.y = 0;
        state.length = 0;

        if (state.cell != this.currentRoot) {
            var model = this.graph.getModel();
            var pState = this.getState(model.getParent(state.cell));

            if (pState != null && pState.cell != this.currentRoot) {
                state.origin.x += pState.origin.x;
                state.origin.y += pState.origin.y;
            }

            var offset = this.graph.getChildOffsetForCell(state.cell);

            if (offset != null) {
                state.origin.x += offset.x;
                state.origin.y += offset.y;
            }

            var geo = this.graph.getCellGeometry(state.cell);

            if (geo) {
                if (!model.isEdge(state.cell)) {
                    offset = geo.offset || this.EMPTY_POINT;

                    if (geo.relative && pState != null) {
                        if (model.isEdge(pState.cell)) {
                            var origin = this.getPoint(pState, geo);

                            if (origin != null) {
                                state.origin.x += (origin.x / this.scale) - pState.origin.x - this.translate.x;
                                state.origin.y += (origin.y / this.scale) - pState.origin.y - this.translate.y;
                            }
                        }
                        else {
                            state.origin.x += geo.x * pState.width / this.scale + offset.x;
                            state.origin.y += geo.y * pState.height / this.scale + offset.y;
                        }
                    }
                    else {
                        state.absoluteOffset.x = this.scale * offset.x;
                        state.absoluteOffset.y = this.scale * offset.y;
                        state.origin.x += geo.x;
                        state.origin.y += geo.y;
                    }
                }

                state.x = this.scale * (this.translate.x + state.origin.x);
                state.y = this.scale * (this.translate.y + state.origin.y);
                state.width = this.scale * geo.width;
                state.height = this.scale * geo.height;

                if (model.isVertex(state.cell)) {
                    this.updateVertexState(state, geo);
                }

                if (model.isEdge(state.cell)) {
                    this.updateEdgeState(state, geo);
                }
            }
        }
    },

    isCellCollapsed: function (cell) {
        return this.graph.isCellCollapsed(cell);
    },

    updateVertexState: function (state, geo) {
        var model = this.graph.getModel();
        var pState = this.getState(model.getParent(state.cell));

        if (geo.relative && pState && !model.isEdge(pState.cell)) {
            var alpha = mxUtils.toRadians(pState.style[constants.STYLE_ROTATION] || '0');

            if (alpha != 0) {
                var cos = Math.cos(alpha);
                var sin = Math.sin(alpha);

                var ct = new Point(state.getCenterX(), state.getCenterY());
                var cx = new Point(pState.getCenterX(), pState.getCenterY());
                var pt = utils.getRotatedPoint(ct, cos, sin, cx);
                state.x = pt.x - state.width / 2;
                state.y = pt.y - state.height / 2;
            }
        }

        this.updateVertexLabelOffset(state);
    },

    updateEdgeState: function (state, geo) {},

    updateVertexLabelOffset: function (state) {},

    resetValidationState: function () {
        this.lastNode = null;
        this.lastHtmlNode = null;
        this.lastForegroundNode = null;
        this.lastForegroundHtmlNode = null;
    },

    stateValidated: function (state) {},

    updateFixedTerminalPoints: function (edge, source, target) {},

    updateFixedTerminalPoint: function (edge, terminal, source, constraint) {},
    updatePoints: function (edge, points, source, target) {},
    transformControlPoint: function (state, pt) {},
    getEdgeStyle: function (edge, points, source, target) {},
    updateFloatingTerminalPoints: function (state, source, target) {},
    updateFloatingTerminalPoint: function (edge, start, end, source) {},
    getTerminalPort: function (state, terminal, source) {},
    getPerimeterPoint: function (terminal, next, orthogonal, border) {},
    getRoutingCenterX: function (state) {},
    getRoutingCenterY: function (state) {},
    getPerimeterBounds: function (terminal, border) {},
    getPerimeterFunction: function (state) {},
    getNextPoint: function (edge, opposite, source) {},
    getVisibleTerminal: function (edge, source) {},
    updateEdgeBounds: function (state) {},
    getPoint: function (state, geometry) {},
    getRelativePoint: function (edgeState, x, y) {},
    updateEdgeLabelOffset: function (state) {},

    getState: function (cell, create) {

        var view = this;
        var state = null;

        if (!cell) {
            return state;
        }

        create = create || false;

        state = view.states.get(cell);

        if (create && (!state || view.updateStyle) && view.graph.isCellVisible(cell)) {
            if (!state) {
                state = view.createState(cell);
                view.states.set(cell, state);
            } else { // updateStyle
                state.style = view.graph.getCellStyle(cell);
            }
        }

        return state;
    },

    isRendering: function () {
        return this.rendering;
    },

    setRendering: function (value) {
        this.rendering = value;
    },

    isAllowEval: function () {
        return this.allowEval;
    },

    setAllowEval: function (value) {
        this.allowEval = value;
    },

    getStates: function () {
        return this.states;
    },

    setStates: function (value) {
        this.states = value;
    },

    getCellStates: function (cells) {
        if (isNullOrUndefined(cells)) {
            return this.states;
        } else {
            var result = [];

            for (var i = 0; i < cells.length; i++) {
                var state = this.getState(cells[i]);

                if (state != null) {
                    result.push(state);
                }
            }

            return result;
        }
    },

    removeState: function (cell) {

        var state = null;

        if (cell != null) {
            state = this.states.remove(cell);

            if (state != null) {
                this.graph.cellRenderer.destroy(state);
                state.destroy();
            }
        }

        return state;
    },
    createState: function (cell) {
        var state = new CellState(this, cell, this.graph.getCellStyle(cell));
        var model = this.graph.getModel();

        if (state.view.graph.container != null && state.cell != state.view.currentRoot &&
            (model.isVertex(state.cell) || model.isEdge(state.cell))) {
            this.graph.cellRenderer.createShape(state);
        }

        return state;
    },
    getCanvas: function () {
        return this.canvas;
    },
    getBackgroundPane: function () {
        return this.backgroundPane;
    },
    getDrawPane: function () {
        return this.drawPane;
    },
    getOverlayPane: function () {
        return this.overlayPane;
    },
    getDecoratorPane: function () {
        return this.decoratorPane;
    },
    isContainerEvent: function (evt) {},

    isScrollEvent: function (evt) {},

    installListeners: function () {
        return this;
    },

    createSvg: function () {

        var view = this;

        view.canvas = document.createElementNS(constants.NS_SVG, 'g');

        view.backgroundPane = document.createElementNS(constants.NS_SVG, 'g');
        view.canvas.appendChild(view.backgroundPane);

        view.drawPane = document.createElementNS(constants.NS_SVG, 'g');
        view.canvas.appendChild(view.drawPane);

        view.overlayPane = document.createElementNS(constants.NS_SVG, 'g');
        view.canvas.appendChild(view.overlayPane);

        view.decoratorPane = document.createElementNS(constants.NS_SVG, 'g');
        view.canvas.appendChild(view.decoratorPane);

        var root = document.createElementNS(constants.NS_SVG, 'svg');
        root.style.width = '100%';
        root.style.height = '100%';

        // NOTE: In standards mode, the SVG must have block layout
        // in order for the container DIV to not show scrollbars.
        root.style.display = 'block';
        root.appendChild(view.canvas);


        var container = view.graph.container;

        if (container !== null) {
            container.appendChild(root);
            view.updateContainerStyle(container);
        }

        return this;
    },
    // 更新容器的样式
    updateContainerStyle: function (container) {},
    destroy: function () {}
});

