import {
    EmbeddedMpvAudioTrack,
    EmbeddedMpvSubtitleTrack,
} from '@iptvnator/shared/interfaces';

export function audioTrackLabel(
    track: EmbeddedMpvAudioTrack,
    index: number
): string {
    const label = track.title || track.language || `Audio ${index + 1}`;
    return track.defaultTrack ? `${label} · Default` : label;
}

export function subtitleTrackLabel(
    track: EmbeddedMpvSubtitleTrack,
    index: number
): string {
    const label = track.title || track.language || `Subtitle ${index + 1}`;
    return track.defaultTrack ? `${label} · Default` : label;
}
