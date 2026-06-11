// "Aurora borealis" night palette, shared by arena + slingshot.
// Rule of the theme: ember/emberLight are the ONLY warm colors — reserve them
// for the player-owned object (player, projectile). Everything else stays cold.
// Colors are named, not semantic: each game maps them onto its own entities.
export const AURORA = {
  night: 0x0a1128, // background sky
  deepBlue: 0x1c2541, // walls / structure blocks (dark tone)
  slateBlue: 0x3a506b, // structure blocks (light tone)
  snow: 0xe8edf2, // snowy ground band
  ember: 0xff9f1c, // the ONLY strong warm color
  emberLight: 0xffd166, // warm highlight (trails, projectiles)
  auroraGreen: 0x2ec4b6, // targets / enemies
  violet: 0x9d4edd, // slingshot / second enemy type
  iceCyan: 0xcaf0f8, // UI accents, trajectory preview, gems
  white: 0xffffff, // flashes, stars
} as const;
