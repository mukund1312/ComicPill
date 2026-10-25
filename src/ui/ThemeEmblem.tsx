import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';

const portraits: Record<string, ImageSource> = {
  iron: require('../../assets/theme-portraits/01_iron_iron-man.svg'),
  gotham: require('../../assets/theme-portraits/02_gotham_batman.svg'),
  krypton: require('../../assets/theme-portraits/03_krypton_superman.svg'),
  amazon: require('../../assets/theme-portraits/04_amazon_wonder-woman.svg'),
  web: require('../../assets/theme-portraits/05_web_spider-man.svg'),
  emerald: require('../../assets/theme-portraits/06_emerald_green-lantern.svg'),
  speed: require('../../assets/theme-portraits/07_speed_flash.svg'),
  panther: require('../../assets/theme-portraits/08_panther_black-panther.svg'),
  thunder: require('../../assets/theme-portraits/09_thunder_thor.svg'),
  liberty: require('../../assets/theme-portraits/10_liberty_captain-america.svg'),
  chaos: require('../../assets/theme-portraits/11_chaos_joker.svg'),
  doom: require('../../assets/theme-portraits/12_doom_doctor-doom.svg'),
  titan: require('../../assets/theme-portraits/13_titan_thanos.svg'),
  goblin: require('../../assets/theme-portraits/14_goblin_green-goblin.svg'),
  magnetic: require('../../assets/theme-portraits/15_magnetic_magneto.svg'),
  apokolips: require('../../assets/theme-portraits/16_apokolips_darkseid.svg'),
  symbiote: require('../../assets/theme-portraits/17_symbiote_venom.svg'),
  reverse: require('../../assets/theme-portraits/18_reverse_reverse-flash.svg'),
  freeze: require('../../assets/theme-portraits/19_freeze_mister-freeze.svg'),
  harlequin: require('../../assets/theme-portraits/20_harlequin_harley-quinn.svg'),
};

/** The user-selected character portrait. ComicPill Default intentionally has no character. */
export function ThemeEmblem({ id, size = 52 }: { id: string; size?: number }) {
  const source = portraits[id];
  if (!source) return null;

  return <Image
    accessible
    accessibilityLabel={`${id} theme portrait`}
    contentFit="contain"
    source={source}
    style={{ width: size, height: size }}
  />;
}
