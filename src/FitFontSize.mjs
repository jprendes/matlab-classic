export default class FitFontSize {
    constructor(term, element, { maxFontSize = 15, minFontSize = 8, minRows = 1, onFontChange, onRowsChange, onColsChange } = {}) {
        this.term = term;
        this.element = element;
        this.maxFontSize = maxFontSize;
        this.minFontSize = minFontSize;
        this.minRows = minRows;
        this.onFontChange = onFontChange ?? null;
        this.onRowsChange = onRowsChange ?? null;
        this.onColsChange = onColsChange ?? null;
        this._scheduled = false;
        this._cellSizes = null; // populated on first render

        this._debouncedFit = () => {
            if (this._scheduled) return;
            this._scheduled = true;
            requestAnimationFrame(() => {
                this._scheduled = false;
                this.fit();
            });
        };

        // Initial fit: observe screen element for non-zero dimensions
        const screen = element.querySelector('.xterm-screen');
        if (screen) {
            this._observer = new ResizeObserver(() => {
                if (screen.offsetWidth > 0 && screen.offsetHeight > 0) {
                    this._observer.disconnect();
                    this._observer = null;
                    this._measureCellSizes(screen);
                    this.fit();
                }
            });
            this._observer.observe(screen);
        }

        window.addEventListener('resize', this._debouncedFit);
        window.visualViewport?.addEventListener('resize', this._debouncedFit);
    }

    _measureCellSizes(screen) {
        const originalFontSize = this.term.options.fontSize;
        this._cellSizes = {};
        for (let fs = this.minFontSize; fs <= this.maxFontSize; fs++) {
            this.term.options.fontSize = fs;
            // Force layout to get accurate measurements
            const cellWidth = screen.offsetWidth / this.term.cols;
            const cellHeight = screen.offsetHeight / this.term.rows;
            this._cellSizes[fs] = { cellWidth, cellHeight };
        }
        this.term.options.fontSize = originalFontSize;

        // Measure fixed padding once (before compact mode changes them)
        const bodyStyle = getComputedStyle(document.body);
        this._padX = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight)
            + parseFloat(getComputedStyle(this.element).paddingLeft) + parseFloat(getComputedStyle(this.element).paddingRight);
        this._padY = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom)
            + parseFloat(getComputedStyle(this.element).paddingTop) + parseFloat(getComputedStyle(this.element).paddingBottom);
    }

    fit() {
        if (!this._cellSizes) return;

        const titlebar = this.element.parentElement?.querySelector('.titlebar');
        // Use inline style to determine logical state (avoids reading mid-transition values)
        const titlebarHeight = titlebar
            ? (titlebar.style.marginTop === '' ? titlebar.offsetHeight : 0)
            : 0;

        const vv = window.visualViewport;
        const viewportWidth = vv ? vv.width : window.innerWidth;
        const viewportHeight = vv ? vv.height : window.innerHeight;

        const availableWidth = viewportWidth - this._padX;
        const availableHeight = viewportHeight - this._padY - titlebarHeight;

        // Find largest font that fits within available width
        let newFontSize = this.minFontSize;
        for (let fs = this.maxFontSize; fs >= this.minFontSize; fs--) {
            if (this._cellSizes[fs].cellWidth * this.term.cols <= availableWidth) {
                newFontSize = fs;
                break;
            }
        }

        const { cellWidth, cellHeight } = this._cellSizes[newFontSize];
        const newRows = Math.max(Math.floor(availableHeight / cellHeight), this.minRows);

        const currentFontSize = this.term.options.fontSize;
        if (newFontSize !== currentFontSize) {
            this.term.options.fontSize = newFontSize;
            if (this.onFontChange) this.onFontChange({ fontSize: newFontSize, oldFontSize: currentFontSize, cellWidth, cellHeight });
        }
        if (newRows !== this.term.rows) {
            const oldRows = this.term.rows;
            this.term.resize(this.term.cols, newRows);
            if (this.onRowsChange) this.onRowsChange({ rows: newRows, oldRows, cellWidth, cellHeight });
        }
    }

    dispose() {
        window.removeEventListener('resize', this._debouncedFit);
        window.visualViewport?.removeEventListener('resize', this._debouncedFit);
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }
}
