export default class FitFontSize {
    constructor(term, element, { maxFontSize = 15, minFontSize = 8, minRows = 24, onChange } = {}) {
        this.term = term;
        this.element = element;
        this.maxFontSize = maxFontSize;
        this.minFontSize = minFontSize;
        this.minRows = minRows;
        this.onChange = onChange ?? null;
        this._scheduled = false;

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
                    this.fit();
                }
            });
            this._observer.observe(screen);
        }

        window.addEventListener('resize', this._debouncedFit);
    }

    fit() {
        const screen = this.element.querySelector('.xterm-screen');
        if (!screen || screen.offsetWidth === 0 || screen.offsetHeight === 0) return;

        const currentFontSize = this.term.options.fontSize;
        // Cell dimensions scale linearly with fontSize
        const cellWidthPerFontPx = (screen.offsetWidth / this.term.cols) / currentFontSize;
        const cellHeightPerFontPx = (screen.offsetHeight / this.term.rows) / currentFontSize;

        // Available space: viewport minus body padding, terminal padding, and titlebar
        const bodyStyle = getComputedStyle(document.body);
        const bodyPadX = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
        const bodyPadY = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
        const termStyle = getComputedStyle(this.element);
        const termPadX = parseFloat(termStyle.paddingLeft) + parseFloat(termStyle.paddingRight);
        const termPadY = parseFloat(termStyle.paddingTop) + parseFloat(termStyle.paddingBottom);
        const titlebarHeight = this.element.parentElement?.querySelector('.titlebar')?.offsetHeight ?? 0;

        const availableWidth = window.innerWidth - bodyPadX - termPadX;
        const availableHeight = window.innerHeight - bodyPadY - termPadY - titlebarHeight;

        // Compute the largest fontSize that fits the available space
        const maxFontByWidth = availableWidth / (this.term.cols * cellWidthPerFontPx);
        const maxFontByHeight = availableHeight / (this.minRows * cellHeightPerFontPx);
        const idealFontSize = Math.floor(Math.min(maxFontByWidth, maxFontByHeight));
        const newFontSize = Math.max(Math.min(idealFontSize, this.maxFontSize), this.minFontSize);

        // In compact mode, fill extra vertical space with more rows
        const cellHeight = cellHeightPerFontPx * newFontSize;
        const newRows = Math.max(Math.floor(availableHeight / cellHeight), this.minRows);

        let changed = false;
        if (newFontSize !== currentFontSize) {
            this.term.options.fontSize = newFontSize;
            changed = true;
        }
        if (newRows !== this.term.rows) {
            this.term.resize(this.term.cols, newRows);
            changed = true;
        }
        if (changed && this.onChange) {
            this.onChange(newFontSize, currentFontSize);
        }
    }

    dispose() {
        window.removeEventListener('resize', this._debouncedFit);
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }
}
