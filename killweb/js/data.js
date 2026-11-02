/* Kill Web: game data. Units are km, km/h and game seconds. All performance values are game values, not real data. */
(function (KW) {
  'use strict';

  // ---------------------------------------------------------------- friendly unit templates
  // sens: gnd = ground detection km, air = [low, mid, high] detection km, id = camera identification km, idRate = ID speed
  const UT = {
    menace: { kind: 'hq', product: 'menace', code: 'C2', label: 'Command node', band: 0, hp: 420, cls: 'site', mesh: 12,
      sens: { gnd: 4, air: [5, 6, 6], id: 3, idRate: 0.4, ir: true } },
    site: { kind: 'site', code: 'SITE', label: 'Protected site', band: 0, hp: 300, cls: 'site', sens: { gnd: 3, air: [4, 4, 3], id: 3, idRate: 0.45, ir: true } },
    truck: { kind: 'truck', code: 'LOG', label: 'Relief truck', band: 0, hp: 240, cls: 'light', speed: 45 },
    sentry: { kind: 'tower', product: 'sentry', code: 'STY', label: 'Sentry tower', band: 0, hp: 160, cls: 'site', mesh: 8,
      sens: { gnd: 6, air: [7, 12, 12], id: 5, idRate: 0.4, ir: false }, build: 25 },
    nest: { kind: 'nest', product: 'anvil', code: 'ANV', label: 'Anvil nest', band: 0, hp: 120, cls: 'site', stock: 6, regen: 32, weapon: 'anvil',
      sens: { gnd: 0, air: [6, 6, 3], id: 3, idRate: 0.45, ir: true } },
    rrpad: { kind: 'rrpad', product: 'roadrunner', code: 'RR', label: 'Roadrunner-M pad', band: 0, hp: 140, cls: 'site', stock: 3, regen: 120, weapon: 'roadrunner',
      sens: { gnd: 0, air: [8, 10, 8], id: 0 } },
    tubes: { kind: 'tubes', product: 'altius', code: 'ALT', label: 'Altius launcher', band: 0, hp: 120, cls: 'site', stock: 4, regen: 70 },
    bcl: { kind: 'bcl', product: 'barracuda', code: 'BCL', label: 'Barracuda-100M launcher', band: 0, hp: 140, cls: 'site', stock: 2, regen: 200, weapon: 'b100' },
    pulsar: { kind: 'pulsar', product: 'pulsar', code: 'EW', label: 'Pulsar EW vehicle', band: 0, hp: 120, cls: 'light', speed: 40,
      jam: 4, energy: 100, esm: 15, sens: { gnd: 2, air: [3, 2, 0] } },
    ghost: { kind: 'air', product: 'ghost', code: 'GHX', label: 'Ghost-X helicopter', band: 1, hp: 45, cls: 'heli', speed: 100,
      sens: { gnd: 6, air: [5, 5, 3], id: 4, idRate: 0.6, ir: false } },
    team: { kind: 'team', product: 'eagleeye', code: 'EE', label: 'EagleEye fireteam', band: 0, hp: 70, cls: 'light', speed: 30, mesh: 3,
      sens: { gnd: 3, air: [2.5, 1.5, 0], id: 3, idRate: 0.6, ir: true }, stock: 3, regen: 300, weapon: 'boltm', lowSig: true },
    altius: { kind: 'air', product: 'altius', code: 'A600', label: 'Altius-600 (ISR)', band: 1, hp: 25, cls: 'uas', speed: 110, mesh: 13,
      sens: { gnd: 9, air: [10, 10, 8], id: 5, idRate: 0.45, ir: true }, ew: 2 },
    bolt: { kind: 'air', product: 'bolt', code: 'BLT', label: 'Bolt recon quadrotor', band: 1, hp: 8, cls: 'fpv', speed: 70,
      sens: { gnd: 3, air: [2, 1, 0], id: 2.2, idRate: 0.6, ir: true }, life: 600 },
    omen: { kind: 'air', product: 'omen', code: 'OMN', label: 'Omen hybrid VTOL', band: 2, hp: 140, cls: 'uas', speed: 250, mesh: 15,
      sens: { gnd: 10, air: [18, 18, 14], id: 3.5, idRate: 0.3, ir: true } },
    thunder: { kind: 'air', product: 'thunder', code: 'THN', label: 'Thunder tiltrotor', band: 1, hp: 230, cls: 'heli', speed: 450, mesh: 6,
      sens: { gnd: 7, air: [6, 6, 4], id: 4, idRate: 0.45, ir: true }, ammo: { rkt: 4, b100: 4, ci: 8, a6: 2 } },
    fury: { kind: 'air', product: 'fury', code: 'CCA', label: 'YFQ-44A Fury', band: 3, hp: 130, cls: 'jet', speed: 1000,
      sens: { gnd: 0, air: [12, 22, 26], id: 6, idRate: 0.4, ir: true }, ammo: { aam: 4 }, station: 360 },
  };

  // ---------------------------------------------------------------- weapons
  // kind: guided (pursues a target), area (flies to a point and bursts), loiter (searches an area), hitscan (instant)
  const WT = {
    anvil: { name: 'Anvil', kind: 'guided', speed: 350, range: 8, dmg: 60, pk: { fpv: 0.88, uas: 0.72 }, bands: [1, 2], reusable: true, srm: false },
    roadrunner: { name: 'Roadrunner-M', kind: 'guided', speed: 950, range: 22, dmg: 190, pk: { uas: 0.86, cm: 0.82, heli: 0.78, jet: 0.35, boss: 0.7 }, bands: [1, 2, 3], reusable: true, srm: true },
    aam: { name: 'AAM', kind: 'guided', speed: 2600, range: 25, dmg: 210, pk: { jet: 0.76, heli: 0.8, uas: 0.86, cm: 0.62, boss: 0.85 }, bands: [1, 2, 3], srm: true },
    b100: { name: 'Barracuda-100M', kind: 'guided', speed: 780, range: 120, dmg: 240, pk: { light: 0.9, medium: 0.88, heavy: 0.82, site: 0.9 }, bands: [0], low: true, cost: 50 },
    b500: { name: 'Barracuda-500M', kind: 'guided', speed: 820, range: 999, dmg: 420, pk: { light: 0.92, medium: 0.92, heavy: 0.9, site: 0.92 }, bands: [0], low: true },
    boltm: { name: 'Bolt-M', kind: 'guided', speed: 110, range: 12, dmg: 95, pk: { light: 0.86, medium: 0.76, heavy: 0.5, site: 0.6 }, bands: [0], heavyMul: 0.5 },
    a600m: { name: 'Altius-600M', kind: 'loiter', speed: 110, range: 999, life: 900, dmg: 140, pk: { light: 0.86, medium: 0.82, heavy: 0.62, site: 0.72 }, bands: [0], cost: 25 },
    a700m: { name: 'Altius-700M', kind: 'loiter', speed: 120, range: 999, life: 600, dmg: 290, pk: { light: 0.9, medium: 0.9, heavy: 0.86, site: 0.86 }, bands: [0], cost: 40 },
    rkt: { name: 'Rocket salvo', kind: 'area', speed: 2200, range: 6, area: 0.6, dmg: 48, pk: { fpv: 0.5, uas: 0.3, light: 0.95, medium: 0.65, heavy: 0.15, site: 0.4, heli: 0.35, cm: 0.1 }, bands: [0, 1], srm: true },
    ci: { name: 'Close-in interceptor', kind: 'guided', speed: 420, range: 3, dmg: 70, pk: { fpv: 0.86, uas: 0.76, cm: 0.45 }, bands: [1], srm: true },
    // Vanta weapons
    sam: { name: 'SAM', kind: 'guided', speed: 1500, range: 14, dmg: 160, pk: { jet: 0.5, heli: 0.62, uas: 0.66, cm: 0.25, fpv: 0.3 }, pkShot: 0.3, bands: [1, 2, 3] },
    manpads: { name: 'MANPADS', kind: 'guided', speed: 1800, range: 3.5, dmg: 70, pk: { heli: 0.45, uas: 0.55, fpv: 0.35, cm: 0.15 }, pkShot: 0.3, bands: [1] },
    eaam: { name: 'Air-to-air missile', kind: 'guided', speed: 2400, range: 15, dmg: 120, pk: { jet: 0.42, heli: 0.5, uas: 0.6 }, bands: [1, 2, 3] },
    glide: { name: 'Glide bomb', kind: 'guided', speed: 420, range: 9, dmg: 60, pk: { site: 0.9, light: 0.6, medium: 0.6, heavy: 0.5 }, bands: [0] },
    hrkt: { name: 'Rocket artillery', kind: 'area', speed: 0, flight: 22, range: 32, area: 0.7, dmg: 70, bands: [0] },
    trkt: { name: 'Helicopter rockets', kind: 'area', speed: 1800, range: 5, area: 0.35, dmg: 32, bands: [0] },
    cannon: { name: '30 mm cannon', kind: 'hitscan', range: 2, dmg: 14, pk: { light: 0.6, heli: 0.4, uas: 0.5, fpv: 0.35, site: 0.7, medium: 0.3 }, bands: [0, 1] },
    tgun: { name: 'Tank gun', kind: 'hitscan', range: 3, dmg: 70, pk: { light: 0.75, medium: 0.7, site: 0.85, heavy: 0.5 }, bands: [0] },
  };

  // ---------------------------------------------------------------- Vanta Combine threats
  const ET = {
    wasp: { ai: 'kamikaze', name: 'WASP', label: 'FPV attack quadcopter', code: 'FPV', band: 1, hp: 10, cls: 'fpv', speed: 120, rf: true, impact: 20, ir: 0.12, value: 5, art: 'quad' },
    gnat: { ai: 'recon', name: 'GNAT', label: 'Recon quadcopter', code: 'UAV', band: 1, hp: 10, cls: 'fpv', speed: 70, rf: true, spot: 2.5, value: 6, art: 'quad' },
    kite: { ai: 'recon', name: 'KITE', label: 'Group 2 recon drone', code: 'UAV', band: 1, hp: 24, cls: 'uas', speed: 110, rf: true, spot: 4, value: 10, art: 'fixedwing' },
    lance: { ai: 'kamikaze', name: 'LANCE', label: 'One-way attack drone', code: 'OWA', band: 1, hp: 32, cls: 'uas', speed: 185, gnss: true, impact: 90, ir: 0.3, value: 16, art: 'delta' },
    spear: { ai: 'kamikaze', name: 'SPEAR', label: 'Cruise missile', code: 'CM', band: 1, hp: 40, cls: 'cm', speed: 800, impact: 95, ir: 0.35, value: 25, art: 'missile' },
    shrike: { ai: 'shrike', name: 'SHRIKE', label: 'Group 4 MALE drone', code: 'UAV', band: 2, hp: 90, cls: 'uas', speed: 220, spot: 8, weapon: 'glide', cd: 50, value: 40, art: 'male' },
    talon: { ai: 'heli', name: 'TALON', label: 'Attack helicopter', code: 'HEL', band: 1, hp: 150, cls: 'heli', speed: 260, weapon: 'trkt', cd: 16, value: 45, art: 'heli' },
    scythe: { ai: 'jet', name: 'SCYTHE', label: 'Fighter-bomber', code: 'FTR', band: 3, hp: 170, cls: 'jet', speed: 950, weapon: 'eaam', cd: 20, value: 60, art: 'jet' },
    mother: { ai: 'mother', name: 'MOTHERSHIP', label: 'Drone carrier aircraft', code: 'CV', band: 2, hp: 2000, pd: 0.3, cls: 'boss', speed: 150, value: 400, art: 'carrier', emitter: true },
    jackal: { ai: 'ground', name: 'JACKAL', label: 'Technical with MANPADS', code: 'AD', band: 0, hp: 60, cls: 'light', speed: 60, weapon: 'manpads', cd: 30, value: 15, art: 'pickup', spot: 2.5 },
    ram: { ai: 'ground', name: 'RAM', label: 'Armored personnel carrier', code: 'APC', band: 0, hp: 150, cls: 'medium', speed: 45, weapon: 'cannon', cd: 3, value: 25, art: 'apc', spot: 2.5 },
    bastion: { ai: 'ground', name: 'BASTION', label: 'Main battle tank', code: 'MBT', band: 0, hp: 320, cls: 'heavy', speed: 35, weapon: 'tgun', cd: 8, value: 45, art: 'tank', spot: 3 },
    hydra: { ai: 'artillery', name: 'HYDRA', label: 'Rocket artillery', code: 'MLRS', band: 0, hp: 110, cls: 'medium', speed: 40, weapon: 'hrkt', cd: 170, value: 50, art: 'mlrs' },
    spire: { ai: 'sam', name: 'SPIRE', label: 'SAM site', code: 'SAM', band: 0, hp: 220, cls: 'site', speed: 0, weapon: 'sam', cd: 12, mag: 6, emitter: true, value: 70, art: 'sam' },
    static: { ai: 'ew', name: 'STATIC', label: 'EW jammer truck', code: 'EW', band: 0, hp: 80, cls: 'light', speed: 40, jamMesh: 8, emitter: true, value: 40, art: 'ewtruck' },
    c2post: { ai: 'fixed', name: 'C2 POST', label: 'Vanta command post', code: 'C2', band: 0, hp: 320, cls: 'site', speed: 0, emitter: true, value: 120, art: 'post' },
    lsite: { ai: 'spawner', name: 'LAUNCH SITE', label: 'Drone launch site', code: 'LS', band: 0, hp: 240, cls: 'site', speed: 0, value: 120, art: 'ramp' },
  };

  const NT = {
    airliner: { ai: 'liner', name: 'AIRLINER', label: 'Civil airliner', code: 'CIV', band: 3, hp: 100, cls: 'jet', speed: 780, art: 'airliner', coop: true },
    civcar: { ai: 'car', name: 'CIVILIAN', label: 'Civilian vehicle', code: 'CIV', band: 0, hp: 30, cls: 'light', speed: 55, art: 'car' },
    medevac: { ai: 'medevac', name: 'MEDEVAC', label: 'Air ambulance helicopter', code: 'MED', band: 1, hp: 60, cls: 'heli', speed: 230, art: 'heli' },
    boat: { ai: 'boat', name: 'FISHING BOAT', label: 'Fishing boat', code: 'CIV', band: 0, hp: 40, cls: 'light', speed: 18, art: 'boat' },
  };

  // ---------------------------------------------------------------- products (armory, loadout, codex)
  const SRC = {
    seed: ['Anduril products overview, Seedtable', 'https://seedtable.com/companies/anduril-industries/products'],
    menace: ['Anduril introduces Menace-T, Microwave Journal', 'https://www.microwavejournal.com/articles/43875-anduril-introduces-menace-t-a-compact-field-deployable-c4-system-designed-for-the-tactical-edge'],
    tower: ['Anduril debuts latest autonomous surveillance tower, ExecutiveBiz', 'https://executivebiz.com/2024/05/anduril-debuts-latest-autonomous-surveillance-tower-system/'],
    wisp: ['WISP, Anduril', 'https://www.anduril.com/hardware/wisp/'],
    ghost: ['Ghost-X, Directory of U.S. Military Rockets and Missiles', 'https://designation-systems.net/dusrm/app4/ghost-x.html'],
    altius: ['First look at the ALTIUS-700M, The War Zone', 'https://twz.com/air/our-first-look-at-the-altius-700m-loitering-munition-obliterating-a-target'],
    barracuda: ['Anduril introduces Barracuda-M, The War Zone', 'https://www.twz.com/air/anduril-introduces-barracuda-m-that-aims-to-disrupt-the-cruise-missile-market'],
    fury: ['YFQ-44A Fury is now in production, The Aviationist', 'https://theaviationist.com/2026/03/24/yfq-44a-fury-cca-is-now-in-production/'],
    omen: ['Anduril unveils Omen, The War Zone', 'https://www.twz.com/air/anduril-unveils-omen-hybrid-electric-tail-sitter-vtol-drone'],
    thunder: ['Anduril brings the Thunder, The War Zone', 'https://www.twz.com/news-features/anduril-brings-the-thunder-with-autonomous-tiltrotor-attack-drone-concept'],
    srm: ['Anduril opens solid rocket motor factory, TechCrunch', 'https://techcrunch.com/2025/08/12/anduril-opens-solid-rocket-motor-factory-amidst-ongoing-chemical-chokepoint/'],
    srm2: ['Anduril and Boeing team up for Army missile competition, OCBJ', 'https://www.ocbj.com/defense-2/anduril-boeing-team-up-for-u-s-army-missile-competition/'],
  };

  // mk[i] = cumulative bonus at Mk II (i=1) and Mk III (i=2); keys: hp, mesh, stock, regen (fraction), pk, air, gnd, id, idRate, speed, dmg, jam, energy, esm, station, aam, rkt, b100, ci, range, supplyRate, cost (fraction)
  const PRODUCTS = [
    { id: 'menace', name: 'Menace', model: 'Menace-T C4 node', cat: 'Command', unit: 'menace', slot: 0, art: 'menace', unlock: 'start',
      desc: 'Your command post. It runs the mesh, fuses every sensor into one picture and earns supply. Lose it and the mission is over.',
      real: 'Anduril\'s Menace family are deployable C4 systems. Menace-T is a two-case kit one operator sets up in minutes; it runs Lattice Mesh, encrypted comms and edge compute.',
      src: [SRC.menace], mk: [{ hp: 160, mesh: 3 }, { hp: 320, mesh: 6, supplyRate: 0.15 }], cost: [300, 650] },
    { id: 'sentry', name: 'Sentry', model: 'Sentry tower', cat: 'Sense', unit: 'sentry', slot: 0, art: 'sentry', unlock: 'start', build: true,
      desc: 'Built on hex pads during a mission for 25 supply. Radar finds air tracks out to 12 km; the camera identifies targets within 4 km.',
      real: 'Autonomous surveillance towers with radar and cameras that feed detections into Lattice; Customs and Border Protection runs them along the US border.',
      src: [SRC.tower], mk: [{ hp: 60, air: 2, gnd: 1 }, { hp: 120, air: 4, gnd: 2, id: 1 }], cost: [250, 550] },
    { id: 'wisp', name: 'Wisp', model: 'WISP passive infrared', cat: 'Sense', unit: null, slot: 0, art: 'wisp', unlock: 'm2', buy: 300, module: true,
      desc: 'Fits every Sentry tower and Ghost-X. Passive infrared: faster identification, longer reach against low drones, and full sight at night. Buy it once in the armory.',
      real: 'Wide-Area Infrared System for Persistent Surveillance: passive 360-degree infrared with AI processing. It emits nothing, so it can\'t be jammed or located.',
      src: [SRC.wisp], mk: [{ idRate: 0.15, air: 1 }, { idRate: 0.3, air: 2 }], cost: [300, 600] },
    { id: 'anvil', name: 'Anvil', model: 'Anvil interceptor nest', cat: 'Act', unit: 'nest', slot: 1, art: 'anvil', unlock: 'start',
      desc: 'Fast kinetic interceptors that ram small drones. Six ready rounds that reload on their own. An Anvil that doesn\'t need to strike flies home.',
      real: 'Counter-drone interceptor that destroys small hostile drones by ramming them rather than with explosives.',
      src: [SRC.seed], mk: [{ stock: 2, regen: 0.2 }, { stock: 4, regen: 0.35, pk: 0.05 }], cost: [250, 550] },
    { id: 'roadrunner', name: 'Roadrunner-M', model: 'Roadrunner-M pad', cat: 'Act', unit: 'rrpad', slot: 1, art: 'roadrunner', unlock: 'm3',
      desc: 'Twin-jet interceptor for one-way attack drones, helicopters and cruise missiles. If it doesn\'t need to strike, it lands and flies again.',
      real: 'Reusable twin-turbojet VTOL interceptor that returns and lands to refuel if it doesn\'t engage a target.',
      src: [SRC.seed], mk: [{ stock: 1, pk: 0.03 }, { stock: 2, speed: 0.15, pk: 0.06 }], cost: [350, 700] },
    { id: 'pulsar', name: 'Pulsar', model: 'Pulsar EW vehicle', cat: 'Act', unit: 'pulsar', slot: 1, art: 'pulsar', unlock: 'm2',
      desc: 'Jams drone control links inside a bubble and listens for enemy transmitters out to 15 km. Jammed quadcopters drift and crash; GNSS drones lose their aim.',
      real: 'Software-defined electromagnetic warfare family that uses AI to identify and counter unknown emitters and drone control signals.',
      src: [SRC.seed], mk: [{ jam: 1, energy: 30 }, { jam: 2, energy: 60, esm: 5 }], cost: [300, 600] },
    { id: 'ghost', name: 'Ghost-X', model: 'Ghost-X autonomous helicopter', cat: 'Sense', unit: 'ghost', slot: 1, art: 'ghost', unlock: 'm3',
      desc: 'Quiet scout helicopter. Send it to unknown tracks to identify them, or mark a target to raise strike accuracy.',
      real: 'Portable single-rotor VTOL drone for reconnaissance, targeting and force protection. Ghost-X carries 9 kg for about 75 minutes and navigates by vision when GPS is denied.',
      src: [SRC.ghost], mk: [{ hp: 20, id: 0.5, speed: 0.15 }, { hp: 40, id: 1, gnd: 2 }], cost: [250, 550] },
    { id: 'eagleeye', name: 'EagleEye team', model: 'EagleEye fireteam', cat: 'Sense', unit: 'team', slot: 1, art: 'eagleeye', unlock: 'm2',
      desc: 'Patch\'s fireteam. EagleEye helmets put the shared picture in front of them, so they identify ground targets fast. They carry Bolt and Bolt-M.',
      real: 'Mixed-reality helmet system that puts the Lattice picture into a wearable heads-up display, grown out of work on the US Army\'s IVAS program.',
      src: [SRC.seed], mk: [{ hp: 30, gnd: 1, id: 0.5 }, { hp: 60, mesh: 2, gnd: 2 }], cost: [250, 500] },
    { id: 'bolt', name: 'Bolt and Bolt-M', model: 'Bolt / Bolt-M', cat: 'Act', unit: null, slot: 0, art: 'bolt', unlock: 'm2', module: true,
      desc: 'Carried by the EagleEye team. Bolt is a recon quadrotor you can throw forward; Bolt-M carries a warhead for light and medium vehicles.',
      real: 'Man-portable VTOL quadrotor for reconnaissance and search; the Bolt-M variant carries a lethal payload.',
      src: [SRC.seed], mk: [{ stock: 1, dmg: 0.15 }, { stock: 2, dmg: 0.3, range: 3 }], cost: [250, 500] },
    { id: 'altius', name: 'Altius', model: 'Altius-600M launcher', cat: 'Act', unit: 'tubes', slot: 1, art: 'altius', unlock: 'm4',
      desc: 'Tube launched. Scouts an area, relays the mesh, then dives on the first ground hostile it identifies.',
      real: 'Tube-launched air vehicles. The ALTIUS-600 flies more than four hours as a scout or relay; the 700M carries a 15 kg penetrating warhead, comparable to a Hellfire.',
      src: [SRC.altius], mk: [{ stock: 1, id: 1 }, { stock: 2, dmg: 0.2, regen: 0.3 }], cost: [350, 700] },
    { id: 'barracuda', name: 'Barracuda', model: 'Barracuda-100M launcher', cat: 'Act', unit: 'bcl', slot: 2, art: 'barracuda', unlock: 'm6',
      desc: 'Low-cost cruise missile for any identified ground target on the map. It flies low, so SAMs struggle to catch it. Fury can carry the long-range 500M.',
      real: 'Software-defined, air-breathing cruise missile family built for low-cost mass production. The 100M fits ground launchers and helicopters; the 500M is air launched out to about 500 miles.',
      src: [SRC.barracuda], mk: [{ stock: 1, regen: 0.2 }, { stock: 2, dmg: 0.2, cost: 0.25 }], cost: [400, 800] },
    { id: 'fury', name: 'Fury', model: 'YFQ-44A Fury', cat: 'Act', unit: 'fury', slot: 2, art: 'fury', unlock: 'm5',
      desc: 'Collaborative combat aircraft. Send it to a patrol point: it engages identified air and ground hostiles there with missiles and two Barracuda-500M.',
      real: 'First-generation collaborative combat aircraft for the US Air Force. First flight on October 31, 2025; serial production at Arsenal-1 in Ohio began in March 2026.',
      src: [SRC.fury], mk: [{ aam: 1, station: 120 }, { aam: 2, station: 240, speed: 0.1 }], cost: [450, 900] },
    { id: 'omen', name: 'Omen', model: 'Omen hybrid VTOL, heavy Group 3', cat: 'Sense', unit: 'omen', slot: 2, art: 'omen', unlock: 'm5',
      desc: 'Hybrid tail-sitter. Its wide-area radar sees low cruise missiles far out, it relays the mesh like a flying cell tower, and it can resupply launchers and teams.',
      real: 'Heavy Group 3 hybrid-electric tail-sitter co-developed with the UAE\'s EDGE Group for long distances: maritime patrol, sensing, relay and resupply.',
      src: [SRC.omen], mk: [{ hp: 30, air: 4 }, { hp: 60, mesh: 5, air: 6 }], cost: [350, 700] },
    { id: 'thunder', name: 'Thunder', model: 'Thunder autonomous tiltrotor', cat: 'Act', unit: 'thunder', slot: 2, art: 'thunder', unlock: 'm7',
      desc: 'Armed tiltrotor. Send it on a strike: rockets for light vehicles, Barracuda-100M for armor, close-in interceptors for drones. Rearms at base.',
      real: 'Group 5 hybrid-electric tiltrotor unveiled at Farnborough on July 20, 2026, built with Archer. Its bays carry up to 10 Hellfire, JAGM or Barracuda-100M, 16 launched effects or 76 rockets.',
      src: [SRC.thunder], mk: [{ hp: 60, rkt: 2 }, { hp: 120, rkt: 2, b100: 2, ci: 2 }], cost: [500, 1000] },
    { id: 'srm', name: 'Solid rocket motors', model: 'Anduril solid rocket motors', cat: 'Arsenal', unit: null, slot: 0, art: 'srm', unlock: 'm5', buy: 300, module: true,
      desc: 'Powers the base rocket salvo and makes every rocket-powered shot fly faster. Mk II adds range, Mk III adds accuracy.',
      real: 'Anduril builds solid rocket motors at a Mississippi factory aiming for 6,000 tactical motors a year by the end of 2026, and supplies motors for Boeing\'s medium-range interceptor bid.',
      src: [SRC.srm, SRC.srm2], mk: [{ range: 0.2 }, { range: 0.2, pk: 0.06 }], cost: [600, 900] },
  ];
  const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

  // ---------------------------------------------------------------- Lattice skill tree
  const SKILLS = [
    { id: 'wide', br: 'sense', tier: 1, name: 'Wide Aperture', max: 3, desc: '+10% sensor range per rank.' },
    { id: 'fusion', br: 'sense', tier: 1, name: 'Fusion Engine', max: 3, desc: '+20% identification speed and faster track quality per rank.' },
    { id: 'stare', br: 'sense', tier: 2, name: 'Persistent Stare', max: 2, desc: 'Lost tracks keep coasting 30 s longer per rank.' },
    { id: 'sweep', br: 'sense', tier: 2, name: 'Passive Sweep', max: 1, desc: '+50% Pulsar listening range and emitter fixes twice as tight.' },
    { id: 'predict', br: 'sense', tier: 3, name: 'Predictive Tracks', max: 1, desc: 'Shows impact points and ETAs for inbound hostiles; +5% hit probability.' },
    { id: 'skyeye', br: 'sense', tier: 3, name: 'Sky Eye', max: 1, desc: 'Air assets identify at full rate while moving, and +25% identification range.' },
    { id: 'capacity', br: 'decide', tier: 1, name: 'Mesh Capacity', max: 3, desc: '+1 loadout slot per rank.' },
    { id: 'logistics', br: 'decide', tier: 1, name: 'Logistics Chain', max: 3, desc: '+15% supply rate per rank.' },
    { id: 'reserve', br: 'decide', tier: 2, name: 'Reserve Supply', max: 2, desc: '+40 starting supply per rank.' },
    { id: 'hardened', br: 'decide', tier: 2, name: 'Hardened Mesh', max: 2, desc: '+15% mesh range per rank, and enemy jamming bites 35% less per rank.' },
    { id: 'autonomy', br: 'decide', tier: 3, name: 'Full Autonomy', max: 1, desc: 'Unlocks AUTONOMOUS mode: assets also strike ground hostiles and send scouts to unknown tracks on their own. It still never engages a track it hasn\'t identified.' },
    { id: 'rapid', br: 'decide', tier: 3, name: 'Rapid Retask', max: 2, desc: 'Launchers reload 20% faster per rank.' },
    { id: 'hardkill', br: 'act', tier: 1, name: 'Hard Kill', max: 3, desc: '+10% damage per rank.' },
    { id: 'precision', br: 'act', tier: 1, name: 'Precision Effects', max: 2, desc: '+6% hit probability per rank.' },
    { id: 'swarm', br: 'act', tier: 2, name: 'Swarm Doctrine', max: 1, desc: 'Anvil nests carry 2 more rounds and fire pairs into swarms.' },
    { id: 'reusable', br: 'act', tier: 2, name: 'Reusable Fleet', max: 2, desc: 'Aircraft rearm and repair 30% faster per rank; +1 Roadrunner-M at rank 2.' },
    { id: 'overmatch', br: 'act', tier: 3, name: 'Overmatch', max: 1, desc: '+1 Fury sortie per mission, and sorties cost 25% less.' },
    { id: 'arsenal', br: 'act', tier: 3, name: 'Arsenal', max: 1, desc: 'Every launcher holds 1 more round, and Barracuda costs 30% less.' },
  ];
  const BRANCHES = [
    { id: 'sense', name: 'Sense', blurb: 'Find tracks sooner, name them faster, and keep them.' },
    { id: 'decide', name: 'Decide', blurb: 'More assets on the mesh, more supply, and deeper autonomy.' },
    { id: 'act', name: 'Act', blurb: 'Hit harder, hit more often, and rearm faster.' },
  ];

  // ---------------------------------------------------------------- cast
  const CAST = {
    REYES: { name: 'Col. Ada Reyes', role: 'Commander, Task Force Warden', color: '#d9a55a' },
    HALE: { name: 'Dr. Lin Hale', role: 'Lattice autonomy engineer', color: '#b49cf0' },
    PATCH: { name: 'SSgt. Tomas Okafor', role: 'EagleEye team lead, callsign PATCH', color: '#9cc7a4' },
    JUNO: { name: 'Lt. Juno Marsh', role: 'Electromagnetic warfare officer', color: '#6fd0c4' },
    VESPER: { name: 'Maj. Dana Kim', role: 'Fury flight lead, callsign VESPER', color: '#d6a2c8' },
  };

  // ---------------------------------------------------------------- campaign
  const SPOTS = (mx, my) => ({
    nest: [mx + 2, my + 0.3], rrpad: [mx - 0.9, my + 1.1], tubes: [mx - 1.5, my - 0.2], bcl: [mx - 2.1, my + 0.9],
    pulsar: [mx + 3.2, my + 0.1], team: [mx + 3.6, my - 1.1], ghost: [mx + 0.8, my + 1.1], omen: [mx - 0.2, my + 1.6], thunder: [mx + 1.3, my + 1.7],
  });

  const MISSIONS = [
    {
      id: 'm1', act: 1, name: 'Tripwire', place: 'Outpost Juniper', theater: [33, 61], tutorial: true, slots: 1,
      map: { seed: 11, coast: { side: 'south', d: 3.5 }, high: { side: 'north', k: 0.85 },
        roads: [[[0.5, 18], [6, 17.5], [12, 16.8], [18, 15], [24, 13.5], [30, 10], [39.5, 7]]],
        towns: [{ x: 12.6, y: 16.9, r: 0.7, name: 'Juniper' }, { x: 28.5, y: 11, r: 0.6, name: 'Varlo' }] },
      sites: [{ id: 'outpost', name: 'Outpost Juniper', x: 12.5, y: 16.1, hp: 300 }],
      menace: [10.6, 17.6], pads: [[16.2, 12.6], [8.6, 12.2], [20.2, 17.2]],
      pre: [{ type: 'sentry', at: [14.2, 14.3] }],
      forced: ['anvil'], supply: { start: 50, rate: 0.1 },
      waves: [
        { t: 40, units: [{ type: 'gnat', n: 2, from: [21, -0.5], to: { loiter: [15.5, 11.5], r: 1.4 }, stagger: 20 }] },
        { t: 520, units: [{ type: 'wasp', n: 5, from: 'NE', to: 'site:outpost', stagger: 6 }] },
        { t: 1100, units: [{ type: 'wasp', n: 7, from: 'N', to: 'nearest', stagger: 5 }, { type: 'kite', n: 1, from: 'NE', to: { loiter: [18, 9.5], r: 2.5 } }] },
        { t: 1750, units: [{ type: 'wasp', n: 6, from: 'N', to: 'site:outpost', stagger: 5 }, { type: 'wasp', n: 6, from: 'E', to: 'nearest', stagger: 5 }] },
        { t: 2400, units: [{ type: 'wasp', n: 10, from: 'NE', to: 'nearest', stagger: 4 }, { type: 'gnat', n: 2, from: 'N', to: { loiter: [11, 12], r: 1.5 } }] },
      ],
      neutrals: [{ type: 'civcar', every: 260, road: 0 }],
      objectives: [
        { id: 'protect', kind: 'protect', site: 'outpost', label: 'Keep Outpost Juniper standing' },
        { id: 'clear', kind: 'clearWaves', label: 'Defeat all five Vanta probes' },
        { id: 'build', kind: 'build', n: 2, bonus: true, label: 'Build 2 more Sentry towers' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['REYES', 'Warden-6, welcome to the Kestrel Coast. Vanta Combine drones have been probing Outpost Juniper every night this week. Tonight we stop treating it as weather.'],
        ['HALE', 'You have one Sentry tower up and an Anvil nest. Radar finds them, the tower camera tells you what they are, and only then do you shoot. That order matters.'],
        ['REYES', 'Hold Juniper and build more towers when supply allows. And watch the road: the farmers still drive it.'],
      ],
      win: ['REYES', 'Clean work. Vanta just learned this outpost bites back.'],
      reward: { xp: 300, credits: 250 },
    },
    {
      id: 'm2', act: 1, name: 'Static Night', place: 'Harlow Substation', theater: [41, 52], night: true, slots: 3,
      map: { seed: 23, coast: { side: 'south', d: 3 }, high: { side: 'northeast', k: 0.9 },
        roads: [[[0.5, 20], [8, 19.5], [14, 19], [20, 18.2], [26, 15], [31, 10], [35, 5], [39.5, 1.5]], [[20, 18.2], [24, 21], [30, 21.8]]],
        towns: [{ x: 20.8, y: 18.8, r: 0.9, name: 'Harlow' }] },
      sites: [{ id: 'sub', name: 'Harlow Substation', x: 20, y: 17.4, hp: 320 }],
      menace: [13, 19.6], pads: [[24, 14], [16.8, 14], [26.6, 19.4]],
      pre: [{ type: 'sentry', at: [19.4, 15.4] }],
      forced: ['anvil', 'pulsar'], supply: { start: 60, rate: 0.1 },
      waves: [
        { t: 60, units: [{ type: 'gnat', n: 2, from: 'N', to: { loiter: [22, 14], r: 1.5 }, stagger: 15 }] },
        { t: 420, units: [{ type: 'wasp', n: 8, from: 'NE', to: 'site:sub', stagger: 4 }] },
        { t: 650, units: [{ type: 'static', n: 1, from: 'road:0:end', to: { road: 0, stopAt: [31, 10] }, tag: 'ew' }] },
        { t: 950, units: [{ type: 'wasp', n: 10, from: 'NE', to: 'nearest', stagger: 4 }, { type: 'gnat', n: 1, from: 'N', to: { loiter: [17, 15], r: 1.5 } }] },
        { t: 1450, units: [{ type: 'wasp', n: 6, from: 'N', to: 'site:sub', stagger: 4 }, { type: 'wasp', n: 6, from: 'E', to: 'nearest', stagger: 4 }, { type: 'kite', n: 1, from: 'NE', to: { loiter: [24, 11], r: 2.5 } }] },
        { t: 2050, units: [{ type: 'wasp', n: 14, from: 'NE', to: 'nearest', stagger: 3 }] },
        { t: 2650, units: [{ type: 'wasp', n: 8, from: 'N', to: 'site:sub', stagger: 3 }, { type: 'wasp', n: 8, from: 'E', to: 'nearest', stagger: 3 }] },
      ],
      neutrals: [{ type: 'civcar', every: 300, road: 0 }],
      objectives: [
        { id: 'protect', kind: 'protect', site: 'sub', label: 'Keep Harlow Substation online' },
        { id: 'ew', kind: 'destroy', tags: ['ew'], label: 'Find and destroy the EW truck' },
        { id: 'clear', kind: 'clearWaves', label: 'Defeat every swarm' },
        { id: 'hp', kind: 'siteHp', site: 'sub', frac: 0.7, bonus: true, label: 'Substation above 70%' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['JUNO', 'Vanta has an EW truck somewhere northeast. When it lights up, our mesh shrinks and your towers lose half their reach.'],
        ['REYES', 'Harlow feeds power to half the coast. Keep it standing. Pulsar is yours tonight: it jams their quadcopters and hears their transmitters.'],
        ['PATCH', 'My team is on the line with Bolts. Get eyes on that truck and we\'ll put a Bolt-M through the windshield.'],
      ],
      win: ['JUNO', 'Static is off the air. First time we\'ve heard silence on that band all month.'],
      choice: { who: 'REYES', text: 'We pulled the jammer\'s memory cards out of the wreck. Hale wants them for the autonomy models. Juno wants them for jamming profiles.',
        options: [
          { label: 'Give them to Hale', detail: 'Anvil and Sentry software builds +2 versions', fx: { model: { anvil: 2, sentry: 2 } } },
          { label: 'Give them to Juno', detail: 'Pulsar upgraded to Mk II for free', fx: { mk: { pulsar: 2 } } },
        ] },
      reward: { xp: 400, credits: 300 },
    },
    {
      id: 'm3', act: 1, name: 'Corridor', place: 'Calder', theater: [52, 58], slots: 3,
      map: { seed: 37, coast: { side: 'south', d: 3.4 }, high: { side: 'north', k: 0.7 },
        roads: [[[0.5, 17], [9, 17.5], [16, 16.6], [22, 17.8], [30, 15], [39.5, 13]], [[16, 16.6], [17, 10], [20, 4], [22, 0.5]]],
        towns: [{ x: 16.6, y: 16.9, r: 1.2, name: 'Calder' }, { x: 30.5, y: 15.4, r: 0.5, name: 'Osk' }],
        corridor: [[-1, 5.5], [41, 7.5]] },
      sites: [{ id: 'hosp', name: 'Calder Hospital', x: 15.6, y: 16.1, hp: 260 }, { id: 'sub', name: 'Calder Substation', x: 21.5, y: 18.4, hp: 280 }],
      menace: [11.5, 19], pads: [[19.2, 12.2], [12.2, 13.2], [25.2, 15.6], [20.2, 21]],
      pre: [{ type: 'sentry', at: [17.6, 14.4] }],
      forced: ['roadrunner'], supply: { start: 60, rate: 0.1 },
      waves: [
        { t: 120, units: [{ type: 'kite', n: 1, from: 'N', to: { loiter: [18, 9], r: 2.5 } }] },
        { t: 420, units: [{ type: 'lance', n: 2, from: 'NE', to: 'site:hosp', stagger: 10 }] },
        { t: 820, units: [{ type: 'wasp', n: 8, from: 'N', to: 'nearest', stagger: 4 }, { type: 'lance', n: 2, from: 'E', to: 'site:sub', stagger: 12 }] },
        { t: 1300, units: [{ type: 'lance', n: 3, from: 'NE', to: 'site:hosp', stagger: 10 }, { type: 'kite', n: 1, from: 'NE', to: { loiter: [24, 10], r: 2.5 } }] },
        { t: 1800, units: [{ type: 'lance', n: 4, from: 'E', to: 'nearest', stagger: 9 }, { type: 'wasp', n: 8, from: 'N', to: 'site:hosp', stagger: 4 }] },
        { t: 2400, units: [{ type: 'lance', n: 5, from: 'NE', to: 'site:sub', stagger: 8 }, { type: 'wasp', n: 10, from: 'N', to: 'nearest', stagger: 3 }] },
        { t: 3000, units: [{ type: 'lance', n: 6, from: 'E', to: 'site:hosp', stagger: 7 }] },
      ],
      neutrals: [{ type: 'airliner', every: 380 }, { type: 'medevac', loop: [[8, 20], [22, 9], [30, 16]] }, { type: 'civcar', every: 280, road: 0 }],
      objectives: [
        { id: 'p1', kind: 'protect', site: 'hosp', label: 'Protect Calder Hospital' },
        { id: 'p2', kind: 'protect', site: 'sub', label: 'Protect Calder Substation' },
        { id: 'clear', kind: 'clearWaves', label: 'Defeat every raid' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
        { id: 'hp', kind: 'siteHp', site: 'hosp', frac: 0.7, bonus: true, label: 'Hospital above 70%' },
      ],
      brief: [
        ['REYES', 'Calder sits under the coastal air corridor. Airliners, a medevac helicopter, and now Vanta\'s Lance drones all share the same sky.'],
        ['HALE', 'Lances fly low and fast, so radar picks them up late. Roadrunner-M can catch them, and if it doesn\'t need to strike, it comes home.'],
        ['PATCH', 'Ghost-X is fueled. Send it at anything you can\'t put a name to.'],
        ['REYES', 'Nothing gets engaged until it\'s identified. I mean nothing.'],
      ],
      win: ['REYES', 'Not one civilian track touched. That buys more goodwill on this coast than any kill count.'],
      choice: { who: 'REYES', text: 'Calder\'s mayor is offering us the old cannery airstrip as a forward supply point.',
        options: [
          { label: 'Take the airstrip', detail: '+15% supply rate for the next three missions', fx: { flag: 'airstrip' } },
          { label: 'Leave it to the town', detail: '+10 civic trust and 150 credits from the town council', fx: { trust: 10, credits: 150 } },
        ] },
      reward: { xp: 500, credits: 350, sp: 1 },
    },
    {
      id: 'm4', act: 2, name: 'Eyes Forward', place: 'FOB Ardent', theater: [46, 40], slots: 4,
      map: { seed: 41, coast: { side: 'south', d: 2.4 }, high: { side: 'east', k: 1 },
        roads: [[[0.5, 13], [8, 13.2], [15, 12], [22, 11], [28, 8], [34, 6], [39.5, 4]], [[22, 11], [26, 16], [31, 19], [39.5, 21]]],
        towns: [{ x: 8.4, y: 13.6, r: 0.6, name: 'Ardent' }, { x: 26.3, y: 16.4, r: 0.5, name: 'Bray' }] },
      sites: [{ id: 'fob', name: 'FOB Ardent', x: 8, y: 13, hp: 420 }],
      menace: [6.2, 14.4], pads: [[12.5, 10], [12, 16], [17, 13.5]],
      pre: [{ type: 'sentry', at: [10, 11.6] }],
      forced: ['altius'], supply: { start: 80, rate: 0.1 },
      hidden: { type: 'hydra', n: 2, spots: [[30, 6.2], [33, 17], [27, 21], [35, 10.5]], t: 200, escort: 'jackal', tag: 'hydra' },
      waves: [
        { t: 60, units: [{ type: 'gnat', n: 2, from: 'E', to: { loiter: [12, 12], r: 1.8 }, stagger: 20 }] },
        { t: 600, units: [{ type: 'wasp', n: 6, from: 'E', to: 'nearest', stagger: 5 }] },
        { t: 900, units: [{ type: 'gnat', n: 2, from: 'NE', to: { loiter: [10, 14], r: 1.8 }, stagger: 20 }, { type: 'kite', n: 1, from: 'E', to: { loiter: [14, 11], r: 2.5 } }] },
        { t: 1400, units: [{ type: 'wasp', n: 8, from: 'E', to: 'nearest', stagger: 4 }] },
        { t: 1800, units: [{ type: 'gnat', n: 2, from: 'E', to: { loiter: [11, 13], r: 1.8 }, stagger: 20 }] },
        { t: 2200, units: [{ type: 'wasp', n: 10, from: 'NE', to: 'nearest', stagger: 4 }] },
      ],
      neutrals: [{ type: 'civcar', every: 300, road: 0 }],
      objectives: [
        { id: 'hydra', kind: 'destroy', tags: ['hydra'], label: 'Find and destroy both Hydra launchers' },
        { id: 'protect', kind: 'protect', site: 'fob', label: 'Keep FOB Ardent standing' },
        { id: 'hp', kind: 'siteHp', site: 'fob', frac: 0.7, bonus: true, label: 'FOB above 70%' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['REYES', 'Rocket artillery is shelling FOB Ardent from somewhere in the eastern highlands. Two launchers, Hydra class, firing from hides.'],
        ['HALE', 'They aim with quadcopter spotters. Kill the spotters and their rockets go wide. Find the launchers and they stop for good.'],
        ['PATCH', 'Altius is in the tubes. Send a 600 deep to look, then put a 600M on whatever it finds. Watch the pickups with tubes in the back: MANPADS.'],
      ],
      win: ['REYES', 'Both Hydras burning. Ardent can sleep tonight.'],
      reward: { xp: 600, credits: 400 },
    },
    {
      id: 'm5', act: 2, name: 'Iron Coast', place: 'Port of Merrow', theater: [66, 47], slots: 5,
      map: { seed: 53, coast: { side: 'east', d: 6.5 }, high: { side: 'northwest', k: 0.7 },
        roads: [[[0.5, 12], [10, 13], [18, 14.5], [25, 15.6], [31, 14.2]], [[25, 15.6], [24, 8], [20, 0.5]]],
        towns: [{ x: 30.6, y: 14.6, r: 1.1, name: 'Merrow' }, { x: 18.5, y: 14.2, r: 0.5, name: 'Dunlin' }] },
      sites: [{ id: 'port', name: 'Port of Merrow', x: 31.6, y: 13.6, hp: 450 }, { id: 'depot', name: 'Merrow Fuel Depot', x: 28.4, y: 17.6, hp: 220 }],
      menace: [25, 16.4], pads: [[28, 10], [22, 12.6], [26.8, 21], [31, 18.4]],
      pre: [{ type: 'sentry', at: [29.2, 12.2] }],
      forced: ['fury'], supply: { start: 140, rate: 0.12 },
      waves: [
        { t: 200, units: [{ type: 'wasp', n: 8, from: 'N', to: 'nearest', stagger: 4 }] },
        { t: 700, units: [{ type: 'scythe', n: 2, from: [1, -0.5], to: 'site:port', stagger: 8 }] },
        { t: 820, units: [{ type: 'shrike', n: 1, from: 'N', to: { orbit: 'site:port', r: 9 }, tag: 'shrike' }] },
        { t: 1050, units: [{ type: 'lance', n: 3, from: 'N', to: 'site:depot', stagger: 10 }] },
        { t: 1350, units: [{ type: 'scythe', n: 2, from: [-0.5, 9], to: 'site:port', stagger: 8 }] },
        { t: 1700, units: [{ type: 'wasp', n: 10, from: 'N', to: 'nearest', stagger: 4 }, { type: 'lance', n: 3, from: 'NW', to: 'site:port', stagger: 10 }] },
        { t: 2100, units: [{ type: 'scythe', n: 2, from: [3, -0.5], to: 'site:port', stagger: 8 }, { type: 'shrike', n: 1, from: 'NW', to: { orbit: 'site:depot', r: 9 }, tag: 'shrike' }] },
        { t: 2700, units: [{ type: 'scythe', n: 2, from: [-0.5, 6], to: 'site:port', stagger: 8 }, { type: 'lance', n: 4, from: 'N', to: 'nearest', stagger: 8 }] },
      ],
      neutrals: [{ type: 'boat', n: 3 }, { type: 'civcar', every: 300, road: 0 }],
      objectives: [
        { id: 'protect', kind: 'protect', site: 'port', label: 'Protect the Port of Merrow' },
        { id: 'p2', kind: 'protect', site: 'depot', label: 'Protect the fuel depot' },
        { id: 'shrike', kind: 'destroy', tags: ['shrike'], label: 'Shoot down both Shrikes' },
        { id: 'clear', kind: 'clearWaves', label: 'Break every raid' },
        { id: 'hp', kind: 'siteHp', site: 'port', frac: 0.7, bonus: true, label: 'Port above 70%' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['REYES', 'Vanta is going after the Port of Merrow: fuel, cranes, everything that keeps this coast supplied. Expect jets from the highlands carrying cruise missiles.'],
        ['VESPER', 'I lead a Fury pair out of the main base. Call us onto a patrol point and we\'ll meet the Scythes before they reach launch range.'],
        ['HALE', 'Spears skim the ground. Omen\'s radar looks down from altitude and sees them three times farther out than a tower does.'],
        ['REYES', 'There\'s also a Shrike up there guiding their bombs. I want it down.'],
      ],
      win: ['VESPER', 'Scythes turned back with their missiles still on the rails. The Furies flew that intercept better than half my squadron would have.'],
      choice: { who: 'HALE', text: 'Merrow\'s machine shop can work for us for a week. One job, your call.',
        options: [
          { label: 'Rocket motor line', detail: 'Roadrunner-M and Thunder upgraded to Mk II for free', fx: { mk: { roadrunner: 2, thunder: 2 } } },
          { label: 'Fury maintenance', detail: 'Fury upgraded to Mk II for free', fx: { mk: { fury: 2 } } },
        ] },
      reward: { xp: 700, credits: 450 },
    },
    {
      id: 'm6', act: 2, name: 'Long Reach', place: 'Tarn Highlands', theater: [56, 30], slots: 5,
      map: { seed: 67, coast: { side: 'southwest', d: 3 }, high: { side: 'northeast', k: 1 },
        roads: [[[0.5, 18], [6, 18], [12, 17], [18, 15], [24, 13], [30, 10.5], [34, 8], [39.5, 6]], [[30, 10.5], [31.4, 9.2], [33, 8.2]], [[24, 13], [27, 16], [28.2, 17]]],
        towns: [{ x: 31.6, y: 9.4, r: 0.6, name: 'Tarn' }, { x: 6.2, y: 18.4, r: 0.6, name: 'Ardent' }] },
      sites: [{ id: 'fob', name: 'FOB Ardent', x: 6, y: 17.8, hp: 360 }],
      menace: [4.5, 19.2], pads: [[10.5, 15], [14, 18.5], [18, 13]],
      pre: [{ type: 'sentry', at: [8.4, 16.4] }],
      forced: ['barracuda'], supply: { start: 120, rate: 0.11 },
      fixed: [
        { type: 'c2post', at: [33.2, 7.6], tag: 'c2' },
        { type: 'spire', at: [30.4, 11.2], tag: 'sam' }, { type: 'spire', at: [35.6, 11.6], tag: 'sam' },
        { type: 'static', at: [31.2, 5.8], tag: 'ew' },
        { type: 'lsite', at: [28.4, 17.2], tag: 'ls', spawn: { every: 260, delay: 300, units: [{ type: 'lance', n: 2, to: 'site:fob', stagger: 12 }] } },
        { type: 'jackal', at: [26, 14] }, { type: 'jackal', at: [32, 9.8] },
      ],
      waves: [
        { t: 500, units: [{ type: 'kite', n: 1, from: 'E', to: { loiter: [12, 16], r: 2.5 } }] },
        { t: 700, units: [{ type: 'wasp', n: 8, from: 'E', to: 'nearest', stagger: 4 }] },
        { t: 1250, units: [{ type: 'talon', n: 2, from: 'E', to: 'site:fob', stagger: 10 }] },
        { t: 1650, units: [{ type: 'wasp', n: 10, from: 'NE', to: 'nearest', stagger: 4 }] },
        { t: 2250, units: [{ type: 'talon', n: 2, from: 'NE', to: 'site:fob', stagger: 10 }] },
      ],
      neutrals: [{ type: 'civcar', every: 240, road: 1 }, { type: 'civcar', every: 320, road: 0 }],
      objectives: [
        { id: 'c2', kind: 'destroy', tags: ['c2'], label: 'Destroy the Vanta command post' },
        { id: 'ls', kind: 'destroy', tags: ['ls'], label: 'Destroy the drone launch site' },
        { id: 'protect', kind: 'protect', site: 'fob', label: 'Keep FOB Ardent standing' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track near Tarn' },
        { id: 'hp', kind: 'siteHp', site: 'fob', frac: 0.7, bonus: true, label: 'FOB above 70%' },
      ],
      brief: [
        ['REYES', 'Time to hit back. Vanta runs its raids from a command post near Tarn, with a launch site feeding Lances toward Ardent.'],
        ['JUNO', 'Two Spire SAM sites cover the post, plus another EW truck. Spire radars transmit, so Pulsar can find them, and cruise missiles fly under them.'],
        ['HALE', 'Barracuda-100M is on the launcher and it hugs the terrain. Altius-700M is cleared for the hard targets.'],
        ['REYES', 'Tarn village sits on the ridge road. Positive ID on everything.'],
      ],
      win: ['REYES', 'Command post gone, launch site gone. Their raids just lost their brain and their legs.'],
      reward: { xp: 800, credits: 500, sp: 1 },
    },
    {
      id: 'm7', act: 3, name: 'Convoy', place: 'Haven Road', theater: [70, 33], slots: 6,
      map: { seed: 79, coast: { side: 'south', d: 3 }, high: { side: 'center', k: 1 },
        roads: [[[0.5, 15], [7, 14.5], [13, 13], [18, 11.5], [23, 12.5], [28, 11], [33, 12], [38.6, 12]]],
        towns: [{ x: 38.2, y: 12.4, r: 1, name: 'Haven' }] },
      sites: [], convoy: { n: 3, t: 120, road: 0, speed: 45, start: 3, gap: 0.6 },
      menace: [3.5, 17], pads: [[9, 12], [15, 15.5], [24, 15], [30, 9]],
      pre: [{ type: 'sentry', at: [6.5, 13] }],
      forced: ['thunder'], supply: { start: 120, rate: 0.11 },
      fixed: [
        { type: 'jackal', at: [13.2, 11.4], trigger: 7, tag: 'amb' }, { type: 'ram', at: [12.4, 14.2], trigger: 7, tag: 'amb' },
        { type: 'bastion', at: [22.6, 10.4], trigger: 7, tag: 'amb' }, { type: 'ram', at: [23.6, 14.2], trigger: 7, tag: 'amb' }, { type: 'jackal', at: [21, 13.6], trigger: 7, tag: 'amb' },
        { type: 'bastion', at: [30.2, 13.8], trigger: 7, tag: 'amb' }, { type: 'jackal', at: [31.4, 10], trigger: 7, tag: 'amb' }, { type: 'jackal', at: [28.6, 9.4], trigger: 7, tag: 'amb' },
        { type: 'hydra', at: [26, 5], fireAt: 'truck', tag: 'hydra' },
      ],
      waves: [
        { t: 300, units: [{ type: 'kite', n: 1, from: 'N', to: { follow: 'truck', r: 3 } }] },
        { t: 600, units: [{ type: 'wasp', n: 4, from: 'N', to: 'truck', stagger: 4 }] },
        { t: 1100, units: [{ type: 'wasp', n: 5, from: 'NE', to: 'truck', stagger: 4 }] },
        { t: 1450, units: [{ type: 'talon', n: 1, from: 'N', to: 'truck' }] },
        { t: 1900, units: [{ type: 'wasp', n: 6, from: 'E', to: 'truck', stagger: 3 }] },
        { t: 2400, units: [{ type: 'lance', n: 4, from: 'NE', to: 'truck', stagger: 8 }] },
      ],
      neutrals: [{ type: 'civcar', every: 400, road: 0 }],
      objectives: [
        { id: 'escort', kind: 'escort', n: 2, label: 'Get at least 2 relief trucks to Haven' },
        { id: 'all', kind: 'escortAll', bonus: true, label: 'All 3 trucks arrive' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['REYES', 'Haven has been cut off for nine days. Three relief trucks roll at H+00:02. Get at least two of them there.'],
        ['PATCH', 'The road runs through the gorge. Vanta has armor at the choke points and MANPADS up in the rocks.'],
        ['HALE', 'Thunder is ready: rocket pods, Barracuda-100M, close-in interceptors and two Altius in the bay. It\'s fast, but SAMs and MANPADS can still reach it.'],
      ],
      win: ['REYES', 'Haven has food and medicine tonight. That\'s the mission. Everything else is detail.'],
      reward: { xp: 900, credits: 550 },
    },
    {
      id: 'm8', act: 3, name: 'Hive', place: 'Ridgeback', theater: [60, 20], slots: 6,
      map: { seed: 89, coast: { side: 'south', d: 2.6 }, high: { side: 'northeast', k: 1 },
        roads: [[[0.5, 19], [8, 19], [14, 17], [20, 15], [26, 11], [32, 8], [39.5, 5]], [[20, 15], [24, 15.2], [33.5, 12.4]]],
        towns: [{ x: 8.2, y: 19.4, r: 0.6, name: 'Ardent' }] },
      sites: [{ id: 'fob', name: 'FOB Ardent', x: 8, y: 18.6, hp: 380 }],
      menace: [6.4, 20], pads: [[12, 15.5], [15.5, 19.8], [18.5, 13.5], [11, 12.5]],
      pre: [{ type: 'sentry', at: [10.4, 17.2] }],
      forced: [], supply: { start: 140, rate: 0.14 }, deadline: 5400,
      fixed: [
        { type: 'lsite', at: [27.2, 6], tag: 'ls', spawn: { every: 300, delay: 120, units: [{ type: 'wasp', n: 6, to: 'nearest', stagger: 4 }] } },
        { type: 'lsite', at: [34, 12.2], tag: 'ls', spawn: { every: 360, delay: 240, units: [{ type: 'lance', n: 2, to: 'site:fob', stagger: 10 }] } },
        { type: 'lsite', at: [24, 14.4], tag: 'ls', spawn: { every: 320, delay: 360, units: [{ type: 'wasp', n: 5, to: 'site:fob', stagger: 4 }, { type: 'lance', n: 1, to: 'nearest' }] } },
        { type: 'spire', at: [29, 9.2], tag: 'sam' }, { type: 'spire', at: [30.8, 14.6], tag: 'sam' },
        { type: 'static', at: [26.2, 9.6], tag: 'ew' },
        { type: 'jackal', at: [24.8, 12.6] }, { type: 'jackal', at: [32.6, 10.4] }, { type: 'ram', at: [22.6, 15.8] },
      ],
      waves: [
        { t: 400, units: [{ type: 'shrike', n: 1, from: 'NE', to: { orbit: 'site:fob', r: 9 }, tag: 'shrike' }] },
        { t: 1300, units: [{ type: 'talon', n: 2, from: 'NE', to: 'site:fob', stagger: 10 }] },
        { t: 2300, units: [{ type: 'talon', n: 2, from: 'E', to: 'site:fob', stagger: 10 }, { type: 'kite', n: 1, from: 'E', to: { loiter: [13, 17], r: 2.5 } }] },
        { t: 3200, units: [{ type: 'talon', n: 3, from: 'NE', to: 'site:fob', stagger: 10 }] },
      ],
      neutrals: [{ type: 'civcar', every: 360, road: 0 }],
      objectives: [
        { id: 'ls', kind: 'destroy', tags: ['ls'], label: 'Destroy all three launch sites before H+01:30:00' },
        { id: 'protect', kind: 'protect', site: 'fob', label: 'Keep FOB Ardent standing' },
        { id: 'hp', kind: 'siteHp', site: 'fob', frac: 0.6, bonus: true, label: 'FOB above 60%' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['JUNO', 'We traced the swarms to three launch sites dug into the ridges. That\'s why the raids never stop.'],
        ['REYES', 'Destroy all three before H+01:30:00. Ardent will take everything they can throw in the meantime.'],
        ['HALE', 'You have every tool now. Let the autonomy carry the defense and spend your attention on the hunt.'],
      ],
      win: ['REYES', 'Three sites, three craters. The sky over Ardent is quiet for the first time since we landed.'],
      reward: { xp: 1000, credits: 600 },
    },
    {
      id: 'm9', act: 3, name: 'Mothership', place: 'Kestrel City', theater: [44, 66], slots: 7,
      map: { seed: 97, coast: { side: 'south', d: 3.2 }, high: { side: 'north', k: 0.8 },
        roads: [[[21.5, 0.5], [21, 8], [20.4, 14], [20, 20]], [[0.5, 20], [10, 20.5], [20, 20.4], [30, 19.6], [39.5, 18]]],
        towns: [{ x: 20.4, y: 20.6, r: 2, name: 'Kestrel City' }, { x: 21, y: 8.4, r: 0.5, name: 'Moss' }] },
      sites: [{ id: 'city', name: 'Kestrel City', x: 20.2, y: 20.2, hp: 1200 }],
      menace: [15, 21.6], pads: [[24.5, 15.5], [16, 16], [28.5, 19], [12, 18.5], [21, 12.5]],
      pre: [{ type: 'sentry', at: [20.2, 17.2] }, { type: 'sentry', at: [26, 18.2] }],
      forced: [], supply: { start: 160, rate: 0.12 },
      waves: [
        { t: 200, units: [{ type: 'wasp', n: 10, from: 'N', to: 'nearest', stagger: 3 }] },
        { t: 520, units: [{ type: 'mother', n: 1, from: [39.5, -0.5], to: 'site:city', tag: 'mother' }, { type: 'shrike', n: 2, from: 'NE', to: { escort: 'mother', r: 2 }, stagger: 6 }] },
        { t: 720, units: [{ type: 'scythe', n: 2, from: [-0.5, 2], to: 'site:city', stagger: 8 }] },
        { t: 950, units: [{ type: 'bastion', n: 2, from: 'road:0:start', to: { road: 0, stopAt: [20.6, 13] }, stagger: 30 }, { type: 'ram', n: 3, from: 'road:0:start', to: { road: 0, stopAt: [20.6, 14] }, stagger: 25 }, { type: 'hydra', n: 2, from: 'road:0:start', to: { road: 0, stopAt: [21, 5] }, fireAt: 'site', stagger: 40 }] },
        { t: 1350, units: [{ type: 'scythe', n: 2, from: [-0.5, 6], to: 'site:city', stagger: 8 }, { type: 'lance', n: 4, from: 'NE', to: 'site:city', stagger: 8 }] },
        { t: 1950, units: [{ type: 'scythe', n: 3, from: [2, -0.5], to: 'site:city', stagger: 8 }, { type: 'talon', n: 2, from: 'N', to: 'site:city', stagger: 10 }] },
      ],
      neutrals: [{ type: 'civcar', every: 200, road: 1 }, { type: 'boat', n: 3 }],
      objectives: [
        { id: 'mother', kind: 'destroy', tags: ['mother'], label: 'Bring down the Mothership' },
        { id: 'protect', kind: 'protect', site: 'city', label: 'Protect Kestrel City' },
        { id: 'hp', kind: 'siteHp', site: 'city', frac: 0.6, bonus: true, label: 'City above 60%' },
        { id: 'roe', kind: 'noHarm', bonus: true, label: 'Harm no civilian track' },
      ],
      brief: [
        ['REYES', 'This is it. Vanta\'s Mothership is airborne: a drone carrier that launches swarms as it flies. It\'s headed for Kestrel City with jets and armor in support.'],
        ['VESPER', 'It\'s big, slow and well escorted. Strip the escorts, then hit it with everything that flies.'],
        ['PATCH', 'The city is full of people. Every round we fire lands somewhere. Make them count.'],
        ['REYES', 'Bring it down, Warden-6.'],
      ],
      win: ['REYES', 'The Mothership is in the sea and the city is standing. Stand down, Warden-6. You\'ve earned it.'],
      reward: { xp: 1200, credits: 800 },
      finale: true,
    },
  ];
  const MISSION = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

  const ENDINGS = [
    { min: 70, title: 'The lights stay on', text: 'Calder, Harlow and Merrow vote to host a permanent Warden detachment. Within a month the night patrols go back to being boring, which is the whole point.' },
    { min: 40, title: 'A wary peace', text: 'Vanta pulls back across the highlands. The coast is safe, if watchful; people remember both the shield and the noise it made.' },
    { min: -999, title: 'Questions to answer', text: 'The Mothership falls, but the coast remembers the misfires. Warden\'s next posting comes with a review board and a long list of questions.' },
  ];

  // ---------------------------------------------------------------- leveling
  const xpToNext = (lvl) => 250 + 150 * (lvl - 1);
  const MAX_LEVEL = 15;
  const baseSlots = (lvl) => 4 + Math.floor(lvl / 3);

  // ---------------------------------------------------------------- tempo: raids come quickly and spawn closer in
  const TEMPO = 0.6, SPAWN_INSET = 3.5, SUPPLY_MUL = 1.5;
  const MISSION_TMP = () => Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
  const hms = (t) => { const p = (n) => String(n).padStart(2, '0'); return `H+${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(Math.round(t % 60))}`; };
  for (const m of MISSIONS) {
    for (const w of m.waves || []) w.t = Math.max(15, Math.round(w.t * TEMPO));
    if (m.hidden) m.hidden.t = Math.round(m.hidden.t * TEMPO);
    for (const f of m.fixed || []) if (f.spawn) { f.spawn.every = Math.round(f.spawn.every * 0.8); if (f.spawn.delay) f.spawn.delay = Math.round(f.spawn.delay * TEMPO); }
    if (m.convoy) {
      const old = hms(m.convoy.t).slice(0, 8); m.convoy.t = Math.round(m.convoy.t * TEMPO);
      m.brief = m.brief.map(([w, t]) => [w, t.replace(old, hms(m.convoy.t).slice(0, 8))]);
    }
    if (m.deadline) {
      const old = hms(m.deadline); m.deadline = Math.round(m.deadline * 0.75 / 60) * 60;
      const nw = hms(m.deadline);
      m.brief = m.brief.map(([w, t]) => [w, t.split(old).join(nw)]);
      for (const o of m.objectives) o.label = o.label.split(old).join(nw);
    }
  }
  for (const m of MISSIONS) for (const s of m.sites || []) s.hp = Math.round(s.hp * 1.25);
  // longer escort runs were the slowest part of the campaign
  if (MISSION_TMP().m7) MISSION_TMP().m7.convoy.speed = 75;
  { const m4 = MISSION_TMP().m4; if (m4 && !m4.objectives.some((o) => o.kind === 'clearWaves')) m4.objectives.splice(2, 0, { id: 'clear', kind: 'clearWaves', label: 'Break every raid on Ardent' }); }
  { const m8 = MISSION_TMP().m8; if (m8 && !m8.objectives.some((o) => o.kind === 'clearWaves')) m8.objectives.splice(2, 0, { id: 'clear', kind: 'clearWaves', label: 'Turn back every Talon raid' }); }
  // a baseline of Lattice training every commander starts with; skill ranks add on top
  const BASE_SKILLS = { precision: 1, hardkill: 1, fusion: 1 };
  // every product is in the arsenal from the first mission
  const ARSENAL = PRODUCTS.filter((p) => p.unit && p.slot > 0).map((p) => p.id);

  // ---------------------------------------------------------------- one Fury that matters: eight missiles for jets, helicopters, big drones and cruise missiles, two Barracuda-500M for ground targets
  UT.fury.ammo = { aam: 8, b500: 2 }; UT.fury.station = 480; UT.fury.hp = 220;
  // one line per mission for the briefing card
  const SUMMARY = { m1: 'Drones are probing Outpost Juniper. Hold it.', m2: 'An EW truck is jamming the mesh. Kill it.', m3: 'Lance drones over Calder. Mind the airliners.',
    m4: 'Two Hydra launchers are shelling FOB Ardent.', m5: 'Jets and cruise missiles are coming for the port.', m6: 'Hit the command post and the launch site.',
    m7: 'Get the relief trucks through to Haven.', m8: 'Destroy three launch sites before the deadline.', m9: 'Bring down the Mothership before it reaches the city.' };
  for (const m of MISSIONS) m.sum = SUMMARY[m.id] || '';

  // ---------------------------------------------------------------- pace levels, picked per mission
  // es: hostile platform speed; er: hostile deployment (raid timing, launch rate, stagger); fd: our deployment
  // (builds, reloads, rearm, cooldowns, supply, platform speed); ms: our munition speed; quiet/hot: AUTO tempo
  const PACE = [
    { lv: 1, name: 'Patrol', es: 1, er: 1, fd: 1, ms: 1, quiet: 10, hot: 3, reward: 1, blurb: 'The baseline. Time to read every track.' },
    { lv: 2, name: 'Alert', es: 1.1, er: 1.15, fd: 1.1, ms: 1.1, quiet: 11, hot: 3.25, reward: 1.2, blurb: 'Raids come sooner and fly faster. So do your launches.' },
    { lv: 3, name: 'Surge', es: 1.2, er: 1.32, fd: 1.2, ms: 1.2, quiet: 12, hot: 3.5, reward: 1.4, blurb: 'Raids start to overlap. Builds and reloads keep up.' },
    { lv: 4, name: 'Blitz', es: 1.32, er: 1.52, fd: 1.3, ms: 1.3, quiet: 13, hot: 3.75, reward: 1.6, blurb: 'Little quiet time. The whole kill chain runs hot.' },
    { lv: 5, name: 'Overrun', es: 1.45, er: 1.75, fd: 1.4, ms: 1.4, quiet: 14, hot: 4, reward: 1.8, blurb: 'Raids stack on raids. Fastest enemies, fastest deployment.' },
  ];

  Object.assign(KW, { UT, WT, ET, NT, PRODUCTS, PRODUCT, SKILLS, BRANCHES, CAST, MISSIONS, MISSION, SPOTS, ENDINGS, xpToNext, MAX_LEVEL, baseSlots, SRC, TEMPO, SPAWN_INSET, SUPPLY_MUL, ARSENAL, BASE_SKILLS, PACE });
})(typeof window !== 'undefined' ? (window.KW = window.KW || {}) : (globalThis.KW = globalThis.KW || {}));
