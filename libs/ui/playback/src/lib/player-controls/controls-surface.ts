export interface ControlsSurfaceHandlers {
    /** Reveal the controls (pointer move / enter / click on the surface). */
    reveal: () => void;
    /** Toggle fullscreen on an unhandled double-click. */
    toggleFullscreen: () => void;
    /** Close popovers on an outside pointer-down. */
    closePopovers: () => void;
}

/**
 * Owns the surface + document interaction wiring for the controls: reveal on
 * pointer activity, fullscreen on double-click, and popover dismissal on an
 * outside pointer-down. The component binds {@link attachSurface} from an effect
 * (so it re-binds when the surface changes) and provides the current surface to
 * the document handler via {@link setSurface}.
 */
export class ControlsSurface {
    private surface: HTMLElement | null = null;
    private surfaceCleanup: (() => void) | null = null;

    private readonly onDocumentPointerDown = (event: PointerEvent) => {
        if (!this.surface || event.composedPath().includes(this.surface)) {
            return;
        }
        this.handlers.closePopovers();
    };

    constructor(private readonly handlers: ControlsSurfaceHandlers) {
        if (typeof document !== 'undefined') {
            document.addEventListener('pointerdown', this.onDocumentPointerDown);
        }
    }

    /** Rebind the per-surface listeners; returns a cleanup for the effect. */
    attachSurface(surface: HTMLElement | null): () => void {
        this.surfaceCleanup?.();
        this.surfaceCleanup = null;
        this.surface = surface;
        if (!surface) {
            return () => undefined;
        }
        const reveal = () => this.handlers.reveal();
        const dblclick = (event: MouseEvent) => this.onDblClick(event);
        surface.addEventListener('pointermove', reveal, { passive: true });
        surface.addEventListener('pointerenter', reveal);
        surface.addEventListener('click', reveal);
        surface.addEventListener('dblclick', dblclick);
        this.surfaceCleanup = () => {
            surface.removeEventListener('pointermove', reveal);
            surface.removeEventListener('pointerenter', reveal);
            surface.removeEventListener('click', reveal);
            surface.removeEventListener('dblclick', dblclick);
        };
        return () => this.surfaceCleanup?.();
    }

    dispose(): void {
        this.surfaceCleanup?.();
        this.surfaceCleanup = null;
        if (typeof document !== 'undefined') {
            document.removeEventListener(
                'pointerdown',
                this.onDocumentPointerDown
            );
        }
    }

    private onDblClick(event: MouseEvent): void {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, input, [role="slider"]')) {
            return;
        }
        this.handlers.toggleFullscreen();
    }
}
