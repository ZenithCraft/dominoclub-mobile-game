import { createAudioPlayer } from 'expo-audio';
import { useSettingsStore } from '../store/settings.store';

// Placeholder SFX — short synthesized clips. Swap the files in
// assets/sounds/ for final art anytime; no code changes needed.
const sources = {
  tilePlace: require('../../assets/sounds/tile_place.wav'),
  tileSelect: require('../../assets/sounds/tile_select.wav'),
  deal: require('../../assets/sounds/deal.wav'),
  buttonClick: require('../../assets/sounds/button_click.wav'),
  score: require('../../assets/sounds/score.wav'),
} as const;

type SfxName = keyof typeof sources;

function play(name: SfxName) {
  if (!useSettingsStore.getState().soundOn) return;
  try {
    const player = createAudioPlayer(sources[name]);
    player.play();
    // All clips are well under a second — free the native player once it's done.
    setTimeout(() => {
      try { player.remove(); } catch {}
    }, 2000);
  } catch {}
}

export const sfx = {
  tilePlace: () => play('tilePlace'),
  tileSelect: () => play('tileSelect'),
  deal: () => play('deal'),
  buttonClick: () => play('buttonClick'),
  score: () => play('score'),
};
