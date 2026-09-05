'use strict';
/* ─────────────────── content pipeline ───────────────────
   These records use the same schemas the console will author.
   A campaign file replaces or extends CONTENT wholesale.      */
const CONTENT = {
  classes: [
    { id:'runner', name:'RUNNER', tag:'The one who goes where the meat can\u2019t.',
      array:{WIRE:4,EDGE:3,SOUL:2,MEAT:1},
      moves:[['GHOSTHAND','set hooks in 2 nodes with one action, once per scene'],
             ['OVERCLOCK','+1d on any WIRE roll; mark 1 Static. No limit. Good luck.'],
             ['BACKDOOR','when your Burn resolves, keep one hook set in that node']],
      gear:['deck \u201cLockpick MkII\u201d \u2014 2 process slots','machine pistol \u2014 2 dmg \u00b7 EDGE','jack cable','stims \u00d73','\u00a5340'] },
    { id:'ronin', name:'RONIN', tag:'The blade the Houses pretend they never bought.',
      array:{MEAT:4,EDGE:3,WIRE:2,SOUL:1},
      moves:[['BODYGUARD','when an adjacent ally would take damage, take it instead'],
             ['SURGE','move two zones as one action; terrain tags don\u2019t slow you'],
             ['RED LEDGER','+1 damage vs anyone who harmed an ally this session']],
      gear:['mono-edge blade \u2014 3 dmg \u00b7 MEAT','armored coat \u2014 Armor 2','one loyalty you regret','\u00a5120'] },
    { id:'cantor', name:'CANTOR', tag:'Speaker of the old exploits. The code listens. So does the Choir.',
      array:{SOUL:4,WIRE:3,EDGE:2,MEAT:1},
      moves:[['LITANY OF CLOSING','cant: seal one node or door until you leave the zone or fall'],
             ['VOICE OF ASH','cant: enemies in your zone take \u22121 to hit until your next turn'],
             ['ABSOLUTION','touch bases with an ally: purge one ice from them; mark 1 Static yourself']],
      gear:['cant-book (paper, always paper)','mesh-dead robes \u2014 Armor 1, +1 FW','censer drone','\u00a5200'] },
    { id:'fixer', name:'FIXER', tag:'Knows a guy. Is the guy.',
      array:{EDGE:4,SOUL:3,WIRE:2,MEAT:1},
      moves:[['I KNOW A GUY','once per session, declare a contact who can get a thing, a door, or a truth'],
             ['GREASE','reroll social rolls where money could help; \u00a550 per reroll'],
             ['EXIT STRATEGY','once per session, the whole crew moves one zone immediately']],
      gear:['holdout pistol \u2014 1 dmg \u00b7 EDGE','forged House credentials (one use)','a favor owed to you','\u00a5600'] },
    { id:'wrangler', name:'WRANGLER', tag:'One body was never enough.',
      array:{WIRE:4,EDGE:3,MEAT:2,SOUL:1},
      moves:[['SPLIT ATTENTION','you and your frame may act in different zones, no penalty'],
             ['REMOTE HANDS','your frame can Yank a willing ally by touch; you mark the Static'],
             ['SCRAPHEART','once per session your Down\u2019d frame reboots at 1 HP. Its light comes back wrong.']],
      gear:['your frame \u2014 HP 6 \u00b7 Armor 1 \u00b7 2 dmg','toolkit','sidearm \u2014 1 dmg \u00b7 EDGE','\u00a5250'] },
    { id:'stitch', name:'STITCH', tag:'The only one who can take the noise out of your head. For a while.',
      array:{SOUL:4,MEAT:3,WIRE:2,EDGE:1},
      moves:[['FIELD WORK','action, adjacent ally: restore 1d6 HP; on 11+ also clear one condition'],
             ['BACK FROM IT','an adjacent Down\u2019d ally stands at 3 HP; once per ally per session'],
             ['GROUNDING','once per session: one ally suppresses up to 3 Static until jack-out. It all comes back.']],
      gear:['trauma kit','bone saw \u2014 2 dmg \u00b7 tool','one dose of quiet','scrubs \u2014 Armor 1','\u00a5180'] },
  ],
  chrome: [
    { id:'optic',   name:'OPTIC SUITE',     desc:'low-light vision \u00b7 record what you see' },
    { id:'reflex',  name:'REFLEX SHUNT',    desc:'+1 EDGE, initiative only' },
    { id:'dermal',  name:'DERMAL WEAVE',    desc:'+1 armor, under the skin' },
    { id:'cache',   name:'SUBDERMAL CACHE', desc:'hide one small thing inside your body' },
    { id:'voice',   name:'VOICEBOX',        desc:'any voice you\u2019ve heard' },
  ],
  doctrine: {
    class:  'you are what the ruins need,\nor you don\u2019t come back.',
    stats:  'four numbers. the rest is\nwhat you do with them.',
    chrome: 'the more machine you are,\nthe easier you are to reach.',
    flesh:  'the table sees the flesh.\nthe record sees everything.',
  }
};

const STATS = ['MEAT','WIRE','EDGE','SOUL'];

/* ── Part Three schemas: tags, ice, enemies ── */
CONTENT.tags = [
  { id:'POWERED',  desc:'nodes here are live: hookable, twistable, burnable' },
  { id:'DARK',     desc:'no nodes; ranged in/out at \u22121' },
  { id:'SHROUDED', desc:'attacks into this zone \u22121' },
  { id:'ELEVATED', desc:'ranged from here +1 down; reaching it costs the Move' },
  { id:'UNSTABLE', desc:'sprint fails on 1\u20134; Burns collapse something' },
  { id:'FLOODED',  desc:'MEAT to sprint; twisted power bites everyone in the water' },
  { id:'CRAMPED',  desc:'no ranged attacks; blades, hands, and cants only' },
  { id:'LOUD',     desc:'talk doesn\u2019t carry; Burns add 1 less heat' },
  { id:'COLD IRON',desc:'no Mesh effects; hooks purge at the threshold' },
  { id:'FOLD',     desc:'Static marks double; heat 7 answers differently' },
];
CONTENT.ice = [
  { id:'scrambler', name:'SCRAMBLER', effect:'Blinded',
    clear:'Yank, a crewmate\u2019s purge, or leave the POWERED zone' },
  { id:'tracker',   name:'TRACKER',   effect:'zone always known to the enemy',
    clear:'Yank, or enter DARK or COLD IRON' },
  { id:'hush',      name:'THE HUSH',  effect:'cannot speak, cast, or use comms',
    clear:'Yank only. It wants you quiet.' },
  { id:'puppet',    name:'PUPPET STRINGS', effect:'one piece of chrome acts on the enemy\u2019s turn',
    clear:'Yank, or Burn the hooks off them' },
];
CONTENT.enemies = [
  { id:'legbreaker', name:'Legbreaker',       hp:4, armor:1, fw:1, dice:2, dmg:2,
    move:'gang up: +1 per ally engaged', want:'to get paid without dying' },
  { id:'hound',      name:'Ferrous hound',    hp:5, armor:2, fw:null, dice:3, dmg:2,
    move:'cold iron body: cannot be Meshed', want:'what its handler points at' },
  { id:'outrider',   name:'Drover outrider',  hp:6, armor:1, fw:2, dice:2, dmg:2,
    move:'destroys the case before losing it', want:'the cargo through' },
  { id:'icebreaker', name:'Icebreaker',       hp:8, armor:0, fw:5, dice:3, dmg:0,
    move:'runs ice as its attacks', want:'intruders expelled, methods erased' },
  { id:'listener',   name:'Ninefields listener', hp:5, armor:0, fw:2, dice:2, dmg:1,
    move:'miscast liturgy: cants always work, always mark it', want:'you to hear what it hears' },
  { id:'shell',      name:'Harmonized shell', hp:9, armor:2, fw:6, dice:3, dmg:3,
    move:'the Hush, once per round, no roll below FW 3', want:'to gather, gently' },
];
