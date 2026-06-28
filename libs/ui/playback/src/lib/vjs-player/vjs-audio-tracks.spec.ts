import {
    readVjsAudioTracks,
    selectVjsAudioTrack,
    setupVjsAudioTrackMenu,
    type VideoJsAudioTrackList,
    type VjsAudioTrackPlayer,
} from './vjs-audio-tracks';

function createTrackList(
    tracks: Array<{ label?: string; language?: string; enabled?: boolean }>
): VideoJsAudioTrackList {
    const list = {
        length: tracks.length,
        addEventListener: jest.fn(),
    } as unknown as VideoJsAudioTrackList;
    tracks.forEach((track, index) => {
        (list as Record<number, unknown>)[index] = { ...track };
    });
    return list;
}

function createPlayer(
    overrides: Partial<VjsAudioTrackPlayer> = {}
): VjsAudioTrackPlayer {
    return {
        audioTracks: () => null,
        tech: () => null,
        getChild: () => null,
        ...overrides,
    };
}

describe('vjs-audio-tracks', () => {
    it('projects the audio track list onto PlayerTrack with labels and selection', () => {
        const list = createTrackList([
            { label: 'English', enabled: true },
            { language: 'de', enabled: false },
            {},
        ]);
        const player = createPlayer({ audioTracks: () => list });

        expect(readVjsAudioTracks(player)).toEqual([
            { id: 0, label: 'English', selected: true },
            { id: 1, label: 'de', selected: false },
            { id: 2, label: 'Audio 3', selected: false },
        ]);
    });

    it('returns an empty list when no audio tracks exist', () => {
        expect(readVjsAudioTracks(createPlayer())).toEqual([]);
    });

    it('enables only the selected track index', () => {
        const list = createTrackList([
            { enabled: true },
            { enabled: false },
        ]);
        selectVjsAudioTrack(createPlayer({ audioTracks: () => list }), 1);

        expect((list as Record<number, { enabled: boolean }>)[0].enabled).toBe(
            false
        );
        expect((list as Record<number, { enabled: boolean }>)[1].enabled).toBe(
            true
        );
    });

    it('does not build a control-bar menu for a single track', () => {
        const getChild = jest.fn();
        const player = createPlayer({
            audioTracks: () => createTrackList([{ enabled: true }]),
            getChild,
        });

        setupVjsAudioTrackMenu(player);

        expect(getChild).not.toHaveBeenCalled();
    });

    it('adds and shows the audio track button for multiple tracks', () => {
        const audioButton = { show: jest.fn(), update: jest.fn() };
        const controlBar = {
            getChild: jest.fn(() => null),
            addChild: jest.fn(() => audioButton),
        };
        const player = createPlayer({
            audioTracks: () =>
                createTrackList([{ enabled: true }, { enabled: false }]),
            getChild: jest.fn(() => controlBar),
        });

        setupVjsAudioTrackMenu(player);

        expect(controlBar.addChild).toHaveBeenCalledWith(
            'audioTrackButton',
            {}
        );
        expect(audioButton.show).toHaveBeenCalled();
        expect(audioButton.update).toHaveBeenCalled();
    });
});
