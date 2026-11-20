// Ticket-02 standard numbers (contract v1.1). game.contract.json -> "tuning" must equal
// TUNING (tests/contract.test.mjs). Meters, seconds, 60 ticks per second.
export const TUNING = {
  player_speed: 6,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 240, // v1.2 (Ticket-03)
  night2_duration_s: 270,
  night3_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  fall_enabled: true,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  fuel_max: 100,
  fuel_decay_per_s: 1.0,
  fuel_per_mote: 10,
  relight_cost: 5,
  win_ratio: 0.6,
  drain_per_s: 5,
  low_fuel_threshold: 30,
  capacity_max: 20,
  score: {
    per_mote: 5,          // every mote put into a lantern (light, relight, refuel)
    per_lantern: 100,     // first light
    per_stun: 5,
    per_second_left: 0,   // time bonus removed in v1.2
    per_flame_left: 50,
  },
};

// Other standard numbers from Ticket-02 that are not contract tuning keys.
export const RULES = {
  jump_speed: 7,
  gravity: 20,
  height_tolerance: 1.5,       // pickup / contact vertical window
  step_up: 0.25,               // assumption B9: max ledge you can walk up (ramps)
  mote_start: 20,
  mote_cap: 30,
  mote_spawn_every: 240,
  dropped_ttl: 480,
  drop_ring: [1.5, 2.5],
  shade_detect: 12,
  shade_lose: 18,
  shade_spawning_ticks: 60,    // assumption B3
  shade_first_spawn: 300,
  shade_spawn_min_dist: 15,
  shade_recoil_m: 2,
  shade_recoil_ticks: 60,
  shade_push_ticks: 15,
  shade_y: 1,
  safe_evict_ticks: 30,
  pulse_center_y: 0.8,
  fall_y: -10,
  respawn_wait: 60,
  drifter_speed: 7,
  drifter_idle_speed: 2,
  drifter_max: 2,
  drifter_every: 1200,
  drifter_detect: 15,
  drifter_need: 5,
  drifter_touch: 1.2,
  drifter_steal: 3,
  drifter_flee_ticks: 240,
  drifter_drop_vanish: 120,
  drifter_y: 1.2,
  charm_ticks: 600,
  charm_speed: 7.2,
  charm_respawn: 2700,
  wind_every: 1800,
  wind_len: 300,
  wind_warn: 120,
  wind_speed: 2,
  // Ticket-03 (v1.2) numbers that are not contract tuning keys
  capacity_base: 10,
  capacity_per_light: 2,
  score_relight: 40,
  score_stun_drain: 15,      // total for hitting a draining shade
  score_dawn_lantern: 50,    // + floor(fuel), per lit lantern at dawn (win only)
  drain_reach: 2,            // wander -> drain within 2 m of a weak lantern
  drain_break: 6,            // drain -> chase if Mây is within 6 m
  drain_event_every: 60,
  // Ticket-04 (v1.3) bench scene
  bench_shades: 200,
  bench_motes: 100,
  // creative mode only (window, never headless/bench): ADR-002
  arrow_range: 25,
  arrow_width: 1.0,
  arrow_stun: 60,
  arrow_cooldown: 60,
  sprint_after: 90,
  sprint_mult: 1.25,
};
