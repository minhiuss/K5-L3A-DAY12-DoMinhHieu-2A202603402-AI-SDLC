// Every rule number the game uses. game.contract.json -> "tuning" must match this
// (tests/contract.test.mjs checks it). Distances in meters, times in seconds.
export const TUNING = {
  player_speed: 6,
  carry_capacity: 5,
  lantern_cost: 4,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2.5,
  pulse_cost: 1,
  pulse_radius: 6,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 2,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 1,
  safe_radius: 5,
  shade_speed: 3.5,
  shade_hit_radius: 1,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 25,
    per_second_left: 1,
    per_flame_left: 50,
  },
};

// World values that are not part of the contract tuning (documented in README).
export const WORLD = {
  island_radius: 40,
  lantern_ring_radius: 25,
  default_motes: 30,
  mote_min_r: 4,
  mote_max_r: 37,
  mote_respawn_s: 3,
  jump_speed: 7,
  gravity: 20,
  shade_y: 1,
  shade_spawn_r: 38,
  shade_first_spawn_s: 5,
  shade_spawn_every_s: 20,
  shade_max: 4,
};
