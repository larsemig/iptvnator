import { EmbeddedMpvImmersiveService } from './embedded-mpv-immersive.service';

const IMMERSIVE_BODY_CLASS = 'embedded-mpv-immersive';
const FULLSCREEN_BODY_CLASS = 'embedded-mpv-fullscreen';

describe('EmbeddedMpvImmersiveService', () => {
    let service: EmbeddedMpvImmersiveService;

    beforeEach(() => {
        service = new EmbeddedMpvImmersiveService();
        document.body.classList.remove(IMMERSIVE_BODY_CLASS);
        document.body.classList.remove(FULLSCREEN_BODY_CLASS);
    });

    afterEach(() => {
        document.body.classList.remove(IMMERSIVE_BODY_CLASS);
        document.body.classList.remove(FULLSCREEN_BODY_CLASS);
    });

    it('adds the body class on first activation', () => {
        service.activate();
        expect(document.body.classList.contains(IMMERSIVE_BODY_CLASS)).toBe(
            true
        );
    });

    it('removes the body class on balanced deactivation', () => {
        service.activate();
        service.deactivate();
        expect(document.body.classList.contains(IMMERSIVE_BODY_CLASS)).toBe(
            false
        );
    });

    it('keeps the class until the last activator deactivates (ref-counted)', () => {
        service.activate();
        service.activate();
        service.deactivate();
        expect(document.body.classList.contains(IMMERSIVE_BODY_CLASS)).toBe(
            true
        );
        service.deactivate();
        expect(document.body.classList.contains(IMMERSIVE_BODY_CLASS)).toBe(
            false
        );
    });

    it('ignores unbalanced deactivation', () => {
        expect(() => service.deactivate()).not.toThrow();
        expect(document.body.classList.contains(IMMERSIVE_BODY_CLASS)).toBe(
            false
        );
    });

    it('drives the active signal across the ref-count lifecycle', () => {
        expect(service.active()).toBe(false);
        service.activate();
        expect(service.active()).toBe(true);
        service.activate();
        service.deactivate();
        // Still active — second activator holds it open.
        expect(service.active()).toBe(true);
        service.deactivate();
        expect(service.active()).toBe(false);
    });

    it('toggles the fullscreen signal and body class together', () => {
        service.setFullscreen(true);
        expect(service.fullscreen()).toBe(true);
        expect(document.body.classList.contains(FULLSCREEN_BODY_CLASS)).toBe(
            true
        );
        service.setFullscreen(false);
        expect(service.fullscreen()).toBe(false);
        expect(document.body.classList.contains(FULLSCREEN_BODY_CLASS)).toBe(
            false
        );
    });

    it('stores and clears the native video rect', () => {
        expect(service.rect()).toBeNull();
        const rect = { x: 10, y: 20, width: 640, height: 360 };
        service.setRect(rect);
        expect(service.rect()).toEqual(rect);
        service.setRect(null);
        expect(service.rect()).toBeNull();
    });
});
