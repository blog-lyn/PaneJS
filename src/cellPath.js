
var cellPath = {

    PATH_SEPARATOR: '.',

    create: function (cell) {
        var result = '';

        if (cell !== null) {
            var parent = cell.getParent();

            while (parent !== null) {
                var index = parent.getIndex(cell);
                result = index + mxCellPath.PATH_SEPARATOR + result;

                cell = parent;
                parent = cell.getParent();
            }
        }

        // Removes trailing separator
        var n = result.length;

        if (n > 1) {
            result = result.substring(0, n - 1);
        }

        return result;
    },

    getParentPath: function (path) {
        if (path !== null) {
            var index = path.lastIndexOf(mxCellPath.PATH_SEPARATOR);

            if (index >= 0) {
                return path.substring(0, index);
            }
            else if (path.length > 0) {
                return '';
            }
        }

        return null;
    },

    resolve: function (root, path) {
        var parent = root;

        if (path !== null) {
            var tokens = path.split(mxCellPath.PATH_SEPARATOR);

            for (var i = 0; i < tokens.length; i++) {
                parent = parent.getChildAt(parseInt(tokens[i]));
            }
        }

        return parent;
    },

    compare: function (p1, p2) {
        var min = Math.min(p1.length, p2.length);
        var comp = 0;

        for (var i = 0; i < min; i++) {
            if (p1[i] !== p2[i]) {
                if (p1[i].length === 0 ||
                    p2[i].length === 0) {
                    comp = (p1[i] === p2[i]) ? 0 : ((p1[i] > p2[i]) ? 1 : -1);
                }
                else {
                    var t1 = parseInt(p1[i]);
                    var t2 = parseInt(p2[i]);

                    comp = (t1 === t2) ? 0 : ((t1 > t2) ? 1 : -1);
                }

                break;
            }
        }

        // Compares path length if both paths are equal to this point
        if (comp === 0) {
            var t11 = p1.length;
            var t21 = p2.length;

            if (t11 !== t21) {
                comp = (t11 > t21) ? 1 : -1;
            }
        }

        return comp;
    }
};

module.exports = cellPath;

