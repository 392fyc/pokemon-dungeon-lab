/**
 * Frozen 7.6 behavior data used only to read rules/content v1 saves.
 * Generated from the pre-7.7 src/data/roster.json before its behavior fields were removed.
 */
export type LegacyBehavior='strong'|'line'|'guard'|'push';
export const LEGACY_BEHAVIOR_MOVE={
  fallback:{strong:'tackle',line:'quickattack',guard:'protect',push:'roar'},
  species:{
  "bulbasaur": {
    "strong": "tackle",
    "line": "seedbomb"
  },
  "charmander": {
    "strong": "scratch",
    "line": "ember"
  },
  "squirtle": {
    "strong": "tackle",
    "line": "watergun"
  },
  "pidgey": {
    "strong": "tackle",
    "line": "gust"
  },
  "rattata": {
    "strong": "tackle"
  },
  "spearow": {
    "strong": "pursuit"
  },
  "pikachu": {
    "strong": "quickattack",
    "line": "thundershock"
  },
  "zubat": {
    "line": "absorb",
    "strong": "poisonfang"
  },
  "geodude": {
    "strong": "tackle",
    "guard": "defensecurl"
  },
  "chikorita": {
    "strong": "tackle",
    "line": "magicalleaf"
  },
  "cyndaquil": {
    "strong": "tackle",
    "line": "ember"
  },
  "totodile": {
    "strong": "scratch",
    "line": "watergun"
  },
  "treecko": {
    "strong": "pound",
    "line": "leafage"
  },
  "torchic": {
    "strong": "scratch",
    "line": "ember"
  },
  "mudkip": {
    "strong": "tackle",
    "line": "watergun"
  },
  "sandshrew": {
    "strong": "scratch",
    "guard": "defensecurl"
  },
  "growlithe": {
    "line": "ember",
    "strong": "bite"
  },
  "magnemite": {
    "strong": "tackle",
    "line": "thundershock"
  },
  "onix": {
    "strong": "tackle",
    "guard": "harden"
  },
  "dratini": {
    "push": "dragontail",
    "strong": "slam"
  },
  "wooper": {
    "line": "watergun",
    "strong": "slam"
  },
  "houndour": {
    "line": "ember",
    "push": "roar"
  },
  "makuhita": {
    "strong": "tackle",
    "push": "whirlwind"
  }
}
} as const satisfies {fallback:Record<LegacyBehavior,string>;species:Record<string,Partial<Record<LegacyBehavior,string>>>};

/** Old species move identity, behavior and PP for kit moves and the then-current TM list. */
export const LEGACY_SPECIES_MOVE_INFO:Record<string,Record<string,{behavior:LegacyBehavior;pp:number}>>={
  "bulbasaur": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "seedbomb": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "charmander": {
    "scratch": {
      "behavior": "strong",
      "pp": 3
    },
    "ember": {
      "behavior": "line",
      "pp": 2
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "dragontail": {
      "behavior": "push",
      "pp": 1
    },
    "roar": {
      "behavior": "push",
      "pp": 2
    }
  },
  "squirtle": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "watergun": {
      "behavior": "line",
      "pp": 2
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "pidgey": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "gust": {
      "behavior": "line",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "whirlwind": {
      "behavior": "push",
      "pp": 2
    }
  },
  "rattata": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "spearow": {
    "pursuit": {
      "behavior": "strong",
      "pp": 2
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "whirlwind": {
      "behavior": "push",
      "pp": 2
    }
  },
  "pikachu": {
    "quickattack": {
      "behavior": "strong",
      "pp": 3
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "thundershock": {
      "behavior": "line",
      "pp": 3
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "zubat": {
    "poisonfang": {
      "behavior": "strong",
      "pp": 1
    },
    "absorb": {
      "behavior": "line",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "whirlwind": {
      "behavior": "push",
      "pp": 2
    }
  },
  "geodude": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "defensecurl": {
      "behavior": "guard",
      "pp": 4
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "chikorita": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "magicalleaf": {
      "behavior": "line",
      "pp": 2
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "cyndaquil": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "ember": {
      "behavior": "line",
      "pp": 2
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "roar": {
      "behavior": "push",
      "pp": 2
    }
  },
  "totodile": {
    "scratch": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "watergun": {
      "behavior": "line",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "treecko": {
    "pound": {
      "behavior": "strong",
      "pp": 3
    },
    "leafage": {
      "behavior": "line",
      "pp": 4
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "dragontail": {
      "behavior": "push",
      "pp": 1
    }
  },
  "torchic": {
    "scratch": {
      "behavior": "strong",
      "pp": 3
    },
    "ember": {
      "behavior": "line",
      "pp": 2
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "mudkip": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "watergun": {
      "behavior": "line",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "roar": {
      "behavior": "push",
      "pp": 2
    }
  },
  "sandshrew": {
    "scratch": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "defensecurl": {
      "behavior": "guard",
      "pp": 4
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "growlithe": {
    "bite": {
      "behavior": "strong",
      "pp": 2
    },
    "ember": {
      "behavior": "line",
      "pp": 2
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "roar": {
      "behavior": "push",
      "pp": 2
    }
  },
  "magnemite": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "thundershock": {
      "behavior": "line",
      "pp": 3
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "onix": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "harden": {
      "behavior": "guard",
      "pp": 3
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "dragontail": {
      "behavior": "push",
      "pp": 1
    }
  },
  "dratini": {
    "slam": {
      "behavior": "strong",
      "pp": 2
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "dragontail": {
      "behavior": "push",
      "pp": 1
    }
  },
  "wooper": {
    "slam": {
      "behavior": "strong",
      "pp": 2
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "watergun": {
      "behavior": "line",
      "pp": 2
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    }
  },
  "houndour": {
    "ember": {
      "behavior": "line",
      "pp": 2
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "roar": {
      "behavior": "push",
      "pp": 2
    }
  },
  "makuhita": {
    "tackle": {
      "behavior": "strong",
      "pp": 3
    },
    "mudslap": {
      "behavior": "line",
      "pp": 1
    },
    "terablast": {
      "behavior": "line",
      "pp": 1
    },
    "helpinghand": {
      "behavior": "guard",
      "pp": 2
    },
    "protect": {
      "behavior": "guard",
      "pp": 1
    },
    "whirlwind": {
      "behavior": "push",
      "pp": 2
    }
  }
} as const;

export function legacyMoveForBehavior(species:string|undefined,behavior:string):string|undefined {
  if(!['strong','line','guard','push'].includes(behavior))return undefined;
  return species===undefined
    ?LEGACY_BEHAVIOR_MOVE.fallback[behavior as LegacyBehavior]
    :(LEGACY_BEHAVIOR_MOVE.species as Record<string,Partial<Record<LegacyBehavior,string>>>)[species]?.[behavior as LegacyBehavior];
}
export function legacySpeciesMove(species:string,move:string):{behavior:LegacyBehavior;pp:number}|undefined {
  return LEGACY_SPECIES_MOVE_INFO[species]?.[move];
}
