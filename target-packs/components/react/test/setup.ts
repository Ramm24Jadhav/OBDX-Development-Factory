// jsdom has no canvas; axe only uses it to spot icon fonts, so it gets none instead of a "not implemented" error
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
