import { Injectable, signal } from '@angular/core';

/** Native video viewport rect the backdrop punches a hole at. */
export interface EmbeddedMpvImmersiveRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Body class that opens the transparent "tunnel" through the app shell. */
const IMMERSIVE_BODY_CLASS = 'embedded-mpv-immersive';
/**
 * Body class applied while the immersive player is fullscreen. The player root
 * goes DOM-fullscreen (transparent, over the native video); this class hides the
 * surrounding chrome so the transparent fullscreen surface reveals the native
 * video filling the screen instead of the UI behind it.
 */
const FULLSCREEN_BODY_CLASS = 'embedded-mpv-fullscreen';

/**
 * The ONE place that owns the cross-cutting transparency concern for the
 * immersive embedded-MPV overlay.
 *
 * The native MPV video surface composites BELOW the WebContents, so the web
 * layer must become transparent over the player region for the video to show
 * through. This service toggles a single body class — {@link
 * IMMERSIVE_BODY_CLASS} — which `styles.scss` maps onto the shell's
 * `--app-shell-bg`/`--app-content-bg` variables. No transparency logic lives in
 * components; they only `activate()`/`deactivate()` here.
 *
 * Ref-counted so concurrent activators (e.g. a player plus a transient retry)
 * keep the tunnel open until the last one closes it.
 */
@Injectable({ providedIn: 'root' })
export class EmbeddedMpvImmersiveService {
    private activeCount = 0;

    /**
     * True while the tunnel is open (first activate() → last deactivate()). The
     * backdrop component binds to this to mount the opaque field behind the app.
     */
    readonly active = signal(false);
    /** True while the immersive player is fullscreen (backdrop stays off). */
    readonly fullscreen = signal(false);
    /** Native video viewport rect — the hole punched in the backdrop. */
    readonly rect = signal<EmbeddedMpvImmersiveRect | null>(null);

    /** Open the transparent tunnel (adds the body class on first activation). */
    activate(): void {
        this.activeCount += 1;
        if (this.activeCount === 1) {
            this.toggleClass(true);
            this.active.set(true);
        }
    }

    /** Close the tunnel (removes the body class on the last deactivation). */
    deactivate(): void {
        if (this.activeCount === 0) {
            return;
        }
        this.activeCount -= 1;
        if (this.activeCount === 0) {
            this.toggleClass(false);
            this.active.set(false);
        }
    }

    /** Hide/show the surrounding chrome while the player is fullscreen. */
    setFullscreen(active: boolean): void {
        this.fullscreen.set(active);
        if (typeof document === 'undefined') {
            return;
        }
        document.body.classList.toggle(FULLSCREEN_BODY_CLASS, active);
    }

    /** Feed the current native video viewport rect (or null when hidden). */
    setRect(rect: EmbeddedMpvImmersiveRect | null): void {
        this.rect.set(rect);
    }

    private toggleClass(active: boolean): void {
        if (typeof document === 'undefined') {
            return;
        }
        document.body.classList.toggle(IMMERSIVE_BODY_CLASS, active);
    }
}
